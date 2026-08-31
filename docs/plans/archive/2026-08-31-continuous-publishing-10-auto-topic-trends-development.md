# 연속 발행 Stage 10-3: Trends 자동 글감 전환 검토

## 브랜치 정보

- branch: `feature/continuous-publishing-10-auto-topic-trends`
- 시작일: 2026-08-31
- base/parent branch: `feature/continuous-publishing-main`
- 상태: 구현 전 취소

## 사용자 필요

기존 Trends 자동 글감 설정과 수동 탐색을 새 `블로그 Beta > 자동 글감` 흐름에 편입하고,
수집된 Trends 글감이 공통 발행 계획을 완전히 소유한 `발행 준비 완료` 행이 되게 한다.

## 목표

- 기존 Trends 수집 설정 중 출처 고유 설정을 새 `자동 글감` 화면에서 관리한다.
- 자동 Trends 수집 행에 Stage 10-1/2의 공통 발행 계획과 Trends 카테고리를 복사한다.
- 수동 Trends 탐색 결과에 `대기열 추가`를 제공한다.
- 새로 만든 행은 Topics Sheet 마지막에 추가하고 `발행 준비 완료`로 저장한다.
- 기존 scheduler, Trends API와 Topics Sheet gateway를 재사용한다.

## 명시적 비목표

- RSS 설정과 수집 행 전환은 다음 하위 단계로 남긴다.
- 수동 Trends에 `작성 후 추가` 동작을 제공하지 않는다.
- 예약 발행을 자동 글감 계획에 추가하지 않는다.
- 별도 scheduler나 Supabase 기반 개인 Queue를 만들지 않는다.
- 기존 `블로그` 화면을 이 단계에서 제거하지 않는다.

## 합의된 결정

1. 자동 수집된 Trends 글감은 완전한 계획과 함께 `발행 준비 완료`가 된다.
2. 공통 발행 계획은 Trends/RSS가 공유하고, Trends 카테고리는 Trends 설정이 소유한다.
3. 수동 Trends는 첫 범위에서 `대기열 추가`만 제공한다.
4. 설정이 유효하지 않으면 조용히 대기 행을 만들지 않고 실행 전에 차단한다.

## 구현 단계

1. 기존 Trends UI·API·scheduler·Topics append 경계 조사
2. 새 화면의 Trends 정보 구조와 동작을 사용자와 확인
3. 자동 수집 row builder와 producer 전환
4. Trends 설정·수동 탐색 UI/API 연결
5. 회귀 검증과 문서 현행화

## 검증 계획

- 자동 행에 공통 계획 전체와 Trends 카테고리 포함
- 잘못된/누락 계획에서 원격 Sheet mutation 차단
- 기존 중복 방지·필터·수집 시간 유지
- 수동 `대기열 추가`가 AI·발행을 호출하지 않음
- 기존 Trends/RSS와 Blog Beta UI 회귀

## 진행 기록

- 2026-08-31: Stage 10-2를 parent에 통합하고 Trends 전환 하위 브랜치를 시작했다.
- 2026-08-31: 기존 자동 글감은 글 품질과 사용자의 편집 의도를 보장하기 어렵다는 점을 다시 검토했다.
- 2026-08-31: 자동 Trends/RSS 수집을 Blog Beta 발행 대기열에 연결하지 않고, 기존 `블로그` 메뉴는 그대로 유지하기로 결정했다.
- 2026-08-31: Blog Beta의 후속 Trends 기능은 검색·선택·빠른 글 작성·직접 발행 또는 대기열 추가로 이어지는 수동 흐름으로 별도 설계한다.

## 결과

- 코드 구현 없이 취소했다.
- Stage 10-1/10-2에서 parent에 들어간 공통 계획 계약과 설정 UI는 이 브랜치의 정리 작업으로 제거한다.
- 기존 `블로그` 메뉴, 자동 글감 scheduler, Trends/RSS 수집과 수동 트렌드 포스팅은 변경하지 않는다.

## 자동 검증

- Stage 10-1/10-2 제거 후 연속 발행 단위·UI 계약·브라우저 회귀를 실행한다.
- 기존 블로그 자동 포스팅 UI/API 회귀를 별도로 확인한다.
