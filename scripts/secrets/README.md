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

Both files also contain `CLOUDFLARE_ACCOUNT_ID`. The sync utility writes that
nonsecret value to the matching GitHub Environment variable; every other
supported entry is written as a GitHub Environment secret. This means the
Cloudflare account target can be initialized from the local file without
opening GitHub Settings.

The Development file contains the GitHub Environment secret names used by the
current workflow: Cloudflare and Supabase deployment credentials, the
Development Supabase public key, Trends API credentials, newsletter shared
token, Telegram credentials, and Development email policy/provider settings.
`NEWSLETTER_EMAIL_MODE` must be `allowlist`; set the test-recipient allowlist
before syncing. Quote values containing spaces, `#`, or other dotenv syntax
characters. Do not put Production values in this file.

The Production file contains Production-scoped GitHub secrets for
Supabase/Cloudflare access, Trends API, newsletter Worker/Edge Function,
Telegram, and Brevo. `NEWSLETTER_CANARY_EMAIL` is stored as a Production
Environment variable and is the only address the canary function can target.
The regular Production email mode is deliberately not synced from this file;
deployment sets it to `disabled`, and the protected control workflow changes it
to `canary`, `live`, or `disabled`.

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

After syncing Development values, push to `dev`. The existing GitHub Actions
deployment provisions the Development Supabase Edge Function and both
Development Workers from the GitHub `development` Environment. If that
Environment is missing, the Dev sync creates it and restricts it to the `dev`
branch.

Production sync creates the `production` Environment when it is missing,
restricts it to `release/*`, and requires the currently authenticated GitHub
account to approve. It then syncs its secrets and account variable; it does not
deploy Production. Creating either Environment requires permission to
administer repository environments. Production also requires GitHub to support
required reviewers for this repository. If the requested protections cannot
be configured and verified, sync stops before writing secrets or variables.

If a sync is interrupted, rerun the same wrapper. GitHub secret updates are
idempotent. Check the printed names and the Actions result; never paste secret
values into logs, issues, or chat.
