# 카드뉴스 이미지 생성 중지 개발 기록

- 브랜치: `codex/feature/card-news-image-stop`
- 시작일: 2026-09-25
- 기준/부모 브랜치: `codex/feature/ai-generation-cancellation`
- 상태: 구현 완료, 사용자 수동 확인 대기

## 사용자 필요와 목표

카드뉴스 생성 결과를 카드별로 순차 표시하는 작업이 parent에 커밋되었다. 이제 카드뉴스 이미지 생성 중에도 작업을 중지할 수 있도록 한다. 일괄 생성과 개별 카드 생성 모두 카드뉴스 이미지 영역에서 중지 상태를 알리고, 이미 완성된 카드는 보존한다.

## 범위와 비범위

- 카드뉴스 생성 화면의 일괄 이미지 생성, 빈 이미지 일괄 생성, 개별 이미지 생성 중지.
- 기존 AI 작업 중지의 2단계 확인/계속 진행 패턴을 재사용한다.
- 작업 ID와 서버 측 취소 수명주기를 두어 브라우저 요청만 끊고 서버 AI 작업이 계속되는 문제를 방지한다.
- 취소되기 전에 완성된 이미지를 보존하고, 현재 미완성 및 이후 카드는 재시도 가능한 상태로 남긴다.
- KIE 작업은 로컬 폴링을 멈춰도 원격 이미지 작업이나 비용이 계속될 수 있음을 기존 안내 계약과 일치시킨다.

비범위:

- 카드 구성용 텍스트 AI 호출 중지.
- 외부 공급자의 원격 작업 강제 종료 또는 과금 취소 보장.
- 전체 `dev` 병합, 배포 및 유료 실모델 테스트.

## 제안 설계와 영향 경계

- `src/ui-api/services/card-news.service.js`에서 공유 AI operation manager에 카드뉴스 전용 lease를 제공하고, 비동기 시작/조회/중지 경로를 카드뉴스 API에 연결한다.
- `src/card-news/generation-service.js`는 `AbortSignal`을 이미지 transport에 전달하고 이미지 단위 경계에서 취소를 확인한다. 이미 manifest에 커밋된 이미지는 보존한다.
- `ui/scripts/features/card-news/source-preview.js`는 이미지 확인 영역에서 operation 상태를 반영한다. 일괄 동작 버튼과 개별 카드 버튼은 작업 중 정지/확인/계속 상태로 전환하고, 기존 카드별 진행 표시를 유지한다.
- 모델별 로직이 아니라 기존 공통 AI 취소/operation 경계를 재사용할 수 있는지 먼저 확인한다. 별도 operation 소유자를 추가하더라도 다른 surface로의 확장을 막지 않도록 카드뉴스 업무 규칙은 카드뉴스 서비스 경계에 둔다.

## 단계

1. 공유 operation manager와 transport 취소 경계 조사, API 계약 확정.
2. 서버 이미지 작업의 비동기 시작/조회/중지 및 취소 시 manifest 안정성 구현.
3. 카드뉴스 영역의 확인/계속/중지 UI 연결과 일괄/개별 처리.
4. 서비스·라우트·브라우저 회귀 검사, 사용자의 수동 검증.

## 결정 및 트레이드오프

- 2026-09-25: 점진 표시 작업은 `e0e932ec`로 parent에 커밋했다. 사용자는 순차 표시를 확인하고 카드뉴스 중지를 다음 단계로 진행하기로 했다.
- 중지는 클라이언트 `fetch`만 abort하는 방식으로 끝내지 않는다. 서버 작업이 계속되지 않게 신호가 이미지 transport까지 전달되어야 한다.
- KIE 취소는 로컬 추적 중지와 원격 작업 취소/비용 환급을 구분해서 표현한다.
- 개별 중지에도 일괄 중지와 같은 2단계 확인/계속 진행을 사용한다. `confirmingStop`은 UI state에 두어 상태 폴링이나 카드 재렌더링이 확인 단계를 지우지 않게 한다.

## 진행 및 검증

- 시작 시점 확인: parent `codex/feature/ai-generation-cancellation`의 working tree는 깨끗했고, 마지막 커밋은 `e0e932ec`였다.
- `src/card-news/generation-service.js` 이미지 처리에 `AbortSignal`을 전달하고, 각 카드 단위에서 중지를 확인한다. 취소 시 현재/이후 카드는 실패로 표시하지 않으며 이미 manifest에 저장된 카드는 보존한다. KIE 등 외부 작업은 로컬 대기 중지가 원격 작업이나 비용을 취소하지 않을 수 있음을 안내한다.
- 카드뉴스 서비스가 공유 AI operation manager를 사용해 비동기 시작/상태 조회/중지 API를 제공한다. 카드뉴스 service 경계에 한 번에 하나의 이미지 작업만 허용하는 lease를 두어 동시 manifest 쓰기를 막는다.
- 일괄/빈 이미지 생성은 공통 영역의 버튼이 중지 UI로 바뀌고, 개별 생성은 해당 카드 버튼이 중지 UI로 바뀐다. 둘 다 2단계 확인 및 계속 진행을 지원하며, 확인 상태는 폴링 중 유지된다. 중지 후 완료된 이미지는 보존된다.
- 사용자 재확인에서 개별 카드의 중지/계속 진행 버튼이 스크린샷에 보이지 않는 결함이 확인됐다. 진행 오버레이가 카드별 AI 버튼을 덮는 것이 원인이었다. 중지 control은 별도 오버레이 action bar 대신 원래 AI 버튼의 action slot을 이어받도록 변경하고, 폴링 이후에도 활성 카드의 action row가 노출되게 했다. 브라우저 smoke에 개별 중지의 2단계 확인/계속/중지 검증을 추가했다.
- 사용자 UI 피드백을 반영해 개별 중지 control을 시작 버튼과 같은 높이로 두고, 단일·일괄 중지 모두 compact ghost danger 위계로 낮췄다. 넓은 배경/테두리 바는 제거했다.
- 후속 디자인 검토에서 카드 내 중지 버튼의 넓은 action bar가 위압적으로 보인다는 피드백을 받았다. Carbon/Primer의 danger 위계와 WCAG hover/focus 원칙을 참고해 중지를 낮은 강조의 ghost danger action으로 정의하고, hover-only는 idle 보조 action에만 허용하며 진행 중 stop은 계속 노출하는 규칙을 디자인 가이드에 반영했다. Blog Beta와 Card News의 개별 이미지 중지 UI를 같은 action slot/compact variant로 맞췄다.
- 집중 검증 통과: 카드뉴스 서버·서비스·라우트 및 셸 단위 테스트 57/57, 추가 Blog Beta·Card News UI 계약 테스트 54/54, UI 파일과 smoke 스크립트의 `node --check`, `git diff --check`.
- `npm run test:ui-browser`는 카드뉴스 점진 표시와 일괄 및 개별 중지(2단계 확인/계속/중지, compact danger 스타일, 시작 버튼과 같은 높이) 시나리오를 통과했다. 전체 smoke는 이후 기존 블로그 발행 대상 검사(`scripts/test-ui-browser-smoke.js:3544`)에서 실패했다(워드프레스 대상 라디오 선택이 반영되지 않음). 이 실패는 본 UI 변경과 무관한 기존 회귀 이슈로 분리한다.
- 실 AI 호출을 사용한 수동 검증은 미실행. 사용자는 카드뉴스 이미지 영역에서 전체/빈 이미지/개별 이미지 생성 각각에 대해 중지 확인, 계속 진행, 실제 중지를 확인해야 한다. 특히 KIE 사용 시 이미 접수된 요청과 비용은 계속될 수 있다.
- 이 단계는 `feat: add cancellable card news image generation`으로 커밋한다. 사용자의 수동 UI 확인 후 parent 병합 여부를 진행한다.
