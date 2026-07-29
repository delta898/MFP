# Paid Plans and Credits Plan

## Purpose
Free/Test 기반 라이선스 운영 다음 단계로, Pro/Ultra 구독과 1회성 크레딧 충전을 도입한다. 목표는 결제 기능을 붙이기 전에 제품 정책, 서버 책임, 데이터 모델, 차감 흐름을 명확히 하여 앱·Supabase·결제 provider 사이의 경계를 안정적으로 만드는 것이다.

## Policy Summary
- 구독은 권한과 월 기본 발행 횟수를 결정한다.
- 크레딧은 추가 발행 횟수만 제공한다.
- 권한 변경은 구독으로만 가능하다.
- 크레딧 구매는 현재 플랜을 변경하지 않는다.
- 크레딧은 만료되지 않는다.
- 크레딧은 환불하지 않는다.
- 발행 실패는 차감하지 않는다.
- `draft`, `schedule`, `publish`는 하나 이상의 대상 플랫폼이 정상 처리되면 차감한다.
- 네이버와 WordPress 동시 발행은 동일 콘텐츠 작업이면 1회만 차감한다.

## Product Model
```text
Plan = feature entitlement + monthly quota
Credit = additional publish units
```

### Plan
- `free`: 기본 발행 기능과 월 무료 quota.
- `pro`: 더 많은 월 quota와 고급 기능.
- `ultra`: 가장 높은 quota 또는 운영상 무제한에 가까운 quota와 상위 기능.

플랜 권한 예:
- `cmd_batch`
- `cmd_trends`
- `cmd_shopping`
- `enable_related_posts_auto_link`
- `enable_sns_distribution`

### Credit
- 콘텐츠 발행 횟수만 늘린다.
- `free + credit`은 Free 권한 범위 안에서 추가 발행만 가능하다.
- `pro + credit`은 Pro 권한 범위 안에서 추가 발행만 가능하다.
- 크레딧으로 Pro/Ultra 기능을 열 수 없다.

## Usage Policy
발행 가능 여부는 다음 조건을 모두 만족해야 한다.

```text
feature_allowed(action)
AND (monthly_remaining > 0 OR credit_balance > 0)
```

차감 순서:
1. 월 기본 quota 먼저 사용
2. 월 quota 소진 후 충전 크레딧 사용

월 quota는 매월 1일 갱신한다. 크레딧은 갱신과 무관하게 누적 보존한다.

## Server Boundary
현재 별도 애플리케이션 서버는 없으므로 Supabase가 서버 역할을 맡는다.

- Supabase DB: 라이선스, 플랜, 구독, 결제, 크레딧, 사용량 원장 저장
- Supabase Edge Functions: checkout 생성, webhook 검증, 결제 상태 재조회, entitlement 반영
- Supabase secrets: 결제 provider secret, webhook secret 보관

데스크톱 앱은 결제 성공을 직접 신뢰하거나 license/credit을 직접 변경하지 않는다. 결제 결과는 반드시 Supabase Edge Function이 provider API 또는 webhook으로 검증한 뒤 반영한다.

## Billing Provider Direction
1차 결제 provider 후보는 PortOne이다.

선정 이유:
- 국내 카드와 간편결제 연동 범위가 넓다.
- 정기결제와 1회 결제 흐름을 함께 다룰 수 있다.
- 데스크톱 앱은 hosted checkout URL을 열고, 결제 확정은 webhook으로 처리하는 구조에 맞다.

Provider 이름은 제품 도메인에 직접 흩뿌리지 않는다. 결제 provider adapter는 normalized billing event를 반환하고, 제품 정책 계층이 plan/credit 반영을 결정한다.

## Initial Checkout Flows

### Subscription Upgrade
```text
Desktop App
  -> Supabase Edge Function: create subscription checkout
  -> PortOne hosted checkout
  -> PortOne webhook
  -> Supabase Edge Function: verify event and payment state
  -> Supabase DB: subscription + entitlement update
  -> Desktop App: account overview refresh
```

필수 조건:
- verified email이 있어야 한다.
- 로그인은 1차 유료화 범위에 포함하지 않는다.
- 결제 소유권은 verified email과 account/license binding으로 연결한다.

### Credit Purchase
```text
Desktop App
  -> Supabase Edge Function: create credit checkout
  -> PortOne hosted checkout
  -> PortOne webhook
  -> Supabase Edge Function: verify payment
  -> Supabase DB: credit ledger + balance projection update
  -> Desktop App: account overview refresh
```

필수 조건:
- verified email이 있어야 한다.
- 현재 plan은 변경하지 않는다.
- 구매한 credit package만큼 credit ledger에 적립한다.

## Proposed Data Model

### `billing_providers`
- `id`
- `provider_type` (`portone`, future provider)
- `display_name`
- `status`
- `config_json`

### `billing_products`
- `id`
- `kind` (`subscription`, `credit_pack`)
- `plan_code` nullable
- `credit_units` nullable
- `display_name`
- `price_amount`
- `currency`
- `status`

### `billing_orders`
- `id`
- `account_id` nullable
- `license_id`
- `provider_id`
- `product_id`
- `kind` (`subscription`, `credit_pack`)
- `status` (`pending`, `paid`, `failed`, `canceled`)
- `external_order_id`
- `external_payment_id`
- `amount`
- `currency`
- `created_at`, `paid_at`

### `billing_events`
- `provider_id`
- `external_event_id`
- `event_type`
- `payload_json`
- `processing_status`
- `attempt_count`
- `received_at`, `processed_at`, `last_error`
- unique `(provider_id, external_event_id)`

### `subscriptions`
- `id`
- `account_id`
- `license_id`
- `provider_id`
- `external_subscription_id`
- `plan_code`
- `status`
- `current_period_start`, `current_period_end`
- `cancel_at_period_end`
- `created_at`, `updated_at`

### `credit_ledger`
- `id`
- `account_id` nullable
- `license_id`
- `order_id` nullable
- `operation_id` nullable
- `delta`
- `reason` (`purchase`, `publish_commit`, `admin_adjust`)
- `created_at`

Credit balance is a projection:

```text
sum(credit_ledger.delta)
```

크레딧 만료가 없으므로 `expires_at`은 두지 않는다. 환불을 지원하지 않으므로 refund reason은 초기 모델에서 제외한다.

### `usage_operations`
- `id`
- `license_id`
- `operation_id`
- `state` (`reserved`, `committed`, `released`)
- `quota_source` (`monthly`, `credit`, `unlimited`)
- `quota_units`
- `metadata_json`
- `reservation_expires_at`
- `created_at`, `committed_at`, `released_at`
- unique `(license_id, operation_id)`

## Quota Lifecycle
실행 전:
1. action feature를 검사한다.
2. 필요한 발행 횟수를 계산한다.
3. monthly remaining과 credit balance를 확인한다.
4. quota reservation을 생성한다.

실행 후:
- 하나 이상의 대상 플랫폼 성공: commit
- 모든 대상 플랫폼 실패: release
- 앱 종료 또는 중단: reservation 만료 후 release 가능

중복 재시도:
- 같은 `operation_id`는 한 번만 commit한다.
- 이미 commit된 operation은 추가 차감하지 않는다.

## Account Overview Additions
`GET /api/v1/account/overview`에는 다음 값을 추가한다.

```json
{
  "usage": {
    "monthly_limit": 100,
    "monthly_used": 8,
    "monthly_remaining": 92,
    "credit_balance": 30,
    "total_available": 122,
    "resets_at": "2026-07-01T00:00:00Z"
  },
  "billing": {
    "subscription_managed": true,
    "credit_purchase_enabled": true,
    "refund_policy": "non_refundable"
  }
}
```

UI 문구 방향:
- `구독은 기능과 월 기본 횟수를 제공합니다.`
- `크레딧은 현재 플랜 권한 안에서 사용할 수 있는 추가 발행 횟수입니다.`
- `이번 달 기본 제공량을 먼저 사용하고, 모두 사용하면 충전 크레딧이 사용됩니다.`
- `크레딧은 환불되지 않습니다.`

## Account Page UI Direction
`계정 및 구독` 화면을 paid plan 진입의 중심 허브로 유지한다. 현재 플랜이 `free`, `pro`, `ultra` 중 무엇이든 사용자가 이해해야 할 공통 action은 세 가지다.

1. `플랜 안내`
2. `크레딧 충전`
3. `구독 / 플랜 변경`

Ultra처럼 크레딧이 필요 없는 플랜에서는 `크레딧 충전` action을 숨기거나 비활성화할 수 있지만, action의 개념 자체는 동일한 위치와 계약으로 유지한다.

### Subscription Summary Card
상단 `현재 플랜` 카드는 사용량을 다음처럼 분리해서 보여준다.

```text
현재 플랜                         [플랜 안내]
Free Plan        활성

이번 달 사용량                    남은 기본 횟수
3 / 20회                         17회

충전 크레딧                       총 사용 가능 횟수
30회                             47회

이번 달 기본 제공량을 먼저 사용하고, 모두 사용하면 충전 크레딧이 사용됩니다.
                         [구독/플랜 변경] [크레딧 충전]
```

표시 원칙:
- 월 기본 quota와 충전 크레딧을 섞어서 하나의 숫자로만 보여주지 않는다.
- 총 사용 가능 횟수는 보조 정보로 표시한다.
- 주요 action은 카드 우측 하단에 둔다.
- 결제 기능이 아직 활성화되지 않은 action은 server-provided `actions`에 따라 숨기거나 disabled로 표시한다.

### Plan Guide Modal
플랜 안내는 설명 중심으로 짧게 유지한다.

```text
플랜 안내

Free
- 월 기본 발행 횟수
- 기본 블로그 발행

Pro
- 더 많은 월 기본 발행 횟수
- 트렌드, 쇼핑, 연관글 등 고급 기능

Ultra
- 가장 높은 사용량
- 상위 기능

크레딧
- 현재 플랜 권한 안에서 사용하는 추가 발행 횟수
- 만료 없음
- 환불 불가
```

이 모달은 결제 전환을 강하게 유도하지 않는다. 제품 구조를 설명하고, 실제 구매 action은 별도 `구독/플랜 변경` 또는 `크레딧 충전` 흐름에서 제공한다.

### Credit Purchase Modal Skeleton
초기 UI skeleton은 결제 provider 없이도 렌더링 가능해야 한다. 실제 결제 버튼은 서버가 checkout action을 제공할 때만 활성화한다.

```text
크레딧 충전

크레딧은 현재 플랜 권한 안에서 사용할 수 있는 추가 발행 횟수입니다.
이번 달 기본 제공량을 먼저 사용하고, 모두 사용하면 크레딧이 사용됩니다.

[+10회]  가격 준비 중
[+50회]  가격 준비 중
[+100회] 가격 준비 중

크레딧은 만료되지 않으며 환불되지 않습니다.

                         [닫기] [결제하기]
```

Free 사용자가 크레딧 충전 모달을 열면 다음 문구를 함께 표시한다.

```text
Free Plan에서는 기본 블로그 발행에만 크레딧을 사용할 수 있습니다.
Pro 기능은 구독 변경 후 사용할 수 있습니다.
```

### Subscription Change Modal Skeleton
구독 변경은 크레딧과 완전히 분리한다.

```text
구독 / 플랜 변경

구독은 기능 권한과 월 기본 발행 횟수를 변경합니다.
크레딧은 플랜을 변경하지 않습니다.

Free     월 기본 횟수 + 기본 발행
Pro      더 많은 월 기본 횟수 + 고급 기능
Ultra    가장 높은 사용량 + 상위 기능

                         [닫기] [선택한 플랜으로 변경]
```

결제 연동 전에는 `선택한 플랜으로 변경`을 숨기거나 `결제 준비 중`으로 표시한다. 결제 연동 후에는 server-provided checkout action을 사용한다.

### Publish Quota Preview
발행 실행 전에는 quota 차감 예상치를 보여준다. 이 UI는 결제와 별개로 먼저 설계하고, 실제 reserve/commit/release와 연결한다.

```text
이번 실행은 1회 차감됩니다.

사용 순서:
이번 달 기본 제공량 17회 남음 -> 먼저 사용
충전 크레딧 30회 보유

실행 후 예상:
이번 달 사용량 4 / 20회
충전 크레딧 30회
```

월 기본 quota가 없는 경우:

```text
이번 달 기본 제공량을 모두 사용했습니다.
이번 실행은 충전 크레딧 1회를 사용합니다.

충전 크레딧: 30회 -> 29회
```

월 기본 quota와 크레딧이 모두 없는 경우:

```text
사용 가능한 발행 횟수가 없습니다.

[크레딧 충전] [플랜 보기]
```

## Non-Goals for First Paid Slice
- 소셜 로그인 도입
- 계정 병합
- 다중 기기 정책
- 환불 자동화
- 크레딧 만료
- provider customer portal 전체 기능
- 앱 내부 결제 정보 보관

## Phased Delivery

### Phase 1: Account UI Read Model
- plan/credit 정책 문서화
- account overview에 credit read model 추가
- 계정 및 구독 상단 카드에 credit balance와 total available 표시
- 플랜 안내 모달을 구독/크레딧 정책 기준으로 정리

### Phase 2: Payment Action Skeletons
- 크레딧 충전 모달 UI skeleton 추가
- 구독/플랜 변경 모달 UI skeleton 추가
- 실제 결제 버튼은 server action이 열릴 때만 활성화

### Phase 3: Publish Quota Preview
- 발행 실행 전 quota preview 계약 정의
- monthly quota와 credit 차감 예상 표시
- 차감 불가 상태에서 `크레딧 충전`, `플랜 보기` action 제공

### Phase 4: Credit Ledger Foundation
- `credit_ledger`와 balance projection 추가
- 발행 quota 계산에 monthly + credit 반영
- 실패 release와 성공 commit 테스트 추가

### Phase 5: Billing Provider Adapter
- PortOne adapter contract 추가
- checkout 생성 Edge Function 추가
- webhook event inbox와 idempotency 구현

### Phase 6: Subscription Upgrade
- Pro/Ultra 상품 mapping
- 구독 성공 시 entitlement projection 갱신
- 구독 상태 변경 webhook 처리

### Phase 7: Credit Purchase
- credit pack 상품 mapping
- 1회 결제 성공 시 credit ledger 적립
- 결제 전 환불 불가 고지와 구매 후 account overview refresh

## Branching Plan
작업 단위가 커지면 `codex/paid-plans-and-credits` 아래에서 sub feature branch를 만든다.

- `codex/paid-plans-ui-read-model`: account overview와 상단 카드 credit 표시
- `codex/paid-plans-ui-skeletons`: 플랜 안내, 크레딧 충전, 구독 변경 모달 skeleton
- `codex/paid-plans-quota-preview`: 발행 전 quota preview
- `codex/paid-plans-credit-ledger`: Supabase/RPC credit ledger foundation
- `codex/paid-plans-portone-adapter`: PortOne checkout/webhook adapter

각 sub branch는 작은 PR 또는 fast-forward merge 가능한 커밋 단위로 유지한다.

## Open Decisions
- Pro/Ultra 월 quota 숫자
- Credit pack 단위와 가격
- PortOne에서 사용할 PG/정기결제 방식
- `past_due` grace period
- 구독 해지 후 Free fallback 시점
- 구매한 크레딧이 구독 해지 후에도 유지되는지 여부

## Initial Recommendation
첫 구현은 credit ledger와 account overview projection부터 시작한다. 실제 결제 provider 연동 전에 DB/RPC 차감 모델을 안정화하면, PortOne 연동 시 webhook은 ledger에 purchase event를 적립하는 얇은 계층으로 유지할 수 있다.
