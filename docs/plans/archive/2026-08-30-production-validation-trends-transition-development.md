# Production Validation and Trends API Transition Preparation

## 브랜치 정보

- branch: `feature/production-validation-trends-transition`
- 시작일: 2026-08-30
- base/parent branch: `dev`
- 상태: 완료 (Production 전환 완료, 안정화 후 정리는 후속 작업)

## 사용자 필요

Development에서 수동 발행과 Trends 환경 분리를 검증했으므로, 실제 Production 검증으로 넘어가기
전에 무엇을 검사하고 어떤 순서로 Trends API를 기존 systemd Node 서비스에서 컨테이너로
전환할지 재현 가능하게 준비해야 한다. Production 변경은 긴장도가 높은 작업이므로 명령을
즉흥적으로 조합하지 않고, 사전 검증·승인·rollback 경계를 명확히 해야 한다.

## 목표

- 현재 Production runtime과 Development Compose 구조의 차이를 정확히 기록한다.
- Production 후보 Compose 배포 단위를 코드로 준비한다.
- secret 값을 읽거나 출력하지 않는 Production preflight를 제공한다.
- build, health, 인증 경계, ingress, rollback을 단계별 runbook으로 만든다.
- 실제 전환 전에 수행할 BlogGenius Production 검증 체크리스트를 현행화한다.

## 범위

- `apps/trends/trends-api/deployment/production/` 후보 배포 구조
- Production 환경 계약과 fail-closed guard
- 비밀 값 없는 preflight 및 정적/fixture 검증
- 기존 systemd에서 Compose로 전환하는 승인 기반 runbook
- rollback과 전환 후 smoke 항목
- 관련 아키텍처·운영 문서와 테스트

## 명시적 비목표

- Production Supabase migration 실행
- Production Edge Function 배포 또는 secret 변경
- Oracle 서버 접속, 파일 수정, 컨테이너 실행, systemd 중지
- Caddy 변경 또는 Production 트래픽 전환
- Production 글·SNS 발행
- release 또는 Desktop Production build

## 제안 설계

1. 현재 Production systemd 및 Caddy 의존성을 inventory한다.
2. Development와 같은 이미지 계약을 쓰되 Production 전용 Compose와 operator env sample을
   별도 배포 폴더에 둔다.
3. preflight는 branch, 환경 선언, HTTPS 공개 URL, port, 필수 설정 이름, Production 승인 값의
   존재만 검사하고 secret 값은 출력하지 않는다.
4. 전환은 기존 service 유지 상태의 image build 및 container-local smoke부터 시작한다.
5. Caddy upstream 교체와 systemd 중지는 별도 최종 승인 뒤에만 수행한다.
6. 실패 시 Caddy upstream과 systemd를 기존 상태로 되돌리는 rollback을 먼저 문서화한다.

## 구현 단계

1. Production 현황 및 호출 관계 조사
2. Production deployment contract와 Compose 후보 작성
3. Production preflight 및 구조 테스트 작성
4. 검증·전환·rollback runbook 작성
5. 관련 문서 현행화 및 전체 자동 검증

## 결정사항과 트레이드오프

- Production 준비와 실제 전환을 분리한다. 준비 단계에서 원격 변경을 하지 않아 안전하지만,
  실제 서버 상태는 최종 승인 후 별도 확인해야 한다.
- 기존 systemd 진입점과 서비스는 rollback 경로로 유지한다. 중복 운영 요소가 잠시 남지만
  즉시 복구 가능성이 높아진다.
- Production 편의 실행 스크립트는 안전 경계가 확정되기 전에는 제공하지 않는다.

## 진행 기록

- 브랜치와 개발 기록을 생성했다.
- 현재 Production은 Oracle host `4581`의 systemd Node 서비스이고 Caddy가 이 port로 전달함을
  재확인했다.
- Production 후보를 host `4583`에 병행 기동하면 기존 systemd와 포트 충돌 없이 먼저 검증할 수
  있고, Caddy 한 줄로 전환·rollback할 수 있다고 결정했다.
- Production 전용 Compose, manifest, ignored env sample을 추가했다. Compose는 Caddy나 systemd를
  직접 수정하지 않는다.
- Production runtime이 알려진 Development Supabase/API target을 사용하면 fail-closed하도록
  runtime guard를 보강했다.
- secret 값을 출력하지 않고 설정·token 계약·대상 환경·병행 port를 검사하는 preflight와 구조
  테스트를 추가했다.
- 준비, read-only inventory, 후보 기동, Caddy 전환, 즉시 rollback, 안정화 후 legacy 제거를 서로
  다른 승인 단계로 나눈 runbook을 작성했다.
- 개발 가이드에 Supabase Production 적용과 Trends API runtime 전환이 서로 다른 작업임을
  명시하고, `production-checklist`와 Trends preflight 모두 승인 자료일 뿐 배포는 하지 않는다고
  기록했다.

## 결과 및 검증

- Production 후보는 기존 systemd와 충돌하지 않는 host `4583`에서 병행 검증하고, 공개 트래픽은
  승인 전까지 host `4581`의 legacy service에 유지하는 구조로 준비됐다.
- `npm run trends:production:transition:preflight`는 Production 설정, 환경 target, token 계약과
  전환 topology를 검사하며 secret 원문이나 원격 상태를 출력·변경하지 않는다.
- 최종 집중 테스트: 14개 통과.
- 최종 전체 단위 테스트: 1,116개 통과, 실패 0.
- Production manifest JSON 및 Compose `config --quiet` 검사 통과.
- 첫 로컬 Production image build는 Docker Hub의 `node:24-bookworm-slim` metadata 조회가
  timeout됐으나 재시도에서 정상 빌드됐다.
- 실제 Production credential 대신 폐기 가능한 fixture 설정을 사용해 로컬 후보 컨테이너를
  host `4583`에 기동했다. health는 `environment: production`을 포함한 `200`, 무인증과 잘못된
  bearer token 조회는 각각 `401`이었다.
- container health `healthy`, runtime user `node`, read-only root filesystem, `cap_drop=ALL`,
  `no-new-privileges=true`, host `4583` mapping을 Docker runtime에서 확인했다.
- smoke 후 후보 컨테이너와 임시 network 및 fixture 환경 파일을 모두 제거했다. 검증 image만 로컬
  Docker cache에 남아 있다.
- Oracle의 기존 Production `TRENDS_API_TOKEN`이 16자임을 값 노출 없이 확인했다. 이번 container
  전환에서 token을 회전하면 Collector와 WordPress 변경이 결합되므로, 기존 token은 명시적
  rotation 권고 경고와 함께 허용하고 빈 값·placeholder 및 서명 secret 기준은 완화하지 않았다.
- 별도 Oracle checkout에 후보 소스를 전송하고 기존 운영 `.env`에서 필요한 네 설정만 값 노출
  없이 권한 `600`의 Production 후보 env로 분리했다. preflight는
  `READY FOR CANDIDATE VALIDATION`과 legacy token rotation 경고를 반환했다.
- 기존 systemd가 host `4581`에서 active이고 공개 health가 정상이며 host `4583`이 비어 있음을
  확인한 뒤 Production 후보 image를 Oracle에서 build하고 host `4583`에 병행 기동했다.
- Oracle 후보 health는 `environment: production`을 포함한 `200`, 무인증과 잘못된 bearer token은
  각각 `401`, 기존 internal token을 이용한 Production metadata read는 `200`이었다.
- Oracle runtime에서도 container health `healthy`, user `node`, read-only root filesystem,
  `cap_drop=ALL`, `no-new-privileges=true`, host `4583` mapping을 확인했다. Caddy와 systemd는 아직
  변경하지 않았다.
- 사용자 승인 후 Production Caddy allowlist에 ingest 및 CSV export 경로를 추가하고 upstream을
  legacy host `4581`에서 후보 host `4583`으로 전환했다. 공개 health가
  `environment: production`을 포함한 `200`을 반환해 새 컨테이너 도달을 확인했으며, 공개 metadata
  무인증과 ingest invalid token 요청은 각각 `401`이었다. 기존 systemd는 rollback 경로로 계속
  유지한다.
- 공개 CSV export는 기존 internal token으로 `200`을 반환했다. XLSX는 코드상 의도된 미구현
  예약 경로라 `501`이었고 WordPress UI도 CSV만 사용함을 확인했다. 잘못 포함했던 XLSX Caddy
  allowlist와 운영 문서를 실제 계약에 맞게 바로잡았다.
- Oracle에는 후보 container와 전용 env가 추가됐고 Caddy upstream은 `4583`으로 전환됐다.
  Production DB, Edge Function과 secret 값은 변경하지 않았으며 systemd는 `4581` rollback 경로로
  유지한다.

## 남은 위험과 후속 작업

- Production BlogGenius의 단기 사용자 token read와 WordPress preview/CSV 다운로드를 실제 client
  흐름에서 확인해야 한다.
- Caddy를 `4581`로 되돌리는 rollback은 문서화됐지만 실제 rehearsal하지 않았다.
- systemd 제거는 안정화 관찰과 client 검증 이후 별도 승인 작업으로 남아 있다.
- 16자 legacy `TRENDS_API_TOKEN`은 container 전환 안정화 후 API·Collector·WordPress를 함께
  갱신하는 별도 credential rotation 작업이 필요하다.

## 최종 결과

- Production Trends API의 container 배포 단위, fail-closed preflight와 전환·rollback runbook을
  저장소의 canonical 구조로 확정했다.
- Oracle에서 Production container를 host `4583`에 배포하고 Caddy 공개 upstream을 전환했다.
- 기존 host `4581` systemd는 안정화 기간의 rollback 경로로 유지한다.
- Production metadata와 CSV export의 실제 HTTPS/internal-token read를 검증했다.
- XLSX는 미구현 예약 경로임을 확인하고 공개 계약과 Caddy allowlist에서 제외했다.
- 이 단계의 코드·문서 구현과 전환 검증은 완료했다. systemd 제거, token 회전, GHCR 자동화는
  독립적인 후속 작업이다.
