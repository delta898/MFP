# 원고 보기 모드 원문 표시 개발 기록

- Branch: `codex/feat/manuscript-image-view-mode`
- Start date: 2026-09-29
- Base/parent branch: `codex/feat/manuscript-image-block-ui-polish`
- Status: 구현 완료, 사용자 hands-on 검토 대기
- Parent feature: [원고 이미지 블록 UI 고도화](2026-09-29-manuscript-image-block-ui-polish-development.md)

## 사용자 필요와 목표

블록/Markdown 편집기와 별도로 제공되는 `보기` 모드는 발행 결과로 변형하는 것이 아니라, 현재 원고의 이미지와
이미지 프롬프트를 있는 그대로 확인하는 화면이어야 한다. 사용자는 이미지 asset을 이미지로, prompt를 일반 텍스트로
표시하기로 결정했다.

## 범위

- Blog Beta 원고의 `보기` 모드에서 이미지 asset은 실제 이미지로 표시한다.
- 이미지 프롬프트는 해석·변환하지 않고 원문 텍스트로 표시한다.
- 이미지 asset이 없는 경우 파일 누락용 대형 placeholder가 원고 내용을 대신하지 않게 한다.
- 기존 Draft 데이터/발행 계약 및 편집 모드는 변경하지 않는다.

## 비범위

- 발행 시 이미지 없는 블록을 어떻게 처리할지 변경
- 발행 플랫폼별 HTML/Markdown 출력 변경
- 보기 모드의 시각 디자인 전면 개편 또는 발행 사이트 픽셀 단위 재현

## 설계 및 결정

- 사용자는 `보기`에서 콘텐츠를 그대로 보여주는 방향을 승인했다: image는 image, prompt는 원문 text.
- 표시 기준을 구체화했다: 이미지 asset이 있으면 **이미지만** 보여주며 title과 prompt는 숨긴다. 이미지가 없으면
  내부 표식이나 title을 보여주지 않고 prompt 원문만 텍스트로 표시한다. 이미지의 title은 보이는 캡션 대신 접근성용
  `alt`에만 남긴다.
- 실제 발행 규칙은 이번 변경에서 임의로 결정하지 않는다.

## 진행 및 검증

- 최초 구현은 실제 이미지가 있어도 제목과 prompt를 함께 노출했다. 사용자 검토에서 합의와 다름을 확인해 수정 중이다.
- 최종 renderer는 이미지가 있으면 `<img>`만 보여주고 title은 alt에만 유지한다. 이미지가 없을 때만 prompt 원문을
  HTML escaping 후 텍스트로 표시하며, 줄바꿈 보존을 위해 `white-space: pre-wrap`을 적용한다. title과 누락 placeholder는
  보기 결과에서 숨긴다.
- 검증: `node --test scripts/blog-next-baseline-contract.test.js scripts/manuscript-image-workspace-contract.test.js`
  23/23 통과, `node --check ui/scripts/features/blog/draft-inputs.js`, `git diff --check` 통과.
- `npm run test:ui-browser`는 보강한 prompt-only/image-only browser assertion을 통과하고 Legacy Blog/Shopping 단계까지
  진행했으나 기존 fixture 요청 순서 assertion에서 예상한 `POST /api/v1/google-oauth/test`가 없어 실패했다
  (`scripts/test-ui-browser-smoke.js:5412`).
  이번 보기 렌더링과 무관한 기존 smoke 이슈로 판단한다.
- 사용자 검토에서 이미지가 있는 경우 title/prompt 캡션이 보이는 것이 합의와 다르다는 점을 확인했다. 브라우저 smoke 회귀에
  두 상태를 고정했다: 이미지 없는 경우 prompt만 보이고, 이미지가 있는 경우 image만 보이며 title/prompt는 보이지 않아야 한다.

## 남은 작업

- 사용자 hands-on 검토: 이미지가 있는 블록, 이미지 없이 prompt만 있는 블록, prompt 줄바꿈이 있는 블록을 각각 `보기`로
  전환해 이미지/원문 텍스트 표현을 확인한다.
