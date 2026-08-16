# Keyword Gateway Architecture

## Purpose

Keyword Gateway는 BlogGenius 데스크톱 패키지에 네이버 API 자격증명을 넣지
않고 검색량, 연관 키워드, 블로그 문서 수를 제공한다. Gateway는 범용 네이버
API proxy가 아니라 `keyword_research` capability만 제공한다.

## Trust Boundaries

```text
Desktop
  -> Supabase issue-keyword-access-token (license key + HWID)
  <- short-lived keyword token
  -> Keyword Gateway (token + subject + keywords)
  <- normalized keyword analysis
  -> Desktop AI title generation
```

- 라이선스 원문은 Supabase license boundary를 벗어나지 않는다.
- 네이버 secret은 Keyword Gateway host를 벗어나지 않는다.
- 데스크톱은 15분 토큰을 메모리에만 저장한다.
- Gateway는 token `sub`를 rate-limit identity로 사용한다.
- `aud`와 `scope`가 다른 토큰은 거부하므로 trends token을 재사용할 수 없다.

## Provider Contract

```text
kind: keyword_research
transport: remote_api
provider: BlogGenius Keyword Gateway
```

운영 기본 transport는 `remote_api`다. `local_api`는 서버 연동 진단을 위한
개발 환경변수 방식이며 사용자 `config.json`에서는 선택하거나 credential을
설정할 수 없다.

## Request Policy

- `KEYWORD_MAX_INPUT_COUNT`: 입력 키워드 상한, 기본 3
- `KEYWORD_MAX_RELATED_CANDIDATES`: 모든 입력 키워드에서 합친 연관 후보 상한,
  기본 8
- 입력 3개와 연관 후보 8개라면 Blog Search는 최대 11회다.
- Search Ads 결과를 합치고 중복 제거한 뒤 검색량과 주제 관련성으로 선별한다.
- 클라이언트는 후보 수를 낮춰 요청할 수 있지만 서버 상한보다 높일 수 없다.

## Failure Behavior

- `401`: 데스크톱이 토큰을 한 번 갱신하고 재시도한다.
- `429`: 즉시 사용자용 요청 과다 상태로 변환한다.
- timeout, upstream failure, quota exhaustion: 검색 지표 분석을 건너뛴다.
- 분석이 실패해도 데스크톱 AI 제목 추천은 입력 주제와 키워드로 계속한다.

## Secret Rotation

네이버 자격증명은 Gateway service environment에서 교체한 후 process를
재시작한다. 토큰 signing secret은 Supabase와 Gateway를 함께 갱신해야 하므로
기존 15분 토큰의 만료 시간을 고려해 배포한다. secret 값은 앱 설정, 로그,
응답, 저장소 문서에 기록하지 않는다.
