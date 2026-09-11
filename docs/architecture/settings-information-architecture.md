# 설정 정보 구조와 소유권

## 문서 상태

- Status: `설정 Beta`에서 적용 중인 canonical contract
- 적용 대상: 공통 설정, 각 기능의 local 설정과 override 설계
- 목적: 같은 값을 여러 화면에 복제하지 않고 사용자가 설정의 위치와 영향 범위를 예측할 수 있게 한다.

## 핵심 모델

```text
설정: 여러 기능이 공유하는 연결과 기본값을 정의
  ↓ 기본값 참조
각 기능: 현재 작업에 사용할 값을 선택
  ↓ 필요한 경우에만
개별 작업: 공통 기본값을 명시적으로 override
```

- 여러 기능이 함께 참조하는 값의 편집기는 `설정`이 소유한다.
- 각 기능은 공통값을 복제해 다시 편집하지 않고 선택하거나 상속 상태를 보여준다.
- 작업별 차이가 실제로 필요한 값만 local override를 허용한다. 작업 화면은 실제 적용될 선택값을 항상 노출하고,
  별도의 출처 라벨 없이 각 항목의 빈 선택으로 공통 기본값 상속을 제공한다.
- profile/group은 여러 값을 반복해 함께 선택하는 수요가 검증된 뒤 도입한다. 단일 값을 자유롭게 조정해야 하는
  흐름에 group을 먼저 강제하지 않는다.

## 배치 기준

| 판단 질문 | 위치 |
| --- | --- |
| 둘 이상의 기능이 같은 계정·credential·endpoint를 사용하는가? | 설정의 연결 영역 |
| 둘 이상의 기능이 같은 동작 기본값을 참조하는가? | 설정의 해당 범주 |
| 한 기능에서만 의미가 있고 다른 기능에 재사용되지 않는가? | 해당 기능의 local 설정 |
| 한 글·한 발행처럼 이번 작업에서만 달라지는가? | 작업 local override |
| 제품 사용의 필수 기반인가? | `기본 연결` |
| 선택적인 외부 서비스인가? | `부가 서비스` |

현재 예시는 다음과 같이 해석한다.

- Google 계정과 Spreadsheet: 여러 콘텐츠 기능의 필수 기반이므로 `기본 연결 > 콘텐츠 공간`
- 네이버 블로그와 워드프레스 계정: 발행의 필수 기반이므로 `기본 연결 > 블로그 발행 채널`
- Buffer, Bitly, Telegram, Slack: 여러 기능이 선택적으로 사용하는 외부 연동이므로 `부가 서비스`
- 네이버 입력 속도: 앱이 네이버 에디터에 입력하는 공통 실행 환경이므로 `앱 > 입력 환경`이 기본값을 소유한다.
- 브라우저 표시 방식: 글 발행 화면의 글별 실행 설정이 소유한다.
- 이미지 최적화: 기본으로 자동 최적화하고 실패하면 원본으로 fallback한다. 별도 사용자 설정을 제공하지 않는다.

## 메뉴와 provider 표현

- top/local menu는 `콘텐츠 공간`, `블로그 발행 채널`처럼 사용자의 목적과 영향 범위를 이름으로 쓴다.
- Google 같은 provider 이름은 실제 연결 대상을 선택하거나 상태를 확인하는 panel 내부에서 명시한다.
- provider가 추가되어도 menu hierarchy를 다시 만들지 않고 같은 목적 영역의 연결 항목으로 확장한다.
- 필수 연결과 선택적 연동을 `연결` 하나로 합치지 않는다. 제품 사용의 준비도와 선택 기능의 확장성을 구분한다.
- 네이버 블로그와 워드프레스는 현재 제품 안에서 동급 발행 채널이다. 실제 사용 빈도를 근거로 워드프레스를
  optional 또는 낮은 시각 위계로 내리지 않으며, 준비도 summary와 설정 card에서 동일한 구조를 사용한다.

## 현재 Settings Beta IA

```text
설정 Beta
├─ 기본 연결
│  ├─ 콘텐츠 공간
│  │  ├─ Google 계정
│  │  └─ Google Spreadsheet
│  └─ 블로그 발행 채널
│     ├─ 네이버 블로그
│     └─ 워드프레스
├─ AI
│  ├─ 글쓰기 모델
│  ├─ 이미지 모델
│  └─ 보조 대화 모델
├─ 글쓰기
│  └─ 글쓰기 기본값
│     ├─ 문체
│     ├─ 글 구성
│     ├─ 이미지 구성
│     ├─ 참고 글 분석
│     └─ AI 적용 미리보기
├─ 부가 서비스
│  ├─ SNS 배포
│  │  └─ Buffer
│  ├─ 메시지·알림
│  │  ├─ Telegram
│  │  └─ Slack
│  └─ 링크 단축
│     └─ Bitly
└─ 앱
   ├─ 외부 연결
   ├─ 입력 환경
   │  └─ 네이버 입력 속도
   └─ 일반
```

`AI`는 현 단계에서 하나의 `모델 역할` 목적만 가지므로 local sub-menu를 두지 않는다. 글쓰기·이미지·보조
대화 모델은 readiness summary와 1:1 detail card로 구성하며, 보조 대화 모델은 기본으로 글쓰기 모델을 상속하고
필요할 때만 별도 모델을 사용한다. MCP Remote Server는 모델 역할이 아닌 앱 연결·확장 설정이므로
`앱 > 외부 연결`에서 다룬다. `글쓰기`는 하나의 `글쓰기 기본값` 목적만 가지므로 local sub-menu를 두지
않는다. 사용자는 문체·구성·이미지 영역의 한 세트를 관리하며 제품 추천값은 초기값과 명시적 되돌리기의 기준으로만
사용한다. 검색 중심·발견 중심 전략은 현재 작업의 목적이므로 이 기본값에서 제외하고 실제 글 작성 화면이 소유한다.
`부가 서비스`는 provider 수가 아니라 사용 목적에 따라 `SNS 배포 / 메시지·알림 / 링크 단축`으로 나눈다.
Buffer는 SNS와 카드뉴스가 공유하고, Telegram과 Slack은 메시지·알림 channel이며, Bitly는 Telegram에 종속되지
않는 공통 URL 단축 연결이다. 이 화면은 연결 credential과 검증만 소유하고, Telegram/Slack 사용 여부나 Telegram
수신 daemon 같은 실행 설정은 소유하지 않는다. Buffer Organization·발행 채널처럼
실행 대상을 고르는 값과 자동 발행 여부·주기 같은 실행 설정은 각 기능이 소유한다. SNS 메뉴의 작업 공간·채널 선택은
수동 발행의 local 선택이며, RSS 자동 공유의 작업 공간·채널은 자동 공유 정책이 별도로 소유한다. 하나의 목적에 provider가 둘 이상 있을 때만 readiness summary를 제공하므로
`메시지·알림`은 Telegram과 Slack summary를 함께 보여주고 단일 provider 목적은 상세 card로 바로 시작한다.
Telegram과 Slack 카드 제목 앞 체크박스는 공통 발송 channel 사용 여부를 소유하고, 각 기능은 알림을 발생시키는 이벤트를 소유한다. `앱 > 외부 연결`은 Telegram 명령
수신과 원격 MCP처럼 외부에서 앱으로 들어오는 adapter의 활성화와 실행 상태를 소유한다. MCP는 Telegram과 독립적인
transport이며, Telegram은 선택 가능한 별도 inbound channel이다. 외부 연결의 credential은 필요 위치에서만 수정하며,
상태 read API는 secret 자체 대신 등록 여부만 돌려준다. 독립 `발행` top menu와 별도 `발행 환경` submenu는 두지 않는다.
실제 발행 대상과 이벤트별 동작은 각 기능 화면이 소유한다. `앱`의 local sub-menu는 공통 segmented-tab layout을 사용한다.
`앱 > 일반`은 UI server의 접속 주소와 port를 소유하며, 이 변경만 기존 server reload 경계를 호출한다.
앱 업데이트는 `앱 > 일반`에서 확인·설치 action만 제공한다. 강제 설치도 선택된 update channel의 최신 릴리즈를 대상으로 하며, update source·mirror·custom URL은 운영 구성으로 분리한다.

URL 단축 사용처는 공급자 API나 credential을 직접 알지 않는다. 공통 URL 단축 capability가 현재 provider 설정을
해석하고 provider adapter를 선택하며, 카드뉴스·SNS 배포·알림은 원본 URL만 전달한다. 현재 연결 UI와 adapter는
Bitly를 제공하지만, 다른 단축 provider로 교체하거나 추가할 때 각 발행 기능을 수정하지 않는다. 단축 실패는 원문
URL을 보존하고 본래 발행을 막지 않는다.

credential과 허용 대상은 `부가 서비스 > 메시지·알림`에서 먼저 연결해야 하며, 연결되지 않은 channel의 title checkbox는 비활성화한다. Telegram의
`delivery_enabled`와 `inbound_enabled`는 분리한다. 기존 `enabled` 값만 있는 설정은 두 값의 fallback으로 읽어
기존 동작을 유지하며, 이후 앱 알림 변경은 delivery 값만 바꾸므로 수신 daemon을 시작·중지하지 않는다.

Blog Beta의 글 작성 화면은 본문 길이·도입·전개·마무리만 글별 override로 제공한다. 새 글이 성공적으로 보관되거나
대기열에 추가된 뒤에는 반복 작성 편의를 위해 그 선택을 browser localStorage의 기기 최근값으로 갱신한다. 이 최근값은
공통 설정을 변경하지 않으며, 이미 저장된 글감은 자신의 override를 복원하고 수정만으로 다음 새 글의 최근값을 바꾸지 않는다.

## Legacy 설정 이관 소유권 표

기존 `설정`에 있던 control은 Settings Beta로 보이게 복제하지 않는다. 아래 표의 소유 화면만 편집을 제공하며,
legacy 화면은 migration surface가 교체되기 전까지 같은 canonical 값을 읽는 호환 화면으로만 유지한다.

| 기존 값의 목적 | 단일 소유 화면 | 현재 상태 / 다음 조치 |
| --- | --- | --- |
| Google·Spreadsheet·네이버·WordPress 연결 | `설정 Beta > 기본 연결` | 이관 완료 |
| 글쓰기·이미지·보조 대화 AI 역할과 API Key | `설정 Beta > AI` | 이관 완료 |
| 문체·글 구성·이미지 구성의 공통 기본값 | `설정 Beta > 글쓰기` | 이관 완료. 저장된 effective profile은 생성 prompt에 직접 전달된다. |
| Buffer·Telegram·Slack·Bitly credential | `설정 Beta > 부가 서비스` | 이관 완료. 실행 대상 선택은 소유하지 않는다. |
| Telegram/Slack을 앱 공통 알림 channel로 사용할지 | `설정 Beta > 부가 서비스 > 메시지·알림` | 이관 완료. 이벤트 발생 여부는 각 기능이 소유한다. |
| Telegram inbound·Remote MCP | `설정 Beta > 앱 > 외부 연결` | 이관 완료 |
| UI server host/port·앱 업데이트 action | `설정 Beta > 앱 > 일반` | 이관 완료 |
| 네이버 입력 속도 | `설정 Beta > 앱 > 입력 환경` | 이관 완료. 선택값을 바꾸면 긴 문장 3회 입력 미리보기를 즉시 재생한다. |
| 새 글 발행 시 브라우저 표시 방식 | `블로그 Beta`의 글별 실행 설정 | 글마다 선택하는 설정으로 유지한다. |
| 이미지 최적화 | 발행 runtime | 기본 최적화 후 실패하면 원본으로 fallback한다. 사용자 editable 설정을 제공하지 않는다. |
| 블로그·쇼핑·SNS 자동 발행의 대상, 시간, 주기, 상태 | 각 기능의 `자동화` 화면 | 후속 이관 대상. Settings Beta에는 연결 credential만 남긴다. |
| Buffer Organization·발행 채널 | SNS 배포·카드뉴스의 실제 발행 화면 | 후속 이관 대상. Buffer 연결 화면에는 표시·선택하지 않는다. |
| Trends·RSS 수집 주기와 필터 | 발견/글감 관리의 자동 수집 화면 | 후속 이관 대상 |
| 카드뉴스 source 목록·RSS source | 카드뉴스 화면의 `소스 관리` | 이관 완료. legacy 설정의 중복 편집 UI는 제거했다. |
| 쇼핑 FTC·CTA 이미지와 쇼핑 자동 발행 | 쇼핑커넥트 화면 | 후속 이관 대상 |
| update channel/source/mirror/custom URL | 운영 구성 | 일반 사용자 설정으로 노출하지 않는다. |

이 표의 `후속 이관 대상`은 기능 UI가 준비될 때만 이동한다. 임시로 Settings Beta에 복사하거나 두 화면에서
동시에 저장하지 않는다.

입력 환경처럼 명시적 `적용` action을 가진 설정은 선택값이 마지막 적용값과 달라지는 즉시 header badge를 `변경됨`으로
표시하고 저장 전 변경으로 추적한다. `적용` 성공 뒤에만 `적용됨`으로 돌아간다.

## Page header와 작업 카드 hierarchy

- page header는 해당 메뉴가 해결하는 사용자 목적을 한 번만 설명한다. 단일 목적 화면의 첫 작업 카드는
  같은 목적을 제목·부제목으로 반복하지 않고, 사용자가 바로 시작할 첫 action 또는 section 제목으로 시작한다.
- panel lead는 top/local menu가 있어 사용자가 다른 목적의 panel로 이동했을 때, 현재 panel의 역할을 구분해야 할
  경우에만 사용한다. Blog Beta, 쇼핑커넥트, Settings Beta처럼 sibling panel이 있는 화면에는 적합하다.
- 단일 workflow의 순서는 tab으로 표현하지 않는다. 채널 선택, 내용 작성, 선택 입력, 발행처럼 이어지는 단계는
  card 안의 section hierarchy와 action placement로 보여준다.

## Local sub-menu 기준

- top menu 안에 독립적으로 이동하거나 비교할 목적이 둘 이상 있을 때만 local sub-menu를 둔다.
- 단일 목적의 화면에는 탭 모양을 맞추기 위해 local sub-menu를 추가하지 않는다. panel 제목과 summary·detail
  hierarchy로 충분하면 그 구조를 우선한다.
- local sub-menu의 label은 provider, storage 또는 구현 방식이 아니라 사용자의 목적과 영향 범위를 표현한다.

## 저장과 호환성 계약

- canonical 저장소는 기존 `config.json` 하나다. Settings Beta 전용 복사본이나 별도 truth를 만들지 않는다.
- 현재 내부 JSON schema를 유지해 기존 runtime과 기존 설정 화면이 같은 값을 사용한다.
- 화면의 save payload는 panel scope로 제한한다. server는 허용된 field만 갱신하고 같은 파일의 다른 설정을 보존한다.
- 읽을 수 없는 설정 파일을 빈 기본값으로 덮어쓰지 않는다. 오류를 보여주고 복구 또는 재시도를 먼저 제공한다.
- 향후 schema 변경이 필요하면 사용자 가시 동작, migration과 rollback을 별도 결정으로 검토한다.

### Seamless 반영 기준

- field 입력이나 blur만으로 반영하지 않는다. 현재 panel 값과 마지막으로 불러오거나 반영한 값을 scope별로 비교해
  실제 차이가 있을 때만 pending change로 본다.
- 사용자가 `접근 확인`, `로그인`, `연결 확인`처럼 목적 action을 실행할 때 변경값을 먼저 내부적으로 반영하고
  후속 외부 확인을 수행한다. 값이 바뀌지 않았다면 persistence를 반복하지 않고 확인만 수행한다.
- 각 connection card는 공통 component 규정의 `header → body → feedback → footer` anatomy를 따른다. 지속 상태는
  header badge 한 곳, 최근 operation 결과는 footer 직전 feedback 한 곳, action은 footer 오른쪽 한 group에 둔다.
- card anatomy, summary-to-detail 이동, feedback DOM 갱신은 shared settings-card pattern/controller를 사용한다.
  provider별 feature는 각 연결의 입력·검증·로그인 workflow만 소유하며, 동일 card markup과 상태 surface를 복사하지 않는다.
- 정상 성공은 header badge가 표현하므로 feedback으로 반복하지 않는다. feedback은 오류·부분 성공·다음 행동처럼
  대응이 필요한 예외만 한 줄 예약 영역에 표시하며, 그 변화가 action footer의 위치를 움직이지 않게 한다.
- loading은 사용자가 누른 button에서만 표현한다. 직접 operation이 완료된 뒤의 전체 readiness 재조회는 background로
  이어가며 action loading을 연장하거나 같은 `확인 중` 문구를 feedback에 반복하지 않는다.
- button label은 card 안의 맥락으로 행동의 대상을 이미 알 수 있으면 `저장`처럼 짧게 쓴다. 외부 검증은
  `연결 확인`, 외부 후보 조회는 `작업 공간 불러오기`처럼 결과가 다른 행동에만 대상을 덧붙인다. 동일한
  provider 후보 조회는 설정과 기능 화면에서 같은 label·loading·재조회 문구를 사용한다.
- 기본 연결의 `새로고침`은 panel의 설정값과 외부 연결 상태를 다시 읽는 secondary recovery action이다. 외부에서
  권한·공유·세션·credential이 바뀌었거나 최신 확인이 실패한 경우에만 필요하며, 정상 연결 action 뒤에는
  background reconciliation으로 대신한다.
- 콘텐츠 공간과 블로그 발행 채널의 readiness summary는 각 connection 설정과 1:1로 연결한다. summary를 누르면
  해당 form 또는 관련 action으로 이동하며, 설정 card는 고정 높이 없이 content-driven compact density를 사용한다.
- 정상 반영은 별도 `저장됨` label이나 `저장하고 …` button으로 드러내지 않는다. persistence는 사용자의 목적을
  방해하지 않는 seamless 단계이며, 화면은 연결 상태와 다음 action을 중심으로 표현한다.
- 내부 반영과 외부 확인은 결과를 별도로 추적한다. 반영 뒤 인증·접근 확인만 실패하면 값을 되돌리지 않고
  `입력값은 반영됨 · 확인 실패`로 부분 성공을 알린다. 이는 실패 복구에 필요한 예외 feedback이다.
- header badge와 readiness card의 `연결됨`은 local persistence가 아니라 외부 검증 성공만 뜻한다.
- Google Spreadsheet의 `접근 가능` badge와 readiness summary도 주소 저장 여부가 아니라 해당 주소를 Google 계정으로
  실제 조회한 마지막 성공 결과만 뜻한다. 주소를 편집하면 이 검증 결과는 즉시 `접근 확인 필요`로 돌아간다.
- WordPress application password 같은 secret은 `WORDPRESS_APP_PASSWORD_CONFIGURED`처럼 등록 여부만 Settings Beta에
  전달한다. 새 입력값만 일시적으로 보기/숨기기를 지원하고, 빈 입력으로 connection을 확인하거나 값을 반영할 때는
  저장된 secret을 유지한다.
- AI API Key도 같은 secret 계약을 따른다. Settings Beta의 AI read API는 `*_MODEL_API_KEY_CONFIGURED`만 전달하며,
  기존 key의 일부·마스킹값·원문을 browser에 내리지 않는다. 보기/숨기기는 새로 입력한 값에만 제공한다. `연결 확인`은
  새 입력값을 반영한 뒤 서버에 저장된 해당 모델 역할 설정으로 수행한다.
- Buffer API Key, Telegram Bot Token, Slack Webhook URL과 Bitly Access Token도 같은 secret 계약을 사용한다.
  Settings Beta의 부가 서비스 API는 등록 여부만 반환하고 기존 `config.json` schema와 runtime consumer는 유지한다.
  `연결 확인`은 해당 card scope만 반영한다. Buffer Organization·발행 채널은 SNS 자동 발행과 카드뉴스의 실행 설정에서 선택한다.

## 화면 계약

- Settings Beta는 기존 `설정`과 독립된 migration surface다. 교체 승인 전까지 기존 화면과 데이터를 제거하지 않는다.
- 공통 navigation, action, status와 widget은 design system pattern을 재사용하고 feature CSS는 고유 layout만 소유한다.
- local persistence는 정상 경로에서 조용히 처리하고, `연결됨`은 외부 상태 검증 결과로만 표시한다.
- 갱신 실패는 마지막 정상 상태를 지우지 않으며, 진행 중에는 충돌하는 sibling action만 잠근다.
