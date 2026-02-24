# Changelog

이 프로젝트의 주요 변경 사항을 기록합니다.

형식: Keep a Changelog 스타일  
버전: SemVer

## [Unreleased]

## [0.8.20] - 2026-02-24

### Changed
- 패키징 더블클릭 실행 시 상대경로 해석 안정화
  - `./config/...` 형식 경로를 `config.txt` 위치 기준으로 해석하도록 보강
  - `cwd`가 홈 디렉터리인 환경(Finder/Explorer 실행)에서도 이미지/인증 파일 경로 인식 개선
  - 적용 대상: 쇼핑 이미지 로컬 경로, Google 서비스계정 JSON, auth/license 경로 참조
- 설정 파일 초기화 흐름 보강
  - `config.txt`가 없고 `config.txt.sample`만 있을 때 실행 시 `config.txt`를 자동 생성
  - UI/CLI 공통으로 생성된 `config.txt`를 우선 사용하도록 정합성 개선
  - `config.txt`와 `config.txt.sample`이 모두 없는 경우는 명시적 오류로 실패 처리 유지
- 에디터 커서 하단 고정 로직 강화
  - 소제목/인용구 처리 전후에 문서 하단 커서 강제 이동 보강
  - 하단 앵커 클릭 실패 시 DOM selection range 기반 fallback 적용
  - 패키징 실행 환경에서 소제목/인용구 역순 삽입 및 상단 포커스 회귀 완화

## [0.8.19] - 2026-02-24

### Added
- 쇼핑커넥트 자동발행 설정 UI 추가
  - `자동발행 사용`, `1회 최대 발행수`, `자동 발행 시간`, `완료 알림(비활성)`, `수동 실행`, `불러오기/저장`
  - 쇼핑커넥트 탭 내 `자동발행 설정` 패널 추가
- 쇼핑커넥트 자동발행 수동 실행 API 추가
  - `POST /api/v1/shopping/auto/run-manual`
  - `발행 준비 완료` 상태 행을 기준으로 설정 수량만큼 배치 발행 실행

### Changed
- 쇼핑 Auto 설정 키를 메이저 설정/런타임/샘플 설정에 반영
  - `NAVER_SHOPPING_AUTO_MODE`
  - `NAVER_SHOPPING_AUTO_DAILY_POSTS`
  - `NAVER_SHOPPING_AUTO_TIME`
  - `NAVER_SHOPPING_AUTO_NOTIFY_ENABLED`
- 쇼핑 자동발행 기본값 정합성 보정
  - 쇼핑 기본 발행 수량이 블로그/레거시 값과 섞이지 않도록 파싱 우선순위 조정
  - 기본값 `3` 유지
- 마크다운 인용구(`>`) 파싱/작성 처리 보강
  - `>` 라인을 인용구 타입으로 파싱
  - 네이버 에디터의 `인용구` 서식 선택 로직 보강
  - 인용구 입력 순서 안정성 개선(역순 삽입 방지 보정)

## [0.8.18] - 2026-02-20

### Changed
- 저해상도/느린 환경에서 네이버 에디터 진입 안정성 강화
  - 에디터 준비 상태 검증 로직 보강(제목/본문 포커스 전 확인)
  - 팝업 정리 재시도 및 본문 포커스/스크롤 복원 로직 강화
  - 발행 단계에서 안전 뷰포트 고정 적용으로 레이아웃 의존성 완화
- 뷰포트 설정 정리
  - `VIEWPORT_WIDTH`, `VIEWPORT_HEIGHT` 설정 경로 제거
  - 관련 샘플 설정 정리
- 자동 설정 키 네임스페이스 정합성 보정
  - UI/서버에서 `NAVER_AUTO_*` 키를 일관 사용하도록 통일
- 패키징 보강
  - `config/images` 디렉터리를 배포 산출물에 포함
  - 숨김 파일(`.DS_Store` 등) 제외 복사 처리
- 문서 보강
  - 라이선스 정책서에 CLI 명령(`status/register/recover/upgrade`) 운영 원칙 명시

## [0.8.17] - 2026-02-19

### Changed
- 릴리스 버전 정합성 보정
  - 최신 코드 기준 버전을 `0.8.17`로 상향 조정

## [0.8.15] - 2026-02-19

### Changed
- Web UI 블로그 화면을 탭 구조로 정리
  - `빠른발행`, `Trends`, `Topics`, `쇼핑커넥트` 탭 통합
  - 기존 사이드바 `트렌드`/`쇼핑` 분리 메뉴를 블로그 내부 탭으로 이동
- Web UI 목록 사용성 개선
  - Trends/Topics 페이지네이션 적용
  - Topics 인라인 편집/토글 편집 흐름 보완
- 트렌드 수집 팝업/실행 UX 개선
  - 날짜 미지정 시 KST 기준 어제 날짜를 자동 계산해 확인 문구에 표시
  - 지정 날짜가 이미 수집된 경우 중복 경고 문구 표시
  - 취소 시 수집이 시작되지 않도록 처리 강화

## [0.8.13] - 2026-02-16

### Changed
- Windows 배포 실행 배치 파일에 트렌드 수집 진입점 추가
  - `실행하기_트렌드수집.bat` 생성(워크플로우/로컬 빌드 스크립트/사용자 가이드 동시 반영)
- 해시태그 출력 정규화 강화
  - `##태그` 형태를 포함한 중복 `#`를 정리해 `#태그` 형태로 통일
  - 공백/쉼표 기반 토큰 분리 및 중복 제거 적용 (blog/shopping 공통)
- 운영 편의 개선
  - Pro 키 1건 발급용 복붙 템플릿 SQL 추가: `sql/supabase_issue_pro_license.sql`
  - 운영 문서에 빠른 발급 절차(3.0) 추가
- Apps Script 기본 동작 조정
  - 연관검색어 조사로 생성되는 주제의 `이미지 생성` 기본값을 `Yes`로 변경

## [0.8.12] - 2026-02-16

### Changed
- GitHub Actions 패키징 타깃 플랫폼 재확장
  - `node20-linux-x64`, `node20-win-x64`, `node20-macos-x64`, `node20-macos-arm64` 동시 빌드
  - 산출 ZIP: `BlogGenius-linux-x64.zip`, `BlogGenius-win-x64.zip`, `BlogGenius-mac-intel.zip`, `BlogGenius-mac-arm64.zip`

## [0.8.11] - 2026-02-16

### Changed
- 링크 카드 삽입 검증 대기 상한을 추가 단축
  - 검증 루프를 약 1초 수준으로 조정해 `검증 지연` 경고까지의 체감 대기 시간 감소
  - 검증 지연 시 성공 간주 및 중복 URL fallback 방지 정책은 유지

## [0.8.10] - 2026-02-16

### Changed
- 이미지 업로드 직후 렌더 지연 대응 강화
  - 새 이미지 슬롯 증가 감지 후 포커스 재시도 로직 추가
  - 큰 이미지 업로드 시 `방금 업로드한 이미지를 포커스하지 못했습니다.` 경고 발생 빈도 완화
- 링크 카드 삽입 검증 대기 상한 단축
  - 검증 루프를 축소해 카드 삽입 후 9~20초 지연 구간 개선
  - 삽입 검증 지연 시 성공 간주 정책은 유지해 URL 텍스트 중복 대체를 방지

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
