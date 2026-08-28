# BlogGenius Backlog

> 현행 기준: 2026-08-28 · 최신 릴리스: `v0.3.0` · 다음 버전: 미정

## P0 — 현재 진행

1. 개발·운영 환경 분리
   - 상세 범위와 단계는 `docs/plans/active/development-environment-separation-main-plan.md`를 따른다.
   - `local → development → production` 승격 흐름과 fail-closed 보호를 우선 구현한다.

2. Runtime Config 민감 정보 노출 차단 (Known Issue · 환경 분리 완료 후 착수)
   - `app_runtime_configs`와 anon 실행 가능한 `get_runtime_config`가 Google OAuth Client Secret, Naver Client Secret 등 민감값을 Desktop에 반환할 수 있는 현재 구조를 보안 이슈로 취급한다.
   - 현재 설정·라이선스 환경 분리 작업을 완료한 뒤 별도 feature에서 실제 저장 키와 소비자를 값 노출 없이 전수 조사한다.
   - 공개 runtime 설정과 server secret을 분리하고, 공개 RPC는 코드 allowlist의 비민감 키만 반환하며 전체 조회(`p_keys is null`)를 차단한다.
   - Naver·SerpApi·Brevo 등 provider secret은 환경별 Edge Function Secret 또는 동등한 server-only 저장소로 이동하고 Desktop·Git·공용 seed에서 제거한다.
   - Google OAuth는 Desktop PKCE/loopback 또는 server broker 중 제품에 맞는 방식을 결정하고, 사용자 refresh token은 장기적으로 OS 보안 저장소로 이전한다.
   - 마이그레이션 전 기능 의존성을 확인하고, 이전 완료 후 노출 가능성이 있던 자격증명을 교체하며 Local·Development·Production 회귀 테스트를 수행한다.

## P1 — 다음 개발 우선순위

1. 개발·운영 환경 분리
   - `local / development / production`의 세 환경을 기본으로 하고, 별도 staging은 팀·배포 규모가 필요할 때 추가한다.
   - 현재 `BlogPostingQuota` Supabase project는 production으로 명시하고 일상 개발과 테스트에서 직접 사용하지 않는다.
   - 로컬 Supabase CLI stack을 day-to-day 개발과 자동 테스트의 기본으로 삼고, schema migration과 비식별 seed만으로 언제든 재생성할 수 있게 한다.
   - 외부 webhook, Edge Function, 원격 모바일 연결처럼 local로 충분하지 않은 통합 테스트에는 별도의 hosted development Supabase project를 사용한다.
   - 현재 수동 `sql/*.sql` 적용 상태를 조사해 production schema를 기준으로 baseline을 만들고, 이후 변경은 순서가 있는 `supabase/migrations/`로 관리한다.
   - `supabase/seed.sql`에는 가짜 account·license·plan·usage·recommendation·billing 자료만 두고 production 사용자, 이메일, HWID, secret과 결제 정보를 복사하지 않는다.
   - 앱 runtime은 명시적인 environment profile에서 Supabase URL과 publishable key를 선택하며 개발 build가 production endpoint를 기본값으로 사용하지 않게 한다.
   - service-role, provider secret, webhook secret과 billing key는 각 환경의 server secret store에만 두고 앱·Git·공용 seed에 포함하지 않는다.
   - CLI와 배포 script는 `--target local|development|production`을 요구하고 실행 전 environment, project name과 project ref를 표시한다.
   - destructive reset, seed, test policy와 fixture 작업은 production에서 fail-closed하고 production 변경은 별도 확인과 명시적 release action이 있어야 실행한다.
   - Git feature parent/sub-feature는 local 검증, `dev`는 development 통합 검증, 승인된 `release/*` 또는 `main`만 production 승격 후보로 취급한다.
   - DB migration, Edge Function, secrets, Auth·Storage 정책과 Cron 배포를 같은 environment manifest/checklist로 관리하고 schema drift를 검사한다.
   - development에서는 PortOne test channel·webhook, 낮은 외부 provider budget, email/Telegram sink와 발행 차단 capability를 사용해 실제 결제·알림·발행을 방지한다.
   - 완료 기준은 `local db reset → 자동 테스트 → development 배포·통합 테스트 → 동일 migration의 production dry-run·승인 배포`가 재현되는 것이다.

2. 실행형 Dashboard와 모바일 정보 구조
   - 단순 누적 통계보다 지금 확인하거나 처리할 일을 우선한다.
   - 발행 실패·연결 문제·설정 누락, 오늘의 작성·임시 저장·발행·예약, 다음 예약과 최근 중단 작업을 한 화면에 정리한다.
   - 실패·중단·예약 항목에서 재시도, 이어서 작성, 설정 화면으로 바로 이동할 수 있게 한다.
   - `뜻밖의 발견`과 플랜별 잔여량을 같은 화면에서 과도한 정보 없이 연결한다.
   - 이후 BlogAnywhere에서 그대로 사용할 수 있도록 처음부터 모바일 우선의 카드와 액션 구조로 설계한다.

3. BlogAnywhere 기반과 사용자 범위
   - 초기 제품 계약은 `PC BlogGenius가 켜져 있는 동안 모바일에서 연결하는 companion`으로 확정한다.
   - 모바일은 전체 설정 복제가 아니라 상태 확인, 빠른 글감 저장, 초안 작성, 간단한 수정, 미리보기, 임시 저장·예약·발행과 실패 확인에 집중한다.
   - AI Key, 네이버 로그인과 발행 자격증명은 PC에 유지하고 모바일이나 중계 계층에 복제하지 않는다.
   - PC가 꺼진 상태의 생성·발행과 완전한 cloud execution은 초기 범위에서 제외하고 실제 수요를 확인한 뒤 검토한다.
   - `BlogAnywhere`는 우선 기능 concept으로 사용하며 별도 제품·앱 이름으로 분리할지는 사용성이 검증된 뒤 결정한다.
   - 첫 vertical slice는 `휴대폰 연결 → 주제·지시 입력 → 초안 저장 → PC에서 이어서 확인`으로 제한한다.
   - pairing 성공률, 모바일 초안 저장 성공률과 PC·모바일 간 이어서 하기 비율을 다음 단계 확장의 판단 근거로 삼는다.

4. BlogAnywhere 모바일 Web/PWA
   - 기존 Web UI를 재사용하되 홈, 글감, 빠른 글 작성, 미리보기, 발행 확인과 작업 결과에 한정한 모바일 화면을 제공한다.
   - 홈 화면 설치, 독립 실행, 느리거나 끊긴 네트워크에서 작성 중인 입력 보존을 지원하는 PWA 기반을 검토한다.
   - 작은 화면에서 긴 표와 전체 설정을 축소해 억지로 제공하지 않고 모바일 목적에 맞는 카드·편집·액션 흐름을 만든다.
   - 네이티브 iOS·Android 앱은 공유 메뉴, push, 카메라, offline 요구가 충분히 확인된 이후 기존 Web UI를 감싸는 방식을 우선 검토한다.

5. BlogAnywhere 안전한 PC 연결
   - 개발자·고급 사용자용 첫 검증은 Tailscale 또는 동등한 private network/Serve 방식으로 진행한다.
   - `0.0.0.0` UI 서버를 공용 인터넷에 직접 노출하는 방식은 제품 경로로 사용하지 않는다.
   - 연결 transport와 무관한 기기 pairing, 만료·폐기 가능한 access token, HTTPS, owner 확인과 capability 기반 권한 계약을 먼저 정의한다.
   - 모바일에는 필요한 최소 결과만 반환하고 API Key, 로그인 cookie, 원본 secret과 무제한 내부 API를 노출하지 않는다.
   - 일반 사용자 단계에서는 Tailscale 설치가 필수가 되지 않도록 PC의 outbound 연결을 사용하는 안전한 relay를 후속 선택지로 검토한다.

6. Telegram companion 재정의
   - Telegram을 긴 글 편집이나 전체 설정 UI가 아니라 선택 가능한 channel adapter로 유지한다.
   - 텍스트·URL·사진·음성 메모의 빠른 글감 저장, 발행 성공·실패 알림, 예약 확인과 단순 승인에 집중한다.
   - 복잡한 작업은 inline button이나 `모바일에서 계속 작성` 링크를 통해 BlogAnywhere 화면으로 넘긴다.
   - 기존 명령을 늘리기 전에 사용 빈도가 낮은 원인을 확인하고, 명령 암기 없이 사용할 수 있는 최소 메뉴와 자연어 입력을 제공한다.

7. AI 작업 도우미 MVP
   - 범용 채팅창이 아니라 BlogGenius의 현재 상태를 설명하고 다음 작업을 준비·실행하는 도우미로 정의한다.
   - 첫 단계는 발행·예약·실패·잔여량 조회, 화면 이동과 `오늘 무엇을 하면 되는지` 안내 같은 read-first 작업으로 제한한다.
   - 이후 글감 추천, 초안 준비와 프로필 적용을 추가하고, 설정 변경·예약·발행은 항상 preview와 사용자 confirmation을 거친다.
   - 단순 상태 조회와 결정 가능한 명령은 AI 없이 처리하고 자연어 해석·생성에만 Chat Model을 사용한다.
   - Desktop과 BlogAnywhere가 같은 Agent Runtime, Capability Registry, Memory와 confirmation 계약을 사용하게 한다.

8. 유료화 정책 확정과 PortOne V2 연동
   - 사용자에게 `구독 = 기능 권한과 월 기본 제공량`, `크레딧 = 현재 플랜 안에서 사용하는 추가 발행 횟수`로 단순하게 설명한다.
   - 결제 전에 유료 권한의 소유자를 account, verified email, license와 어떻게 연결하고 기기 변경·복구할지 확정한다.
   - PortOne V2를 첫 provider adapter로 검토하되 실제 PG 계약, 정기결제·빌링키 지원, 심사 조건, 수수료와 정산 조건을 먼저 확인한다.
   - 첫 vertical slice는 `크레딧 상품 선택 → 1회 결제 → 서버 검증 → credit ledger 적립 → 앱 잔여량 갱신`으로 제한한다.
   - 1회 결제의 주문·검증·중복 방지·취소 흐름이 안정화된 뒤 빌링키 발급, 정기 청구, 해지 예약과 결제 실패 복구를 추가한다.
   - Desktop은 안전한 Web 결제 화면만 열고 PortOne secret, billing key, webhook 검증과 entitlement 반영은 Supabase Edge Function과 서버 저장소가 담당한다.
   - 성공 redirect나 클라이언트 응답만으로 결제를 확정하지 않고 서버의 결제 조회와 검증된 webhook을 최종 근거로 사용한다.
   - 모든 주문·webhook·구독 변경·credit 적립은 idempotency key와 감사 가능한 event/ledger를 사용한다.
   - 환불, 청약철회, 일부 사용 크레딧, chargeback, 미납 grace period와 구독 종료 시점은 출시 전에 정책·약관·법적 검토를 거쳐 확정한다.
   - 테스트 결제, 중복 webhook, 앱 종료 후 복귀, 결제 성공 후 entitlement 반영 지연과 일일 대사를 운영 시나리오로 검증한다.

9. 뜻밖의 발견 품질과 관측성
   - 저장·작성·발행 이력의 가중치와 source diversity를 실제 사용 결과로 조정한다.
   - 후보가 부족할 때 약한 소재를 억지로 채우지 않고 명확한 빈 상태를 제공한다.
   - fallback 제목을 주제 유형별로 자연스럽게 개선한다.
   - 추천 근거에서 원본 활동 시점과 Knowledge 출처를 이해하기 쉽게 보여준다.
   - 동음이의어인 영화·제품·인물 등을 구분하는 topic semantics를 검토한다.
   - 추천 funnel, provider 비용, cache, 중복·고아 recommendation을 진단할 수 있게 한다.

10. AI runtime capability 자동 탐지와 자기복구
   - provider metadata에서 모델, 생성 방식, thinking 지원과 토큰 한도를 우선 확인한다.
   - metadata에 없는 모델별 정책만 trusted catalog로 보완한다.
   - 구조화된 capability 불일치에 한해 안전한 지원 단계로 한 번 재시도한다.
   - 인증·quota·일반 요청 오류와 capability 불일치를 엄격히 구분한다.
   - 확인된 runtime policy를 모델·API 버전 단위로 bounded cache하고 안전한 진단 로그를 남긴다.

11. Internal API 통합
   - Telegram legacy callback을 canonical content request/capability 경로로 더 얇게 만든다.
   - content request bundle의 schema와 validator를 공용 internal API 계약으로 승격한다.
   - Desktop UI, BlogAnywhere, MCP와 Telegram이 같은 preview/confirmation/result 계약을 사용하게 한다.
   - 로그인, 시트, AI 모델, 필수 설정과 발행 대상을 한 번에 진단하고 해결 화면이나 안전한 capability로 연결한다.

12. 최초 설치와 오류 UX
   - Dashboard의 라이선스·연결 오류를 부분 상태로 표시한다.
   - quota 소진 메시지에 사용자가 취할 다음 행동을 명확히 안내한다.
   - sample placeholder가 실제 설정값처럼 동작하지 않도록 한다.
   - Gemini API Key 등 필수 외부 설정의 공식 도움 경로를 제공한다.

13. macOS 설정 접근 실패 시작 오류 패치
   - Downloads 등 macOS 보호 폴더에서 외부 `config/` 접근이 `EPERM`으로 거부되어도 Electron main process가 종료되지 않게 한다.
   - GUI runtime의 쓰기 가능한 기본 위치는 `Application Support`로 일관되게 사용하고, portable mode는 명시적으로 선택된 경우에만 활성화하는 방향을 검토한다.
   - 배포본 안에 읽기 전용 기본 설정을 확실히 포함하고, 사용자 설정을 읽지 못하면 빈 객체 대신 검증된 기본값과 원인을 알 수 있는 오류 상태를 반환한다.
   - `platforms.naver` 같은 필수 설정 경로를 사용 전에 검증하고, 권한 복구 또는 데이터 위치 이동 안내를 제공한다.
   - 기존 portable 사용자 데이터의 소유권과 이동·rollback 방식을 정한 뒤 patch release 범위로 구현하고 macOS 패키지 회귀 테스트를 추가한다.

## P2 — 중기

1. UI 포트 충돌 복구
   - 설정 포트가 사용 중이면 원인과 점유 상태를 안내한다.
   - 사용자가 확인할 수 있는 대체 포트 재시도 흐름을 제공한다.

2. BlogAnywhere 연결 제품화
   - Tailscale 기반 pilot의 연결 성공률, 설정 난이도와 실제 사용 빈도를 확인한다.
   - 일반 사용자용 device pairing과 relay가 필요한지, PC가 꺼진 상태의 cloud execution 수요가 충분한지 판단한다.
   - 모바일 push, share target, camera와 offline 작성 요구를 근거로 네이티브 wrapper 필요성을 결정한다.

3. 발행 플랫폼 확장 계약
   - 새 플랫폼을 UI와 발행 분기에 직접 추가하지 않고 `platform adapter + auth + renderer + asset transport + publish result` 계약으로 분리한다.
   - 플랫폼별로 인증, 글 생성, 초안, 예약, 수정, 삭제, 카테고리·태그, 이미지 업로드와 결과 URL 지원 여부를 capability matrix로 관리한다.
   - 같은 글을 여러 플랫폼에 발행할 때 하나의 operation/quota를 유지하고 플랫폼별 성공·실패와 재시도를 독립적으로 기록한다.
   - 플랫폼이 지원하지 않는 기능은 조용히 생략하지 않고 실행 전에 차이와 fallback을 사용자에게 보여준다.
   - Naver와 WordPress를 먼저 공통 adapter 계약의 기준 구현으로 정리한 뒤 Tistory·Blogger를 추가한다.

4. Tistory 지원 가능성 검증
   - 2024년에 종료된 Tistory Open API를 제품 경로로 사용하거나 비공식적으로 복원하지 않는다.
   - 별도 development 계정·테스트 블로그에서 로그인, 에디터 진입, 본문·이미지 입력, 초안 저장과 발행의 browser automation PoC를 먼저 수행한다.
   - 에디터 DOM 변경, 로그인·보안 확인, 예약·카테고리·태그와 이미지 업로드 안정성 및 서비스 정책을 검토한 뒤 정식 지원 여부를 결정한다.
   - 자동화가 안정적이지 않으면 `Tistory용 HTML/Markdown + 이미지 묶음 내보내기`와 에디터 열기·붙여넣기 같은 manual handoff를 첫 지원으로 제공한다.
   - 사용자 계정 정보와 session은 PC에만 보관하고 BlogAnywhere나 서버로 전달하지 않는다.

5. Google Blogger 지원 가능성 검증
   - Blogger API v3와 OAuth 2.0으로 블로그 조회, 글 생성, draft, 수정, 발행과 결과 URL을 전용 development 계정에서 검증한다.
   - 공식 Posts API에 별도 media upload가 없으므로 `images[]` 응답 필드를 이미지 업로드 기능으로 오해하지 않는다.
   - 외부 공개 이미지 URL을 사용할 경우 WordPress에 종속되지 않는 asset storage, 접근 권한, 비용, 보존·삭제와 게시물 수명주기 계약을 먼저 정의한다.
   - 외부 asset storage 없이 text-only/draft-only 지원이 사용자에게 충분한지 실제 수요를 확인하고, 충분하지 않으면 정식 지원을 보류한다.
   - Blogger Web UI의 이미지 업로드를 browser automation으로 보완하는 혼합 방식은 별도 PoC로 검증하되 기본 경로로 가정하지 않는다.

6. 블로그 목록·검색 UX
   - 텍스트 컬럼 inline edit의 저장·실패 안내와 실행 중 편집 잠금을 정리한다.
   - Trends/Keywords/Topics의 상태·자유검색과 Enter 동작을 통일한다.
   - 탭 이동 후에도 검색 조건을 유지하는 방안을 검토한다.

7. 실행 로그 UX
   - 새 작업 시작 시 runtime 상태 초기화 규칙을 유지한다.
   - 결과 요약 카드와 장기 이력의 역할을 분리한다.

8. Trends 날짜 선택
   - 텍스트 입력을 달력 중심 UI로 바꾸고 `어제` 빠른 선택을 제공한다.
   - 선택 날짜와 확인 문구를 다른 화면과 일관되게 맞춘다.

9. 쇼핑 빠른발행 미리보기 재설계
   - 자동 blur 호출 없이 수동 `미리보기` 버튼으로만 실행한다.
   - headless 해석을 사용하고 실패가 발행을 막지 않게 한다.
   - 결과는 썸네일 중심의 간결한 카드로 표시한다.

10. Remote MCP 고도화
   - Streamable HTTP transport, 인증, 재연결과 confirmation 복구를 설계한다.
   - App 수명주기와 endpoint 상태 표시를 capability 경계 안에서 연결한다.

11. 통합 명령 팔레트
   - 주요 화면 이동과 자주 쓰는 작업을 검색·실행한다.
   - 기존 capability와 안전한 UI action만 노출한다.

12. Dockerize 개발·서비스 실행 환경
   - Electron Desktop과 로컬 브라우저 자동화를 무리하게 하나의 container에 넣지 않고, 먼저 Supabase·서버·worker 등 headless 구성요소의 container 경계를 정한다.
   - local 개발 환경을 재현할 수 있는 Docker Compose 진입점과 명시적인 environment profile을 제공한다.
   - source, config, workspace, cache와 secret의 volume·소유권을 분리하고 production credential을 image나 repository에 포함하지 않는다.
   - health check, 의존 서비스 기동 순서, migration·seed 실행과 로그 수집을 자동화한다.
   - macOS arm64와 CI/Linux 환경에서 동일한 build·test가 가능한지 검증하고, image version과 앱 release version의 관계를 문서화한다.

## P3 — 후순위

1. 동일 네트워크 접근 안전성
   - 기존 선택형 `0.0.0.0` 바인딩은 같은 네트워크의 제한된 진단·개발 용도로만 유지한다.
   - 활성화 전 명확한 보안 경고, 접근 인증, 표시 주소와 해제 흐름을 보완한다.
   - 공용 인터넷 연결은 이 경로를 확장하지 않고 BlogAnywhere의 별도 인증·relay 계약을 사용한다.

2. 글쓰기 스트릭
   - 저장·발행 같은 의미 있는 완료 이벤트만 집계한다.
   - 점수와 배지 중심의 과도한 게임화는 피한다.

3. Theme system
   - 기존 색상·배경·테두리·텍스트 값을 design token으로 정리한다.
   - 첫 범위는 `시스템 설정 따르기 / 밝은 테마 / 어두운 테마`로 제한한다.
   - 새로운 테마는 모든 주요 화면의 가독성·대비·상태 표현 회귀를 확인할 수 있을 때만 추가한다.
   - 계절·시간대 분위기는 시계·타이머와 연결되는 선택적 시각 변화로 한정하고 무거운 테마 편집기로 확장하지 않는다.

## v0.3.0에서 완료된 주요 항목

- 기본/내 프로필을 분리한 전역 글쓰기 프로필을 구현했다.
- 문체, 전략, 블로그 구성과 추가 작성 원칙을 블로그·쇼핑 생성 경로에 안전하게 적용했다.
- 참고 글 붙여넣기와 단일 블로그 URL 분석, KST 분석 시각과 실제 모델 정보 표시를 구현했다.
- AI 적용 미리보기의 길이 허용, 줄바꿈 렌더링, 진행 표시와 실패 격리를 정리했다.
- 개별 글 이미지 처리를 `이미지 생성 / 프롬프트 포함 / 프롬프트 미포함`으로 통일했다.
- Dashboard `뜻밖의 발견` 센터, 시작 시 갱신, 근거 표시, 적용·관심 없음과 후속 보충을 구현했다.
- 사용자 기록을 그대로 반복하지 않고 이어 쓰거나 확장할 소재로 변환했다.
- 새로운 발견 진행 상태를 버튼에서 표시하고 발견 뉴스 제목을 AI 비용 없이 한국어로 검증한다.
- 키워드 기반 AI 제목 추천 결과가 생성되면 결과 영역으로 자동 이동한다.
- UI JavaScript와 CSS를 기능별 모듈로 분리하고 구조·중복·참조 검증을 자동화했다.

## v0.2.0에서 완료되거나 대체된 항목

- 기본 실행을 Electron UI로 전환하고 CLI Web UI의 자동 열기와 `--no-open`을 지원했다.
- `LISTEN_HOST`와 `LISTEN_PORT`를 설정 UI와 실행 인자에서 지원했다.
- Trends, Topics, Shopping 목록에 limit/offset 페이지 이동을 적용했다.
- 개인화 글감 추천, 근거 표시, 저장·선택·발행 outcome 학습과 네이버 트렌드를 연결했다.
