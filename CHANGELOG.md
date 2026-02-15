# Changelog

이 프로젝트의 주요 변경 사항을 기록합니다.

형식: Keep a Changelog 스타일  
버전: SemVer

## [Unreleased]

## [0.8.9] - 2026-02-16

### Changed
- 링크 카드 삽입 검증이 지연되는 경우에도 `확인` 동작 및 팝업 닫힘이 확인되면 성공으로 간주하도록 보완
  - 카드가 이미 삽입됐는데 URL 텍스트 fallback이 중복 입력되는 문제 완화
- 링크 카드 가운데 정렬 재시도 횟수/대기 시간 상향으로 패키징 실행 환경에서의 정렬 적용률 개선
- GitHub Actions 패키징 PoC를 `@yao-pkg/pkg` 기반 단일 타깃(`node20-macos-arm64`)으로 전환
- 로컬/CI 버전 정렬을 위해 `.nvmrc`(Node 20) 추가

## [0.8.8] - 2026-02-16

### Added
- `trends --date` 입력 형식 확장: `YYYYMMDD`, 상대일 `-Nd`(예: `-1d`) 지원
- `trends` help 예시에 `--date=...` 단일 표기 방식 추가 안내

### Changed
- 링크 카드 삽입 성공 판정 로직 강화(오탐 실패 감소)
  - oglink 모듈 수/타깃 URL 매칭/카드 시그니처까지 비교
  - 삽입 판정 대기 시간 확장으로 렌더링 지연 대응
- 링크 카드 가운데 정렬 선택자 보강 및 카드 포커스 유지 정렬 시도 개선
- 쇼핑 관련 글 자동수집 완료 로그 문구에서 `(랜덤)` 표기 제거

## [0.8.7] - 2026-02-16

### Added
- `trends --date <YYYY-MM-DD|yesterday>` 고급 옵션 추가
- 날짜 지정 트렌드 수집 시 월/연도 드롭다운 이동 지원
- 라이선스 기능 플래그 `enable_trends_date_override` 추가

### Changed
- 날짜 지정 트렌드가 비활성 플랜일 때 명시적 차단 메시지 출력
- 지정 날짜가 데이터 공백 시간대일 경우 오류 대신 0건 처리
- 트렌드 시트 기록 날짜를 수집 기준일(`--date`)과 동기화
- 라이선스 문서/운영 가이드 및 SQL seed에 날짜 지정 권한 정책 반영

## [0.8.6] - 2026-02-15

### Changed
- 패키지 빌드를 `pkg package.json` 기준으로 통일해 asset 반영 일관성 강화
- 프롬프트 로딩을 파일 기반 단일 소스로 정리 (`src/config/*.md`)
- 코드 하드코딩 프롬프트 fallback 제거(회귀 리스크 축소)

## [0.8.5] - 2026-02-15

### Changed
- 패키징 결과물 `config/`에서 기본 프롬프트 파일 비노출 처리
- 사용자 override용 `config/blog_prompt.md`, `config/shopping_prompt.md` 수동 제공 정책 유지

## [0.8.4] - 2026-02-15

### Changed
- `trends` 수집 속도 개선: pkg 직렬화 이슈 회피를 유지하면서 DOM 일괄 추출 경로로 최적화
- 스와이프 대기/거리 튜닝으로 체감 수집 속도 개선

## [0.8.3] - 2026-02-15

### Fixed
- 패키지 실행 시 `trends`에서 발생하던 `Passed function is not well-serializable!` 오류 수정

## [0.8.2] - 2026-02-15

### Changed
- `config.txt.sample` 안내 문구/기본값 정리

## [0.8.1] - 2026-02-15

### Changed
- 마이너 안정화 릴리즈(운영/배포 정비)

## [0.8.0] - 2026-02-15

### Added
- 라이선스 v3 설계 반영 SQL 추가: `sql/supabase_license_v3.sql`
- test 1회성 강제용 기기 상태 테이블 추가: `license_device_states`
- test 재진입 차단 정책 문서화 (`docs/license-policy.md`, `docs/license-operations.md`)
- 플랜 기능 플래그에 `enable_related_posts_auto_link` 추가

### Changed
- 기본 라이선스 키 기본값을 `free` -> `test`로 전환
- precheck SQL을 v3 정책 기준으로 갱신: `sql/supabase_license_precheck.sql`

## [0.7.5] - 2026-02-15

### Changed
- 기본 프롬프트를 내부 경로(`src/config`)로 이동
- 사용자 오버라이드 프롬프트 경로를 `config/blog_prompt.md`, `config/shopping_prompt.md`로 통일
- 외부 참고 로그 제목 노출을 축소(순번 + 앞 5글자)
