# 디자인 시스템 6단계 — Blog Beta 빠른 글 작성 대표 흐름 개발 기록

## Branch

- Branch: `codex/feature/design-system-06-blog-beta-quick-flow`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-07
- Status: 조사·설계 합의 중

## 사용자 필요와 목표

가장 자주 쓰는 빠른 글 작성 화면이 길고 밋밋하며, 핵심 입력과 차별화된 AI 보조 기능의 위계가 약하다. 처음에는 쉽게 시작하고 필요할 때만 세부 설정을 열 수 있도록 대표 흐름을 재구성한다.

## 범위

1. 주제·키워드·제목과 경험·요청을 기본 경로로 유지
2. 참고 자료, 생성 방식과 발행 세부 설정을 progressive disclosure로 정리
3. 접힌 설정에도 발행 대상·공개 방식·이미지 처리·실행 방식의 현재 값을 요약
4. `글감 추천`, `키워드 탐색`, `AI 제목 추천`을 공통 `AI Assist` pattern으로 정의
5. 긴 form의 최대 폭, section rhythm과 하단 action 접근성 개선
6. `내용 지우기` 후 즉시 복구할 수 있는 되돌리기 검토 및 적용
7. desktop·좁은 화면과 keyboard 흐름 자동 검증 및 사용자 시각 검토

## 명시적 비범위

- AI prompt, 모델 역할 또는 생성 결과 계약 변경
- 저장 형식, 발행 대상과 실제 publishing 동작 변경
- 원고 폴더·원고 붙여넣기 기능 재설계
- 다른 Blog Beta top-level tab 또는 기존 `블로그` surface 개편
- style 선택 UI, release, push 또는 배포

## 설계 원칙

- 기본 화면에는 글을 시작하는 데 필요한 입력과 최종 행동만 우선 노출한다.
- 세부 설정은 숨기는 대신 접힌 상태에서 현재 실행 결과를 요약한다.
- AI Assist는 일반 secondary보다 발견 가능하되 primary 실행과 경쟁하지 않는다.
- 기존 입력값과 기본값, 저장·대기열·즉시 발행 semantics를 보존한다.
- 위험한 초기화는 복구 가능성을 함께 제공한다.

## 구현 단계

1. 현재 field와 action을 기본·선택·실행 설정으로 분류하고 의존 관계를 조사한다.
2. disclosure 구조, summary 문법과 AI Assist 상태를 사용자와 합의한다.
3. markup과 style을 기능 변경 없이 재구성한다.
4. 설정 summary와 내용 지우기 되돌리기 상호작용을 연결한다.
5. focused contract, browser smoke와 사용자 UI 검토를 수행한다.

## 완료 조건

- 기본 경로의 정보량이 줄고 핵심 입력과 primary action이 명확하다.
- 접힌 설정에서 현재 발행 결과를 오해하지 않는다.
- 세 AI Assist action이 하나의 의미 체계를 공유한다.
- 기존 저장·대기열·발행 기능과 입력값이 보존된다.
- 관련 focused tests와 browser smoke가 통과하고 사용자가 대표 화면을 승인한다.

## 검증 계획

- 구현 중: 빠른 글 작성 구조·상태·기존 동작 focused contract
- reviewable slice 완료 시: 관련 Blog Beta browser smoke
- full unit suite: parent merge 후보가 준비된 뒤 사용자에게 수행 시점과 범위를 설명하고 승인받아 실행
- 수동 확인: 첫 화면 밀도, disclosure 요약, AI Assist 식별성, keyboard·좁은 화면, 지우기·되돌리기

## 진행 기록

- 2026-09-07: Stage 5를 parent에 fast-forward 병합하고 완료 branch를 삭제했다.
- 2026-09-07: parent에서 Stage 6 branch를 시작하고 기존 합의와 backlog를 목표·범위·비범위로 구체화했다.
- 2026-09-07: 사용자 요청에 따라 확장성 검증을 위해 임시 활성화했던 Quiet Sage Studio 대신 주 style인 Warm Editorial을 UI root의 활성 style로 복원했다. Compatibility fallback과 Quiet Sage의 정식 registry·style pack은 유지한다.
- 2026-09-07: style foundation focused contract 17개와 browser UI smoke 225 fixture request를 통과했다. 브라우저 검사는 Warm Editorial 초기 렌더링, Quiet Sage 전환과 입력·DOM·focus 상태 보존을 확인한다.
