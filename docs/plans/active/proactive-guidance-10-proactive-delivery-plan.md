# Proactive Guidance Stage 10: Proactive Delivery

## Status

- Phase: implementation, automated verification and user UI review completed
- Parent integration branch: `feature/proactive-guidance-main`
- Branch: `feature/proactive-guidance-10-proactive-delivery`
- Version: unchanged during feature work
- Review gate: completed; parent integration pending

## Objective

Stage 9의 bounded recommendation refresh를 앱 시작과 background schedule에서 재사용해 Dashboard가
추천 생성의 시작점이 되지 않도록 한다. 외부 provider 지연·오류가 앱 시작과 다른 workflow를 막지
않아야 하며, 재시작이나 일시 중단 뒤에도 과도한 catch-up 호출을 만들지 않는다.

## Runtime Boundary

- `RecommendationDeliveryScheduler`는 trigger, timing, backoff와 최소 delivery state만 소유한다.
- Memory, Knowledge, producer, policy와 materialization은 Stage 9 refresh service를 그대로 호출한다.
- 앱 시작은 HTTP listen과 브라우저 open을 기다리지 않고 background timer만 예약한다.
- scheduler는 UI, Telegram 또는 capability payload를 알지 않는다.

## Schedule Policy

- 기본 활성화, 기본 평가 주기 4시간, 시작 지연 0초. 서버 listen 뒤 다음 event-loop에서 평가를
  시작하되 외부 조회 완료를 기다리지 않으므로 HTTP server와 브라우저 시작을 막지 않는다.
- 마지막 성공과 다음 실행 시각은 `data/recommendation-delivery-state.json`에 원자적으로 저장한다.
- 재시작 시 아직 주기가 남았으면 남은 시간만 기다리고, overdue이면 시작 지연 뒤 한 번만 catch-up한다.
- 동시에 하나의 평가만 실행하고, 반복 timer가 밀려도 backlog를 여러 번 실행하지 않는다.
- provider 진단이 degraded이거나 평가가 실패하면 5분부터 지수 backoff하되 정상 주기를 넘지 않는다.
- Recommendation daily cap, cooldown과 dedupe는 Stage 7 policy가 계속 최종 통제한다.

## UI Behavior

- Dashboard 센터 명칭은 `뜻밖의 발견`으로 하고 Serendipity 소재와 키워드에 집중한다.
- 설정·복구·workflow 후보의 backend producer와 lifecycle은 향후 다른 delivery surface에서 재사용할 수
  있도록 유지하지만, 빈 상태가 대부분인 `필요한 안내` 영역은 Dashboard에서 노출하지 않는다.
- Serendipity는 특정 근거 하나에 과도하게 맞추지 않는다. 한 번의 발견 묶음은 Naver Trends,
  최대 7일 범위의 Naver News, 저장·선택·작성·발행으로 확인된 사용자 기록에서 각 1개를 우선
  선택한다. 개인화와 비개인화 재료를 함께 써서 관련성과 뜻밖의 만남을 동시에 보존한다.
- `새로운 발견`은 GET 재조회가 아니라 명시적 POST action이다. 현재 탐색 항목은
  `recommendation.rotated`로 기록하며 `관심 없음`이나 부정 피드백으로 학습하지 않는다.
- 카드 제목은 소재 자체에 집중하고 발견 경로를 작은 맥락 label로 표시한다.
- 모든 content 카드에 반복되던 `글감 발견` label은 표시하지 않는다. source label은 `트렌드 키워드`,
  `뉴스 소재`, `내 기록`으로 축약해 제목과 분리된 동일 위치에 표시한다.
- desktop/tablet의 같은 grid row 카드는 stretch하고 action 영역을 아래에 정렬해 내용 길이가 달라도
  카드 높이와 버튼 위치를 일관되게 유지한다. mobile은 불필요한 빈 공간을 피하도록 자연 높이를 쓴다.
- Dashboard에서는 효용이 낮은 24시간 `나중에` 동작을 숨기고 `소재 적용하기`와 `관심 없음`만 제공한다.
- `관심 없음`은 카드를 먼저 비우지 않는다. 서버가 기존 카드에서 source lane과 News transport를
  파생해 동일 세부 출처, 동일 lane, 다른 근거 있는 발견 순으로 한 건만 보충하고 UI는 같은 자리를
  교체한다. 이 보충은 AI와 SerpApi collector를 호출하지 않는다.
- `소재 적용하기`는 빠른 발행 주제를 교체하며, 외부 제목 전체를 감싼 직선·스마트 따옴표는 제거하되
  제목 내부의 인용 표현은 보존한다.
- 발견 카드는 desktop 3열, 중간 폭 2열, mobile 1열이며 한 번에 최대 3개를 노출한다.
- 원시 점수 경쟁으로 한 source가 세 자리를 독점하지 않도록 Trends, News, 사용자 기록에 각 1석을
  예약한다. 사용할 수 없는 source가 있을 때만 다른 source의 미노출 후보가 빈자리를 채운다.
- News는 과학, 생활, 여행, 음식, 환경, 건강, 예술, 교육 등 서로 다른 탐색 domain 세 개를 bounded하게
  조회한다. 다음 요청은 domain 묶음과 기사 순서를 함께 순환하므로 최신 기사만 반복하지 않으며,
  News 조회는 최대 3회로 유지한다.
- source별 누적 노출 수를 독립 offset으로 사용해 Trends 키워드, News domain/article, 사용자 기록 주제가
  각각 다음 후보로 이동한다. 동일 topic과 기존 dedupe key는 한 묶음에서 다시 선택하지 않는다.
- Trends와 사용자 콘텐츠 활동은 최근 7일 근거를 우선하고, 후보 순환이나 부족 시 최대 14일까지
  유효한 발견 재료로 사용한다. 14일을 넘은 근거와 미래 timestamp는 제외한다.
- Recommendation의 24시간 노출 TTL은 source 유효기간과 별개다. 이는 오래된 Dashboard 카드를
  정리하는 전달 정책이며, 7~14일 근거를 하루만 유효하다고 축소하는 의미가 아니다.
- 사용자가 명시적으로 요청한 발견은 background daily delivery cap과 분리하되, 후보 수·kind별 노출 수와
  provider query 수는 계속 bounded하게 유지한다.
- 초기 HTML은 `추천 없음`을 확정적으로 표시하지 않고 `추천을 확인 중` 상태를 표시한다.
- background 평가 결과는 기존 30초 Dashboard refresh, focus/visibility refresh와 명시적 새로고침에서 노출한다.
- toast는 Stage 9의 unseen Recommendation 규칙을 그대로 사용하며 작업 중인 화면을 강제로 전환하지 않는다.

## Generative AI Cost Boundary

- startup, background schedule, Dashboard 진입, `새로운 발견`은 생성형 AI를 호출하지 않는다.
- 재료는 event-first Memory, Naver Trends, Naver News와 deterministic producer/policy뿐이다.
- 외부 Knowledge API quota는 사용할 수 있지만 Gemini/OpenAI 등 텍스트 모델 비용은 발생시키지 않는다.
- 향후 AI 확장은 별도 사용자 action, 예상 사용량 표시와 확인/예약 경계를 통과해야 한다.
- delivery와 discovery runtime의 금지 dependency를 자동 테스트로 검증한다.

## Configuration

- `RECOMMENDATION_DELIVERY_ENABLED` (default `true`)
- `RECOMMENDATION_REFRESH_INTERVAL_MIN` (default `240`, bounded `30..1440`)
- `RECOMMENDATION_STARTUP_DELAY_MS` (default `0`, bounded `0..60000`)

초기 단계에서는 별도 설정 UI를 추가하지 않는다. 운영 기본값과 config contract를 먼저 안정화한다.

## Tests

- startup delay, future schedule reuse와 overdue single catch-up
- successful interval scheduling, degraded/failure exponential backoff
- concurrent run coalescing and stop/restart timer cleanup
- persisted state validation and atomic write boundary
- full unit and browser UI regression
- rotation lifecycle, discovery POST boundary, 3-source reserved slots/fallback/rotation과
  generative-AI-free dependency guard

## Deferred to Stage 11

- funnel/latency/provider cost metrics와 정책 weight learning
- 사용자별 delivery 시간대와 방해 최소화 학습
- 장기 duplicate/orphan audit와 replay repair
