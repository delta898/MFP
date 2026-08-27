# 개발·운영 환경 분리 Stage 5 — Development Supabase

> 작성일: 2026-08-27
> 상태: development Supabase 적용 및 desktop 핵심 통합 검증 완료
> Parent branch: `feature/development-environment-main`
> Branch: `feature/development-environment-05-hosted-development`

## 목표

production과 분리된 development Supabase에서 migration, Edge Function, 가짜 라이선스와 desktop
profile을 통합 검증한다. BlogGenius는 Supabase를 이용하는 애플리케이션으로 한정하며 설치·Secret·
컨테이너·원격 파일시스템 같은 환경 제공자의 구현을 알지 않는다.

## 구현 범위

1. development Supabase URL과 publishable key의 공개 연결 계약을 정의한다.
2. migration, development seed, Edge Function, 필요한 환경변수 이름을 manifest로 인계한다.
3. 환경 제공자의 종류나 내부 경로와 무관한 readiness와 HTTP smoke를 제공한다.
4. 라이선스 이메일은 development에서 기본 sink, 필요할 때만 allowlist 발송을 허용한다.
5. 실제 발행·결제·Cron·유료 provider smoke는 기본 차단한다.
6. BlogGenius가 원격 배포·Secret 관리·인프라 재기동을 수행하지 않는다.

## 외부 적용 순서

feature branch에서는 코드와 자동 테스트만 수행한다. Stage 5가 parent와 `dev`에 통합된 뒤:

1. 별도 development Supabase 환경을 준비한다.
2. 공개 URL과 publishable key를 로컬 개발 profile에 설정한다.
3. `npm run env:development:ready`로 연결 계약을 확인한다.
4. `npm run env:development:plan`으로 `dev` branch와 인계 산출물을 확인한다.
5. 환경 제공자가 자신의 표준 절차로 migration, seed, Edge Function과 환경변수를 적용한다.
6. `npm run env:development:smoke`로 무과금·무변경 연결 검사를 수행한다.
7. 개발용 라이선스로 desktop profile의 핵심 기능을 순차 확인한다.

## 2026-08-28 적용 기록

- 별도 Supabase SaaS development project의 기존 객체와 canonical schema 충돌 여부를 읽기 전용으로 확인했다.
- `supabase/migrations`의 migration 20개를 순서대로 적용하고 원격 migration 이력과 일치함을 확인했다.
- `supabase/development-seed.sql`을 적용해 development 라이선스 1개와 `development` 환경 표식을 확인했다.
- manifest에 선언된 Edge Function 5개를 배포하고 모두 `ACTIVE`이며 JWT 정책이 일치함을 확인했다.
- `npm run env:development:ready`와 `npm run env:development:smoke`가 통과했다.
- DB reset, Cron 활성화, 실제 알림·발행·결제, 유료 provider 호출은 수행하지 않았다.
- 실제 endpoint, key, DB password와 Secret 값은 문서나 Git에 기록하지 않았다.

desktop development profile 통합 검증 결과:

- runtime이 `development`와 development Supabase host를 선택했다.
- development 라이선스의 무차감 상태 조회가 Pro 100회 잔여로 통과했다.
- 앱의 원격 모델 카탈로그가 development RPC에서 published snapshot을 읽었다.
- Knowledge Gateway가 외부 provider 호출 없이 빈 development corpus snapshot을 정상 반환했다.
- 키워드 함수는 선택 provider credential이 없는 상태를 `NOT_CONFIGURED`로 반환했고 앱 fallback이 이를 안전하게 처리했다.
- 실제 UI에서 `Health: OK`와 `Plan: Pro (잔여 100)`을 확인했다.
- 환경 manifest의 live-effect 정책을 공통 runtime guard에 연결했다. `local`과 `development`에서는
  Naver·WordPress·SNS 직접 발행과 블로그·쇼핑·SNS 자동 발행 예약이 모두 실행 전에 차단된다.
- 발행 경계 집중 테스트 61개와 전체 unit test 989개가 통과했다.
- 직접 발행 함수 smoke에서 미선택 환경도 `LIVE_PUBLISH_BLOCKED_BY_ENVIRONMENT`로 실패하는 것을 확인했다.

키워드와 content news의 실제 provider 결과 검증은 development provider credential과 호출 예산을
별도 승인한 뒤 수행한다. 이는 core development 환경 분리의 완료 조건에는 포함하지 않는다.

## 사용자 준비 항목

- development Supabase의 공개 URL과 publishable key
- 환경 제공자 측 Edge Function 설정과 Secret
- 실제 이메일 시험이 필요할 경우 개발 수신자 allowlist
- 실제 provider 시험이 필요할 경우 개발 credential과 호출 예산 승인

BlogGenius에는 환경 제공자의 SSH, 디렉터리, 컨테이너, Compose 또는 Secret 파일 정보를 넣지 않는다.

## 완료 기준

- development가 production과 다른 Supabase URL을 사용한다.
- 환경 제공자가 동일 migration과 development seed를 적용할 수 있다.
- 다섯 Edge Function과 필요한 환경변수 계약이 인계된다.
- HTTP smoke가 환경 제공자의 구현을 알지 않고 통과한다.
- 기본 알림은 sink이며 allowlist 밖 이메일·Telegram 발송이 없다.
- 실제 발행·결제·Cron·유료 provider smoke가 차단된 상태에서 desktop development profile을 검증한다.
- 실행 환경을 선택하지 못한 경우에도 실제 발행이 fail-closed로 차단된다.
