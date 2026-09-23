# BlogGenius Backlog

> 현행 기준: 2026-09-21 · 최신 릴리스: `v0.5.1`

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
   - 빠른 글 작성 결과에도 블로그와 같은 공통 원고 workspace를 연결해 본문·이미지 슬롯을 실제 발행 모습에 가깝게
     미리 보고, AI 생성·로컬 이미지 선택·제외·교체 결과가 최종 payload와 일치하게 한다.
   - 이미지가 비어 있으면 발행 시 자동 보정하고, 생성 실패로 prompt가 남는 경우에만 안전하게 임시 저장하는
     블로그 원고 정책을 재사용한다. 쇼핑 고유 상품 정보·표시 문구·링크는 별도 domain 정보로 유지한다.
   - 현재 `글감 관리` 화면과 저장 자료는 삭제하지 않고 UI 진입만 임시로 숨긴다. 빠른 글 작성의 `나중에 활용`,
     `글감 보관`, `발행 대기열에 추가`도 같은 기간 숨기고 바로 포스팅 흐름만 제공한다. 공통 미리보기와 쇼핑
     글감의 저장·대기·재진입 계약을 완성한 뒤 관리 화면과 저장 action을 함께 다시 노출한다.

5. 뜻밖의 발견 품질과 관측성
   - 실제 결과를 바탕으로 활동 가중치와 source diversity를 조정한다.
   - 약한 후보를 채우기보다 명확한 빈 상태를 제공한다.
   - fallback 제목, 근거 시점·출처 설명과 동음이의어 topic semantics를 개선한다.
   - 추천 funnel, provider 비용, cache, 중복과 고아 recommendation 진단을 제공한다.

6. AI provider transport 현대화와 지원 모델 discovery
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
   - canonical content request bundle과 validator를 공용 internal API 계약으로 승격한다.
   - Desktop, BlogAnywhere, MCP와 Telegram이 같은 query, preview, confirmation, execution과 result 경계를
     사용하게 한다.
   - Telegram은 business logic이 아닌 얇은 channel adapter로 유지한다.

8. 제목 결과 학습
   - 배포된 검색·발견 중심 호기심 전략은 완료된 기준선으로 본다.
   - 서로 다른 각도의 제목 후보를 제공하고 명시적인 선택·수정과 검증된 콘텐츠 결과에서만 학습한다.

9. 원고 작업공간 통합과 로컬 이미지 연결
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
- 네 정식 style, registry·CSS manifest·cascade layer·공통 component 계약과 Settings Beta의 registry 기반
  style 선택 UI
