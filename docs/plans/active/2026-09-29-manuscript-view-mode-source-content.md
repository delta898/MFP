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
- 기존 이미지 제목/대체 텍스트 처리 여부는 구현 경계와 접근성을 확인해 확정한다.
- 이미지가 없을 때 prompt만 있으면 prompt 원문을 읽을 수 있어야 하며, 실제 발행 규칙을 이번 변경에서 임의로 결정하지 않는다.

## 진행 및 검증

- 기존 renderer는 이미지 파일이 없을 때 `이미지 파일 없음` 상자를 표시하고 이미지 제목과 prompt를 figure caption으로
  보여줬다. Blog Beta 보기에서는 실제 이미지가 있는 경우에만 `<img>`를 렌더하고, 없는 경우에는 제목과 원문 prompt를
  텍스트로 표시하도록 바꿨다. 누락 placeholder는 제거했다.
- prompt는 HTML escaping 후 텍스트로만 출력하고, 줄바꿈을 보존하도록 `white-space: pre-wrap`을 적용했다. 이미지가 있는
  경우 제목은 기존처럼 alt/caption에 유지하며 prompt는 별도 원문 텍스트로 표시한다.
- 검증: `node --test scripts/blog-next-baseline-contract.test.js scripts/manuscript-image-workspace-contract.test.js`
  23/23 통과, `node --check ui/scripts/features/blog-next/draft-inputs.js`, `git diff --check` 통과.
- `npm run test:ui-browser`는 원고 이미지 흐름을 포함해 Legacy Blog/Shopping 단계까지 진행했으나 기존 fixture 요청 순서
  assertion에서 예상한 `POST /api/v1/google-oauth/test`가 없어 실패했다 (`scripts/test-ui-browser-smoke.js:5405`).
  이번 보기 렌더링과 무관한 기존 smoke 이슈로 판단한다.

## 남은 작업

- 사용자 hands-on 검토: 이미지가 있는 블록, 이미지 없이 prompt만 있는 블록, prompt 줄바꿈이 있는 블록을 각각 `보기`로
  전환해 이미지/원문 텍스트 표현을 확인한다.
