# 디자인 시스템 14단계 — 전역 셸과 공통 feedback 컴포넌트 수렴

- branch: `codex/feature/design-system-14-shell-shared-components`
- base/parent: `codex/feature/design-system-main`
- started: 2026-09-14
- status: completed

## 사용자 필요와 목표

디자인 시스템 대상 화면에 남은 전역 셸 presentation 소유권과 상태 badge, spinner, empty state의 중복을 정리한다. 기능별 stylesheet와 JavaScript가 공통 외형을 직접 소유하지 않게 하고, 이후 spacing/radius 밀도 전환과 대형 CSS 분할을 안정적으로 진행할 기반을 만든다.

## 범위

1. 업데이트 배너의 inline/JavaScript presentation 제거와 상태 class·attribute 계약 확립
2. 현행 디자인 시스템 surface의 status/release badge를 공통 semantic state로 수렴
3. 버튼 내부 및 독립 loading spinner의 공통 primitive와 접근성 상태 정리
4. 현행 surface의 empty state를 최소 공통 anatomy로 수렴
5. manifest, focused contract, 관련 browser smoke와 문서 최신화

## 비범위

- 곧 제거할 legacy surface의 전면 style 이관
- spacing/radius 밀도 전환
- 대형 feature CSS 파일 분할
- cascade layer 도입
- 기능 흐름, 데이터, API 또는 정보 구조 변경

## 진행 방식과 확인 지점

- 셸과 공통 primitive 계약은 동작·레이아웃을 보존하며 연속 진행한다.
- 여러 제품 화면의 실제 외형이 바뀌는 empty-state 이관 전후에 사용자 시각 확인이 필요하면 review slice로 멈춘다.
- 구현 중에는 가장 좁은 contract를 실행한다. reviewable UI slice가 완성되면 관련 browser smoke를 한 번 실행한다.
- parent 병합 전 full unit suite는 사용자 승인 후 실행한다.

## 결정과 진행 기록

- 2026-09-14: 사용자가 에이전트가 적정 범위와 단계, 확인 시점을 결정해 진행하도록 승인했다.
- 2026-09-14: 이번 branch는 로드맵 1번 `전역 셸 정리`와 2번 `공통 컴포넌트 수렴`까지만 담당하고, 밀도·CSS 분할·cascade layer는 후속 독립 단계로 유지한다.
- 2026-09-14: 업데이트 배너의 모든 inline style과 `update.js`의 직접 style mutation을 제거했다. `data-update-state`가 available/downloading/applying/error를 표현하고 CSS가 section·action 가시성을 소유한다. 진행률은 native `progress`의 value 계약으로 변경해 JS가 폭을 직접 그리지 않는다.
- 2026-09-14: status badge와 제품 단계 badge를 각각 `.ui-status-badge`, `.ui-release-badge`로 분리했다. Settings Beta의 상태 pill과 Beta 표기를 이 계약으로 옮기고 runtime은 색상 이름이 아니라 semantic `data-state`만 갱신한다.
- 2026-09-14: button 진행, 문장형 진행, 독립 spinner를 shared feedback primitive로 수렴했다. SNS, 쇼핑커넥트, 카드뉴스와 Dashboard Beta가 공통 표현을 사용하며 legacy 글쓰기 spinner는 이번 범위에서 제외했다.
- 2026-09-14: Blog Beta queue·스마트 댓글, 카드뉴스 목록, SNS 채널 부재처럼 완결된 빈 surface를 `.ui-empty-state`로 수렴했다. preview 안내와 입력 전 prompt 등 작업 문맥 내부 placeholder는 정보 구조가 다르므로 contextual pattern으로 유지했다.

## 검증 및 결과

- 업데이트 배너 presentation contract와 관련 style/shell contract 38건 통과.
- 공통 badge, loading, empty-state focused contract를 포함한 관련 UI contract 95건 통과.
- SNS 발행 busy-state와 shared feedback 추가 contract 6건 통과.
- browser UI smoke 280 fixture requests 통과. 최초 실행에서 style 전환 뒤 `focus-visible` shadow 비교가 한 차례 실패했으나, 관련 코드 변경 없이 재실행해 통과했다.
- 최초 full unit gate는 1,684건 중 shopping preview의 기존 reduced-motion 소유권 assertion 1건이 실패했다. spinner 접근성 처리가 feature CSS에서 shared feedback CSS로 이동한 결과이므로 기능 코드를 되돌리지 않고 계약이 공통 소유권을 확인하도록 수정했다.
- 수정한 focused contract 7건 통과.
- 최종 full unit gate는 권한이 필요한 local Trends API socket test를 포함해 1,683건 통과, 실패 0건, 플랫폼 종속 1건 skip으로 완료했다.

## 현재 결과와 남은 확인

- 전역 업데이트 배너와 현행 디자인 시스템 surface의 공통 feedback presentation 소유권을 feature JavaScript/CSS에서 shared component로 옮겼다.
- API, 데이터 흐름과 정보 구조는 변경하지 않았다.
- Settings Beta, SNS, 쇼핑커넥트, 카드뉴스, Dashboard Beta, Blog Beta의 badge·loading·empty-state를 사용자가 확인했다.
- 사용자 승인과 자동 병합 gate를 모두 충족해 parent 병합 준비를 완료했다.
