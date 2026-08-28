# Runtime Credential Security Main Plan

> 작성일: 2026-08-28
> 상태: Stage 1 계약·전환 설계 진행 중
> Parent branch: `feature/runtime-credential-security-main`
> 기준 branch: `dev`

## 1. 목표

BlogGenius의 공개 런타임 설정, Desktop 앱 설정, 사용자 인증 상태, 외부 provider 자격증명을
서로 다른 신뢰 경계로 분리한다. Desktop이 서버 자격증명 원문을 내려받는 현재 경로를 제거하면서
Google OAuth, 외부 참고 글 검색, 쇼핑 상품 fallback과 Naver 뉴스 기능을 유지한다.

이번 parent의 완료 상태는 다음과 같다.

```text
공개 Runtime Config
  -> 비민감 key allowlist만 반환

Google OAuth
  -> Desktop App + PKCE 유지
  -> OAuth 앱 설정은 개발 환경 또는 빌드 입력
  -> 사용자 token은 우선 로컬 JSON 유지

Naver Developers Search
  -> Edge Function 내부에서만 Client ID/Secret 사용
  -> Desktop에는 기능별로 제한된 결과만 반환

Production
  -> 자동 변경하지 않음
  -> 구버전 전환, secret row 삭제와 credential 회전은 별도 승인
```

새 개발 PC bootstrap 자동화는 이 parent의 범위가 아니다. 현재 기능이 안정화된 뒤 별도 feature로
진행하며, 이번 parent는 bootstrap이 검사해야 할 OAuth/Secret 계약만 문서화한다.

## 2. 현재 확인된 문제

### 2.1 `app_runtime_configs`가 서로 다른 책임을 가진다

현재 테이블에는 다음 종류의 값이 함께 들어갈 수 있다.

- 공개 가능한 환경 표식과 TTL 같은 서버 설정
- Google Desktop OAuth Client ID/Secret
- Naver Developers Client ID/Secret

`get_runtime_config(text[])`는 `SECURITY DEFINER`이며 `anon`에게 실행 권한이 있다. 요청 key가
`null`이거나 빈 배열이면 모든 활성 설정을 반환할 수 있다. 따라서 테이블 RLS가 활성화되어 있어도
RPC가 민감값을 Desktop에 대신 반환한다.

### 2.2 Google과 Naver의 자격증명 성격이 다르다

- Google Desktop OAuth Client Secret은 설치형 앱에 포함되는 앱 설정이며, 배포된 실행 파일에서
  추출 가능하다는 전제를 가진다. 이를 server secret처럼 DB에서 Desktop에 배포해도 보호되지 않는다.
- Naver Developers Client Secret은 공용 API quota를 사용하는 provider 자격증명이다. Desktop에
  전달하지 않고 서버에서 제한된 기능을 수행해야 한다.
- Google access/refresh token과 Naver browser session은 개발자 provider credential이 아니라
  사용자별 인증 상태다.

### 2.3 같은 Naver 자격증명이 여러 기능에서 사용된다

| 기능 | 현재 호출 위치 | 현재 동작 |
| --- | --- | --- |
| 외부 참고 글 검색 | `src/core.js`, `src/utils.js` | Desktop이 Naver Blog Search API 직접 호출 |
| 쇼핑 상품 fallback | `src/shopping-manager.js` | Desktop이 Naver Shopping Search API 직접 호출 |
| Naver 뉴스 | `knowledge-gateway` provider | Edge Function이 Naver News Search API 호출 |
| 미사용 단건 블로그 검색 | `src/utils.js` | 정의만 있고 호출자 없음 |

키워드 탐색의 SearchAd/API Hub 자격증명은 별도 계약이며 이번 Naver Developers 자격증명과 합치지
않는다.

## 3. 승인된 소유권 계약

| 정보 | 소유 위치 | Desktop 원문 접근 | 교체 방식 |
| --- | --- | --- | --- |
| Supabase URL/publishable key | 환경별 공개 실행 설정 | 허용 | 환경 설정/앱 배포 |
| 비민감 Runtime Config | `app_runtime_configs` | allowlist key만 허용 | DB 운영 설정 |
| Google OAuth Client ID/Secret | 개발 환경 또는 생성된 build config | 허용 | 개발 설정 또는 앱 업데이트 |
| Google access/refresh token | 사용자 PC의 ignored JSON | 해당 PC만 | 재로그인, 후속 Keychain 이전 |
| Naver 로그인 session | 사용자 PC의 `naver_auth.json` | 해당 PC만 | 재로그인 |
| Naver Developers ID/Secret | 환경별 Edge Function Secret | 금지 | 환경 Secret 교체 |
| SearchAd/API Hub credential | 환경별 Edge Function Secret | 금지 | 환경 Secret 교체 |
| SerpApi/Brevo 등 provider secret | 환경별 server secret store | 금지 | 환경 Secret 교체 |

## 4. Target flow

### 4.1 Google OAuth

```text
Generated development/build config
  -> Desktop OAuth client configuration
  -> Browser consent + loopback callback + PKCE
  -> Desktop exchanges/refreshes tokens directly with Google
  -> user token JSON
```

- OAuth broker를 도입하지 않는다.
- Edge Function이 Google Client Secret을 Desktop에 반환하지 않는다.
- Runtime Config에서 Google Client 설정을 조회하지 않는다.
- 현재 token JSON 형식을 유지하고 OS Keychain은 후속 feature로 분리한다.
- Client 설정 변경은 앱 업데이트와 필요 시 사용자 재연결로 처리한다.

### 4.2 외부 참고 글 검색

```text
Desktop: bounded reference-search request
  -> capability-scoped Edge Function
      -> license/access policy
      -> input limit + rate limit + cache
      -> Naver Blog Search API
  <- title + URL + published date
Desktop: selected URL content fetch and writing context composition
```

Edge Function은 임의 endpoint를 전달받는 범용 Naver proxy가 아니다. 외부 참고 기능에 필요한 검색
조건만 허용한다. 서버 장애 시 자동 외부 참고만 생략하며, 수동 참고 URL과 글 생성은 계속 동작한다.

현재 `인기글`이라고 표현된 결과는 실제 인기도가 아니라 관련 검색 결과를 작성일 기준으로 다시
정렬한 것이다. 동작을 먼저 보존하되 사용자 표현은 `관련 최신 글`처럼 실제 의미에 맞게 정리한다.

### 4.3 쇼핑 상품 fallback

```text
Desktop: URL/HTML/browser product extraction
  -> sufficient: continue locally
  -> insufficient + channel product number
      -> capability-scoped Edge Function
          -> Naver Shopping Search API
          -> exact product ID/link match only
      <- minimal verified product fields
Desktop: merge product data and continue writing
```

정확히 일치하는 상품이 없으면 첫 번째 검색 결과를 대신 사용하지 않는다. 잘못된 상품 정보를
작성하는 것보다 fallback 실패 또는 사용자 입력 상품명 사용을 우선한다.

## 5. 공통 Server Gateway 정책

- provider 이름이나 임의 URL을 Desktop 입력으로 받지 않는다.
- 기능별 semantic request만 허용한다.
- 기존 라이선스/HWID 인증 경계를 재사용하되 raw license 값을 로그에 남기지 않는다.
- 검색어, 상품번호, 요청 개수와 응답 크기를 제한한다.
- subject/device 단위 rate limit과 provider backoff를 적용한다.
- 성공 결과는 짧게 cache하고 provider 장애 시 마지막 유효 로컬 상태를 지우지 않는다.
- provider raw response와 secret 원문을 Desktop에 반환하지 않는다.
- Local, Development, Production의 provider credential과 quota를 분리한다.
- Desktop은 gateway 실패 시 provider direct-call로 fallback하지 않는다.

기존 `knowledge-gateway` 확장과 별도 capability Function 중 어느 구조를 사용할지는 Stage 3에서
현재 registry, cache, usage policy 재사용 범위를 확인한 뒤 결정한다. 어느 경우에도 Desktop 계약은
provider 중립적인 기능 계약으로 유지한다.

## 6. 단계별 feature-sub 계획

### Stage 1 — Credential inventory와 전환 계약

Branch: `feature/runtime-credential-security-01-contract`

- 저장 위치와 모든 소비자를 값 노출 없이 inventory한다.
- 공개 설정, build config, 사용자 인증, server secret의 경계를 확정한다.
- Google Desktop OAuth 직접 연결 결정을 기록한다.
- Naver 기능별 gateway 계약과 오류 정책을 정의한다.
- 구버전 앱과 Production credential 회전 순서를 정의한다.
- 상충하는 기존 Google OAuth 문서를 현재 결정으로 정정한다.

검증:

- 문서 링크와 경로 일관성 검사
- 코드 검색을 통한 inventory 소비자 대조
- production 변경 없음 확인

### Stage 2 — Google Desktop OAuth 독립

Branch: `feature/runtime-credential-security-02-google-oauth`

Status: complete; Local and Development manual OAuth verification passed

- 개발 실행과 정식 build에서 OAuth Client 설정을 공급하는 생성 계약을 추가한다.
- Runtime Config Google credential fallback을 제거한다.
- 사용자 token JSON과 PKCE/loopback 직접 OAuth는 유지한다.
- 설정 누락, token 만료, 재연결 오류를 명시적으로 처리한다.
- token과 OAuth Client 설정이 로그/API에 노출되지 않는지 검사한다.

검증:

- OAuth URL/PKCE, code exchange, refresh mock test
- Runtime Config 비호출 구조 test
- 누락/만료/재연결 실패 test
- 실제 Google 연결은 Development에서 사용자 확인

### Stage 3 — Naver 외부 참고 검색 Gateway

Branch: `feature/runtime-credential-security-03-naver-blog-gateway`

Status: implementation complete; Local contracts passed, Development deploy/smoke deferred to parent integration

- 외부 참고 검색을 기능 제한형 server gateway로 이전한다.
- 결과 계약, license/access, rate limit, cache와 failure fallback을 구현한다.
- Desktop의 직접 Blog Search API 호출을 제거한다.
- 수동 참고 URL과 글 생성 독립성을 보존한다.

검증:

- provider mock과 schema validation
- 인증/입력 제한/rate limit/cache test
- gateway 실패 시 글 생성 지속 test
- 실제 provider smoke는 별도 승인 후 Development에서 수행

### Stage 4 — Naver 쇼핑 Fallback Gateway

Branch: `feature/runtime-credential-security-04-naver-shopping-gateway`

Status: implementation complete; Local contracts passed, Development deploy/smoke deferred to parent integration

- URL/HTML/browser 추출은 Desktop에 유지한다.
- 상품 정보가 부족할 때만 gateway를 호출한다.
- exact product match와 최소 응답 field 계약을 적용한다.
- 기존 첫 결과 대체 로직을 제거한다.

검증:

- exact match, mismatch, empty, provider failure test
- 잘못된 상품 대체 방지 test
- 사용자 입력 상품명 fallback test
- preview와 실제 쇼핑 생성 회귀 test

### Stage 5 — Runtime Config hardening과 legacy 제거

Branch: `feature/runtime-credential-security-05-runtime-config`

Status: implementation complete; Local contracts passed, Production rollout deferred

- Desktop의 Google/Naver credential loader를 제거한다.
- 호출자가 없는 단건 블로그 검색 함수를 제거한다.
- 공개 Runtime Config key를 code-owned allowlist로 제한한다.
- null/empty/unknown/all-key 조회를 거부한다.
- credential row 제거 migration과 회전 checklist를 준비한다.
- non-secret server setting 소비자는 유지한다.

검증:

- RPC grant/RLS/allowlist contract test
- Local DB reset과 seed test
- credential key 반환 불가 test
- 기존 TTL 등 server-side 설정 회귀 test

### Stage 6 — 통합 검증과 rollout 준비

Branch: `feature/runtime-credential-security-06-integration`

Status: Development rollout and drift verification complete; dev push pending

- Local 전체 회귀와 Development artifact를 검증한다.
- Edge Function secret 이름과 환경 manifest를 현행화한다.
- 새 Desktop, server gateway, migration 배포 순서를 검증한다.
- 구버전 전환, credential 회전, 중단/rollback 조건을 checklist로 만든다.
- active plan을 canonical architecture/features 문서로 승격한다.

실제 Production migration, Function 배포, secret 변경, credential 회전과 앱 배포는 이 branch의
자동 범위가 아니다. 각각 사용자 승인된 release 작업으로 수행한다.

## 7. 호환성과 Production 전환

현재 v0.3.0 Desktop은 Runtime Config RPC에서 Google/Naver credential을 조회한다. 서버의 row와
RPC를 먼저 제거하면 Google Sheets, 외부 참고, 쇼핑 fallback이 중단된다. 따라서 rollout은 다음
순서를 지킨다.

```text
1. 새 server gateway를 Development에서 배포·검증
2. 새 Desktop이 Google build config와 Naver gateway를 사용하도록 전환
3. 새 Desktop 전체 기능 검증 및 배포
4. 전환 정책 적용: 호환 기간 또는 보안상 필수 업데이트
5. legacy Runtime Config credential 반환 차단
6. credential row 삭제
7. 노출 가능성이 있던 provider credential 회전
8. read-only Production smoke와 감사 기록
```

호환 기간을 선택하면 민감값 노출이 그 기간 동안 남는다. 즉시 필수 업데이트를 선택하면 구버전의
해당 기능이 중단될 수 있다. 이 선택은 Production rollout 전에 사용자가 승인한다.

## 8. 완료 기준

- Desktop이 Runtime Config에서 Google/Naver credential을 읽지 않는다.
- Google OAuth는 Supabase 장애와 무관하게 Desktop에서 직접 연결·갱신된다.
- Naver Developers Secret은 Edge Function 내부에서만 사용된다.
- 외부 참고와 쇼핑 fallback은 기능별 제한 계약을 사용한다.
- 쇼핑 검색은 exact product match가 아니면 실패한다.
- 공개 Runtime Config는 allowlist의 비민감 key만 반환한다.
- null/empty/all-key 조회가 불가능하다.
- Local/Development의 migration, Function과 manifest가 재현 가능하다.
- 실제 값이 Git, seed, log, test fixture와 문서에 포함되지 않는다.
- Production 변경과 credential 회전은 별도 승인 없이 실행되지 않는다.

## 9. 개발 일지 제안 예약

이 기능에서 도출된 주제는 `docs/development-journal-topics.md`에 축적한다. 통합 검증 또는
Production rollout 설계가 마무리되는 시점에 관련 주제를 선별해 사용자에게 다시 제안한다.
