# Trend Posting Plan

Updated: 2026-08-12

## Goal

Trend Posting은 네이버 트렌드에서 글감을 찾고 선택하는 간단한
frontend다. 별도의 글쓰기 엔진이나 작성 화면을 만들지 않고, 선택한
키워드를 기존 Quick Posting 또는 Google Spreadsheet `topics` 저장소로
연결한다.

```text
Naver trends API
  -> 기간과 트렌드 카테고리로 조회
  -> 중복 키워드 집계
  -> 빠른 포스팅에서 작성 또는 글감 저장
  -> existing BlogGenius lifecycle
```

유효한 라이선스를 가진 사용자는 트렌드를 조회할 수 있다. 트렌드 조회와
글감 저장은 발행 quota를 사용하지 않으며, 실제 발행은 기존 quota
lifecycle을 따른다.

## Product Contract

### 역할 분리

- Trend Posting: 트렌드 탐색과 글감 선택
- Quick Posting: 작성 옵션 입력, AI 생성, 미리보기, 발행
- Batch Posting: 저장된 글감 검토와 상태 관리
- `topics`: 모든 수동·일괄 작성 작업의 durable repository

Trend Posting 전용 생성, 미리보기, 재시도, 예약, 발행 경로를 만들지
않는다.

### 행별 동작

각 결과 행은 다음 두 동작만 제공한다.

1. `빠른 포스팅에서 작성`
   - Quick Posting의 AI 입력 모드로 이동한다.
   - 선택 키워드를 Subject와 Keywords에 채운다.
   - Quick Posting에 이미 입력된 개별 글감이 있으면 덮어쓰기 전에 확인한다.
   - 기존 카테고리, 발행 대상, 이미지 생성 등 작성 설정은 유지한다.
   - 사용자가 Quick Posting에서 저장·생성·발행을 실행할 때 기존 계약대로
     `topics`에 먼저 추가한다.
   - `source=naver_trend`와 결과의 `latestTrendDate`를 topics 행까지
     보존한다.
2. `글감 저장`
   - 선택 키워드를 Subject와 Keywords로 사용해 즉시 `topics`에 추가한다.
   - 초기 상태는 `대기`다.
   - `발행 준비 완료`는 자동 포스팅 후보라는 기존 의미를 유지하며, 단순
     저장 동작에서 사용하지 않는다.
   - 성공한 행은 중복 클릭을 막고 `저장됨` 피드백을 표시한다.

Trend Posting 안에는 별도의 작성 다이얼로그나 복제된 Quick Posting 설정
폼을 두지 않는다.

### Quick Posting handoff

화면 전환은 DOM 복사만으로 구현하지 않고 작은 일회성 입력 context를
사용한다.

```json
{
  "subject": "성수 맛집",
  "keywords": ["성수 맛집"],
  "source": "naver_trend",
  "trendDate": "2026-08-11"
}
```

Quick Posting payload builder는 이 context의 provenance를 포함한다. 입력을
지우거나 다른 일반 글감을 시작하면 오래된 provenance가 다음 글에 섞이지
않아야 한다.

## Query UX

Trend Posting 탭은 다음 순서로 구성한다.

1. 기간 선택
2. 트렌드 카테고리 다중 선택
3. 조회 버튼
4. 결과 테이블

기간 선택:

- `최신 데이터 (M월 D일)`: API metadata가 반환한 최대 날짜
- `최근 7일`: 최신 데이터 날짜를 포함한 7일
- `직접 지정`: 최대 31일

`오늘`은 제공하지 않는다. 수집 지연이 있을 수 있으므로 실제 최신 데이터
날짜를 표시한다.

트렌드 카테고리:

- 다중 선택, 최대 5개
- 현재 선택 수를 `2/5`처럼 표시
- 한도에 도달하면 나머지 선택을 비활성화하고 이유를 즉시 표시

결과 테이블은 집계된 unique keyword만 표시한다.

- 트렌드 카테고리
- 최신 반영일
- 키워드
- 상승/변화 지표
- `빠른 포스팅`
- `글감 저장`

등장 횟수나 절대 검색량처럼 해석될 수 있는 값은 표시하지 않는다.

## Data And API

원격 trends API는 discovery source이며 job store가 아니다. 데스크톱 UI는
기존 local API만 사용한다.

```text
GET /api/v1/trend-posting/meta
GET /api/v1/trend-posting/keywords
GET /api/v1/trend-posting/recent-topics?days=15
POST /api/v1/trend-posting/topics
```

`keywords`는 `categories[]`, `dateFrom`, `dateTo`를 받는다. 서버는 최대
31일 범위, 최대 5개 카테고리, 5,000 raw rows 상한을 검증하고 중복
키워드를 집계한다.

`recent-topics`는 기존 topics 저장소에서 최근 15일의 주제와 키워드를
정규화해 중복 제외용 최소 데이터만 반환한다.

글감 저장과 Quick Posting 실행은 기존 `appendGoogleSheetTopics`와
quick-publish contract를 사용한다. 별도의 Spreadsheet schema를 추가하지
않는다.

Trend provenance mapping:

| topics value | source |
| --- | --- |
| subject | selected keyword |
| keywords | selected keyword |
| source | `naver_trend` |
| trend date | `latestTrendDate` |
| status | direct save는 `대기`; Quick Posting은 기존 mode 규칙 |
| options | Quick Posting 실행 시 현재 Quick Posting 설정 snapshot |

## Security

- 데스크톱 앱에 내부 trends bearer token이나 Supabase secret을 넣지 않는다.
- 기존 Edge Function이 유효한 license와 HWID를 검증하고 15분
  `trends:read` token을 발급한다.
- 앱은 token을 메모리에만 보관한다.
- Oracle trends API는 signature, issuer, audience, expiry, scope를 검증한다.
- user read token과 internal bearer token은 서로 대체할 수 없다.

## Architecture Boundaries

- `src/trend-posting/`: 조회 검증, remote transport, 집계
- `src/ui-api/services/trend-posting.service.js`: 인증된 조회와 안정적인 local
  response
- Quick Posting runtime: handoff context를 기존 topics payload에 포함
- existing topics append boundary: direct `글감 저장`
- `ui/index.html`, `ui/app.js`, `ui/styles.css`: 필터, 결과, 두 행 동작과 상태

Trend Posting UI가 Quick Posting DOM에서 설정값을 읽어 복제 payload를
만들지 않는다.

## Delivery Order

현재 branch는 `feature/trend-posting-composer`, integration branch는
`feature/trend-posting-main`이다.

1. 이 plan과 handoff를 최신 제품 계약으로 갱신한다.
2. Quick Posting handoff context와 provenance 전달을 구현한다.
3. `글감 저장`을 기존 topics append contract에 연결한다.
4. Trend Posting 탭, filters, results table과 행 상태를 구현한다.
5. 각 개발 단계의 기본 구현이 완료되면 사용자에게 알리고 UI 검증을
   맡긴다.
6. 기능 범위가 안정된 pre-release/release 단계에서 Quick Posting 회귀와
   Trend Posting 단위 테스트를 묶어서 실행한다.
7. commit, merge, push, branch 삭제 전 사용자 승인을 받는다.

## Validation

- 최신 날짜, 최근 7일, 직접 지정 기간 계산
- 카테고리 최대 5개와 31일 범위 검증
- 집계 결과 rendering과 변화 지표 표현
- 작성 동작이 Subject와 Keywords를 채우고 Quick Posting으로 이동
- 작성 중인 Quick Posting 입력의 덮어쓰기 확인
- 일반 Quick Posting의 `source`와 `trendDate` 회귀 없음
- Trend handoff의 `source=naver_trend`, `trendDate` 보존
- `글감 저장`이 AI를 실행하지 않고 `대기` 상태로 append
- 저장 성공 후 중복 제출 방지와 오류 복구
- 생성·미리보기·발행·예약·다중 target의 기존 Quick Posting 회귀

## Future Extension

여러 키워드 선택, 선택 항목 일괄 저장, 선택 항목 일괄 작성은 첫 릴리스에
포함하지 않는다. 향후 필요하면 결과 테이블 왼쪽 checkbox와 toolbar를
추가하되, 사용하지 않는 placeholder control은 미리 노출하지 않는다.

## Queued UI Follow-up

UI 개선은 한 번에 합치지 않고 다음 순서로 진행한다.

1. 완료: 기존 자동글감 설정의 section, form grid, category button, action
   row를 재사용해 기간·날짜·카테고리 레이아웃을 안정화한다.
2. 완료: `글감 저장`의 성공·실패 상태와 실제 오류를 해당 결과 행 안에
   지속적으로 표시한다.
3. 완료: 단건 `글감 저장`에서는 세션 시작 시 수행한 시트 준비 상태를
   재사용하고, 일괄 작업용 append 후 고정 대기를 생략한다.
4. 완료: 키워드, 카테고리, 최신 반영일, 변화 column 클릭 정렬과 활성
   정렬 방향 표시를 추가한다. 최초 기준은 최신 반영일 내림차순이다.
5. 완료: 조회 조건을 접는 대신 Trend Posting의 내부 세로 스크롤을 없애고
   페이지 스크롤 하나로 통합한다. 조회 영역이 화면 위로 사라진 뒤에는
   결과 filter toolbar와 table header가 하나의 연속된 고정 영역이 되고
   compact row만 그 아래로 이동한다.
6. 완료: 이미 조회한 결과에 키워드 검색과 단일 보기 preset을 즉시
   적용하고 전체 결과 대비 표시 건수를 함께 보여준다. 보기 preset은 전체,
   상승 전체, 급상승 Top 10, new, 하락, 변화 없음만 제공한다. 복잡도를
   높이는 최소 상승값과 급상승 Top 30은 제공하지 않는다.
7. 완료: `topics`의 최근 15일 주제·키워드를 기준으로 결과에서 최근 저장
   글감을 제외하는 선택 옵션을 추가한다. 글감 저장 성공 시 현재 제외
   목록에도 즉시 반영한다.

각 단계의 기본 구현이 완료되면 사용자에게 알린다. UI 확인은 사용자가
수행하며, 단위·회귀 테스트는 개발 중 매 단계마다 실행하지 않고 전체 개발
범위가 안정된 pre-release/release 검증 단계에서 수행한다.
