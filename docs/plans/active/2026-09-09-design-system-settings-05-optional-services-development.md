# Settings Beta 부가 서비스 개발 기록

## Branch

- Branch: `codex/feature/design-system-settings-05-optional-services`
- Base/parent branch: `codex/feature/design-system-settings-main`
- Start date: 2026-09-09
- Status: 구현 및 자동 검증 완료 · 사용자 UI 확인 대기

## 사용자 필요와 목표

여러 기능에서 선택적으로 공유하는 외부 서비스를 Settings Beta의 한 곳에서 목적별로 관리한다. Buffer는 SNS·카드뉴스 발행, Bitly는 Telegram 알림·SNS 자동 발행과 향후 카드뉴스 URL 단축, Telegram은 알림·MCP, Slack은 알림에 사용한다. 기존 Settings Beta의 공통 card anatomy, 상태·action 배치, seamless 저장과 secret 정책을 복사하지 않고 재사용한다.

## 범위

1. `부가 서비스`의 `SNS 배포 / 메시지·알림 / 링크 단축` local navigation
2. Buffer, Telegram, Slack, Bitly의 readiness summary와 detail card
3. provider별 설정 read/update/connection test를 Settings Beta scoped API로 연결
4. 저장된 secret 비노출·새 입력만 보기/숨기기·빈 입력 시 기존 값 유지
5. 기존 config와 runtime 소비자를 유지하면서 Bitly의 공통 소유권을 UI와 service boundary에 반영
6. 공통 Settings card/controller와 style token 재사용 및 focused UI/domain/browser 검증

## 명시적 비범위

- SNS·카드뉴스·Telegram·Slack 기능 자체의 재설계
- 자동 발행 활성화, 주기 또는 콘텐츠별 선택을 부가 서비스 연결 카드로 이동
- 새 provider 추가
- 기존 `설정` 화면 제거
- parent merge, release, tag, push

## 합의한 설계

- local menu는 provider가 아니라 사용 목적을 표현한다.
- `SNS 배포`는 Buffer 연결과 사용 가능한 organization/channel을 관리한다.
- `메시지·알림`은 Telegram과 Slack을 함께 보여주되 각 서비스의 실제 역할과 상태를 구분한다.
- `링크 단축`은 Bitly를 Telegram에 종속시키지 않고 여러 기능이 참조하는 공통 연결로 표현한다.
- 연결 설정과 각 기능의 실행·자동화 설정을 섞지 않는다.
- secret과 action lifecycle은 Settings Beta 공통 계약을 그대로 따른다.

## 구현 단계

1. 기존 설정 값·runtime·test API와 Settings Beta 공통 component 경계 조사
2. 부가 서비스 scoped read/write/test 계약 추가
3. 목적별 navigation, summary, detail card UI 연결
4. secret·dirty state·async feedback·stable footer 동작 통합
5. canonical IA와 design/component 규정 현행화
6. focused unit/UI contract와 browser smoke 후 사용자 확인

## 검증 계획

- 각 local menu와 summary-to-detail 이동이 일관된지 확인
- 저장된 secret 원문·일부 마스킹값이 client payload에 포함되지 않는지 확인
- 새 secret 입력과 빈 입력의 유지 의미가 구분되는지 확인
- test 중 상태·button 위치가 이동하거나 중복 표시되지 않는지 확인
- Buffer channel 선택, Telegram/Slack test, Bitly test가 기존 runtime과 회귀 없이 연결되는지 확인
- 관련 focused unit/UI contract 및 browser smoke

## 진행 기록

- 2026-09-09: 사용자가 목적 기반 `SNS 배포 / 메시지·알림 / 링크 단축` 구조를 승인했다.
- 2026-09-09: Buffer는 SNS·카드뉴스, Bitly는 Telegram·SNS 자동 발행과 향후 카드뉴스, Telegram은 알림·MCP, Slack은 알림에 사용한다는 실제 관계를 확인했다.
- 2026-09-09: 목적 기반 local menu와 Buffer, Telegram, Slack, Bitly scoped read/write/test 계약을 구현했다. 기존 JSON schema를 유지하며 read API는 secret 등록 여부만 반환한다.
- 2026-09-09: WordPress와 AI에 있던 secret visibility 동작도 공통 controller로 통합해 Settings Beta 전체가 같은 credential interaction을 사용하도록 고도화했다.
- 2026-09-09: Buffer의 Organization·발행 채널 선택은 부가 서비스 설정의 책임이 아니라 SNS 자동 발행·카드뉴스 실행의 책임으로 재정의했다. Settings Beta Buffer card는 API Key와 연결 검증만 관리하며 기존 실행 대상 값은 보존한다.
- 2026-09-09: AI card에만 있던 heading/body spacing 예외를 공통 settings-card pattern으로 옮겼다. 모든 Settings Beta 연결 card는 같은 header-to-body 간격을 사용하며, 글쓰기 card의 별도 density는 명시적 custom property로 유지한다.
- 2026-09-09: 정상 연결 상태는 header badge 하나로 유지하고, 연결 확인에서 얻는 Organization·channel 수 같은 한 줄 참고 사실은 공통 `footer detail slot`으로 분리했다. 이후 사용자 확인에서 연결 확인 실패도 같은 operation의 terminal result임을 확정해, 성공·실패 모두 footer detail slot에 두고 field-level validation과 다단계 안내만 body feedback으로 유지하도록 규정을 보완했다.
- 2026-09-09: footer detail이 비어 있을 때도 action의 오른쪽 anchor가 유지되도록 공통 footer action group을 도입했다.
- 2026-09-09: Telegram과 Slack의 `사용` checkbox는 연결 설정의 책임이 아니라 발송·수신 runtime 활성화와 섞여 있음을 확인했다. 메시지·알림 card는 credential·Chat ID·Webhook과 연결 확인만 소유하도록 정리하고, 기존 runtime 활성화 값은 보존한다. Telegram 수신과 원격 MCP는 다음 `앱 > 외부 연결` 단계에서 독립 inbound adapter로 다룬다.
- 2026-09-09: Telegram·Slack 연결 card 범위의 focused unit/UI contract 14개는 통과했다. fixture browser smoke는 메시지·알림 card에 도달하기 전, 기존 Blog Beta 자동 발행 checkbox의 focus-ring assertion에서 실패했다. 해당 failure는 이번 변경과 무관하므로 별도 UI regression 정비 대상으로 남긴다.
- 2026-09-09: 잘못된 Telegram Chat ID가 HTTP 400만 노출하던 사례를 확인했다. Telegram API의 안전한 오류 범주를 `Chat ID 확인`, `Bot Token 확인`, 일시적 제한·통신 재시도로 번역하고, 카드 badge와 danger footer detail로 함께 표시하도록 수정했다.
- 2026-09-09: Bitly도 같은 secret·검증 카드이므로 footer detail slot과 오른쪽 action group을 적용했다. 이제 Buffer, Telegram, Slack, Bitly 모두 연결 확인의 성공·실패 결과를 같은 위치에 표시한다.

## 현재 결과와 남은 확인

- `부가 서비스`는 `SNS 배포 / 메시지·알림 / 링크 단축` local menu로 구현됐다.
- Buffer, Telegram, Slack, Bitly는 기존 `config.json`을 그대로 사용하되 provider별 scoped read/write/test API만
  추가했다. read 응답은 secret 원문이나 부분값을 포함하지 않는다.
- Buffer, Telegram, Slack, Bitly는 연결 credential과 연결 확인만 card로 관리한다. Telegram·Slack 사용 여부는 이
  화면에서 변경하지 않으며, 메시지·알림에는 두 연결의 readiness summary를 제공한다.
- `연결 확인`은 동일한 Settings Beta 계약대로 scope 값을 먼저 seamless 반영한 뒤 외부 연결을 검증한다. 외부
  검증만 실패하면 반영값을 되돌리지 않고 `입력값은 반영됨 · …` footer detail을 danger tone으로 제공한다.
- Buffer 연결 확인은 선택 control 없이 Buffer API 접근만 검증하고, 확인 결과에서 Organization 수와 조회된 채널 수를
  읽기 전용 footer detail로만 알린다.
- focused unit/contract: 16 passed. browser UI smoke는 메시지·알림 card에 도달하기 전 기존 Blog Beta 자동 발행
  checkbox focus-ring assertion에서 실패했으며, 이번 stage와 별개로 남아 있다.
- 남은 수동 확인: 실제 Buffer/Telegram/Slack/Bitly credential로 각 연결 확인, 실패 시 badge·footer detail의
  다음 행동 안내, 좁은 화면에서 local tab과 card density 확인.
