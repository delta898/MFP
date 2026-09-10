# Card News 원문 선택·미리보기·Source 관리 개발 기록

## Branch

- Branch: `codex/feature/design-system-card-news-10-02-source-preview`
- Base/parent branch: `codex/feature/design-system-card-news-10`
- Start date: 2026-09-10
- Status: 완료 · parent merge 승인

## 사용자 필요와 목표

카드뉴스로 만들 내용을 피드·URL·직접 입력 중에서 쉽게 선택하고, AI 작업 전에 실제 내용을 명확히 확인하게 한다.
Settings Beta에서 빠진 Card News source 설정은 기능 소유 화면인 Card News 안에서 관리하되 기본 작성 화면을 복잡하게 만들지 않는다.

## 범위

1. 원문 입력 방식과 RSS source navigation을 공통 pattern으로 이관
2. source 목록의 loading, empty, error, selected 상태와 미리보기 정보 위계 정리
3. 카드뉴스 화면에서 네이버·WordPress 및 추가 RSS source 관리 제공
4. source 변경 시 오래된 확인 상태 무효화와 마지막 정상 미리보기 보존 계약 유지
5. responsive, keyboard와 focused UI/browser regression 검증

## 명시적 비범위

- 카드 생성 field·prompt·AI 동작 변경
- 결과 card와 image workspace 개편
- Buffer 발행 또는 만든 카드뉴스 관리 개편
- legacy Settings 전체 제거

## 설계 결정

- `소스 관리`는 피드 toolbar의 보조 action으로 제공하고 필요할 때만 별도 dialog/surface를 연다.
- 연결 credential이 아니라 Card News에 사용할 source 선택이므로 Card News가 단일 편집 소유권을 가진다.
- source tab, status, field와 preview는 기존 공통 semantic pattern을 우선 사용하고 feature CSS는 목록 높이와
  desktop/mobile layout 같은 Card News 고유 geometry만 소유한다.
- 새 preview 요청 실패 시 마지막 정상 preview를 유지하는 기존 동작을 보존한다.

## 구현 진행

- 2026-09-10: foundation slice를 full unit gate와 사용자 승인 후 parent에 merge하고 sub-branch를 삭제했다.
- 2026-09-10: 원문 입력 방식과 피드 source navigation을 공통 segmented tab과 semantic token으로 이관했다.
- 2026-09-10: 고정 카드 높이를 제거하고 source/preview가 실제 내용 높이 안에서 함께 늘어나도록 정리했다.
- 2026-09-10: Card News 전용 source 설정 API와 modal editor를 추가했다. 저장은 `content.card_news` 범위만 갱신하며
  성공 후 피드 목록만 무효화·재조회한다.
- 2026-09-10: source 편집의 단일 소유권을 지키기 위해 legacy 설정의 Card News tab을 제거했다. legacy major save는
  화면에 없는 source 값을 기존 state에서 그대로 직렬화해 다른 설정 저장 시 source가 사라지지 않게 했다.
- 2026-09-10: 마지막 정상 미리보기 보존, source 변경 시 stale 처리, RSS 최대 3개·HTTPS 검증을 유지했다.
- 2026-09-10: 사용자 확인에서 native dialog가 viewport 좌측 상단에 붙고 RSS 행의 text 삭제 action이 잘리는 문제를
  확인했다. dialog에 명시적인 viewport 중앙 정렬과 안전 여백을 적용하고, 반복 행 삭제를 접근 가능한 공통 trash icon
  action으로 교체했다. icon-only와 text action의 선택 기준도 canonical component guide에 추가했다.
- 2026-09-10: 짧은 source modal에서 header `닫기`가 footer `취소`와 같은 동작을 중복하므로 제거했다. footer가 항상
  보이는 modal은 종료 action을 복제하지 않는다는 기준으로 canonical guide를 보완했다.
- 2026-09-10: 첫 browser smoke에서 기존 빠른 발견 modal의 배경색 계산값이 1 RGB 차이로 일시 실패했다.
  코드 변경 없이 동일 검증을 재실행해 통과했고, 최종 변경 뒤 다시 실행한 browser smoke도 통과했다.

## 검증

- Focused contract/service: 36개 통과
- Browser UI smoke: 통과, fixture request 258개
- Full unit suite: 1,577개 중 1,576개 통과, 실패 0, platform 조건부 1개 skip
- 사용자 시각 확인: 승인

### Full gate correction

- 첫 full unit run: 1,577개 중 1,575 통과, 1 실패, 1 platform skip. 실패는 제거한 legacy
  `card-news-settings.css`를 CSS manifest 구조 테스트가 계속 요구한 계약 누락이었다.
- 실제 manifest와 테스트 기대 목록을 함께 정리한 뒤 구조 테스트와 full unit gate를 재실행한다.
- CSS 구조 테스트 5개 통과 후 full unit gate 재실행: 1,576 pass, 0 fail, 1 platform skip.

## 최종 결과

- 카드뉴스가 원문 source 설정의 단일 편집 화면이 되었고 legacy 설정의 중복 tab과 전용 stylesheet/script를 제거했다.
- 피드·URL·직접 입력 navigation, field, 상태 badge와 empty state가 공통 semantic pattern을 사용한다.
- source modal은 viewport 중앙 배치, 안전 여백과 내부 overflow를 가지며 RSS를 최대 3개까지 편집한다.
- 저장은 Card News source 범위만 변경하고 성공 후 피드를 재조회한다. 기존 정상 preview와 생성 결과는 보존한다.
- 반복 행 삭제는 공통 접근 가능 icon action을 사용하고 modal 종료 action 중복 금지 기준을 canonical guide에 반영했다.
