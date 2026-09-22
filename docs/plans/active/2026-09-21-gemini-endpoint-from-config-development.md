# Gemini Endpoint From Config Development Record

- Branch: `feat/gemini-endpoint-from-config`
- Base: `dev` (`8cd90ae`, v0.5.1)
- Start date: 2026-09-21
- Status: active; implementation and focused verification complete, awaiting hands-on/full-suite/merge instructions

## User Need

AI 빠른 생성에서 `Invalid URL` 오류가 간헐적으로 발생. 연결 확인은 통과하는데 실제 생성만 실패하고, 재시작하면 정상화됨.

## Root Cause

Gemini 호출이 `GEMINI_TEXT/IMAGE_ENDPOINT` 전역 주소(앱 시작 시 1회 계산)를 사용. 설정 저장 시 갱신되지 않아, 시작 시 비구글이었다가 중간에 구글로 바꾸면 빈 주소로 호출되어 `Invalid URL`. 확인은 실시간 설정값으로 검사해서 통과하는 mismatch.

## Goal

전역 주소 제거. 호출 시점의 모델 설정으로 주소를 만든다. Google transport 주소는 코드가 소유하고, 사용자 Base URL은 direct provider에서만 허용한다. 오류와 설정 활동만으로 저장 모델과 안전하게 정리된 요청 주소를 추적할 수 있게 한다.

## Scope

- `callGeminiText`/`callGeminiImage`: options의 baseUrl+modelCode(+provider 폴백)로 endpoint 구성, 없으면 명시적 오류
- 호출부 2곳에서 baseUrl/provider 전달
- 쓰기/기본값 제거: config-loader, settings-fields-runtime, constants
- 구글 base_url 비어있는 기존 설정은 표준 주소 폴백
- 날짜별 운영 로그와 Dashboard 활동 로그를 Electron/CLI별 동일 런타임 로그 폴더에 저장·조회
- 기존 `ROOT_DIR/logs/dashboard-activities.json`은 새 런타임 로그 폴더로 자동 이전
- Invalid URL 오류에 query/API Key를 제거한 요청 주소 포함
- `ai_model_role_saved` 활동에 역할·공급자·모델명·모델 코드·Chat source 기록
- 빠른 생성 실패 활동 meta에 사용한 텍스트 모델 문맥 기록
- 전역 endpoint와 존재하지 않는 `config/settings.js`에 의존하던 구형 `src/utils.js.test`를 실제 HTTP 호출 경계 테스트로 대체

## Non-goals

- 다른 provider 호출 경로 변경 없음
- dev 병합·push (사용자 지시 시에만)

## Verification Results

- 2026-09-22: feature branch를 최신 `dev`/v0.5.1 기준으로 fast-forward했다.
- Final focused endpoint/log/settings/publish regression: 83 passed.
- Security fix: `resolveGeminiEndpointFromConfig` — code-owned transports use the fixed Gemini address; custom base URLs only for direct. Tampered saved base_url can no longer exfiltrate the API key.
- Blocker fix: removed stale inner endpoint line in `callGeminiImage` retry loop (`ReferenceError: baseUrl is not defined` on every image call); added mocked-HTTP integration TCs asserting final URLs for both text and image paths.
- Regression coverage: text/image actual axios URL, tampered base URL, missing model code, Invalid URL safe diagnostic, shared runtime log path, legacy activity migration, saved-model activity metadata.
- Full unit suite before dev merge: pending, requires explicit user approval
- User hands-on: 구글 모델 전환 후 저장 → 재시작 없이 빠른 생성 확인

## Remaining Risks / Manual Checks

- 패키지 앱에서 `로그` 화면과 실제 진단 폴더에 같은 날짜 로그와 `dashboard-activities.json`이 생성되는지 확인한다.
- Google 텍스트 모델로 변경·저장한 직후 앱 재시작 없이 빠른 생성을 실행한다.
- 오류 재현 시 활동 이력의 저장 모델 정보와 날짜 로그의 안전한 요청 주소가 API Key 없이 남는지 확인한다.
