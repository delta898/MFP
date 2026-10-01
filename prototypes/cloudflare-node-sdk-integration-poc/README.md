# Cloudflare Node SDK Integration PoC

This isolated experiment checks whether the official `cloudflare` Node SDK can reproduce the existing OAuth-to-Workers Static Assets deployment flow. It is not connected to BlogGenius product code.

## Current findings

- SDK version: `cloudflare@7.2.0`, installed only in this prototype.
- The OAuth access token can be supplied to the SDK's `apiToken` option; both use an `Authorization: Bearer …` request header. The token is kept in memory by the live runner.
- SDK methods are available for Worker inventory, `workers.dev` subdomain lookup, Worker creation, asset upload session creation, Worker version creation, deployment creation, and deployment lookup.
- Cloudflare's official Static Assets example still sends the actual asset bytes to a signed bucket-upload endpoint using a direct HTTP request. The SDK orchestrates the surrounding API calls but does not eliminate every raw HTTP request.
- The official SDK currently has zero runtime dependencies and supports Node.js 20+. BlogGenius's packaged runtime uses Node 24.
- SDK v7.2.0's generated deployment-list helper models the Cloudflare `{ deployments: [...] }` response as paginated data; its async iterator yielded no items against that response shape in a local SDK contract check. The prototype reads the nested list from the SDK page's parsed `result` object.

## Local tests

```sh
npm test
```

The SDK adapter tests pass. A real OAuth-backed test also succeeded: SDK inventory returned 6 Worker Scripts; Worker `bg-sdk-poc-muq4p458-0a4047` was created and deployed; the public URL returned HTTP 200 with the expected sample page. That Worker remains in the Cloudflare account.

## Live check

Set `CF_OAUTH_CLIENT_ID` to the private test OAuth Client ID, then run `npm run live` in an interactive terminal. The runner uses the existing PKCE implementation and requests `memberships.read workers-scripts.read workers-scripts.write`.

After browser authorization, it lists Worker scripts through the SDK and prints an exact plan containing the account suffix, a new random Worker name, its public `workers.dev` URL, and persistent effects. It sends no Cloudflare write request unless the exact `PUBLISH <worker-name>` phrase is typed. This creates a new disposable Worker, uploads one public HTML page, and directs 100% of that new Worker's traffic to the uploaded version. It does not alter or reuse the earlier REST PoC Worker. The deployed Worker remains in the account after the check.

The official SDK is used for the account inventory, Worker/subdomain operations, upload-session creation, version creation, and deployment/status operations. The signed static asset byte transfer remains a direct fetch, matching Cloudflare's official SDK example.

Do not paste or persist OAuth access tokens. Do not run live write validation without reviewing the generated deployment plan.
