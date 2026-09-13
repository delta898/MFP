# Settings Beta 설정 소유권 점검 개발 기록

## Branch

- Branch: `codex/feature/design-system-settings-08-ownership-audit`
- Base/parent branch: `codex/feature/design-system-settings-main`
- Start date: 2026-09-09
- Status: 완료 — Settings Beta parent 및 디자인 시스템 parent에 통합

## 사용자 필요와 목표

새 Settings Beta 적용 과정에서 기존 설정의 일부가 보이지 않게 된 상태를 점검한다. 모든 값을 새 설정으로 복제하지 않고, 각 값의 실제 사용자 맥락과 runtime 소비처에 따라 하나의 소유 화면을 정한다. 글쓰기 기본값은 Blog Beta 생성 prompt에 실제로 반영되는지 검증한다.

## 범위

1. 기존 major settings의 field·저장 경로·runtime consumer inventory
2. Settings Beta, Blog Beta/자동화, 운영 구성, 제거 후보의 소유권 분류
3. canonical 정보 구조 문서와 개발 backlog 갱신
4. 글쓰기 기본값에서 생성 prompt까지의 실제 적용 경로 contract 검증

## 명시적 비범위

- 모든 legacy control의 즉시 UI 이관
- legacy Settings surface 제거
- 신규 글쓰기 옵션 설계
- 운영용 update source 값의 사용자 UI 재노출

## 완료 기준

- 사용자 조작 가능한 값마다 단일 소유 화면 또는 운영 경계가 문서화된다.
- Settings Beta와 legacy Settings의 중복 writable ownership이 식별된다.
- 글쓰기 기본값이 prompt/runtime에 전달되는 contract가 테스트로 확인된다.

## 진행 기록

- 기존 settings runtime의 field와 저장 경로를 조사했다. 연결·AI·글쓰기 기본값·부가 서비스·앱 설정은 Settings Beta에
  이관되어 있으며, 자동화·발행 대상·수집 source·쇼핑 고유 값은 Settings Beta가 아닌 해당 기능 화면이 소유해야 한다.
- `글쓰기 기본값 → effective profile → buildBlogGenerationPrompt → Utils.callWritingText` 경로와 Blog Beta의
  글별 `writing_overrides` 전달 경로를 확인했다. 저장한 기본값이 실제 prompt section에 반영되는 contract test를 추가했다.
- canonical IA 문서에 legacy 설정 이관 소유권 표를 추가하고, 기능별 실행 설정 이관을 현재 backlog로 등록했다.

## 검증

- `node --test src/ui-api/services/settings.service.writing-profile.test.js src/content/blog-generation-prompt.test.js` — 13 passed
- `git diff --check` — passed
- Settings Beta/API/글쓰기 focused contracts — 42 passed
- `npm run test:ui-browser` — passed (251 fixture requests)

## 결과와 다음 단계

- Settings Beta에 이미 이관된 값은 하나의 canonical owner로 유지한다. 남은 값은 기능 맥락에서만 이관한다.
- 다음 구현 우선순위는 자동 발행, 발행 대상, 수집 source처럼 아직 실제 기능 화면으로 이관되지 않은 실행 설정이다.

## 변경된 결정

- 네이버 입력 속도는 글별 발행 옵션이 아니라 앱이 네이버 에디터에 입력하는 공통 실행 환경이다. `설정 Beta > 앱 > 입력 환경`이
  단일 소유자가 되며 빠르게/빠른 편/보통/천천히, 샘플 문장, 로컬 입력 테스트를 제공한다.
- 브라우저 표시 방식은 글별 실행 설정으로 `블로그 Beta`에 남긴다.
- 이미지 최적화는 기본 최적화 후 실패 시 원본 fallback이라는 runtime 정책으로 고정하며 사용자 설정 control을 제공하지 않는다.
