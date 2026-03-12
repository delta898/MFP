# Google Sheets Credentials Plan

> Status: active plan
>
> Scope: Google Spreadsheet 접근 자격증명 모델을 **OAuth 단일 방식** 기준으로 재정의한다.
>
> This plan is the working document. When implementation stabilizes, promote the final structure into `docs/architecture/` and record long-lived rationale in `docs/decisions/`.

## Purpose

이 프로그램은 SaaS가 아니라 **사용자 컴퓨터에서 직접 설치·실행되는 독립 Application**이다.
이 전제에서는 개발자 소유의 공용 `service_account.json`을 앱에 넣어 배포하는 방식이 적절하지 않다.

핵심 이유:
- 공용 service account를 앱이 직접 읽으면 사실상 개발자 secret을 사용자에게 배포하는 구조가 된다.
- 로컬 파일이든 Supabase든, **앱이 직접 secret 원문을 읽는 순간 보안 모델은 크게 다르지 않다**.
- 사용자 편의는 좋아질 수 있지만, 보안/쿼터/오남용/통제 측면에서 장기적으로 감당하기 어렵다.

이번 설계의 목표는 다음과 같다.

1. Google Sheets 연결의 **기본 방식**을 OAuth로 전환한다.
2. 사용자는 Google 계정으로 로그인/승인만 하면 되게 만든다.
3. 토큰 갱신/만료/재연결 UX를 최대한 단순하게 설계한다.
4. 70대 사용자도 쓸 수 있을 정도로 온보딩 문구와 흐름을 단순화한다.

## Decision Summary

- **Google Sheets 연결 방식은 OAuth 하나로만 간다.**
- Google Sheets 접근은 사용자 자신의 Google 계정 권한으로 수행한다.
- 앱은 access token / refresh token을 저장하고 재사용한다.
- refresh token이 유효한 동안은 재로그인 없이 자동 갱신한다.
- `service_account.json` 업로드/등록 흐름은 제품 구조에서 제거한다.
- 개발자 공용 service account를 앱에 내장하거나 중앙 DB에서 앱으로 배포하는 방식은 채택하지 않는다.

## Why OAuth

### 독립 앱에 맞는 권한 모델
- 사용자는 자기 Google 계정으로 승인한다.
- 앱은 사용자 자원에 대해 사용자 권한으로 접근한다.
- 개발자 secret을 배포하지 않는다.

### 사용자 경험 측면
- 사용자는 Google Cloud 프로젝트, service account, JSON 파일 생성 과정을 몰라도 된다.
- 연결 경험은 `로그인 → 승인 → 연결 완료`로 단순화된다.
- refresh token이 살아 있으면 매번 다시 로그인하지 않아도 된다.

### 운영 측면
- credential 소유권이 사용자에게 있다.
- 멀티 사용자/다중 설치 환경에서도 책임 경계가 자연스럽다.

## What OAuth Means Here

OAuth 흐름은 현재 네이버 로그인 세션 보관과 감각적으로 비슷하지만, 저장되는 정보와 갱신 방식은 다르다.

### 네이버 현재 방식
- 브라우저 세션/쿠키 기반
- 세션 만료 시 다시 로그인 필요

### Google OAuth 방식
- access token + refresh token 기반
- access token은 짧고, refresh token으로 자동 갱신 가능
- 따라서 네이버보다 재로그인 빈도가 낮을 수 있다

## User Experience Goals

### 최우선 목표
사용자는 아래만 이해하면 된다.
1. `Google 계정으로 연결`
2. Google 창이 열리면 로그인/승인
3. 연결 완료 후 시트 URL만 입력하거나 확인
4. `연결 테스트`로 정상 여부 확인

### 피해야 할 것
- Google Cloud 콘솔 설명
- client id / PKCE / service account / redirect URI 같은 용어 노출
- JSON 파일 업로드를 기본 방식으로 안내
- `service_account.json의 이메일을 공유하세요` 같은 구형 안내

### 사용자 문구 원칙
- `Google Spreadsheet를 연결하려면 Google 계정으로 로그인하세요.`
- `이 앱이 스프레드시트에 접근하도록 승인해 주세요.`
- `연결이 끊기면 다시 로그인하시면 됩니다.`
- 내부 구현 용어는 숨긴다

## Target Connection Model

### 단일 방식: OAuth
- 설정 화면에서 `Google 계정으로 연결` 버튼 제공
- 브라우저를 열어 Google 승인 진행
- 승인 완료 후 앱이 토큰 저장
- 연결 상태를 UI에 표시

### 제외
- service account JSON 업로드/등록
- 개발자 제공 shared credential
- 사용자에게 Google Cloud 설정을 요구하는 흐름

## Token Storage Design

### 파일 경로
- 기본 경로: `config/google_oauth_tokens.json`
- `config.json`과 분리한다.
- 이유:
  - 일반 설정과 인증 토큰의 생명주기가 다르다.
  - 마스킹/삭제/백업 정책을 분리하기 쉽다.
  - UI 저장/자동 저장 흐름과 섞지 않는다.

### 저장 내용
```json
{
  "provider": "google",
  "connected_email": "user@gmail.com",
  "access_token": "...",
  "refresh_token": "...",
  "expiry_date": 1773320000000,
  "scope": "https://www.googleapis.com/auth/spreadsheets",
  "token_type": "Bearer",
  "last_verified_at": "2026-03-12T16:00:00+09:00"
}
```

### 규칙
- `refresh_token`이 있으면 자동 갱신 우선
- 로그/UI에는 token 원문 노출 금지
- 연결 해제 시 토큰 파일 삭제 또는 무효화

## OAuth Technical Shape

- Google OAuth **Desktop App + PKCE** 기준으로 구현한다.
- 앱은 `client_id`를 사용한다.
- Google Desktop OAuth client에서 발급된 `client_secret`도 함께 사용한다.
- code exchange 시 `code_verifier`를 포함한다.
- 토큰 저장/갱신은 사용자 로컬 토큰 파일 기준으로 처리한다.

## OAuth Callback Design

### 결론
- **도메인 불필요**
- **loopback callback** 사용

### callback URL 형식
- `http://127.0.0.1:{randomPort}`
- OAuth 시작 시 임시 loopback 서버를 열고 해당 포트를 사용
- callback 처리 후 브라우저에는 간단한 완료 페이지 표시
  - `연결이 완료되었습니다. 이 창을 닫고 앱으로 돌아가세요.`

### 왜 이 방식인가
- 독립 설치형 앱에 적합
- 도메인/리버스프록시/공개 서버가 필요 없음
- 사용자는 브라우저 로그인만 보면 됨

### 이번 단계에서 하지 않을 것
- custom URI scheme
- 수동 auth code 복사/붙여넣기
- Telegram 안에서 로그인 완료

## UI / UX Direction

### 현재 UI에서 바꿀 것
현재 `GOOGLE_SHEET_URL` 아래에 있는:
- `service_account.json` 이메일 공유 안내
- `설정 가이드`
- JSON 업로드/붙여넣기 영역
은 제거 대상이다.

### 최종 설정 화면 구조

#### 섹션: Google 스프레드시트 연결
- 상태: `미연결` / `연결됨 (user@gmail.com)` / `다시 로그인 필요`
- 버튼:
  - `Google 계정으로 연결`
  - 연결 후 `다시 연결`
  - `연결 해제`
  - `연결 테스트`
- 보조 문구:
  - `Google 계정을 연결하면 스프레드시트에 직접 접근할 수 있습니다.`

#### 섹션: 스프레드시트
- `GOOGLE_SHEET_URL`
- 버튼:
  - `구글 스프레드시트 가기`
  - `연결 테스트`

### 사용자 안내
- `먼저 Google 계정을 연결한 뒤 스프레드시트 주소를 입력하세요.`
- `연결이 끊기면 다시 로그인하시면 됩니다.`

## State Model

### 연결 상태 enum
- `disconnected`
- `connected`
- `reauth_required`
- `error`

### 상태 판단 기준
- 토큰 파일 없음 → `disconnected`
- refresh 가능 + 테스트 성공 → `connected`
- refresh 실패 / invalid_grant → `reauth_required`
- 기타 오류 → `error`

## API Direction

### UI API
- `GET /api/v1/google-oauth/status`
  - 현재 연결 상태, 이메일, 마지막 검증 시각
- `POST /api/v1/google-oauth/start`
  - loopback OAuth 시작, 브라우저 오픈용 URL 반환
- `POST /api/v1/google-oauth/disconnect`
  - 로컬 토큰 제거
- `POST /api/v1/google-oauth/test`
  - 연결 상태 + 현재 `GOOGLE_SHEET_URL` 접근 테스트

### callback 처리
- `GET /oauth/google/callback`
  - 인증 code 수신
  - 토큰 교환
  - 토큰 파일 저장
  - 완료 HTML 반환

## Telegram / Agent Direction

Telegram에서는 최소한 아래만 지원한다.
- `현재 Google Spreadsheet 연결 상태 알려줘`
- `Google 연결 다시 해야 해?`

정책:
- Telegram은 상태 조회/안내만
- 실제 로그인/승인은 UI 또는 브라우저에서만 진행

## Failure Cases to Design For

1. **연결 안 됨**
   - 안내: `Google 계정을 먼저 연결해 주세요.`

2. **토큰 만료 / refresh 실패**
   - 안내: `Google 연결이 만료되어 다시 로그인이 필요합니다.`

3. **잘못된 시트 URL/ID**
   - 안내: `스프레드시트 주소를 다시 확인해 주세요.`

4. **권한 부족**
   - 안내: `현재 연결한 Google 계정으로 이 스프레드시트에 접근할 수 없습니다.`

5. **Google API 오류**
   - 안내: `Google 연결 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.`

## Security Rules

- 개발자 공용 `service_account.json`을 앱에 내장하지 않는다.
- Supabase 등 외부 저장소에 공용 credential을 넣고 앱이 직접 읽게 하지 않는다.
- 이유: 저장 위치만 바뀌는 것이지, 앱이 secret을 읽는 구조라면 보안 모델이 개선되지 않는다.
- `service_account.json` 기반 접근 흐름은 제품 구조에서 제거한다.
- 사용자 토큰은 사용자 로컬 환경 기준으로 관리한다.
- UI/로그에 토큰/secret 원문을 노출하지 않는다.

## Migration Direction

### 현재 상태
- `GOOGLE_SHEET_URL` 입력 UI는 이미 있다.
- `service_account.json` 기반 문구/업로드 UI가 남아 있다.

### 목표 상태
- `GOOGLE_SHEET_URL`은 유지한다.
- 인증 방식은 OAuth로 교체한다.
- `service_account.json` 관련 UI/문구/저장 흐름은 제거한다.

### 단계
1. 문구와 설계를 OAuth 기준으로 전환
2. OAuth 연결 상태 모델 추가
3. 연결/재연결/테스트 UX 추가
4. service account UI 제거

## Implementation Phases

### Phase 1 — 상태 모델 / callback / 저장 구조
- `config/google_oauth_tokens.json` 구조 정의
- loopback callback 서버 설계
- 연결 상태 API 정의

### Phase 2 — 연결 흐름
- `Google 계정으로 연결` 버튼
- 브라우저 승인 플로우
- 토큰 저장
- 연결 상태 표시

### Phase 3 — 테스트/복구
- 연결 테스트
- 만료/재로그인 안내
- 연결 해제

### Phase 4 — 기존 방식 제거
- `service_account.json` 업로드/붙여넣기 UI 제거
- 관련 문구/설정/가이드 제거
- Agent/문서도 OAuth 기준으로 정리

## Open Questions

1. 토큰 파일 암호화까지 이번 단계에 포함할지
2. 연결 완료 후 브라우저를 자동으로 닫을지, 안내 페이지만 보여줄지
3. Google 연결 상태를 dashboard에도 노출할지
4. Telegram에서 상태 조회 범위를 어디까지 열지

## Exit Criteria

이 plan은 아래가 명확해지면 다음 단계로 넘어간다.
- 기본 연결 방식이 OAuth로 확정된다.
- `GOOGLE_SHEET_URL` 유지 + 인증 방식 교체 방향이 정리된다.
- 토큰 파일 경로와 callback 방식이 결정된다.
- UI/API/상태 모델이 구현 가능한 수준으로 구체화된다.
