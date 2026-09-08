# 디자인 시스템 11단계 — 연속 발행 설정 정보구조 개발 기록

## Branch

- Branch: `codex/feature/design-system-11-continuous-publishing-navigation`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-08
- Status: 완료 — parent 병합 승인 및 검증 완료

## 사용자 필요와 목표

저빈도 설정인 `연속 발행 설정`을 Blog Beta의 독립 top-level 작업처럼 노출하지 않고, 실제 대상인 발행 대기열과
같은 `글감 관리` 영역에서 찾고 관리할 수 있게 한다. 메뉴 수를 줄이되 설정 접근성, 미저장 변경 보호와 기존
연속 발행 동작은 유지한다.

## 범위

1. `연속 발행 설정` top-level tab 제거
2. `글감 관리` local navigation에 설정 sub-tab 추가
3. 목록 sub-tab과 설정 sub-tab의 전용 tool·content 노출
4. 미저장 설정을 가진 local navigation 전환 확인
5. 전역 상태 및 내부 navigation의 설정 직접 이동 경로 교정
6. top-level/local navigation 정보구조 기준 문서화
7. focused contract, browser smoke와 사용자 시각 확인

## 명시적 비범위

- 연속 발행 schedule, 저장 schema, runner와 notification 정책 변경
- 발행 대기열·보관함 row의 추가 재설계
- 다른 product surface의 navigation 재구성
- release, version bump, tag, push 또는 배포

## 제안 설계

- Blog Beta top-level은 `빠른 글 작성`, `트렌드 포스팅`, `글감 관리`, `스마트 댓글`의 독립 작업만 유지한다.
- 글감 관리 local navigation은 `발행 대기열`, `보관한 글감`, `연속 발행 설정`으로 구성한다.
- count badge와 목록 새로고침은 collection sub-tab에만, 설정 action과 status는 설정 sub-tab에만 둔다.
- 설정에서 다른 local/top-level view로 이동할 때 기존 dirty confirmation을 유지한다.
- 구현 module 분리 여부가 아니라 task ownership과 사용 빈도로 navigation level을 결정한다.

## 사용자와의 결정

- 2026-09-08: 연속 발행은 독립 콘텐츠 작업보다 발행 대기열 처리 방식에 가까운 저빈도 설정으로 판단했다.
- 2026-09-08: `글감 관리`의 세 번째 sub-tab `연속 발행 설정`으로 이동하고 명칭은 그대로 유지한다.
- 2026-09-08: 설정 sub-tab에는 count badge와 목록 새로고침을 적용하지 않는 역할 차이를 허용한다.

## 구현 단계

1. 현재 shell, queue local navigation, automation panel과 직접 이동 경로 조사
2. markup과 tab state를 하나의 글감 관리 panel 아래로 재구성
3. dirty guard, loading과 focus 복구 연결
4. canonical guide 및 contract 갱신
5. focused/browser 검증과 사용자 확인

## 진행 기록

- 2026-09-08: clean `codex/feature/design-system-main`에서 sub-feature branch와 독립 개발 기록을 만들었다.
- 2026-09-08: Blog Beta top-level navigation에서 `연속 발행 설정`을 제거하고 `글감 관리`의 세 번째 local tab으로 이동했다.
- 2026-09-08: 목록 count와 새로고침은 두 collection tab에만 유지하고, 설정 tab은 설정 form과 자체 feedback만 노출하도록 역할을 분리했다.
- 2026-09-08: local tab 전환, 다른 Blog Beta top-level tab 전환 및 다른 view 이동에서 미저장 설정 확인을 유지했다.
- 2026-09-08: dashboard·도움말 등이 사용하는 기존 `blog-next / automation` 직접 경로를 `글감 관리 → 연속 발행 설정`으로 연결했다.
- 2026-09-08: canonical component guide에 독립 주 작업과 기능 소속 저빈도 설정의 navigation level 결정 기준을 추가했다.
- 2026-09-08: 첫 Full TC에서 `quick-queue.js`가 803줄로 800줄 module boundary를 3줄 초과해 1건 실패했다. 새 local-tab event binding을 같은 동작의 간결한 표현으로 정리해 경계 안으로 복구했다.

## 검증 계획

- Blog Beta panel anatomy/navigation contract
- continuous publishing shell/settings contract
- 관련 browser UI smoke
- parent 병합 전 사용자 승인과 full unit suite

## 최종 결과

- Blog Beta의 top-level tab을 네 가지 독립 작업으로 정리하고 `연속 발행 설정`을 `글감 관리`의 세 번째 local tab으로 이동했다.
- 대기열·보관함의 count와 새로고침은 목록 view에만 유지하고 설정 view에서는 숨겼다. narrow layout에서는 홀수 번째 마지막 local tab이 한 행을 사용해 긴 설정 label이 눌리지 않게 했다.
- 설정은 local tab 진입 시에만 불러오며, local/top-level/app view 이탈 모두 기존 미저장 변경 확인을 거친다.
- dashboard와 도움말의 기존 설정 바로가기는 호환 subTab을 통해 새 위치로 연결된다.
- Focused contract: 48 passed, 0 failed.
- Browser UI smoke: passed, 225 fixture requests.
- 첫 Full TC: 1,520 passed, 1 failed, 1 skipped. 실패는 `quick-queue.js`의 800줄 module boundary 초과였으며 기능 회귀는 아니었다.
- 경계 교정 후 focused module contract: 2 passed, 0 failed.
- 최종 Full TC: 1,521 passed, 0 failed, 1 skipped.
- 사용자가 `cmd`와 Full TC 실행을 승인했다. 향후 수동 확인 권장 항목은 네 개 top-level tab, 글감 관리의 세 local tab,
  설정에서 새로고침 비노출, dashboard·도움말 바로가기, 미저장 설정 이탈 취소/확인과 narrow layout이다.
