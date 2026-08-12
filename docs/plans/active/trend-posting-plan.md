# Trend Posting Plan

## Goal

사용자가 네이버 트렌드 데이터를 탐색하고, 선택한 키워드를 기반으로 같은 화면에서 블로그 글을 생성·미리보기·발행할 수 있게 한다.

이 기능은 `블로그 > 트렌드 포스팅` 탭에 제공한다. 유효한 라이선스를 가진 모든 사용자가 트렌드를 조회하고 글을 생성할 수 있다. 트렌드 조회와 글 생성은 발행 quota를 사용하지 않으며, 실제 발행은 기존 quota lifecycle을 따른다.

## Product Decisions

- 주제는 여러 개를 함께 선택할 수 있다.
- 기간은 `오늘`, `최근 7일`, `직접 지정`을 지원한다.
- 같은 키워드가 선택 기간 또는 선택 주제에 여러 번 나타나면 한 행으로 합친다.
- 등장 횟수는 보여주지 않는다.
- 현재 수집 데이터는 절대 검색량을 제공하지 않는다. UI에는 `인기도` 대신 `상승 지표`를 사용한다.
- 행의 키워드 자체를 글의 기본 제목과 핵심 키워드로 사용한다. AI 주제 추천 단계를 추가하지 않는다.
- 작성 옵션은 빠른 포스팅으로 이동하지 않고 트렌드 포스팅 탭 안에서 바로 설정한다.
- 기존 빠른 포스팅의 생성, 미리보기 검증, quota 사전 검증, 발행 경로는 재사용한다.

## Scope

### Included

- 트렌드 카테고리 다중 선택과 날짜 범위 조회
- 기간 내 중복 키워드 집계와 정렬
- 트렌드 결과 테이블과 키워드 선택 상태
- 동일 탭의 AI 글 작성 옵션, 미리보기, 발행
- 사용자 라이선스 기반의 읽기 전용 trends API 접근 토큰
- 조회/집계/권한/작성 요청의 단위 및 통합 테스트

### Excluded

- 절대 검색량 또는 검색량 예측 제공
- 트렌드 수집 주기나 수집기의 변경
- 트렌드 키워드의 자동 발행 또는 일괄 발행
- WordPress 다운로드 UI의 기능 변경
- 기존 `cmd_trends` 수집 권한 정책 변경

## UX Contract

### Layout

한 개의 `트렌드 포스팅` 탭을 다음 순서로 구성한다.

1. 필터 영역: 주제 다중 선택, 기간 선택, 직접 날짜 범위, 조회
2. 결과 테이블: 키워드, 주제, 최근 반영일, 상승 지표, 글쓰기
3. 작성 영역: 선택된 키워드, 참고/지시사항, 작성 전략, 카테고리, 포스팅 옵션, 대상, 이미지 생성, 외부 참고
4. 생성 결과: 기존 빠른 포스팅과 같은 미리보기 및 최종 발행 동작

키워드를 선택하기 전 작성 영역의 생성·발행 동작은 비활성화한다. 새 키워드를 선택하면 제목과 키워드를 해당 값으로 채우되, 사용자가 이미 입력한 작성 옵션은 유지한다.

### Result Rows

행의 집계 키는 공백 정리와 소문자 비교를 적용한 `keyword`다. 표시에는 가장 최근에 수집된 원문 키워드를 사용한다.

- `주제`: 해당 키워드가 포함된 카테고리를 중복 없이 태그로 표시
- `최근 반영일`: 집계 대상 중 가장 최근 `trend_date`
- `상승 지표`: 가장 최근 항목의 `change_raw`, `change_type`, `change_amount`
- 기본 정렬: 최근 반영일 내림차순, 상승량 내림차순, 카테고리 내 노출 순서 오름차순

`new`, `steady`, `down` 값은 숫자로 가장하지 않고 각각의 원본 상태를 명확히 표시한다.

## Data And API Design

### Data Source

Supabase의 `trends.items`는 `apps/trends/trends-api`만 service-role 자격으로 접근한다. 데스크톱 앱은 Supabase에 직접 접근하지 않는다.

기존 trends API의 원시 조회 계약은 유지한다.

```text
GET /api/v1/trends
GET /api/v1/trends/meta
```

데스크톱 전용 API는 이 원시 결과를 프록시하고 UI가 필요한 집계 결과만 반환한다. 앱 UI가 원격 API의 토큰이나 행 스키마에 직접 결합되지 않도록 한다.

```text
GET /api/v1/trend-posting/meta
GET /api/v1/trend-posting/keywords
```

`keywords` 요청은 `categories[]`, `dateFrom`, `dateTo`를 받으며, 서버에서 범위를 검증하고 중복 키워드를 집계한다. 직접 지정 기간은 최대 31일로 제한한다. 원격 API의 단일 조회 상한인 5,000행에 도달하면 일부 결과를 조용히 표시하지 않고, 기간이나 주제를 줄이라는 오류를 반환한다. 응답에는 UI에 필요한 필드만 포함한다.

```json
{
  "items": [
    {
      "id": "stable-key",
      "keyword": "성수 맛집",
      "categories": ["맛집", "국내여행"],
      "latestTrendDate": "2026-08-11",
      "change": { "raw": "▲ 48", "type": "up", "amount": 48 },
      "displayOrder": 1
    }
  ]
}
```

## Security Design

### Existing Internal Access

`TRENDS_API_TOKEN`은 수집기와 WordPress 서버 간 통신용 공유 비밀로 유지한다. 설정되어 있지 않으면 현재 trends API가 인증 없이 열리므로, production에서 토큰 설정은 필수다.

### User Read Access

데스크톱 앱에는 `TRENDS_API_TOKEN`, Supabase secret key, 장기 API 비밀을 넣지 않는다.

1. 앱이 기존 라이선스 키와 HWID로 라이선스 Edge Function에 접근 토큰 발급을 요청한다.
2. Edge Function은 서버 측에서 유효 라이선스를 검증한다. `cmd_trends`는 검사하지 않는다.
3. 성공 시 `aud=trends-api`, `scope=trends:read`, 라이선스 식별자, 만료 시각을 포함한 짧은 수명 토큰을 발급한다.
4. 앱의 trend posting service가 HTTPS trends API 호출에 토큰을 붙인다.
5. trends API는 서명, audience, expiry, scope를 검증하고 읽기 endpoint만 허용한다.

권장 만료 시간은 15분이며, 앱은 토큰을 메모리에만 보관하고 만료 전에 한 번 갱신을 시도한다. Oracle API는 익명화된 라이선스 식별자(`sub`) 단위 요청 제한을 적용하고, HTTPS reverse proxy는 IP 단위 요청 제한을 적용한다. 두 제한은 서로 대체하지 않는다.

내부 bearer 토큰과 사용자 읽기 토큰은 서로 대체할 수 없다. ingest endpoint는 내부 bearer 토큰만 허용한다.

## App Architecture

- `src/trend-posting/`: 필터 정규화, 원시 행 집계, 표시 모델, 요청 검증
- `src/trend-posting/access-token-cache.js`: 15분 읽기 토큰을 메모리에만 보관하고, 만료 1분 전 갱신 및 동시 발급 단일화를 담당
- `src/trend-posting/remote-client.js`: `https://trendapi.hangadac.com` 읽기 endpoint 호출과 401 발생 시 단 한 번의 토큰 갱신을 담당
- `src/ui-api/services/trend-posting.service.js`: 사용자 토큰 발급 경계, 원격 trends API 호출, 집계 결과와 안정적인 로컬 오류 계약을 제공
- `src/ui-api/controllers/trend-posting.controller.js` 및 route: 로컬 UI API 경계
- `src/content/` 또는 기존 quick publish 경계: 선택 키워드를 AI 생성 요청으로 변환하고 기존 미리보기·발행 경로 재사용
- `ui/index.html`, `ui/app.js`: 트렌드 포스팅 탭 및 상태 제어

작성 옵션 UI는 빠른 포스팅의 AI 생성 모드와 중복 구현하지 않는다. 공통 payload builder와 preview/publish 상태 전이를 추출하고, 두 화면은 입력값만 각각 제공한다.

## Delivery Branches

이 기능은 동시에 여러 sibling 브랜치를 진행하지 않고 `dev`를 기준으로 순차적으로 통합한다.

```text
main -> dev -> current feature branch
                 │
                 └─ 완료·검증 후 dev에 병합
                              │
                              └─ next feature branch
```

현재 `feature/trend-posting-access`에서 다음 범위를 함께 완료한다.

- Edge Function 토큰 발급과 trends API 사용자 토큰 검증
- 보안 테스트와 운영 문서
- 앱의 trend posting service와 로컬 API
- 필터 검증, 기간별 중복 집계, 토큰 캐시와 단위 테스트

이 범위를 실제 환경에서 검증하고 `dev`에 병합한 뒤에만 다음 작업 브랜치를 `dev`에서 만든다.

1. 다음 브랜치: 빠른 포스팅의 공통 작성 payload·미리보기·발행 흐름 추출과 회귀 테스트
2. 이후 브랜치: 탭, 필터, 결과 테이블, 선택 상태, 작성 옵션 UI
3. 마지막 브랜치: 실제 API 연결 오류 상태, 보안·회귀 테스트와 문서 정리

검증된 릴리스만 `dev`에서 `main`으로 병합한다.

## Validation

- 라이선스 유효/만료/권한 없는 사용자 토큰 발급 테스트
- 사용자 토큰과 내부 토큰의 endpoint 분리 테스트
- 다중 카테고리, 오늘/7일/직접 기간, 날짜 오류 검증 테스트
- 키워드 중복 집계와 정렬 테스트
- 선택 키워드가 제목·키워드에 전달되는 테스트
- 이미지 생성, 외부 참고, 예약, 다중 대상의 기존 빠른 포스팅 회귀 테스트
- 실제 HTTPS 배포 환경에서 인증된 조회와 만료 토큰 재발급 확인

## Rollout

1. Edge Function과 trends API 보안 변경을 먼저 배포한다.
2. 앱 기능을 배포하기 전에 유효 라이선스에서 읽기 토큰과 조회가 동작하는지 확인한다.
3. 앱 UI를 배포하고, 초기에는 결과 수와 오류율을 운영 로그로 관찰한다.
4. 실제 검색량 수요가 확인되면 별도 데이터 제공자와 비용·약관을 검토한다.
