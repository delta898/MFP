# Telegram 대화 경험 고도화 FBR

- Branch: `codex/fbr/telegram-conversation-enhancement`
- Start date: 2026-10-13
- Base/parent branch: `dev` (`88cee431`)
- Status: Telegram route 단일화 완료; 전체 unit/UI 검증 통과, `dev` 통합 준비 완료. 앱 core/plugin 구조와 capability 자기설명 계약은 별도 0.7.0 목표

## 사용자 필요와 목표

Telegram 연결과 pairing 경험을 개선한 다음 단계로, BlogGenius를 Telegram으로 사용할 때 대화가 더 자연스럽고 이어지며 실제 BlogGenius 작업에 도움이 되도록 개선 방향을 정한다.

사용자는 단순한 명령 응답 봇이 아니라, 유용한 대화가 쌓일수록 사용자를 더 잘 이해하고 모르는 주제를 조사·판단하며 근거가 있는 기억과 유추 능력을 축적하는 구조를 원한다.

사용자는 요청한 답만 돌려주는 단방향 도구보다, 요청에 먼저 응답하면서 더 나은 방법이 보이면 제안·권유·추천을 덧붙이는 쌍방향 대화를 원한다. 제안은 요청을 대체하지 않고 승인 없이 실행하지 않는다.

이번 FBR은 구현 전에 이 학습 경험의 구조와 경계를 설계한다. 여기서 학습은 모델 가중치를 매 대화마다 자동 재학습하는 뜻이 아니라, 사건·기억·지식·capability 선택을 누적해 런타임 행동이 점진적으로 개선되는 것을 뜻한다.

## 범위

- Telegram inbound의 연결·인증, 메시지 해석, 기억 검색, capability 실행, 확인, 응답 흐름을 현재 코드 기준으로 정리한다.
- 이미 동작하는 기능과 현재 구조의 마찰·중복 경로를 구분한다.
- 빠른 글감 수집, 상태 조회, 초안·발행 보조, 자동화 알림, 긴 작업의 데스크톱 인계 등 사용 시나리오를 비교한다.
- 대화에서 Telegram이 맡을 역할과 첫 구현 slice를 사용자와 결정한다.

## 명시적 비목표

- 논의가 끝나기 전 코드·설정·저장 데이터 변경
- 그룹/채널 연결 지원 확대
- 새 provider, MCP transport, 일반 플러그인 시스템 구현
- Telegram을 모든 BlogGenius UI 기능의 대체 화면으로 만드는 작업
- 사용자 동의 없는 실제 Telegram 메시지 발송 또는 외부 계정 변경

## 현행 구조 조사

### 연결과 메시지 수신

- 최근 별도 개발에서 Bot Token 확인, 검증된 bot username 기반 `t.me` deep link, private 1:1 대화의 일회성 pairing code, 만료, 내부 Chat ID 저장을 구현했다. 사용자는 pairing이 잘 동작한다고 확인했다.
- outbound 알림과 inbound 대화는 설정에서 별도 제어한다. inbound는 승인된 Chat ID만 처리하고 Telegram long polling을 사용한다.
- pairing 중에는 같은 Bot Token의 기존 polling을 잠시 멈추고 pairing이 끝나거나 만료·취소된 뒤 조건에 따라 기존 inbound polling을 복원한다.

### 현재 대화 처리 경로

```text
Telegram update
  → 허용된 Chat ID 확인
  → slash command (/start, /help) 처리
  → 좁은 정규식 기반 인사말 응답 (hi/hello/안녕/반가워; "하이"는 미포함)
  → 구형 콘텐츠 등록·발행 정규식에 일치하면 Core parser로 이동
  → 그 외: 고정 Agent help 구문 → deterministic parser → memory retrieval → Agent parser(LLM)
  → Agent envelope를 Planner와 Capability Registry로 검증
  → Runtime이 실행 또는 확인 대기 상태를 만들고 Telegram UI로 응답
  → Agent가 처리하지 않으면 별도의 Core.parseTelegramRequest(LLM) 및 legacy dispatcher로 fallback
```

- 먼저 인사말과 일부 도움말을 정규식으로 바로 처리한다. 나머지는 우선 Agent 경로를 타며, capability를 찾지 못하면 기존 `Core.parseTelegramRequest`가 다시 별도 LLM 분류를 수행할 수 있다. 따라서 인식 불가 요청은 두 parser 호출을 거칠 수 있다.
- 인사말 regex는 `하이`를 포함하지 않는다. 화면의 `하이!`는 단순 인사 응답에서 빠져 Agent parser로 넘어가고, 처리 결과가 비어 있으면 Core parser로 이어진다. 화면의 “의도를 정확히 파악하지 못했습니다”는 Core parser가 빈 actions를 반환할 때 보내는 문구다. 즉 이 사례는 자유 대화 기능이 부족한 점과 이중 parser fallback이 사용자에게 드러난 것이다.
- Agent parser는 코드에 적힌 허용 capability 목록과 메모리 일부를 프롬프트로 받아 action envelope를 만든다. action schema와 registry가 capability 존재/type 및 개수 제한을 검사하고, Planner가 순서·사전 조건·확인 방식을 만들며, Runtime이 capability를 실행한다. 변경/작업 실행은 각 capability의 confirmation policy에 따른다.
- 기억은 전체 대화 transcript를 매번 보내는 방식이 아니다. event store에서 최근 메시지·event·action, 설정 변경, preference, pending confirmation 등을 묶은 bounded context를 만든다. parser는 그중 recent event 6개, message 4개, action 4개, setting change 4개, preference 5개, pending request 3개까지만 prompt에 넣는다. 장기 메모리에는 owner 활동·주제·artifact 정보도 있으나 parser prompt에 전부 직렬화되지는 않는다.
- 기능 경계는 단일 목록이 아니다. Agent parser의 capability allowlist, registry에 실제 등록된 capability, `Core.parseTelegramRequest`의 legacy action/dispatcher, `/help`, Agent help 응답이 각각 다른 목록과 표현을 가진다. 예를 들어 Agent help는 설정 조회/변경·추천·글감·트렌드 수집을 안내하지만, 글감 등록·발행은 별도 legacy content 경로가 처리한다. help가 Telegram 전체 기능 인덱스는 아니다.
- 설정 변경, 트렌드 수집처럼 영향을 주는 작업은 capability 기반 preview/confirmation 흐름을 사용할 수 있다. 콘텐츠 등록/발행은 legacy mapper와 별도 callback/confirmation 흐름도 함께 존재한다.
- 따라서 우선 개선 대상은 개별 greeting 문구만이 아니라 메시지 route의 단일성, capability/help의 단일 source of truth, 미지원·모호한 요청의 응답 정책, parser fallback의 비용·관측성이다.
- Telegram의 현재 상위 목적은 빠른 글감 저장, 결과 알림, 단순 승인, 복잡한 작업의 BlogAnywhere handoff로 backlog에 적혀 있다. 이 항목은 아직 향후 재정의 과제다.

## 합의된 방향과 설계 초안

- 2026-10-14: 사용자는 BlogGenius가 정해진 if/then 응답을 넘어, 유용한 대화가 쌓일수록 질문을 더 잘 이해하고 조사·판단·기억·유추하는 방향에 동의했다.
- 기대 결과는 사용자를 더 잘 이해하고, capability를 더 정확히 고르며, 반복된 실패를 개선 제안으로 바꾸는 것이다.
- 첫 설계 주제는 (1) 모르는 질문을 조사·판단·기억으로 연결하는 흐름, (2) 무엇을 기억하고 다음 요청에 어떻게 재사용할지다.
- Telegram은 channel adapter로 두며 주 제어 경로는 `Agent Runtime → Capability Registry → Memory`로 유지한다. 지식 조회는 `kind + transport + provider config` 모델을 따른다.

### 모르는 질문 처리

1. **요청 이해**: AI가 요청과 관련 맥락, 사용 가능한 capability/knowledge catalog를 살펴 답변, 기억 검색, 외부 조사, 실행 준비, 추가 질문 중 다음 단계를 선택한다. “모른다”는 종료 문구가 아니라 route 선택의 시작이다.
2. **기억 검색**: 사용자에 관한 기억과 과거 근거를 먼저 찾는다. 기억이 없다는 사실을 외부 세계의 사실로 오인하지 않는다. 기억이 상충하거나 오래되었으면 확정 사실처럼 쓰지 않는다.
3. **조사 여부와 방법 선택**: 안정적이고 보편적인 질문은 모델이 바로 답할 수 있다. 최신성·정확한 출처가 중요한 질문은 등록된 provider 중 요청의 `kind`에 맞는 읽기 capability를 고른다. BlogGenius 앱에 일반 웹 조사 provider가 없으면 Codex 같은 실행 환경의 도구를 앱 자체 능력인 것처럼 가장하지 않는다.
4. **출처 확인**: 조사 답에는 출처명, 링크, 조회 시점을 남긴다. 공식·원문 출처를 우선하고, 출처가 엇갈리거나 결과가 빈약하면 그 사실과 불확실성을 설명한다. 중요한 결론이나 논쟁적 주장은 가능하면 독립된 출처 둘 이상으로 교차 확인한다. 고정 횟수를 매 요청에 강제하지는 않는다.
5. **응답 구성**: 먼저 결론을 주고, 필요하면 확인된 사실·추론·미확인 부분을 구분한다. 실제 provider 조회가 성공하지 않았다면 “조사했다”고 표현하지 않는다. 의도 모호성이 실행 선택을 바꿀 때 우선 확인 질문을 한다.
6. **대화 보완**: 사용자의 정정·추가 설명·선택과 답변/실행 결과를 원래 요청과 연결해 event로 기록한다. 정정은 이전 답을 조용히 덮어쓰는 대신 바뀐 근거를 남긴다.
7. **기억 후보 생성과 재사용**: 조사로 얻은 세계 지식은 출처와 freshness를 가진 knowledge snapshot 후보로, 사용자에 관한 정보는 별도 memory 후보로 다룬다. 두 종류를 섞지 않고, 후속 요청과 관련 있을 때만 제한된 근거와 함께 재사용한다.

#### 조사 결과의 저장 정책 초안

- 매번 조사한 내용을 영구 지식으로 승격하지 않는다. 변동 정보는 provider/source, 조회 시각, 유효기간 또는 재조회 필요성을 가진 snapshot으로 보관하고, 만료된 snapshot은 새 답의 유일한 근거로 쓰지 않는다.
- 사용자가 “이 내용도 기억해”라고 하거나 반복 사용 가치가 확인된 경우에만 장기 참고 후보로 올린다. 세계 사실과 사용자 선호는 계속 별도 유형으로 유지한다.
- provider가 없거나 실패했거나 결과가 부족한 경우에는 조사 실패 자체를 관측 event로 남기되, 모르는 원인을 외부 사실이나 사용자 선호로 만들어내지 않는다.

### 기억과 개선의 경계

- **사건(event)**: 질문, 답변, 조사 결과, 정정, 실행 결과를 출처·시점·대화/작업 식별자와 함께 먼저 기록한다. 사건이 근거의 원본이다.
- **작업 맥락(working context)**: 현재 대화/작업을 이어가는 임시 정보다. 이번 요청에 한정된 지시는 여기서만 유효하며 장기 선호로 승격하지 않는다. 제안 기본값은 대화 원문 맥락을 최대 90일 보존한 뒤 삭제하는 것이다. 이 기간은 사용자 합의 전 설계값이다.
- **사용자 기억(memory projection)**: 사용자 사실, 명시적 선호, 작업 관례, 반복 패턴을 event로부터 도출한다. 기억마다 유형, 적용 범위, 근거 event, 출처(직접 진술/정정/반복 관찰/추론), 확신도, 마지막 근거 시점, 상태(active/candidate/superseded), 재확인 필요성을 가진다.
- **일회성 지시와 명시적 기억 요청**: “이번 글에는 …” 같은 지시는 현재 작업에만 적용한다. “앞으로 …로 해줘/기억해줘”처럼 범위가 명확한 직접 요청은 강한 근거로 즉시 active 선호로 둘 수 있고, 시스템은 무엇을 기억했는지 짧게 알린다. 비밀값은 일반 기억에 저장하지 않는다.
- **암묵적 선호**: 추론만으로 확정하지 않는다. 초안 기준은 서로 다른 대화/작업에서 독립 근거 3회 이상 관찰되면 candidate로 올리고, 사용자 확인 또는 이후 근거가 있어야 active로 승격하는 것이다. 단일 정정은 현재 응답을 바로 교정하지만 영구 일반화는 별도로 판단한다.
- **지식(knowledge)**: 일반 세계 사실을 사용자 기억과 분리한다. 출처·publisher·조회 시각·freshness를 보존한다. 외부 정보는 관찰 사실의 근거일 뿐 사용자 선호의 근거가 아니다.
- **충돌·노후화**: 기존 근거를 수정해 없애지 않고 새 event를 추가한 뒤 projection을 갱신한다. 최근의 명시적 정정은 오래된 암묵 추정보다 우선한다. 오래된 선호는 낮은 확신으로 쓰거나 관련 요청에서 재확인한다.
- **열람·수정·잊기**: 사용자는 기억을 열람·수정하거나 “잊어줘”로 삭제할 수 있어야 한다. event-first는 앱 내부에서 근거를 덮어쓰지 않는 기본 원칙이지 삭제 불가 약속이 아니다. 삭제 시 기억 projection과 연결된 식별 가능한 원문/파생값을 삭제 또는 비식별화하고, 복구 불가능한 최소 tombstone을 남길지는 개인정보 정책에서 정한다.
- **개선 신호**: 실패·정정·되묻기·낮은 유용성 피드백을 구조화해 기록한다. 한 번의 실패는 사례로만 남기고, 비슷한 실패가 독립된 2개 이상 대화에서 3회 이상 생기면 개선 candidate를 만든다. 사용자가 명시적으로 개선을 요청하면 횟수를 기다리지 않는다.
- **개선 candidate 수명주기**: `observed → clustered → proposed → approved → implemented → validated`로 추적한다. 모델은 원인과 해결 방향을 제안할 수 있지만 capability 권한·provider·코드·배포를 스스로 변경하지 않는다. 기억/선택의 적응과 제품 코드 변경도 구분한다.
- **능력 확장**: 기존 capability의 설명·기억·선택을 개선할 수 있지만, 새 실행 권한·provider·코드·plugin은 검토와 승인, 배포를 거쳐 등록한다. 대화만으로 임의 코드를 생성·배포하지 않는다.
- **로직의 역할**: 의도 해석과 capability 선택은 AI 중심으로 둔다. 권한, schema, 확인 요건, 중복 방지와 상태 전이처럼 항상 지켜야 하는 경계는 결정적 로직으로 검증한다.
- **비용/효율**: 매번 전체 transcript를 모델에 넣지 않고 관련 기억과 필요한 조사 단계만 호출한다. 구조 검증과 권한 검사는 작은 결정적 코드로 유지한다.

#### 성공 여부를 판단할 지표 초안

- 맞는 capability/답변 route 선택률과 잘못된 실행 비율
- 근거 없는 단정의 비율, 조사 출처 링크·조회 시각의 완전성
- 사용자가 같은 설명을 반복하거나 정정해야 하는 빈도
- 기억이 관련 요청에 정확히 적용된 비율과 오래되거나 충돌한 기억으로 인한 오답
- 불필요한 추가 질문, 중복 parser/model 호출, 요청당 처리시간과 모델 비용

정확도 향상을 위해 if/then 분기를 계속 추가하는 대신 route 선택·검색 결과·사용자 정정의 관측을 통해 개선할 단계를 찾는다.

### 합의가 필요한 정책 제안

1. **보존 기간**: 임시 대화 원문은 90일 후 삭제, 구조화된 사용자 기억은 수정/삭제되거나 근거가 갱신될 때까지 유지하는 안이다.
2. **기억 승격**: 명시적 “기억해줘”는 즉시 active, 암묵 선호는 서로 다른 대화/작업에서 3회 관찰 후 candidate로 만들고 확인/추가 근거 후 active로 하는 안이다.
3. **실패 승격**: 비슷한 실패 3회/2개 이상 대화에서 candidate를 만들고, 명시적 개선 요청은 즉시 candidate로 기록하는 안이다.
4. **삭제 동작**: 잊어달라는 기억의 원문 event까지 식별 가능하게 보존하지 않는 것을 기본으로 하되, 감사용 tombstone을 둘지 결정한다.
5. **첫 구현 slice**: 정책 합의 후 “자유 질문을 일반 대화 route로 받아, 필요한 기억/knowledge를 검색하고 근거·불확실성을 표시해 답하기”를 먼저 할지, 실패 관측·개선 candidate부터 할지 정한다.

#### 권장 구현 순서(아직 승인 전)

1. **대화 route 단일화**: Telegram의 인사말·도움말·Agent parser·legacy parser 경계를 정리해 자연어 질문이 의도 분류 실패만으로 끝나지 않게 한다. 실행 요청은 기존 Registry/Planner/Runtime 안전 경로로 넘기고, 일반 질문은 대화 답변 경로에 둔다.
2. **기존 기억으로 답변 보완**: 현재 Memory retrieval을 답변 맥락에 맞게 검색하고, 답에 사용한 기억의 출처/확신도를 내부적으로 추적한다. 저장 후보 생성은 위 승격 규칙을 적용한다.
3. **조사 capability 추가**: 앱이 실제로 호출 가능한 일반 조사 provider가 있는지 먼저 확인한다. 없으면 별도의 `kind=general_research` provider를 설계하고, `transport`와 provider config를 등록해 출처가 붙는 읽기 조사만 제공한다. 앱 밖 실행 도구를 가장해서 연결하지 않는다.
4. **학습 관측과 개선 제안**: route 실패·정정·기억 사용 결과를 집계해 개선 candidate를 만들고, 사용자가 검토하는 화면/흐름을 별도 단계로 추가한다.

첫 hands-on slice는 1~2단계로 한정하는 것을 권한다. 일반 조사 provider와 개선 candidate UI를 한 번에 넣으면 provider 정책, 비용, 보존 정책까지 동시에 검증해야 하므로 단계별 사용자 검증이 어려워진다. 이 순서는 설계 제안이며 구현 범위로 승인된 것은 아니다.

## 결정과 trade-off

- 2026-10-13: 사용자는 최근 개선된 Telegram 연결 다음으로 Telegram 대화를 고도화하고 싶으며, 새 FBR에서 현황을 파악하고 논의하길 요청했다.
- 2026-10-13: 이번 요청은 조사·설계 논의 단계로 시작한다. 구체적인 사용자 흐름과 첫 slice를 합의하기 전에 구현을 확장하지 않는다.
- 2026-10-14: 사용자는 유용한 대화가 쌓일수록 이해·조사·판단·기억·유추가 나아지는 방향에 동의했다. 개별 인사말 예외를 더하기보다 대화 처리와 학습 구조를 먼저 설계한다.
- 2026-10-14: 학습은 모델 가중치를 무검토로 변경하는 것이 아니라, 근거 event와 기억 projection을 통해 다음 런타임 행동이 개선되는 것으로 정의한다. 새 capability와 권한 증가는 명시적 검토·승인 경계에 둔다.
- 2026-10-14: 기억 범주, 명시/암묵 선호 승격, 조사 출처와 freshness, 반복 실패 candidate 수명주기, 원문 보존 기간의 구체 정책 초안을 작성했다. 수치(90일·3회)는 사용자 승인 전 제안값이며 확정 정책이 아니다.
- 장기 agent-redesign 및 internal API redesign 계획을 대체하지 않는다. 이 FBR은 Telegram에서 체감되는 대화 경험과 기존 capability 연결을 중심으로 범위를 정한다.

## 첫 구현 단계

- 2026-10-14: 사용자는 학습/기억 정책 구현 전에 자연어 대화 route 단일화를 먼저 진행하기로 했다.
- 구현은 하위 기록 [Telegram 자연어 대화 경로 단일화](2026-10-14-telegram-conversation-routing.md)와 branch `codex/feat/telegram-conversation-routing`에서 진행했다.
- Sub-feature는 greeting shortcut, legacy 콘텐츠 정규식 우회, Agent 실패 후 두 번째 Core LLM parser 호출을 제거하고 한 parser contract에서 `agent | legacy | reply | unsupported`를 선택하도록 했다. legacy 실행 adapter와 사용자 확인 흐름은 유지한다.
- 요청에 직접 답한 뒤 도움이 될 때만 별도 제안을 허용한다. 제안은 자동 실행하지 않는다.
- 추가 사용자 성향/최근 주제 데이터를 외부 모델 요청에 포함하려는 시도는 자동 승인 검토에서 차단되어 적용하지 않았다. 기존 bounded retrieval packet 외의 데이터 전송은 별도 합의 사항으로 남긴다.
- 2026-10-14: 사용자는 route 단일화를 0.6.1에 포함해 dev에 통합·배포하고, core와 확장 기능의 모듈 구조, runtime capability 설명 계약, 그 기반의 Telegram 고도화를 0.7.0 목표로 진행하기로 했다.
- 2026-10-14: “저장만” 요청이 발행 준비 대기열로 들어가는 의미 문제와 오래된 Trend capability 안내는 route 단일화만으로 해결되지 않는다. 사용자는 이를 capability/구조 변경과 함께 0.7.0 목표로 다루기로 했으며, 0.6.1 후보의 알려진 제한으로 기록한다.

## 다음 단계

1. 0.6.1 대상 Telegram route 단일화를 전체 검증했고 `dev` 통합을 준비했다. 버전 변경과 release 준비는 별도 사용자 요청으로 진행한다.
2. `v0.7.0` 설계는 core 기능과 plugin 확장 경계, capability가 자기 설명·필수 입력·가용 조건·확인/부작용 계약을 함께 제공하는 방식부터 다룬다.
3. 그 구조를 바탕으로 기능 목록과 실제 실행 가능성의 일치, 정보 부족 시 질문, 사용자 memory/context 적용, 조사·학습 개선을 단계적으로 설계한다. 보존·승격·삭제 수치(90일·3회)는 여전히 미확정 제안값이다.

## 검증 및 남은 위험

- 전체 unit suite: 2,256 통과, 2 skip, 0 실패. 테스트 명령은 `node scripts/run-unit-tests.js`이며 보안 audit은 이번 unit/UI 요청 범위에서 제외했다.
- UI API smoke (`test:ui-blog-auto`, `test:ui-settings`), UI E2E (`test:ui-e2e`), 브라우저 smoke (`test:ui-browser`) 모두 통과했다. 브라우저 smoke는 fixture 요청 426건, 페이지 오류 0건이었다.
- Routing sub-feature의 parser, legacy mapper, Telegram renderer focused tests 7건과 syntax/diff checks도 통과했다. 상세 진행과 제품 제한은 하위 기록을 참조한다.
- 0.6.1 범위에서는 runtime capability 설명의 자동 동기화와 불명확 요청의 보완 질문을 완성하지 않는다. 0.7.0 구조 변경에서 해결할 명시적 후속 범위다.
- 이후 구현은 기존 Telegram parser/planner/runtime/capability/memory contract, pairing의 polling 소유권, 자동 발행 알림 경계와 UI/desktop handoff 영향을 확인한다.
- 최종 사용자 acceptance는 합의한 Telegram 대화 시나리오를 사용자가 실제 앱에서 확인한다.
