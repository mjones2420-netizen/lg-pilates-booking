# Database backups (#96)

**In short:** every night at 02:00 UTC, GitHub copies the production database,
locks the copy with a password, and stores it in a private Cloudflare R2
bucket. Copies are kept for 30 days. Every Monday, a second job
restores the newest copy into a throwaway database and checks that every row
came back. If either job fails, an issue opens and Mark gets an email.
As an outside check, each successful backup "checks in" with a HetrixTools
heartbeat monitor ("LG Pilates – nightly backup"). If there's no check-in
for 3 days, HetrixTools emails Mark. That covers GitHub silently switching
the jobs off after 60 days with no repo activity.

| File | What it is |
|---|---|
| `.github/workflows/db-backup.yml` | The nightly backup job |
| `.github/workflows/restore-drill.yml` | The weekly restore drill |
| `01-backup-reader-role.sql` | Creates the read-only `backup_reader` login (run once on PROD) |
| `table-counts.sql` | Row count per table; used by both jobs to prove nothing went missing |
| `restore-skip.txt` | Parts of the backup a restore must skip (used by the drill and step 4 below) |

**What's in a backup:** everything in the `public` schema. That covers every
table (bookings, customers, health forms, waitlists, settings and the rest),
plus the functions, triggers and security policies.

**What's NOT in a backup:**
- **Admin logins** (`auth.users`). Recreate Louise's login by hand after a restore (step 6).
- **Scheduled cron jobs.** Re-run them from their migrations (step 7).
- **Edge Functions and their secret keys** (Stripe, Resend). These live in the repo and in the Supabase dashboard, not in the database.

---

## One-time setup

1. **Cloudflare:** create a free account, turn on R2, and create a bucket
   called `lg-pilates-backups`. In the bucket's settings, add a lifecycle rule
   that deletes objects after 30 days.
2. **Cloudflare access key:** R2 > Manage API tokens > Create token with
   "Object Read & Write" on `lg-pilates-backups` only. Copy the Access Key
   ID, Secret Access Key and Account ID.
3. **PROD database login:** paste `01-backup-reader-role.sql` into the PROD
   SQL Editor, with a generated password in place of `PASTE_PASSWORD_HERE`.
4. **GitHub secrets** (repo > Settings > Secrets and variables > Actions):
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`: from step 2.
   - `BACKUP_DB_URL`:
     `postgresql://backup_reader.mrlooyixnlxzcfmvnqme:<password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require`
   - `BACKUP_PASSPHRASE`: a long random password. **Keep a copy offline**
     (e.g. a password manager). Without it, no backup can ever be opened.
   - `BACKUP_HEARTBEAT_URL`: the ping URL of a HetrixTools Uptime Monitor of
     type Heartbeat > Cron Job, with a 3-day timeout.
5. Run **Actions > Nightly Database Backup > Run workflow**, then
   **Actions > Weekly Restore Drill > Run workflow**. Both should go green.

---

## Emergency restore

Use this if the production database is lost, corrupted or deleted. Claude
does the technical steps with Mark; Mark does anything that needs a
production password.

1. **Get the newest backup.** In Cloudflare R2 > `lg-pilates-backups` >
   `prod/`, download the newest `lg-pilates-prod-YYYYMMDD-HHMM.dump.gpg`
   and the `.counts.csv` file with the same name.
2. **Unlock it.** Enter the backup passphrase when asked:
   ```bash
   gpg --decrypt --output db.dump lg-pilates-prod-YYYYMMDD-HHMM.dump.gpg
   ```
3. **Choose where to restore.**
   - *Project deleted:* create a new Supabase project in the same region
     (eu-west-1). Under Database > Extensions, turn on `pg_cron` and `pg_net`.
   - *Project still there but the data is damaged:* restore into a fresh
     project first and check it. Only then decide whether to switch over.
     Never restore on top of the damaged database.
4. **Restore.** First, in the new project's SQL Editor, run
   `01-backup-reader-role.sql` with a **new** password (save it in Passwords).
   The backup's permissions refer to `backup_reader`, so it must exist first,
   and this also gives the new project its backup login. Then, with `$DB_URL`
   set to the new project's session-pooler URL for the `postgres` user:
   ```bash
   pg_restore --list db.dump | grep -v -E -f docs/backups/restore-skip.txt > restore.list
   pg_restore --dbname "$DB_URL" --exit-on-error --use-list restore.list db.dump
   ```
   This is the same restore the weekly drill runs, so it should finish with
   no errors.
5. **Check it.** Run `table-counts.sql` against the new project and compare
   with the `.counts.csv` file. Every line should match except `admin_users`.
6. **Admin login.** Supabase > Authentication > Add user (Louise's email),
   then in the SQL Editor:
   `INSERT INTO admin_users (user_id) SELECT id FROM auth.users WHERE email = '<louise's email>';`
7. **Cron jobs.** Re-run the `cron.schedule(...)` parts of migrations 23, 27,
   29, 33 and 34 (`tests-playwright/migrations/`).
8. **New project only: reconnect everything.** Deploy every Edge Function
   and set its secrets (Stripe, Resend). Point `index.html` at the new
   project URL and publishable key. Then update the Stripe webhook URL, the
   keep-alive workflow and the HetrixTools "Database" monitor. Update the
   `BACKUP_DB_URL` secret with the new project's id, pooler address and the
   new backup password from step 4.

**What gets lost:** anything booked after the last nightly backup. At worst
that's one day of bookings, which Stripe and Louise's emails can fill in.
