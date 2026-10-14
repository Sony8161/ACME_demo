# Deploying to AWS: readiness checklist

What is deployed, how, and what is and is not protected. Last checked 2026-10-14 on the workshop account (us-east-2).

## Steps (in this order)

1. Fresh credentials: `./bin/setup-participant.sh` (writes `ENVIRONMENT.config`, which sets `AWS_REGION`; **do not override the region**).
2. `cd infra && source ../ENVIRONMENT.config`, then `terraform init -reconfigure -backend-config="bucket=coding-workshop-tfstate-$PARTICIPANT_ID" -backend-config="region=$AWS_REGION"`.
3. `terraform plan -out=tf.plan`, read it (no destroys expected), then `terraform apply tf.plan`. Code changes re-package and replace the Lambda.
4. `./bin/deploy-frontend.sh aws` from the same checkout (builds with `VITE_API_URL` set to the CloudFront address, uploads to S3, invalidates the cache).
5. Open the `website_url` output, sign in as `admin1` with `terraform output -raw bootstrap_admin_password` (a new password is forced), then **Load sample data**.

## Secrets and files

| Item | Where it lives | Status |
|---|---|---|
| AWS temporary credentials | `ENVIRONMENT.config` (git-ignored, mode 600) and `~/.aws/credentials` | Never committed; none found in tracked files, the full git history, or the showcase repo |
| JWT signing key, first-admin password | Terraform `random_password`, passed to the Lambda as environment variables | **Plain Lambda environment variables and Terraform state**, not Secrets Manager (see limits) |
| Database password | Aurora master password, passed to the Lambda the same way | Same |
| AI key for the assistant | Not set. Built-in assistant answers; nothing leaves AWS | Put it in Secrets Manager before ever enabling it |
| `frontend/.env.sample` | Tracked, holds no secret | Fine |
| Terraform state | S3 bucket `coding-workshop-tfstate-<participant>` (workshop-managed) | Contains the generated passwords |

## What the code enforces in the cloud

- No weak default: the API refuses to start without `JWT_SECRET` when `IS_LOCAL` is false; the local default password is only used locally.
- `/docs`, `/redoc` and `/openapi.json` are closed when not local (they were public on the first deploy).
- Every API answer carries `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cache-Control: no-store`, and HSTS in the cloud (`app/core/headers.py`, `tests/test_hardening.py`).
- The website gets CSP, HSTS, no-framing, no-sniff and no-referrer from a CloudFront response-headers policy (`infra/cloudfront.tf`). The CSP was run against the production build in a real browser: no violations on sign-in, project pages, timeline, tasks, assistant and People.
- Sign-in rate limit, account lock after repeated failures, per-person request limit, one-time generated passwords, bcrypt, archive-never-delete, audit history.

## Known limits (decide before real data)

1. **Secrets in Lambda environment variables.** Anyone in the account who can read the function configuration, or the state bucket, can read the JWT key and database password. Moving them to Secrets Manager is the fix.
2. **The Lambda function URL is public** (auth type NONE, CORS `*`), so it can be called without going through CloudFront. Authentication, rate limits and the headers above still apply; a WAF or an origin-secret header would close it.
3. **No WAF or edge rate rule**; limits are per Lambda container.
4. **Database:** storage encrypted, but `skip_final_snapshot = true` and no deletion protection, so a `terraform destroy` loses the data. Aurora minimum capacity is 0.5 ACU (about an hour of cost every hour; it no longer pauses when idle).
5. **Logs** are kept 7 days. The assistant, if given a key, sends project data to the AI provider.
6. CI has never run on GitHub and the Mac path of `demo-local.sh` is untested.
