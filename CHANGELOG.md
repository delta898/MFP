# Changelog
All notable changes to the Naver Auto Blog publishing tool will be documented in this file.

## [Unreleased]

## [0.1.6] - 2026-03-16

### Added
- **로컬/원격 실행 채널 확장**: HTTP 기반 Remote MCP Server를 추가하여 localhost, LAN, reverse proxy 환경에서 Claude/ChatGPT/OpenCode 같은 MCP host와 연결할 수 있는 구조를 도입했습니다.
- **원고 선택 포스팅 흐름**: 로컬 markdown 원고 폴더를 선택해 제목, 본문, 이미지 매칭을 미리보고 기존 `contents.md + image` 발행 엔진으로 그대로 포스팅할 수 있도록 지원합니다.
- **대시보드 Activity Feed**: 세부 로그 필터 대신 굵직한 작업 단위 이벤트를 기록하는 전용 activity feed를 도입해, 포스팅/설정 저장/서비스 시작·중지 흐름을 더 읽기 쉽게 표시합니다.
- **Google Sheets OAuth 연결**: Google 계정 연결/해제/테스트와 token 저장 흐름을 도입해, 서비스 계정 파일 없이도 시트 접근과 refresh token 기반 자동 재인증이 가능해졌습니다.

### Changed
- **빠른 포스팅 중심 UX**: `바로 생성`, `미리보기 생성`, `원고 선택` 흐름을 정리하고, 원고 포스팅 기능을 `빠른 포스팅` 안으로 통합했습니다. 플랫폼별(네이버/워드프레스) preview 확인 후 바로 포스팅까지 이어서 처리할 수 있습니다.
- **설정 화면 재구성**: `설정 > 일반`을 `일반 설정 / Google 계정 연결 / 서버 설정 / 앱 업데이트`로 분리하고, `MCP` 설정을 `AI` 탭 안으로 통합했습니다. 블로그 발행 관련 옵션도 `설정 > 블로그`에 모아 더 찾기 쉽게 정리했습니다.
- **Self-update 메타데이터 통합**: `custom`과 `github` 업데이트 경로 모두 `update.json` 기반 메타데이터(`details`, `sha256`)를 활용하도록 정리하고, 릴리즈 워크플로와 `build.sh` 생성 규칙을 맞췄습니다.
- **모바일 간편 모드**: 모바일에서는 `Dashboard(최소 상태/최신 콘텐츠)`와 `블로그 > 빠른 포스팅`만 남기는 간편 모드를 추가하고, 첫 진입을 빠른 포스팅으로 유도하도록 다듬었습니다.
- **대시보드 밀도 조정**: 최신 영상/최신 콘텐츠 수를 줄이고 활동 이력 높이와 스크롤을 정리해 데스크톱/모바일 모두에서 한눈에 읽기 쉬운 구조로 조정했습니다.

### Fixed
- **강제 업데이트 회귀 수정**: `강제 업데이트`가 최신 버전 확인처럼 동작하던 문제를 해결해, 현재 버전 재설치와 업데이트 안내 상세보기가 다시 정상 작동합니다.
- **패키징 환경 안정화**: 패키징 앱에서 Kuzu DB 경로가 `/data`로 잘못 향하던 문제를 수정하고, Gemini 글 생성 응답의 JSON 파싱을 더 견고하게 처리했습니다.
- **원고/빠른 포스팅 preview 안정화**: 플랫폼 탭 전환 시 preview가 사라지거나, 포스팅 후 preview가 불필요하게 사라지는 문제를 수정했습니다.
- **이미지 생성 timeout 조정**: Gemini 이미지 생성 timeout을 줄여 실패 감지와 재시도를 더 빠르게 수행하도록 보완했습니다.
- **빌드 산출물 정리 개선**: `build.sh`, `build.bat` 실행 시 같은 플랫폼의 이전 ZIP/폴더 산출물을 버전과 무관하게 먼저 정리해, 업로드 시 낡은 파일이 섞이지 않도록 했습니다.

## [0.1.6-dev3] - 2026-03-15

### Added
- **Remote MCP Server (1차)**: 앱 내 별도 MCP remote service를 추가하고, localhost/LAN/reverse proxy 시나리오를 위한 HTTP 기반 MCP endpoint를 지원. `initialize`, `tools/list`, `tools/call`, bearer token 인증, 세션 관리, 설정 화면 제어를 포함.
- **원고 포스팅 미리보기/실행**: 로컬 markdown 원고 폴더를 선택해 제목/본문/이미지 매칭을 미리보고, 기존 `contents.md + image` 발행 엔진을 재사용해 포스팅할 수 있는 흐름 추가.
- **대시보드 Activity Feed**: 원시 로그 필터 대신 별도 Dashboard Activity/Event 저장 모듈을 도입해, 포스팅/설정 저장/서비스 시작·중지 같은 굵직한 활동만 최근 활동 이력에 표시하도록 개선.

### Changed
- **빠른 포스팅 확장**: `빠른 포스팅` 안에 `바로 생성` / `원고 선택` 모드를 추가하고, 원고 기반 포스팅을 quick 흐름 안으로 통합. 이후 별도 `원고 포스팅` 탭은 제거.
- **빠른 포스팅 Preview 강화**: `글감 저장 / 바로 포스팅 / 미리보기 생성` 흐름을 분리하고, 플랫폼별(네이버/워드프레스) preview 탭과 preview 기반 재포스팅 흐름을 추가.
- **설정 화면 재구성**: `설정 > 일반`을 `일반 설정 / Google 계정 연결 / 서버 설정 / 앱 업데이트` 섹션으로 정리하고, `MCP` 설정을 `AI` 탭으로 통합. `이미지 용량 최적화`는 `설정 > 블로그`의 발행 옵션으로 이동.
- **Self-update 메타데이터 정리**: `custom`과 `github` 업데이트 경로 모두 `update.json` 기반 메타데이터(`details`, `sha256`)를 활용하도록 정리하고, `custom_update_check_url`은 base URL 기준으로 단순화.
- **릴리즈 워크플로 parity**: `build.sh`, `build.yml`, `update.json` 생성 규칙을 맞추고, `rc` 태그도 prerelease로 처리하도록 CI/CD 릴리즈 동작을 정리.

### Fixed
- **강제 업데이트 회귀 수정**: `설정 > 일반 > 강제 업데이트`가 단순 최신 버전 확인처럼 동작하던 문제를 수정해, 현재 버전 재설치 흐름을 정상 지원.
- **WordPress 접속 확인 오류 수정**: 설정 화면에서 워드프레스 접속 확인 시 `requestBody is not defined` 오류가 나던 회귀 수정.
- **원고 포스팅 payload 제한 수정**: 원고 포스팅 실행 시 대용량 이미지 파일 전송으로 UI 서버 본문 제한에 걸리던 문제를 보완.
- **빠른 포스팅 preview/포스팅 안정화**: 플랫폼 탭 전환 시 preview가 사라지거나 포스팅 완료 후 preview가 불필요하게 지워지던 문제를 수정.
- **Gemini 이미지 호출 timeout 조정**: 지연이 긴 이미지 생성 요청에 대해 60초 timeout을 적용해 실패 감지와 재시도가 더 빠르게 이루어지도록 개선.

## [0.1.6-dev2] - 2026-03-12

### Added
- **업데이트 안내 메타데이터 플로우**: `CHANGELOG.md`를 기준으로 `update.json`의 `details.summary`와 `details.highlights`를 생성하고, 앱 내 `자세히 보기` 대화상자에서 릴리즈 요약과 주요 변경점을 바로 확인할 수 있도록 정리.
- **Google Sheets OAuth 연결**: Google Sheets 접근 방식을 OAuth 기반으로 전환하고, loopback callback과 토큰 저장(`config/google_oauth_tokens.json`) 흐름을 도입. 설정 화면에서 Google 계정 연결/해제/테스트를 직접 수행할 수 있도록 구성.
- **Telegram Agent Planner 안정화**: planner rules, preflight query composition, pending confirmation 대체/적용/취소 흐름을 정리해 Telegram Agent의 확인 기반 제어를 한 단계 안정화.

### Changed
- **Google Sheets 인증 UX 단순화**: `GOOGLE_SHEET_URL`은 유지하고, Google 계정 연결과 스프레드시트 설정을 하나의 흐름으로 재배치. 더 이상 `service_account.json` 업로드/공유 안내를 기본 UX로 노출하지 않음.
- **Google OAuth 클라이언트 설정 경계 정리**: 사용자 설정 파일에서 OAuth client 값을 제거하고, `app_runtime_configs`를 source of truth로 사용하도록 변경.
- **Telegram 핵심 요청 우선순위 조정**: `글감 등록/추가`, `발행` 계열은 recommendation lane이 아니라 기존 register/publish 경로를 우선 사용하도록 라우팅을 조정.
- **사용자 문서/패키징 정리**: `README_USER.md`를 제거하고 `/README.md`를 사용자용 안내 문서로 통합. 패키징 시 동일 파일을 포함하도록 변경.
- **설정 화면 저장 UX 미세 조정**: 저장 버튼과 상태 문구 순서를 `[저장] 저장됨`으로 정리하고 상태 문구 크기를 줄여 버튼 위치가 흔들리지 않도록 보완.
- **대시보드 하단 레이아웃 균형 조정**: 최근 활동 이력과 우측 YouTube 영역의 높이를 맞추고, 쇼츠/영상 노출 수를 늘려 좌우 카드 균형을 개선.

### Fixed
- **Telegram loading/rate-limit 부담 완화**: 로딩 문구를 1회 전송으로 단순화하고, deterministic fast-path 요청은 AI 파싱 전에 바로 처리하도록 조정.
- **WordPress 설정 미비 로그 중복 완화**: 동일한 WordPress 미설정 상태에 대한 반복 로그를 줄여 시작 로그 노이즈를 완화.
- **Google OAuth 초기 false error 완화**: 시트 준비 전에 runtime config에서 OAuth client 구성을 먼저 확보하도록 조정해 앱 시작 직후 불필요한 OAuth 미구성 오류가 뜨는 문제를 줄임.
- **사이드 메뉴 정리**: 현재 사용하지 않는 `라이선스` 메뉴 항목을 숨겨 실제 노출 메뉴를 단순화.

### Added (continued)
- **Agent Runtime Foundation**: Telegram 입력을 `Agent Runtime -> Capability Registry -> Memory` 경로로 처리하는 1차 기반 추가. action schema, confirmation store, typed runtime contract를 도입해 자연어 요청을 구조화된 capability 실행으로 연결.
- **Kuzu Event-First Memory 재설계**: `Message`, `Action`, `SettingChange`, `JobRun`, `Artifact`, `Preference`, `Suggestion`, `DomainKnowledge` 노드와 관계를 추가하여 대화/실행/선호/제안/도메인 지식을 그래프로 추적할 수 있도록 확장.
- **Typed Retrieval / Preference / Suggestion Loop**: 최근 메시지, action, 설정 변경, job run, artifact, preference, pending confirmation을 context packet으로 조립하는 retrieval 계층 추가. suggestion과 content idea 결과에 대한 feedback(`수락/거절`, `도움됨/별로`)도 memory graph에 기록하도록 구성.
- **도메인 검증 및 학습형 Alias Memory**: 시간, 시간대, AI mode, 트렌드 카테고리에 대한 validator 계층 추가. 잘못된 카테고리 입력에 correction proposal을 제시하고, 사용자가 수락하면 alias를 학습하여 이후 동일 표현을 canonical value로 자동 정규화하도록 구현.
- **Knowledge Provider Architecture**: `kind + transport + config` 기반의 knowledge provider 구조 도입. `builtin_api`, `mcp_tool`, `internal_query` transport contract를 정의하고, route별(`suggestions`, `content_ideas`) provider routing을 지원.
- **SerpApi Trends Provider (1차)**: `trends + builtin_api + SerpApi` provider를 추가하여 외부 trends 신호를 suggestion/content idea 엔진에서 사용할 수 있는 구조 연결. provider 조회 시작/완료/실패 trace 로그도 함께 추가.

### Changed (continued)
- **Telegram Agent 제어 범위 확장**: Telegram에서 설정 조회/변경, pending confirmation 조회, preference 요약, 추천 요청, 글감 추천, 트렌드 수집 실행을 새 agent capability 경로로 처리하도록 정리.
- **추천/글감 피드백 의미 분리**: suggestion type에 따라 버튼 의미를 `수락/거절` 또는 `도움됨/별로`로 구분하고, 해당 피드백을 이후 suggestion suppression 및 글감 반복 억제에 활용하도록 조정.
- **Content Idea Lane 분리**: 운영 추천과 글감 추천을 별도 lane으로 분리하고, 최근 artifact 및 feedback를 바탕으로 동일 제목 반복 추천을 줄이도록 개선.
- **Knowledge Config 보존 강화**: `config.json`에 `knowledge` 섹션이 없더라도 sample 기본 구조를 merge하여 runtime에 provider/routing 정의가 항상 주입되도록 변경. 설정 저장 시에도 `knowledge.providers`, `knowledge.routing`이 유실되지 않도록 보완.

## [0.1.6-dev1] - 2026-03-11

### Added
- **Custom AI 설정 탭 추가**: OpenAI-compatible 보조 모델 연결 정보를 별도 `AI` 탭에서 관리할 수 있도록 구성. `Base URL`, `API Key`, `Model` 입력과 연결 테스트를 제공하여 텔레그램 외 다른 기능에서도 재사용 가능한 구조로 정리.
- **스마트 댓글(네이버) 초안 도구 추가**: `블로그 > 스마트 댓글(네이버)` 탭에서 이웃새글 후보를 읽고 AI 댓글 초안 3개를 생성하는 보조 기능 추가. 공감 상태 판별, 댓글창 바로 이동(`copen=1`), 썸네일 표시, 초안 재생성/복사를 지원.

### Changed
- **설정 저장 UX 개편**: 설정 화면의 자동 저장을 제거하고, 탭 공통 `저장` 버튼으로만 반영되도록 변경. 설정 탭 간 이동은 자유롭게 유지하면서, 설정 화면 이탈/새로고침/닫기 시 저장되지 않은 변경사항 경고를 표시하도록 조정.
- **설정 화면 단순화**: `Advanced` 원문 편집 탭을 제거하고, 상단 저장 상태/버튼 UI를 탭 바 옆으로 재배치해 더 명확한 저장 흐름으로 정리.
- **워드프레스 인증 확인 동작 개선**: 설정 저장 없이 현재 입력값만으로 워드프레스 연동 확인을 수행하도록 변경하여 draft 상태에서도 즉시 검증 가능하도록 조정.
- **텔레그램 AI 선택 구조 개편**: 텔레그램 설정에서는 이제 `기본 AI (Gemini)` 또는 `Custom AI`를 선택만 하고, 실제 OpenAI-compatible 연결 정보는 `AI` 탭에서 공통 관리하도록 변경.
- **Custom AI 설정 단순화**: `enabled` 체크박스를 제거하고 `Base URL + Model` 기반의 연결 정의로 정리. 실제 사용 여부는 텔레그램 같은 각 기능의 모델 선택값에서 결정하도록 책임을 분리.
- **텔레그램 분석 실패 메시지 명확화**: Custom AI 또는 Gemini 호출 실패 시 텔레그램 채팅창에 실패 사유를 함께 안내하도록 조정. 자동 fallback 없이 즉시 종료하는 정책으로 디버깅 용이성 향상.
- **알림 설정 라벨 정리**: Bitly, Custom AI Base URL, 모델 입력 안내 문구를 플랫폼/제품 종속 표현 없이 더 일반적인 문구로 정리.
- **AI 호출 로그 정리**: 스마트 댓글 생성 시 개별 모델 호출 로그를 줄이고, 작업 시작/완료 중심 로그로 정리하여 최근 활동 이력 노이즈를 완화.

### Fixed
- **이미지 최적화 설정 저장 누락 수정**: `IMAGE_OPTIMIZATION_ENABLED` 값이 저장 파싱, 런타임 반영, 설정 재불러오기 경로에서 모두 연결되도록 보완하여 체크박스 상태가 저장 후 원복되던 문제 해결.
- **Custom AI 예외 경로 안정화**: AI 호출 timeout 등 분석 실패 시 `loadingMsg` 참조 오류로 텔레그램 데몬이 종료되던 문제를 수정하고, 실패 후에도 봇 프로세스가 계속 살아 있도록 보완.
- **대시보드 외부 피드 오류 로그 스팸 완화**: 실패한 RSS/YouTube 피드에 대해 짧은 cooldown과 in-flight dedupe를 적용하고, 상태 변경 시에만 경고/복구 로그를 남기도록 조정.
- **네이버 인증 파일 추적 해제**: `config/naver_auth.json`을 `.gitignore`에 추가하고 Git 추적 대상에서 제외하여 개인 로그인 세션 파일이 저장소에 포함되지 않도록 보정.

## [0.1.5] - 2026-03-11

### Fixed
- **Telegram Bot 이중 Polling (409 Conflict) 해결**: `main.js`와 `startUiServer()` 양쪽에서 `TelegramBotService.init()`이 호출되어 동일 봇 토큰으로 두 개의 Polling 인스턴스가 생성되던 근본 원인 제거. `main.js`의 중복 호출을 삭제하고, `stop()`을 async로 변경하여 Polling이 완전히 종료된 후에만 새 인스턴스를 생성하도록 개선.
- **Telegram Bot 시작 로그 누락 수정**: `init()`의 성공 메시지가 `Logger.debug()`로 출력되어 기본 로그 레벨(`info`)에서 보이지 않던 문제를 `Logger.info()`로 변경.
- **설정 저장 시 불필요한 Telegram Bot 재시작 방지**: `saveMajorSettings()` 호출 시 텔레그램 관련 설정(`enabled`, `bot_token`, `chat_id`)이 실제로 변경된 경우에만 봇을 재시작하도록 변경 감지 로직 추가. Slack 연결 테스트 등 무관한 설정 저장 시 봇이 불필요하게 중지/시작되던 현상 해결.
- **Telegram Bot Polling 에러 자동 중지**: 잘못된 봇 토큰 등으로 Polling 에러가 60초 내 5회 연속 발생하면 자동으로 봇을 중지하여 로그 스팸 방지. 정상 메시지 수신 시 에러 카운터 자동 리셋.
- **Slack 알림 설정 저장 누락 수정**: Slack 활성화 체크박스(`settings-notify-slack-enabled`)와 Webhook URL 입력란이 자동 저장 리스너 목록에 누락되어 `config.json`에 반영되지 않던 버그 수정.
- **세션 만료 로그 스팸 방지**: 네이버 세션 확인 로그를 상태 전이 기반으로 변경하여 같은 상태에서는 반복 출력되지 않도록 개선. 이제 `만료 → 정상`, `정상 → 만료` 등 상태 변경 시점에만 최종 상태 메시지를 출력.
- **대시보드 RSS 썸네일 추출 강화**: `media:*` 태그가 없는 피드에서도 `content:encoded`/`description` 내부 이미지를 안정적으로 추출하도록 파서 개선. `srcset`, `data-src`, `data-lazy-src` 등 다양한 속성 및 최소 크기 필터를 지원해 썸네일 인식률 향상.
- **텔레그램 Kuzu 연동 안정성 보강**: `KuzuService` 참조를 `KuzuDB`로 통일하고 초기화 함수 존재 여부를 확인한 뒤 실행하도록 방어 로직 추가. 런타임 환경 차이에서 발생할 수 있는 초기화/참조 오류 위험 감소.
- **대시보드 카드 정렬/스크롤 UX 개선**: Smart Feed 카드의 인라인 높이 강제를 제거하고, 활동 이력/쇼츠 리스트의 최대 높이를 맞춰 균형 잡힌 레이아웃으로 조정. 양쪽 리스트에 얇은 스크롤바 스타일을 적용해 가독성과 탐색성 개선.

## [0.1.4-dev1] - 2026-03-10

### Added
- **Image Deletion Feature**: Added a "Delete Setting" button for optional shopping images (CTA2, CTA3) in the settings UI, allowing users to explicitly clear these optional configurations.
### Changed
- **Authentication File Renaming**: Renamed the Naver login authentication storage file from `auth.json` to `naver_auth.json` to explicitly clarify its purpose in multi-platform environments. Existing users' `auth.json` files will be automatically migrated to the new name on startup.

### Fixed
- **System Log UI Freeze**: Mitigated an issue where opening the "System Log" tab with very large log files (e.g., 25MB+) could freeze the GUI or cause memory issues. The backend API (`/api/v1/logs/read`) now safely truncates files larger than 1MB, returning only the most recent 1MB of log data to the frontend.
- **Telegram Bot Dynamic Initialization**: Fixed an issue where enabling the Telegram bot from the UI settings while the application was running did not actually start the bot daemon until the application was fully restarted. The bot now dynamically starts and stops when settings are changed and saved safely.
- **Browser Premature Closing**: Fixed an issue where the browser session was aggressively closed after the last published post even when it was supposed to remain open for manual user execution/review. The browser will now properly stay alive in this state.
- **Image Deletion Persistence**: Fixed a bug where clearing an image setting was not persisting because the backend would restore the previous value from the configuration if the field was empty.

## [0.1.3] - 2026-03-10

### Added
- **Update Channels**: Introduced `update_channel` setting in `config.json` (`stable`, `beta`, `dev`) to control which update versions are shown to each user type. Falls back to legacy `USER_ROLE` mapping for backward compatibility.
- **Startup Error Dialog**: Application now shows a user-friendly popup dialog via `dialog.showErrorBox` when the UI server fails to start (e.g., port conflict `EADDRINUSE`). CLI mode also prints a specific port conflict error message.
- **SHA-256 Checksum Integrity Verification**: Self-update now verifies the SHA-256 checksum of the downloaded ZIP against the value in `update.json` before extraction, preventing corrupted installs. Build pipeline now generates checksums automatically.
- **`--build-only` Flag**: Added `--build-only` argument to `build.sh` to perform a local build without uploading to the server.
- **Instagram Carousel Widget**: Replaced the problematic YouTube Shorts feed with a sleek Instagram Reels carousel via RSS.app, providing a more reliable and visually engaging dashboard experience.
- **Remote Server Cleanup**: After a successful upload, the build script now automatically removes old release files from the server, keeping only the latest 3 versions per platform to manage disk space.
- **Prerelease Tagging in Build**: `build.sh` now detects if the version contains a suffix (e.g., `-beta`, `-dev`) and sets `"prerelease": true` in `update.json` accordingly.

### Changed
- **`build.sh` Clean Build**: Removed the unreliable incremental build (smart skip) logic. The script now always performs a clean build (`rm -rf dist`) to ensure consistent and reliable output.

### Fixed
- **Dashboard Logger Error**: Fixed a critical `ReferenceError: logger is not defined` in `system.service.js` that prevented activity logs from loading. Standardized `Logger` dependency injection across all UI API services.

## [0.1.2] - 2026-03-10

### Added
- **Dashboard Enhancements**: Implemented dynamic RSS feed detection. The dashboard now shows user-specific Naver and WordPress content if configured, with improved fallback feeds (amadejjs, No Worry Blog, IT Mania).
- **Featured Content**: Added IT Mania as a permanent featured technical resource on the dashboard.
- **Update Status**: Added real-time progress indicators for the update process (download, extract, sync).

### Fixed
- **Incremental Build Logic**: Fixed a bug in `build.sh` where the Electron App Bundle's internal timestamps caused rebuilds to be skipped. Now uses a stamp file based on source mtime.
- **Build Bloat**: Optimized `electron-packager` ignore patterns to prevent recursive bundling, reducing App Bundle size by ~86% (7.2GB -> 1.0GB).
- **UI Freeze Fix**: Resolved a `ReferenceError` related to `settingsCheckUpdateBtn` that caused the UI to sometimes stop responding on load.
- **API Optimization**: Added throttling to dashboard API calls and implemented 2-min caching for Naver session checks.

## [0.1.1] - 2026-03-10
### Added
- **Premium Dashboard UX**: Total redesign of the quick action area with vibrant gradients, increased visibility, and smooth hover interactions.
- **Harmonized Card Layout**: Perfectly aligned "Activity History" and "YouTube Shorts" cards using CSS Grid stretch properties and synchronized content density.
- **Enhanced Log Filtering**: Refined user logs by moving technical startup messages (Kuzu, Telegram, System init) to DEBUG level and implementing prefix-based hiding for a cleaner "Activity History" view.
- **Improved Quick Action Links**: Renamed buttons to "블로그 빠른 발행" and "쇼핑커넥트 빠른 발행", with the latter now linking directly to the Shopping view.

### Fixed
- **KuzuDB Initialization**: Resolved a critical startup error on macOS by identifying Kuzu's file-based storage behavior and removing incorrect directory-only checks.
- **Dashboard Text Overflow**: Implemented `white-space: nowrap` and optimized font scaling to prevent long button labels from breaking the layout.

## 0.9.6-dev1 (2026-03-06)
### Fixed
- **패키징 환경(Packaged App) 경로 및 로딩 이슈 해결**:
  - `resolveRuntimePath`에 `mustExist: true` 옵션 및 `app.asar` 번들 경로(`BUNDLE_DIR`) 탐색 기능을 추가하여, 패키징된 상태에서도 `blog_prompt.md` 등 내부 시스템 프롬프트 파일을 정상적으로 탐색하도록 수정.
  - 시스템 로그(`system.service.js`) 및 트렌드 디버그 스크린샷(`trend-manager.js`)의 저장 경로를 `process.cwd()`에서 `CONFIG.ROOT_DIR`로 변경하여 패키징 후에도 사용자 데이터 폴더를 일관되게 사용하도록 보완.
  - 패키징 실행 시 메인 프로세스(`electron-main.js`)에서 `CONFIG.ROOT_DIR`이 `undefined`로 발생하던 `TypeError`를 방지하기 위해 `resolveConfig` 폴백을 추가.
  - **`sharp` 모듈 네이티브 라이브러리 로드 오류 수정**: 맥OS(`darwin-arm64` 등)환경 패키징 시 `sharp`와 `@img` 모듈이 `app.asar` 내부에 묶여 있어 실행 시점에 라이브러리(`libvips-cpp.dylib`)를 찾지 못하던 문제(`ERR_DLOPEN_FAILED`) 해결. `build.sh` 및 `build.yml`의 `electron-packager` 옵션에 `--asar.unpack="**/{node_modules/sharp,node_modules/@img}/**/*"`를 추가하여 정상 동작하도록 보완.
- **UI 및 사용자 경험 개선**:
  - **영문 라벨 한글화**: 글감(블로그) 및 상품(쇼핑커넥트) 수정 팝업에서 'Subject', 'Keywords' 등을 '주제', '키워드'로 변경. 테이블 헤더의 'Post Status'를 '발행 상태'로 일괄 수정.
  - **상태 값 한글 표시 맵핑**: 스프레드시트에 영문(`draft`, `publish`, `schedule`)으로 저장되는 발행 상태를 UI 상에서는 '임시 저장', '즉시 발행', '예약 발행'으로 자동 표시 및 선택 가능하도록 수정.
  - **인라인 수정 시 캐시 즉시 반영 (Optimistic UI Update)**: 팝업을 통해 발행 상태(`postStatus`), 예약 일시(`scheduleDate`) 등을 변경하고 [저장] 시, 구글 시트 반영을 기다리느라 화면에 옛날 값이 남던 현상을 수정. 저장 완료 즉시 로컬 캐시를 업데이트하고 재렌더링하여 지연 없는 사용자 경험 제공.
- **워드프레스 이미지 업로드 안정성 및 외부 연동 호환성 극대화**:
  - 파일명에 한글 등 비 ASCII 문자가 포함될 경우 워드프레스 DB 에러 및 Meta Threads 등 외부 플랫폼의 Open Graph 렌더링 누락 현상을 완벽히 차단하기 위해, n8n 등 외부 자동화에서 검증된 강력한 파일명 정규화 로직 도입.
  - 모든 문자를 영문 소문자 및 언더바(`_`)로 치환하고 연속된 언더바를 정리한 뒤, 길이를 강제로 100자 이내로 제한. 파일명 끝에 타임스탬프와 5자리 랜덤 해시(`Math.random`)를 결합하여 동시다발적인 처리 시에도 100% 충돌 없는 고유(Unique) 파일명 보장.
  - (※ 단, 워드프레스 미디어 라이브러리 상의 '대체 텍스트(Alt)' 및 '제목' 메타데이터는 기존과 동일하게 원본 한글이 정상적으로 들어갑니다)
- **WP 이미지 없는 게시글 작성 (Fallback) 크래시 수정**:
  - 네이버 블로그 자동 발행 시 삽입할 이미지가 없는 경우 실행되는 원본 마크다운 텍스트 처리 과정에서 `prefix` 변수가 정의되지 않아 발생하던 오류 로그(`prefix is not defined`)를 수정.
- **발행 모듈 내 브라우저 안정성(Safe Interaction) 강화**:
  - 13인치 노트북 등 작은 해상도에서도 팝업이 가려지지 않도록 Playwright 블로그 에디터의 기본 창 크기(`SAFE_EDITOR_VIEWPORT`)를 `1280x800`으로 최적화.
  - 화면 밖이나 툴바 아래에 일시적으로 가려진 요소를 클릭할 때 발생하던 에러를 방지하기 위해, 모든 강제 클릭(`force: true`) 로직을 화면 스크롤 기반의 안전한 클릭 함수(`autoScrollAndClick`)로 전면 교체.
  - UI 서버가 완전히 로드되기 전 발행 프로세스가 시작될 경우 `CONFIG.WRITE_URL`이 `undefined`로 호출되어 브라우저 탐색이 실패하던 이슈(`page.goto: url: expected string, got undefined`) 수정.

이 프로젝트의 주요 변경 사항을 기록합니다.

형식: Keep a Changelog 스타일  
버전: SemVer

## [0.1.0] - 2026-03-09
### Added
- **Capability-Based AI Architecture**: Complete redesign of the AI core to handle modular actions (`register_topic`, `publish_article`, etc.) allowing for "Register only" and "Interactive Publish" flows.
- **Interactive Telegram UI**: Added real-time toggle buttons (`[🚀 Auto-Publish: ✅/❌]`, `[🖼️ Image: ✅/❌]`) to control AI behavior directly from the bot before execution.
- **KuzuDB Integration**: Introduced a persistent memory system using KuzuDB to store user insights, conversation history, and topic relationship graphs.

### Fixed
- **Packaged App Stability**: Fixed `sharp` module loading errors and `EROFS` write access issues when running the application as a standalone `.app` bundle.
- **Concurrent DB Access**: Implemented `KuzuQueue` to prevent database locking errors across multiple application components.


### Added
- **Naver 블로그 자동 발행 견고성 강화**:
  - **예약 발행 정밀도 개선**: 네이버 시스템 제약(10분 단위)에 맞춰 예약 시 분 단위를 자동으로 내림 보정(Floor)하는 로직 도입 (예: 12분 -> 10분).
  - **상호작용 품질 향상**: '예약' 라디오 버튼 클릭 시 선택자 보강 및 JavaScript 이벤트 트리거를 통한 이중 검증 로직 적용.
  - **날짜 파싱 유연성**: 정규표현식을 활용하여 다양한 형식의 일시 문자열로부터 날짜와 시간을 정확하게 추출하도록 개선.
  - **자동 팝업 관리**: 에디터 진입 시 방해되는 '도움말(Help)' 및 '이전 글 로드' 팝업을 자동으로 제거하는 `dismissEditorPopups`를 `Core` 모듈로 통합 및 공용화.
  - **발행 실패 대응 (Safeguard)**: 카테고리 선택 실패 또는 이미지 누락 시, 포스트 유실을 방지하기 위해 발행을 중단하고 즉시 '임시저장'으로 전환하는 안전장치 강화.
- **쇼핑커넥트 빠른 발행 및 편집 UX 혁신**:
  - **UI 일관성 확보**: 쇼핑 빠른 발행의 카테고리(네이버/WP), 발행 상태, 예약 일시 필드를 상시 노출로 변경하여 블로그와 동일한 사용성 제공.
  - **팝업 편집(Modal) 도입**: 쇼핑 배치 테이블의 인라인 편집을 행 더블클릭 기반의 모달 팝업 방식으로 전면 교체하여 편집 안정성 향상.
  - **드롭다운 시인성 개선**: 모달 하단의 '상태' 드롭다운이 푸터나 스크롤에 가려지지 않도록 위로 펼쳐지는 **Drop-up** 기능 및 애니메이션 구현.
  - **용어 현지화**: `publish/draft/schedule` 등 영문 상태값을 '즉시 발행/임시 저장/예약 발행' 한글로 통일.
- **자동 저장(Auto-Save) UX 최적화**:
  - **입력 보호(Focus-Aware)**: 키보드 입력 중(Focus)에는 서버 응답이 오더라도 필드 내용을 덮어쓰지 않도록 개선하여 글자 잘림 현상 방지.
  - **반응성 조절**: 자동 저장 대기 시간(Debounce)을 2초로 늘려 여유를 확보하고, 포커스 해제(Blur) 시 즉시 저장하여 데이터 확실성 보장.
- **프로젝트 구조 최적화 (testscripts)**:
  - **테스트 스크립트 전용 폴더**: 프로젝트 루트에 있던 수많은 `test_*.js`, `debug_*.js` 파일들을 `testscripts/` 폴더로 일괄 이동하여 프로젝트 구조를 정비.
  - **위치 독립 실행 지원**: `__dirname` 기반의 경로 탐색을 적용하여, 스크립트가 어느 위치에서 실행되더라도 `config/`, `src/` 등 필수 자산을 안정적으로 참조하도록 개선.
- **통합 테스트 자동화**:
  - `testscripts/test_integrated_category.js` 추가: 발행부터 카테고리 설정, 예약 발행까지의 전 과정을 실제 환경과 동일하게 검증할 수 있는 통합 테스트 스크립트 제공.

## [0.9.9-dev1] - 2026-03-08
### Added
- **Universal Agent - 범용 의도 해석 및 제어 시스템 구축 (Phase 9)**:
  - **Universal Intent Parser**: 텔레그램 메시지를 분석하여 `PUBLISH`(발행), `UPDATE_CONFIG`(설정 변경), `RUN_JOB`(작업 실행), `QUERY_DATA`(데이터 조회)로 분류하고 정밀 파라미터를 추출하는 AI 레이어 도입.
  - **Configuration Agent**: 전역 시스템 설정(`config.json`)을 자연어로 제어. "트렌드 수집 꺼줘", "발행 주기를 20분으로 바꿔줘" 등 복잡한 설정 변경을 대화를 통해 수행.
  - **Job Orchestrator**: 트렌드 수집, RSS 수집 등 백그라운드 작업을 텔레그램에서 직접 트리거. 특정 날짜 지정 수집(`trendDate`) 등 상세 파라미터 지원.
  - **Granular Dispatcher**: 대화 맥락(`chatContext`)을 기억하여 "방금 그거 발행해줘"와 같은 지시 대명사 및 후속 명령을 지능적으로 처리.
  - **Interactive Feedback**: 주요 설정 변경이나 작업 실행 전 인라인 키보드 버튼을 통해 사용자의 최종 승인을 받는 안전 장치 및 실시간 피드백 루프 강화.
  - **Query Data Agent**: 현재 시스템 상태, 대기 중인 글감 수 등 운영 데이터를 대화형으로 조회하는 기반 마련.

## [0.9.8-dev3] - 2026-03-08


### Added
- **지능형 범용 오버라이드(Universal Override) 시스템 (Phase 7)**:
  - **만능 options 필드**: `Topics` 시트의 `options` JSON 컬럼이 시트의 모든 개별 컬럼(제목, 키워드, 카테고리, 예약일시 등) 및 전역 설정을 덮어쓸 수 있도록 오버라이드 우선순위 정립 (`options` > 시트 > 전역).
  - **AI 시공간 인식 강화**: 텔레그램 메시지 내 "내일 모레", "오늘 저녁" 등 상대적 시간 표현을 AI가 분석 시점의 KST 기준으로 정확한 `YYYY-MM-DD HH:mm:ss` 형식으로 변환하여 `options.schedule_date`에 자동 기록.
  - **상세 지시 사항 추출**: 사용자의 말투 지정, 특정 자료 참고 요청 등을 AI가 분석하여 `options.instruction` 및 `options.reference_urls`에 정밀하게 매핑.
- **봇 메시지 개인화 및 다양화 (Phase 8 - Fun Factor)**:
  - **랜덤 메시지 시스템**: 토픽 등록 완료, 발행 시작, 서비스 대기 등 주요 알림 시 3~4가지의 서로 다른 렌더링 멘트를 무작위로 선택하여 제공함으로써 따분함 해소 및 친근한 비서 페르소나 구축.
  - **맥락 인식 안내**: `/help` 및 시작 안내 메시지에도 랜덤화를 적용하고, 대화의 맥락(Context)을 기억하여 이전 주제를 지칭하는 명령을 똑똑하게 이해하도록 개선.

## [0.9.6-dev2] - 2026-03-08

### Added
- **이미지 자동 최적화 변환 (Image Optimization)**:
  - **플랫폼별 자동 변환**: 네이버 블로그 발행 시 WebP, 워드프레스 발행 시 AVIF로 이미지를 자동 변환하여 로딩 속도 및 SEO 개선.
  - **발행 시점 변환**: 이미지 생성/다운로드 단계가 아닌, 발행 직전에 일괄 변환하여 아키텍처를 단순화.
  - **로컬 파일 보존**: 변환된 이미지(WebP/AVIF)를 원본과 동일한 폴더에 원본 파일명 기반으로 저장 (예: `00_image.png` → `00_image.avif`).
  - **변환 로그**: 이미지 변환 성공/실패에 대한 상세 로그 출력 추가.
  - **설정 UI**: 일반 설정 탭에 이미지 최적화 글로벌 토글 추가.
- **쇼핑커넥트 자동발행 허용 시간대 설정 추가 (Phase 8)**:
  - **발행 시간 제한**: 블로그 자동발행과 동일하게 쇼핑 자동발행도 특정 시간대(예: 09:00~23:59)에만 동작하도록 제한하는 기능 추가.
  - **상태 표시 개선**: 허용 시간대 밖일 경우 대시보드 및 시스템 상태에 `waiting_time_window` 및 안내 메시지 표시.
  - **UI 연동**: '쇼핑커넥트 > 자동발행 설정' 패널에 시간대 선택 필드 추가 및 실시간 자동 저장 연동.
- **Slack 알림 (Incoming Webhooks) 연동 (Phase 7-B)**:
  - **신규 알림 서비스**: 텔레그램과 별도로 Slack Incoming Webhook을 통해 발행 완료 알림을 전송하는 `SlackService` 신규 구현.
  - **메시지 변환**: 텔레그램용 HTML 태그를 Slack의 `mrkdwn` 형식(bold, link 등)으로 자동 변환하여 가독성 유지.
  - **설정 연동**: `config.json` 및 UI 설정 탭에 Slack 활성화 및 Webhook URL 설정 필드 추가.
- **사용자 경험(UX) 및 실시간 가시성 강화**:
  - **실시간 로그 스트리밍**: 자동 발행 '수동 실행' 시 단순 상태 메시지 대신 대시보드와 동일한 실시간 콘솔 로그를 로그 영역에 직접 스트리밍하도록 개선.
  - **연결 테스트 자동 저장**: 텔레그램 및 Slack '연결 테스트' 성공 시, 입력된 정보가 검증되었으므로 즉시 `config.json`에 자동 저장되도록 보완.
  - **문구 친화도 개선**: 수동 실행 확인 팝업 문구를 보다 자연스러운 "수동 발행을 진행하시겠습니까?"로 수정.
- **콘텐츠 생성 및 발행 로직 보강**:
  - `processMultiPlatformPublish`에서 `finalSubject` 및 `postUrl`을 상위로 전달하도록 보강하여 알림 정확도 향상.

### Changed
- **RSS 수집 순서 변경**: RSS 피드에서 수집한 글감을 최신순(desc)이 아닌 과거순(asc)으로 Topics 시트에 추가하도록 변경.

### Fixed
- **알림 카운트 및 링크 유실 버그 수정**:
  - `executeBlogRowAction`에서 정의되지 않은 변수(`finalSubject`) 참조로 인해 발행 성공 시에도 알림에는 실패로 집계되던 ReferenceError 수정.
  - 워드프레스 발행 성공 시 생성된 링크가 알림 메시지에 포함되지 않던 로직 결함 해결.
- **설정 저장/불러오기 일관성 보완**:
  - `ui-server.js`의 `getMajorSettings` 및 `validateMajorSettingsRequestBody`에 `NOTIFY_BITLY_TOKEN` 필드를 추가하여 UI 새로고침 후에도 설정값이 유지되지 않던 문제 해결.

### Added
- **고볼륨 & 고품질 콘텐츠 생성 전략 (Phase 4)**:
  - **콘텐츠 볼륨 확장**: AI 프롬프트 최적화를 통해 본문 2,000자(실제 4,500자+ 생성) 및 소제목 블록 7~8개 이상의 풍성한 본문 구성 확보.
  - **베네핏 중심 소제목**: "N개의 리뷰가 증명하는~" 등 구매 욕구를 자극하는 긴 문장형, 혜택 기반의 소제목 자동 생성 가이드 강화.
  - **이미지 배치 밀도 상향**: 모든 서사(Narrative) 블록마다 상품 이미지를 삽입하도록 개선하고, 수집된 갤러리 이미지를 본문에 고르게 분배하여 시각적 정보량 극대화.
  - **리뷰 수집 투명성 및 검증 로직 도입**:
    - 리뷰 탭 클릭 후 실제 내용이 화면에 노출되었는지 확인하는 **활성화 검증(Verification)** 단계 추가.
    - 로그에 `✅ [Shopping] 리뷰 탭 활성화 확인됨` 및 추출된 데이터 요약(샘플 건수 등)을 명시하여 스크래핑 신뢰도 확보.
    - 최신 스마트스토어 레이아웃 대응을 위한 전용 셀렉터(role, data-clk 등) 우선순위 보강.
- **이미지 수집 및 관리 최적화**:
  - 상품 이미지 기본 수집 한도를 상향(12장)하고, 런타임 옵션으로 조정 가능하도록 확장.
  - 이미지 다운로드 로그에 소스 정보(`main_gallery`, `DOM` 등)를 병기하여 데이터 출처 확인 용이성 개선.
  - 너무 작은 이미지(썸네일 등)는 수집 단계에서 사전에 필터링하여 로그 노이즈 제거.
- **가독성 개선**: 리스트(불렛/번호) 항목이 끝난 뒤 자동으로 더블 개행(`\n\n`)을 추가하여 모바일 환경 가독성 향상.
- **대시보드 UI 연동 강화**: 설정된 발행 예약 시간(Next)이 허용 시간대 밖일 경우, 카운트다운 대신 `허용 대기중 (HH:MM~HH:MM)` 메시지를 표시하여 사용자 혼란 방지.

### Fixed
- **자동 발행 스케줄러 로직 단순화 및 안정화**: 설정 변경 시마다 타이머가 리셋되던 문제를 해결하고, 실제 실행 시점에 조건을 검사하도록 구조를 개선하여 불필요한 대기 시간 제거.
- **AI 프롬프트 경직성 해소**: 하드코딩된 시스템 문구 주입을 제거하고 100% 프롬프트 기반 생성으로 전환하여 문맥에 어울리는 유연한 도입부/결론 도출.
- **자동 발행 설정 UI 버그 수정**:
  - '보이지 않게 실행' 체크박스 클릭 시 설정값이 즉시 원복되던 로직 수정.
  - '발행 대상' 라벨 텍스트 색상이 다른 항목들과 달랐던 디자인 불일치 해결.

## [0.9.8] - 2026-03-06

### Added
- **워드프레스 카테고리 실시간 연동 강화 (WP Category Integration)**:
  - 프론트엔드 카테고리 캐시(`wpCategoryCache`) 통합 관리 및 중복 요청 방지 로직 도입으로 데이터 일관성 확보.
  - 블로그/쇼핑 '빠른발행' 영역의 독립적이고 파편화된 WP 카테고리 드롭다운 UI 로직을 `initWpCategorySelector` 공통 컴포넌트로 리팩토링 및 렌더링 방식 일원화.
  - 블로그 및 쇼핑 일괄발행 테이블의 '카테고리' 인라인 수정 시, 워드프레스 카테고리를 실시간으로 불러와 드롭다운으로 제공.
  - 카테고리 정보 로드 전 인라인 수정 시 '불러오는 중...' 상태 표시 및 로딩 완료 후 자동 갱신.
  - 워드프레스 연동 확인(Verify) 성공 시 및 주요 설정 저장 시 카테고리 캐시 즉시 만료 및 동기화 추가.
- **워드프레스 이미지 업로드 안정성 개선**:
  - 한글 등 비 ASCII 문자를 포함한 이미지 파일명을 URI 인코딩(`encodeURIComponent`) 처리하여 서버 호환성 및 업로드 안정성 확보.
- **트렌드 자동 수집 WP 카테고리 지정 옵션 추가**:
  - '자동글감 설정'의 트렌드 자동 수집 사용 블록에 WP 카테고리 선택 드롭다운(검색 지원) 연동.
  - 필터 조건, 중복 금지 간격, WP 카테고리 UI 배치를 공간 효율적으로 개선 (가로 정렬 및 순서 조정).
  - 트렌드 수집 시 지정된 WP 카테고리가 Google Sheets의 '카테고리' 컬럼에 자동으로 기록되도록 백엔드 로직 연동.
  - `config.json.sample`에 `automations.blog_collect.trends.wpCategory` 기본값 반영.

### Fixed
- **패키징된 앱 실행 시 메인 프로세스 오류 수정**: `config-loader.js`에서 `ROOT_DIR`이 export되지 않아 발생하던 `TypeError`를 해결하고 경로 fallback 로직을 추가하여 안정성 확보.
- **블로그/쇼핑 일괄발행 목록 무한 로딩(Hang) 수정**:
  - 구글 시트 검증(`uiSheetsPreflightState.inFlight`) 진행 중 예외 발생 시 Promise가 정리되지 않아 영구적으로 로딩에 빠지는 데드락 해결.
  - 구글 시트 및 워드프레스 API(`axios`) 호출 시 타임아웃(기본 15초)이 누락되어 네트워크 지연 시 백엔드가 무한 대기하던 문제 수정.
  - 프론트엔드 렌더링 중 누락된 변수(`blogTopicsWriteLockUntil` 등) 및 함수(`populateFilterWpCategoryDropdown`) 등 초기화 스크립트 충돌로 인한 화면 정지 고침.
- **[시스템 로그] 탭 파일 목록 조회 불가 현상 수정**:
  - 로그 조회 API(`/api/v1/logs/files`)에서 로컬 경로 탐색 시 `CONFIG.ROOT_DIR` 참조 오류로 인해 '목록을 불러오지 못했습니다' 메시지가 출력되며 500 에러를 반환하는 문제 해결 (`process.cwd()`로 경로 해석 기준 정상화).
- **프론트엔드 인라인 편집 스크립트 안정화**:
  - 쇼핑커넥트 인라인 편집 진입 시 `editorEl` 변수 선언 누락(`let`)으로 인해 발생하던 잠재적 `ReferenceError` 버그 수정.

## [0.9.7] - 2026-03-05

### Added
- **설정 체계 JSON 전환 (config.json)**: 기존 `config.txt`의 평면 구조 설정을 구조화된 `config.json` 체제로 전면 개편.
- **설정 샘플 기반 자동 생성**: `config.json`이 없을 경우 `config.json.sample`로부터 자동 복사/생성하여 초기 설치 편의성 개선.
- **설정 업데이트 로직(Surgical Update) 지원**: `utils.updateConfigValue`가 JSON 구조를 지원하도록 재구현하여 워드프레스 영구 자산 등의 캐싱 기능 유지.
- **워드프레스 상품 이미지 클릭 링크 적용**: 워드프레스 쇼핑커넥트 발행 시 모든 상품 이미지에 상품 URL 링크를 자동 적용하여 CTR 향상.
- **워드프레스 CTA 이미지/문구 클릭 링크 적용**: CTA 이미지 및 구매 독려 문구(`🛒 ...`)에 상품 URL 링크 적용. 링크 적용 후 URL 단독 라인은 제거하여 중복 노출 방지.
- **라이선스 서버 호출 최적화**: Supabase 부하 방지를 위해 라이선스 상태 확인 결과에 10분 메모리 캐시 적용.
- **설정 저장 시 쇼핑 이미지 유지 수정**: 주요 설정 저장 후 쇼핑커넥트의 FTC/CTA 이미지 데이터가 사라지는 현상 해결.
- **시작 안내 배너 실시간 업데이트**: 필수 설정 완료 시 리프레시 없이도 대시보드 안내 배너가 즉시 사라지도록 개선 (Dynamic Getter 및 30초 주기 폴링 적용).
- **설정 UI 레이아웃 및 디자인 표준화**:
  - 설정 하단 상태 메시지(`updateSettingsStatus`) 디자인 표준화 및 모든 탭 적용.
  - 'Advanced' 탭 하단 레이아웃을 '일반/블로그' 탭과 동일하게 구분선 및 하단 상태창 구조로 통일.
  - '타이핑 효과 미리보기' 섹션의 폰트, 테두리, 줄간격 및 라벨 스타일을 전체 UI 시스템과 완벽히 일치하도록 개선.
  - 브라우저 캐시로 인한 스타일 미반영 방지를 위해 CSS/JS 버전 태깅(`?v=2`) 적용.
  - 자동 저장되는 설정 항목(자동발행/수집 등)의 안내 문구에서 불필요한 '[저장] 버튼 클릭' 안내를 삭제하고 '즉시 반영'으로 수정.
- **트렌드 수집 로직 개선**:
  - '증가 순위(Top N)' 필터링을 카테고리별로 각각 적용하도록 수정. 이제 여러 카테고리 선택 시 각 카테고리마다 설정된 개수만큼 수집됩니다 (예: 3개 카테고리 * Top 4 = 최대 12개).

### Changed
- **워드프레스 쇼핑커넥트 Related Posts 하이브리드 수집**: 워드프레스 발행 대상 시 워드프레스 RSS + 네이버 RSS를 함께 참고하여 관련 글을 수집하고, 제목에 링크 형태(`* [제목](URL)`)로 렌더링. 네이버 발행 시에는 링크카드용 URL만 출력.
- **Related Posts 헤더 문구 개선**: '브라우징 이어가기' 등 어색한 표현을 제거하고 자연스러운 한국어 표현으로 대체.
- **스크래핑 브라우저 세션 최적화**: 상품 페이지 방문 시 URL fallback + 리뷰 탭 클릭을 단일 브라우저 세션에서 처리하여 불필요한 두 번째 브라우저 방문 제거.
- **스크래핑 headless 설정 브라우저 적용 확대**: '보이지 않게 실행' 체크박스 설정이 네이버/워드프레스 발행 브라우저뿐 아니라 상품 정보 스크래핑 브라우저에도 적용되도록 수정.
- **대시보드 UI 성능 최적화**: 대시보드 자동 갱신 주기를 15초에서 30초로 조정하고, 카드 내 'N건 발행 예정' 문구를 삭제하여 시인성 및 성능 개선.

### Fixed
- **쇼핑커넥트 진행 로그 컬럼 표시 오류**: 발행 진행 상태가 '상태' 컬럼 대신 '진행 로그' 컬럼에 올바르게 표시되지 않던 버그 수정 (`item.runtimeLog` 필드명 불일치 수정).
- **대시보드 자동발행 정보 시인성 개선**: 레이아웃 버그(Fixed Height)로 인해 자동발행 컴팩트 정보(⏱, 📄, 🎯)가 가려지던 현상 수정.
- **서버 에러 로그 가독성 개선**: 라이선스 서버(Supabase/Cloudflare) 502 오류 발생 시 로그에 거대한 HTML 본문이 출력되지 않도록 정화(Sanitize) 로직 적용.

## [0.9.6] - 2026-03-04

### Added
- **워드프레스 인라인 수정 강화**: 블로그 일괄발행 테이블에서 '카테고리'(WP 드롭다운), '발행옵션'(publish/draft/schedule), '예약일시'(날짜 선택기)를 즉시 수정 가능하도록 인라인 편집 기능 추가.
- **낙관적 UI 업데이트**: 체크박스 토글 및 인라인 수정 시 서버 응답 전 UI를 즉시 반영하고, Write-Lock 메커니즘을 도입하여 구글 시트 반영 지연으로 인한 상태 회귀 현상 해결.

### Changed
- **UI 레이블 명칭 정문화**: '자동수집 설정' -> '자동글감 설정', '트렌드 1회 수집' -> '트렌드 수동 수집'으로 명칭 변경하여 직관성 향상.
- **프로덕션 환경 최적화**: 불필요한 `trends`, `keywords` 시트 자동 생성 중단 및 UI의 `Trends` 탭 주석 처리 (프로덕션 모드 정비).
- **고급 설정 UI 개선**: 설정 -> Advanced 영역의 텍스트 에어리어 높이를 확장하여 긴 설정값 편집 편의성 개선.

### Fixed
- **일괄발행 체크박스 깜빡임**: 이미지/외부참고 체크박스 클릭 시 서버 데이터 동기화 타이밍 문제로 상태가 불규칙하게 변하던 Race Condition 해결.

## [0.9.5] - 2026-03-04

## [0.9.4] - 2026-03-03

## [0.9.3] - 2026-03-03

### Added
- **네이버 블로그 URL 자동 변환**: PC용 블로그 주소(`blog.naver.com`)를 입력해도 자동으로 모바일용(`m.blog.naver.com`)으로 변환하여 스크래핑 효율 및 안정성 개선.
- **AI 생성 관련글 섹션 정제 강화**: AI가 본문 하단에 임의로 추가하는 '관련 글' 또는 '참고 URL' 등을 감지하여 자동으로 제거하는 로직 강화 (5가지 이상의 다양한 패턴 대응).

### Changed
- **로그 메시지 톤 완화**: 워드프레스나 구글 시트 등 필수 설정이 누락된 경우를 치명적 오류(Error)가 아닌 안내성 정보(Info)로 조정하여 사용자 불안감 해소.

### Fixed
- **UI 대시보드 로그 아이콘 중복**: 로그 파일 자체에 아이콘이 포함된 경우 UI에서 아이콘이 두 번 겹쳐 보이던 현상 수정.

## [0.9.2] - 2026-03-03

### Added
- **워드프레스 이미지 업로드 최적화 (V6)**: Node.js 헤더 인코딩 이슈를 근본적으로 해결하기 위해 `multipart/form-data` 전송 방식 및 Node 18 내장 `FormData/Blob` 도입. 한글 파일명 및 타임스탬프가 포함된 직관적인 파일명 보존.
- **워드프레스 하이브리드 관련 글 추천**: 워드프레스 RSS와 네이버 RSS에서 관련 글을 수집하여 마크다운 불렛 포인트 링크로 자동 삽입하는 기능 추가.
- **워드프레스 카테고리 검색 드롭다운**: 수많은 카테고리를 실시간으로 검색하여 선택할 수 있는 커스텀 검색 드롭다운 UI 구현.
- **첫 실행 안내 가이드**: 필수 설정(네이버 ID, Gemini API 키 등)이 없을 때 터미널 및 브라우저 UI에서 친절한 설정 안내 배너와 메시지를 표시하는 기능 추가.

### Changed
- **빠른 발행 UI 설정값 유지 (Persistence)**: "보이지 않게 실행", "이미지 생성", "외부 참고 사용", "발행 상태/예약 일시" 등 모든 옵션을 브라우저에 자동 저장하여 페이지 새로고침이나 서버 재시작 후에도 상태 유지.
- **사이드바 레이아웃 정교화 (Alignment)**: 접기/펴기 시 메뉴 아이콘의 수직 위치가 변하지 않도록 고정 높이(Fixed Height) 적용 및 시각적 '점프' 현상 제거.
- **워드프레스 발행 UI 정렬 개선**: 카테고리/상태/예약 30-column 레이아웃의 폭을 조정하여 상단 체크박스 라인과 우측 정렬이 완벽하게 맞도록 최적화.
- **이미지 SEO 동기화**: 생성된 이미지의 Title/Alt 텍스트를 블로그 포스트 제목과 자동으로 동기화하여 미디어 라이브러리 가독성 및 검색 엔진 최적화 개선.
- **설정 네임스페이스 공식화**: 기존 `NAVER_AUTO_*` 및 `NAVER_SHOPPING_AUTO_*` 설정을 각각 `BLOG_AUTO_*` 및 `SHOPPING_AUTO_*`로 명확하게 개편 (하위 호환성 유지).
- **설정 최적화 (Smart Save/Remove)**: `config.txt` 저장 시 내부 기본값과 동일한 항목은 자동으로 제거하여 파일을 깔끔하게 유지하고, 사용자가 변경한 필수 값만 관리하도록 개선. 무분별한 샘플 값들을 정리한 [config.txt.sample](file:///Users/delta898/Project/NaverAutoBlog/config/config.txt.sample) 제공.
- **UI 상태 보존 고도화**: 사이드바 접힘 상태 등 UI 전용 설정들을 `config.txt` 대신 브라우저 `localStorage`에서 관리하여 불필요한 서버 통신 제거.

### Fixed
- **설정 실시간 동기화**: `config.txt`의 워드프레스 설정이 UI와 즉시 동기화되지 않거나 서버 초기 로딩 시 누락되던 문제 해결.
- **워드프레스 관련 글 누락**: 워드프레스 플랫폼 발행 시 관련 글 자동 링크 로직이 활성화되지 않던 회귀 오류 수정.
- **첫 실행 에러 로그 억제**: 필수 설정이 완료되지 않은 초기 설치 상태에서 발생하는 구글 시트 및 워드프레스 관련 기술적 에러 로그들이 출력되지 않도록 개선.

## [0.9.1-dev32] - 2026-03-02

### Changed
- **쇼핑 설정 분리**: 설정 메뉴의 '네이버 블로그' 탭 하단에 있던 쇼핑 이미지 설정(공정위/CTA)을 별도의 '쇼핑커넥트' 탭으로 분리하여 관리 편의성 개선

## [0.9.1-dev31] - 2026-03-02

### Fixed
- **브라우저 수동 종료 안정화**: 발행 완료 후 'Smart Keep-Alive' 상태에서 브라우저 창을 수동으로 닫을 수 없던 문제 해결 (Playwright 대화상자 리스너 클린업 추가)

## [0.9.1-dev30] - 2026-03-02

### Changed
- **앱 종료 시 리소스 정리**: 앱 종료 시 활성화된 모든 브라우저 세션을 강제 종료하여 백그라운드 프로세스 행(Hang) 현상 방지

## [0.9.1-dev29] - 2026-03-02

### Changed
- **사용성 개선**: '빠른 발행' 화면의 '참고/지시사항' 입력창 높이를 2배로 확대하여 긴 내용 입력 편의성 증대

## [0.9.1-dev28] - 2026-03-02

### Changed
- **빌드 시스템 최적화**: `build.sh` 실행 시 생성되는 ZIP 파일을 각 플랫폼별 하위 폴더 내부로 이동하여 프로젝트 루트 폴더를 깔끔하게 유지

## [0.9.1-dev27] - 2026-03-01

### Added
- **실시간 로그 통합**: '네이버 블로그' 및 '쇼핑커넥트' 일괄 발행 탭에 실시간 상세 진행 로그 영역 추가

### Changed
- **로그 가독성 개선**: 로그 결과 영역의 기본 높이를 상향(160px)하고 자동 스크롤 및 스타일 최적화


## [0.8.23] - 2026-02-24

### Added
- 마크다운 인용구(`>`) 처리 재도입
  - `parseMarkdown`에서 `>` 라인을 `quote` 블록으로 파싱 복원

### Changed
- 네이버 에디터 인용구 입력 흐름 안정화
  - 소제목과 동일하게 하단 커서 고정 기반으로 인용구 입력/서식 적용
  - 인용구 적용 후 하단 커서 재고정 + 다음 줄 이동으로 역순 삽입/상단 포커스 회귀 완화
- 리스트 직후 간격 처리에 인용구 타입 포함

## [0.8.22] - 2026-02-24

### Fixed
- 네이버 에디터 `같이/함께 보면 좋은 글` 구간 링크 카드 삽입 시 커서가 상단 본문으로 튀는 회귀 수정
  - 링크 카드 삽입 전/후 포커스 복귀 경로를 본문 포커스 우선이 아닌 문서 하단 앵커 우선으로 통일
  - 패키징 실행 환경에서 발생하던 위/아래 스크롤 왕복 및 카드/본문 역순 삽입 현상 완화

## [0.8.21] - 2026-02-24

### Changed
- 네이버 에디터 본문 커서 이동 안정화 보강
  - 소제목/본문 입력 전 커서를 문서 마지막 editable로 강제 이동하도록 우선 경로 통일
  - DOM selection 기반 하단 이동을 기본으로 적용하고, 앵커 클릭/End 키를 fallback으로 유지
  - 툴바/팝업 영역이 커서 후보로 선택되지 않도록 제외 처리

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
- 네이버 글쓰기 안정화 롤백/보강
  - 마크다운 `>` 인용구 특수 처리 경로를 제거하고 기존 본문 흐름으로 복원
  - 소제목 입력 전후 하단 caret 고정 적용으로 패키징 환경 포커스 이탈 완화
- 브라우저 채널 진단 로그 추가
  - 실행 시 실제 선택된 채널(`chrome/msedge/chromium`)을 콘솔에 출력

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
