# 레트로 터미널 디자인 스타일

## 상태

- Style ID: `retro-terminal`
- 사용자 표시 이름: `레트로 터미널`
- Contract: [다중 Style Contract v1.0](./design-style-system.md)
- 제공 방식: 설정 Beta의 선택형 정식 style

## 사용자 경험

BlogGenius의 자동화 도구 성격을 짙은 터미널 화면, 선명한 셀 경계와 절제된 phosphor 색으로 표현한다.
실제 명령줄을 흉내 내는 장식보다 작업 상태와 실행 행동을 빠르게 구분하는 데 초점을 둔다.

- near-black 녹색 배경과 낮은 눈부심의 밝은 본문색을 사용한다.
- 주 행동은 amber, 성공은 phosphor green, 정보와 위험은 각각 blue와 red로 분리한다.
- 작은 radius와 낮은 elevation으로 평평하고 선명한 terminal panel 인상을 만든다.
- Latin glyph와 숫자는 system monospace를 우선하고 한글은 `Noto Sans KR` 폴백으로 읽기 품질을 보존한다.
- 이미지와 영상에는 색상 filter를 적용하지 않아 미리보기와 실제 결과의 색을 유지한다.

## 절제 원칙

이 style은 기능 또는 콘텐츠를 terminal 문법으로 바꾸지 않는다.

- `$`, `>`, `[OK]` 같은 가짜 명령 접두사를 사용자 문구에 추가하지 않는다.
- scanline, 깜빡임, 움직이는 노이즈나 강한 glow를 사용하지 않는다.
- style별 DOM, JavaScript 분기 또는 기능별 selector를 만들지 않는다.
- 버튼 우선순위, 상태 의미, keyboard 순서와 접근성 이름은 다른 style과 동일하다.

## 구현 경계

`ui/styles/styles/retro-terminal.css`가 공통 semantic/component token만 공급한다. 기능 surface는 구체적인
style ID를 알지 않으며 registry 전환 시 DOM과 진행 중 입력, 마지막 정상 결과를 그대로 유지한다.

새로운 terminal 표현이 필요해도 먼저 공통 token 또는 의미 있는 component variant인지 판단한다. 단순한 장식을 위해
feature stylesheet에 `retro-terminal` 분기를 추가하지 않는다.

## 검증 기준

- registry, CSS module과 필수 token의 일대일 계약
- 주요 surface, action, focus, success/warning/error/disabled 상태 대비
- 좁은 화면의 density와 버튼·label 보존
- style 전환 및 저장 후에도 입력과 기능 상태 보존
- 이미지 미리보기에 filter 또는 색상 변형이 없음
- 사용자 hands-on 검토에서 장시간 가독성과 터미널 인상의 균형 확인
