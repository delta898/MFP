# Telegram 자연어 대화 경로 단일화

- Branch: `codex/feat/telegram-conversation-routing`
- Start date: 2026-10-14
- Base/parent branch: `codex/fbr/telegram-conversation-enhancement` (`eddc2f5`)
- Status: 구현 및 parent 통합 완료; 전체 unit/UI 검증 통과; `dev` 통합 준비 완료
- Parent plan: [Telegram 대화 경험 고도화 FBR](2026-10-13-telegram-conversation-enhancement-fbr.md)

## 사용자 필요와 목표

Telegram에서 짧은 대화, 일반 질문, BlogGenius 기능 요청이 서로 다른 정규식·parser·fallback으로 처리되어 사용자의 의도를 놓치거나 같은 메시지를 두 번 분류하는 문제를 줄인다. 사용자가 원하는 것은 고정된 키워드 반응만이 아니라 대화에 맞는 답변과 능력 선택이며, 더 나은 선택지가 있을 때는 이유를 짧게 덧붙여 제안할 수 있어야 한다.

## 범위

- 자연어 메시지 해석의 단일 진입점과 단일 parser 응답 계약을 정의하고 적용한다.
- 응답 계약이 일반 답변 또는 실행 요청을 구분하고, 실행 요청은 기존 Agent Registry/Planner/Runtime 또는 보존된 레거시 실행 adapter로 전달한다.
- 직접 답변에 유용한 제안·권유를 포함할 수 있게 한다. 제안은 요청한 결과를 대신하거나 사용자의 승인 없이 실행하지 않는다.
- `/start`, `/help` 등 명시적 slash command, 사용자 허용 확인, 권한·schema 검증, 확인 대기/callback, 외부 실행 동작을 보존한다.
- 기존의 발행·글감·설정·작업·조회 요청이 새 공통 경로를 통해 동일하게 처리되는지 focused contract test로 확인한다.

## 명시적 비목표

- 일반 웹 조사 provider 또는 새 knowledge capability 추가
- 기억 보존·승격 정책의 구현, 사용자 기억 관리 UI
- capability 권한 확대, 자동 실행/확인 정책 변경
- legacy 실행 adapter를 포함한 모든 Telegram capability의 단일 registry 이관
- 그룹/채널 대화 지원 확대, Telegram UI redesign
- 전체 단위 테스트 실행(부모 feature를 `dev`에 병합하기 전 승인 후 수행)

## 조사 결과와 현재 경로

현재 `src/telegram-bot.service.js`의 inbound handler는 slash command를 직접 처리한 뒤 greeting regex에 매칭되는 문장을 바로 답한다. 그 외 자연어는 발행·글감 정규식에 따라 legacy parser로 우회하거나 Agent deterministic/LLM parser로 진입한다. Agent parser가 빈 action을 반환하면 `Core.parseTelegramRequest`가 다시 LLM 분류를 수행한다. 따라서 한 메시지에 parser 호출이 둘 생길 수 있고, 마지막에 action이 비면 “의도를 정확히 파악하지 못했습니다”로 끝난다.

Agent parser 응답은 capability action envelope이며 자유 대화 답변을 표현하지 않는다. Core parser 응답은 `register_topic`, `publish_article`, `update_config`, `run_job`, `query_data` 형태의 별도 legacy action contract다. legacy dispatcher는 글감/발행 확인 keyboard, 설정/작업 확인, 데이터 조회 등 기존 사용자 동작을 계속 처리한다.

관련 코드 및 테스트:

- `src/telegram-bot.service.js`: inbound routing, Agent 처리, legacy dispatcher
- `src/agent/telegram-parser.js`: deterministic parser 및 Agent action envelope parser
- `src/core.js`: legacy `parseTelegramRequest` action contract
- `src/channels/telegram/conversation-routing.js` 및 `.test.js`: 현재 greeting shortcut
- `src/agent/content-request-mapper.js`: legacy 콘텐츠 요청을 기존 capability에 매핑

## 제안 설계

1. inbound authorization과 slash command 처리 뒤 자연어 메시지는 공통 router로 들어간다.
2. router는 상태/형식 검증에 필요한 deterministic shortcut을 허용하되, 나머지 자연어를 하나의 모델 parser에 한 번만 보낸다.
3. parser는 버전이 있는 discriminated result를 반환한다. `reply`에는 직접 답변과 선택적 제안, `actions`에는 기존 등록 capability 또는 명시된 legacy adapter contract가 들어간다. 빈 결과는 오류와 구분한다.
4. 사용자에게 보여주는 직접 답변은 우선 요청에 응답한다. 추가 제안이 있을 때만 이유와 함께 별도로 표현하며, 실행은 사용자의 요청/확인 경계를 따른다.
5. action은 공통 dispatcher가 기존 Agent Runtime 또는 레거시 실행 adapter로 전달한다. UI 메시지, confirmation, callbacks, side effects는 이 단계에서 새로 설계하지 않는다.
6. parser 실패, 무효 envelope, 미지원 요청은 구분 가능한 결과로 남긴다. parser 실패 시 두 번째 LLM parser로 재시도하지 않고 안전한 오류/확인 응답을 한다.

`Core.parseTelegramRequest`를 갑자기 삭제하지 않는다. 기존 action contract를 공통 parser의 한 route로 변환하고 downstream 실행 adapter를 유지해 회귀 위험을 제한한다. 이후 각 legacy capability의 registry 이관은 별도 단계로 다룬다.

## 사용자와 합의한 방향

- 2026-10-14: “대화 route 단일화”를 첫 구현 slice로 진행한다.
- 사용자는 질문에 꼭 해당 답변만 할 필요가 없고, 더 나은 방법이 있으면 제안·권유·추천하는 쌍방향 대화를 원한다.
- 제안은 먼저 직접 요청에 답한 뒤 유용한 경우에 덧붙이며, 승인 없는 실행이나 원래 요청의 대체는 하지 않는 설계로 반영한다.
- 구현은 FBR 부모 branch에서 분리한 sub-feature branch에서 진행한다. 검증 완료 후 부모 병합 여부는 별도 명시 승인을 따른다.

## 진행과 검증

- 2026-10-14: inbound handler, Agent parser, legacy Core parser/dispatcher와 기존 greeting contract test를 조사했다.
- 2026-10-14: slash command와 허용 채팅 검사는 유지하고, 자연어 입력의 greeting shortcut 및 콘텐츠 regex 우회, Agent 처리 실패 뒤 `Core.parseTelegramRequest` 재호출을 제거했다. 비결정적 자연어는 unified route parser 한 번에서 `agent`, `legacy`, `reply`, `unsupported` 중 하나를 반환한다. exact deterministic shortcut은 기존 Agent Runtime으로 계속 전달한다.
- 2026-10-14: `reply`에는 직접 답과 선택적 제안을 담을 수 있다. 제안은 별도 문구로 보여주고 요청/확인 없이 실행하지 않는다. 대화형 답변은 Agent event store에 기록한다.
- 2026-10-14: legacy action route는 기존 콘텐츠 매퍼·dispatcher·confirmation callback을 재사용한다. 호환 action, job, query, 설정 키를 경계에서 확인해 기존 외부 실행 범위를 넘어서는 값을 거부한다. Core parser 함수는 다른 테스트/도구에서 쓰일 수 있어 삭제하지 않았다.
- 2026-10-14: capability help에 기존 글감/발행과 조회 기능을 더해 도움말이 일부 기능만 안내하던 차이를 줄였다. 정규식 greeting 전용 모듈과 사용되지 않던 Agent help 문구 모듈은 제거했다.
- 2026-10-14: 사용자는 이 routing slice를 0.6.1에 배포하고, 동적 capability 설명/가용성 및 core/plugin 구조 변경은 0.7.0 목표로 분리하기로 했다.
- Telegram hands-on에서 일반 요청이 capability 중심의 도움말로 분류되는 사례와 “글감 저장만” 요청이 대기열 성공으로 안내되는 사례를 확인했다. 이는 동적 capability 카탈로그와 부족한 입력을 되묻는 계약이 아직 없음을 보여준다. route 통합 자체에서 새 게시 대상을 자동 실행하도록 권한을 넓히지는 않았지만, legacy `register_topic` 실행은 기존처럼 행을 `발행 준비 완료`로 추가한다. 사용자는 이 의미/능력 정합성 문제를 0.7.0 구조·capability 작업으로 다루기로 했다.
- 자동화 테스트: parser route contract, legacy content mapper, Telegram renderer focused tests 총 7건 통과. `node --check`와 `git diff --check` 통과.
- 수동 확인: 사용자는 Telegram에서 인사·요청·글감 등록을 직접 실행했고 응답을 확인했다. 그 과정에서 stale help와 저장/대기열 의미 문제를 발견해 0.7.0 follow-up으로 분류했다. 배포 후보 수락 전에 설정/작업 확인, 조회, `/help` 및 callback도 확인한다.
- 구현 검증은 parser result contract와 주요 route의 focused unit/contract tests, 관련 UI/browser 흐름에 영향이 있을 때 해당 regression test로 한다.
- 전체 unit suite: 2,256 통과, 2 skip, 0 실패. 보안 audit은 별도.
- UI API smoke 2종, UI E2E, 브라우저 smoke 통과 (426 fixture 요청, 페이지 오류 0건).
- 최종 사용자는 Telegram에서 인사/일반 질문/기능 요청/확인 요청을 직접 확인한다.

## 남은 위험과 후속

- Agent와 legacy parser가 지원하던 capability 차이를 새 parser contract에서 빠짐없이 보존해야 한다.
- Capability 목록과 help 문구는 현재 parser prompt와 capability 구현에 별도로 존재한다. 제거된 기능 안내가 남을 수 있고, 실제 입력 요구/가용성/부작용과 불일치할 수 있다. 0.7.0 목표 구조에서 capability 자체 설명 계약과 runtime discovery로 다룬다.
- “글감 저장만”과 “발행 준비 대기열 등록”은 현행 legacy 실행에서 같은 등록 capability를 사용하고 등록 행을 `발행 준비 완료`로 기록한다. 기능 의미를 분리하고 필수 대상 정보가 모호할 때 질문하는 것은 이번 0.6.1 slice에 포함되지 않으며 0.7.0 설계에서 다룬다.
- 기존 비결정적 자유 대화는 새 `reply` route에서 직접 답변한다. 일반 조사 provider가 없으므로 조사한 척하지 않으며, 조사 기능은 이번 범위 밖이다.
- 일반 조사 provider가 없으므로 조사한 척하지 않으며, 조사 기능은 이번 범위 밖이다.
- 저장된 `user_insight`와 `last_topic`을 추가로 모델 요청에 넣는 시도는 자동 승인 검토에서 차단되어 적용하지 않았다. 차단 사유는 사용자 성향/최근 주제를 외부 모델에 더 전송하는 데 구체적 승인이 없다는 것이다. 현재 route는 이미 retrieval packet에 포함되는 최근 메시지·기억만 사용하며, 추가 개인 맥락 전송은 별도 사용자 결정이 필요하다.
- legacy 실행 adapter 제거와 capability registry 통합은 별도 후속 feature다.
