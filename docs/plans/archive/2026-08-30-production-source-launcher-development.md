# Production Source Launcher

## 브랜치 정보

- branch: `feature/production-source-launcher`
- 시작일: 2026-08-30
- base/parent branch: `main`
- 상태: 완료 (자동 검증 통과, 실제 Production 소스 실행은 후속 수동 확인)

## 사용자 필요

환경 분리 전에는 `node src/main.js`로 Production 연결을 사용해 소스 상태를 빠르게 확인하고,
`-dev`·`-rc` tag build로 패키징 결과를 검증했다. 환경 분리 이후에도 패키징 전에 Production
연결을 소스에서 확인할 수 있는 명시적이고 편한 명령이 필요하다.

## 목표

- 저장소 루트에 `run_production.sh`를 제공한다.
- Git에서 제외된 `.env.production`과 공통 `.env.oauth`을 읽는다.
- `main` 또는 `release/*` 브랜치에서만 Production 소스 실행을 허용한다.
- Supabase와 Trends API 대상 host만 표시하고 secret 값은 출력하지 않는다.
- 실제 실행 전에 Production 자동화·발행·알림의 외부 부작용 가능성을 경고하고 정확한 확인 입력을
  요구한다.
- Production 설정이 불완전하거나 환경이 섞이면 Electron 실행 전에 실패한다.

## 범위

- Production 전용 환경 파일 loader와 source launcher
- `run_production.sh`, npm convenience command, `.env.production.sample`
- branch·confirmation·환경 target·secret 비노출 계약 테스트
- 한글 개발 환경 가이드와 관련 문서 현행화

## 명시적 비목표

- Production DB reset·seed·migration 실행
- release artifact 생성, tag push, 서명 또는 배포
- 자동 발행을 임의로 비활성화하는 별도 Production 변형 환경
- Production server secret을 Desktop source runtime에 제공

## 설계

1. launcher는 현재 Git branch가 `main` 또는 비어 있지 않은 `release/*`인지 먼저 검사한다.
2. `.env.production`을 읽고 `BLOGGENIUS_ENV=production`을 강제한다.
3. Google Desktop OAuth는 `.env.production`의 명시값 또는 기존 `.env.oauth`에서 읽는다.
4. 공통 Runtime Environment Resolver로 Production Supabase·Trends URL을 검증한다.
5. endpoint host와 활성화되는 live side effect 경고만 출력한다.
6. 사용자가 정확히 `PRODUCTION`을 입력한 경우에만 Electron source runtime을 시작한다.
7. 패키징 검증은 계속 `-dev`·`-rc` tag build가 담당한다.

## 결정사항과 트레이드오프

- Production source run은 패키징을 대체하지 않는다. backend 연결과 실제 runtime behavior를 빠르게
  확인하는 용도다.
- Production semantics를 조용히 바꾸지 않는다. 자동 기능을 강제로 끄는 대신 실제 부작용 가능성을
  명확히 경고하고 별도 확인을 요구한다.
- 환경 파일은 Git에서 제외하고 sample만 관리한다. server-only secret은 허용하지 않는다.

## 구현 단계

1. Production 환경 loader와 branch/runtime preflight
2. confirmation과 Electron source launch
3. shell/npm command 및 sample 연결
4. 계약 테스트와 문서 현행화
5. 전체 회귀 검증

## 진행 기록

- `main`에서 feature 브랜치와 개발 기록을 생성했다.
- Local/Development launcher와 분리된 Production 전용 Node launcher를 추가했다.
- `.env.production`에는 공개 Desktop 연결만 허용하고 server-only secret이 있으면 실패하도록 했다.
- Supabase SaaS project ref와 URL host가 다르면 Electron 실행 전에 차단한다.
- branch·target host·live effect를 표시한 뒤 정확한 확인 입력을 받는 흐름을 구현했다.
- `run_production.sh`, npm command와 `.env.production.sample`을 연결했다.

## 결과 및 검증

- 집중 launcher·환경 loader 테스트 19개 통과
- 전체 unit regression 1,128개 통과
- `run_production.sh --help`가 환경 파일이나 branch 검사 없이 정상 출력됨을 확인
- feature branch에서 실제 실행이 환경 파일 접근 전에 차단됨을 확인
- `bash -n run_production.sh`, `git diff --check` 통과
- 실제 Production Electron source run은 main 또는 release branch 병합 후 사용자가 확인해야 함

## 남은 위험과 후속 작업

- Production source run은 실제 운영 기능을 실행하므로 사용자가 자동화 설정과 대상 계정을 직접
  확인해야 한다.
- 앱 번들 경로·포함 자산·업데이터·서명은 source run으로 검증할 수 없다.
