# 원고 이미지 작업 흐름 개선 Main 개발 기록

- Branch: `codex/manuscript-image-workflow`
- Start date: 2026-09-29
- Base/parent branch: `dev`
- Status: Stage 1 `/image` 완료, Stage 2 title/prompt 생성과 WordPress 이미지 발행을 사용자 확인; sub-feature parent 통합 후 다음 slice 진행 중

## 사용자 필요와 목표

범용 블록 에디터 기능을 넓히기보다 블로그 작성에서 가장 시간이 많이 드는 이미지 작업을 줄인다. 원고의 원하는
위치에 이미지 블록을 빠르게 추가하고, 후속 단계에서 주변 문맥에 맞는 이미지 제목과 생성 프롬프트를 준비해 기존
AI 이미지 생성·로컬 이미지 선택 흐름으로 자연스럽게 연결한다.

## 범위

- Stage 1: 블록 편집기에서 `/image`로 기존 `manuscriptImage` 블록 삽입
- Stage 2: 이미지 블록에서 주변 원고 문맥을 이용한 title·prompt 생성
- 바로 생성·원고 폴더·원고 붙여넣기의 공통 원고 작업공간과 stable block ID·Draft revision 계약 재사용
- 단계별 focused contract와 reviewable browser regression 검증

## 비범위

- 범용 Notion식 블록 에디터 전환
- 문단·제목·목록·인용의 공통 이동·삭제·복제 UI
- `/image` 외 서식 slash command 확대
- 블록 삽입 즉시 비용이 발생하는 AI 요청 자동 실행
- 기존 이미지 생성·선택 transport 교체

## 사용자 결정과 설계 원칙

- BlogGenius의 원고 편집기는 범용 블록 조작보다 블로그 이미지 작업 효율에 집중한다.
- 첫 단계는 `/image` 하나만 지원하고 기존 상단 `이미지 추가` 진입점을 유지한다.
- slash command는 기존 image command와 `manuscriptImage` node를 재사용하며 별도 이미지 모델을 만들지 않는다.
- title·prompt 생성은 독립된 두 번째 sub-feature로 진행한다. 이미지 블록 삽입만으로 AI 요청을 시작하지 않는다.
- AI 제안 실패나 재요청은 마지막 유효 title·prompt·image를 지우지 않아야 한다.

## 단계와 진행

1. `/image` slash command
   - Sub-feature record: `2026-09-29-manuscript-image-slash-command-development.md`
   - Status: 구현·focused contract 완료, 사용자가 정상 동작을 확인함
2. 이미지 블록 작업 UI
   - Sub-feature record: [아카이브 개발 기록](../archive/2026-09-29-manuscript-image-block-ui-development.md)
   - Status: parent 병합 및 사용자 hands-on 확인 완료
3. 프롬프트 품질 및 입력량 최적화
   - 다음 sub-feature로 시작 예정. 생성 로그의 문맥/응답 길이를 바탕으로 입력 경량화와 출력 품질을 다듬는다.

## 검증 계획

- 각 단계에서 변경 모듈의 focused test와 editor bundle build를 우선 실행한다.
- `/image` 단계는 키보드 선택·취소, 커서 위치 삽입, stable ID, Markdown 왕복, undo/redo와 세 원고 진입점 공유를 검증한다.
- UI review slice가 완성되면 관련 browser smoke를 한 번 실행한다.
- Parent를 `dev`에 병합하기 전 full unit suite는 사용자 승인을 받은 뒤 실행한다.

## 결과와 남은 작업

- 공통 Tiptap 편집기에 image 전용 slash suggestion과 기존 이미지 블록 삽입 경로를 연결했다.
- Stage 1의 editor bundle build와 focused static contract는 통과했다.
- Stage 2는 설정된 글쓰기 모델과 현재 원고 상태를 사용한 title/prompt 생성 요청을 연결했다. 자세한 문맥 선택,
  동작 및 검증 결과는 아카이브 sub-feature record에 기록했다.
- 사용자가 재테스트해 title·prompt 생성과 WordPress 이미지 업로드/본문 삽입이 정상 동작함을 확인했다.
- 원고/이미지 단위·계약 테스트 69개가 통과했다. Browser smoke는 새 이미지 UI 확인 후 기존 slash 상호작용 단계에서
  실패해, `dev` 통합 전 재검증이 남아 있다.
- 최종 browser smoke는 새 이미지 UI 구간을 지난 뒤 기존 slash 상호작용 단계에서 실패했고, 전용 browser 실행은 Chrome
  abort로 미완료다. focused slash static contract는 통과했으며 `dev` 통합 전에 브라우저 재검증한다.
- 전체 unit suite는 parent를 `dev`에 병합하기 전 사용자 승인을 받아 별도로 실행한다.
