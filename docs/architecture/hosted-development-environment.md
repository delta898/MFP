# Development Supabase Environment

BlogGenius의 development profile은 production과 다른 Supabase endpoint를 사용한다. 이
프로젝트는 Supabase의 공개 HTTP 계약과 표준 migration·Edge Function 산출물만 소유한다.
Supabase가 SaaS인지 자체 운영 환경인지, 어떤 컨테이너·파일·Secret 저장소를 사용하는지는
BlogGenius의 관심사가 아니다.

## Responsibility boundary

### BlogGenius owns

- `supabase/migrations`의 canonical migration
- `supabase/functions`의 Edge Function source
- `supabase/development-seed.sql`의 development-only fixture
- 필요한 Edge Function 환경변수 이름과 안전 정책
- development URL·publishable key를 사용한 무변경 smoke test
- production과 development endpoint가 다른지 확인하는 fail-closed guard

### Supabase environment provider owns

- Supabase 설치·업데이트·백업·복구
- DB와 Function 산출물을 실제 환경에 적용하는 방법
- Secret 저장·주입·교체
- 프로세스·컨테이너 재기동
- 인프라 경로, 관리 API, 접근 제어와 운영 로그

BlogGenius 코드와 문서에는 특정 환경 제공자의 이름, SSH target, filesystem path, container name,
Compose 구성 또는 Secret 파일 경로를 두지 않는다. 환경 제공자가 바뀌어도 아래 공개 계약만
유지되면 BlogGenius는 변경 없이 연결할 수 있어야 한다.

## Public contract

- `BLOGGENIUS_ENV=development`
- `BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_NAME`
- `BLOGGENIUS_DEVELOPMENT_SUPABASE_URL`
- `BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY`
- optional cross-check: `BLOGGENIUS_PRODUCTION_SUPABASE_URL`

실제 값은 Git에 넣지 않는다. 변수 이름 sample은
`config/hosted-development.env.sample`에 둔다.

publishable key는 `sb_publishable_...` 형식을 우선 사용한다. 환경이 새 key를 제공하지 않는 경우
legacy `anon` JWT를 호환값으로 사용할 수 있다. `JWT_SECRET`, `sb_secret_...`, legacy
`service_role`은 desktop 공개 연결에 사용하지 않는다.

## Workflow

```text
BlogGenius artifacts
  -> npm run env:development:ready
  -> npm run env:development:plan
  -> Supabase environment provider applies artifacts and settings
  -> npm run env:development:smoke
  -> desktop development integration validation
```

`env:development:plan`은 원격 변경 명령이 아니라 인계할 migration, seed, Function과 branch/target
guard 결과를 보여준다. 실제 적용 명령은 Supabase 환경 제공자가 소유한다. BlogGenius는 원격
Secret을 조회하거나 변경하지 않으며, provider 내부에서 publishable key를 찾아오지도 않는다.

## Edge Function environment contract

필요한 이름은 `supabase/hosted-development-manifest.json`에 선언한다. 이 선언은 저장 위치나 값을
뜻하지 않는다. 환경 제공자는 자신의 Secret 관리 방식으로 값을 공급한다.

development core requirement:

- `BLOGGENIUS_ENV=development`
- `BLOGGENIUS_NOTIFICATION_MODE=sink|allowlist`
- `TRENDS_READ_TOKEN_SECRET=<development-only secret>`

provider credential은 해당 integration을 시험할 때만 준비한다. readiness는 provider-managed
Secret을 검사했다고 가장하지 않는다. 누락·오설정은 안전한 기능 검사에서 확인하고, 마지막으로
유효했던 로컬 상태를 지우지 않는다.

## External-effect policy

| Surface | Development policy |
| --- | --- |
| Blog publishing | 차단 |
| Payment | 차단 |
| License email | 기본 sink, 명시적 allowlist만 실제 발송 |
| Telegram | sink 또는 allowlist가 마련되기 전 차단 |
| Cron | 초기 비활성, 별도 승인 후 활성화 |
| Paid provider smoke | 기본 차단 |
| DB reset | 차단 |
| Fake development seed | `dev` target guard 후 환경 제공자가 적용 |

`send-license-code`는 환경이나 notification mode가 불명확하면 실패한다. production만 `live`를
허용하며 development는 `sink` 또는 `allowlist`만 허용한다.

## Verification levels

1. readiness는 공개 connection 설정과 안전 정책을 검사한다.
2. handoff plan은 `dev` branch와 development URL identity 및 산출물 경로를 검사한다.
3. safe smoke는 REST 및 Function endpoint를 GET으로 확인하며 DB·provider를 변경하지 않는다.
4. desktop integration smoke는 development 가짜 라이선스로 핵심 계약을 확인한다.
5. 유료 provider, 실제 알림, Cron은 각각 별도 승인 후 검증한다.

## Auth and Storage

현재 desktop 인증은 Supabase Auth user session이 아니라 라이선스 RPC 계약을 사용한다. 따라서
development Auth user를 임의로 만들지 않는다. Storage bucket과 RLS는 canonical migration으로
재현하며 production object는 복사하지 않는다.
