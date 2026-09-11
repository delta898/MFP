# 쇼핑커넥트 공통 글감 생명주기 계약 개발 기록

## Branch

- Branch: `codex/feature/design-system-shopping-connect-11-04a-lifecycle-contract`
- Base/parent branch: `codex/feature/design-system-shopping-connect-11`
- Start date: 2026-09-11
- Status: 완료·병합 준비

## 사용자 필요와 목표

Blog Beta와 쇼핑커넥트는 콘텐츠 목적과 생성 입력만 다르고, 글감의 보관·대기열·발행·결과
생명주기는 같아야 한다. Shopping의 기존 legacy 목록·일괄 발행 경로를 한 번에 제거하지 않고,
공통 lifecycle 경계와 콘텐츠별 adapter를 먼저 정착시킨다.

## 단계 계획

1. **4A — 공통 계약과 adapter 경계**: 행별 발행 계획, lifecycle 실행 요청·결과, Blog/Shopping
   adapter의 책임을 명시하고 Shopping 저장 모델을 이 계약에 맞춘다.
2. **4B — Shopping lifecycle 실행 이관**: 대기열 단건 실행을 공통 runner API로 옮기고, 저장된
   발행 계획을 사용하게 한다. 기존 batch runtime은 Shopping adapter 뒤에서 재사용한다.
3. **4C — 편집 UI 계약 이관**: Shopping 글감 수정 화면을 Blog Beta 새 작성 화면과 같은
   disclosure·field token으로 이관하고, 글 구성·발행 설정을 저장된 lifecycle plan에 연결한다.

## 4A 범위

- 콘텐츠 종류에 독립적인 lifecycle execution contract와 adapter interface
- Shopping 행의 발행 계획 보존·검증 경계
- 기존 Blog Beta runner와 Shopping batch runtime을 adapter로 연결할 수 있는 서비스 의존성 설계
- 단위·route·contract 테스트

## 명시적 비범위

- 실제 원격 발행 또는 유료 AI 호출
- 연속 발행 scheduler의 Shopping 적용
- 기존 Shopping legacy 실행 경로의 즉시 삭제
- UI 대규모 재배치

## 설계 원칙

- 공통 lifecycle은 상태 전이·계획·실행 상태만 소유한다.
- Blog/Shopping별 원고 준비와 상품 추출은 adapter가 소유한다.
- Naver·WordPress 같은 발행 provider 호출은 하위 실행 계층에 남긴다.
- 새 계약으로 대체된 legacy 호출만 후속 단계에서 제거하며, 실행 동작을 동시에 바꾸지 않는다.

## 진행 기록

- `content-lifecycle-adapter`를 추가했다. adapter registry는 `blog`, `shopping` 콘텐츠 종류를
  구분하되, 행 식별자·저장된 delivery plan·실행 옵션이라는 같은 입력 계약을 받는다.
- 기존 Blog Beta runner는 이 adapter를 통해 기존 `executeBlogRowAction`을 호출하도록 옮겼다.
  요청 payload와 실행 옵션을 그대로 보존하므로 사용자 동작은 바꾸지 않았다.
- Shopping 글감을 Sheet에 append할 때 delivery target을 options의 `platforms`로 함께 저장한다.
  Shopping 행 조회도 이 값을 `targets`로 복원한다. 이후 대기열 실행은 화면의 현재 선택 대신 이
  저장된 계획을 adapter에 전달할 수 있다.
- Shopping adapter는 아직 UI나 route에서 실행하지 않는다. 4B에서 대기열 단건 실행을 이 adapter로
  연결하며, 이 단계에서는 기존 batch runtime을 제거하지 않는다.
- 4B에서 `POST /api/v1/continuous-publishing/shopping/runner/start`를 추가하고, 쇼핑 대기열의
  `지금 포스팅`을 이 경로로 이관했다. 이 API는 발행 준비 상태를 다시 읽고, 행에 저장된 delivery
  target이 없으면 실행하지 않는다.
- Shopping adapter는 기존 batch runtime을 호출한다. 따라서 현재의 환경·라이선스·사용량·발행 provider
  보호 장치를 보존하면서도, batch의 결과를 단건 lifecycle 결과로 정규화한다.
- WordPress만 저장한 글감은 Naver 로그인 세션을 요구하지 않도록 기존 batch 사전 검증도 대상 채널에
  맞게 보정했다.
- 기존에 발행 대상 없이 대기열로 이동한 행이 실제 실행 시에야 실패하는 문제를 발견했다. 이제 대상이
  없는 행은 목록에 `발행 대상 없음`으로 표시하고, `지금 포스팅` 대신 `발행 대상 선택`으로 편집기를
  연다. 보관함에서 대기열로 이동하거나 편집기에서 대기열 상태를 저장할 때도 대상 하나 이상을 요구한다.
  대상은 기존 `options.platforms`에 저장되며, queue가 화면의 임시 선택값을 추측하지 않는다.

## 검증 및 남은 위험

- focused 테스트 76건 통과: adapter 계약, 저장된 대상 복원, Shopping runner route/service,
  대기열 상태 재검증, WordPress 단독 실행의 Naver 세션 비요구를 확인했다.
- 브라우저 fixture UI smoke test 통과: fixture 요청 250건으로 Shopping 대기열 UI 회귀를 확인했다.
- 대상 없는 대기열 항목의 수정 흐름과 Sheet options 갱신을 다루는 focused 테스트 30건을 추가로
  통과했다.
- 쇼핑 대기열의 `지금 포스팅`은 사용자가 시작한 단건 lifecycle 실행인데도 기존 batch의 자동 발행
  환경 정책을 타는 회귀가 있었다. adapter가 `manualTrigger`를 명시적으로 전달하도록 바꾸고 batch
  runtime도 Blog Beta와 같은 수동 실행 정책을 적용했다. 따라서 Development에서 수동으로 시작한
  임시 저장은 환경 차단 전에 실행 흐름으로 진입하며, 자동 실행·공개 발행의 기존 차단 정책은 유지한다.
- 위 정책 전달을 포함한 adapter·runner·runtime focused 테스트 56건이 통과했다.
- 4A·4B 결과는 `66886f9 feat: unify shopping topic lifecycle execution`으로 커밋했다.

## 4C 편집 UI 이관 범위

- 기존 compatibility modal을 새 글쓰기 화면의 접이식 `글 구성`, `발행 설정` 패턴으로 교체한다.
- 상품명·상품 URL·경험/방향은 항상 보이고, 글쓰기 전략·글의 초점은 `글 구성`에 둔다.
- 저장된 발행 대상·카테고리·발행 방식·예약 일시는 `발행 설정`에 둔다.
- 기존 행 상태 전이와 Sheet options 저장 계약은 유지하며, 발행 대상 없는 대기열 전이는 계속 막는다.
- Blog Beta의 legacy 수정 modal 자체는 이번 범위에서 변경하지 않는다. 새 작성 화면의 안정된
  component token을 Shopping 편집에 적용하는 것이 목적이다.

## 4C 진행 기록

- Shopping 수정 modal을 compatibility grid와 blue custom select에서 분리했다. 새 작성 화면과 같은
  `blog-next-field`, `blog-next-disclosure`, `ui-select-shell` token으로 상품 기본 정보와 두 설정
  영역을 구성했다.
- `글 구성`은 글쓰기 전략과 글의 초점을, `발행 설정`은 발행 대상·카테고리·발행 방식·예약 일시와
  lifecycle 상태를 편집한다. 요약 문구와 예약 일시 활성화 상태도 현재 선택에 맞춰 갱신한다.
- 행 수정 API와 Sheet options merge에 글쓰기 전략·글의 초점을 연결했다. 따라서 수정 후 재조회해도
  설정값이 사라지지 않는다.
- focused 테스트 31건이 통과했다. 새 모달의 실제 레이아웃은 브라우저 회귀 테스트와 사용자 확인이
  남아 있다.
- Shopping 빠른 글 작성에도 Blog Beta와 같은 `글감 보관`·`발행 대기열에 추가`·`바로 포스팅`
  세 행동을 제공했다. 가운데 행동은 외부 발행 없이 Sheet에 `발행 준비 완료` 상태와 저장된 대상·발행
  계획을 함께 기록한다. 대상이 없으면 저장 전에 거부한다.
- 이 동작을 포함한 service·UI contract focused 테스트 46건이 통과했다.
- 외부 발행은 수행하지 않았다. 사용자의 실제 대기열 단건 포스팅 확인이 남아 있다.
- 빠른 글 작성의 빈 상품 미리보기는 일반 사각 기호 대신 제품 맥락의 쇼핑백 아이콘으로 교체했다.
  세 빠른 행동은 필수 상품 정보와 각 행동에 필요한 발행 계획이 갖춰지기 전까지 비활성화한다.
  비활성화는 작업 진행을 뜻하지 않으므로 Blog Beta와 Shopping 모두 금지 커서를 사용한다.
- 전체 단위 검증 1,645건 통과(Windows 전용 1건 skip), 브라우저 fixture 회귀 258개 요청 통과.
  새 Shopping 수정 modal의 compatibility containment 기대와 미정의 높이 토큰도 전체 검증 중 발견해
  새 token 경계에 맞게 바로잡았다.

## 최종 결과와 수동 확인

- Shopping의 작성·보관·대기열·단건 발행은 Blog Beta와 동일한 lifecycle 계획과 사용자 행동 모델을
  사용한다. 제품 정보와 쇼핑 전용 원고 입력만 Shopping adapter에 남긴다.
- 실제 외부 포스팅은 수행하지 않았다. Development에서 임시 저장 대기열 항목 하나를 선택해
  `지금 포스팅` 후 상태·로그·대기열 갱신을 확인하는 수동 점검만 남아 있다.
