# Deployment Safety Gates

BlogGenius의 Supabase 변경 작업은 target을 추측하지 않는다. DB, seed, fixture, Edge Function,
Cron 작업은 실제 실행 명령을 만들기 전에 공통 environment preflight를 통과해야 한다.

## Preflight command

```bash
npm run env:preflight -- --target local --operation database-reset
```

이 명령은 dry-run 검증만 수행하며 DB, Function, Cron을 변경하지 않는다. Stage 4 이후 실제
migration과 deployment command는 이 preflight 결과가 `ALLOWED`일 때만 실행되도록 결합한다.
Supabase CLI를 직접 실행해 guard를 우회하는 방식은 지원되는 운영 경로가 아니다.

모든 작업은 `--target`과 `--operation`을 명시해야 한다. 지원 operation은 다음과 같다.

| Operation | local | development | production |
| --- | --- | --- | --- |
| `schema-audit` | 읽기 전용 | 읽기 전용 | 별도 승인 후 읽기 전용 |
| `database-migrate` | 허용 후보 | 허용 후보 | 승인 후 허용 후보 |
| `database-reset` | 허용 후보 | 차단 | 항상 차단 |
| `database-seed` | 허용 후보 | 허용 후보 | 항상 차단 |
| `fixture-load` | 허용 후보 | 허용 후보 | 항상 차단 |
| `function-deploy` | 차단 | 허용 후보 | 승인 후 허용 후보 |
| `cron-deploy` | 차단 | 허용 후보 | 승인 후 허용 후보 |

`허용 후보`는 operation 자체의 범위만 뜻한다. branch, target project 설정, 그리고 linked
project 또는 명시적인 project ref가 모두 일치해야 최종 `ALLOWED`가 된다.

## Gate order

```text
explicit target + operation
  -> branch/target policy
  -> operation/target policy
  -> target project name/ref configured
  -> hosted target linked-project name/ref 또는 explicit project ref match
  -> production ref confirmation
  -> ALLOWED or DENIED
```

- `feature/*`는 `local`만 허용한다.
- `dev`는 `local`과 `development`만 허용한다.
- `main`과 `release/*`만 production 후보가 된다.
- detached HEAD와 분류되지 않은 branch는 local-only로 취급한다.
- GitHub Actions의 detached checkout은 `GITHUB_HEAD_REF` 또는 branch 타입의
  `GITHUB_REF_NAME`만 branch 증거로 사용하며 tag 이름은 branch로 승격하지 않는다.
- hosted target은 다음 환경변수에서 project identity를 읽는다.

`schema-audit`는 mutation/deployment가 아니므로 Stage 4A 전용 feature branch에서도 실행할 수
있다. 다만 hosted project/link 일치와 production ref 확인을 동일하게 요구하고, 별도 사용자
승인 없이는 실행하지 않는다.

| Target | Project name | Project ref |
| --- | --- | --- |
| development | `BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_NAME` | `BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF` |
| production | `BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_NAME` | `BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_REF` |

현재 Supabase CLI link는 `supabase/.temp/linked-project.json`에서 읽는다. 이 파일은 Git에
포함하지 않는다. hosted 명령이 `--project-ref`를 명시하지 않은 경우 configured name/ref와
linked name/ref가 모두 일치해야 한다.

Stage 5부터 SaaS hosted 명령은 기존 production link를 바꾸지 않도록 명시적인 ref를 사용할 수 있다.
preflight의 `--project-ref`는 Supabase CLI에 전달할 동일 ref여야 하며 configured target ref와
정확히 일치해야 한다.

```bash
npm run env:preflight -- \
  --target development \
  --operation function-deploy \
  --project-ref <DEVELOPMENT_PROJECT_REF>
```

명시적 ref가 있으면 ambient link는 사용하지 않는다. 그렇더라도 branch 정책은 완화되지 않으므로
development hosted operation은 `dev`에서만 허용된다.

project ref가 없는 development Supabase는 `--supabase-url`로 configured HTTPS endpoint를 다시
확인할 수 있다. 이 identity는 환경 제공자의 종류나 내부 배포 방식을 드러내지 않는다.

## Production confirmation

Production mutation preflight는 허용 branch와 일치하는 link만으로 통과하지 않는다. target의
project ref를 명시적으로 다시 입력해야 한다.

```bash
npm run env:preflight -- \
  --target production \
  --operation database-migrate \
  --approve-production <PRODUCTION_PROJECT_REF>
```

Project ref confirmation은 production 배포 승인 자체를 대신하지 않는다. 사용자의 release
승인 후 운영자가 실행하는 마지막 오입력 방지 장치다. `database-reset`, `database-seed`,
`fixture-load`는 정확한 ref를 입력해도 production에서 허용되지 않는다.

## Safe output

Preflight는 다음 값만 출력한다.

- decision과 거부 reason;
- target, branch, operation, surface;
- project name/ref와 link match 상태;
- production approval 확인 여부.

Supabase URL, publishable key, service-role key, database password, provider secret과 전체 process
environment는 출력하거나 결과 객체에 포함하지 않는다. 자동화용 `--json` 출력도 같은 계약을
지킨다.

## Stage boundary

Stage 3의 공통 CLI는 안전 판단과 dry-run 출력을 제공한다. 실제 실행기는 각 후속 단계가 이
판단을 호출한 뒤 명시적인 target으로만 명령을 구성한다.

- Stage 4B: local migration/reset/seed command와 preflight 결합;
- Stage 5: provider-neutral development manifest, readiness, HTTP smoke와 외부 적용 인계;
- Stage 6: CI drift check, production dry-run checklist, 별도 사용자 승인 절차.

## Immutable promotion artifact

Stage 6부터 migration과 Function을 따로 승격하지 않는다. `npm run --silent env:release:artifact`는
canonical migration, 모든 Edge Function/shared module, Function JWT 정책과 manifest를 해시하고
현재 Git revision에 결합한다. `npm run env:release:verify`는 artifact가 현재 checkout과 동일한지
확인한다.

Development 적용 후 공식 Supabase CLI의 migration/Function 읽기 결과를 credential-free evidence로
정규화한다. `npm run env:development:drift`는 다음을 exact match로 검사한다.

- 적용된 migration version 전체와 순서
- 배포된 Function 이름
- Function별 `verify_jwt` 정책
- 모든 Function의 ACTIVE 상태
- development가 검증한 artifact fingerprint

Production checklist는 `release/*` 또는 `main`에서만 생성할 수 있으며, 현재 revision과 같은 artifact를
검증한 development workflow run을 명시해야 한다. 결과의 `ready_for_user_approval`은 자동 배포 허가가
아니다. 이후 사용자 승인과 production preflight가 모두 별도로 필요하다.

관련 장애·데이터 복구 원칙은 [Supabase Forward Fix와 데이터 복구 Runbook](../supabase-recovery-runbook.md)을 따른다.
