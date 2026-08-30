# 연속 발행 Stage 2 — 빠른 등록과 최소 Queue Vertical Slice

## 브랜치 정보

- branch: `feature/continuous-publishing-02-quick-queue-slice`
- 시작일: 2026-08-30
- base/parent branch: `feature/continuous-publishing-main`
- 상태: 완료 · parent 통합 승인

## 사용자 필요와 목표

`블로그 Beta > 빠른 글 작성 > 바로 생성`에서 글감을 입력하고 AI 호출 없이 Topics Sheet에
`대기` 또는 `발행 준비 완료`로 저장한 뒤, 새 발행 대기열 화면에서 즉시 확인할 수 있게 한다.
이 vertical slice는 새 UI가 기존 legacy controller 없이 개인 저장소와 끝까지 연결됨을 검증한다.

## 범위

- 바로 생성 입력 폼의 최소 필드와 글감별 발행 계획
- `글감 저장`과 `발행 대기열에 추가`의 서로 다른 상태 계약
- 기존 Topics application/service 경계 재사용 여부 확인 및 필요한 canonical API 보완
- `발행 준비 완료` Topics의 FIFO 최소 목록
- 저장 성공 후 다음 글감을 빠르게 등록할 수 있는 form reset과 명확한 결과 안내
- 발행 대상·예약 입력의 사전 검증
- 기존 블로그 화면과 새 화면의 구조·브라우저 회귀 테스트

## 비목표

- AI 원고 생성, preview와 바로 포스팅
- Queue 행 수정, 순서 변경, 제외와 재시도
- timer 기반 연속 발행 consumer
- 원고 폴더와 원고 붙여넣기의 Queue 저장
- Trends/RSS 자동 승격

## 설계 원칙

- UI는 새 `blog-next-*` module에서 구현하고 legacy DOM이나 handler를 호출하지 않는다.
- Topics Sheet와 현재 server runtime의 검증된 gateway를 재사용하되, 전역 자동 발행 설정으로 글감 계획을 보완하거나 덮어쓰지 않는다.
- `글감 저장`은 불완전한 아이디어도 허용하고 `대기`로 저장한다.
- `발행 대기열에 추가`는 글감, 발행 대상, 글감별 실행 방식과 예약 시각을 검증하고 `발행 준비 완료`로 저장한다.
- 두 액션 모두 원고 생성, 이미지 생성, quota 소비와 플랫폼 발행을 수행하지 않는다.
- Queue는 Topics Sheet의 `발행 준비 완료` projection이며 별도 데이터를 복제하지 않는다.

## 진행 기록

- 2026-08-30: Stage 1 승인·parent 통합 후 Stage 2 브랜치를 생성했다.
- 2026-08-30: 기존 `quick-publish`는 저장·생성·발행 책임이 결합되어 있어 새 Queue 등록에 직접 재사용하지 않기로 했다.
- 2026-08-30: Topics Sheet gateway만 재사용하는 `continuous-publishing` service/controller/route 경계를 추가했다.
- 2026-08-30: `글감 저장`은 `대기`, `발행 대기열에 추가`는 입력 검증 후 `발행 준비 완료`로 저장하도록 구현했다.
- 2026-08-30: Queue는 `발행 준비 완료` Topics를 행 번호 오름차순으로 조회하며 별도 저장소나 복제 상태를 만들지 않는다.
- 2026-08-30: 새 UI에 글감별 플랫폼·카테고리·전략·이미지·외부 참고·공개/초안/예약 계획과 최소 Queue 목록을 연결했다.
- 2026-08-30: 사용자가 Local에서 `글감 저장 → 대기`와 `발행 대기열에 추가 → Queue 표시`를 직접 확인했다.
- 2026-08-30: 기존 빠른 포스팅의 글감 추천·키워드 탐색·AI 제목 추천은 이번 최소 저장 slice에 섞지 않고, 새 UI의 독립 입력 보조 기능으로 후속 연결하기로 확인했다.
- 2026-08-30: Stage 2 결과를 사용자가 승인했다. 커밋과 parent 통합은 별도 요청을 기다린다.
- 2026-08-30: 사용자가 커밋, parent 통합과 하위 브랜치 삭제를 승인해 완료 기록을 archive로 이동했다.

## 검증 계획

- 입력 정규화와 ready validation unit test
- API contract에서 저장 액션이 AI·발행을 호출하지 않는지 test
- Topics fixture 기반 Queue projection test
- 브라우저 smoke에서 `대기` 저장, Queue 추가와 목록 갱신 확인
- 관련 집중 test 후 전체 unit regression

## 완료 결과

- `바로 생성`에서 불완전한 아이디어를 `대기`로 안전하게 보관할 수 있다.
- 발행 계획이 완성된 글감은 AI 호출 없이 `발행 준비 완료`로 저장되고 Queue에서 즉시 확인된다.
- 기존 `블로그` DOM/controller와 `quick-publish` 실행 경로를 호출하지 않아 안정 화면과 새 흐름의 side effect를 분리했다.
- 글감 등록에는 AI 모델, 이미지 생성, 라이선스 quota와 플랫폼 발행 dependency가 없다.
- domain/service/UI 집중 테스트 20건, 전체 unit 1,152건과 fixture browser smoke 60 requests로 두 등록 액션, payload, Queue 갱신을 검증했다.

## 수동 확인과 남은 위험

- 실제 Google Topics Sheet의 `대기` 저장과 `발행 준비 완료` Queue 표시를 사용자가 확인했다.
- Queue의 행 수정·제외·재시도는 Stage 3 범위다.
- 글감 추천·키워드 탐색·AI 제목 추천은 기존 legacy DOM controller를 호출하지 않고 새 application API 경계로 연결해야 한다.
- 기존 자동 발행기가 글감의 `post_status`를 전역값으로 덮어쓰는 경로는 runner 통합 전에 제거해야 한다.
- 여러 PC의 동시 claim과 예약 시각 경계 정책은 후속 runner 설계에서 다룬다.
