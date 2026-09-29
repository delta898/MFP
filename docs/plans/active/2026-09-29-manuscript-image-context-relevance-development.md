# 원고 이미지 문맥 관련성·입력 효율 개발 기록

- Branch: `codex/feat/manuscript-image-context-quality`
- Start date: 2026-09-29
- Base/parent branch: `codex/manuscript-image-workflow`
- Status: 구현 완료, 사용자의 문맥 관련성 hands-on 확인 대기
- Parent feature: [원고 이미지 작업 흐름 개선](2026-09-29-manuscript-image-workflow-development.md)

## 사용자 필요와 목표

이미지 제목·프롬프트를 생성할 때 해당 이미지 블록이 놓인 원고 문맥과 결과가 맞아야 한다. 생성 요청 로그만으로는
선택된 문맥이 적절했는지 알기 어려우므로, 블록 연결 및 선택 문맥을 확인하고 불필요한 입력은 줄인다.

## 범위

- 원고의 stable block ID와 선택된 이미지 slot의 대응을 검증한다.
- 대상 이미지 주변에서 현재 문맥에 맞는 heading/본문 발췌를 선택하도록 보완한다.
- 프롬프트 입력/응답 길이를 내용 노출 없이 관찰할 수 있는 진단 신호를 제공한다.
- 문맥 정밀도를 유지하는 범위에서 중복 지시와 빈 입력을 줄인다.
- provider-specific 토크나이저를 추가하지 않고 문자 수를 근사치 신호로 유지한다.

## 비범위

- 입력 원고나 프롬프트 본문을 로그에 저장하거나 노출
- AI 요약을 추가 호출해 문맥을 압축
- 사용자 선택형 문맥 편집기 또는 모델 선택 UI
- 이미지 생성 provider, 비용 정책, 출력 데이터 계약 변경
- 기존 `블로그` surface 변경

## 설계와 trade-off

- 앞선 단계에서 사용자는 그 순간의 원고와 현재 제목·프롬프트 및 추가 요청을 참고하되, 이전 생성 내용을 누적하지
  않기로 결정했다. 이 계약은 유지한다.
- 현재 구현은 대상 주변 문단과 섹션을 결정적으로 선택하고 길이를 제한한다. 추가 AI 요약은 요청 비용과 복잡도를
  높이므로 사용하지 않는다.
- 사용자가 공유한 사례 화면에서 강릉 숙소 원고와 서울 빵집 이미지 문구가 함께 보여 관련성 문제가 의심된다.
  이는 데이터 전달 또는 기존 제목·프롬프트 영향인지 아직 분리되지 않았으므로, 우선 block/slot/문맥 선택을 확인한다.
- 로그에는 본문 내용 대신 선택된 문맥의 길이와 출처/위치를 나타내는 최소한의 구조 정보만 기록한다.
- 제목·프롬프트가 원고 주제와 충돌할 때 원고 문맥을 우선하고, 사용자가 추가 요청에서 주제를 명시적으로 바꾸는
  경우에만 이를 허용한다.

## 구현 단계

1. prompt 생성 API에 도달하는 원고, block ID, slot ID 및 당시 필드 값의 흐름을 추적한다.
2. 현재 context extractor가 대상 블록에서 실제 어떤 구간을 선택하는지 결정적 contract로 확인한다.
3. 잘못 연결되거나 범위가 과도하면 source-of-truth 기준으로 선택 알고리즘을 수정한다.
4. 요청 조립을 간결하게 하되 현재 내용·추가 지시·이미지 결과 계약을 보존한다.
5. 관련 contract/unit 검증과 Blog Beta UI regression을 실행하고 사용자가 실제 문맥 관련성을 확인한다.

## 진행 및 검증

- 새 slice 시작 전에 parent의 title/prompt·WordPress 이미지 흐름을 사용자가 확인했다.
- 이전 slice의 prompt 길이 로그는 통과하지만, 전체 browser smoke는 slash 상호작용 후속 단계에서 실패한 제한이 있다.
- context selection을 content 도메인 helper로 분리하고 stable block ID 우선, legacy/no-ID slot의 source index fallback을
  구현했다. 위치를 찾지 못하면 문서 첫 부분을 임의로 보내지 않고 409로 실패한다.
- 주변 문단 선택 시 Markdown의 빈 줄이 만든 빈 segment를 세던 문제를 수정했다. 이전 구현은 block 앞의 마지막
  실제 문단 하나만 선택하거나, block 뒤에 있는 문맥을 빈 줄만 보고 놓칠 수 있었다. 다음 heading부터는 문맥 탐색을
  멈추고 중간의 다른 이미지 block은 문단 선택에서 건너뛴다.
- 이전 제목/프롬프트와 추가 요청은 계속 전달하되 비어 있는 선택 필드는 요청 JSON에서 생략하고 지시문을 간결하게
  정리했다. 원고 내용은 로그에 남기지 않고, 블록 매칭 방식/순번 및 각 입력 길이만 로그에 남긴다.
- 새 context/service contract 테스트 5개가 통과했다. 실제 모델 품질은 사용자의 해당 강릉 원고 재테스트로 확인해야 한다.
- headed browser smoke에서 AI 생성 조작을 관찰해도 외부 호출/과금이 발생하지 않도록 Playwright browser context를 localhost fixture origin으로 제한했다. 이 정책은 headless/headed 공통이며 UI가 AI 조작을 눌러도 응답은 fixture 서버에서만 온다. 외부 요청(예: 폰트 CDN, RSS widget)은 차단하고 별도 계측한다.
- 네트워크 격리를 적용한 `npm run test:ui-browser`는 Blog Beta 원고 편집 구간까지 진행했고, 기존 slash-command 시나리오의 `waitForFunction` timeout에서 실패했다 (`scripts/test-ui-browser-smoke.js:4612`). 차단 정책 때문에 fixture/API 흐름이 외부로 나가지 않는 점은 확인했으며, 이 기존 시나리오 실패는 이번 안전장치와 별도다.

## 남은 위험

- 기존 title/prompt가 부정확한 주제로 채워진 경우, 이를 의도 참고자료로 전달하면 원고 문맥보다 우선될 수 있다.
- 길이 진단만으로는 모델이 실제로 어떤 신호에 주의를 기울였는지 알 수 없으며, 최종 결과의 적합성은 hands-on 검증이 필요하다.
- 인접 문단 선택은 결정적이고 보수적인 휴리스틱이다. 한 섹션 안의 급격한 주제 전환은 여전히 모델 입력에 포함될 수 있다.
