# Runtime Credential Security Stage 5 개발 기록

## Branch

`feature/runtime-credential-security-05-runtime-config`

## 목표

Desktop이 Runtime Config를 통해 Google/Naver 자격증명을 읽을 가능성을 제거하고, 공개 가능한
비민감 설정만 명시적인 allowlist 계약으로 조회하도록 제한한다.

## 설계와 결정사항

- Desktop 공개 설정은 코드가 소유한 allowlist에 포함된 key만 요청한다.
- null, 빈 배열, 빈 문자열, unknown key와 전체 조회는 Desktop과 DB RPC 양쪽에서 거부한다.
- 서버 SQL이 직접 읽는 `license_registration_code_ttl_seconds`는 공개 RPC 대상이 아니다.
- 호출자가 없는 `fetchNaverBlogSearchResults`와 Naver credential loader를 제거한다.
- Local/Development migration은 legacy Google/Naver credential row를 삭제한다.
- 같은 migration을 Production에 적용하면 v0.3.0의 legacy 기능이 중단되므로 Production 적용은
  새 앱 배포와 구버전 정책 승인 뒤로 미룬다. 이번 stage에서는 운영 DB를 변경하지 않는다.

## 범위 제외

- Production migration 적용
- Production credential 삭제·회전
- 구버전 지원 종료 결정
- 사용자 Google token의 OS Keychain 이전

## 구현 과정

- Runtime Config 소비자와 DB RPC/grant를 다시 조사한다.
- Desktop allowlist와 DB allowlist를 동일한 계약으로 제한한다.
- legacy credential loader와 미사용 직접 검색 helper를 제거한다.
- credential row cleanup과 rollout 조건을 migration 및 운영 문서에 기록한다.

## 검증 계획

- Desktop allowlist, cache, retry와 fail-closed 단위 테스트
- SQL contract 및 credential key 반환 차단 검사
- Local DB reset/seed와 baseline 검사
- 관련 UI/전체 unit 회귀 검사

## 결과

- Desktop과 DB RPC에 동일한 공개 Runtime Config allowlist를 적용했다.
- null, empty, unknown 및 credential key는 RPC 호출 전에 또는 DB에서 fail closed한다.
- Naver credential loader와 호출자가 없는 직접 블로그 검색 helper를 제거했다.
- migration이 Local/Development의 Google/Naver legacy credential row를 삭제한다.
- Runtime Config timeout timer를 요청 완료 시 정리해 불필요한 event-loop 대기를 제거했다.
- Supabase inventory와 release artifact migration fingerprint 계약을 현행화했다.

검증 결과:

- Runtime Config·환경 inventory·release artifact focused test: 25 passed
- Local Supabase reset: 23 migrations와 seed 재적용 성공
- Local schema/RLS/Runtime Config baseline: 통과
- Settings API smoke: 통과
- 전체 unit regression: 1,050 passed
- `git diff --check`: 통과

## Production 인계 체크리스트

다음 항목은 이 branch에서 실행하지 않는다.

1. 새 Desktop과 Naver gateway가 Development에서 검증되었는지 확인한다.
2. 구버전 지원 기간 또는 필수 업데이트 정책을 승인한다.
3. 동일 release artifact의 migration을 Production 후보로 검토한다.
4. 승인된 maintenance window에 Runtime Config migration을 적용한다.
5. legacy credential row가 0건이고 credential key RPC가 거부되는지 확인한다.
6. 노출 가능성이 있던 Naver Developers credential을 회전하고 Edge Function Secret을 갱신한다.
7. read-only smoke와 rollback 판단 결과를 기록한다.
