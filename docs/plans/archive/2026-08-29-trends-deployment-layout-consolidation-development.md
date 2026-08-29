# Trends 배포 디렉터리 통합 개발 기록

## 브랜치

`feature/trends-deployment-layout-consolidation`

## 목표

Development Trends API의 실행 파일과 배포 계약이 서로 다른 `deploy/`,
`apps/trends/deployment/`에 나뉘어 생기는 혼동을 없앤다.

## 설계와 결정사항

- Trends API가 소유한 배포 파일은 `apps/trends/trends-api/deployment/` 아래에 둔다.
- Development Compose, 환경 예제, manifest, runbook을 같은 디렉터리에 둔다.
- 기존 루트 `deploy/`와 모호한 `apps/trends/deployment/`는 제거한다.
- Production 배포를 추가할 때는 같은 `deployment/production/` 형제로 확장한다.

## 결과

`apps/trends/trends-api/deployment/development/`만 열면 Development API의 설정, 실행,
검증 계약과 운영 문서를 모두 확인할 수 있다. Preflight와 계약 테스트도 동일 경로를 source of
truth로 사용한다.
