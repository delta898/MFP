# Settings Beta 글쓰기 기본값 개발 기록

## Branch

- Branch: `codex/feature/design-system-settings-03-writing-defaults`
- Base/parent branch: `codex/feature/design-system-settings-main`
- Start date: 2026-09-09
- Status: 구현 및 사용자 UI 확인 완료, parent merge 준비

## 사용자 필요와 목표

Settings Beta의 `글쓰기` top menu를 여러 profile을 고르는 화면이 아니라, 새 글에 공통으로 적용할 하나의 `글쓰기 기본값`을 관리하는 화면으로 재구성한다. 검색 중심·발견 중심 같은 글 작성 전략은 profile 속성에서 제외하고 실제 글 작성 시 선택하도록 경계를 분명히 한다.

## 범위

1. Settings Beta `글쓰기 기본값` 화면
2. 문체·어조·추가 작성 원칙, 블로그 글 구성, 이미지 영역 기본값
3. 기존 참고 글 분석과 AI 적용 미리보기의 안전한 재사용
4. 기존 writing profile 저장소와 scoped API의 재사용 및 단일 기본값 projection
5. Settings card·field·select·choice pattern 재사용
6. 관련 IA·결정 문서와 focused test 현행화

## 명시적 비범위

- Blog Beta의 기본값 상속 또는 글별 override UI
- 검색 중심·발견 중심 전략의 Settings Beta 편집
- 이름 있는 다중 profile 생성·복제·삭제
- 기존 `설정 > 글쓰기` 화면의 제거 또는 변경
- parent merge, release, tag, push

## 제안 설계

- 사용자 UI에서는 단일 대상에 `프로필`이라는 선택 개념을 노출하지 않고 `글쓰기 기본값`으로 표현한다.
- 내부에서는 기존 writing profile 저장 경계와 호환성을 재사용하되 Settings Beta는 한 세트의 사용자 기본 writing defaults만 편집한다.
- 제품 추천값은 최초 기본 상태와 `추천 설정으로 되돌리기`의 기준으로 사용한다.
- 글 작성 전략은 작업의 목적이므로 이 저장 범위에서 제외한다.
- 변경은 명시적 저장 문구 없이 목적 action에서 seamless하게 반영하고, 변경 상태에서 이탈하면 공통 discard 확인을 사용한다.

## 구현 단계

1. 기존 writing profile repository와 Settings API 계약 확인
2. Settings Beta 글쓰기 기본값 panel 및 shared component 연결
3. 참고 글 분석·미리보기·되돌리기 동작 연결
4. focused contract와 browser smoke
5. 사용자 hands-on UI 확인 후 parent 통합 여부 결정

## 검증 계획

- 글 작성 전략이 Settings Beta 글쓰기 기본값 payload와 UI에서 제외되는지 확인
- 다른 settings scope와 기존 설정 화면을 보존하는지 확인
- 문체·구성·이미지 기본값의 load/change/apply/reset 검증
- 참고 글 분석 및 미리보기의 fixture 기반 browser smoke
- 변경 상태와 이탈 확인 검증

## 진행 기록

- 2026-09-09: 사용자와 하나의 글쓰기 기본값을 관리하고, 글 작성 전략은 실제 글 작성 화면에만 두기로 합의했다.
- 2026-09-09: 기존 writing profile schema와 repository를 새 저장소 없이 재사용하고, Settings Beta는 현재 effective profile을 완전한 custom snapshot으로 반영하도록 연결했다. 기존 검색·발견 전략 값은 payload에서 그대로 보존하며 화면에서 편집하지 않는다.
- 2026-09-09: 문체·글 구성·이미지 구성의 세 summary와 1:1 detail card, 참고 글 분석, AI 적용 미리보기, 추천 설정 되돌리기를 shared Settings card/field/select/choice pattern으로 구현했다.
- 2026-09-09: 연결 준비 상태가 아닌 설정값 summary에는 성공 dot을 사용하지 않는 `.ui-settings-summary-card` 기준을 공통 component guide에 추가했다.
- 2026-09-09: 상단을 설정값 summary 1×3과 보조 작업 shortcut 1×2로 분리하고, 문체의 동급 field 세 개를 desktop 1×3·중간 폭 2+1·mobile 1열로 정렬했다. shortcut과 반응형 field 기준을 공통 component guide에 반영했다.
- 2026-09-09: 사용자가 설정값 summary와 보조 작업 shortcut의 surface 구분, 상단 정보 위계와 문체 field 배치를 확인하고 현재 UI를 승인했다.
- 2026-09-09: parent merge gate로 전체 unit suite를 실행해 1,547개 중 1,546개 통과, 실패 0, 환경 의존 테스트 1개 skip을 확인했다.
- 2026-09-09: 상단·문체 레이아웃 보완 뒤 focused UI structure/style test 14개와 browser smoke(242 fixture requests)를 다시 통과했다.
- 2026-09-09: focused structure/API test 26개와 fixture 기반 browser smoke(242 requests)를 통과했다. browser smoke는 기본값 load, summary 즉시 갱신, 변경 이탈 확인, custom snapshot 반영과 전략 보존을 검증한다.

## 현재 결과와 사용자 확인 항목

- Settings Beta의 글쓰기 화면은 `기본 프로필 / 내 프로필` 선택 없이 하나의 `글쓰기 기본값`만 관리한다.
- `기본값 적용`은 저장 구현을 노출하지 않고 다음 글에 사용할 문체·구성을 반영한다.
- Blog Beta 상속·글별 override는 이 stage에 포함하지 않았으며 사용자 UI 확인 뒤 별도 stage에서 진행한다.
- 사용자 확인: desktop/narrow 화면의 정보 밀도, 세 summary 문구, 참고 글 분석과 미리보기 결과의 가독성, 추천 설정 되돌리기 흐름.
- 최종 자동 검증: focused structure/API 26개, focused UI/style 14개, fixture 기반 browser smoke 242 requests, 전체 unit 1,547개(통과 1,546·실패 0·skip 1).
