"""The demo tools give every sample person a readable username (scripts/readable_usernames.sql)."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.integration

SQL = Path(__file__).parent.parent / "scripts" / "readable_usernames.sql"
FIXED = ("maria1", "james1", "alex01", "priya1", "tom001", "lena01", "omar01", "sofia1", "nina01")


def test_every_sample_person_gets_a_short_readable_unique_username_and_fixed_ones_stay(api, raw_db, today):
    api.client.post("/admin/seed-demo", headers=api.admin.headers)
    raw_db.execute("UPDATE users SET username = 'maria1' WHERE email = 'maria.lopez@demo.acme.example'")  # set by the demo tool

    raw_db.execute(SQL.read_text())

    rows = raw_db.execute("SELECT email, username FROM users WHERE email LIKE '%@demo.acme.example'").fetchall()
    names = {r["email"].split("@")[0]: r["username"] for r in rows}
    assert len(names) == 30 and len(set(names.values())) == 30
    assert names["maria.lopez"] == "maria1"  # a fixed one is left alone
    assert names["hannah.weiss"] == "hann01" and names["diego.alvarez"] == "dieg01" and names["mei.chen"] == "mei01"
    assert all(re.fullmatch(r"[a-z]+\d{1,3}", n) for n in names.values()), names


def test_two_people_with_the_same_first_letters_are_numbered(api, raw_db, today):
    api.client.post("/admin/seed-demo", headers=api.admin.headers)
    raw_db.execute("UPDATE users SET name = 'Hannes Weiss' WHERE email = 'diego.alvarez@demo.acme.example'")
    raw_db.execute(SQL.read_text())
    got = {r["username"] for r in raw_db.execute("SELECT username FROM users WHERE name IN ('Hannah Weiss', 'Hannes Weiss')")}
    assert got == {"hann01", "hann02"}


def test_the_admin_and_real_accounts_are_not_touched(api, raw_db, today):
    api.client.post("/admin/seed-demo", headers=api.admin.headers)
    raw_db.execute(SQL.read_text())
    assert raw_db.execute("SELECT username FROM users WHERE id = %s", (api.admin.id,)).fetchone()["username"] == api.admin.username
