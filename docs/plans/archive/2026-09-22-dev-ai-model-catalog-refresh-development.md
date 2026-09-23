# Development AI Model Catalog Refresh Development Record

- Branch: `codex/dev-ai-model-catalog-refresh`
- Base/parent branch: `dev` (`8975227`)
- Start date: 2026-09-22
- Status: complete; Development and Production routing verified; full regression passed; ready for `dev` integration

## User Need

v0.5.2 후보를 실제 출시 전에 검증할 수 있도록 최신 텍스트·이미지 모델을 앱의 bundled catalog와 Development/Production 원격 catalog에 반영하고 이전 세대 모델은 안전하게 숨긴다.

## Goal

BlogGenius의 bundled fallback과 원격 Supabase catalog를 같은 모델 정책으로 맞춘다. 직접 공급자 모델은 기존 generic transport를 재사용하고 KIE 이미지 모델은 문서화된 Market 요청 프로필을 명시적으로 추가한다. 앱 버전별 published snapshot 공존으로 기존 사용자 호환성을 유지한다.

## Scope

- 대상 project: BlogGenius Development (`bvtlwjbmjnfphxlrkzhm`)와 Production (`hocfjolcthvtgfaxjmse`)
- 최종 catalog version: `2026-09-23.1` (`0.5.2+`)
- OpenAI `gpt-6-astra` 추가
- Google `gemini-3.8-flash` 추가
- KIE.ai `gpt-6-astra` 추가
- KIE.ai `gemini-3-8-flash-openai` 추가
- Google `gemini-3.5-flash`와 KIE.ai `gemini-3-5-flash-openai`를 `hidden` 처리
- Anthropic 현행 목록을 Fable 5.1, Opus 5, Sonnet 5, Haiku 4.5로 정리하고 이전 Fable 5 및 Opus/Sonnet 4.x는 `hidden` 처리
- Claude Sonnet 5의 non-default temperature 미지원 capability 반영
- OpenAI GPT Image 2.5 Sunburst/Flare 추가, GPT Image 2 유지
- Google Nano Banana 2 Lite 추가, 기존 `gemini-2.5-flash-image` 유지
- KIE GPT Image 2.5 Sunburst/Flare와 Nano Banana 2 Lite의 allowlist 및 요청 프로필 추가
- 이미지 해상도는 기존 제품 범위인 1K/2K까지만 제공
- draft validation, Development publish, readback 및 rollback SQL 보존
- OpenAI 직접 공급자에 GPT-6 Sol/Luna 추가
- 글쓰기와 보조 작업의 reasoning 강도를 작업 성격에 따라 자동 적용
- 설정 UI에서 자동 조절 기준과 시간·사용량 영향을 사용자에게 안내

## Non-goals

- 앱 release, version bump, tag, push 및 패키지 배포
- KIE Claude Messages transport 및 KIE Claude 모델 노출
- 이미지 4K UI/런타임 지원
- 유료 생성 호출
- 사용자가 reasoning 세부 단계를 직접 선택하는 고급 UI

## Design Decisions

- 현재 로컬 Supabase link는 Production이므로 link를 전환하지 않는다. 모든 query에 Development project ref를 명시한다.
- 기존 published payload를 서버 안에서 복제·변환해 provider 및 이미지 모델을 빠뜨리지 않는다.
- 새 모델은 기존 allowlisted transport만 사용한다.
- KIE Claude는 `/claude/v1/messages` 전용 계약이므로 이번 단계에서 보류한다.
- KIE Market 이미지 모델은 원격 catalog만으로 활성화하지 않고 앱에 검증된 요청 프로필이 있는 모델만 allowlist한다.
- `gemini-2.5-flash-image`는 아직 선택 가능 상태로 유지한다.
- `hidden` 모델은 신규 선택 목록에서 제외하되 저장된 기존 선택의 해석을 위해 catalog definition을 유지한다.
- 초기 Development 검증에는 `0.1.16` 호환 하한을 사용했지만, 최종 운영 구조에서는 새 39-model snapshot을 `0.5.2` 이상으로 제한한다. `0.5.1` 이하는 이전 published snapshot을 계속 사용한다.
- 원격 RPC가 요청 앱 버전에 맞는 최신 published snapshot을 선택하므로 구·신 snapshot을 동시에 published 상태로 유지한다. 새 snapshot publish가 기존 호환 snapshot을 retire하지 않게 한다.
- Production에도 Development에서 검증한 동일 payload를 별도 versioned draft로 넣고, draft 검증과 앱 버전별 routing 확인을 거쳐 publish한다.
- reasoning은 모델별 고정값이 아니라 작업 역할로 결정한다. 본문·분석을 담당하는 글쓰기 역할은 `medium`, 제목·댓글·해시태그 등 보조 대화 역할은 `low`를 기본으로 한다.
- 기존 호출의 `minimal`은 GPT-6 호환 기준인 `low`로 정규화한다.
- 공급자가 지원하지 않는 reasoning 단계는 오류를 내거나 더 높은 단계로 올리지 않고 가장 가까운 하위 지원 단계로 안전하게 낮춘다.
- 사용자에게 내부 단계 선택을 요구하지 않고 Settings의 AI 화면에서 자동 조절 원칙과 응답 시간·사용량 영향을 설명한다.

## Implementation Progress

- 2026-09-22: Development project에 `2026-08-21.1` published snapshot(20 models)과 비어 있는 `2026-09-21.1` draft가 있음을 읽기 전용으로 확인했다.
- 2026-09-22: 로컬 Supabase link가 Production임을 확인하고 Development project ref 명시 정책을 확정했다.
- 기존 published payload를 복제·변환하는 draft SQL과 독립 publish/rollback SQL을 `supabase/operations/ai/`에 추가했다.
- Development에 `2026-09-22.1` draft를 생성하고 앱의 실제 catalog validator로 25개 정의와 lifecycle을 검증했다.
- Development에서 `2026-08-21.1`을 retired하고 `2026-09-22.1`을 published했다.
- Production은 계속 `2026-08-21.1` 20-model snapshot이 published 상태임을 읽기 전용으로 확인했다.
- 후속 검토에서 직접 Anthropic 및 모든 이미지 provider의 현행화 범위를 확정했다. 두 번째 Development snapshot `2026-09-22.2`로 앱 코드와 원격 catalog를 함께 맞추는 작업을 시작했다.
- bundled catalog에 OpenAI GPT Image 2.5 Sunburst/Flare, Google Nano Banana 2 Lite, Anthropic Fable 5.1 및 KIE 이미지 3종을 추가했다.
- Claude Sonnet 5는 요청에서 temperature를 제거하도록 capability를 수정했고, 이전 Fable 5 및 Opus/Sonnet 4.x는 저장된 선택 해석만 가능한 `hidden` 상태로 전환했다.
- KIE GPT Image 2.5 Sunburst/Flare와 Nano Banana 2 Lite의 Market allowlist, 요청 본문 builder 및 회귀 테스트를 추가했다.
- Development에 37-model `2026-09-22.2` snapshot을 publish하고 `2026-09-22.1`을 retired했다.
- 2026-09-23: OpenAI 공식 GPT-6 모델/reasoning 지침을 다시 확인하고 GPT-6 Sol/Luna 직접 모델, OpenAI Chat Completions reasoning 전달, KIE 공통 정책을 후속 범위로 확정했다.
- 공통 reasoning 정책을 추가해 글쓰기 역할은 `medium`, 보조 대화 역할은 `low`를 자동 적용하고 `minimal`을 `low`로 이관했다.
- OpenAI 직접 호출이 `reasoning_effort`를 실제 요청에 포함하도록 수정하고 KIE Responses는 `max`를 포함한 모델 capability 안에서 동일 정책을 적용하도록 정리했다.
- Settings AI 화면의 역할 설명에 작업별 품질·속도 자동 조절 원칙을 짧게 통합했다. 별도 강조 박스는 모델 선택보다 시선을 과도하게 차지해 제거하고, 세부 적용 기준과 시간·사용량 영향은 키보드 접근이 가능한 `?` 도움말로 옮겼다.
- 보조 대화 모델 카드의 중복된 `모델 선택` legend는 접근성 트리에 유지하면서 시각적으로 숨기고, heading-to-choice 간격과 선택 상태 요약의 계층을 토큰 기반으로 정리했다. 상속 모델은 내부 code 대신 catalog 표시 이름으로 보여준다.
- 저장된 화면 style이 앱 bundle 실행 후 적용되어 HTML 기본 style이 잠깐 보이던 초기 깜빡임을 제거했다. 허용된 style만 읽는 작은 bootstrap을 stylesheet보다 먼저 실행하고, registry와의 일치 여부를 계약 테스트로 보호한다.
- Development용 `2026-09-23.1` draft/publish/rollback SQL을 추가했다. 이 snapshot은 GPT-6 Sol/Luna를 추가하고 OpenAI/KIE GPT 모델에 지원 reasoning capability를 명시한다.
- 사용자가 Development SQL Editor에서 `2026-09-23.1` draft를 생성해 39개 모델과 GPT-6 reasoning capability를 확인한 뒤 publish했다. 이전 `2026-09-22.2` snapshot은 정상적으로 retired되었다.
- `2026-09-23.1`을 `0.5.2+` 전용으로 변경하고 `2026-09-22.2`를 다시 published로 복원하는 Development coexistence SQL을 추가했다. SQL 자체가 `0.5.1 -> 2026-09-22.2`, `0.5.2 -> 2026-09-23.1` routing을 검증한다.
- Development에서 읽은 검증 완료 39-model payload를 포함하는 Production draft SQL과, 기존 published snapshot을 유지하는 publish SQL, 새 snapshot만 retire하는 rollback SQL, 앱 버전별 read-only routing 확인 SQL을 추가했다.
- Supabase CLI의 기존 인증 세션과 Development project ref를 명시해 coexistence transaction을 Development에 직접 적용했다. 로컬 Production link는 변경하지 않았다.
- Production에도 검증된 `2026-09-23.1` 39-model payload를 `0.5.2+` 전용 snapshot으로 publish했다. 기존 published snapshot은 변경하거나 retire하지 않았다.

## Verification

- Draft transaction: 25 models, status `draft`, minimum app version `0.1.16`
- App `validateRemoteCatalog`: passed for app `0.5.1`; 23 selectable and 2 hidden models
- Development RPC readback: version `2026-09-22.1`, 25 models
- App merge/selection readback:
  - OpenAI: `gpt-6-astra`, GPT-5.6 Sol/Terra/Luna
  - Google: `gemini-3.8-flash`, Gemini 3.7/3.6, Gemini 3.1 Pro Preview/Flash-Lite
  - KIE.ai: `gpt-6-astra`, GPT-5.6 Sol/Terra/Luna, `gemini-3-8-flash-openai`, Gemini 3.6/3.1 Pro
  - Google/KIE Gemini 3.5 legacy routes are not selectable
- Focused catalog/runtime/connection tests: 35 passed
- Request construction check: OpenAI Astra, KIE Astra and KIE Gemini 3.8 use the expected existing transports and endpoints
- Production readback: unchanged at `2026-08-21.1`, 20 models
- Focused catalog/runtime/KIE image/connection tests: 72 passed
- Settings API smoke and Settings Beta contract tests: 15 passed
- Full Development payload passed the app `validateRemoteCatalog` path for app `0.5.1`
- Development RPC readback: version `2026-09-22.2`, payload 37 models
- Selectable image order verified:
  - OpenAI: GPT Image 2.5 Sunburst, GPT Image 2.5 Flare, GPT Image 2
  - Google: Nano Banana 2, Nano Banana 2 Lite, Nano Banana Pro, Nano Banana (Gemini 2.5)
  - KIE.ai: GPT Image 2.5 Sunburst/Flare, GPT Image 2, Nano Banana 2 Lite/2/Pro, Seedream 5 Pro/4.5
- Selectable Anthropic list verified: Fable 5.1, Opus 5, Sonnet 5, Haiku 4.5; Sonnet 5 temperature disabled
- Production RPC readback: remains `2026-08-21.1`
- GPT-6 reasoning/catalog 및 Settings UI focused tests: 61 passed
- `git diff --check`: passed
- Development draft validation: version/payload version `2026-09-23.1`, status `draft`, 39 models, minimum app version `0.1.16`
- Development reasoning capability readback: OpenAI GPT-6 Astra/Sol/Luna 및 KIE GPT-6 Astra 모두 기대한 지원 단계 확인
- Development publish readback: `2026-09-23.1` published with 39 models; `2026-09-22.2` retired
- Version routing/catalog focused tests: 33 passed. Embedded Production payload 39 models가 앱 validator를 통과하고 catalog minimum이 `0.5.2`이며, publish/rollback SQL이 legacy snapshot을 변경하지 않는지 검증
- Final `git diff --check`: passed
- Development coexistence readback:
  - app `0.1.16` / `0.5.1` -> `2026-09-22.2`, 37 models, minimum `0.1.16`
  - app `0.5.2` -> `2026-09-23.1`, 39 models, minimum `0.5.2`
  - both snapshots remain `published`
- Production routing readback:
  - app `0.1.15` -> `2026-08-04.1`, 19 models
  - app `0.1.16` / `0.5.1` -> `2026-08-21.1`, 20 models
  - app `0.5.2` -> `2026-09-23.1`, 39 models
- Full unit suite: 1,896 passed, 1 Windows-only skip, 0 failed across 357 files
- Full suite 중 MCP stdio initialize가 병렬 부하에서 한 차례 timeout났지만 단독 3/3 통과 후 전체 재실행에서도 통과했다.
- Release-phase pending: `0.5.2` release candidate 앱의 settings list와 hands-on generation checks

## Rollback

Development와 Production 모두 `2026-09-23.1`에 문제가 있으면 새 snapshot만 retire한다. 기존 호환 snapshot은 계속 published 상태이므로 `0.5.2` 요청도 자동으로 이전 snapshot으로 fallback한다. 기존 snapshot을 다시 publish하는 별도 복구 단계는 필요하지 않다.

## Remaining Risks / Manual Checks

- 사용자 계정별 model access는 중앙 catalog 지원 여부와 다를 수 있으므로 provider별 연결 확인이 필요하다.
- KIE.ai 연결 확인은 계정/credit endpoint만 검증한다. 실제 model route 생성 확인은 별도 유료 smoke 승인이 필요하다.
- 앱이 이전 catalog cache를 보유할 수 있으므로 Settings Beta의 AI 화면을 열어 remote refresh가 완료된 뒤 목록을 확인한다.
- KIE Nano Banana 2 Lite의 공개 문서 페이지는 모델 목록에는 노출됐지만 세부 페이지 조회가 불안정했다. 요청 profile은 KIE Market 공통 계약과 Lite의 1K-only 입력 계약으로 제한했으며 실제 생성 검증은 유료 smoke 범위로 남긴다.
- 초기 draft/publish는 사용자가 Development SQL Editor에서 실행했고, 최종 coexistence와 Production publish는 기존 Supabase CLI 인증 및 명시적 project ref로 적용했다. 두 환경의 routing readback과 rollback SQL을 보존했다.
- reasoning별 실제 응답 품질·지연·토큰 사용량은 계정과 프롬프트에 따라 달라진다. 유료 호출 없이 요청 계약만 검증했으므로 대표 글쓰기/보조 작업의 실제 비교는 별도 승인 범위로 남긴다.
- Development coexistence 적용 후 현재 `0.5.1` 앱은 의도대로 37-model legacy snapshot을 받는다. 새 39-model catalog의 앱 단위 검증에는 version이 `0.5.2`인 release candidate가 필요하다.
