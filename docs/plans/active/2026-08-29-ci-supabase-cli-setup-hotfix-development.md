# CI Supabase CLI 설치 Hotfix 개발 기록

## Branch

`hotfix/ci-supabase-cli-setup`

## 목표

`supabase/setup-cli@v2`가 GitHub Actions의 `Setup Supabase CLI` 단계에서 장시간 멈추는 문제를
해결한다. 환경 검증 내용과 Development·Production 안전 경계는 변경하지 않는다.

## 현상과 판단

- Bun과 Action 의존성 설치는 즉시 완료됐다.
- 실제 Supabase CLI 설치 단계가 6분 이상 출력 없이 진행됐다.
- migration이나 Function 조회 전 단계이므로 원격 DB 변경은 없었다.
- `latest` 선택을 제거하고 이미 Local·Development 적용에서 검증한 CLI 버전을 고정한다.

## 설계와 결정사항

- `supabase/setup-cli@v3`를 사용한다.
- CLI는 `2.114.0`으로 고정한다.
- v3에서 제거된 `github-token` 입력은 추가하지 않는다.
- local validation과 Development drift job에 같은 버전을 사용한다.
- artifact Action 버전과 workflow 실행 순서는 유지한다.

## 검증 계획

- workflow contract test
- 전체 unit test
- `git diff --check`
- `dev` push 후 Setup Supabase CLI 완료 시간과 전체 workflow 결과 확인

## 결과

- local validation과 Development drift의 Supabase setup Action을 v3로 변경했다.
- 두 job 모두 CLI `2.114.0`을 사용하도록 고정했다.
- workflow contract test 5개와 전체 unit test 1,054개가 통과했다.
- `git diff --check`가 통과했다.
- `dev` push 후 실제 설치 시간과 전체 workflow 결과는 병합 뒤 확인한다.
