# Account, Subscription, and Billing Foundation Plan

## Purpose
현재 `test`와 `free` 라이선스만 제공하는 BlogGenius에 외부 결제를 붙이기 전에, 사용자에게 구독·사용량·기기 상태를 보여주는 화면과 서버의 계정·구독 경계를 먼저 만든다.

이 단계의 목표는 결제 UI를 서둘러 붙이는 것이 아니다. 특정 결제사에 종속되지 않는 계약을 만들고, 기존 `license_key + HWID` 방식이 향후 계정 로그인과 유료 구독으로 자연스럽게 확장되도록 준비하는 것이다.

## Why Now
현재 라이선스 계층은 다음 책임을 함께 가진다.

- 설치 기기 식별
- 라이선스 키 발급·복구
- 플랜 판별
- 기능 권한 판별
- 사용량 카운트와 차감
- 이메일 연결

이 구조는 `test/free` 운영에는 충분하지만 외부 결제가 추가되면 다음 문제가 생긴다.

- 결제 고객과 설치 기기의 수명주기가 다르다.
- 구독 상태와 기능 권한을 결제사 응답에 직접 의존하게 될 수 있다.
- 환불, 연체, 해지 예약, 플랜 변경을 단일 `licenses.status`로 표현하기 어렵다.
- 재시도된 웹훅이나 발행 요청이 사용량과 결제를 중복 반영할 수 있다.
- 로그인 도입 시 라이선스 키를 사용자 계정으로 이전하는 경계가 없다.

## Design Principles
- 결제 공급자는 결제 사실의 원천이고, 앱 기능 권한의 직접 원천은 아니다.
- 기능 접근의 단일 기준은 서버가 계산한 entitlement projection이다.
- 결제 웹훅과 사용량 차감은 반드시 idempotency key를 가진다.
- 사용량은 event-first로 기록하고 합계와 잔여량은 파생한다.
- 데스크톱 앱에는 결제 공급자 secret이나 webhook 처리 로직을 두지 않는다.
- 원본 라이선스 키와 원본 HWID는 UI 또는 일반 API 응답에 노출하지 않는다.
- 현재의 device-license 사용자는 로그인 도입 전까지 계속 동작해야 한다.

## Target Control Path
```text
Desktop UI
   -> Account Overview API
      -> Account Read Model
         -> Account
         -> Subscription
         -> Entitlement
         -> License / Device
         -> Usage Ledger

External Checkout / Customer Portal
   -> Billing Provider
      -> Server Webhook Adapter
         -> Billing Event Inbox
            -> Subscription State
               -> Entitlement Projection
```

## Domain Boundaries

### Account
결제 고객과 향후 로그인 주체가 귀속되는 장기 식별자다.

- 현재: 이메일 인증을 마친 license owner
- 향후: 인증 provider를 통해 로그인한 사용자
- 계정이 없어도 `test` device-license는 사용할 수 있다.
- 이메일 문자열 자체를 primary key나 인증 수단으로 사용하지 않는다.

### Subscription
고객이 어떤 상품을 어떤 기간과 상태로 구독 중인지 표현한다.

- `trialing`, `active`, `past_due`, `paused`, `canceled`, `expired`
- provider의 외부 customer/subscription id는 별도 binding으로 보관한다.
- 해지 예약과 즉시 해지를 구분한다.
- provider payload는 감사·재처리를 위해 보관하되 제품 로직이 payload shape에 의존하지 않게 한다.

### Entitlement
현재 시점에 앱이 허용해야 할 기능과 제한값의 계산 결과다.

- feature flags
- 포스트별/실행별 제한
- quota mode, limit, cycle
- entitlement source와 유효 기간

`license_plans.features`는 초기 entitlement template으로 유지할 수 있다. 실제 실행은 `subscription + plan + overrides`에서 계산된 entitlement snapshot을 사용한다.

### License and Device
라이선스는 앱 설치가 서버 entitlement를 조회하고 사용하는 runtime credential이다.

- 현재 고유 `license_key` 경로를 유지한다.
- `licenses.account_id`를 nullable로 추가해 기존 device-license와 계정 귀속 라이선스를 함께 지원한다.
- HWID는 해시 또는 비가역 식별자로 저장한다.
- 향후 다중 기기 정책이 필요하면 `license_devices`로 분리한다.
- 기기 제한은 subscription policy로 계산하고 결제 provider에 넣지 않는다.

### Usage
사용량의 사실 원장이다.

- 어떤 account/license가
- 어떤 capability를
- 어떤 작업 id로
- 언제 예약, 성공, 취소했는지 기록한다.

현재 `usage_count`는 호환용 projection으로 유지하고, 장기적으로 `usage_events` 합계에서 파생한다.

콘텐츠 발행 작업 한 건을 quota 한 건으로 계산한다. 같은 작업을 네이버와 WordPress에 함께 처리해도 한 건이며, `draft`, `schedule`, `publish` 중 하나 이상의 대상 플랫폼이 정상 처리되면 commit한다. 모든 대상 실패 시 release하고 같은 operation id 재시도는 추가 차감하지 않는다. 트렌드/RSS 수집과 생성 전용 작업은 quota를 사용하지 않는다.

라이선스 feature는 `cmd_batch`, `cmd_trends`, `cmd_shopping`, `enable_related_posts_auto_link`, `enable_sns_distribution` 다섯 개의 필수 boolean으로 단순화한다. 기본 발행, 이미지 생성 옵션, 회당 최대 발행 수, 트렌드 날짜 지정은 별도 entitlement로 두지 않는다.

## Provider-Neutral Billing Model
외부 결제 연동은 아래 세 축으로 정의한다.

- `kind`: `checkout`, `subscription`, `customer_portal`, `refund`
- `transport`: `hosted_checkout`, `server_api`, `webhook`
- `config`: provider instance id, product/price mapping, endpoint configuration

제품 코드에는 Stripe, Toss Payments 같은 provider 이름을 조건문으로 흩뿌리지 않는다. provider adapter가 다음 normalized contract를 반환한다.

```json
{
  "provider": "provider_instance_id",
  "event_id": "external_event_id",
  "event_type": "subscription.updated",
  "customer_ref": "external_customer_id",
  "subscription_ref": "external_subscription_id",
  "status": "active",
  "product_ref": "external_product_id",
  "price_ref": "external_price_id",
  "current_period_start": "2026-06-01T00:00:00Z",
  "current_period_end": "2026-07-01T00:00:00Z",
  "cancel_at_period_end": false
}
```

## Proposed Server Data Model

### `accounts`
- `id uuid primary key`
- `status`
- `primary_email`
- `email_verified_at`
- `created_at`, `updated_at`

### `account_identities`
- `account_id`
- `kind` (`verified_email`, future auth provider)
- `provider`
- `external_subject`
- unique `(kind, provider, external_subject)`

### `billing_customers`
- `account_id`
- `provider_id`
- `external_customer_id`
- unique `(provider_id, external_customer_id)`

### `subscriptions`
- `id uuid primary key`
- `account_id`
- `provider_id`
- `external_subscription_id`
- `plan_code`
- `status`
- `current_period_start`, `current_period_end`
- `cancel_at_period_end`, `canceled_at`, `ended_at`
- unique `(provider_id, external_subscription_id)`

### `billing_events`
- `provider_id`
- `external_event_id`
- `event_type`
- `payload_json`
- `processing_status`
- `attempt_count`
- `received_at`, `processed_at`, `last_error`
- unique `(provider_id, external_event_id)`

### `entitlement_snapshots`
- `account_id` or `license_id`
- `plan_code`
- `features jsonb`
- `quota_mode`, `quota_limit`, `quota_cycle`
- `effective_from`, `effective_until`
- `source_type`, `source_id`

### `usage_events`
- `id uuid primary key`
- `account_id`, `license_id`
- `capability_id`
- `operation_id`
- `units`
- `status` (`reserved`, `committed`, `released`)
- `occurred_at`, `committed_at`, `released_at`
- unique `(license_id, operation_id, capability_id)`

### Existing Table Evolution
- `licenses.account_id uuid null`
- `licenses.subscription_id uuid null`은 두지 않는 것을 기본으로 한다. 구독 교체 시 라이선스까지 다시 연결해야 하기 때문이다.
- `licenses.usage_count`, `usage_limit`, `reset_date`는 migration 기간 동안 compatibility projection으로 유지한다.
- `license_plans`는 제품 plan catalog와 entitlement template 역할을 유지한다.
- 기존 정책 문서에서 제안한 `payment_events`는 결제 성공 이벤트뿐 아니라 구독 변경·환불·재처리 상태까지 담는 `billing_events`로 일반화한다. 이미 운영 테이블이 존재한다면 rename 또는 compatibility view를 별도 migration에서 결정한다.

## Account Overview Contract
로그인 전에도 사용할 수 있는 읽기 전용 API를 먼저 제공한다.

`GET /api/v1/account/overview`

```json
{
  "identity": {
    "type": "device_license",
    "account_id": null,
    "email": null,
    "email_verified": false
  },
  "subscription": {
    "plan_code": "free",
    "plan_name": "Free",
    "status": "active",
    "billing_managed": false,
    "current_period_end": null,
    "cancel_at_period_end": false
  },
  "usage": {
    "mode": "metered",
    "limit": 15,
    "used": 3,
    "remaining": 12,
    "resets_at": "2026-07-01T00:00:00Z"
  },
  "capabilities": {
    "features": {},
    "limits": {}
  },
  "device": {
    "hw_id": "******A1B2C3D4",
    "platform": "darwin",
    "arch": "arm64",
    "app_version": "0.1.13-dev1",
    "node_version": "24.x",
    "electron_version": "40.x"
  },
  "connections": {
    "naver": "connected",
    "google_sheets": "configured",
    "wordpress": "not_configured"
  },
  "actions": [
    { "id": "register_email", "enabled": true },
    { "id": "upgrade", "enabled": false },
    { "id": "manage_subscription", "enabled": false }
  ]
}
```

응답의 `actions`는 UI가 임의로 결제 가능 여부를 추론하지 않도록 서버가 결정한다.

## UI Direction
좌측 대메뉴에는 기존 숨은 `view-license`를 대체하는 `내 정보` 메뉴를 추가하고, 화면 제목은 `계정 및 구독`으로 한다. 현재는 device-license 정보가 중심이지만 향후 로그인 사용자 정보와 결제 관리까지 같은 정보 구조 안에서 확장한다.

### Navigation Placement
좌측 메뉴 순서는 다음과 같이 유지한다.

```text
대시보드
블로그
쇼핑커넥트

내 정보
설정
로그/이력
Help
```

`내 정보`는 콘텐츠 작업 메뉴와 운영 도구 사이에 둔다. 현재 플랜 상태는 메뉴가 아니라 계정 및 구독 화면 안에서 명확한 문구로 표시한다.

### Page Wireframe
```text
┌──────────────────────────────────────────────────────────────┐
│ 계정 및 구독                                  [새로고침]     │
│ 이 기기의 라이선스와 구독 상태를 관리합니다.                 │
├──────────────────────────────────────────────────────────────┤
│ 현재 플랜                                                    │
│ FREE                                      활성               │
│ 이번 기간 3회 사용                          12회 남음         │
│ [██████░░░░░░░░░░░░░░] 3 / 15                               │
│ 다음 초기화 2026-07-01                                         │
├─────────────────────────────┬────────────────────────────────┤
│ 계정                        │ 기기                           │
│ 기기 라이선스로 사용 중     │ MacBook Pro · macOS           │
│ 이메일 미등록               │ Apple Silicon (arm64)         │
│ [이메일 등록]               │ HW ID ******A1B2C3D4         │
│                             │ 앱 v0.1.13-dev1                │
├─────────────────────────────┼────────────────────────────────┤
│ 포함 기능                   │ 연결 상태                      │
│ 블로그 발행       사용 가능 │ 네이버       연결됨           │
│ 쇼핑커넥트         제한됨   │ Google Sheets 설정됨          │
│ 자동 포스팅       사용 가능 │ WordPress     미설정 [설정]   │
└─────────────────────────────┴────────────────────────────────┘
```

### Header
- 제목: `계정 및 구독`
- 설명: 현재 license identity가 계정인지 기기 라이선스인지 설명한다.
- `새로고침`: account overview만 다시 조회한다.
- 조회 실패 시 전체 화면을 비우지 않고 마지막 상태와 재시도 action을 표시한다.

### Subscription Card
- 현재 플랜과 상태
- 사용량 progress와 남은 발행 횟수
- 서버가 명시적인 기간 정보를 제공할 때만 다음 초기화 일시 또는 구독 기간 종료일
- `업그레이드` 또는 `구독 관리` action
- quota가 무제한이면 progress bar 대신 `무제한` 상태를 표시한다.
- `test`의 1회성 quota에는 초기화 일시를 표시하지 않는다.
- 결제 기능이 없는 동안에는 checkout 또는 업그레이드 UI를 노출하지 않는다.

### Account Card
- 현재는 `기기 라이선스로 사용 중` 상태
- 이메일 등록/인증 상태
- 향후 로그인 시 사용자 이름과 로그인 provider 표시
- 이메일 전체는 본인 화면에서 표시할 수 있지만 로그와 support payload에서는 마스킹한다.
- 로그인 미구현 상태에서는 avatar나 임의 사용자 이름을 만들지 않는다.

### Device Card
- OS, architecture, 앱 버전
- 마스킹된 support id
- 라이선스 키와 원본 HWID는 표시하지 않음
- `HW ID`는 해시 변환 없이 원본 식별자의 마지막 8자리만 노출한다.

### Connection Card
- 네이버, Google Sheets, WordPress 연결 상태
- 설정이 필요한 항목은 기존 설정 화면의 해당 탭과 입력란으로 이동

### Included Features Card
- raw feature flag 이름을 그대로 보여주지 않는다.
- 제품 기능 label과 `사용 가능`, `제한됨`, `회당 N건` 형태로 변환한다.
- 기능 제한의 실제 source는 account overview의 capabilities다.

### Tester State
- 플랜 이름: `Tester`
- 사용량: `사용 / 전체`, 초기화 없음
- 정상 상태에서는 내부 라이선스 검증 성공 메시지를 노출하지 않음
- 소진 전: 이메일 등록 action 제공
- 소진 후: `테스트 사용량을 모두 사용했습니다.`와 허용된 upgrade action 표시

### Free State
- 플랜 이름: `Free`
- 설명: 월간 quota와 다음 초기화 일시 표시
- 결제 기능 준비 전에는 업그레이드 UI를 노출하지 않는다.
- 결제 기능 활성화 후 server-provided `upgrade` action이 있을 때만 버튼 표시

### Paid State
- 플랜 이름과 `활성`, `결제 확인 필요`, `해지 예정` 상태 badge 표시
- 다음 결제일 또는 현재 사용 기간 종료일 표시
- `구독 관리`는 provider hosted portal을 시스템 브라우저로 연다.
- 카드번호, 결제수단 상세, provider raw status는 앱 안에서 직접 다루지 않는다.

### Responsive Behavior
- 넓은 화면: subscription card 전체 너비, 아래 카드는 2열
- 좁은 화면: 모든 카드를 1열로 배치
- 사용량 숫자와 주요 action은 접힌 sidebar나 작은 화면에서도 먼저 보이게 한다.

## Checkout and Portal Flow

### Checkout
1. 앱이 서버에 checkout session 생성을 요청한다.
2. 서버는 verified account 또는 짧은 수명의 email verification grant를 확인한다.
3. 서버가 provider hosted checkout URL을 생성한다.
4. 앱은 시스템 브라우저로 URL을 연다.
5. 결제 완료 여부는 redirect query가 아니라 서명된 webhook으로 확정한다.
6. webhook 처리 후 subscription과 entitlement를 갱신한다.
7. 앱은 account overview를 다시 조회한다.

### Customer Portal
1. 앱이 서버에 portal session을 요청한다.
2. 서버가 account ownership과 billing customer binding을 확인한다.
3. 짧은 수명의 provider portal URL을 반환한다.
4. 카드 변경, 해지, 영수증 등은 provider hosted portal에서 처리한다.

데스크톱 앱이 provider API key를 보유하거나 결제 결과를 직접 신뢰해서는 안 된다.

## Subscription State Policy
- `trialing`, `active`: entitlement 활성
- `past_due`: grace period 정책에 따라 제한적으로 활성
- `paused`: 신규 quota 사용 차단, 데이터 유지
- `canceled`: 현재 period 종료 전까지 활성 가능
- `expired`: entitlement 비활성 또는 free fallback
- `refunded`: 환불 정책에 따라 즉시 비활성 또는 period 조정

상태 전환 정책은 provider adapter가 아니라 제품 정책 계층에서 결정한다.

## Migration Strategy

### Existing Test License
- account 없이 계속 동작한다.
- 이메일 등록 시 account를 생성하거나 기존 account에 claim한다.
- test 재진입 차단 정책은 기존 `license_device_states`를 유지한다.

### Existing Free License
- account 없는 device-license 상태로 유지할 수 있다.
- 업그레이드 진입 시 이메일 인증을 요구하고 account에 연결한다.
- 결제 성공 후 같은 license key에 account entitlement가 반영되도록 한다.

### Future Login
- 로그인은 새로운 account를 만드는 동작이 아니라 기존 verified identity를 찾아 session을 발급하는 동작이어야 한다.
- 동일 이메일이라는 이유만으로 자동 merge하지 않는다.
- license claim 또는 계정 병합에는 재인증과 감사 이벤트가 필요하다.

## Phased Delivery

### Phase 1: Read-Only Foundation
- `src/account/` read model과 contract 추가
- `/api/v1/account/overview` 추가
- `내 정보` 좌측 메뉴와 `계정 및 구독` 화면 구현
- 기존 license/capability/session 데이터를 집계
- 원본 secret/HWID 비노출 테스트

### Phase 2: Account Claim
- accounts와 account identities 추가
- 기존 이메일 등록을 account claim 흐름으로 확장
- license에 nullable account binding 추가
- 복구와 기기 변경 감사 이벤트 추가

### Phase 3: Billing Adapter
- provider adapter contract 추가
- hosted checkout/portal session API 추가
- webhook signature 검증과 billing event inbox 구현
- provider product/price와 내부 plan_code mapping 구성

### Phase 4: Entitlement Projection
- subscription에서 entitlement snapshot 계산
- 기존 `check_license_status`가 projection을 읽도록 확장
- provider 장애 중에도 마지막 유효 entitlement로 제한적 동작

### Phase 5: Usage Ledger
- operation id 기반 reserve/commit/release 추가
- 기존 `check_and_use_license` 호출을 단계적으로 교체
- `usage_count`를 ledger projection으로 전환
- 실패한 발행에 대한 차감 복구 정책 적용

### Phase 6: Login
- account session과 auth provider 추가
- device-license claim/transfer UX 구현
- 다중 기기와 기기 해제 정책 구현

## Non-Goals for Phase 1
- 실제 결제
- 특정 결제사 선정
- 로그인/session 구현
- 기존 license RPC 제거
- 다중 기기 정책 강제
- quota 차감 방식 즉시 교체

## Validation and Security Checklist
- account overview에 license key, raw HWID, provider secret이 포함되지 않는다.
- checkout/portal URL은 짧은 수명이며 account ownership 검증 후 발급된다.
- webhook signature를 검증하고 event id로 중복 처리를 막는다.
- provider event 수신과 제품 상태 적용을 분리해 재처리할 수 있다.
- 결제 redirect만으로 entitlement를 활성화하지 않는다.
- usage operation id 재시도는 한 번만 차감된다.
- account merge와 device transfer는 감사 이벤트를 남긴다.
- `past_due`, refund, cancel-at-period-end 정책 테스트가 존재한다.

## Open Decisions
- 첫 결제 provider와 국내/해외 결제 범위
- 월 정액, 사용량 기반, 혼합 과금 중 초기 모델
- 유료 플랜별 quota와 device limit
- `past_due` grace period 길이
- free fallback과 유료 만료 후 데이터 보존 정책
- 세금계산서, 현금영수증, 환불 처리의 운영 주체

## Recommended First Implementation Slice
Phase 1만 먼저 구현한다.

1. account overview contract와 service 단위 테스트
2. 기존 `view-license`를 `계정 및 구독` 화면으로 교체
3. sidebar 메뉴 연결
4. 대시보드의 plan badge가 account overview read model을 재사용하도록 정리
5. 결제 버튼은 server-provided action이 활성화될 때만 노출

이 범위는 실제 결제 도입 전에도 사용자 가치가 있고, 이후 provider 선정과 로그인 설계에 되돌리기 어려운 결정을 최소화한다.
