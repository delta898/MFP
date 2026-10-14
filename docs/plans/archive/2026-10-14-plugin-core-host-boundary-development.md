# Core Host Boundary Sub-feature

- Branch: `codex/feat/plugin-core-host-boundary`
- Start date: 2026-10-14
- Base/parent branch: `codex/fbr/plugin-architecture-foundation`
- Status: 완료; `codex/fbr/plugin-architecture-foundation`에 `eac3b631`로 병합됨

## 사용자 필요와 목표

장기 plugin 구조의 첫 구현 단계로 BlogGenius의 Core Host와 업무 Plugin이 맡을 책임을 실제 코드 조립 경계에 반영한다. 이후 WordPress publisher를 독립 Core Plugin으로 분리할 때 재사용할 최소한의 등록·조립 기반을 마련한다.

## 범위

- 현재 runtime composition root와 capability/API/job registration 흐름을 조사한다.
- Core Host가 소유할 공통 책임과 plugin contribution 경계를 작은 계약으로 정한다.
- 앱에 번들된 first-party Core Plugin을 명시적으로 등록하고, enable 상태가 신규 capability dispatch 가능 여부에 반영되는 최소 구조를 구현한다.
- API route, UI surface, provider, background job contributions는 실제 WordPress pilot에서 요구가 확인되기 전까지 이 단계에서 추상화하지 않는다.
- 현재 기능은 대규모로 이동하지 않는다. WordPress publisher 분리는 별도 sub-feature로 둔다.
- 관련 개발 기록 및 canonical 문서 변경을 코드와 함께 유지한다.

## 비목표

- WordPress/Naver/SNS/Card News 등 제품 기능 자체의 plugin화
- Community package 설치·삭제, marketplace, 외부 executable 코드 로딩
- 사용자용 전체 plugin 관리 화면이나 모든 plugin toggle 노출
- plugin package의 개별 업데이트/서명/rollback
- Skills, MCP, Telegram을 통한 plugin 제어의 구현
- release, version bump, commit, merge, push

## 초기 설계 가정

- Core Plugin은 앱에 번들되며 설치·삭제하지 않는다.
- Core Plugin은 기술적으로 runtime enable/disable 가능하되, 기본 상태와 사용자 UI 노출은 별도 정책이다.
- Host가 registry와 lifecycle의 source of truth이고, plugin은 선언된 typed contribution만 제공한다.
- disable은 capability의 신규 조회/실행을 즉시 막고, 이미 시작된 capability 실행이 끝날 때까지 기다린다. job/route 생명주기는 이 host가 관리하지 않는다.
- 모든 runtime registry는 같은 bundled Core Plugin catalog를 사용하되, UI/Telegram/MCP의 registry 인스턴스와 plugin별 context는 실행 환경별로 분리한다. 활성 상태는 현재 registry 인스턴스 메모리에만 있다.
- 이 단계에서는 기존 기능 대부분을 유지하고 등록 경로만 먼저 정리한다.

## 구현·검증 단계

1. Agent, API route, scheduler/job composition root와 기존 registry의 caller/data flow를 추적한다.
2. capability/provider/API/job contribution 중 pilot에 필요한 최소 계약을 설계한다. 지나친 범용 manifest를 만들지 않는다.
3. host가 번들 plugin을 조립하는 seam을 구현하고 기존 동작과 기본 활성 상태를 보존한다.
4. plugin 활성/비활성 및 미등록 contribution 경계에 대한 focused tests를 실행한다.
5. UI/API 경로 또는 작업 dispatch에 영향이 있으면 해당 UI regression/smoke를 실행하고 수동 검증 흐름을 정리한다.
6. 변경 범위와 기록을 갱신하고 parent branch와 비교 검토한다. parent 통합 전 broad unit suite 승인은 별도로 요청한다.

## 의사결정 및 변경 기록

- 2026-10-14: 사용자는 parent `codex/fbr/plugin-architecture-foundation`에서 sub-feature를 하나씩 개발하고, 검증 후 parent에 통합하는 흐름에 동의했다.
- 2026-10-14: 첫 단계는 Core Host와 Plugin 경계를 실제 구조에 반영하는 작업이다. WordPress publisher plugin화는 후속 sub-feature로 분리한다.
- 2026-10-14: WordPress와 Naver publisher는 각자 독립 Core Plugin으로 두는 방향을 parent 설계 제안에 반영했다. 이 sub-feature에서는 publisher 구현을 이동하지 않는다.
- 2026-10-14: 공통 `CORE_PLUGIN_DEFINITIONS` catalog를 두고, 각 process의 registry는 같은 정의를 각자 host에 조립한다. UI와 MCP가 한 in-memory host를 공유하지 않는다.
- 2026-10-14: plugin contribution에는 전체 capability dependency 객체를 넘기지 않고 `corePluginContexts[pluginId]`로 명시한 context만 전달한다.
- 2026-10-14: disable 시 신규 capability dispatch를 즉시 차단하고 in-flight `execute`가 끝날 때까지 drain한다. 이 보장은 capability execute 범위이며 background job 전체 생명주기에는 적용되지 않는다.

## 완료 결과

- `src/plugins/core-host.js`에 번들 Core Plugin descriptor 등록, capability contribution, 기본 enable 상태, runtime enable/disable 및 중복 등록 방지를 구현했다.
- `src/capabilities/index.js`가 host를 통해 capability를 조회·나열하고, plugin capability를 enable 상태로 gate하도록 연결했다.
- Plugin 정의는 `src/plugins/catalog.js` 한 곳에서 관리하고, capability registry는 registry caller가 별도 plugin 목록을 전달하지 않도록 공통 catalog를 사용한다.
- Plugin은 전체 registry dependency를 받지 않고, 명시된 plugin-scoped context만 받는다. disable은 새 실행을 막고 기존 capability execution을 drain한다.
- UI, Telegram, MCP의 registry는 각자 독립 인스턴스지만 같은 registry factory/catalog를 사용한다. enable 상태는 process/registry 간 공유되거나 재시작 후 저장되지 않는다.
- 현재 제품 capability는 계속 Core-owned다. 등록된 user-facing Core Plugin은 아직 없고, 실제 기능 이동은 WordPress pilot 단계에서 시작한다.
- `docs/architecture/overview.md`에 host의 현행 범위와 아직 남은 수동 composition root를 기록했다.

## 검증 및 남은 위험

- `BLOGGENIUS_ENV=local node --test src/plugins/core-host.test.js src/capabilities/core-plugin-host.test.js src/knowledge/naver-news-bridge.test.js src/knowledge/naver-trends-bridge.test.js` — 15 tests passed.
- 환경 변수를 지정하지 않은 첫 시도는 기존 OAuth environment validation에서 실패했다. 변경 코드와 무관한 실행 조건 문제였으며, local environment로 재실행해 통과했다.
- `git diff --check`, `node --check src/plugins/core-host.js`, `node --check src/plugins/catalog.js`, `node --check src/capabilities/index.js` 통과.
- capability host만 구현되어 있어 plugin별 scheduler/job start-stop, API route/UI contribution, provider ownership과 해당 실행들의 drain은 아직 지원하지 않는다. 현재 drain은 capability `execute` 호출만 대상이며 timeout도 없다. WordPress pilot 설계에서 필요한 최소 계약과 장기 실행 처리 기준을 추가로 검증해야 한다.

## WordPress pilot 전 남은 설계

- capability enable/disable만 host가 통제한다. UI/API route와 scheduler/background job은 기존 composition root에서 별도로 시작되므로, 이를 포함한 하나의 plugin lifecycle은 아직 아니다. WordPress pilot에서 실제 필요한 contribution 유형과 start/stop/drain 순서를 정한다.
- 활성 상태는 registry 인스턴스별 메모리 값이다. 재시작 후 유지 여부와 여러 process 간 일관성은 아직 제품 동작으로 정하지 않았으며, 필요성이 확인된 뒤 결정한다.
- Host는 in-process 코드 경계이며 community plugin sandbox가 아니다. 외부 plugin 설치/삭제 및 실행 격리는 범위 밖이다.
- 현재 기존 capability는 계속 Core-owned이며 plugin catalog는 아직 비어 있다. 따라서 이 구현은 Core/Plugin 제품 경계를 완성한 것이 아니라 첫 host seam이다.
