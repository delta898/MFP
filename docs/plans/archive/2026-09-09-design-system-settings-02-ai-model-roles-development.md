# Settings Beta AI 모델 역할 개발 기록

## Branch

- Branch: `codex/feature/design-system-settings-02-ai-model-roles`
- Base/parent branch: `codex/feature/design-system-settings-main`
- Start date: 2026-09-09
- Status: 완료 — parent 통합 준비 완료

## 사용자 필요와 목표

Settings Beta의 `AI` top menu를 기존 설정의 단순 복사 없이, BlogGenius 안에서 AI가 맡는 역할 중심으로 재구성한다. 세부 화면은 하나의 목적만 가진 경우 local sub-menu를 추가하지 않는 기준을 적용하고, 공통 Settings card anatomy와 요약→상세 이동을 재사용한다.

## 범위

1. AI 역할 화면: 글쓰기 모델, 이미지 모델, 보조 대화 모델
2. 각 역할의 준비도 summary 및 해당 detail card로의 이동
3. 기존 AI model catalog, credential, connection test와 config schema의 안전한 재사용
4. 보조 대화 모델의 `글쓰기 모델 사용` 및 `별도 모델 사용` 선택
5. Settings IA·component guide의 local sub-menu 및 AI 역할 기준 현행화

## 비범위

- 기존 `설정 > AI` 화면의 제거 또는 변경
- AI provider·model catalog 자체의 변경
- AI 생성 요청 또는 유료 AI 호출
- MCP Remote Server UI migration (후속 `앱 > 고급 연결` 단계)
- release, tag, push

## 설계와 결정

- top menu는 provider가 아니라 사용 목적을 표현한다. 모델의 실제 provider, model, credential은 각 역할 card 내부에서 관리한다.
- local sub-menu는 같은 top menu 아래 독립적으로 이동·비교할 목적이 둘 이상 있을 때만 추가한다. AI의 현 단계는 단일 `모델 역할` 목적이므로 local sub-menu를 만들지 않는다.
- summary는 글쓰기, 이미지, 보조 대화 모델과 1:1로 대응한다. 클릭하면 해당 card에 scroll/focus한다.
- `보조 대화 모델`은 기본으로 글쓰기 모델을 상속하며 별도 설정을 선택한 경우에만 독립 credential·model editor를 노출한다.
- 변경값은 사용자의 `연결 확인` action에서 scope별로 seamless 반영하고, 정상 성공은 badge와 summary로만 표현한다. feedback은 예외·실패만 표현한다.

## 구현 단계

1. 공통 model-role card primitive와 UI skeleton
2. scoped settings API 및 기존 model catalog/test 경로 연결
3. 상태·summary·loading·secret field 계약
4. focused contract/browser smoke 및 사용자 UI 검토

## 검증 계획

- Settings Beta AI structure 및 accessibility contract
- scoped AI settings API contract 및 기존 config 보존 test
- AI role summary·detail 이동, source switch, validation/loading focused browser smoke
- 유료 생성 없이 connection-test fixture 기반 UI smoke
- 사용자 hands-on UI 확인

## 진행 기록

- 2026-09-09: AI는 `글쓰기 모델`, `이미지 모델`, `보조 대화 모델`의 단일 역할 화면으로 시작하기로 합의했다.
- 2026-09-09: 기존 AI 화면에 있던 MCP remote server는 AI model 역할과 성격이 달라 후속 `앱 > 고급 연결` 단계로 분리하기로 했다.
- 2026-09-09: 단일 목적에는 local sub-menu를 만들지 않는 기준을 canonical IA와 component guide에 반영했다.
- 2026-09-09: 세 역할의 readiness summary와 shared settings-card detail을 구현했다. AI 역할별 provider/model/credential editor와 Chat의 글쓰기 모델 상속·별도 모델 전환을 추가했다.
- 2026-09-09: 기존 major settings 전체 저장 대신 `/api/v1/settings/ai-roles`의 scope 저장을 추가해 다른 config 영역을 보존한다.
- 2026-09-09: focused unit/contract 및 browser smoke를 통과했다. browser smoke 중 Chat 전용 editor의 hidden CSS 충돌을 발견해 `[hidden]` 우선 규칙으로 보정했다.
- 2026-09-09: AI summary 세 장은 desktop 1×3 grid로, model editor는 preset/direct 모두 같은 2×2 slot으로 정리했다. 재사용 가능한 Settings field control pattern을 추가해 native dropdown/input 모양을 제거했다.
- 2026-09-09: AI API Key를 기존 WordPress secret 계약과 일치시켰다. Settings Beta는 등록 여부만 읽고 새 입력값만 보기/숨기기하며, 확인은 browser payload가 아닌 서버에 반영된 역할 설정으로 수행한다.
- 2026-09-09: model grid의 도움말 slot을 모든 field에 예약해 provider 전환 시 다음 row가 출렁이지 않게 했다. Google은 example 대신 실제 Gemini API endpoint를 read-only로 표시한다.
- 2026-09-09: Blog Beta에서 검증한 native select arrow shell을 `ui-select-shell` 공통 pattern으로 승격했다. Blog Beta와 Settings Beta는 동일한 wrapper·padding·arrow 규칙을 참조하며 feature 이름의 복사본을 두지 않는다.
- 2026-09-09: AI와 기본 연결 card의 field typography를 `.ui-settings-field`과 `.ui-settings-field-grid`로 단일화했다. AI 공급자·모델·endpoint·credential·상속 source 전환은 이전 연결 확인 feedback과 verification을 즉시 무효화한다.
- 2026-09-09: 기존 설정의 역할별·공급자별 AI profile을 Settings Beta에도 안전하게 복원했다. read API는 provider별 model·endpoint·key 등록 여부만 전달하며 원문 key는 전달하지 않는다. 전환한 provider에 등록된 key가 있으면 빈 input으로도 연결 확인을 수행한다.
- 2026-09-09: 보조 대화 모델의 source radio를 `.ui-settings-choice-group` 공통 pattern으로 승격했다. legend와 option은 Settings field와 같은 label typography를 사용하고, 설명만 caption density로 유지한다.
- 2026-09-09: 글쓰기 모델을 상속하는 보조 대화 모델의 안내문을 source role 변경 event와 함께 다시 계산하도록 보정했다. 모델을 A에서 B로 바꾸면 안내문도 즉시 B를 반영한다.
- 2026-09-09: AI 역할 card의 변경을 Settings Beta 공통 dirty scope에 연결했다. 연결 확인 전 이탈하면 변경한 AI 역할명을 포함한 discard 확인을 보이고, 연결 확인 성공 시에만 해당 dirty scope를 해제한다.
- 2026-09-09: 전체 unit suite(1,546 pass, 1 skip, 0 fail)와 Settings Beta focused contract, fixture 기반 browser smoke(239 requests)를 통과했다. 유료 AI 호출 없이 provider profile 복원, secret 비노출, 검증 무효화, 이탈 확인을 자동 검증했다.

## 최종 결과와 검증

- Settings Beta의 AI는 provider 중심이 아닌 역할 중심의 단일 목적 화면으로 완성됐다. 세 역할은 같은 summary, card, field, choice, select pattern을 공유한다.
- 역할·공급자별 profile과 credential 등록 상태를 보존하며, raw API Key는 read API와 UI에 노출하지 않는다.
- provider/model/source/endpoint/credential 변경은 이전 검증 결과를 즉시 무효화하고, 연결 확인 성공만 해당 role의 변경 상태를 확정한다.
- 자동 검증: `npm run test:unit` (2026-09-09, 1,546 pass / 1 skip / 0 fail), `npm run test:ui-browser` (239 fixture requests), Settings Beta focused API·structure contract.
- 수동 확인: 사용자가 AI 역할 전환, credential 등록 표시, 보조 대화 모델 상속, 이탈 확인 흐름을 검토했다.
- 남은 위험: 실제 외부 AI provider 연결은 API Key를 가진 사용자 환경에서 별도로 확인해야 하며, 이 stage에서는 유료/외부 호출을 실행하지 않았다.

## 위험과 후속 결정

- 기존 major settings 저장은 전체 payload를 다루므로 Settings Beta는 AI role scope만 갱신하는 별도 contract가 필요하다.
- Chat Model은 여러 기능이 참조하므로 글쓰기 모델 상속 상태와 별도 모델 상태를 명확히 구분해야 한다.
