# Runtime Credential Security Stage 3 Development Record

## Branch

- Branch: `feature/runtime-credential-security-03-naver-blog-gateway`
- Started: `2026-08-29`
- Base/parent: `feature/runtime-credential-security-main`
- Status: implementation complete; parent merge pending

## User Need and Goal

BlogGenius Desktop이 Supabase Runtime Config에서 Naver Developers Client ID와 Client Secret을
받아 외부 참고 블로그를 직접 검색하는 구조를 제거한다. 외부 참고 검색은 계속 제공하되 Naver
credential, 공용 quota와 provider 장애를 서버 경계에서 관리한다.

### Scope

- `외부 참고 사용`의 자동 블로그 검색을 기능 제한형 Knowledge Gateway route로 이전
- 검색어와 결과 수를 제한하고 정규화된 제목, URL, 작성일만 Desktop에 반환
- license 확인, device rate limit, provider cache/backoff 계약 재사용
- Gateway 실패 시 자동 참고만 생략하고 원래 글 생성은 계속 수행
- Local migration, Edge Function provider와 Desktop adapter의 재현 가능한 테스트 제공

### Non-goals

- 수동으로 입력한 참고 URL의 수집·분석 방식 변경
- Naver Shopping Search fallback 이전
- Runtime Config의 Naver credential row 즉시 삭제
- Production 배포, secret 교체 또는 구버전 지원 종료

## Design

```text
BlogGenius Desktop
  -> reference-search-gateway
  -> knowledge-gateway
       kind=blog_reference
       purpose=writing_reference
  -> naver-blog-reference provider
  -> Naver Developers Blog Search OpenAPI
```

Desktop은 provider 이름, endpoint와 credential을 알지 않는다. 요청은 검색어와 최대 결과 수만
포함하며 응답은 기존 Knowledge Snapshot envelope 안에서 검증한다. Gateway 장애는 빈 자동 참고
목록으로 축소하고, Desktop이 Naver API를 직접 호출하는 fallback은 두지 않는다.

## Decisions and Tradeoffs

- 새 전용 Edge Function을 만들지 않고 기존 `knowledge-gateway`의 `kind + purpose + provider`
  계약을 확장했다. 인증, quota, cache와 오류 정규화를 중복하지 않기 위해서다.
- Naver Developers credential을 API Hub/SearchAd credential과 합치거나 fallback하지 않는다.
  이름이 비슷해도 발급 체계, 인증, quota와 용도가 다르다.
- 서버는 참고 URL 후보만 반환하고 본문 수집과 글 작성은 Desktop에 유지한다. 서버 권한과 반환
  데이터 범위를 최소화하면서 기존 작성 흐름을 보존한다.
- 실패 시 글 생성 전체를 중단하지 않는다. 자동 참고는 품질 보조 기능이며 사용자가 입력한 주제,
  지시사항과 수동 참고 URL이 우선한다.
- 구버전과 아직 이전되지 않은 Shopping fallback을 위해 Runtime Config의 Naver credential row는
  이번 단계에서 제거하지 않는다.

## Implementation Process

1. 기존 Desktop 호출자와 Naver Developers/API Hub/SearchAd credential 소유권을 다시 확인했다.
2. Knowledge Gateway contract와 provider registry에 `blog_reference:writing_reference`를 추가했다.
3. Naver Blog Search 응답을 제한된 Snapshot으로 변환하는 server provider를 구현했다.
4. Desktop adapter를 추가하고 기존 직접 API 호출 경로를 Gateway 호출로 교체했다.
5. 누락 credential, 입력 상한, 결과 정규화와 Desktop 비밀정보 비소유 계약을 테스트했다.
6. Local Supabase를 reset하여 migration과 function bundle이 처음부터 재현되는지 확인했다.

진행 중 `블로그 검색`이 하나의 자격증명 체계가 아니라 Naver Developers와 NAVER API Hub 양쪽에
서로 다른 목적으로 존재한다는 혼동 지점을 확인했다. 이 내용은
`docs/development-journal-topics.md`에 재사용 가능한 글감으로 기록했다.

## Result

- 외부 참고 블로그 검색의 Desktop 직접 Naver API 호출을 제거했다.
- Naver Developers Client Secret은 해당 provider를 실행하는 Edge Function 내부에서만 소비된다.
- Desktop artifact와 Gateway 응답에는 provider credential이 포함되지 않는다.
- Gateway가 실패해도 자동 참고만 생략되고 기존 글 작성 흐름은 유지된다.
- Shopping fallback과 구버전 때문에 Runtime Config credential 제거는 후속 단계로 남겼다.

## Verification

- Naver blog reference provider mock/normalization tests
- Knowledge Gateway route 및 Snapshot contract tests
- Desktop reference gateway request/response/failure tests
- Gateway 구조와 credential 경계 tests
- release artifact의 Desktop 비밀정보 비포함 tests
- Local Supabase reset, migration 적용과 function bundle 검증
- 전체 unit regression: 1,036 tests passed

Development Supabase 배포와 실제 Naver provider smoke test는 parent feature 통합 검증 시 수행한다.
실제 provider 호출은 외부 quota를 사용하므로 자동 단위 테스트에 포함하지 않는다.

## Follow-up

- Stage 4: Shopping Search fallback을 동일한 server capability 경계로 이전
- Stage 5: Desktop credential loader와 미사용 helper 제거, Runtime Config 공개 allowlist 적용
- 새 앱 전환과 구버전 정책 확인 후 Runtime Config의 Naver credential row 제거 및 회전
