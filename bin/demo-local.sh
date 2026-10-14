#!/usr/bin/env bash
# Script: Run the whole demo on one machine (macOS or Linux), no LocalStack and no AWS
# Purpose: PostgreSQL + the API (uvicorn) + the website (Vite), with the sample company loaded.
#          Same code and same data as the LocalStack demo; only the Lambda and the AWS emulator are left out.
# Usage:   ./bin/demo-local.sh [start | stop | status | reset | ready | logs]
#            start   (default) set everything up, start it, load the sample company
#            stop    stop the website and the API (the database keeps its data)
#            status  show what is running
#            reset   empty the database: first admin only (admin1 / ChangeMe123!)
#            ready   reload the sample company and the logins (about 5 seconds)
#            logs    follow the API and website logs
# Needs:   Python 3.11+ and Node 20+; and either Docker (a PostgreSQL container is started) or a local PostgreSQL.
#          Mac: brew install python@3.13 node, then Docker Desktop or brew install postgresql@17.
# Settings (environment variables, all optional):
#   DEMO_API_PORT=8000   DEMO_WEB_PORT=3000   DEMO_PG_PORT=55432 (the Docker database)
#   DEMO_USE_DOCKER=0    use a local PostgreSQL instead, found through POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER,
#                        POSTGRES_PASS (defaults: localhost, 5432, your login name, no password)
#   DEMO_DB_NAME=pm_demo the database to use (it is created if missing)
# Works with the bash 3.2 that ships with macOS.

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT/backend/pm-api"
WEB_DIR="$ROOT/frontend"
STATE="$ROOT/.demo-local"
VENV="$API_DIR/.venv"

API_PORT="${DEMO_API_PORT:-8000}"
WEB_PORT="${DEMO_WEB_PORT:-3000}"
DB_NAME="${DEMO_DB_NAME:-pm_demo}"
PG_CONTAINER="pm-demo-local-pg"
PG_VOLUME="pm-demo-local-pgdata"
PG_DOCKER_PORT="${DEMO_PG_PORT:-55432}"

say() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

case "${1:-start}" in
    -h|--help|help) sed -n 2,19p "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
esac

mkdir -p "$STATE"

port_in_use() { # 0 when something answers on 127.0.0.1:$1 (no ss, lsof or nc needed)
    (exec 3<>"/dev/tcp/127.0.0.1/$1") 2> /dev/null && { exec 3>&- 3<&-; return 0; }
    return 1
}

pid_running() { # 0 when the pid in file $1 is alive
    [ -f "$1" ] && kill -0 "$(cat "$1")" 2> /dev/null
}

stop_pid() { # stop the process whose pid is in file $1
    if pid_running "$1"; then
        kill "$(cat "$1")" 2> /dev/null || true
        for _ in 1 2 3 4 5 6 7 8 9 10; do pid_running "$1" || break; sleep 0.5; done
        pid_running "$1" && kill -9 "$(cat "$1")" 2> /dev/null || true
    fi
    unlink "$1" 2> /dev/null || true
}

wait_for_http() { # wait for URL $1 to answer; give up after $2 seconds
    local i=0
    while [ "$i" -lt "$2" ]; do
        curl -fsS -o /dev/null "$1" 2> /dev/null && return 0
        sleep 1; i=$((i + 1))
    done
    return 1
}

find_python() { # first Python 3.11+ on the PATH
    local c
    for c in python3.13 python3.12 python3.11 python3; do
        if command -v "$c" > /dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2> /dev/null; then
            command -v "$c"; return 0
        fi
    done
    return 1
}

use_docker() {
    [ "${DEMO_USE_DOCKER:-1}" != "0" ] && command -v docker > /dev/null 2>&1 && docker info > /dev/null 2>&1
}

setup_database_env() { # exports the POSTGRES_* settings the API and the demo tool read
    if use_docker; then
        export POSTGRES_HOST=127.0.0.1 POSTGRES_PORT="$PG_DOCKER_PORT" POSTGRES_USER=postgres POSTGRES_PASS=postgres123
    else
        export POSTGRES_HOST="${POSTGRES_HOST:-localhost}" POSTGRES_PORT="${POSTGRES_PORT:-5432}"
        export POSTGRES_USER="${POSTGRES_USER:-$(id -un)}" POSTGRES_PASS="${POSTGRES_PASS-}"
    fi
    export POSTGRES_NAME="$DB_NAME"
}

start_database() {
    if use_docker; then
        if [ "$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2> /dev/null)" = "true" ]; then
            say "Database: $PG_CONTAINER is already running on 127.0.0.1:$PG_DOCKER_PORT"
        else
            docker rm -f "$PG_CONTAINER" > /dev/null 2>&1 || true
            port_in_use "$PG_DOCKER_PORT" && die "Port $PG_DOCKER_PORT is in use. Set DEMO_PG_PORT to a free port."
            say "Database: starting PostgreSQL 17 in Docker on 127.0.0.1:$PG_DOCKER_PORT ..."
            docker run -d --name "$PG_CONTAINER" --restart unless-stopped -p "127.0.0.1:$PG_DOCKER_PORT:5432" \
                -e POSTGRES_PASSWORD=postgres123 -v "$PG_VOLUME:/var/lib/postgresql/data" postgres:17-alpine > /dev/null
        fi
        local i=0
        until docker exec "$PG_CONTAINER" pg_isready -U postgres > /dev/null 2>&1; do
            i=$((i + 1)); [ "$i" -gt 60 ] && die "The database did not start. See: docker logs $PG_CONTAINER"
            sleep 1
        done
        sleep 1 # the first start restarts once after initialising
        until docker exec "$PG_CONTAINER" pg_isready -U postgres > /dev/null 2>&1; do sleep 1; done
    else
        say "Database: using PostgreSQL at $POSTGRES_HOST:$POSTGRES_PORT as $POSTGRES_USER (Docker is not available or turned off)"
    fi
}

prepare_python() {
    local py
    py="$(find_python)" || die "Python 3.11 or newer is needed (the Mac's built-in 3.9 is too old). Install it: brew install python@3.13"
    if [ ! -x "$VENV/bin/python" ] || ! "$VENV/bin/python" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2> /dev/null; then
        say "Python: creating $VENV with $py ..."
        rm -rf "$VENV"
        "$py" -m venv "$VENV"
    fi
    local want have
    want="$(cksum < "$API_DIR/requirements-dev.txt" | cut -d' ' -f1)-$(cksum < "$API_DIR/requirements.txt" | cut -d' ' -f1)"
    have="$(cat "$VENV/.demo-requirements" 2> /dev/null || true)"
    if [ "$want" != "$have" ]; then
        say "Python: installing the API's packages (a minute the first time) ..."
        "$VENV/bin/python" -m pip install --quiet --upgrade pip
        "$VENV/bin/python" -m pip install --quiet -r "$API_DIR/requirements-dev.txt"
        printf '%s' "$want" > "$VENV/.demo-requirements"
    fi
}

prepare_node() {
    command -v node > /dev/null 2>&1 || die "Node.js 20 or newer is needed. Install it: brew install node"
    node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' || die "Node.js 20 or newer is needed (found $(node -v)). Install it: brew install node"
    local want have
    want="$(cksum < "$WEB_DIR/package-lock.json" | cut -d' ' -f1)"
    have="$(cat "$WEB_DIR/node_modules/.demo-lock" 2> /dev/null || true)"
    if [ ! -x "$WEB_DIR/node_modules/.bin/vite" ] || [ "$want" != "$have" ]; then
        say "Node: installing the website's packages (a minute the first time) ..."
        (cd "$WEB_DIR" && npm ci --no-audit --no-fund --loglevel=error)
        printf '%s' "$want" > "$WEB_DIR/node_modules/.demo-lock"
    fi
}

demo_tool() { (cd "$API_DIR" && "$VENV/bin/python" scripts/demo.py "$@"); }

start_api() {
    if pid_running "$STATE/api.pid"; then
        say "API: already running (pid $(cat "$STATE/api.pid"))"
        return
    fi
    port_in_use "$API_PORT" && die "Port $API_PORT is in use. Stop what uses it, or set DEMO_API_PORT to a free port."
    say "API: starting on http://127.0.0.1:$API_PORT ..."
    # SERIALIZE_REQUESTS: the API shares one database connection per process, so uvicorn must take one request at a time (Lambda does anyway).
    # exec replaces the subshell with the server, so $! is the server's own pid and "stop" kills the right process.
    (cd "$API_DIR" && IS_LOCAL=true APP_ENV=local SERIALIZE_REQUESTS=true exec nohup "$VENV/bin/python" -m uvicorn app.main:app \
        --host 127.0.0.1 --port "$API_PORT") > "$STATE/api.log" 2>&1 &
    echo $! > "$STATE/api.pid"
    wait_for_http "http://127.0.0.1:$API_PORT/health" 60 || { tail -20 "$STATE/api.log"; die "The API did not start. Log: $STATE/api.log"; }
}

start_web() {
    if pid_running "$STATE/web.pid"; then
        say "Website: already running (pid $(cat "$STATE/web.pid"))"
        return
    fi
    port_in_use "$WEB_PORT" && die "Port $WEB_PORT is in use. Stop what uses it, or set DEMO_WEB_PORT to a free port."
    say "Website: starting on http://localhost:$WEB_PORT ..."
    # VITE_API_URL is set empty so a frontend/.env.local left by the LocalStack demo cannot send the browser to another API.
    (cd "$WEB_DIR" && VITE_API_URL= VITE_PROXY_TARGET="http://127.0.0.1:$API_PORT" exec nohup ./node_modules/.bin/vite \
        --port "$WEB_PORT" --strictPort --host 127.0.0.1) > "$STATE/web.log" 2>&1 &
    echo $! > "$STATE/web.pid"
    wait_for_http "http://127.0.0.1:$WEB_PORT/" 60 || { tail -20 "$STATE/web.log"; die "The website did not start. Log: $STATE/web.log"; }
}

cmd_status() {
    pid_running "$STATE/api.pid" && say "API:      running on http://127.0.0.1:$API_PORT (pid $(cat "$STATE/api.pid"))" || say "API:      stopped"
    pid_running "$STATE/web.pid" && say "Website:  running on http://localhost:$WEB_PORT (pid $(cat "$STATE/web.pid"))" || say "Website:  stopped"
    if use_docker; then
        [ "$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2> /dev/null)" = "true" ] \
            && say "Database: Docker container $PG_CONTAINER on 127.0.0.1:$PG_DOCKER_PORT" || say "Database: Docker container $PG_CONTAINER is not running"
    else
        say "Database: local PostgreSQL (not managed by this script)"
    fi
}

case "${1:-start}" in
    start)
        prepare_python
        prepare_node
        setup_database_env
        start_database
        demo_tool create-db
        start_api
        demo_tool ready
        start_web
        say ""
        say "Open http://localhost:$WEB_PORT   (stop with: ./bin/demo-local.sh stop)"
        ;;
    stop)
        stop_pid "$STATE/web.pid"
        stop_pid "$STATE/api.pid"
        say "Stopped the website and the API. The database keeps its data (docker rm -f $PG_CONTAINER to remove the container)."
        ;;
    status) cmd_status ;;
    reset|ready)
        [ -x "$VENV/bin/python" ] || die "Run ./bin/demo-local.sh start first."
        setup_database_env
        use_docker && ! docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2> /dev/null | grep -q true && die "The database is not running. Run ./bin/demo-local.sh start."
        demo_tool "$1"
        ;;
    logs)
        tail -n 30 -f "$STATE/api.log" "$STATE/web.log"
        ;;
    *)
        die "Unknown command '$1'. Use: start, stop, status, reset, ready or logs."
        ;;
esac
