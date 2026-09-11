# SNS 디자인 시스템 이관 개발 기록

## Branch

- Branch: `codex/feature/design-system-sns-12`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-11
- Status: 진행 중

## 사용자 필요와 목표

SNS 즉시 발행은 짧은 글을 채널에 공유하는 단순한 작업이지만, 현재 화면은 compatibility
스타일과 독자 CSS에 남아 있다. Blog Beta와 쇼핑커넥트에서 정착한 제목 영역·입력·선택 카드·행동
패턴을 재사용해, 같은 제품 안의 일관된 발행 경험으로 정리한다.

## 범위

- 발행 채널 → 내용 작성 → 이미지 추가(선택) → 발행의 순서를 유지한다.
- `view-social`을 compatibility containment에서 분리하고 semantic token을 사용한다.
- 채널 선택 카드, 작성 영역, 이미지 입력/미리보기, 하단 발행 행동을 공통 component pattern으로 이관한다.
- 기존 Buffer 발행 API, 이미지 업로드, 채널 저장, AI 최적화의 동작 계약은 유지한다.
- Settings Beta의 `부가 서비스 > SNS 배포`에 Buffer 연결과 RSS 기반 블로그 자동 공유를 순서형
  카드로 제공한다.

## 명시적 비범위

- SNS를 Blog Beta/Shopping의 글감·대기열 lifecycle에 강제로 편입하지 않는다.
- Buffer 연결과 채널 등록 설정을 이 작업에서 옮기거나 변경하지 않는다.
- 실제 Buffer 발행이나 외부 데이터 변경을 자동 검증하지 않는다.

## 설계 결정

- 발행 채널을 가장 위에 둔다. 채널 선택은 글자 수와 이미지 제약을 결정하므로, 작성보다 먼저
  선택해야 피드백과 AI 최적화의 기준이 일관된다.
- 상위 탭은 추가하지 않는다. SNS에는 현재 하나의 즉시 공유 작업만 있으므로 탭은 중복된 구조다.
- 공통화 대상은 화면 구조와 상태 표현이다. SNS의 즉시 발행 모델은 독립적으로 유지한다.
- `SNS 배포` 내부에 하위 탭을 추가하지 않는다. Buffer 연결은 자동 공유의 선행 조건이므로,
  `Buffer 연결 → 블로그 자동 공유` 카드 순서가 더 짧고 명확하다.
- 자동 공유는 Blog Beta 글쓰기 lifecycle의 직접 후속 처리로 재해석하지 않는다. 기존처럼 선택한
  블로그 채널의 RSS를 주기적으로 확인하는 SNS distribution 계약을 유지한다.
- SNS 배포 설정은 broad legacy major-settings 저장을 호출하지 않고, 부가 서비스의 scoped API에
  `sns-distribution` scope를 추가해 저장한다.

## 단계

1. SNS-01: 화면 구조와 semantic style token 이관
2. SNS-02: 비활성·loading·성공/실패 피드백의 공통 패턴 정렬
3. SNS-03: 설정 Beta 안내 경계 정리(필요할 때만)
4. SNS-04: RSS 기반 자동 공유 설정을 SNS 배포 카드로 이관

## 검증 계획

- SNS 화면 structure/style contract 추가 또는 갱신
- 기존 SNS 동작 모듈의 focused test
- 완료 시 브라우저 fixture 회귀는 사용자 승인 후 실행

## 진행 기록

- SNS 작성 화면에 공통 패널 도입부를 추가하고, 발행 채널을 첫 작업 영역으로 유지했다.
  채널은 최대 3개라는 제약을 제목 가까이에 표시한다.
- 동적으로 생성되는 채널 항목은 `ui-selectable-card`와 그 copy pattern을 사용하도록 바꿨다.
  선택·비활성화·발행 중 상태의 기존 동작은 유지한다.
- `view-social`의 compatibility containment를 제거하고, `social.css`의 legacy token 참조를
  semantic token으로 교체했다. 따라서 compatibility의 파란 palette를 SNS 화면에 상속하지 않는다.
- 채널 설정 안내는 legacy 설정 화면이 아니라 `설정 Beta > 부가 서비스 > SNS 배포`로 이동한다.
  설정 Beta의 상위/하위 탭을 함께 활성화해 사용자가 해당 연결 화면에 바로 도착하게 한다.
- 메시지 입력은 기본 6줄·168px로 명시해, browser 기본 rows 계산이나 다른 textarea 규칙에 따라
  불필요하게 커지지 않게 했다. 필요하면 textarea의 기존 세로 resize로 더 크게 작성할 수 있다.
- 빈 글자 제한 상태는 높이를 차지하지 않게 접고, 내용 작성 section의 하단 padding도 줄여 이미지
  선택 영역과의 불필요한 공백을 제거했다. 제한 초과 등 상태가 생길 때만 해당 안내가 다시 표시된다.
- 단일 목적 화면에 top/local tab을 맞추기 위해 추가하지 않으며, page header가 이미 설명한 SNS 즉시 공유
  목적을 composer card 안에서 반복하지 않도록 panel lead를 제거했다. 이 hierarchy 원칙은
  `docs/architecture/settings-information-architecture.md`에 추가했다.
- 작성 영역, 이미지 추가 영역, 결과 영역, 하단 발행 행동은 Blog Beta/Shopping과 같은
  surface·border·focus·action token을 사용한다. 기존 직접 발행 API와 이미지 처리 코드는 바꾸지 않았다.
- `SNS 배포`에는 중첩 tab 대신 `Buffer 연결`, `블로그 자동 공유` 카드가 순서대로 표시된다.
  자동 공유 카드는 Buffer가 연결되지 않으면 비활성화되며, 연결 확인 뒤 작업 공간과 최대 세 개의
  SNS 채널을 선택할 수 있다.
- `sns-distribution` scoped optional-service API는 기존 RSS runner가 사용하는 Buffer 작업 공간,
  채널, 자동 공유 활성화, RSS 원본 블로그를 함께 저장한다. legacy major-settings 저장을 통하지 않으며,
  저장 뒤 자동 실행 runtime을 현재 설정으로 동기화한다. 기존 반복 주기와 AI 처리 설정은 변경하지 않는다.
- 작업 공간을 바꾸면 해당 작업 공간의 채널만 다시 불러오며, 자동 공유 활성화 상태에서는 Buffer 연결,
  작업 공간, SNS 채널 하나 이상, RSS 원본 블로그 하나 이상을 모두 검증한다.
- 외부 Buffer 후보는 처음부터 select로 노출하지 않는다. `작업 공간 불러오기`를 명시적으로 실행한 뒤,
  작업 공간이 하나면 자동 선택하고 여러 개일 때는 같은 dropdown에서 선택한다. 요약 card는 dropdown과
  중복되므로 두지 않으며, 다시 조회는 같은 control의 `다시 불러오기` 행동으로 표현한다.
- `작업 공간 불러오기`는 Buffer 연결 확인과 분리된 discovery 행동이다. 한 작업 공간은 즉시 채널까지
  표시하고, 여러 작업 공간일 때만 선택을 받은 뒤 그 작업 공간의 채널을 다시 불러온다. 다시 불러올 때는
  이전 채널 선택을 비워 오래된 채널 구성을 저장하지 않게 했다.
- 자동 공유의 작업 공간·채널은 RSS 자동 공유 정책에만 속한다. SNS 수동 발행은 다음 단계에서 같은 Buffer
  연결을 사용하되, 자신의 작업 공간·채널을 선택하도록 분리한다. 자동 공유 card는 문맥이 충분하므로 action을
  `저장` / `저장 중...` / `저장했습니다.`로 간결하게 표현한다.
- SNS 메뉴는 Buffer 연결 여부만 읽고, 진입 시 외부 후보를 자동 조회하지 않는다. 사용자가 `작업 공간 불러오기`를
  누르면 한 작업 공간은 즉시 선택하고 여러 작업 공간일 때만 selector를 보여 준다. 수동 발행·AI 최적화·실제 발행은
  선택한 작업 공간의 Buffer 채널을 서버에서 다시 확인하므로, 자동 공유나 이전에 저장한 채널을 신뢰하지 않는다.
- Settings Beta와 SNS 메뉴는 작업 공간의 별도 요약 영역을 두지 않는다. 두 화면 모두 `Buffer 작업 공간`
  dropdown과 `작업 공간 불러오기`/`다시 불러오기`만을 같은 한 줄 control로 제공한다.
- SNS 메뉴 재진입은 Buffer 연결 상태만 갱신한다. 같은 앱 세션에서 사용자가 이미 불러온 작업 공간과
  채널 목록은 유지하고, 연결이 해제된 경우 또는 사용자가 `다시 불러오기`를 실행한 경우에만 목록을 비운다.
- SNS 전용 structure/style contract, Settings Beta contract, scoped API unit test, 디자인 시스템 contract,
  JavaScript syntax, diff 검증과 브라우저 fixture 회귀를 통과했다. 현재 focused 검증은 63개다. 실제 Buffer
  연결과 RSS 자동 공유는 외부 상태를 변경하므로 사용자 수동 확인이 남아 있다.
