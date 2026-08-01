# Chat Model Source Selection Plan

## Status

Implementation complete on `codex/chat-model-source-design`; awaiting user
runtime verification before archiving this plan.

## Goal

Treat Chat Model as a reusable AI role for frequent, lightweight tasks while
supporting both of these user needs:

1. Reuse the current writing model without entering the same settings again.
2. Configure an independent Chat Model with its own model and API key.

Chat is a role, not a new model kind. Both writing and chat selections use the
existing `text` Model Catalog and trusted text transports.

## Current State

`ai_settings.TEXT_MODEL` uses the Model Catalog and transport registry.
`ai_settings.CHAT_MODEL` is a separate legacy OpenAI-compatible tuple:

```json
{
  "base_url": "http://127.0.0.1:1234/v1",
  "api_key": "...",
  "model": "qwen/qwen3-coder-30b"
}
```

The current runtime has two unrelated dispatch paths:

- writing: `callWritingText()` uses `TEXT_MODEL_CONFIG` and trusted transports;
- chat: `callCustomAiText()` always builds an OpenAI-compatible chat request.

Telegram, Naver comment drafts, and SNS settings can also choose independently
between the writing path and the legacy Chat Model path. Agent memory follows the
Telegram selection. This creates overlapping model-selection concepts.

There is also a current UI/runtime mismatch: `글쓰기 모델 차용` maps to the
`default` mode, but `callTextModelByMode(default)` calls the Gemini-native helper
directly rather than `callWritingText()`. Therefore that label does not actually
follow a selected ChatGPT, Claude, KIE, or direct writing model. The new role
resolver must remove this implicit Gemini path.

## Proposed User Model

The AI settings page presents one Chat Model source choice:

- `글쓰기 모델 사용`
  - resolves the current writing model at call time;
  - stores no copied model fields or API key;
  - automatically follows later writing-model changes.
- `별도 Chat Model 사용`
  - shows the same provider and model controls as the writing model;
  - uses the existing text Model Catalog, including `직접 입력`;
  - stores an independent selection and API key.

Use radio cards or a segmented choice rather than a checkbox. An explicit pair
makes the unchecked state and saved behavior unambiguous.

Suggested layout:

```text
Chat Model
  (●) 글쓰기 모델 사용
      현재 적용 모델: Gemini 3.6 Flash

  ( ) 별도 Chat Model 사용
      AI 선택 / 모델 선택 / Base URL / API Key
      연결 확인
```

Dedicated fields are hidden or disabled while the writing source is active, but
their last saved values are retained so switching modes does not erase settings.

## Configuration Contract

Canonical shape:

```json
{
  "ai_settings": {
    "CHAT_MODEL": {
      "source": "writing",
      "selection": null
    }
  }
}
```

or:

```json
{
  "ai_settings": {
    "CHAT_MODEL": {
      "source": "dedicated",
      "selection": {
        "provider": "kie",
        "code": "gemini-3-6-flash-openai",
        "api_key": "..."
      }
    }
  }
}
```

The dedicated `selection` follows the same storage rules as `TEXT_MODEL`: known
catalog models store provider, code, and secret values only; direct models also
store name and Base URL.

## Resolution and Dispatch

Add one resolver for the role:

```text
resolveChatModelConfig()
  source=writing   -> current resolved TEXT_MODEL_CONFIG
  source=dedicated -> resolved CHAT_MODEL.selection using kind=text
```

Extract the transport-based writing dispatch into a shared text-model caller.
Both `callWritingText()` and `callChatText()` pass a resolved model config through
that caller. This allows Gemini native, OpenAI, Claude, KIE, and direct
OpenAI-compatible routes without duplicating endpoint logic.

There is no automatic fallback from a failed dedicated Chat Model to the writing
model. Such fallback can unexpectedly change provider, quality, and cost.

Per-task token limits and temperature remain caller-owned. The Chat role does not
globally force a cheap model or a smaller token limit; it only makes that choice
easy to configure.

## Consumer Policy

Recommended simplification:

- Telegram natural-language interpretation: always use the Chat Model role.
- Agent memory and lightweight agent interpretation: always use the Chat Model
  role instead of inheriting a Telegram-specific mode.
- MCP-triggered support tasks: use the Chat Model role when they need an LLM.
- Naver comment drafts: retain the task-level `글쓰기 모델 / Chat Model` choice.
- SNS AI: retain `사용 안 함 / 글쓰기 모델 / Chat Model` because disabling AI
  and choosing quality per task are meaningful product choices.

Under this policy, `TELEGRAM_CHAT_AI_MODE` and its Telegram settings selector are
removed after migration because they duplicate the global Chat Model source.

## Connection Check

- `source=writing`: show the resolved writing model and reuse its generation-free
  connection check.
- `source=dedicated`: check the dedicated resolved selection through the existing
  model connection tester.
- The result label must identify both the role and resolved model, for example
  `Chat Model · Gemini 3.6 Flash 연결 성공`.

## Migration

- Existing non-empty legacy `{base_url, api_key, model}` becomes
  `source=dedicated` with a `provider=direct` selection.
- Missing or empty legacy Chat Model config becomes `source=writing`.
- The legacy Telegram-specific mode is removed. A non-empty legacy Chat Model
  remains dedicated regardless of that obsolete selector, preserving the explicit
  model configuration; an empty Chat Model resolves to the writing model.
- Persist only the canonical shape after the next settings save.

## Model Catalog and Release Behavior

No separate Chat Model Catalog is introduced. Chat uses `kind=text`, so catalog
updates for an already shipped transport are available to both writing and
dedicated Chat Model selection without another app release. A new transport still
requires app support before a catalog entry can activate it.

## Implementation Sequence

1. Add Chat Model source/selection normalization and legacy migration tests.
2. Extract shared resolved-text dispatch and add transport coverage tests.
3. Add `callChatText()` and migrate Telegram/Agent/SNS/comment consumers.
4. Replace legacy Chat UI with source choice and catalog-backed dedicated fields.
5. Route connection checks through the resolved role config.
6. Update canonical architecture docs, capability names, UI copy, and changelog.
7. Run focused tests, full unit tests, and manual UI/runtime verification.

## Confirmed Product Decisions

- Use radio controls for the Chat Model source.
- Telegram, Agent Memory, and MCP support work always consume the common Chat
  Model role.
- Naver comments retain the writing/Chat choice.
- SNS retains none/writing/Chat.
- Remove the Telegram-specific writing/CHAT selector and capability.

## Implementation Result

- Added canonical source/selection normalization and legacy migration.
- Shared the trusted text transport dispatcher between writing and Chat roles.
- Migrated Telegram, Agent Memory, content-idea support, SNS, and comment paths.
- Replaced the legacy OpenAI-compatible-only form with catalog-backed radio UI.
- Removed the generation-based Custom AI test endpoint; Chat connection checks
  use the existing generation-free model metadata/account check.
- Promoted the stable design to `docs/architecture/chat-model-role.md`.
