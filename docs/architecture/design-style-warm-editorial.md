# Warm Editorial Style v0.1

## 문서 상태

- Style ID: `warm-editorial`
- 사용자 표시 이름: `따뜻한 에디토리얼`
- Status: 사용자 방향 승인, 구현 및 자동 검증 완료
- Source stage: `codex/feature/design-system-03-first-style`
- 적용 범위: 공통 shell과 `블로그 Beta`

## 경험 목표

BlogGenius를 차갑고 기술적인 관리 도구보다 글을 차분하게 준비하고 완성하는 편집 작업 공간으로 느끼게 한다. 종이와 잉크를 연상시키되 장식적인 복고풍이 되지 않으며, 긴 한국어 문장과 반복 작업에서 명료함을 우선한다.

## 시각 성격

- 따뜻한 ivory canvas와 깨끗한 paper surface
- 순수 검정보다 부드러운 ink neutral
- 파란색 대신 절제된 terracotta primary accent
- 얇고 따뜻한 border, 낮고 넓은 elevation
- 과도하게 둥글지 않은 안정적인 radius
- 글쓰기 화면의 내용과 결과가 장식보다 먼저 보이는 밀도

## Action 위계

- 한 action group에는 원칙적으로 filled primary button 하나만 둔다.
- secondary action은 paper surface 위의 outline button으로 표현한다.
- tertiary action은 투명 배경을 사용한다.
- 삭제·초기화는 primary와 공간적으로 분리하고 danger text/hover로 의미를 구분한다.
- 완료형 form의 primary action은 desktop에서 inline-end의 가장 끝에 둔다.
- 좁은 화면에서는 primary 발견 가능성과 논리적인 keyboard 순서를 함께 보존한다.

## Typography와 형태

- UI 본문은 `Noto Sans KR`과 `Inter` 계열을 유지해 가독성과 배포 안정성을 확보한다.
- 제목은 크기보다 weight, 간격과 주변 여백으로 위계를 만든다.
- field와 button은 compact하지만 최소 상호작용 높이와 focus 표시를 유지한다.
- radius는 small 8px, regular 12px, large 16px를 중심으로 사용한다.

## 상태와 접근성

- terracotta는 primary action과 선택 상태에 우선 사용하고 성공 의미로 혼용하지 않는다.
- success, warning, danger는 각각 별도 의미 색상을 유지하며 text 또는 icon과 함께 표현한다.
- focus는 배경과 무관하게 보이는 terracotta ring을 사용한다.
- hover, focus, active, disabled와 loading을 색상 하나만으로 구분하지 않는다.
- reduced motion 환경에서는 lift와 불필요한 transition을 제거한다.

## Do

- surface, border, typography와 spacing으로 정보 그룹을 만든다.
- primary action 하나를 명확히 하고 나머지 action의 강도를 낮춘다.
- 긴 한국어 label과 실제 결과가 들어온 상태를 기준으로 검토한다.
- compatibility 화면과 나란히 비교해 기능·상태 불변을 확인한다.

## Don't

- blue와 dark slate filled button을 여러 개 나란히 사용하지 않는다.
- 모든 card에 강한 shadow, gradient 또는 badge를 추가하지 않는다.
- 따뜻한 느낌을 만들기 위해 대비를 낮추거나 작은 본문에 장식 서체를 쓰지 않는다.
- style을 이유로 DOM, action priority 또는 feature 흐름을 분기하지 않는다.

## 검증 대상

- 공통 shell: canvas, sidebar, navigation, topbar, clock와 전역 상태
- `블로그 Beta`: 빠른 글 작성, 원고 입력, trend, queue/management, Smart Comment와 연속 발행 설정
- desktop 및 좁은 화면의 form action 배치
- keyboard focus와 disabled/loading/error/success 상태
- compatibility scope가 지정된 비대상 view의 시각 불변
