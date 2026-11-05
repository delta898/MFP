# GitHub Environment Secret Sync

The local files below are ignored by Git and are the input for the sync command:

- Development: `.secrets/.secret.dev.env`
- Production: `.secrets/.secret.prod.env`

Copy the matching example, fill the required values, then restrict permissions:

```sh
mkdir -p .secrets
cp .secrets/.secret.dev.env.example .secrets/.secret.dev.env
chmod 600 .secrets/.secret.dev.env
```

Both files contain `BLOGGENIUS_TRENDS_API_URL` and `CLOUDFLARE_ACCOUNT_ID`.
The sync utility writes these nonsecret values to the matching GitHub
Environment variables; every other supported entry is written as a GitHub
Environment secret. Both environments write `NEWSLETTER_CANARY_EMAIL` as an
Environment variable. This initializes the workflow configuration without
opening GitHub Settings.

The Development file contains the GitHub Environment secret names used by the
current workflow, including the dedicated canary trigger token: Cloudflare and
Supabase deployment credentials, the Development Supabase public key, Trends
API credentials, newsletter shared token, Telegram credentials, and Brevo
settings. The workflow sets newsletter mode to `disabled` during deployment,
sends the fixed-recipient canary, and enables `live` only after it succeeds.
Quote values containing spaces, `#`, or other dotenv syntax characters.
`SUPABASE_DB_POOLER_URL` must come from the Development project's
Supabase **Connect → Session pooler** details and use port `5432`; the sync
utility verifies its hostname, project username, and port without printing it.
Do not put Production values in this file.

The Production file contains Production-scoped GitHub secrets for
Supabase/Cloudflare access, Trends API, newsletter Worker/Edge Function,
Telegram, and Brevo. `SUPABASE_DB_POOLER_URL` must be copied from the Production
project's Supabase **Connect → Session pooler** details and use port `5432`.
The Production direct endpoint is not reachable over IPv6 from the GitHub
runner, so migrations use this IPv4-capable Session Pooler URL. Use the exact
host Supabase displays and URL-encode reserved password characters (for
example, `;` as `%3B`). The sync utility checks the URL shape without printing
it. `NEWSLETTER_CANARY_EMAIL` is stored as an Environment variable in both environments
and is the only address the canary function can target. Both environments set
mode to `disabled` during deployment, send the canary, and change it to `live`
only after success. The Production emergency control workflow can set it back
to `disabled`.

Authenticate GitHub CLI for this repository once with `gh auth login`, then
run the fixed-environment wrapper:

```sh
./scripts/secrets/dev_sync_github_secret.sh
./scripts/secrets/prod_sync_github_secret.sh
```

The command validates every name and required value before changing GitHub,
requires local file mode `600`, checks GitHub CLI authentication, and asks you
to type the target environment. Production always requires typing `PRODUCTION`.
It prints setting names and outcomes only. Secret values are sent to `gh` over
standard input and are not printed; the nonsecret Cloudflare account ID is
written as an Environment variable. The operation does not deploy code or
contact Cloudflare/Supabase directly.

After syncing Development values, push to `dev`. Development migration
preview, apply, and migration-history inspection all use the Development
Session Pooler URL. The GitHub `development` Environment is created or
reconciled by the sync utility and restricted to the `dev` branch. Development
site deploy, domain cutover, and rollback operations also reject all other
refs, with Environment credentials available only after the workflow's `dev`
branch guard.

Production sync creates the `production` Environment when it is missing,
restricts it to the `release/*` branch pattern and the `v*` tag pattern, and
removes reviewer and wait-timer gates so a `release/*` push deploys directly. The branch
pattern permits Production Worker releases; the tag pattern permits protected
app release builds to read the same Production API URL. It then syncs its
secrets and variables; it does not deploy Production. Creating either
Environment requires permission to administer repository environments. The
Production branch and tag policy is verified before any secrets or variables
are written.

If a sync is interrupted, rerun the same wrapper. GitHub secret updates are
idempotent. Check the printed names and the Actions result; never paste secret
values into logs, issues, or chat.
