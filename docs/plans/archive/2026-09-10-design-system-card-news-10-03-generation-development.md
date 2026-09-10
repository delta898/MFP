# Card News 카드 설정·AI 생성 개발 기록

## Branch

- Branch: `codex/feature/design-system-card-news-10-03-generation`
- Base/parent branch: `codex/feature/design-system-card-news-10`
- Start date: 2026-09-10
- Status: 완료 · 사용자 UI 승인 및 merge gate 통과

## 사용자 필요와 목표

원문 확인 뒤 카드 수, 비율과 표현 방향을 빠르게 정하고 AI 작업의 역할·진행·실패 상태를 명확하게 이해하도록 한다.
Settings Beta와 Dashboard에서 확립한 공통 field, action, feedback과 semantic token을 재사용한다.

## 범위

1. 카드 설정 field와 선택 control의 정보 위계 및 responsive layout 정리
2. `카드 구성만 만들기`와 `이미지까지 만들기`의 primary/secondary 역할 정리
3. 글쓰기 AI·이미지 AI 역할 안내, loading, duplicate prevention과 failure feedback 정리
4. 설정값의 local persistence와 생성 request 전달 계약 유지·검증
5. 두 product style, keyboard와 browser regression 검증

## 명시적 비범위

- 생성 prompt와 backend AI orchestration의 의미 변경
- 만들어진 카드 item과 개별 이미지 작업 UI 개편
- Buffer SNS 발행 UI 개편
- 만든 카드뉴스·ZIP 복원 UI 개편

## 설계 원칙

- 기본 실행은 완성 결과를 만드는 `이미지까지 만들기`이고, 구성만 필요한 경우는 낮은 위계의 보조 action으로 둔다.
- AI action은 사용 model role, 진행 상태와 중복 실행 방지를 가까운 한 workflow 안에서 제공한다.
- 실패 시 마지막 정상 preview와 기존 생성 결과를 지우지 않는다.
- feature stylesheet는 Card News 고유 grid와 textarea geometry만 소유하고 field, button, feedback 색상은 공통 pattern과 token을 사용한다.

## 구현 진행

- 2026-09-10: Slice 2를 full unit gate와 사용자 승인 후 parent에 merge하고 sub-branch를 삭제했다.
- 2026-09-10: 카드 수·화면 비율·스타일을 공통 1×3 field grid로 묶고, 한글 문구와 추가 요청을 별도 위계로 정리했다.
- 2026-09-10: 사용자 검토를 반영해 두 번째 줄은 추가 요청사항과 한글 문구 선택을 2:1로 배치하고, 좁은 화면에서는 1열로 축소하도록 정리했다.
- 2026-09-10: 글쓰기 모델과 이미지 모델의 역할을 실행 전에 표시하고 operation feedback을 공통 semantic pattern으로 이관했다.
- 2026-09-10: 생성 중 payload 관련 field와 충돌 action을 잠그고, 생성 후 설정 변경 시 기존 결과를 유지하면서 다음 실행 적용 상태를 알리도록 했다.
- 2026-09-10: 공통 feedback pattern에 `!important`를 사용한 첫 구현이 design-system cascade 계약 검사에서 발견되어 제거했다.
- 2026-09-10: 사용자 검토에 따라 정보 가치가 낮은 별도 `사용 AI` 행을 제거하고 역할 설명을 heading 문장에 통합했다.
- 2026-09-10: 짧은 workflow에만 있던 action divider를 제거하고, modal·sticky footer 등 실제 경계가 있는 경우에만 divider를 쓰는 공통 규칙을 문서화했다.

## 검증

- Card News domain·UI 구조·공통 style/module focused test: 139개 통과
- Browser UI smoke: 통과, fixture request 249건
- Browser smoke에서 desktop 1×3, detail row 2:1, textarea/checkbox 하단 정렬과 추가 요청 localStorage 반영을 검증했다.
- 사용자 UI 확인 완료: 1×3 + 2:1 위계와 단순화한 AI 안내/action 영역 승인
- Full unit suite: 1,578개 중 1,577개 통과, 실패 0개, Windows 전용 1개 skip

## 최종 결과와 후속 범위

- 카드 설정과 생성 진입 workflow는 공통 field, choice, feedback과 action 위계를 사용한다.
- 설정값은 기존과 같이 device-local 최근 선택으로 유지되고 생성 request에 전달된다.
- 다음 slice에서 만든 카드뉴스 결과와 개별 이미지 작업 surface를 개편한다.
