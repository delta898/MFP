# BlogGenius Backlog

> 현행 기준: 2026-09-07 · 최신 릴리스: `v0.4.3` · 다음 버전: 미정

이 문서는 현재 실행 가능한 일감만 관리한다. 완료된 구현 과정은 `docs/plans/archive/`, 안정된 현재
계약은 `docs/architecture/`, `docs/features/`, `docs/decisions/`를 따른다.

## P0 — 기반과 운영 마무리

1. 새 개발 PC Bootstrap 자동화
   - Node/npm, Docker, Supabase CLI, `npm ci`, runtime config, Local Supabase, Development 설정과
     Google OAuth build input의 준비 여부를 값 노출 없이 확인하는 `bootstrap:check`를 제공한다.
   - PC별 설정·사용자 로그인을 환경 공용 migration·Function·server secret과 구분한다.
   - Local/Development 준비 명령과 간결한 한글 가이드를 제공한다.
   - Production 사용자 자료, credential, license와 secret은 개발 PC로 복사하지 않는다.

2. Production migration ledger 정합화
   - Production 실제 schema와 canonical migration을 read-only evidence로 먼저 비교한다.
   - 이미 적용됐음이 입증된 migration만 이력에 반영하며 drift를 숨기기 위한 임의 repair를 금지한다.
   - `db push --dry-run`이 실제 신규 migration만 표시하는 상태를 복구한다.
   - 이력 repair와 후속 Production 변경은 명시적 승인과 감사 기록을 거친다.

3. Production Runtime Credential 전환 마무리
   - Desktop, Local과 Development의 credential 경계 전환은 완료된 것으로 본다.
   - Production migration ledger가 신뢰 가능한 상태가 된 뒤 cutover artifact와 구버전 호환 정책을
     검토한다.
   - 승인된 Runtime Config allowlist 적용, legacy Google/Naver credential row 제거, 노출 가능 credential
     회전과 secret-free read-only smoke를 진행한다.
   - Production migration, Function, Secret, row 삭제와 credential 회전은 각각 별도 승인 없이 실행하지
     않는다.

4. 릴리스 빌드 필수 설정 사전검증
   - GitHub Release 생성과 packaging matrix 시작 전에 필수 Repository Variables·Secrets를 검증한다.
   - 태그, package/lockfile 버전, 지원 OS 정책과 비어 있지 않은 `CHANGELOG.md` 버전 항목을 같은
     관문에서 확인한다.
   - secret 원문 없이 누락·오류 설정 이름과 해결 방향만 보여준다.
   - 사전검증 실패 시 빈 Release를 만들기 전에 중단한다.

5. Trends Production 운영 마무리
   - 중복 실행 lock, 실패 알림과 제한된 재시도 정책을 정한 뒤 정기 수집 자동화를 등록한다.
   - 안정화 기간 후 legacy host `4581` systemd rollback 서비스를 제거하고 Trends API·Collector·
     WordPress token을 함께 회전한다.
   - GHCR image build·배포 자동화는 독립적으로 검토 가능한 단계로 진행한다.

6. SerpApi 정기 수집 관찰 마무리
   - 첫 실행을 포함한 최근 Cron 결과, budget 변화, lease 해제, sanitized run 기록과 corpus freshness를
     credential·원문 노출 없이 확인한다.
   - canonical 운영 문서를 갱신하고 승인 후 남은 Stage 7과 main plan을 archive한다.

## P1 — 핵심 제품 일감

1. 글쓰기 완료 목록과 결과 이어보기
   - 대기·진행 중 작업과 구분되는 전용 완료 이력을 제공한다.
   - 임시 저장, 예약, 공개 발행과 플랫폼별 성공·실패를 구분한다.
   - 앱 재시작 후에도 중복 없이 재구성 가능한 canonical 결과를 사용한다.
   - 결과 열기, 실패 확인, 안전한 재시도와 새 글의 참고 원문 사용을 지원한다.

2. 실행 중 작업 취소와 안전한 복구
   - AI, 이미지, 탐색, 댓글과 발행 작업에 공통 취소 신호를 추가한다.
   - provider가 활성 요청 취소를 지원하지 않아도 후속 단계와 결과 반영을 중단한다.
   - 완료된 유효 결과, 현재 입력과 대기열을 보존하고 중복 실행 lock을 반드시 해제한다.
   - `취소 요청 중`, `취소 완료`, 취소 불가능한 최종 발행 단계를 구분한다.

3. 공통 발행 action-state 계약
   - 블로그, 쇼핑, 카드뉴스와 SNS에 흩어진 실행 lock과 busy 상태를 하나의 재사용 계약으로 통합한다.
   - 발행 가능, 실행 중, 완료, 일부 실패와 실패 상태를 일관되게 표현한다.
   - 의미 있는 입력·대상 변경 후에만 다시 활성화하고 안전한 재시도 대상을 구분한다.

4. 쇼핑커넥트 흐름 고도화
   - 상품 등록, 분석, 원고 준비, 대기 상태와 발행을 쇼핑 고유 정보 중심으로 재설계한다.
   - 기존 발행 계약과 저장 자료, rollback 경로를 유지하면서 단계적으로 교체한다.

5. 뜻밖의 발견 품질과 관측성
   - 실제 결과를 바탕으로 활동 가중치와 source diversity를 조정한다.
   - 약한 후보를 채우기보다 명확한 빈 상태를 제공한다.
   - fallback 제목, 근거 시점·출처 설명과 동음이의어 topic semantics를 개선한다.
   - 추천 funnel, provider 비용, cache, 중복과 고아 recommendation 진단을 제공한다.

6. AI runtime capability 자동 탐지와 자기복구
   - 모델, 생성 방식, thinking 지원과 token 한도는 provider metadata를 우선한다.
   - metadata에 없는 값만 trusted catalog로 보완하고 구조화된 capability 불일치에 한해 한 번 재시도한다.
   - 인증·quota·일반 오류와 capability 불일치를 엄격히 구분한다.

7. Internal API 통합
   - canonical content request bundle과 validator를 공용 internal API 계약으로 승격한다.
   - Desktop, BlogAnywhere, MCP와 Telegram이 같은 query, preview, confirmation, execution과 result 경계를
     사용하게 한다.
   - Telegram은 business logic이 아닌 얇은 channel adapter로 유지한다.

8. 전역 새 글 작성 키보드 단축키
   - Electron 파일 메뉴 action과 새 블로그 입력 focus 이동은 이미 구현되어 있다.
   - 입력창, modal과 저장하지 않은 설정의 충돌을 검증한 뒤 `CmdOrCtrl+N`과 메뉴 표시를 추가한다.

9. 제목 결과 학습
   - 배포된 검색·발견 중심 호기심 전략은 완료된 기준선으로 본다.
   - 서로 다른 각도의 제목 후보를 제공하고 명시적인 선택·수정과 검증된 콘텐츠 결과에서만 학습한다.

10. 원고 작업공간 통합과 로컬 이미지 연결
   - `원고 폴더`와 `원고 붙여넣기`는 source를 넣는 방식만 다른 진입점으로 두고, 이후의 원고 수정,
     validation, preview, 이미지 관리, 발행 설정과 실행은 하나의 재사용 가능한 원고 작업공간 계약으로 통합한다.
   - 폴더에서 불러온 Markdown도 작업공간에서 수정할 수 있게 하되 원본 파일을 암묵적으로 덮어쓰지 않고,
     현재 발행본의 편집 상태와 원본 복원 경계를 명확히 한다.
   - Markdown의 이미지 block별로 로컬 이미지를 선택하고 누락 이미지를 채우며 기존 이미지를 교체할 수 있게 한다.
     미리보기는 즉시 갱신하고 실제 발행 workspace와 두 플랫폼 payload에도 같은 이미지가 사용되어야 한다.
   - 이미지 결정 우선순위는 `사용자 선택 → 원고 폴더 이미지 → 이미지 생성 → 이미지 없음`으로 명시하고,
     교체 취소 시 folder mode는 원본 이미지로, paste mode는 미선택 상태로 되돌린다.
   - 미리보기는 결과 확인 역할을 유지하고 실제 편집은 공통 `이미지 관리` 영역이 소유한다. 필요하면 미리보기의
     이미지 위치에서 해당 관리 항목으로 이동시키되 양쪽에 같은 편집 control을 중복하지 않는다.
   - 첫 reviewable slice는 두 mode의 누락 이미지 연결과 `선택 → 미리보기 갱신 → 실제 발행 사용`을 끝까지
     검증한다. 이후 기존 이미지 교체·복원, 파일 형식·크기 검증과 session 수명·저장 정책을 확장한다.
   - preview 요청에는 원본 binary를 반복 전송하지 않고 식별·검증 metadata만 사용하며, 실제 실행 시 필요한
     asset만 전달한다. image object URL 해제, mode 전환 중 상태 보존과 실패 시 마지막 유효 preview 보존을 검증한다.

## P2 — 제품 확장과 유지보수

1. BlogAnywhere companion
   - PC 앱이 켜져 있고 AI Key, 네이버 로그인과 발행 credential을 소유하는 companion 계약으로 시작한다.
   - 첫 vertical slice는 `휴대폰 연결 → 주제·지시 입력 → 초안 저장 → PC에서 이어서 확인`으로 제한한다.
   - 모바일 우선 Web/PWA와 private-network pilot을 검증한 뒤 relay, cloud execution, push와 native wrapper를
     판단한다.

2. Telegram companion 재정의
   - 빠른 글감 저장, 결과 알림, 단순 승인과 복잡한 작업의 BlogAnywhere handoff에 집중한다.

3. AI 작업 도우미 MVP
   - 상태·잔여량·실패·예약 조회와 화면 이동 같은 read-first 작업으로 시작한다.
   - 설정, 예약, 사용량 소비와 발행은 preview와 confirmation을 필수로 한다.

4. 유료화·PortOne V2·Backoffice
   - 구현 전에 account 소유권·복구, 상품 정책, PG 조건, 환불과 법적 요구사항을 확정한다.
   - 첫 결제 범위는 `1회 credit 주문 → 서버 검증 → idempotent ledger 적립 → 앱 잔여량 갱신`이다.
   - 운영자 접근은 일반 UI와 분리하고 최소 권한, 감사 로그, preview와 환경 구분을 적용한다.

5. 릴리스·runtime 유지보수
   - installer/launcher 껍데기와 교체 가능한 앱 payload를 서명 manifest, atomic 교체와 rollback으로 분리한다.
   - Windows Electron/Kuzu AgentMemory 제한을 검증된 binary 또는 유지되는 durable store 교체로 해결한다.
   - 공통 graceful shutdown coordinator를 도입하고 검증된 Supabase SDK 갱신으로 `punycode` 경고를 제거한다.
   - Electron과 브라우저 자동화를 강제로 container화하지 않고 headless 서비스의 Docker Compose 경계를
     정의한다.

6. 발행 플랫폼 adapter 계약
   - 플랫폼 auth, renderer, asset transport, 지원 capability와 publish result를 분리한다.
   - Naver·WordPress를 먼저 정규화한 뒤 별도 development 계정으로 Tistory automation/manual export와
     Blogger API 지원 가능성을 검증한다.

7. 집중 UX 후속
   - UI port 충돌 진단과 확인 가능한 대체 port 재시도
   - 블로그 목록·검색 일관성, 조건 유지, inline edit 안내와 실행 중 잠금
   - 결과 요약과 장기 실행 로그의 역할 분리
   - 달력 중심 Trends 날짜 선택과 `어제` 빠른 동작
   - 수동 실행·실패 격리를 적용한 쇼핑 미리보기
   - native date/time picker trigger의 브라우저 소유 focus 색은 known issue로 유지한다. 향후 정확한 style 통일이 필요할 때만 접근 가능한 custom trigger 도입을 검토한다.

8. Remote MCP와 명령 접근
   - Streamable HTTP transport, 인증, 재연결, confirmation 복구와 수명주기 상태를 capability 경계에 둔다.
   - 안전한 화면 이동과 기존 capability만 제공하는 통합 명령 팔레트를 검토한다.

9. 선택적 유통·커머스 확장
   - freshness와 출처 검증을 포함하는 여행 제휴·상품 adapter
   - 원문 URL을 보존하고 실패를 격리하는 선택적 Bitly 단축

## P3 — 후순위 탐색

1. 동일 네트워크 접근 안전성
   - `0.0.0.0` binding은 명시적 진단 용도와 인증·경고에 한정하고 BlogAnywhere의 공용 연결 경로로
     확장하지 않는다.

2. 글쓰기 스트릭
   - 의미 있는 저장·발행 완료 이벤트만 집계하고 점수 중심의 과도한 게임화를 피한다.

3. Theme system
   - design token을 먼저 정리한 뒤 시스템/밝음/어두움 테마와 주요 화면의 가독성·상태 대비를 검증한다.

## 완료된 기준선

새로운 구체적 결함이 확인되지 않는 한 다음 항목을 포괄적인 미완료 일감으로 다시 등록하지 않는다.

- Local/Development/Production 환경 분리와 fail-closed 승격 관문
- 연속 발행과 정식 `블로그` 작업 흐름
- Dashboard 운영 상태·통계·최근 결과·연결 상태·뜻밖의 발견·온보딩·Help 연결
- Electron 44와 macOS 13+ Apple Silicon·Windows x64 릴리스 대상
- 배포본 최초 실행 기본값과 macOS 보호 경로/App Translocation 시작 오류 복구
- 검색·발견 중심 제목 호기심 전략
- Dashboard 네이버·WordPress 연결 상태 안정화
- 브라우저 세션 발행을 대체하는 네이버 OAuth2 제안은 결정에 따라 종료
