# 2026-06-19 License Features and Publish Quota

## Context
- 라이선스 feature가 기본 기능까지 세분화하면서 플랜 설명과 실행 제어가 복잡해졌다.
- `cmd_pub`은 표시만 있고 실행 제어에는 사용되지 않는다.
- 이미지 생성은 사용자 콘텐츠 옵션과 라이선스 entitlement 의미가 섞여 있다.
- 회당 최대 발행 수는 자동 실행 경로에서 일관되게 적용되지 않으며, 전체 quota와 역할이 겹친다.
- 현재 `check_and_use_license`는 실제 플랫폼 처리 전에 즉시 1회를 차감하고 operation id가 없어 실패와 재시도에 취약하다.

## Decision

### Feature contract
`license_plans.features`는 플랜별 차이가 있는 기능만 제어한다.

필수 feature는 다음 네 개다.

```json
{
  "cmd_batch": true,
  "cmd_trends": false,
  "cmd_shopping": false,
  "enable_related_posts_auto_link": false
}
```

- `cmd_batch`: 수동 다중 발행과 자동 발행을 허용한다. 현재 모든 플랜에서 `true`로 운영하되 필수 정책 키로 유지한다.
- `cmd_trends`: 네이버 트렌드 수집 기능만 제어한다. RSS 수집은 제어하지 않는다. 트렌드가 허용되면 날짜 지정도 함께 허용한다.
- `cmd_shopping`: 쇼핑 콘텐츠 수집·생성·발행 실행을 제어한다. 쇼핑 시트의 기존 데이터와 대기열은 보존한다.
- `enable_related_posts_auto_link`: 연관 글 자동 연결을 제어하며 pro 이상에서 활성화한다.
- 필수 feature가 누락되거나 boolean이 아니면 허용으로 추정하지 않고 정책 오류로 처리한다.

다음 키는 라이선스 feature에서 제거한다.

- `cmd_pub`: 기본 발행 기능이므로 제거한다.
- `image_generation`: 라이선스 권한이 아니라 사용자의 글별 이미지 생성 옵션으로만 유지한다.
- `max_blog_posts_per_run`, `max_shopping_posts_per_run`: 회당 제한을 제거하고 전체 quota로 제어한다.
- `enable_trends_date_override`: `cmd_trends`에 포함한다.

### Quota contract
- quota 단위는 콘텐츠 발행 작업 1건이다.
- 같은 콘텐츠를 네이버와 WordPress에 함께 처리해도 1회만 사용한다.
- `draft`, `schedule`, `publish` 모두 플랫폼이 한 곳 이상 정상 처리하면 1회 사용한다.
- 모든 대상 플랫폼이 실패하면 사용하지 않는다.
- 콘텐츠 생성만 수행하거나 트렌드를 수집하는 작업은 quota를 사용하지 않는다.
- 쇼핑 대기열 관리만 수행하는 작업은 quota를 사용하지 않는다.
- 일부 플랫폼만 성공한 뒤 실패한 플랫폼을 같은 operation id로 재시도해도 추가 사용하지 않는다.

실행 전에는 최신 잔여량을 기준으로 다음 정보를 제공한다.

```text
A건 선택 · 잔여 B회 · 최대 C건 실행
```

`C = min(A, B)`이며 unlimited 플랜은 선택한 전체 작업을 실행한다.

### Usage lifecycle
사용량 처리는 콘텐츠 발행 작업 단위의 고유 `operation_id`를 사용한다.

```text
preflight -> reserve -> platform execution -> commit or release
```

- `reserve`: 잔여량을 원자적으로 확보한다.
- `commit`: 대상 플랫폼 중 하나 이상이 정상 처리되면 작업당 1회를 확정한다.
- `release`: 모든 대상이 실패하면 예약을 반환한다.
- 동일 operation id의 재요청은 중복 예약·차감하지 않는다.
- 기존 `usage_count`는 ledger 합계의 호환 projection으로 유지할 수 있다.

## Consequences

### Positive
- 사용자에게 설명할 feature와 quota 규칙이 단순해진다.
- 네이버와 WordPress 동시 발행이 추가 비용 없이 하나의 콘텐츠 작업으로 취급된다.
- 실패와 재시도 때문에 사용량이 중복 차감되지 않는다.
- 기본 기능과 유료 entitlement의 경계가 명확해진다.

### Negative
- 현재 `check_and_use_license`를 reserve/commit/release 계약으로 교체해야 한다.
- UI, 자동 실행, Telegram/Agent 경로가 동일한 preflight 계약을 사용하도록 정리해야 한다.
- Supabase feature JSON 변경과 앱 코드 배포 순서를 맞춰야 한다.

## Rollout Constraint
- 현재 앱은 `enable_trends_date_override` 누락을 비활성으로 해석한다.
- 앱 코드가 새 계약을 지원하기 전에 이 키를 Supabase에서 삭제하면 날짜 지정 트렌드가 차단된다.
- 먼저 앱의 feature 평가와 quota 흐름을 배포하고, 이후 제거 대상 키를 Supabase에서 삭제한다.
