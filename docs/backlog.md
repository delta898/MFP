# BlogGenius Backlog

> 현행 기준: 2026-10-09 · 최신 릴리스: `v0.5.4`

이 문서는 현재 실행 가능한 일감만 관리한다. 완료된 구현 과정은 `docs/plans/archive/`, 안정된 현재
계약은 `docs/architecture/`, `docs/features/`, `docs/decisions/`를 따른다.

## P0 — 기반과 운영 마무리

1. 사용자 데이터 경로와 배포 패키지 정리
   - 앱 실행 파일/번들은 사용자가 선택한 설치 위치에 둔다.
   - `config/`는 Windows AppData 및 macOS Application Support 아래 `BlogGenius/` 사용자 데이터 영역에,
     `logs/`와 앱 내부 상태인 `data/`도 같은 앱 데이터 영역에 두는 방향으로 정리한다.
   - 사용자 작업물인 `workspace/`는 Documents 아래 `BlogGenius/workspace/`에 두는 방향으로 정리한다.
   - 배포 패키지에는 `config/`, `data/`, `logs/`, `workspace/` 사용자 데이터 디렉터리를 정적으로 포함하지
     않고, 앱이 실행된 뒤 실제로 필요한 디렉터리만 생성한다. 기본 이미지 등 읽기 전용 앱 리소스는 사용자
     데이터 디렉터리와 구별해 패키지에 포함하고 필요 시 초기화한다.
   - 현재는 사용자별 설치/실행 경로가 기본이므로 경로 전환을 즉시 진행할 필요는 없다. macOS 앱을
     `/Applications` 같은 시스템 공용 영역에서 실행하는 예외는 사용자 데이터 분리 필요성을 별도로 고려한다.
   - 기존 설치의 데이터 탐지, 복사/검증, 충돌 처리, 원본 보존·삭제와 사용자 안내를 포함한 migration 정책은
     후속 기획에서 결정한다. 이 항목의 합의는 목표 경로 방향이며 migration 세부안이나 구현 승인이 아니다.

2. 게시 성공 결과 스냅샷의 플랫폼별 보관
   - 성공한 포스팅(플랫폼 임시저장 포함)만 `workspace/wp_<wp>/` 또는 `workspace/naver_<id>/`에 보관한다.
   - BlogGenius는 post만 지원하고 update는 지원하지 않으므로 게시 성공 건마다 별도 스냅샷을 남긴다.
     같은 원고를 임시저장 후 정식 발행해 플랫폼에 두 글이 생기면 로컬에도 각각 보관한다.
   - 게시별 공유 ID는 `crypto.randomBytes(6)`의 Base64 URL-safe 인코딩 결과(8자)를 사용한다.
   - 게시 전 임시 산출물은 OS 임시 폴더 또는 다른 작업 경로를 사용할 수 있으며, 성공/실패 후 누적되지 않게
     정리한다.
   - 초안 작업 폴더는 앱 종료 때 일괄 삭제하지 않는다. 기존 만료 기간 기반 정리는 유지하며, 재실행 후
     초안 이어쓰기/복구 진입점은 별도 범위로 다룬다.

3. 새 개발 PC Bootstrap 자동화
   - Node/npm, Docker, Supabase CLI, `npm ci`, runtime config, Local Supabase, Development 설정과
     Google OAuth build input의 준비 여부를 값 노출 없이 확인하는 `bootstrap:check`를 제공한다.
   - PC별 설정·사용자 로그인을 환경 공용 migration·Function·server secret과 구분한다.
   - Local/Development 준비 명령과 간결한 한글 가이드를 제공한다.
   - Production 사용자 자료, credential, license와 secret은 개발 PC로 복사하지 않는다.

4. Production migration ledger 정합화
   - Production 실제 schema와 canonical migration을 read-only evidence로 먼저 비교한다.
   - 이미 적용됐음이 입증된 migration만 이력에 반영하며 drift를 숨기기 위한 임의 repair를 금지한다.
   - `db push --dry-run`이 실제 신규 migration만 표시하는 상태를 복구한다.
   - 이력 repair와 후속 Production 변경은 명시적 승인과 감사 기록을 거친다.

5. Production Runtime Credential 전환 마무리
   - Desktop, Local과 Development의 credential 경계 전환은 완료된 것으로 본다.
   - Production migration ledger가 신뢰 가능한 상태가 된 뒤 cutover artifact와 구버전 호환 정책을
     검토한다.
   - 승인된 Runtime Config allowlist 적용, legacy Google/Naver credential row 제거, 노출 가능 credential
     회전과 secret-free read-only smoke를 진행한다.
   - Production migration, Function, Secret, row 삭제와 credential 회전은 각각 별도 승인 없이 실행하지
     않는다.

6. 릴리스 빌드 필수 설정 사전검증
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

2. 발행 대기열 편집의 발행 대상 설정 보존
   - 편집 화면에서 발행 대상 설정이 누락되어 대기열 항목의 대상과 관련 설정을 확인하거나 조정하기 어렵다.
   - 대기열 항목의 저장 계약과 UI를 함께 검토해 대상 설정의 표시·보존·수정 동작을 정의한다.
   - 이번 통합 글쓰기 작업에서는 대기열 대상 설정 흐름을 변경하지 않는다.

3. 실행 중 작업 취소와 안전한 복구
   - AI, 이미지, 탐색, 댓글과 발행 작업에 공통 취소 신호를 추가한다.
   - provider가 활성 요청 취소를 지원하지 않아도 후속 단계와 결과 반영을 중단한다.
   - 완료된 유효 결과, 현재 입력과 대기열을 보존하고 중복 실행 lock을 반드시 해제한다.
   - `취소 요청 중`, `취소 완료`, 취소 불가능한 최종 발행 단계를 구분한다.
   - 현재 `블로그 Beta` AI 원고 생성 취소 단계는 별도 parent 개발 기록에서 마무리한다. KIE 이미지 폴링 중
     취소는 실사용 확인을 마쳤고, 모델 변경 후 새 생성은 후속 탐색으로 남긴다. 다른 작업 취소는
     그 뒤 독립된 범위로 확장한다.

4. 공통 발행 action-state 계약
   - 블로그, 쇼핑, 카드뉴스와 SNS에 흩어진 실행 lock과 busy 상태를 하나의 재사용 계약으로 통합한다.
   - 발행 가능, 실행 중, 완료, 일부 실패와 실패 상태를 일관되게 표현한다.
   - 의미 있는 입력·대상 변경 후에만 다시 활성화하고 안전한 재시도 대상을 구분한다.

5. 공통 페이지 셸과 레이아웃 블록 규격화
   - 대부분의 메뉴가 공유하는 Top Header, 선택적 탭, Body, 선택적 Action Footer, 공통 앱 Footer의 책임과 배치 규칙을 정의한다.
   - 반복되는 영역은 공통 컴포넌트와 스타일로 구현하되, 페이지별 콘텐츠·선택 상태·action은 슬롯으로 구성한다.
   - SNS 페이지를 첫 적용 사례로 검증하고, 예외와 반응형 규칙을 정리한 뒤 다른 메뉴에 단계적으로 적용한다.
   - 기존 페이지를 한 번에 교체하지 않고, 각 메뉴의 동작·스크롤 구조를 보존하며 점진적으로 전환한다.

6. 쇼핑커넥트 흐름 고도화
   - 상품 등록, 분석, 원고 준비, 대기 상태와 발행을 쇼핑 고유 정보 중심으로 재설계한다.
   - 기존 발행 계약과 저장 자료, rollback 경로를 유지하면서 단계적으로 교체한다.
   - 빠른 글 작성 결과에도 블로그와 같은 공통 원고 workspace를 연결해 본문·이미지 슬롯을 실제 발행 모습에 가깝게
     미리 보고, AI 생성·로컬 이미지 선택·제외·교체 결과가 최종 payload와 일치하게 한다.
   - 이미지가 비어 있으면 발행 시 자동 보정하고, 생성 실패로 prompt가 남는 경우에만 안전하게 임시 저장하는
     블로그 원고 정책을 재사용한다. 쇼핑 고유 상품 정보·표시 문구·링크는 별도 domain 정보로 유지한다.
   - 현재 `글감 관리` 화면과 저장 자료는 삭제하지 않고 UI 진입만 임시로 숨긴다. 빠른 글 작성의 `나중에 활용`,
     `글감 보관`, `발행 대기열에 추가`도 같은 기간 숨기고 바로 포스팅 흐름만 제공한다. 공통 미리보기와 쇼핑
     글감의 저장·대기·재진입 계약을 완성한 뒤 관리 화면과 저장 action을 함께 다시 노출한다.

7. 뜻밖의 발견 품질과 관측성
   - 실제 결과를 바탕으로 활동 가중치와 source diversity를 조정한다.
   - 약한 후보를 채우기보다 명확한 빈 상태를 제공한다.
   - fallback 제목, 근거 시점·출처 설명과 동음이의어 topic semantics를 개선한다.
   - 추천 funnel, provider 비용, cache, 중복과 고아 recommendation 진단을 제공한다.

8. AI provider transport 현대화와 지원 모델 discovery
   - 목표는 공식 SDK로 일괄 교체하는 것이 아니라, 공급자 API 변화에 안전하게 대응하면서 검증된 모델만
     BlogGenius에 빠르게 제공하는 것이다. 현재 `kind + provider + transport + config` 경계와 Supabase
     `ai_model_catalog_versions`를 유지한다.
   - Supabase 지원 카탈로그는 계속 제품 정책의 source of truth로 둔다. 공급자 Models API가 반환한 목록은
     `발견된 모델`일 뿐 `BlogGenius 지원 모델`로 간주하지 않으며, 새 항목을 자동으로 사용자 UI에 공개하지 않는다.
   - 실행 transport와 model metadata의 수명을 분리한다. 새 모델이 기존 allowlisted transport와 검증된 capability
     계약을 그대로 사용할 때는 원격 카탈로그만 갱신하고, endpoint·인증·request/response schema·streaming 방식이
     바뀌면 앱 release를 통해 새 transport adapter를 추가한다.

   **SDK 선택 정책**

   - 단순한 metadata 조회와 현재의 단일 응답 REST 호출은 직접 HTTP adapter를 유지할 수 있다. 요청 구조가 작고
     재시도·timeout·redaction·패키징을 BlogGenius가 더 명확하게 통제할 수 있기 때문이다.
   - streaming, 파일 수명주기, server-side conversation, tool/function calling, background operation, pagination처럼
     공급자 protocol 변화가 잦고 상태가 복잡한 기능은 공식 SDK를 우선 평가한다.
   - SDK 채택은 provider 전체가 아니라 transport 단위로 결정한다. Google, OpenAI, Anthropic SDK object나 오류를
     business layer에 노출하지 않고 공통 request/result/error/usage 계약으로 변환한다.
   - SDK version은 lockfile에 고정하고 major upgrade를 자동 허용하지 않는다. bundle 크기, transitive dependency,
     Node/Electron/pkg 호환성, 기본 retry·timeout, proxy와 IPv4/IPv6 동작을 release 전 검증한다.
   - SDK의 암묵적 retry와 BlogGenius retry가 중첩되지 않도록 단일 책임자를 정하고, 사용자에게 비용이 발생한 요청의
     attempt·provider request ID·usage를 중복 없이 기록한다.

   **공급자별 discovery와 transport 방향**

   - Google은 `models.list/get`의 model ID, 표시 이름, token 한도, `supportedGenerationMethods`, thinking과
     temperature metadata를 정기 수집한다. 현 `gemini_generate_content` REST transport는 안정 fallback으로
     유지하고, 신규 agent·stateful 기능은 `gemini_interactions` transport를 별도로 검증한다. Interactions 사용 시
     원격 대화 저장을 제품이 명시적으로 채택하기 전까지 `store:false`를 강제한다.
   - OpenAI는 `/v1/models`로 API Key에 보이는 모델 ID와 기본 lifecycle 정보를 수집하되, 이 응답만으로 Responses,
     Chat Completions, Images, structured output, reasoning과 입력 modality 지원을 추론하지 않는다. 공식 model 문서와
     검증된 trusted capability metadata를 결합하고, 신규 기능은 `openai_responses` 같은 명시적 transport로 분리한다.
   - Anthropic은 `/v1/models`의 model ID, 표시 이름, token 한도와 제공되는 capability metadata를 수집한다.
     Messages의 streaming·tool·thinking 기능에 SDK 이점이 확인되면 native Anthropic transport 내부에서만 SDK를
     사용하며 OpenAI compatibility를 canonical 계약으로 삼지 않는다.
   - Anthropic의 현재 `anthropic_openai_compat` transport에서 native Messages API transport로 전환한다.
     request/response·오류·usage 변환과 streaming/tool/thinking capability 차이를 공통 계약으로 검증하고,
     기존 catalog 모델을 단계적으로 이관한다. 이 작업 전까지 현재 호환 transport는 유지한다.
   - OpenAI-compatible direct provider는 `/models`가 있더라도 신뢰 가능한 capability 정보가 없을 수 있으므로
     사용자 입력 model ID의 존재 확인에만 사용한다. KIE.ai처럼 안정적인 per-model 목록 API가 없는 provider는
     account 연결 확인과 제품 검증 카탈로그를 분리한다.
   - 공식 참고 기준은 Google [Models API](https://ai.google.dev/api/models), OpenAI
     [Models API](https://platform.openai.com/docs/api-reference/models/object?lang=curl), Anthropic
     [List Models API](https://platform.claude.com/docs/en/api/models/list)로 둔다.

   **카탈로그 동기화와 승인 흐름**

   - server-side discovery job이 공급자별 전용 credential과 최소 read 권한으로 목록을 수집한다. Desktop 사용자의
     API Key를 Supabase로 전송하거나 중앙 discovery에 재사용하지 않는다.
   - 수집 결과는 provider 원문 snapshot, 수집 시각, model ID, provider lifecycle 정보와 fingerprint를 secret 없이
     보관하고 이전 snapshot과 비교해 `신규`, `metadata 변경`, `목록에서 사라짐`, `종료 예고`를 산출한다.
   - 새 모델은 `candidate` 검토 대기 상태로 만들고, kind, transport, capability, 표시 이름, 정렬, 비용/품질 역할,
     minimum app version과 fallback을 확인한 뒤에만 `active` 또는 `preview` snapshot에 승격한다.
   - 공급자 목록에서 일시적으로 사라졌다는 이유만으로 즉시 삭제하지 않는다. 반복 관찰, 공식 deprecation 자료와
     실제 metadata check를 결합해 `deprecated → hidden → unavailable` lifecycle을 적용한다.
   - 검토·승격·숨김은 actor, 시각, 근거 snapshot과 변경 전후 값을 감사 가능하게 남기고, 잘못된 catalog publish를
     이전 version으로 즉시 rollback할 수 있게 한다.
   - 앱은 `bundled fallback → 마지막 정상 cache → 검증된 Supabase snapshot` 순서의 현재 복구 계약을 유지한다.
     discovery 또는 Supabase 장애가 앱 시작, 설정 열기, 마지막 정상 모델 사용을 막지 않게 한다.

   **사용자 계정 가용성 확인**

   - 중앙 카탈로그의 `지원됨`과 사용자 API Key의 `접근 가능`을 분리한다. 설정 연결 확인 시 사용자의 기기에서
     provider `models.get/list` 또는 동등한 무료 metadata endpoint를 호출해 선택 모델 접근 여부를 확인한다.
   - 사용자 선택 목록은 기본적으로 검증된 Supabase catalog를 보여주고, 계정 확인 결과로 `사용 가능`, `권한 없음`,
     `지역/계정에서 보이지 않음`, `확인할 수 없음`을 표시한다. discovery 실패만으로 저장된 선택을 지우지 않는다.
   - model 목록에 존재한다는 사실은 생성 quota, billing, 모든 parameter 지원이나 실제 생성 성공을 보장하지 않는다고
     명시한다. 유료 generation smoke는 사용자가 명시적으로 실행할 때만 최소 요청으로 수행한다.

   **Runtime capability와 자기복구**

   - 모델, generation 방식, thinking/effort, structured output, 입력 modality와 token 한도는 신뢰 가능한 provider
     metadata를 우선하고, 제공되지 않는 값만 reviewed catalog로 보완한다.
   - request option은 catalog capability와 실제 provider metadata의 교집합으로 제한한다. 구조화된 capability 불일치가
     확인된 경우에만 안전한 parameter 제거 또는 fallback transport/model로 한 번 재시도한다.
   - 인증, 권한, quota/rate limit, model missing/deprecated, capability mismatch, schema incompatibility, 일시적 network
     오류를 구분하고 각각 다른 사용자 안내·retry·catalog health 신호를 사용한다.
   - 신규 transport는 텍스트, 구조화 JSON, 이미지, thinking, token usage, finish reason, safety block, timeout,
     rate limit과 malformed response fixture를 통과해야 한다. 기존 transport와 결과 품질·비용·latency를 비교하고
     staged rollout 후 기본값을 전환한다.

   **완료 기준과 비범위**

   - 공급자별 discovery adapter, normalized snapshot schema, diff/approval/publish/rollback 흐름, per-user availability
     check와 cache fallback이 자동 테스트로 검증되어야 한다.
   - 지원되지 않은 새 provider model이 자동 노출되지 않고, 구버전 앱이 이해하지 못하는 transport/capability를
     원격 catalog가 활성화할 수 없어야 한다.
   - 1차 완료 범위는 model discovery와 카탈로그 운영 안정화다. SDK 전면 교체, 모든 대화를 provider에 저장,
     provider 목록 전체 노출, 자동 비용 기반 model 선택은 포함하지 않는다.

7. Internal API 통합
   - Host Agent의 canonical content request planning contract를 기준으로 추가 채널 연결을 검토한다. 채널별 입출력 표현은 해당 adapter에 둔다.
   - Desktop, BlogAnywhere, MCP와 Telegram이 같은 query, preview, confirmation, execution과 result 경계를
     사용하게 한다.
   - Telegram은 business logic이 아닌 얇은 channel adapter로 유지한다.

8. 제목 결과 학습
   - 배포된 검색·발견 중심 호기심 전략은 완료된 기준선으로 본다.
   - 서로 다른 각도의 제목 후보를 제공하고 명시적인 선택·수정과 검증된 콘텐츠 결과에서만 학습한다.

9. 원고 작업공간 발행 검증과 편집 안정화
   - `v0.5.4`에서 통합된 바로 생성·원고 폴더·원고 붙여넣기의 공통 Draft를 기준으로, 보기와 네이버·WordPress
     발행 payload가 같은 최신 revision과 image manifest를 사용하는지 플랫폼별 계약 테스트로 확정한다.
   - 편집기가 지원하지만 발행 대상이 지원하지 않는 Markdown·서식·이미지 상태를 발행 전에 검출하고, 조용히
     제거하지 않은 채 변환 제안 또는 사용자 확인으로 연결한다.
   - 이미지 파일 형식·크기 검증, object URL 해제, source/mode 전환 중 상태 보존과 저장·생성 실패 시 마지막
     유효 원고·preview·asset 보존을 보강한다.
   - 같은 실행 세션의 자동 저장 범위와 수명을 먼저 확정한다. 앱 재시작 후 미완성 원고를 다시 찾는 기능은
     완료 결과 이력과 구분되는 별도 원고 재개 단계로 설계한다.

10. 원격 발행 누락 관측과 결과 확정
   - 관찰 중인 known issue: AI 본문·이미지 생성은 성공했지만 WordPress 임시 저장 또는 네이버 포스팅의
     원격 발행 요청이 실행되지 않은 것으로 보이는 사례가 있다.
   - 재현 자료를 모은 뒤 `생성 전용`, 실제 원격 발행, idempotency 재사용을 실행 모드·대상 플랫폼·작업 ID로
     구분해 기록한다. WordPress에는 post ID/URL, 네이버에는 post URL을 결과 증거로 남긴다.
   - 완료 UI와 Sheet 상태는 플랫폼별 원격 저장 성공 결과가 있을 때만 `임시 저장 완료`·`발행 완료`로 전환한다.
     생성만 마친 경우와 이전 성공 결과를 재사용한 경우는 각각 별도 상태와 안내로 표현한다.
   - 네이버와 WordPress 모두에서 실패·재시도·부분 성공과 중복 방지의 결과를 확인할 수 있는 focused regression을
     추가한다.

11. 기능별 실행 설정의 설정 소유권 이관
   - 설정에 이미 이관한 연결·AI 역할·글쓰기 기본값을 다시 복제하지 않는다.
   - 브라우저 표시 방식은 `블로그 Beta`의 글별 실행 설정으로 유지한다. 네이버 입력 속도는 `설정 > 앱 > 입력 환경`으로
     이관 완료했으며, 이미지 최적화는 기본 최적화·실패 시 원본 fallback으로 제공하고 설정 control을 만들지 않는다.
   - 블로그·쇼핑·SNS 자동 발행과 Buffer 발행 대상은 각 실제 기능의 자동화/발행 화면으로 옮긴다.
   - Trends·RSS·카드뉴스 source, 쇼핑 FTC·CTA는 각각 글감 관리·카드뉴스·쇼핑커넥트가 소유한다.
   - legacy 설정은 교체 전까지 동일 canonical 값을 읽는 호환 surface로 유지하며, 두 화면의 writable owner가
     생기지 않게 단계별로 제거한다.

12. Card News 상태·재진입 동작 정합화
   - `새 카드뉴스 > 피드에서 선택`의 `구성 있음`과 `만든 카드뉴스`의 `작업 중`이 같은 generation을 서로 다른
     용어로 표시하는 현재 투영을 하나의 사용자 상태 계약으로 통합한다.
   - 피드 항목과 관리 항목을 클릭했을 때 동일 generation이 있으면 같은 결과 workspace로 재진입하게 하고,
     미리보기만 여는 경우와 이어서 만드는 경우를 상태가 아니라 명시적인 action으로 구분한다.
   - 내부 workflow 상태(`후보/제작 중/제작 완료/제외`), generation 상태와 발행 상태를 사용자용 상태
     (`작업 중/발행 대기/발행 완료/확인 필요`)로 투영하는 단일 함수를 두고 목록·filter·badge가 함께 사용한다.
   - Card News 디자인 slice가 끝난 뒤 기능 정합성 단계에서 다루며, 기존 로컬 결과와 Sheet 행을 임의로 지우지 않는다.

13. Card News 피드·결과 관리 고도화
   - RSS source별로 만든 카드뉴스 개수를 계산해 피드 source 뱃지로 표시한다. 전체 생성 수인지 현재 목록과 연결된
     유효 결과 수인지 집계 기준을 먼저 확정한다.
   - `새 카드뉴스`의 RSS별 `30`, `10` 표시가 실제 대상 제한인지 조회 결과 개수인지 조사하고, 조회 한도·더 보기·
     페이지 처리 계약과 사용자 문구를 일치시킨다.
   - 만든 카드뉴스 삭제 기능을 추가한다. 프로젝트 자료, 생성 이미지와 발행 이력의 삭제 범위를 분리하고 삭제 전
     확인, 실패 시 보존, 목록 갱신을 검증한다.

14. 디자인 시스템 Must do — Compatibility containment 퇴장
   - 기존 `대시보드`, 기존 `블로그`, 기존 `설정`, `로그/이력`, 기존 블로그 수정 modal은 정식 style 적용 대상이
     아니라 legacy 교체 전의 호환 surface로 명시적으로 격리되어 있다.
   - 각 화면은 별도 제품 교체 또는 제거 slice에서만 다룬다. 새 기능을 legacy surface에 추가하지 않고, 교체가
     끝난 화면부터 containment와 compatibility alias를 제거한다.
   - 마지막 legacy surface 제거 전에는 네 정식 style에서 shell·navigation·dialog·form·상태 표현이 동일한
     semantic/component contract만 소비하는지 확인하고, 더 이상 사용되지 않는 legacy CSS를 삭제한다.

15. 디자인 시스템 Must do — 정식 style 시각·접근성 회귀 관문
   - 현재 registry/token/CSS composition 계약 테스트를 유지하고, 대표 사용자 flow의 네 style 시각 검토 기준을
     고정한다. 현재 정식 대상의 최소 범위는 블로그 Beta, 쇼핑커넥트, SNS, 설정, 내 정보와 Dialog다.
   - 좁은 화면, keyboard focus, disabled/loading/error, reduced-motion과 명도 대비를 style별로 확인한다.
   - 기능 release 전 전체 screenshot 차단 관문으로 확대하지 않는다. style token·공통 component·shell을 바꾼
     변경에만 focused visual regression 또는 명시적 hands-on 검토를 요구한다.

16. 글감 저장 계약 v2와 새 Topics 시트 검토
   - 현재 Google Spreadsheet의 `topics` 시트는 초기에 만들어진 계약으로, 필드 정의·확장 규칙·저장 책임이
     충분히 명확하지 않다. 기존 `topics`는 보존하고, 새 시트를 기준으로 계약을 다시 설계할지 검토한다.
   - 이 일감은 저장소를 SQLite로 전환하는 결정이 아니다. 우선 Google Spreadsheet를 유지하는 전제에서 새 시트와
     계약을 검토하되, 로컬 SQLite Agent Memory와 사용자 소유 글감 데이터의 책임 경계는 별도로 유지한다.
   - 모든 값을 `options` 한 칸에 넣거나 기존처럼 모든 값을 개별 열로 늘리는 방식을 미리 선택하지 않는다.
     목록·검색·정렬·상태 전이에 꼭 필요한 안정 필드와, 글감마다 달라지고 확장되는 포스팅·작성 설정을 구분해
     열과 구조화 JSON 객체의 경계를 정한다. `subject`는 글감의 단일 이름으로 유지하고 별도 중복 저장하지 않는다.
   - 현재 시트의 헤더·실데이터·호출부 읽기/쓰기 경로를 조사하고, 누락·중복·레거시 옵션 처리와 per-item 설정
     보존을 포함한 샘플 변환 규칙을 설계한다. 포스팅 시도와 결과 이력은 현재 설정 행에 계속 덮어쓸지, 별도
     이력 저장 계약으로 분리할지도 검토한다.
   - 새 계약의 버전/필수 필드/선택 필드, 검증·진단 규칙, 저장소 경계, 읽기·쓰기 API, 인덱싱·필터 요구,
     백업·복구와 되돌리기 계획을 문서화한다. 기존 데이터 샘플로 변환 결과와 보관함·대기열·편집·실행 동작을
     비교하고, 원본 보존과 cutover 조건을 정한다.
   - 설계·검증 기간에는 기존 `topics`와 새 시트를 동시에 수정 가능한 source of truth로 두지 않는다. 병행 검증이
     필요하면 쓰기 원본 하나를 명시하고 다른 쪽은 읽기 전용 projection으로 취급한다. 이 항목은 검토 backlog이며,
     새 시트 생성, 이관, 이중 쓰기, 기존 시트 폐기나 SQLite 전환 승인은 포함하지 않는다.

17. Markdown frontmatter 입력·포스팅 규칙 통일
   - AI 생성 원고와 직접 입력·붙여넣기·파일 원고에 frontmatter가 있거나 없는 경우를 모두 포함해, 네이버 블로그,
     WordPress, Site Hosting 블로그형 사이트와 Digital Garden에서 일관된 원고 해석 기준을 정한다.
   - 현재 플랫폼별 Markdown 파서가 frontmatter를 공통 메타데이터로 해석하지 않아 YAML이 본문에 노출되거나,
     Site Hosting이 생성한 frontmatter와 입력 frontmatter가 겹칠 수 있다. 먼저 각 경로의 실제 입력·변환·저장
     계약을 조사하고 재현 가능한 fixture를 만든다.
   - 공통 원고 경계에서 frontmatter를 한 번 파싱해 제목·본문·선택 메타데이터를 분리하고, 본문에 YAML 구분자와
     메타데이터가 실수로 섞이지 않게 하는 방향을 우선 검토한다. 플랫폼별로 지원하지 않는 metadata는 임의로
     적용하거나 조용히 버리지 않고, 필드별 매핑·보존·안내 기준을 정한다.
   - 같은 의미의 UI 설정과 frontmatter 값이 충돌할 때의 우선순위, 누락 필드의 기본값, Site Hosting 고유 필드와
     임의 frontmatter 보존 범위, 예약·임시저장·공개 상태 매핑을 명시한다. 기존 Site Hosting frontmatter 계약과
     네이버·WordPress의 실제 API capability를 함께 고려한다.
   - frontmatter 유무, 잘못된 YAML, 중복·미지원 필드, UI 값과의 충돌, 이미지 prompt 블록, 플랫폼별 임시저장·
     즉시·예약 동작을 대상으로 공통 파서와 adapter 계약 테스트를 추가한다. 이 backlog 등록은 규칙 확정이나
     구현 승인이 아니다.

18. Amade Template / Content Model 0.2 계약 안정화
   - Family는 catalog/use-case grouping으로만 사용하며 Template 호환성이나 데이터 보존을 약속하지 않는다.
   - 설계안: 별도 버전이 있는 Content Model이 profile/navigation/media/content types/frontmatter/routes/publish capabilities를 소유하고 Template은 정확한 model ID/version과 자체 seed를 선언한다. Family는 ID/name/description/order 및 grouping 관계만 가진다.
   - Template은 생성 시 고른 동일 template_id의 업데이트만 허용하며, 다른 Template으로 변경은 변환 계약이 별도 승인될 때까지 지원하지 않는다.
   - Amade는 `0.2.0-dev1` manifest/schema/model/seed와 계약 동기화 도구를 구현했다. BlogGenius는 명시적 v0.1 legacy resolver를 유지하면서 새 Content Model 및 Template-owned seed를 소비하도록 연결했다.
   - Amade sync 검사와 BlogGenius catalog/materialization/site-service 관련 집중 테스트 40개가 통과했다. 남은 일: 모든 원격 manifest/seed 참조의 schema 검증, 실제 Amade `dev` 카탈로그와 고정 revision 간 통합 확인, 사용자 UI 확인 후 안정 계약 버전 별도 결정.
   - 기존 A→B→A 검증은 해당 fixture의 역사적 실험으로만 남기고 제품 호환성 gate로 사용하지 않는다. 개발 진행과 구현 상세는 [parent branch 기록](plans/active/2026-10-01-static-site-builder-main-development.md) 및 Amade의 0.2 설계 문서를 따른다.

19. Amade Site Hosting 운영 템플릿 선별
   - BlogGenius 운영 앱은 Amade `main`의 `production-index.json`만 읽고, 개발 앱은 `dev`의 전체 `index.json`을 읽는다. 이 정책은 Site Hosting 템플릿과 UI Style 모두에 적용한다.
   - 운영 템플릿은 사용자가 승인한 `company-atelier`만 포함한다. 운영 Style은 `remote-test-style`을 제외한 나머지 10종을 명시적으로 허용한다.
   - 저장소 `main`에 테스트/개발 템플릿 소스가 남아 있어도 괜찮으며, 운영 카탈로그에 참조가 없으면 앱에서 숨긴다.
   - Amade의 검증 스크립트와 GitHub Actions workflow는 운영 카탈로그가 개발 목록의 유효한 부분집합인지 검사하고 선택된 템플릿·스타일을 검증한다. Branch protection에서 해당 check를 required로 설정하는 일은 별도 저장소 관리 작업이다.
   - Amade `dev`에 운영 Style 10종을 허용하고 BlogGenius가 production catalog를 읽도록 연결했다. Amade 변경을 `main`에 반영한 뒤 실제 운영 앱의 목록 노출 및 개발/운영 캐시 격리를 확인한다. 구현 세부는 [parent branch 기록](plans/active/2026-10-01-static-site-builder-main-development.md) 및 Amade의 [운영 카탈로그 규칙](../../../Amade/amade/spec/site-hosting-production-catalog.md)을 따른다.

20. 사용자 요구 기반 Astro 사이트 생성·발전 기능
   - 사용자가 원하는 사이트의 needs/wants를 입력하면 Astro 프로젝트를 만들고, BlogGenius 템플릿에서 시작한 사이트도
     계속 개성에 맞게 수정·발전시킬 수 있게 한다. 생성된 사이트는 기존 BlogGenius 게시·배포 흐름으로 이어진다.
   - 첫 제품 경로는 외부 도구로 만든 Astro 프로젝트 ZIP을 가져와 바로 Site로 생성하고 배포하는 것이다. 템플릿 등록은
     같은 프로젝트를 여러 Site의 시작점으로 재사용하려는 사용자에게 선택 기능으로 제공하며, 일반적인 Site 가져오기에
     템플릿 단계를 요구하지 않는다.
   - 구현 기술은 미정이다. 로컬 Codex/Claude Code CLI 실행, 사용자 API key로 호출하는 앱 소유 agent loop,
     공급자가 공식 지원하는 OAuth 사용, 구조화된 사이트 설계와 Astro component 생성 방식을 비교해 제품 요구와
     보안·비용·배포 조건에 맞는 구조를 결정한다. 이들은 가능한 구현 대안이지 사전 확정된 순서가 아니다.
   - 요구사항 수집부터 프로젝트 생성, 반복 편집, 미리보기, 사용자 승인, 게시와 배포까지 전체 사용자 여정을 설계한다.
     생성 결과의 자유도, 재현성, 기존 Site 보존, 비용과 작업 권한 경계를 함께 정한다.
   - OpenAI Codex/Sign in with ChatGPT와 Anthropic Claude Code의 공식 CLI·인증 인터페이스를 조사 근거로 참고하되,
     CLI 인증과 BlogGenius의 OAuth 권한은 구분한다. 구독 사용 OAuth는 제공자별 지원 앱 범위와 약관을 확인한 뒤 결정한다.
   - 설계 배경·대안 비교·조사 근거: `docs/plans/active/2026-10-11-astro-site-generation-agent-options.md`.

## P2 — 제품 확장과 유지보수

4. Astro 테마·GitHub 프로젝트에서 사이트 가져오기
   - 현재 BlogGenius 템플릿과 ZIP 가져오기에 더해, 공개 Astro 프로젝트를 시작점으로 선택해 Site로 가져오는 경로를 검토한다.
   - 후보 경로는 Astro 테마 디렉터리에서 테마를 찾아 BlogGenius가 선별 제공하는 방식과 사용자가 GitHub 저장소 주소를 직접 입력하는 방식이다. 두 경로 모두 기존 프로젝트 분석 → 설정 검토 → 미리보기·생성 흐름을 재사용하는 방향을 우선 검토한다.
   - Astro 테마 디렉터리의 `Free` 표시는 가격 정보로 취급한다. 프로젝트별 라이선스와 재배포·수정 허용 범위를 확인하고, 라이선스가 없거나 불명확한 저장소를 BlogGenius의 큐레이션 목록에 포함할 기준을 정한다. GitHub의 감지 결과만으로 저장소 전체의 의존성·이미지·폰트 권리를 보증하지 않는다.
   - 공개 저장소와 고정 revision을 기준으로 가져오기 재현성, 저장소 구조·빌드 검증, 보안 격리, BlogGenius 설정 연동 지원 여부, 저작자 표시를 설계한다. 기존 ZIP 가져오기와 별도 구현이 중복되지 않도록 공통 가져오기 계약을 검토한다.
   - 우선순위와 도입 범위는 후속 설계에서 결정한다. 이 backlog 등록은 Astro 테마 자동 수집, GitHub 임의 저장소 빌드, 라이선스 적합성의 자동 보증을 승인하지 않는다.

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

10. Card News 주기 발행
   - 완성된 카드뉴스를 지정한 채널과 주기로 발행하는 기능을 검토한다.
   - 우선순위는 낮게 유지하며, 예약 충돌·채널별 장수 제한·실패 재시도와 중복 발행 방지 계약을 먼저 정의한다.

11. 디자인 시스템 Nice to do — 사용자별 외관 동기화
   - 현재 style 선택은 로컬 저장으로 충분하다. 로그인·다기기 사용이 실제 제품 범위가 될 때만 계정 설정 동기화,
     충돌 우선순위와 offline fallback을 설계한다.
   - 동기화가 없다면 app 시작 시 저장값을 조기에 적용하는 현재 flicker 방지 경로를 유지한다.

12. 디자인 시스템 Nice to do — style 검토 경험 고도화
   - 설정의 2×2 선택 UI는 registry 기반으로 유지하고, style 수가 늘어날 때만 검색·분류·미리보기 확대를 검토한다.
   - 고대비, 시스템 밝음/어두움 같은 별도 theme 축은 새 style pack 추가와 다르므로, 실제 사용자 요구와 조합별
     접근성 비용이 확인되기 전에는 도입하지 않는다. 해당 탐색은 P3 `Theme system`과 같은 일감으로 관리한다.

13. 작업 버튼 옆 진행 요약과 상세 상태 이동 공통 UX
   - AI 원고 생성·발행처럼 오래 걸리는 작업은 실행 버튼 가까이에 현재 단계와 결과를 한 줄로 보여주고,
     요약을 누르면 해당 화면의 상세 상태 패널로 이동하게 한다. 떨어진 단독 `상태 보기` 링크는 제거한다.
   - 생성·발행의 진행, 취소 요청, 취소 완료, 실패와 완료에 같은 표현 규칙을 적용한다. 버튼 주변에는 짧은
     상태와 다음 행동만, 상세 패널에는 원인·결과를 두어 동일한 오류 전문을 중복 표시하지 않는다.
   - 실패 시 하단의 같은 오류가 두 곳에 반복되고 상단 상세 상태에는 이전 `생성 중` 메시지가 남는 사례를
     재현·수정한다. 생성·발행의 안내 위치와 메시지 소유권을 통일해 결과와 진행 상태가 어긋나지 않게 한다.
   - `블로그 Beta`에서 패턴을 검증한 뒤 쇼핑커넥트와 기존 `블로그`의 해당 작업에 단계적으로 적용한다.
     취소 구현과 섞지 않고 현재 AI 작업 취소 parent의 독립 sub-feature로 범위를 정해 진행한다.

14. 개발 환경 AI 요청·응답 추적과 운영 로그 구분
   - Production의 일반 운영 로그는 계속 남기되, 모델·transport·시도·오류 종류·요청 ID·경과 시간처럼
     실패 원인을 좁히는 비민감 정보만 기록한다. 로그 UI와 로컬 로그 파일의 역할과 노출 범위를 확인한다.
   - Local/Development에서만 별도 debug 로그와 작업별 AI 요청 prompt·응답 원문을 기록해 글 길이·문체
     설정 반영, 이미지 슬롯 검증 실패, KIE 일시 오류를 재현할 수 있게 한다. Production에서는 원문 추적을
     기본적으로 생성하지 않고 일반 로그·UI에도 원문을 섞지 않는다.
   - API Key·인증 헤더 등 비밀값 제거, 파일 접근 권한·크기·보존 기간, 요청/응답 연결 ID와 생성 실패 시
     부분 응답 처리 기준을 정한 뒤 구현한다. 현재 AI 작업 취소 parent에서 별도 sub-feature 범위를 협의한다.

15. Telegram bot library v2 전환 검토
   - 현재 앱은 보안 업데이트로 `node-telegram-bot-api` v1.2.0을 사용한다. v1.2.0은 v1 계열 최신이지만
     npm의 `latest`는 v2.1.0(2026-08-24 공개)이며 v2.2.0-rc2(2026-09-07)는 prerelease다.
   - v2는 기존 `TelegramBot` 이벤트 API와 호환되지 않는 재설계이므로 즉시 올리지 않고 별도 FBR에서 migration
     adapter 경계, 영향받는 호출과 lifecycle, callback/update 처리, polling 재시도·중단 동작을 먼저 설계한다.
   - 대상을 안정판 v2.1.0으로 고정해 계약 테스트와 mock 기반 회귀를 추가하고, 설정·토큰·실제 원격 발송 없이
     빌드·시작·수신·응답 경로를 검증한다. v2.2 prerelease는 안정판 검토 대상에 포함하지 않는다.

16. BlogGenius 공통 이미지 조작 패턴
   - 블로그 이미지 블록과 카드뉴스 이미지 작업의 조작 방식을 공통 패턴으로 통일하고, 하단에 따로 놓인 중복
     이미지 작업 버튼은 이미지 미리보기 안으로 모은다.
   - 이미지가 없을 때는 `AI로 만들기`와 `+` 로컬 이미지 선택을 표시한다. 이미지가 있을 때는 hover/focus에서
     재생성·교체 조작을 보이고, 터치 환경에서는 버튼을 계속 노출한다.
   - 미리보기 영역의 drag & drop을 로컬 선택의 보조 입력으로 지원하고, 파일 검증·처리 중 중복 방지·편집기
     드롭 동작과의 충돌을 검증한다. 접근 가능한 키보드 조작과 상태 안내를 함께 제공한다.

17. SNS 영상 첨부 및 Buffer 게시 지원
   - 수동 SNS 작성에서 로컬 영상을 선택하고 게시 미리보기·검증·Buffer 발행까지 이어지는 흐름을 추가한다.
   - Buffer API의 공개 미디어 URL 요구사항에 맞춰 Google Drive 임시 미디어 transport를 영상까지 확장할 수
     있는지 검증한다. 큰 파일의 업로드·요청 제한, 게시 완료/결과 불명 시 보존·정리 시점과 재시도 안전성을
     설계한다.
   - 플랫폼별 지원 포맷·용량·길이·화면비와 영상 개수 제한을 채널별 정책으로 검증하고, 1차 지원 플랫폼과
     허용 포맷을 먼저 확정한다. 이미지와 영상 혼합 및 다중 영상 정책도 발행 계약에서 명시한다.
   - Buffer public API와 지원 채널의 현재 영상 제한을 재확인한 뒤 구현 범위와 UI 안내를 정한다.

## P3 — 후순위 탐색

1. 긴급 공지 전달 방식 설계
   - 설정 전환처럼 특정 사용자에게 필요한 공지와 전체 긴급 공지를 구분한다.
   - 노출 시점·반복 여부·확인 상태 저장과 대시보드 안내의 역할을 정한 뒤, 공통 공지 기능이 실제로 필요할 때 설계한다.

2. 동일 네트워크 접근 안전성
   - `0.0.0.0` binding은 명시적 진단 용도와 인증·경고에 한정하고 BlogAnywhere의 공용 연결 경로로
     확장하지 않는다.

3. 글쓰기 스트릭
   - 의미 있는 저장·발행 완료 이벤트만 집계하고 점수 중심의 과도한 게임화를 피한다.

4. Theme system
   - design token을 먼저 정리한 뒤 시스템/밝음/어두움 테마와 주요 화면의 가독성·상태 대비를 검증한다.

5. 이름 있는 색감 기반 디자인 스타일 시리즈 기획
   - 세룰리안 블루처럼 인상적인 색 이름을 출발점으로 스타일 pack을 시리즈화할지 기획한다.
   - 각 스타일은 이름뿐 아니라 화면의 분위기·표면·강조색·상태색까지 일관된 art direction을 갖추고 기존
     에디토리얼·세이지·가을밤·단청·터미널·미니멀과 시각적으로 구분되도록 한다.
   - 후보 palette의 대비·가독성과 작은 화면에서의 상태색 구분을 검증하고, 한 번에 소수의 완성도 높은 스타일만 추가한다.

## 완료된 기준선

새로운 구체적 결함이 확인되지 않는 한 다음 항목을 포괄적인 미완료 일감으로 다시 등록하지 않는다.

- Local/Development/Production 환경 분리와 fail-closed 승격 관문
- 연속 발행과 정식 `블로그` 작업 흐름
- Dashboard 운영 상태·통계·최근 결과·연결 상태·뜻밖의 발견·온보딩·Help 연결
- Electron 44와 macOS 13+ Apple Silicon·Windows x64 릴리스 대상
- 배포본 최초 실행 기본값과 macOS 보호 경로/App Translocation 시작 오류 복구
- 검색·발견 중심 제목 호기심 전략
- 블로그 Beta의 바로 생성·원고 폴더·원고 붙여넣기 공통 원고 작업공간과 본문 이미지 생성·선택·교체
- Dashboard 네이버·WordPress 연결 상태 안정화
- 브라우저 세션 발행을 대체하는 네이버 OAuth2 제안은 결정에 따라 종료
- 네 정식 style, registry·CSS manifest·cascade layer·공통 component 계약과 Settings Beta의 registry 기반
  style 선택 UI
