# Trends 환경 분리 마무리 개발 기록

## 브랜치

`feature/trends-environment-closeout`

## 목표

실제 Development 배포와 Desktop E2E 결과를 계획 문서에 반영하고, 배포 자동화와 Production 전환을
현재 기능의 완료 조건에서 분리한다.

## 결정사항

- Stage 1~5를 Trends 환경 분리 feature의 완료 범위로 확정한다.
- Stage 6 GHCR·배포 자동화는 Development 수동 운영이 안정된 뒤 별도 feature로 진행한다.
- Production Trends API 전환은 별도 승인과 rollback 계획을 전제로 한다.
- Development의 수동 발행 허용은 Trends가 아니라 runtime effect policy 별도 feature에서 진행한다.

## 결과

Development API, collector, Supabase와 Desktop 키워드 탐색의 전체 경로가 검증됐다. 현재 parent를
`dev`에 병합해 GitHub Actions 통합 검증으로 넘길 수 있는 상태다.
