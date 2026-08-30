# Trends Production Collector Command

## 브랜치 정보

- branch: `feature/trends-production-collector-command`
- 시작일: 2026-08-30
- base/parent branch: `dev`
- 상태: 완료

## 사용자 필요

Production Trends API가 컨테이너로 전환됐지만 Local·Development와 달리 운영자가 쉽게 사용할
`collect_production.sh`가 없다. Production write는 위험하므로 편의 명령을 단순 추가하는 것이
아니라, 평소에는 dry-run과 사용자 확인을 거치고 자동화에서는 명시적 승인 옵션을 요구해야 한다.

## 목표

- Production 전용 Collector command를 제공한다.
- 인자 없이 실행하거나 날짜만 지정하면 한 번 수집한 payload를 먼저 dry-run 요약으로 보여주고
  사용자 확인 후 같은 payload를 upsert한다.
- `--dry-run`은 무조건 무변경으로 종료한다.
- `--confirm-production`은 CI/cron용 명시적 실제 반영 모드로 제공한다.
- `--help`는 설정·브라우저·네트워크에 접근하지 않는다.
- token과 secret을 출력하지 않고, Production write guard는 실제 upsert 직전에만 연다.

## 범위

- `apps/trends/trends-collector/commands/collect_production.sh`
- Collector CLI의 interactive confirmation 및 단일 payload 재사용 경계
- Production collector 환경 sample과 운영 문서
- shell/CLI 단위 및 구조 테스트
- 관련 backlog·아키텍처 문서 현행화

## 명시적 비목표

- 실제 Production 수집 실행
- cron 또는 systemd timer 등록
- Production token 회전
- Trends API/Caddy/Supabase schema 변경
- Desktop App UI 및 발행 기능 변경

## 설계

1. shell command는 Production 환경 파일을 명시하고 Node Collector CLI에 인자를 전달한다.
2. `--help`는 환경 파일 존재 여부와 무관하게 즉시 도움말을 반환한다.
3. 인자 없음 또는 `--date`만 있으면 interactive mode로 처리한다.
4. Collector는 Naver에서 payload를 한 번 수집하고 날짜·건수를 표시한다.
5. TTY에서 정확한 확인 입력을 받은 경우에만 같은 메모리 payload를 Production API에 전송한다.
6. `--dry-run`은 확인 없이 payload 요약 후 종료한다.
7. `--confirm-production`은 비대화형 실행을 허용하고 실제 전송 직전에만
   `TRENDS_ALLOW_PRODUCTION_WRITE=true`를 적용한다.
8. interactive mode를 TTY 없이 실행하면 쓰지 않고 사용 가능한 명시적 옵션을 안내하며 실패한다.

## 결정사항과 트레이드오프

- dry-run 뒤 재수집하지 않는다. 구현 경계는 조금 늘지만 느린 브라우저 수집을 중복하지 않고
  확인한 payload와 반영 payload의 차이를 없앤다.
- 단순 `yes/no`보다 대상 환경·날짜·건수를 명확히 표시한다. 자동화는 prompt를 우회하지 않고
  `--confirm-production`을 명시해야 한다.
- Production 편의성은 제공하되 기본 동작은 사람이 확인하는 interactive mode로 둔다.

## 구현 단계

1. 기존 Collector 실행 흐름과 payload/upsert 경계 조사
2. Production CLI mode와 confirmation 계약 구현
3. Production shell command와 환경 sample 연결
4. 단위·shell 구조 테스트 작성
5. 문서 현행화 및 전체 회귀 검증

## 진행 기록

- 브랜치와 개발 기록을 생성했다.
- 기존 Collector를 payload 수집과 API upsert 경계로 나누고, Production 실행 모드를 수집 전에
  판정하도록 보완했다.
- interactive mode는 payload를 한 번만 수집한 뒤 요약과 확인을 거쳐 동일 객체를 전송한다.
- 취소하면 API health 확인과 write를 모두 건너뛰며, non-TTY 기본 실행은 수집 전에 실패한다.
- Production shell command, 전용 환경 sample, 사용자·운영 문서를 연결했다.
- 실제 Production write 승인은 API 전송 직전에만 적용되도록 기존 runtime guard를 유지했다.
- 첫 수동 실행에서 기존 runtime guard가 Production dry-run에도 write 승인을 요구하는 충돌을
  확인했다. 무변경 dry-run은 승인 없이 target만 검증하고, 실제 write에서만 승인을 요구하도록
  guard 계약과 회귀 테스트를 수정했다.

## 결과 및 검증

- 집중 guard·Collector·shell 구조 테스트 31개 통과
- `git diff --check` 통과
- 전체 unit regression 1,120개 통과
- 실제 Production 수집·대화형 확인·반영 흐름을 사용자가 정상 동작으로 확인
- 자동 검증에서는 Production 수집·반영을 수행하지 않음

## 남은 위험과 후속 작업

- cron 도입 시에는 `--confirm-production`, 실행 lock, 알림과 실패 재시도 정책을 별도 설계해야 한다.
