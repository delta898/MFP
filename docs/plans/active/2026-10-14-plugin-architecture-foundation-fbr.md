# Plugin Architecture Foundation FBR

- Branch: `codex/fbr/plugin-architecture-foundation`
- Start date: 2026-10-14
- Base/parent branch: `dev` (`9c6c2dda0e9ac8cd2fcfa0d9df12f72920989294`)
- Status: active; Platform Kernel/Application/Plugin 경계와 최소 실행 기반, WordPress Publisher package/Application pilot이 parent에 통합 완료. 제품 경로에는 아직 연결하지 않음

## 현재 상태와 구조 기준

- 이 parent FBR은 조사·설계에서 실행 가능한 기반 구축 단계로 진행됐다. 현재 합의된 계층과 의존 방향의 기준 문서는 [`docs/architecture/platform-kernel-applications-plugins.md`](../../architecture/platform-kernel-applications-plugins.md)다.
- 첫 sub-feature `codex/feat/platform-kernel-application-boundary`의 최소 Kernel → Application → Plugin 예제와 계약 테스트가 commit `19f670d0`으로 이 parent에 fast-forward 병합됐다. 이 기반은 제품 entrypoint에 연결되지 않았으며 기존 발행·생성 흐름도 이전하지 않았다.
- 하위 단계 개발 기록은 `docs/plans/archive/2026-10-14-platform-kernel-application-boundary-development.md`에 보관한다.
- `codex/feat/wordpress-publisher-plugin-pilot`는 commit `4e1424f6`로 parent에 fast-forward 병합했다. 개발 기록은 [`2026-10-14-wordpress-publisher-plugin-pilot-development.md`](../archive/2026-10-14-wordpress-publisher-plugin-pilot-development.md)에 보관한다. 기존 제품의 수동·예약·일괄 발행 경로는 계속 구 구현을 사용한다.

## 사용자 필요와 목표

BlogGenius의 기능이 커지면서 네이버 블로그 발행, WordPress 발행, 카드뉴스, SNS 발행 같은 기능을 앱 내부에 계속 쌓기보다, 서로 분명한 경계를 가진 모듈로 만들고 필요에 따라 조합·확장할 수 있는 기반을 마련한다.

장기적으로 BlogGenius는 요청을 이해하고 적절한 기능을 연결하는 core/runtime에 집중하고, 기능은 독립 모듈 또는 plugin으로 확장할 수 있기를 바란다. 장차 안정된 계약을 통해 일부 모듈을 별도 저장소에서 개발하거나 BlogGenius, OpenClaw, 기타 agent 환경에서 재사용할 수 있는 가능성도 탐색한다.

상위 제품 방향은 **OpenClaw처럼 확장 가능한 기능 생태계**와 **Hermes Agent처럼 사용 경험을 바탕으로 점진적으로 나아지는 agent**의 두 축을 함께 지향한다. 여기서 자가 발전은 대화 경험·결과·정정에 근거해 memory와 capability 선택이 나아지는 것을 뜻하며, AI가 승인 없이 plugin 코드나 권한을 직접 변경·배포한다는 뜻은 아니다. Plugin은 안정된 실행 능력을 제공하고, Core의 runtime/memory가 요청 해석과 학습된 맥락을 관리한다.

이 FBR의 목적은 현재 구조와 결합 지점을 조사하고, plugin의 의미·경계·등록 방식·단계적 이행안을 설계해 사용자와 합의하는 것이다. 합의 전에는 기능을 이동하거나 런타임 구조를 바꾸지 않는다.

### 사용자가 제시한 To-Be 목표

1. 시스템은 **Core + Core Plugin + Community Plugin**으로 확장된다.
   - 초기 단계의 Core Plugin은 BlogGenius 앱에 번들한다.
   - Core Plugin도 runtime enable/disable이 가능한 기술 단위지만, 사용자가 모두 직접 toggle하도록 노출한다는 뜻은 아니다.
   - Core Plugin은 설치·삭제하지 않는다. 선택 설치·삭제는 추후 Community Plugin 단계에서 다룬다.
   - Community Plugin은 충분한 검토와 Core Plugin 단계의 검증 후 확장한다.
2. Plugin은 앱을 재시작하지 않고 실행 중 enable/disable할 수 있다.
   - 별도 package의 선택 설치·삭제는 추후 단계에서 검토한다.
3. Plugin은 충분히 독립적이고 완결적이어서 제작자가 각자 GitHub에 배포해 사용할 수 있다.
4. Codex/Claude 등의 AI가 skill을 통해 plugin의 목적과 사용법을 이해하고 잘 활용할 수 있다.
5. MCP 또는 Telegram에서 plugin의 조회, 설치, 사용, enable/disable을 할 수 있는 방향을 지향한다.

이 다섯 항목은 이번 논의의 제품 목표다. 구현 수단과 권한 정책은 아직 확정하지 않았다.

## 범위

- 현재 core, Agent Runtime, Capability Registry, providers/transports, channel adapters, 실행 기능의 실제 소유 경계를 파악한다.
- 현행 코드에서 재사용 가능한 모듈 경계와 수동 조립 지점을 확인한다.
- “코드 모듈화”, “앱 내 first-party plugin”, “외부 설치형 plugin”, “MCP/API로 연결되는 별도 프로세스”를 구분한다.
- 공통 plugin descriptor/lifecycle과 capability·provider·channel 등 확장 유형별 기여 계약의 후보를 제안한다.
- capability 목록·가용성 설명이 실제 등록/실행 상태와 자동으로 일치하는 구조를 설계한다.
- 첫 pilot과 점진적 이행 순서를 비교하고 사용자와 결정한다.

## 명시적 비목표

- 사용자 합의 전 제품 코드, 저장 데이터, 공개 API/계약의 변경
- 이번 FBR에서 네이버/WordPress/SNS/카드뉴스 구현을 실제로 분리하거나 저장소를 나누는 일
- 임의 외부 JavaScript 패키지를 설치·실행하는 plugin marketplace 구현
- BlogGenius가 MCP Server로 외부 host에 제공하는 surface와, BlogGenius가 MCP Client로 외부 server를 호출하는 구조를 하나로 취급하는 일
- Telegram adapter 안에 도메인 동작을 추가하는 일
- release/version/배포 작업

## 현행 구조 조사

### Core와 capability 조립

- `src/agent/`에는 요청 parsing, planning, runtime, confirmation 등 channel-neutral agent 흐름이 있다.
- `src/capabilities/index.js`는 capability factory를 직접 import하고 의존성을 구성한 뒤 `allCapabilities` 배열에 모아 Map으로 등록하는 composition root다. capability 경계는 있지만 동적 plugin discovery나 선언형 등록 계약은 아니다.
- `src/mcp/runtime-factory.js`도 capability registry를 만든다. 여러 entrypoint가 공통 도메인 구현을 쓰지만, 각 실행 surface의 조립 책임과 제공 가능한 capability 집합이 명시적인 하나의 contribution contract로 통합되었는지는 추가 조사 대상이다.
- `src/channels/telegram/`은 채널 어댑터와 렌더링 경계를 제공한다. 안정된 방향은 channel이 요청/응답을 전달하고 capability가 업무 동작을 소유하는 것이다.

### Provider와 transport

- `src/knowledge/registry.js`는 provider definition을 `id + kind + transport + config` 형태로 정규화하고 transport에 fetch를 위임한다.
- Provider와 transport 구현은 `src/capabilities/index.js`에서 여전히 직접 조립된다. `mcp_tool` transport는 현재 구조적 placeholder다.
- 이 구조는 provider integration을 독립 등록하는 pilot 후보지만, 전체 업무 기능 plugin의 계약을 대신하지는 않는다.

### 제품 기능과 UI/API 조립

- 네이버, WordPress, SNS, 카드뉴스, 연속 발행, 사이트 호스팅 등은 `src/` 아래 별도 디렉터리를 가진다. 이는 코드상의 일부 모듈화이지, manifest/discovery/lifecycle을 가진 설치 가능한 plugin은 아니다.
- `src/ui-runtime/api-route-runtime.js`는 다수의 도메인 service/controller/route factory를 인자로 받아 수동으로 조립한다. HTTP route, capability, background job, UI surface 등록은 서로 다른 조립 지점을 가지므로 이행 설계에서 함께 확인해야 한다.
- Amade 공유 catalog의 template/style은 metadata와 데이터 계약을 가진 resource package의 선례다. 단, `docs/decisions/2026-10-04-amade-shared-catalog-resource-types.md`의 원칙처럼 UI style 리소스는 임의 executable JS/CSS를 전달하지 않는다. 데이터 리소스 catalog와 실행 plugin을 같은 보안 모델로 취급하지 않는다.

### 현재 기능의 Core / Core Plugin 후보 경계

아래는 현재 코드와 제품 방향을 기반으로 한 **설계 제안**이다. 최종 분류나 코드 이동 범위로 승인된 것은 아니다. 모든 Core Plugin은 초기에 앱에 번들되며, 기존 기능의 기본 동작은 보존하는 것을 전제로 한다.

| 현재 기능/모듈 | Core 후보 | Core Plugin 후보 | 경계 판단 |
|---|---|---|---|
| Agent Runtime, parser/planner, confirmation, capability registry | 요청 해석·검증·route·dispatch·정책 집행 | plugin은 설명/요구사항/실행 handler를 제공 | 어떤 채널이든 동일하게 동작하는 host 책임 |
| Memory, interaction/event lifecycle, preference projection | 공통 event store, retrieval API, 보존·동의·삭제 경계 | plugin은 도메인 event와 outcome을 발행하고 필요한 memory context를 요청 | 학습 엔진과 데이터 통제는 Core, 제품 경험 신호는 plugin |
| Plugin registry/lifecycle, credential/identity/license, logs | 설치 상태/enable 상태, 권한 scope, 공통 상태·감사·실행 생명주기 | plugin manifest가 필요한 권한·설정·의존 capability를 선언 | 플러그인은 자기 권한을 직접 확장하지 못함 |
| Settings 및 connection readiness | 화면/저장/secret 소유의 공통 framework와 확인 계약 | Naver, WordPress, Buffer, Cloudflare 등의 설정 schema·검증 기여 | 공통 연결 상태 모델과 외부 서비스별 계약 분리 |
| UI/API shell, navigation, route registration | 앱 shell, 공통 UI/API/router, plugin 관리·설정 호스트 | 플러그인별 화면, 메뉴, API handler 기여 | contribution은 등록 가능하되 임의 코드/route 권한 제한 필요 |
| Blog 작성기, 원고, 이미지 생성 | 범용 editor/runtime·artifact 계약은 Core 공유 자산 후보 | AI 글쓰기, 발행 준비, Blog Beta 화면/기능은 작성/게시 plugin 후보 | 현재 Blog UI가 작성·다중 발행 흐름을 함께 포함해 추가 분해 필요 |
| Naver Blog 로그인/발행 | 공통 credential·세션 보관 interface와 실행 정책 | Naver 인증 adapter, 임시저장/발행·RSS/결과 처리, Naver 전용 설정 | Naver API/browser/session 세부는 Core에 두지 않음 |
| WordPress 발행 | 공통 publishing contract와 결과/event 모델 | WordPress 인증·REST adapter 및 WordPress 전용 API 동작 | Application이 manuscript/content/image 준비와 category/status policy를 조합하고 Plugin은 WordPress API 세부를 소유 |
| SNS/Buffer 공유 | 공통 delivery job, retry/dedupe/confirmation primitive | Buffer adapter, 플랫폼별 formatting·RSS discovery·distribution workflow | SNS provider와 배포 workflow를 host scheduler에서 분리 |
| 카드뉴스 | 공통 plugin lifecycle, job 실행/취소/결과 저장 primitive | source intake, 카드 생성·편집·ledger·publish UI 및 capability | 카드뉴스는 자체 데이터/화면/작업 흐름이 있는 독립 제품 plugin 후보 |
| Site Hosting/Astro/Cloudflare | 공통 credential/HTTP/job/preview contract | Astro project/site 생성·관리, Cloudflare deploy/domain 연결과 UI | hosting 제품 경험은 plugin, Cloudflare API adapter는 그 기능의 provider 기여 후보 |
| Trends, News, Keyword Research, content ideas | `kind + transport + config` registry, snapshot/provenance 계약, agent의 공통 route | 실제 Naver/SerpApi source, keyword research, 도메인별 idea/recommendation producer | source connector는 provider plugin 후보, 사용자 목적/출력 workflow는 별도 capability plugin 후보 |
| Continuous publishing / scheduler | plugin-neutral scheduler, job lease/state/retry/disable/drain primitive | 블로그/쇼핑/SNS/Site별 pipeline, destination readiness와 queue executor | 스케줄 엔진은 Core 후보, 예약할 업무와 대상은 plugin 소유 |
| Telegram, MCP | channel-neutral request/control contract 및 인증/권한 경계 | Telegram channel adapter, 외부 MCP client/server adapter 및 각 surface 설정 | protocol 연결은 channel/integration contribution; business logic은 capability owner에 둠 |
| Shopping | 공통 content/artifact/publish/job 계약 | 상품 수집·선정, 쇼핑 원고/이미지, Naver Shopping 발행·운영 흐름 | Blog와 data contract/발행 대상이 다르므로 별도 업무 plugin 후보 |

#### 경계 원칙 제안

- **Core는 BlogGenius가 plugin을 실행하고 통제하는 플랫폼**이지 모든 제품 기능을 담는 공통 폴더가 아니다. Core는 도메인별 Naver/Buffer/Cloudflare 판단을 갖지 않는다.
- **기능은 사용자가 인식하는 완결된 업무 단위**로 plugin화한다. 예: “Naver Blog 발행”은 연결·입력·확인·결과·설정·설명까지 하나의 경험이어야 하며, 단순 API wrapper 하나를 독립 plugin이라고 부르지 않는다.
- **Provider와 업무 capability는 구분한다.** 예를 들어 Naver News provider는 정보를 제공하고, content idea capability는 그 정보를 이용해 글감을 제안한다.
- **공통 기능은 실제 여러 plugin이 필요로 할 때 Core contract로 승격한다.** 특정 plugin 하나만 쓰는 data model, UI policy, 외부 API 세부는 Core에 넣지 않는다.
- **화면·API·예약 작업도 plugin 경계에 따라 조립**되어야 한다. UI route만 제거해도 scheduler가 계속 업무를 실행하는 식의 분리 실패를 막기 위해, contribution 등록과 lifecycle disable이 작업 trigger까지 닫는 계약이 필요하다.
- Core Plugin도 enable/disable 가능한 기술 단위다. 다만 이는 모든 plugin의 수동 toggle을 제품 UI에 노출해야 한다는 요구가 아니다. 기본 상태·의존 관계는 Core가 관리하고, 사용자 제어는 제품상 의미가 있는 경우에 제공한다.
- 네이버와 WordPress 발행기는 각자 독립된 Core Plugin으로 두는 방향을 우선 제안한다. 사용자 업무 흐름에서 함께 묶을 필요가 생기면 `group`/`set`을 탐색·기본 구성용 상위 개념으로 추가할 수 있지만, 실행·설정·생명주기의 소유자는 개별 plugin으로 유지한다.
- Core Plugin간 직접 private import 대신 host API 또는 공개 shared contract를 사용한다. Naver session을 Blog와 Shopping이 공유해야 한다면 공통 Naver adapter contribution과 명시적인 dependency/permission contract를 둔다.
- Memory는 Core 소유다. Plugin은 자유롭게 사용자 기억을 수정하는 대신 최소 event/outcome를 발행하고, Core가 provenance와 정책을 적용해 projection한다.

#### 현재 구조에서 예상되는 큰 이동 경계

- `src/capabilities/index.js`: agent 관리 capability와 제품 기능 capability가 한 배열에서 직접 등록된다. 이후 Core-owned contribution과 plugin-owned contribution의 합성 지점이 될 후보지만, 구현은 아직 하지 않는다.
- `src/ui-runtime/api-route-runtime.js` 및 `src/ui-server.js`: Blog 자동화, manual SNS, card-news, site hosting 등 route/service와 background lifecycle이 한 앱 composition root에서 직접 조립된다. plugin contribution manifest가 capability뿐 아니라 route, UI, job lifecycle도 등록/해제할 수 있어야 한다.
- `src/knowledge/`: Core는 provider registry와 공통 snapshot 계약을 소유하고, provider instance/connector의 plugin 배치 여부를 별도로 정해야 한다. 설정상 provider 하나를 선택하는 것과 executable provider plugin을 설치하는 것은 다른 개념이다.
- `src/blog-next/`, `src/social/`, `src/card-news/`, `src/site-hosting/`, `src/continuous-publishing/`: 이미 일부 domain boundary가 있으나, 현재는 repository 안의 코드 모듈이다. 폴더 하나를 그대로 Core Plugin으로 선언하기 전에 소유 데이터, 설정, jobs, UI, API 및 타 기능 의존성을 끝까지 추적해야 한다.

### 관련 기존 설계

- `docs/architecture/overview.md`와 `agent-runtime.md`는 `Channel Adapter -> Agent Runtime -> Capability Registry -> Execution Layer -> Memory`를 주 경로로 둔다.
- `docs/plans/active/agent-redesign-plan.md`에는 capability registry 발전 구상이 있다. 이 FBR은 기존 계획을 대체하지 않고, plugin host/등록 계약과의 접점을 확인한다.
- `docs/plans/active/internal-api-redesign-plan.md`는 channel-neutral 내부 API 방향을 다룬다. 도메인 capability 계약과 plugin packaging 경계를 구분해 조정한다.
- `docs/plans/active/remote-mcp-server-plan.md`는 BlogGenius를 MCP Server로 노출하는 계획이다. 여기서 다룰 plugin host 관점 및 외부 MCP Client/Server 연결과 역할이 혼동되지 않도록 별도 경계를 유지한다.

## 설계 제안 초안

### 개념 구분

1. **모듈**: 같은 저장소 안에서 명확한 소유권과 의존성 계약으로 나뉜 코드 단위. 먼저 이 경계를 안정화한다.
2. **First-party plugin**: host가 정의한 등록 계약으로 capability/provider/channel/job/API contribution을 추가하는 BlogGenius가 관리하는 모듈. 첫 단계는 monorepo 안에서 정적으로 등록할 수 있다.
3. **외부 plugin**: 독립 패키지나 저장소에서 배포·설치되는 확장. 버전 호환성, 권한 승인, credential scope, 신뢰 검증, 장애 격리와 업데이트/rollback 정책이 필요하므로 별도 단계다.
4. **Remote integration**: MCP/REST 등 계약된 transport를 통해 별도 프로세스/서비스에 요청한다. 임의 코드를 Electron 프로세스에 직접 로드하는 것과 분리한다.
5. **Data/resource package**: template, style, prompt 자료처럼 선언형 데이터 중심의 확장. executable plugin과 다른 validation 및 실행 권한 모델을 유지한다.

### Host와 기여 계약 후보

Host/core가 소유할 후보:

- 요청 해석·계획·routing과 실제 등록된 capability 선택
- capability registry/dispatch, schema validation, 정책·confirmation enforcement
- identity, entitlement, credential vault 및 권한 범위
- memory/event, logging/observability, 공통 job lifecycle와 실패 격리
- plugin 호환성 검사, 활성화 상태와 lifecycle 관리

Plugin/module이 소유할 후보:

- 특정 업무 도메인의 입력/출력 계약과 실행 로직
- provider adapter 및 vendor 전용 DTO 정규화
- 필요한 capability, provider, background job, API handler 등 명시적인 contributions
- 필요한 권한·credential scope·confirmation·부작용 설명

공통 plugin metadata를 모든 확장 유형에 강요하지 않고, 공통 식별/버전/호환성/lifecycle 위에 typed contribution 계약을 두는 방향을 검토한다. “모든 것을 plugin 하나로 포장”하는 설계는 피한다.

### Core / Core Plugin / Community Plugin 경계 제안

- **Core (Plugin Host)**: AI/채널과 plugin 사이의 안정된 경로, registry와 discovery, 정책·권한·confirmation, plugin lifecycle, credential 경계, 공통 logging/job/memory 계약을 소유한다. 도메인별 게시 기능을 계속 직접 소유하는 거대한 앱이 되는 것은 목표가 아니다.
- **Core Plugin**: BlogGenius 앱에 번들되어 함께 배포하는 공식 plugin이다. 설치·삭제는 제공하지 않고 host가 runtime enable/disable을 관리한다. Community Plugin과 가능한 한 같은 manifest/contribution 계약을 쓰되, 사용자 UI에 모든 toggle을 노출할 필요는 없다.
- **Community Plugin**: 제3자가 별도 GitHub 저장소에서 독립 버전으로 배포하는 plugin이다. private core import에 의존하지 않고, 공개된 host API/SDK와 명시된 권한·설정·호환성 계약만 사용한다.
- “Core 내부 private module”과 “Core Plugin”은 다른 개념이다. 전자는 host 구현 세부이고, 후자는 같은 lifecycle에 참여하는 확장이다.

### Plugin package와 Skill 역할 제안

Plugin은 최소한 다음을 자체 선언/제공하는 독립 단위로 검토한다.

- manifest: plugin id/owner/version, host API 호환 범위, 기여 항목, 의존성, 권한, 설정 schema, 플랫폼 요구사항
- 구현 adapter: capability/provider/job 등 typed contributions를 실제 transport로 제공
- capability 설명: 목적, 필요한 입력, 사전 조건, effect/confirmation, 실패와 결과의 의미
- 선택적인 skill 문서: AI가 목적과 사용 순서, 조합 예시, 제한을 이해하도록 돕는 지침
- 데이터/설정 migration 및 disable/uninstall lifecycle 처리

Skill은 AI가 기능을 언제 어떻게 사용할지 돕는 설명/절차이지 실행 권한이나 실행 구현 자체가 아니다. 사용자는 Plugin 형식을 설계할 때 Skill을 함께 고려해, Plugin이 제공하는 capability를 추후 Codex/Claude 등의 AI도 잘 발견·조합·사용할 수 있기를 원한다. Skill을 plugin package에 어떤 형식으로 포함하거나 생성할지는 미정이며 구체 논의가 필요하다. BlogGenius 안의 AI는 실제 enabled/ready capability registry를 보고 선택하고, 외부 agent에는 같은 plugin 계약을 MCP/API tool로 노출할 수 있어야 한다. Skill을 배포했다고 실제 tool/API가 자동으로 생기는 것은 아니다.

### 실행 중 Enable/Disable의 의미 제안

- `installed`, `enabled`, `ready`, `available`은 서로 다른 상태다. 설치되어도 비활성일 수 있고, 활성화되어도 필수 설정/credential이 없어 실행 불가능할 수 있다.
- disable 즉시 신규 요청·job dispatch에서 빠지고 capability catalog에서도 실행 가능으로 노출하지 않는다. 반복 job/trigger는 중지한다.
- 이미 진행 중인 호출은 외부 부작용을 취소하거나 되돌릴 수 있다고 약속하지 않는다. 기본안은 신규 호출을 차단하고 진행 중 실행은 안전하게 마무리하도록 drain한 후 unload하는 것이다. 취소 가능한 작업만 명시적 cancellation contract를 제공한다.
- UI, MCP, Telegram은 각각 별도 plugin 상태를 바꾸지 않고 동일한 lifecycle capability/API에 요청한다. 설치·활성화·업데이트처럼 권한을 늘리는 작업은 사용자 확인과 host policy를 통과해야 한다.

여기서 “runtime toggle”은 앱 재시작 없이 활성 상태를 바꾸는 것을 뜻한다. 모든 plugin 코드가 안전하게 hot-unload되거나 진행 중 작업을 rollback한다는 뜻은 아니다.

### 실행 중 Install/Uninstall의 의미 제안

- enable/disable과 install/uninstall은 별도 동작이다. 앱에 미리 포함된 plugin을 목록에 붙였다 떼는 것을 “설치/삭제”라고 부르면 사용자가 기대하는 실제 package 관리와 다르므로 용어를 구분한다.
- Core Plugin이 앱 실행 파일에만 포함된다면 runtime toggle은 가능해도 package 자체의 runtime 설치/삭제는 제한적이다. 목표처럼 설치/삭제를 재시작 없이 지원하려면 외부 plugin package 위치, 무결성/호환성 검사, 실행 중 load/unload lifecycle이 필요하다.
- 설치는 plugin package를 준비하고 계약/호환성/무결성을 검증한 뒤 registry에 등록하는 단계다. 설치 즉시 활성화와 실행을 자동으로 하지 않는 것을 기본안으로 둔다.
- 제거는 우선 disable하고, 신규 dispatch와 예약 trigger를 막은 뒤 in-flight 작업을 drain한다. 그 후 plugin 파일/등록을 제거한다.
- plugin이 소유한 사용자 데이터, 발행 결과, 설정, credential, 예약 기록은 코드 파일과 같은 것으로 취급하지 않는다. 제거 시 이를 자동 삭제할지, 보존·내보내기·명시적 삭제 선택을 제공할지는 아직 설계 결정이 필요하다.
- 앱을 재시작하지 않고 lifecycle 변경을 수행하되, 외부 코드 패키지 변경이나 host 자체 업데이트가 필요한 경우에는 별도 제한을 둘 수 있다.

Node/Electron 환경에서 in-process 모듈을 완전히 unload하기 어렵다는 점을 고려해, runtime install/uninstall 요구가 확정되면 official Core Plugin도 host와 분리된 runner/process에서 실행할지 검토한다. 이 방식은 unload와 장애 경계에 유리하지만 IPC/protocol 및 운영 복잡성을 추가한다. 앱에 번들된 trusted plugin을 in-process로 관리하는 더 단순한 방식과 trade-off를 비교해야 한다.

Bundled Core Plugin은 앱에 함께 제공되며 설치·삭제 대상이 아니다. 사용자가 직접 toggle할 필요가 있는지와 무관하게 host lifecycle은 runtime enable/disable을 지원한다. 개별 update 가능성은 열어두되, 초기에는 앱 배포에 포함한다. 별도 package의 선택 설치·삭제는 Community Plugin 단계에서 검토한다.

### 확장성과 점진적 agent 발전의 결합 제안

- Plugin의 manifest/registry는 AI가 현재 설치·활성·준비된 능력을 정확히 알 수 있는 runtime source of truth가 된다. 기능 목록/help 문구를 별도로 수기 관리해 구현과 어긋나게 두지 않는다.
- Agent Runtime은 요청, 선택한 capability/plugin/version, 필요한 보완 질문, 실행 결과, 사용자 정정·평가를 구조화된 event로 기록할 수 있다. Memory는 이 근거에서 사용자 맥락과 개선 후보를 파생하고, 다음 유사 요청의 이해·선택에 필요한 정보만 제공한다.
- Plugin 실행과 권한은 registry/host가 통제한다. 대화에서 얻은 학습은 선택·설명·제안의 품질을 높이지만, 새 실행 권한이나 외부 plugin 설치를 자동으로 허가하지 않는다.
- Core Plugin 개선은 테스트·검토·버전 배포를 통해 반영한다. Agent가 자기 plugin 코드나 capability 계약을 임의로 수정하는 것을 “자가 발전”의 의미로 삼지 않는다.
- 이벤트 계약은 plugin이 개인 대화나 원고 전체를 무차별 수집하지 않도록 필요한 최소 outcome/provenance만 표현해야 한다. memory 보존/동의/삭제 정책은 기존 event-first memory 설계와 함께 다룬다.
- Plugin이 이 event 계약을 내보내면 장기적으로 공개 가능한 재사용 자산이 된다. 다만 이 FBR에서 memory engine 전체를 plugin으로 옮기지는 않는다.

### 단계적 신뢰와 외부 배포 제안

- 첫 단계는 BlogGenius가 직접 개발·검증하는 **Core Plugin**으로 한정한다. Community Plugin의 임의 코드를 설치·실행하는 기능은 이번 초기 구현 범위가 아니다.
- 다만 사용자는 개발 중 축적한 자산을 공개하고 다른 개발자와 생태계에 기여하고 싶어 한다. 따라서 독립 배포 가능성은 초기에 고려하되, 초기 설계를 외부 marketplace/다양한 host 지원에 과도하게 맞추어 지연시키지 않는다.
- 초기 계약은 private import를 줄이고 명시적 descriptor/contribution을 사용해 향후 분리 가능성을 보존한다. 실제 별도 GitHub package를 우선 만들기보다, 안정된 Core Plugin을 충분히 사용하고 나서 외부 배포성을 검증한다.
- Community 단계로 확장하기 전에는 위협 모델, 공개 API/SDK, host compatibility, package provenance/integrity, 권한/credential scope, isolated execution, update/rollback, uninstall data policy를 검증한다.
- Plugin이 Electron main process에서 실행되면 앱 사용자 권한과 credential 접근을 공유한다. Community 코드의 process isolation과 실제 OS 권한 격리는 별도의 고위험 설계 과제로 남긴다.

### Capability와 자기 설명

- 자연어 모델에 보여주는 기능 설명은 별도 수기 capability 목록이 아니라 registry에 실제 등록되고 현재 조건에서 사용 가능한 capability metadata에서 만들어져야 한다.
- 존재 여부, 활성화, 설정 충족, entitlement, 권한, 실행 가능 여부를 구분해 런타임에서 계산한다. 단순히 plugin이 설치되어 있다는 이유만으로 실행 가능하다고 설명하지 않는다.
- AI는 사용자 요청에 맞는 후보를 선택하고 부족한 정보가 있으면 질문할 수 있다. 실행 직전에는 host가 input schema, 권한, 확인 정책, 중복 방지, 상태 전이를 결정적으로 강제한다.
- capability metadata는 사람이 읽는 설명 외에도 필요한 입력, 사전 조건, 읽기/쓰기 성격, 외부 부작용, 위험/확인 요구, 지원 채널/환경을 계약으로 표현할 필요가 있다. 구체 필드는 아직 합의되지 않았다.

### Provider 축 보존

Provider형 확장은 기존 `kind + transport + config`를 보존한다. Provider는 정보를 제공하고, capability는 업무 동작을 수행한다. 예를 들어 뉴스 provider와 뉴스 조회 capability, WordPress 연결 provider와 WordPress 게시 capability를 같은 축으로 뭉개지 않는다.

### 단계별 구현 계획 제안

사용자가 제안한 실행 방식에 맞춰 **공통 parent feature branch에서 Core 경계를 세운 뒤, 실제 기능 하나씩을 짧은 sub-feature branch로 옮겨 검증하고 parent에 통합**한다. `group/set`은 먼저 추상 설계하지 않고, 독립 plugin들을 실제로 묶어 제공할 필요가 확인된 시점에 다룬다.

1. **현행 경계·계약 정리**: 기능별 caller, state/data owner, side effect, UI/API/job 기여와 의존성을 추적한다. Core가 제공할 host 계약과 plugin이 기여할 surface를 합의한다. 이 단계에서 코드를 대규모 이동하지 않는다.
2. **Core host seam 반영**: 수동 composition root에 plugin descriptor와 typed contribution을 등록할 최소 host 경계를 만든다. plugin별 기본 enable 상태, 실행 가능 상태, 의존 조건, 실패 격리와 disable 시 신규 dispatch/job 차단을 설계한다. 아직 모든 기능을 plugin화하지 않는다.
3. **WordPress publisher 첫 실전 Core Plugin**: 독립된 설정·credential 요구, capability, 발행 결과와 실패 처리를 WordPress plugin으로 분리하고 Core가 공통 계약을 통해 실행하게 한다. 기존 발행 흐름과 예약/수동 호출을 함께 검증해 host 계약의 부족한 부분을 드러낸다.
4. **계약 보완 및 후속 plugin화**: WordPress 실사용에서 확인된 결합을 Core와 plugin 경계에 반영한다. 이후 네이버 publisher, 블로그 작성 workflow, SNS/Buffer, 카드뉴스, Site Hosting/Shopping 등은 각각 독립 sub-feature로 순차 분리한다. 사용자 기능 하나씩 끝날 때마다 focused verification 후 parent에 통합한다.
5. **Skills·MCP·Telegram 연결**: 실제 registry와 plugin lifecycle을 source of truth로 삼아 AI skill metadata 및 공통 control API를 설계·연결한다. 대화 채널은 업무 로직을 중복 구현하지 않는다.
6. **Community 배포 검토**: Core Plugin 경험이 충분히 검증된 후 공개 host API/SDK, 독립 GitHub 배포, package trust/isolation/update/rollback과 선택 설치·삭제를 별도 단계로 다룬다.

Core Plugin은 초기에 앱에 번들되며 설치·삭제할 수 없다. 기본 enable 상태와 제품 UI의 노출 여부는 별개다. 개별 update 가능성은 장기 옵션으로 남기되 초기 구현에서 앱 배포와 분리하지 않는다. 독립 배포를 고려해 명시적 경계와 private import 최소화는 지키되, 첫 WordPress pilot에 별도 저장소·외부 package fixture를 요구하지 않는다.

## 주요 대안과 trade-off

### 우선 monorepo first-party module

- 장점: 기존 build/test/release와 dependency injection을 활용하고, 계약이 움직이는 동안 package/version 관리 부담이 적다.
- 단점: 별도 저장소에서 바로 설치할 수는 없고, import 경계가 약하면 내부 결합이 계속 남는다.
- 제안: 처음부터 외부 배포를 약속하지 말고 모듈 계약을 실제 사용으로 검증한 뒤 필요한 경계를 분리한다.

### 외부 코드 실행 방식

- **Host process에 외부 JS 로드**: 호출은 빠르고 직접적이지만, plugin 코드가 파일·credential·네트워크 등 host 권한을 광범위하게 얻을 수 있다. Electron 메인 프로세스의 임의 코드 실행은 첫 단계로 권하지 않는다.
- **별도 process + MCP/REST**: 권한·장애 경계를 더 명확히 하고 다른 agent에서 재사용하기 쉽지만, 프로세스 관리, 인증, transport, 배포와 오류 복구가 추가된다.
- **선언형 resource**: 가장 안전하고 단순하지만, 실행 기능을 추가할 수는 없다.
- 제안: 우선 first-party code-owned 모듈을 사용하고, 독립 배포가 필요해질 때 별도 process/표준 transport부터 검토한다. 보안 경계와 설치 모델은 아직 결정되지 않았다.

## 설계 논의가 필요한 결정

1. **실제 제품 흐름에서의 Kernel 계약**: 초기 host는 등록된 operation의 입력·출력 검증, dispatch, enable/disable 및 in-flight drain을 제공한다. 실제 제품 흐름에서 필요한 설정·credential·권한·confirmation·장기 작업·관측성 계약을 확인하고 필요한 만큼만 확장한다.
2. **제품 lifecycle과 예약 작업 연결**: 초기 host의 disable은 해당 host를 통한 신규 호출을 차단하고 진행 중 호출을 drain한다. 제품 plugin을 옮길 때 반복 job 및 예약 trigger까지 어떻게 중지·재개할지 계약을 검증한다. 진행 중 외부 부작용 rollback은 보장하지 않는다.
3. **설정/권한 scope**: plugin 설정과 credential을 앱 전역, 사용자 계정, plugin instance 중 어디에 소유시킬지 정의한다. plugin 간 credential 접근은 분리한다.
4. **개별 Core Plugin update**: 앱 전체 업데이트와 별도 배포가 필요한 시점에 version compatibility, rollback, 서명/출처 검증을 정한다. 초기 구현은 앱 배포에 포함한다.
5. **AI Skills**: plugin package와 Skill의 관계를 함께 설계한다. Skill을 작성·포함·생성·외부 agent에 노출하는 방식을 검토하되, 구체 형식은 capability/API 계약과 함께 정한다.
6. **제어 경로**: UI, MCP, Telegram이 동일한 lifecycle control API/capability를 호출하고 채널별로 별도 business logic을 갖지 않는다는 원칙을 지킨다.
7. **Community Plugin 진입 조건**: 충분한 Core Plugin 검증 이후 Community로 확장한다는 gate와 통과 기준을 정한다.
8. **자가 발전의 1차 범위**: plugin/capability 실행 관측을 event로 남기고, 기억과 capability 선택 개선에 쓰는 범위를 정한다. 자동 코드/권한 변경은 제외한다.

## 결정 및 진행 기록

- 2026-10-14: 사용자는 `dev`에서 새 branch를 만들어 plugin 구조 도입 기반을 논의·설계하자고 요청했다.
- 2026-10-14: 조사와 설계 제안부터 시작하고, 동작·저장·API 계약 변경은 설계 합의 후 진행한다.
- 2026-10-14: FBR branch `codex/fbr/plugin-architecture-foundation`을 `dev`의 `9c6c2dda`에서 만들었다.
- 2026-10-14: 현재 runtime 등록은 수동 composition이며, knowledge provider는 `kind + transport + config` 등록 패턴의 가장 가까운 선례다. 제품 디렉터리는 독립 설치형 plugin 계약을 아직 제공하지 않는다.
- 2026-10-14: 설계 초안은 monorepo first-party module부터 시작하고, 외부 executable package는 안전/호환성 계약이 검증된 후 다루는 방향을 권장한다. 아직 사용자 승인 전 제안이다.
- 2026-10-14: 사용자는 목표 구조를 Core + Core Plugin + Community Plugin으로 제시했다. Runtime 중 toggle, 제3자가 GitHub에 배포할 독립성과 완결성, AI Skills를 통한 활용, MCP/Telegram을 통한 조회·설치·사용·toggle을 지향한다.
- 2026-10-14: 제안 보완: 개발은 monorepo에서 시작해도 되지만 외부 GitHub 배포가 목표인 만큼, host API와 package 계약은 처음부터 private import 없는 외부 구현을 고려해야 한다. 내부 registry pilot만으로 독립 plugin 목표가 달성됐다고 보지 않는다.
- 2026-10-14: 제안 보완: runtime disable은 신규 dispatch/job을 차단하고 in-flight를 안전하게 drain하는 의미로 정의한다. 외부 부작용 rollback 또는 arbitrary in-process plugin의 안전한 unload를 보장하지 않는다.
- 2026-10-14: 사용자는 실행 중 enable/disable뿐 아니라 install/uninstall도 앱 재시작 없이 가능하기를 원한다. 설치 직후 활성화, 제거 시 plugin 소유 데이터 처리와 in-flight drain은 정책을 추가 논의한다.
- 2026-10-14: 사용자는 우선 BlogGenius 관리하의 Core Plugin으로 충분히 구현·시험하고, 기반 구조가 탄탄해진 뒤 Community Plugin으로 넓히기를 원한다. 독립 배포는 개발 자산을 공유하고 생태계에 기여하려는 장기 목표로 초기 고려하되, 외부 확장 요구가 초반 구현을 과도하게 제약하지 않도록 한다.
- 2026-10-14: 사용자는 Plugin을 설계할 때 Codex/Claude skill 활용 가능성을 염두에 두길 원하지만, plugin package와 skill을 구체적으로 연결하는 형식은 추가 설계 대상으로 남긴다.
- 2026-10-14: 사용자는 BlogGenius의 장기 방향을 OpenClaw 같은 확장성과 Hermes Agent 같은 자가 발전성을 결합하는 것으로 설명했다. 자가 발전은 경험을 통한 요청 이해·능력 선택·기억·개선의 진화로 해석하고, 자동 코드/권한 변경과 구분한다.
- 2026-10-14: 사용자는 Core Plugin을 앱에 번들하고, Community Plugin은 충분한 검토 후 확장하기로 했다. Core Plugin의 소스/asset은 추후 오픈소스로 배포해 다른 개발자가 참고·활용할 수 있기를 원하며, 이 목표를 초기에 고려하되 초기 구현을 과도하게 제약하지 않는다.
- 2026-10-14: 사용자는 Core Plugin이 기술적으로 runtime enable/disable 가능해야 하지만, 모든 plugin toggle을 사용자 UI에 노출하겠다는 의미는 아니라고 명확히 했다. Core Plugin은 설치·삭제하지 않고, 선택 설치·삭제는 후일 Community Plugin 단계에서 검토한다. 개별 update 가능성은 열어두되 초기 배포는 앱과 함께한다.
- 2026-10-14: 사용자는 네이버 publisher와 WordPress publisher를 각각 독립 Core Plugin으로 두고, 필요성이 실제로 드러날 때 group/set 개념을 검토하자고 제안했다. 우선 구현 경험을 통해 구조를 검증한다.
- 2026-10-14: 구현 접근 제안은 현재 parent `codex/fbr/plugin-architecture-foundation`에서 Core 경계를 정립하고, 각 실제 기능을 독립 sub-feature branch로 하나씩 plugin화하여 테스트 후 parent에 통합하는 것이다. WordPress publisher를 첫 실전 pilot으로 제안한다.
- 2026-10-14: 사용자는 완전히 빈 새 저장소로 시작하기보다 현재 저장소 안에 새 경계를 세우고 기능을 하나씩 재구현·전환하기로 했다. 기존 코드는 동작 요구사항과 검증 근거로 참고하되 새 구조의 제약으로 삼지 않는다.
- 2026-10-14: 계층을 **Platform Kernel → Application → Plugin**으로 정리했다. Kernel은 실행·계약·lifecycle을 통제하고, Application은 제품 사용 흐름을 조합하며, Plugin은 경계가 있는 기능 operation을 제공한다. 채널은 공통 Agent Runtime을 통해 요청을 전달한다.
- 2026-10-14: 첫 수직 슬라이스의 범위로 최소 실행 가능한 host, 예시 Application, fake generator/publisher, focused contract tests를 승인했다. 실제 제품 기능 이전과 외부 서비스 호출은 이 단계에서 제외했다.
- 2026-10-14: 첫 수직 슬라이스는 `codex/feat/platform-kernel-application-boundary`에서 구현해 `19f670d0`으로 parent에 병합했다. `node --test src/platform/plugin-host.test.js` 6건과 `git diff --check`가 통과했다. 전체 단위 테스트는 실행하지 않았다.
- 2026-10-14: WordPress pilot sub-feature는 [`2026-10-14-wordpress-publisher-plugin-pilot-development.md`](2026-10-14-wordpress-publisher-plugin-pilot-development.md)에서 추적한다. 기존 `Core.publishToWordPress()` 호출은 수동/빠른 발행, 예약/미리보기 확정, 콘텐츠 일괄 발행에서 사용된다. 새 package는 인증 및 media/category/post REST operation을 소유하고, Application은 준비된 content/assets, category matching, status fallback과 결과 조립을 소유한다. 기존 제품 경로는 변경하지 않는다.

## 다음 단계

1. WordPress pilot에서 확인된 실제 제품 manuscript/image/settings adapter 요구를 정리한다. 기존 이미지 최적화 및 영구 자산 캐시는 현재 Core/config 책임에 엮여 있어 이행 설계가 필요하다.
2. 별도 sub-feature에서 제품의 한 진입 경로를 새 Application으로 연결하고 기존 경로와 비교한다. 수동·예약·일괄 발행을 한 번에 옮기지 않는다.
3. 각 단계는 focused tests/review를 거쳐 parent에 통합한다. 전체 테스트 및 parent의 dev 통합은 별도 승인과 검증 gate를 거치며 Community package 배포는 후속 단계다.

## 검증과 남은 위험

- Parent에는 최소 실행 기반과 WordPress provider package/Application pilot이 있다. 제품 코드 경로는 새 계층으로 전환되지 않았다. 현재 operation parser는 신뢰된 in-process 코드이며, 외부 plugin을 안전하게 실행하는 sandbox나 안정된 독립 SDK는 아니다.
- 첫 sub-feature 검증: `node --test src/platform/plugin-host.test.js` 6건 통과, `git diff --check` 통과. UI/entrypoint 변경이 없어 browser smoke는 해당되지 않았다. full unit suite는 실행하지 않았다.
- WordPress pilot 검증: `node --test packages/plugins/core/wordpress-publisher/index.test.js src/applications/wordpress-publishing.test.js src/platform/plugin-host.test.js` 14건 통과; `npm pack --dry-run`과 `git diff --check` 통과. 전체 단위 테스트 및 UI smoke는 실행하지 않았다.
- 남은 위험: 실제 제품의 credential/readiness/permission, 확인 정책, 예약 작업, 취소·재시도·중복 방지, observability와 data ownership이 초기 contract에 아직 반영되지 않았다. 외부 plugin trust model, 버전 호환성·rollback, 권한 격리, process isolation, 독립 package 경계도 별도 검증이 필요하다.
