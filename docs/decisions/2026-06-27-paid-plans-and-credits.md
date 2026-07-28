# Decision: Paid Plans and Credits

## Status
Accepted

## Date
2026-06-27

## Context
BlogGenius는 Tester Plan 소진 후 Free Plan 전환과 verified email 연결을 지원한다. 다음 단계는 Pro/Ultra 유료 구독과 추가 발행 횟수 구매다.

초기 유료화에서 모든 기능을 로그인 계정 중심으로 재설계하면 소셜 로그인, 계정 병합, 기기 이전, 결제 소유권, 구독 상태 처리가 한꺼번에 커진다. 현재 제품은 `license_key + HWID + verified email` 흐름이 이미 동작하므로, 결제 소유권과 license entitlement를 이 흐름 위에 얹는 편이 더 안전하다.

## Decision
구독과 크레딧의 책임을 분리한다.

- 구독은 권한과 월 기본 발행 횟수를 결정한다.
- 크레딧은 추가 발행 횟수만 제공한다.
- 권한 변경은 구독으로만 가능하다.
- 크레딧 구매는 현재 플랜을 변경하지 않는다.
- 크레딧은 만료되지 않는다.
- 크레딧은 환불하지 않는다.
- 실패한 발행은 차감하지 않는다.
- `draft`, `schedule`, `publish`는 하나 이상의 대상 플랫폼이 정상 처리되면 차감한다.
- 네이버와 WordPress 동시 발행은 동일 콘텐츠 작업이면 1회만 차감한다.

1차 유료화에서는 full login을 필수로 도입하지 않는다. 결제와 복구 연락처는 verified email을 사용한다. 별도 애플리케이션 서버를 먼저 만들지 않고 Supabase DB와 Edge Functions가 결제 생성, webhook 검증, entitlement/credit 반영을 담당한다.

## Consequences
- 사용자는 `구독 = 기능`, `크레딧 = 횟수`로 이해할 수 있다.
- Free 사용자는 크레딧을 구매해도 Free 권한 범위 안에서만 추가 발행할 수 있다.
- Pro 사용자는 Pro 권한 범위 안에서 월 quota를 초과해 크레딧을 사용할 수 있다.
- 결제 provider 성공 redirect만으로 권한이나 크레딧을 반영하지 않는다.
- 발행 차감은 operation id 기반 reserve/commit/release 흐름으로 유지해야 한다.
- 향후 로그인은 verified email/account identity 위에 추가할 수 있지만, 1차 유료화의 선행 조건은 아니다.

## Follow-Up
- Pro/Ultra 월 quota와 credit pack 가격을 결정한다.
- PortOne 정기결제와 1회 결제 adapter contract를 확정한다.
- `docs/plans/active/paid-plans-and-credits-plan.md`에 따라 credit ledger와 account overview projection부터 구현한다.
