# Naver OAuth Publishing Boundary

## Status

Accepted on 2026-09-06.

## Context

BlogGenius currently uses a browser-authenticated Naver session for blog editor access and publishing. A backlog
item proposed replacing that state with a conventional OAuth2 connection, token refresh, and consent flow.

The product review determined that Naver OAuth2 account authorization and the browser session required by the
current blog publishing automation are different capabilities. Treating an OAuth access token as a replacement
for the browser session would promise a publishing path that the verified product integration does not provide.

## Decision

- Do not pursue a Naver OAuth2 migration as a replacement for browser-based blog publishing authentication.
- Keep Naver publishing authentication as a device-local browser-session capability.
- Continue to distinguish saved authentication data from a currently valid session and provide explicit
  `checking`, `login required`, and verification-failed states.
- Keep session data on the user's PC and do not move browser cookies or unrestricted publishing credentials to a
  server, mobile client, or remote channel.
- Revisit Naver OAuth only if a future, separately verified capability provides concrete product value such as
  account identity. Such a capability must not be presented as proof that blog publishing is authorized.

## Consequences

### Positive

- The product does not expose a connection flow that cannot complete the publishing job users expect.
- Authentication status remains aligned with the actual browser automation boundary.
- Existing login-expiry recovery and draft-preservation behavior remains valid.

### Negative

- Users must reauthenticate the browser session when Naver expires it.
- Blog publishing remains sensitive to browser and editor changes.
- A conventional refresh-token-only background publishing model is not available through this decision.

## Rejected Alternative

Replacing `naver_auth.json` and browser session verification with OAuth2 tokens was rejected because the two
mechanisms authorize different operations in the current verified integration. OAuth may be evaluated later only
as an independent capability with its own scope and acceptance evidence.
