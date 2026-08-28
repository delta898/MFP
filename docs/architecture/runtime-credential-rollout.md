# Runtime Credential Security Rollout

## 목적

이 문서는 Runtime Credential Security 변경을 Development Supabase에 적용하고 검증하는 순서를
정의한다. BlogGenius는 migration과 Edge Function 소스를 소유하지만, 실제 환경의 Secret 값은
소유하거나 조회하지 않는다.

이 절차는 Development 전용이다. Production DB, Function, Secret, credential 회전과 앱 배포는
별도 승인 없이는 수행하지 않는다.

## 적용 대상

정확한 적용 목록과 순서는 `supabase/runtime-credential-security-rollout.json`이 소유한다.

- migration
  - `202608290000_add_blog_reference_gateway.sql`
  - `202608290010_add_shopping_product_gateway.sql`
  - `202608290020_harden_public_runtime_config.sql`
- Edge Function
  - `knowledge-gateway` (`verify_jwt=true`)
- Function Secret 이름
  - `NAVER_CLIENT_ID`
  - `NAVER_CLIENT_SECRET`

manifest에는 Secret 이름만 기록한다. 값, SSH 정보, 인프라 내부 경로는 Git 산출물에 넣지 않는다.

## 실행 전제

1. Stage 6 branch가 feature parent에 병합되어 있어야 한다.
2. feature parent가 로컬 `dev`에 병합되어 있어야 한다.
3. 아직 `dev`를 원격에 push하지 않는다.
4. `.env.development`와 Supabase CLI 인증이 준비되어 있어야 한다.
5. 대상 project ref가 Production과 다름을 preflight로 확인한다.

feature branch에서는 아래 planner가 의도적으로 `BLOCKED`를 반환한다. 산출물 검토는 가능하지만
원격 변경을 feature branch에서 시작하지 않기 위한 장치다.

```bash
npm run credentials:development:plan
```

## Development 적용 순서

로컬 `dev`에서 다음 순서를 지킨다.

### 1. 대상과 산출물 확인

```bash
npm run env:development:ready
npm run credentials:development:plan
```

둘 중 하나라도 `BLOCKED`이면 중단한다. 환경값을 Production 값으로 대체해 우회하지 않는다.

### 2. DB 변경 미리 확인

```bash
supabase db push --dry-run --project-ref "$BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF"
```

예상한 migration 3개 외의 항목이 보이면 적용하지 않는다. DB password는 로컬 환경에 저장되어
있지 않으면 CLI가 요청할 수 있다.

### 3. Development DB migration 적용

```bash
supabase db push --project-ref "$BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF"
```

Development에서만 legacy Google/Naver Runtime Config credential row가 제거된다. `db reset`은
호스팅 Development와 Production에서 사용하지 않는다.

### 4. Edge Function 배포

환경 제공자가 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`을 Function Secret으로 준비한 상태에서
다음을 실행한다.

```bash
supabase functions deploy knowledge-gateway \
  --project-ref "$BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF"
```

BlogGenius는 Secret 값을 확인하거나 변경하지 않는다. 배포 성공은 Secret의 유효성을 보장하지
않으므로 기능 검사가 별도로 필요하다.

### 5. 무변경 smoke와 증거 생성

```bash
npm run env:development:smoke
npm run env:release:artifact
```

공개 endpoint와 배포 산출물 일치를 확인한다. 외부 provider를 호출하는 다음 의미 검증은 비용과
외부 요청이 있으므로 사용자 승인 후 수행한다.

- `blog_reference:writing_reference`
- `shopping_product:product_recovery`

### 6. 원격 `dev` push와 CI 확인

Development가 로컬 `dev` 산출물과 일치한 뒤에만 `dev`를 push한다. GitHub Actions는 배포자가
아니라 재현성·drift 검증자다. 원격 Development가 뒤처진 상태에서 먼저 push하면 CI 실패가
정상이다.

## 중단과 복구 원칙

- 어느 단계든 실패하면 다음 단계와 `dev` push를 중단한다.
- 마지막으로 유효한 Desktop 설정과 사용자 토큰을 삭제하지 않는다.
- Function 문제는 이전에 검증된 Git revision의 Function을 다시 배포해 복구한다.
- DB migration은 forward-only로 취급한다. 자동 down migration이나 원격 `db reset`을 하지 않는다.
- DB 수정이 필요하면 원인을 확인한 뒤 별도의 보정 migration을 만든다.
- provider 의미 검증 실패 시 Desktop 직접 API 호출이나 Production credential로 fallback하지 않는다.
- Production legacy row 제거와 provider credential 회전은 새 Desktop 배포 및 구버전 지원 정책이
  승인된 별도 release 절차에서만 수행한다.

## 완료 조건

- planner가 로컬 `dev`에서 `READY`다.
- dry-run과 실제 적용 migration 목록이 manifest와 일치한다.
- `knowledge-gateway`가 `verify_jwt=true`로 배포된다.
- 무변경 Development smoke가 통과한다.
- 승인된 경우 블로그 참고와 쇼핑 복구 의미 검증이 통과한다.
- 원격 `dev` push 후 GitHub Actions drift 검증이 통과한다.
- Production에는 어떤 변경도 발생하지 않는다.
