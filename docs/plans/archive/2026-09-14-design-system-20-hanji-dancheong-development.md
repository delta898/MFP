# 디자인 시스템 20단계 — 한지 위의 단청 스타일

- branch: `codex/feature/design-system-20-hanji-dancheong`
- base/parent: `codex/feature/design-system-main`
- started: 2026-09-14
- status: complete

## 사용자 필요와 목표

스타일 선택 UI의 2×2 구성을 완성하고, 대한민국의 시각 문화를 직접적인 국기 장식이 아닌 현대적인 디자인 언어로 번역한 네 번째 스타일 `한지 위의 단청`을 제공한다. 동시에 registry 기반 스타일 확장 구조가 밝고 선명한 새로운 계열에서도 화면별 예외 없이 작동하는지 검증한다.

## 범위

1. `hanji-dancheong` style token module 추가
2. runtime registry와 CSS composition manifest 등록
3. 설정 Beta 선택 UI의 자동 노출 및 2×2 구성 검증
4. 주요 공통 component와 modal의 시각·대비 호환성 점검
5. focused contract 및 browser smoke, 사용자 시각 확인

## 비범위

- 태극기·건곤감리·전통 문양의 직접적인 화면 장식
- 기능, DOM, API 또는 저장 구조 변경
- 기존 세 스타일의 시각 변경
- 화면별 `hanji-dancheong` 전용 selector 추가

## 디자인 방향

- 따뜻한 한지 canvas와 백자색 surface
- 먹색 본문과 쪽빛 primary action
- 절제된 단청 적색 counterpoint와 솔잎색 status
- 넓은 여백, 반듯한 구획, 낮은 그림자, 비교적 작은 radius
- 한국적 인상은 문양보다 여백·색·선의 질서로 표현

## 결정과 진행 기록

- 2026-09-14: 사용자가 네 번째 스타일로 `한지 위의 단청` 방향과 별도 feature branch 구현을 승인했다.
- 2026-09-14: 한국성을 직접적인 국기·문양 장식 대신 한지, 백자, 먹, 단청과 오방색의 절제된 관계로 표현하기로 했다.
- 2026-09-14: `hanji-dancheong.css`와 registry·manifest 등록만으로 설정 Beta에 네 번째 선택지가 자동 노출되도록 구현했다. 화면별 style selector는 추가하지 않았다.
- 2026-09-14: 설정 Beta의 데스크톱 스타일 선택 grid가 두 열이라는 계약을 명시해 네 스타일의 2×2 구성을 보호했다. 모바일은 기존처럼 한 열이다.
- 2026-09-14: 한지·백자 surface, 먹색 본문, 단청 적색 primary, 쪽빛 info와 솔잎색 success를 semantic token으로 분리했다. 기존 스타일은 변경하지 않았다.
- 2026-09-14: 첫 시각 확인에서 따뜻한 베이지 surface와 적갈색 primary가 `따뜻한 에디토리얼`과 지나치게 비슷하다는 피드백을 받았다.
- 2026-09-14: 쪽빛을 primary로 승격하고 단청 적색을 counterpoint로 이동했으며, 청자빛 muted surface, 세 방향 한지 canvas, 더 각진 radius와 무그림자 card로 재구성했다. 한국적 색 대비를 강화하면서 에디토리얼의 따뜻하고 둥근 종이 인상과 분리했다.
- 2026-09-14: 두 번째 시각 확인에서 일반 secondary button까지 단청 적색으로 표시되어 경고·삭제처럼 보일 수 있다는 의미 체계 문제를 확인했다. 일반 secondary는 중립적인 먹빛·청회색으로 되돌리고, 추천 제외 행동인 `관심 없음`에 공통 danger action 계약을 명시해 단청 적색을 거절·위험 의미로 제한했다.
- 2026-09-14: 사용자 요청에 따라 설정 화면 제목의 중복된 `Beta` release badge를 제거했다. 사이드바의 제품 구분 표기와 다른 기능의 release badge는 변경하지 않았다.
- 2026-09-14: 사용자가 최종 시각 결과를 승인하고 full test 및 parent merge를 요청했다.

## 검증 및 결과

- 디자인 style, 설정 외모·화면, Dashboard와 공통 feedback focused contract 42개 통과.
- 최종 팔레트와 버튼 의미 계약 기준 Browser UI smoke 307 fixture request 통과. Chromium에서 네 번째 selectable style 노출, Dashboard 공통 card의 계산값, 중립 secondary와 danger dismiss 색 분리를 확인했다. 직전 실행은 모든 UI assertion 이후 외부 리소스 `ERR_CONNECTION_CLOSED` 1건으로 종료됐으며 즉시 재실행해 통과했다.
- 최종 핵심 대비 점검: primary text/surface 14.36:1, secondary text/surface 6.39:1, muted text/surface 4.52:1, primary button text/background 7.17:1, neutral secondary/surface 7.77:1, danger/surface 6.93:1.
- `git diff --check` 통과.
- 전체 단위 테스트 1,694개 중 1,693개 통과, 플랫폼 의존 1개 제외, 실패 0개.
- 사용자가 2×2 선택 구성과 실제 화면의 색감·버튼 의미를 시각 확인하고 승인했다.
- 남은 위험: 단청 적색은 공통 danger action 의미에 연결되므로 이후 제외·삭제 성격의 동작도 같은 semantic class를 사용해야 일관성이 유지된다.
