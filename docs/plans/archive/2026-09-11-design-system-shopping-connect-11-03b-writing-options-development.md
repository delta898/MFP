# 쇼핑커넥트 글 방향·글쓰기 설정 개발 기록

## Branch

- Branch: `codex/feature/design-system-shopping-connect-11-03b-writing-options`
- Base/parent branch: `codex/feature/design-system-shopping-connect-11`
- Start date: 2026-09-11
- Status: 완료 · parent 반영 준비

## 사용자 필요와 목표

상품 확인 다음 단계에서 쇼핑 글의 목적과 사용자 경험을 Blog Beta의 빠른 글 작성 흐름과 맞춘다.
글쓰기 모델과 발행 생명주기는 공통으로 유지하되, 상품 URL 자체가 핵심 자료라는 쇼핑 글의 목적성을
입력 구조에 반영한다.

## 범위

1. 기존 `참고/지시사항`을 사용자가 이해하기 쉬운 경험·방향 입력으로 정리
2. 검색 중심·발견 중심 글쓰기 전략과 상품 소개·비교·사용 상황 등 글의 초점 제공
3. 카테고리·발행 옵션·발행 대상 등 상세 설정을 공통 disclosure 문법으로 재배치
4. 선택한 글쓰기 설정을 쇼핑 글감 options에 보존하고 실제 원고 생성에 전달
5. 기존 inline style을 제거하고 쇼핑 feature stylesheet 및 semantic token으로 이동

## 명시적 비범위

- 글감 저장·발행 대기열·즉시 발행 action 재설계(3C)
- 글감 관리 목록 개편(slice 4)
- 쇼핑 글쓰기 모델 또는 상품 수집 provider 교체
- 새로운 예약·연속 발행 기능 추가
- parent 또는 `design-system-main` 병합

## 설계 결정

- Blog Beta와 동일한 검색 중심·발견 중심 전략 vocabulary를 사용한다.
- 글 길이·도입·전개·마무리는 상품 정보와 CTA 계약에 맞춘 쇼핑 전용 자동 구성을 유지한다.
- 참고 URL과 외부 참고 선택은 상품 URL이 이미 기준 자료이므로 중복 제공하지 않는다.
- 이미지 처리 방식은 쇼핑 상품 이미지·CTA 계약이 별도로 존재하므로 Blog Beta 옵션을 복제하지 않는다.
- 자주 쓰는 경험·방향은 바로 보이고, 글 구성 및 발행 설정은 progressive disclosure로 제공한다.
- 설정은 기존 shopping sheet의 `options` 확장 지점에 저장해 시트 열을 늘리지 않는다.

## 구현 진행

- 3A를 parent에 fast-forward 반영한 뒤 parent에서 3B branch를 시작했다.
- 경험·방향 입력을 기본 화면에 두고 글 구성과 발행 설정은 disclosure로 정리했다.
- 선택한 글쓰기 전략을 요청, shopping sheet `options`, 목록 조회, 실제 원고 생성 경로까지 연결했다.
- `글의 초점`을 자동 구성·상품 소개·비교·선택 가이드·사용 상황 제안으로 제공하고 기존 editorial plan에 연결했다.
- 발행 상태에 따른 예약 일시 활성화와 설정 요약을 inline handler 없이 초기화 코드로 연결했다.
- 빠른 글 작성 입력·disclosure·하단 action에 Blog Beta 공통 클래스를 직접 적용해 색상, 간격, 버튼 정렬을 통일했다.
- 상품 확인이라는 내부 처리 표현을 상품 불러오기·상품명·글감 보관·바로 포스팅 등 사용자 행동 중심 문구로 바꿨다.
- 사용자는 빠른 글 작성 UI와 입력 구성이 의도에 맞음을 확인했다.
- `글감 보관` 버튼은 기존 저장 action을 유지한 상태이며, 저장·목록 반영·발행 대기열의 실제 생명주기 검증과
  수정은 공통 글감 관리 UI를 먼저 완성한 뒤 후속 slice에서 수행하기로 했다.

## 검증과 남은 위험

- 3B UI contract 8건과 sheet option·runtime·쇼핑 prompt 경로 60건, 총 focused test 68건을 통과했다.
- browser 회귀와 전체 unit suite는 사용자 승인 전 실행하지 않는다.
- 빠른 글 작성 UI는 사용자가 직접 확인했다.
- `글감 보관`에서 버튼이 비활성화된 채 목록에 나타나지 않는 사례가 있었다. 이는 3B의 UI·옵션 범위를
  되돌리지 않고, 글감 관리 UI 통일 뒤 action 생명주기를 검증하는 후속 작업으로 남긴다.
