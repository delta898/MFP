# Buffer SNS Distribution Plan

## Current Status

- Phase 1 설정 계약, Buffer 연결 gateway, 조직/채널 조회 UI 구현 완료
- Phase 2 이후 Spreadsheet queue와 실제 SNS 발행은 아직 구현하지 않음

## Goal

BlogGenius가 개별 SNS API를 직접 연동하지 않고 Buffer API를 단일 전송
gateway로 사용해 블로그 RSS의 새 글을 SNS에 즉시 발행한다.

사용자는 SNS 계정 연결과 채널 관리를 Buffer에서 수행한다. BlogGenius에는
Buffer API Key를 입력하고, API로 조회된 조직과 채널 중 발행 대상을 선택한다.

## Product Boundary

- BlogGenius는 Instagram, Threads, Facebook 등 개별 SNS 인증을 소유하지 않는다.
- BlogGenius는 Buffer GraphQL API만 호출한다.
- Buffer 연결 채널의 생성·해제·권한 관리는 Buffer에서 수행한다.
- BlogGenius는 선택한 채널에 `shareNow` 방식으로만 발행한다.
- Buffer queue와 예약 발행은 1차 범위에 포함하지 않는다.
- Buffer Free 플랜을 기준으로 선택 채널은 최대 3개로 제한한다.

## User Flow

1. 사용자가 설정 화면에 Buffer API Key를 입력한다.
2. `연결 확인`을 누르면 BlogGenius가 Buffer 조직과 채널을 조회한다.
3. 조직이 하나면 자동 선택하고, 여러 개면 사용자가 하나를 선택한다.
4. 사용자는 조회된 채널 중 최대 3개를 선택한다.
5. SNS 자동 발행을 활성화하고 확인 주기를 설정한다.
6. 확인 주기의 최솟값은 10분이다.
7. BlogGenius는 RSS에서 새 글을 발견하면 공유 Google Spreadsheet의 `sns`
   시트에 채널별 `대기` 행을 추가한다.
8. 매 주기마다 행 번호가 가장 낮은 `대기` 행 하나를 Buffer로 즉시 발행한다.

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
        "sheet_name": "sns"
      }
    }
  }
}
```

규칙:

- `api_key`는 필수 직접 입력값이다.
- 조직/채널 정보는 API Key로 조회하며 ID를 직접 입력하게 하지 않는다.
- 선택 채널은 중복 제거 후 최대 3개다.
- `interval_min`은 10 미만으로 저장하거나 실행할 수 없다.
- API Key가 없거나 선택 채널이 없으면 자동 발행을 활성화할 수 없다.
- API Key는 Google Spreadsheet에 기록하지 않는다.

## SNS Sheet Contract

`sns` 시트는 여러 BlogGenius 실행 환경이 공유하는 중앙 queue이자 전송
ledger다. 기존 `topics`, `shopping` 시트와 같은 Spreadsheet에 자동 생성한다.

한 행은 `원문 글 × Buffer 채널` 전송 한 건이다.

초기 컬럼:

```text
delivery_key
entry_key
상태
서비스
채널 이름
channel_id
글 제목
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
= RSS GUID
  또는 정규화한 원문 URL 기반 hash

delivery_key
= hash(entry_key + channel_id)
```

- 동일 `delivery_key`가 있으면 같은 글을 같은 채널에 다시 추가하지 않는다.
- 어떤 채널이든 같은 `entry_key` 행이 이미 있으면 과거 글에 새 채널 행을
  소급 추가하지 않는다.
- 기준선 상태는 사용하지 않는다.
- 최초 RSS 확인에서 발견한 기존 항목도 선택 채널별 `대기` 행이 된다.
- 항목은 한꺼번에 발행하지 않고 설정 주기마다 행 하나씩 처리한다.

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

- 행 번호가 낮은 순서로 `대기`인 첫 행 하나만 선택한다.
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
- 3회 실패 후에는 `실패`로 기록하고 다음 주기부터 뒤의 `대기` 행을 처리한다.
- 최종 실패를 자동으로 다시 queue에 넣지 않는다.

## RSS and Media Rules

- 감시 대상은 설정된 네이버 블로그와 WordPress의 RSS다.
- 새 글 발견 순서와 무관하게 Spreadsheet 행 순서가 최종 실행 순서를 결정한다.
- 대표 이미지는 다음 순서로 찾는다.
  1. RSS `media:content` 또는 `enclosure`
  2. RSS 본문의 첫 이미지
  3. 원문의 `og:image`
- 이미지 실패는 이미지가 필수인 해당 채널 행에만 영향을 준다.

## Multi-Computer Policy

- 중앙 상태는 로컬 파일이 아니라 공유 `sns` 시트에 저장한다.
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
  distribution-runner.js
  sns-sheet-store.js
  content-composer.js
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
- API Key 연결 확인
- 조직과 채널 조회
- 조직/채널 선택 및 저장
- API Key 마스킹과 도움말 링크
- 단위 테스트

### Phase 2: SNS Sheet Store

- `sns` 시트 자동 생성과 헤더 동기화
- 상태 dropdown 추가
- RSS entry와 채널별 행 append
- `entry_key` / `delivery_key` 중복 확인
- 첫 `대기` 행 조회와 상태/결과 업데이트

### Phase 3: RSS Discovery

- 네이버/WordPress RSS 정규화
- 대표 이미지 추출
- 새 entry를 현재 선택 채널별 `대기` 행으로 추가
- 새 채널의 과거 글 소급 등록 방지

### Phase 4: Distribution Runner

- 최소 10분 timer
- 행 번호 기준 첫 `대기` 행 한 건 처리
- Buffer `shareNow`
- 일시 오류 총 3회 시도와 10초 간격
- 완료/실패/건너뜀 및 Buffer Post ID 기록

### Phase 5: Operational Visibility

- 설정 화면에 연결/runner 상태 표시
- 대시보드 activity 기록
- 수동 1회 실행과 진단 로그
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
- 해시태그 추천
- 자동 영구 재시도
- 24시간 발행 상한
- Spreadsheet 분산 lock
