# CI Node 24 Actions 개발 기록

## Branch

`feature/ci-node24-actions`

## 목표

환경 승격 GitHub Actions에서 Node.js 20 기반 Action 때문에 발생하는 deprecation annotation을
제거한다. BlogGenius의 Node.js 24 기준은 유지하고, workflow 동작과 배포 안전 경계는 변경하지
않는다.

## 설계와 결정사항

- `actions/upload-artifact`는 Node.js 24 기반 major version으로 올린다.
- `actions/download-artifact`는 Node.js 24 기반 major version으로 올린다.
- `supabase/setup-cli`는 현재 공식 major version으로 올린다.
- artifact 이름, 경로, 보존 기간과 Development drift 검증 순서는 유지한다.
- Supabase CLI version 입력은 기존과 동일하게 유지해 이번 변경을 Action runtime 교체로 제한한다.
- Production 배포 동작은 추가하지 않는다.

## 검증 계획

- workflow contract test
- 전체 unit test
- `git diff --check`
- `dev` 병합·push 후 GitHub Actions 성공 및 Node.js 20 annotation 부재 확인

## 결과

- 환경 승격 workflow의 `upload-artifact`를 v6, `download-artifact`를 v7로 변경했다.
- `supabase/setup-cli`를 v2로 변경했다.
- artifact 이름·경로·보존 기간과 Development drift 및 Production checklist 조건은 유지했다.
- workflow contract test 5개와 전체 unit test 1,054개가 통과했다.
- `git diff --check`가 통과했다.
- `dev` push 후 실제 GitHub Actions 결과는 병합 뒤 확인한다.
