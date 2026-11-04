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

The Development file contains the GitHub Environment secret names used by the
current workflow: Cloudflare and Supabase deployment credentials, the
Development Supabase public key, Trends API credentials, newsletter shared
token, Telegram credentials, and Development email policy/provider settings.
`NEWSLETTER_EMAIL_MODE` must be `allowlist`; set the test-recipient allowlist
before syncing. Quote values containing spaces, `#`, or other dotenv syntax
characters. Do not put Production values in this file.

The Production file contains only Production-scoped GitHub secret names for
Supabase/Cloudflare access and the Trends API. Production newsletter delivery
and automated Production deployment are not configured by this feature.

Authenticate GitHub CLI for this repository once with `gh auth login`, then
run the fixed-environment wrapper:

```sh
./scripts/secrets/dev_sync_github_secret.sh
./scripts/secrets/prod_sync_github_secret.sh
```

The command validates every name and required value before changing GitHub,
requires local file mode `600`, checks GitHub CLI authentication, and asks you
to type the target environment. Production always requires typing `PRODUCTION`.
It prints secret names and outcomes only; secret values are sent to `gh` over
standard input and never appear in command arguments or output. The operation
updates GitHub Environment secrets only. It does not deploy code or contact
Cloudflare/Supabase directly.

After syncing Development values, push to `dev`. The existing GitHub Actions
deployment provisions the Development Supabase Edge Function and both
Development Workers from the GitHub `development` Environment. Production sync
only prepares GitHub's `production` Environment; it does not deploy Production.

If a sync is interrupted, rerun the same wrapper. GitHub secret updates are
idempotent. Check the printed names and the Actions result; never paste secret
values into logs, issues, or chat.
