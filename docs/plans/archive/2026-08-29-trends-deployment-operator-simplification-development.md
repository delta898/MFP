# Trends 배포 운영 단순화 개발 기록

## 브랜치

`feature/trends-deployment-operator-simplification`

## 목표

Development Trends API를 다시 배포할 때 복잡한 저장소 전역 설정과 직접 Node 실행 명령을
기억하지 않아도 되게 한다. API 배포, Collector 실행, Desktop 설정의 소유권을 파일명과
디렉터리만 보고 구분할 수 있게 한다.

## 설계와 결정사항

- Development API 배포 단위를 `apps/trends/trends-api/deployment/development/`에 모은다.
- Compose와 API 전용 `.env.trends-api.development`를 같은 폴더에 둔다.
- API 컨테이너는 host `4582`에 publish하고 별도 Caddy 컨테이너가 HTTPS를 담당한다. Oracle
  VCN과 host firewall에서는 4582를 외부에 공개하지 않는다.
- Collector 설정은 `apps/trends/.env.trends-collector.<environment>`로 명명한다.
- Desktop의 루트 `.env.development`는 변경하지 않는다.
- 혼동을 만들던 직접 `api` 실행 명령과 다목적 shell launcher를 제거한다.
- 사용자는 `collect_trends_local.sh` 또는 `collect_trends_dev.sh`로 수집만 실행한다.
- Production 배포 방식은 이번 범위에서 변경하지 않는다.

## 과정

기존에는 API와 Collector가 같은 이름의 `.env.development`를 공유하는 것처럼 보였고,
`trends_dev.sh api`와 원격 Docker Compose가 모두 API 실행 수단으로 존재했다. 이를 실행 주체별
파일로 분리하고 Development 배포 폴더를 self-contained Compose 단위로 바꾸었다.

## 결과

- Oracle 서버는 저장소 checkout 후 API 폴더의 환경 파일을 한 번 설정하고
  `docker compose up -d --build`로 배포할 수 있다.
- 일반 재배포, 상태 확인, Caddy 연결, 장애 확인 절차를 한 문서에서 따라갈 수 있다.
- Collector와 API의 설정 파일 및 실행 명령이 명확히 분리된다.
