# AI Provider Profiles Plan

## Status

Implemented and verified on 2026-08-03.

## Goal

Remember AI connection values independently for every model role and provider so
switching providers does not require copying API keys again and never carries one
provider's key into another provider by accident.

## Product Decisions

- Text, Image, and Chat are independent roles. A key saved for one role is never
  silently shared with another role, even when the provider ID is the same.
- Each role remembers one profile per provider.
- A catalog provider profile remembers its API key and last selected model code.
- A `direct` profile remembers API key, model name, and Base URL as one connection
  tuple.
- Provider changes restore the matching role/provider profile immediately.
- Unsaved edits live only in the settings page's JavaScript memory. They are not
  written to `localStorage` or another browser store.
- `저장 및 적용` persists every profile atomically to the local `config.json`.
- Reloading before save discards in-memory edits and restores the last saved
  profiles.

## Configuration Contract

The active runtime selection remains authoritative:

```json
{
  "ai_settings": {
    "TEXT_MODEL": {
      "provider": "gemini",
      "code": "gemini-3.6-flash",
      "api_key": "active-key"
    }
  }
}
```

Inactive provider state is stored separately:

```json
{
  "ai_settings": {
    "MODEL_PROFILES": {
      "text": {
        "gemini": {
          "provider": "gemini",
          "code": "gemini-3.6-flash",
          "api_key": "text-gemini-key"
        },
        "openai": {
          "provider": "openai",
          "code": "gpt-5.6-sol",
          "api_key": "text-openai-key"
        }
      },
      "image": {},
      "chat": {
        "direct": {
          "provider": "direct",
          "name": "local-chat-model",
          "code": "local-chat-model",
          "base_url": "http://127.0.0.1:1234/v1",
          "api_key": ""
        }
      }
    }
  }
}
```

The active selection is duplicated into its profile on save. This intentionally
keeps runtime resolution independent from UI history: runtime callers continue to
resolve `TEXT_MODEL`, `IMAGE_MODEL`, and `CHAT_MODEL`, while the settings UI owns
provider switching history.

## Migration

- Existing active Text and Image selections seed their matching profiles when no
  saved profile exists.
- Existing dedicated Chat selection seeds only the Chat role profile.
- Existing direct Chat legacy tuples continue through the current Chat migration
  and then seed the direct Chat profile.
- Missing or malformed profile entries are ignored. They never override a valid
  active selection.
- The first successful settings save writes the normalized profile registry.

## UI State Flow

```text
load settings
  -> hydrate saved role/provider profiles
  -> seed active selection into its profile

provider change
  -> snapshot visible fields into previous provider's in-memory profile
  -> restore target provider's profile
  -> mark settings dirty

save and apply
  -> overlay current visible fields
  -> validate all profiles server-side
  -> write active selections + complete profile registry
```

## Security Boundary

- API keys remain local user credentials stored in `config.json`, matching the
  existing security model.
- Secret fields remain partially masked in the UI.
- Profiles must not be written to browser storage, logs, activity history, or the
  remote Model Catalog.
- Incoming profile objects are normalized server-side; provider IDs cannot inject
  endpoints or transport code.
- Clearing a profile's API key and saving is an explicit deletion for that role
  and provider only.

## Verification

- Unit-test role isolation and legacy active-selection seeding.
- Unit-test independent keys for the same provider across Text, Image, and Chat.
- Unit-test direct profile retention of API key, Base URL, and model name.
- Unit-test malformed and mismatched provider profile rejection.
- Verify provider A -> B -> A restoration before save.
- Verify save, app reload, and A -> B -> A restoration after save.
- Verify an Image or Chat key is unchanged when the Text profile changes.
- Verify connection checks use the currently visible provider profile.
