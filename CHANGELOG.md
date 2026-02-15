# Changelog

이 프로젝트의 주요 변경 사항을 기록합니다.

형식: Keep a Changelog 스타일  
버전: SemVer

## [Unreleased]

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
