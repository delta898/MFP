# Buffer SNS Distribution Plan (Completed)

## Current Status

- Phase 1 설정 계약, Buffer 연결 gateway, 조직/채널 조회 UI 구현 완료
- Phase 2의 `SNS` 시트 schema, 공통 초기화, queue/ledger store 구현 완료
- Phase 3 네이버·WordPress RSS Discovery와 자동 주기 연결 완료
- Phase 4 `entry_key` 단위 Buffer 즉시 발행과 채널별 결과 기록 구현 완료
- Phase 4 SNS 콘텐츠 포맷, 선택형 AI 해시태그, Bitly, 최종 실패 Telegram 알림 구현 완료

## Goal

BlogGenius가 개별 SNS API를 직접 연동하지 않고 Buffer API를 단일 전송
gateway로 사용해 블로그 RSS의 새 글을 SNS에 즉시 발행한다.

사용자는 SNS 계정 연결과 채널 관리를 Buffer에서 수행한다. BlogGenius에는
Buffer API Key를 입력하고, API로 조회된 조직과 채널 중 발행 대상을 선택한다.

## Product Boundary

- BlogGenius는 Instagram, Threads, Facebook 등 개별 SNS 인증을 소유하지 않는다.
- BlogGenius는 Buffer GraphQL API만 호출한다.
- SNS 데이터 수집과 발행은 SNS distribution capability를 가진 라이선스에만 제공한다.
- 설정 UI, Buffer 연결 확인, `SNS` 시트 구조 준비는 모든 플랜에 노출한다.
- 실제 RSS 수집과 SNS 발행은 `enable_sns_distribution` capability로 제어한다.
- Buffer 연결 채널의 생성·해제·권한 관리는 Buffer에서 수행한다.
- BlogGenius는 선택한 채널에 `shareNow` 방식으로만 발행한다.
- Buffer queue와 예약 발행은 1차 범위에 포함하지 않는다.
- Buffer Free 플랜을 기준으로 선택 채널은 최대 3개로 제한한다.

## User Flow

1. 사용자가 설정 화면에 Buffer API Key를 입력한다.
2. `연결 확인`을 누르면 BlogGenius가 Buffer 조직과 채널을 조회한다.
3. 조직이 하나면 자동 선택하고, 여러 개면 사용자가 하나를 선택한다.
4. 사용자는 조회된 채널 중 최대 3개를 선택한다.
5. 사용자는 SNS 발행 대상 블로그로 네이버 블로그와 WordPress 중 하나 이상을 선택한다.
6. SNS 자동 발행을 활성화하고 확인 주기를 설정한다.
7. 확인 주기의 최솟값은 10분이다.
8. SNS distribution capability와 SNS 활성화가 모두 유효하면 BlogGenius는 RSS에서 새 글을 발견해 공유 Google Spreadsheet의 `SNS`
   시트에 채널별 `대기` 행을 추가한다.
9. 매 주기마다 행 번호가 가장 낮은 `대기` 원문 글 하나를 선택하고, 같은 `entry_key`의 채널들을 Buffer로 즉시 발행한다.
10. 앱 시작 시에는 위 조건을 확인한 뒤 RSS Discovery만 한 번 실행하고 Buffer
    발행은 첫 예약 주기부터 시작한다.

설정 화면에는 별도로 제공할 Buffer 가입/API Key 발급 안내 글 링크를 노출한다.
안내 URL은 사용자 입력값이 아니라 제품 기본 도움말 링크로 관리한다.

## Configuration Contract

권장 구조:

```json
{
  "integrations": {
    "buffer": {
      "api_key": "",
      "organization_id": "",
      "channels": [
        {
          "id": "",
          "service": "",
          "display_name": ""
        }
      ],
      "help_url": ""
    }
  },
  "automation": {
    "publish": {
      "social": {
        "enabled": false,
        "interval_min": 10,
        "ai_mode": "none",
        "sheet_name": "SNS",
        "source_blogs": [
          "naver",
          "wordpress"
        ]
      }
    }
  }
}
```

규칙:

- `api_key`는 필수 직접 입력값이다.
- 조직/채널 정보는 API Key로 조회하며 ID를 직접 입력하게 하지 않는다.
- 선택 채널은 중복 제거 후 최대 3개다.
- `source_blogs`는 `naver`, `wordpress` 중 하나 이상이며 기본값은 둘 다다.
- `interval_min`은 10 미만으로 저장하거나 실행할 수 없다.
- API Key, 선택 채널 또는 SNS 발행 대상 블로그가 없으면 자동 발행을 활성화할 수 없다.
- API Key는 Google Spreadsheet에 기록하지 않는다.

## Entitlement Contract

SNS 기능은 노출·준비 영역과 실제 데이터 처리 영역을 분리한다.

| 영역 | capability 없음 | capability 있음 |
| --- | --- | --- |
| 설정 화면 노출 | 허용 | 허용 |
| Buffer 연결 확인과 채널 조회 | 허용 | 허용 |
| `SNS` canonical 시트 생성·검증 | 허용 | 허용 |
| RSS 확인과 SNS 행 추가 | 차단 | SNS 활성화 시 허용 |
| Buffer 발행 | 차단 | SNS 활성화 시 허용 |

- capability가 없는 사용자는 `SNS` 시트만 준비되며 SNS record를 쌓지 않는다.
- 권한 검사는 raw plan 문자열이 아니라 전용 capability로 구현한다.
- capability 이름은 `enable_sns_distribution`이다.
- 현재 tester, pro, ultra에는 capability를 부여하고 free에는 부여하지 않지만, 실행 코드는 이 플랜 이름을 알지 않는다.
- 설정 UI와 빈 `SNS` 시트를 미리 노출해 기능 발견성을 유지하되, 데이터 수집과 외부 발행은 권한 경계 밖에서 실행하지 않는다.

## SNS Sheet Contract

`SNS` 시트는 여러 BlogGenius 실행 환경이 공유하는 중앙 queue이자 전송
ledger다. 기존 `topics`, `shopping` 시트와 같은 Spreadsheet에 자동 생성한다.

- canonical 시트 탭 이름은 대문자 `SNS`다.
- 신규 사용자와 기존 사용자 모두 공통 시트 준비 시점에 `topics`, `shopping`과 함께 확인·생성한다.
- 개발 중인 `SNS` 시트는 하위 호환 컬럼 보충을 하지 않는다. 필수 헤더가 빠진 기존 시트는 자동 수정하지 않고 SNS 실행을 중단한다.
- `SNS`가 비활성인 공통 초기화에서 이 시트만 준비하지 못하면 경고를 남기고 `topics`, `shopping` 사용은 계속 허용한다.
- 향후 SNS 활성화와 runner 시작 직전에는 `SNS` 시트, 필수 헤더, 상태 dropdown을 엄격하게 재확인한다.
- 엄격한 재확인 실패는 SNS 실행만 막으며 기존 블로그/쇼핑 기능은 막지 않는다.

한 행은 `원문 글 × Buffer 채널` 전송 한 건이다.

초기 컬럼:

```text
delivery_key
entry_key
상태
원문 플랫폼
서비스
채널 이름
channel_id
글 제목
글 요약
해시태그
원문 URL
대표 이미지 URL
RSS 발행일시
처리일시
buffer_post_id
로그
```

식별자:

```text
entry_key
= SHA-256("guid\n" + RSS GUID)
  또는 SHA-256("url\n" + 정규화한 원문 URL)

delivery_key
= SHA-256(entry_key + "\n" + channel_id)
```

- URL 정규화 시 hostname과 query 순서를 정리하고 fragment 및 `utm_*`,
  `fbclid`, `gclid` 추적 parameter를 제거한다.
- 동일 `delivery_key`가 있으면 같은 글을 같은 채널에 다시 추가하지 않는다.
- 어떤 채널이든 같은 `entry_key` 행이 이미 있으면 과거 글에 새 채널 행을
  소급 추가하지 않는다.
- 기준선 상태는 사용하지 않는다.
- 최초 RSS 확인에서 발견한 기존 항목도 선택 채널별 `대기` 행이 된다.
- 설정 주기마다 `entry_key`가 가장 앞선 원문 글 한 건을 처리한다.
- 같은 `entry_key`의 `대기` 행은 하나의 발행 묶음으로 보고 최대 3개 채널에 이어서 즉시 발행한다.
- Buffer Post와 시트 상태는 채널별 delivery 단위로 유지한다.
- 앱 시작 시 RSS Discovery 실패는 앱 시작을 막지 않고 상태와 로그에만 남긴다.
- 같은 프로세스에서 UI 서버가 다시 로드되더라도 startup Discovery는 한 번만 실행한다.

## Source Blog Selection Contract

`source_blogs`는 기존 RSS 수집 기능 자체를 켜고 끄는 설정이 아니라 SNS 발행
대상을 결정하는 정책이다. SNS distribution capability와 SNS 자동 발행이 모두 켜져 있는 동안
네이버 블로그와 WordPress RSS를 확인해 `SNS` 시트가 발행 여부의 ledger 역할을 하게 한다.

- SNS Discovery는 글감 수집용 `COLLECT_RSS_ENABLED`와 `COLLECT_RSS_CONFIGS`를 사용하지 않는다.
- 선택한 원문 블로그 중 실제 설정된 블로그가 하나 이상이면 해당 블로그만 확인한다.
- 선택한 네이버 블로그와 WordPress가 모두 미설정인 경우에만 SNS Discovery를 중단한다.
- 선택했지만 미설정인 블로그는 수집 결과에 제외 사유를 표시한다.
- 네이버 피드는 설정된 `NAVER_ID`로 `https://rss.blog.naver.com/{NAVER_ID}.xml`을 구성한다.
- WordPress 피드는 설정된 `WORDPRESS_URL`의 `/feed/`를 사용한다.

- 선택된 블로그에서 발견한 글은 채널별 `대기` 행으로 등록한다.
- 선택되지 않은 블로그에서 발견한 글은 채널별 `건너뜀` 행으로 등록한다.
- ON에서 OFF로 바뀐 블로그의 기존 `대기` 행은 `건너뜀`으로 변경한다.
- 위 변경 시 로그에 `SNS 발행 대상 블로그에서 제외됨`을 기록한다.
- 이미 `완료`된 행은 변경하지 않는다.
- 이미 `처리 중`인 행은 현재 실행까지 완료하며 강제로 취소하지 않는다.
- OFF에서 ON으로 바뀌어도 기존 `건너뜀` 행은 자동으로 `대기`로 되돌리지 않는다.
- 다시 ON으로 바뀐 뒤 새로 발견한 글부터 `대기`로 등록한다.
- 과거 글을 발행하려면 사용자가 해당 행 상태를 직접 `대기`로 변경한다.

## Status Contract

허용 상태:

```text
대기
처리 중
완료
실패
건너뜀
```

처리 규칙:

- 행 번호가 낮은 순서로 `대기`인 첫 행의 `entry_key`를 선택한다.
- 선택한 `entry_key`와 같은 모든 `대기` 행을 이번 주기의 발행 묶음으로 처리한다.
- 같은 글의 `완료`, `실패`, `건너뜀` 행은 다시 호출하지 않는다.
- `실패`와 `건너뜀`은 자동 처리하지 않는다.
- 사용자가 `실패` 또는 `건너뜀`을 `대기`로 변경하면 수동 재시도가 된다.
- 별도 `재시도` 상태, retry timestamp, 분산 lock 컬럼은 만들지 않는다.

## Retry Contract

일시적 오류는 한 실행 안에서 총 3회 시도한다.

```text
1차 시도
-> 실패
-> 10초 대기
-> 2차 시도
-> 실패
-> 10초 대기
-> 3차 시도
```

- 네트워크 오류와 Buffer 5xx는 위 규칙으로 재시도한다.
- 명확한 인증, 채널, 콘텐츠 검증 오류는 즉시 `실패`로 기록한다.
- 이미지 필수 채널에서 대표 이미지를 확보하지 못하면 `건너뜀`으로 기록한다.
- GraphQL 요청은 채널별 `createPost` mutation을 alias로 묶어 최대 3개 delivery를 함께 요청한다.
- 일부 채널만 성공하면 성공 채널은 즉시 `완료`로 확정하고 실패한 채널만 실패 처리한다.
- 일시 오류 재시도 중 이미 성공이 확인된 채널은 다시 요청하지 않는다.
- 3회 실패 후에는 해당 채널을 `실패`로 기록하고 다음 주기부터 다음 `entry_key`를 처리한다.
- 최종 실패를 자동으로 다시 queue에 넣지 않는다.

## RSS and Media Rules

- 감시 대상은 설정된 네이버 블로그와 WordPress의 RSS다.
- 새 글 발견 순서와 무관하게 Spreadsheet 행 순서가 최종 실행 순서를 결정한다.
- 피드에서 여러 글을 처음 발견하면 RSS 발행일시가 오래된 글부터 시트에 등록한다.
- 글 요약은 RSS `description` 또는 Atom `summary`를 우선 사용한다.
- 요약이 없으면 RSS/Atom 본문의 HTML을 제거한 텍스트를 사용하고, 그래도 없으면 원문의 `og:description`을 사용한다.
- 요약은 최대 1,000 Unicode code point로 정규화해 `글 요약` 컬럼에 기록한다.
- 대표 이미지는 다음 순서로 찾는다.
  1. RSS `media:content` 또는 `enclosure`
  2. RSS 본문의 첫 이미지
  3. 원문의 `og:image`
- 이미지 실패는 이미지가 필수인 해당 채널 행에만 영향을 준다.

## Optional SNS AI Contract

SNS AI는 사용자 비용이 발생할 수 있으므로 자동 선택이나 다른 모델로의 암묵적
fallback을 하지 않는다. 설정은 다음 단일 선택으로 사용 여부와 모델 역할을 함께
결정한다.

```text
none
blog_text
chat
```

- `none`: AI를 호출하지 않고 제목, 요약, URL만 사용한다.
- `blog_text`: 사용자가 설정한 블로그 글쓰기 Text Model만 사용한다.
- `chat`: 사용자가 설정한 Chat Model만 사용한다.
- 모델 선택은 해시태그에 종속하지 않는 SNS 콘텐츠 AI 정책이다. 로컬 설정에는
  `automation.publish.social.ai_mode`로 저장하고 UI의 `SNS_AI_MODE` 필드로
  주고받는다.
- 현재 첫 사용처는 해시태그 생성이지만 향후 요약 보정, 플랫폼별 문구 생성 등
  SNS 콘텐츠 작업에서 같은 모델 선택 정책을 재사용할 수 있다.
- 선택한 모델이 미설정이거나 호출에 실패하면 다른 AI 모델로 전환하지 않고 해시태그 없이 발행한다.
- AI는 제목과 요약을 기반으로 원문 글당 해시태그를 최대 5개 생성한다.
- 생성한 해시태그는 Buffer 발행 전에 같은 `entry_key`의 비어 있는 `해시태그` 셀에 동일하게 기록한다.
- `해시태그` 값이 이미 있으면 AI를 다시 호출하지 않으며 사용자가 입력한 값도 덮어쓰지 않는다.
- AI를 사용하지 않더라도 사용자가 `해시태그` 컬럼에 입력한 값은 발행 콘텐츠에 사용한다.
- 플랫폼 길이 제한에 따라 해시태그 개수는 줄일 수 있다.

## SNS Content and Integration Contract

채널에 전달하는 기본 텍스트 블록 순서는 다음과 같다.

```text
제목

글 요약

URL

해시태그
```

- URL은 Bitly token이 설정되어 있으면 원문 글당 한 번 단축하고 모든 채널이 같은 단축 URL을 사용한다.
- Bitly가 미설정이거나 단축 호출에 실패하면 원문 URL로 계속 발행한다.
- URL은 플랫폼 글자 수 조정 과정에서 자르거나 제거하지 않는다.
- 제한을 넘으면 글 요약을 먼저 축약하고, 해시태그를 뒤에서부터 제거한 뒤, 마지막으로 제목을 축약한다.
- URL만으로 플랫폼 제한을 맞출 수 없으면 해당 채널을 `실패`로 기록한다.
- 글자 수는 Unicode code point 기준으로 계산한다. Bluesky URL은 실제 길이와 무관하게 22자로 계산한다.
- 현재 적용하는 보수적 제한은 Bluesky 300, X 280, Threads 500, Instagram 2,200,
  LinkedIn 3,000, Facebook 5,000, Pinterest 500, Mastodon 500,
  Google Business 1,500, Start Page 5,000자다.
- Instagram은 대표 이미지가 없으면 `건너뜀`으로 기록한다.
- TikTok과 YouTube/YouTube Shorts는 현재 콘텐츠 형태와 맞지 않아 설정 UI에서 선택할 수 없고 runner에서도 `건너뜀` 처리한다.

Telegram 설정이 활성화되어 있고 bot token과 chat ID가 모두 있으면 원문 글 묶음
처리가 끝난 뒤 최종 실패 채널을 한 메시지로 알린다.

- Buffer의 채널별 영구 실패, 재시도 소진, 포맷 실패, 해시태그 시트 저장 실패를 알림 대상으로 본다.
- 이미지 누락, 선택 해제, 미지원 플랫폼 같은 `건너뜀`은 알림 대상으로 보지 않는다.
- 성공한 채널이 일부 있어도 실패 채널이 있으면 한 번 알린다.
- Telegram 전송 실패는 SNS 시트의 완료/실패 결과를 변경하지 않는다.

## Multi-Computer Policy

- 중앙 상태는 로컬 파일이 아니라 공유 `SNS` 시트에 저장한다.
- 여러 컴퓨터의 엄밀한 분산 lock과 exactly-once 실행은 1차 범위에서 제외한다.
- 동시에 여러 컴퓨터에서 자동 실행할 경우 중복 가능성이 있음을 문서에 명시한다.
- 운영상 SNS 자동 실행은 한 컴퓨터에서만 활성화하는 것을 권장하되 강제하지 않는다.

## Architecture Direction

SNS는 기존 네이버/WordPress 원문 발행 target이나 Telegram channel adapter로
추가하지 않는다. RSS로 발견된 글을 외부 배포 gateway에 전달하는 별도
distribution lane으로 둔다.

권장 구조:

```text
src/social/
  feed-entry.js
  sns-distribution-runner.js
  sns-ai-service.js
  sns-content-formatter.js
  sns-sheet-store.js
  google-sheets-sns-gateway.js
  gateways/
    buffer-client.js
```

확장 시 gateway는 다음 계약을 따른다.

```text
kind: social_distribution
transport: buffer_graphql
config: api key, organization, selected channels
```

Buffer 고유 GraphQL과 채널 조회는 `buffer-client` 안에 격리하고 RSS, Sheet,
runner는 Buffer 응답 구조에 직접 의존하지 않는다.

## Implementation Phases

### Phase 1: Settings and Buffer Connection

- config sample과 config loader에 Buffer/SNS 설정 계약 추가
- 설정 저장 시 최소 주기와 최대 채널 수 검증
- 설정 화면에 Buffer 카드 추가
- SNS 발행 대상 블로그 선택
- API Key 연결 확인
- 조직과 채널 조회
- 조직/채널 선택 및 저장
- API Key 마스킹과 도움말 링크
- 단위 테스트

### Phase 2: SNS Sheet Store

- `SNS` 시트 canonical 스키마 자동 생성 및 누락 컬럼 strict 검증 (완료)
- 상태 dropdown 추가 (완료)
- 공통 초기화 실패 격리와 SNS 전용 엄격 확인 (완료)
- 정규화한 RSS entry와 채널별 행 append (완료, RSS 수집기 연결 전)
- `entry_key` / `delivery_key` 중복 확인 (완료)
- 같은 `entry_key`의 신규 채널 소급 등록 방지 (완료)
- 첫 `대기` 행 조회와 상태/결과 업데이트 (완료)
- 원문 플랫폼의 기존 `대기` 행 일괄 `건너뜀` 처리 (완료)
- 열 재배치·사용자 추가 컬럼을 보존하는 header 기반 mapping (완료)
- Spreadsheet 수식 주입을 방지하는 RAW 값 기록 (완료)

### Phase 3: RSS Discovery

- 네이버/WordPress RSS와 Atom 정규화 (완료)
- RSS GUID, 원문 URL, 제목, 발행일시 정규화 (완료)
- RSS/Atom/OG 기반 글 요약 추출 및 신규 행 기록 (완료)
- `media:content`, `enclosure`, 본문 첫 이미지, `og:image` 순서의 대표 이미지 추출 (완료)
- `enable_sns_distribution`과 SNS 활성화의 AND gate (완료)
- Buffer 및 원문 블로그 설정 준비 상태 검증 (완료)
- 새 entry를 현재 선택 채널별 `대기` 행으로 일괄 추가 (완료)
- 선택하지 않은 원문 블로그의 새 entry를 `건너뜀`으로 추가 (완료)
- 새 채널의 과거 글 소급 등록 방지 (완료)
- 설정 주기 scheduler 연결과 최소 10분 강제 (완료)
- 앱 시작 시 Discovery 1회 실행, startup Buffer 발행 금지 (완료)

### Phase 4: Distribution Runner

- 최소 10분 timer (완료)
- 행 번호 기준 첫 `대기` 원문 글(`entry_key`) 한 건 처리 (완료)
- 같은 원문 글의 채널별 delivery를 하나의 GraphQL 요청으로 발행 (완료)
- Buffer `shareNow` (완료)
- 일시 오류 총 3회 시도와 10초 간격 (완료)
- 채널별 완료/실패/건너뜀 및 Buffer Post ID 기록 (완료)
- 제목·요약·URL·해시태그 콘텐츠 구성과 플랫폼별 길이 조정 (완료)
- 선택한 AI 역할로 원문당 해시태그 최대 5개 생성 및 시트 저장 (완료)
- Bitly 설정 시 원문당 URL 단축 1회와 실패 시 원문 URL fallback (완료)
- TikTok·YouTube 계열 발행 채널 선택 차단과 runner 방어 (완료)
- 원문 글 묶음의 최종 실패 Telegram 알림 (완료)

### Phase 5: Operational Visibility

- 설정 화면에 연결/runner 상태 표시 (완료: 다음 실행, RSS 결과, 발행 결과)
- 대시보드 activity 기록 (완료)
- 수동 RSS 확인과 진단 로그 (완료)
- Buffer 발행 runner 수동 1회 실행 (완료)
- 다중 컴퓨터 동시 실행 주의 문구

## Phase 1 Validation

- API Key가 없는 상태에서 기능을 활성화할 수 없다.
- 10분 미만 주기는 거부되거나 10분으로 명확히 보정된다.
- Buffer API Key로 조직과 채널을 조회할 수 있다.
- 조직이 하나면 자동 선택된다.
- 사용자가 channel ID를 직접 입력하지 않고 조회 목록에서 선택한다.
- 채널을 4개 이상 저장할 수 없다.
- 저장 후 앱 재시작에도 선택 조직/채널과 주기가 유지된다.
- API Key는 UI에서 마스킹되며 클라이언트 로그에 노출되지 않는다.

## Out of Scope

- 개별 SNS OAuth/API 직접 연동
- Buffer queue와 예약 발행
- SNS별 성과 분석
- AI 기반 SNS 문구 재작성
- 자동 영구 재시도
- 24시간 발행 상한
- Spreadsheet 분산 lock
