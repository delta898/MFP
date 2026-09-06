# Runtime Credential Security Stage 6 개발 기록

## Branch

`feature/runtime-credential-security-06-integration`

## 목표

1~5단계에서 만든 Desktop, migration과 Edge Function 변경을 Development Supabase에 안전하게 적용하고
검증할 수 있도록 rollout 계약을 고정한다. 이 branch에서는 원격 환경을 변경하지 않는다.

## 설계와 결정사항

- 적용 대상은 migration 3개와 `knowledge-gateway` 하나로 명시한다.
- Development 적용은 이 branch가 parent와 로컬 `dev`에 병합된 뒤에만 허용한다.
- manifest와 planner에는 Secret 이름만 기록하고 값은 포함하지 않는다.
- DB reset, Production 변경, Secret 조회·변경과 credential 회전은 자동화하지 않는다.
- 공개 HTTP smoke는 필수이고, Naver provider를 호출하는 의미 검증은 별도 승인된 수동 smoke로 둔다.
- Development 적용과 검증이 끝난 뒤에만 `dev`를 push해 CI drift 검증을 통과시킨다.

## 적용 순서

1. 6단계 branch를 parent에 병합한다.
2. parent를 로컬 `dev`에 병합하되 push하지 않는다.
3. `dev`에서 rollout plan과 target preflight를 확인한다.
4. Development에 pending migration을 적용한다.
5. `knowledge-gateway`를 배포한다.
6. 공개 HTTP smoke와 승인된 기능 smoke를 수행한다.
7. migration·Function evidence가 artifact와 일치하는지 확인한다.
8. `dev`를 push하고 GitHub Actions 결과를 확인한다.

## Production 제외

- Production DB migration
- Production Function 배포
- 구버전 지원 종료
- Runtime Config credential row 삭제·provider credential 회전
- 앱 release와 tag push

## 검증 계획

- rollout manifest·planner contract test
- Local DB reset 및 baseline
- 전체 unit regression
- Browser UI smoke
- `git diff --check`

## 결과

- `supabase/runtime-credential-security-rollout.json`에 migration, Function, Secret 이름과 적용 순서를
  고정했다.
- `npm run credentials:development:plan`이 산출물·Development target·branch guard를 검사하고 실제
  원격 변경 없이 운영자 명령을 출력하도록 구현했다.
- planner가 hosted manifest 및 `supabase/config.toml`의 Function/Secret 계약과 drift하면 실패한다.
- canonical rollout 문서에 dry-run, 적용, smoke, CI 확인과 중단·복구 원칙을 기록했다.
- feature branch에서 planner가 `branch_target_denied`로 원격 적용을 차단함을 확인했다.
- focused contract test 14개와 planner test 3개가 통과했다.
- 전체 unit test 1,053개가 통과했다.
- Local Supabase reset에서 migration 23개와 seed가 적용됐고 baseline 검증이 통과했다.
- Browser UI smoke가 49 fixture requests로 통과했다.
- `git diff --check`가 통과했다.

Development 원격 적용과 `dev` push는 이 branch를 parent와 로컬 `dev`에 병합한 뒤 사용자의 별도
요청에 따라 진행한다. Production에는 변경을 적용하지 않았다.

## Development 적용 결과

- parent를 로컬 `dev`에 fast-forward 병합한 뒤 readiness와 rollout planner가 모두 `READY`였다.
- DB dry-run에서 manifest에 선언한 migration 3개만 pending으로 확인됐다.
- 동일한 migration 3개를 Development DB에 적용했다. seed와 DB reset은 실행하지 않았다.
- `knowledge-gateway`를 Development에 배포했다.
- 공개 REST 및 전체 Edge Function endpoint의 무변경 HTTP smoke가 통과했다.
- Supabase CLI로 읽은 migration·Function evidence와 현재 artifact의 drift 검증이 통과했다.
- Naver provider를 실제 호출하는 의미 검증은 비용·quota가 있는 선택 검사이므로 실행하지 않았다.
- Production에는 migration, Function, Secret 또는 credential 변경을 적용하지 않았다.
