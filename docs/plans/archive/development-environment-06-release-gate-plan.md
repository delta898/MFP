# 개발·운영 환경 분리 Stage 6 — CI, Drift, Production 승격 Gate

> 작성일: 2026-08-28
> 상태: 구현 및 검증 완료
> Parent branch: `feature/development-environment-main`
> Branch: `feature/development-environment-06-release-gate`

## 목표

local에서 재현된 canonical Supabase 산출물만 development에서 검증하고, 동일한 Git revision과
artifact가 확인된 경우에만 production 승인 후보 checklist를 만든다. CI와 도구는 production을
자동 변경하지 않는다.

## 승격 단위

승격 단위는 migration 파일명만이 아니라 다음을 함께 해시한 `Supabase release artifact`다.

- `supabase/migrations/*.sql` 전체와 순서
- `supabase/functions/` 아래 Edge Function 및 shared module
- Function 이름과 `verify_jwt` 정책
- environment와 hosted-development manifest
- artifact를 만든 전체 Git commit SHA

하나라도 달라지면 새로운 fingerprint가 생성되므로 이전 development 검증 증거를 재사용할 수 없다.

## CI 흐름

```text
PR / dev / release / main
  -> local Supabase start + reset + schema verification
  -> unit regression
  -> immutable release artifact 생성·자체 검증

dev push 또는 명시적 development-drift 실행
  -> development migration history 읽기
  -> deployed Function 이름·JWT 정책·ACTIVE 상태 읽기
  -> artifact와 exact match 검사
  -> public HTTP smoke
  -> sanitized development evidence 저장

release/* 또는 main에서 수동 production-checklist
  -> 검증된 dev workflow run id 지정
  -> 현재 revision/artifact와 development evidence exact match
  -> production 후보 branch 확인
  -> 사용자 승인 전 checklist만 생성
```

## 안전 경계

- Workflow에는 `supabase db push`, `functions deploy`, `secrets set`이 없다.
- development job의 hosted 명령은 migration과 Function 상태를 읽기만 한다.
- 각 조회는 명시적인 development project ref를 사용하며 ambient CLI link를 변경하지 않는다.
- production checklist는 `deploysProduction: false`를 명시한다.
- checklist 통과는 사용자 승인이나 production preflight를 대신하지 않는다.
- DB password와 access token은 GitHub `development` Environment secret으로만 주입한다.
- 생성 artifact와 evidence에는 key, password, Secret, endpoint 응답 본문을 넣지 않는다.

## 필요한 GitHub 설정

`development` Environment에 다음을 준비한다.

Variables:

- `BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_NAME`
- `BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF`
- `BLOGGENIUS_DEVELOPMENT_SUPABASE_URL`

Secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY`

Production Supabase credential은 이 workflow에 등록하지 않는다. 실제 production 적용 workflow는
별도 사용자 승인 이후 필요한 최소 권한과 GitHub `production` Environment approval을 포함해 만든다.

## 완료 기준

- local reset과 전체 단위 테스트가 CI에서 반복 가능하다.
- artifact가 migration, Function code, JWT 정책과 Git revision을 하나로 묶는다.
- development migration/Function drift가 fail-closed로 검출된다.
- 이전 또는 다른 commit의 development evidence는 production checklist에 사용할 수 없다.
- production은 자동 배포되지 않고 사용자 승인 대기 상태까지만 도달한다.
- 장애 대응은 down migration 대신 forward fix를 기본으로 하며 데이터 복구 절차가 분리돼 있다.

## 2026-08-28 검증 결과

- local Supabase를 재생성해 canonical migration 20개와 seed를 적용했다.
- local schema contract 검사가 통과했고 검증 후 컨테이너를 종료했다.
- 실제 development Supabase의 migration 20개와 ACTIVE Function 5개를 읽어 drift 검사가 통과했다.
- release artifact 생성·자체 검증과 workflow YAML parsing이 통과했다.
- Stage 6 집중 테스트 30개와 전체 unit test 1,001개가 통과했다.
- production credential, schema 변경, Function 배포, Secret 변경은 수행하지 않았다.
