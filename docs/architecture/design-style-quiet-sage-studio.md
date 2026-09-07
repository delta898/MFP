# Quiet Sage Studio Style v0.1

## 문서 상태

- Style ID: `quiet-sage-studio`
- 사용자 표시 이름: `고요한 세이지 스튜디오`
- Status: 사용자 시각 승인 및 확장성 검증 완료
- Source stage: `codex/feature/design-system-04-extensibility-validation`
- 적용 범위: 공통 shell과 `블로그 Beta`의 검증 기준 화면

## 경험 목표

Warm Editorial의 종이와 잉크 감성에서 벗어나, 차분하고 정돈된 글쓰기 스튜디오의 인상을 만든다. 시각적 장식보다 명확한 surface와 border를 사용하며, 약간 높은 정보 밀도에서도 긴 한국어 문구와 작업 상태가 안정적으로 읽혀야 한다.

## 검증 목표

- cool-neutral과 sage palette에서 동일한 action·selection·status 의미가 유지되는지 확인한다.
- 더 작은 radius와 낮은 elevation에서도 card와 navigation의 관계가 성립하는지 확인한다.
- compact spacing이 긴 form, action group과 좁은 화면의 접근성을 해치지 않는지 확인한다.
- sage primary가 success 상태와 색상만으로 혼동되지 않는지 확인한다.
- Warm Editorial 전용 selector나 raw palette가 공통 component에 숨어 있지 않은지 확인한다.

## 시각 성격

- 차가운 회백색 mineral canvas와 밝고 깨끗한 surface
- 순수 검정 대신 녹색 기가 아주 약한 ink neutral
- 채도가 낮은 sage/evergreen primary accent
- shadow를 거의 사용하지 않고 border와 surface 차이로 만드는 정보 그룹
- Warm Editorial보다 작고 정돈된 radius
- 기본 가독성을 유지하는 범위의 compact spacing

## Action과 상태

- primary는 evergreen filled action 하나로 제한한다.
- secondary는 밝은 surface의 outline을 사용하고 primary와 경쟁하지 않는다.
- tertiary와 refresh icon은 투명 배경을 기본으로 한다.
- danger는 muted red를 사용하고 primary sage와 분리한다.
- success는 primary보다 푸른 teal 계열을 사용하되 text·icon·상태 문구를 함께 유지한다.
- keyboard focus는 모든 surface에서 식별 가능한 sage ring으로 표시한다.

## 형태와 밀도

- small, regular, large radius는 각각 5px, 8px, 12px를 중심으로 한다.
- button radius는 6px로 두어 navigation·card와 같은 형태 언어를 사용한다.
- spacing scale은 Warm Editorial보다 약 2~4px 조밀하지만 상호작용 높이와 긴 label 공간은 줄이지 않는다.
- card의 기본 shadow는 제거하고 hover도 클릭 가능한 경우에만 최소 elevation을 허용한다.
- transition은 짧고 절제되며 reduced-motion 계약을 그대로 따른다.

## Do

- surface, border와 typography를 먼저 사용해 hierarchy를 만든다.
- primary와 success를 문구·형태·맥락으로 함께 구분한다.
- 동일 DOM에서 Warm Editorial과 전환하며 입력·상태 보존을 확인한다.
- raw blue/slate가 눈에 띄는 경우 의미를 분류한 뒤 필요한 공통 token만 추가한다.

## Don't

- 세이지 느낌을 만들기 위해 모든 성공 상태를 primary 색으로 합치지 않는다.
- compact style을 이유로 작은 hit target이나 잘리는 한국어 label을 허용하지 않는다.
- shadow가 적다는 이유로 모든 영역에 border를 중첩하지 않는다.
- 검증 style 이름을 feature CSS나 JavaScript 조건으로 사용하지 않는다.
- style 변경으로 DOM, action priority나 feature 흐름을 바꾸지 않는다.

## 대표 검증 대상

- 공통 shell navigation과 전역 상태
- Blog Beta top-level navigation, quick writing action group과 selection controls
- trend query/refresh와 management refresh
- Smart Comment form, result card와 상태 표현
- 연속 발행 설정의 field, help, automation state와 action group
- 공통 dialog 및 compatibility scope의 비대상 view
