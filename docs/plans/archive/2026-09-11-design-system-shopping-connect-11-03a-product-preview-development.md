# 쇼핑커넥트 상품 입력·확인 개발 기록

## Branch

- Branch: `codex/feature/design-system-shopping-connect-11-03a-product-preview`
- Base/parent branch: `codex/feature/design-system-shopping-connect-11`
- Start date: 2026-09-11
- Status: 완료 · 최초 커밋 후 실 URL 오인식 보정 및 재검증

## 사용자 필요와 목표

쇼핑커넥트 빠른 글 작성의 출발점을 일반 블로그의 주제 입력과 구분한다. 사용자는 상품 URL을 먼저 입력하고,
글 작업 전에 실제로 인식된 상품명·대표 이미지·가격·연결 주소를 확인하며 잘못된 상품명은 수정할 수 있어야 한다.

## 범위

1. 상품 URL 중심의 첫 입력 영역 재구성
2. 중복 실행을 막는 `상품 정보 확인` action과 loading/error/success 상태
3. 확인 전·확인 성공·확인 실패에 맞는 상품 미리보기
4. 확인된 상품명 수정 및 분석 실패 시 상품명 직접 입력 복구
5. URL 변경 시 이전 상품 미리보기와 상품명 연결을 안전하게 초기화

## 명시적 비범위

- 쇼핑 글 방향과 글쓰기 설정 재구성(3B)
- 글감 보관·발행 대기열·바로 포스팅 생명주기 action 개편(3C)
- 글감 관리 목록 개편
- 상품 분석 또는 글 생성 backend 계약 변경
- browser 회귀 및 전체 단위 테스트(별도 사용자 승인 후 수행)

## 설계 결정

- 상품 분석에는 기존 `/api/v1/shopping/preview`와 normalized preview 결과를 재사용한다.
- 상품명은 URL과 나란히 먼저 요구하지 않는다. 분석 성공 후 확인·수정하거나 실패 시 복구 입력으로 노출한다.
- 미리보기 실패가 더 무거운 실제 수집 경로의 성공 가능성까지 차단하지 않도록 상품명 직접 입력 경로를 제공한다.
- 새 UI는 semantic design token만 사용하며 상품 입력 상태는 독립 feature module이 소유한다.

## 구현 진행

- parent working tree가 깨끗하고 3A branch가 parent에서 시작했음을 확인했다.
- 빠른 글 작성 첫 영역을 URL 입력과 `상품 정보 확인` action 중심으로 재구성했다.
- 기존 read-only preview API 결과로 대표 이미지, 상품명, 가격, 할인율, 이미지 수와 실제 상품 링크를 보여준다.
- 성공 후에는 확인된 상품명을 수정할 수 있고, 실패 시에는 상품명 직접 입력을 복구 경로로 제공한다.
- URL이 바뀌면 이전 미리보기와 상품명 연결을 초기화하며 중복 분석 요청을 차단한다.
- 실사용 `naver.me` 링크가 브랜드 커넥트의 상품 번호까지 정상 해석된 뒤 네이버 로그인 화면으로
  이동했을 때, Caps Lock·비밀번호 안내문을 상품명으로 오인하는 문제가 확인되었다.
- 로그인 URL과 강한 인증 화면 문구를 상품 landing 실패로 분류하고, 이를 성공으로 확정하지 않은 채
  다음 상품 후보 및 서버 상품 복구 gateway로 계속 진행하도록 보정했다. 인증 문구는 사용자가 직접
  보완할 수 있는 상품명 후보로도 사용하지 않는다.
- 추가 실 URL로 브랜드 커넥트가 `affiliate id + channelProductNo`를 이용해 실제 SmartStore alias가
  포함된 공개 상품 주소로 이동함을 확인했다. 정적 HTTP 응답은 브랜드 커넥트 앱 shell과 동적
  SmartStore 상품 정보를 해석하지 못하므로, `상품 정보 확인`의 가벼운 추출이 실패할 때만 공개
  페이지 browser fallback을 수행한다. 미리보기 fallback은 리뷰 탭 수집을 생략해 글 생성 경로보다
  작게 유지한다.
- 상품 미리보기 성공 시 실제 링크 오동작을 추적할 수 있도록, 상품 페이지를 열 때 사용하는 최종
  URL과 해석 출처를 앱 로그에 기록한다.

## 검증과 남은 위험

- 상품 확인 UI·상태 전이·URL 정규화, navigation shell, UI 조립, 디자인 시스템과 기존 preview API
  focused test 35건을 통과했다.
- 새 UI module을 명시적 classic-script 실행 순서에 처음 등록하지 않아 structure contract 1건이 실패했고,
  manifest 기대 목록을 보완한 뒤 동일 범위 35건이 모두 통과했다.
- `git diff --check`를 통과했다.
- 사용자 승인 후 browser smoke에 상품 확인 성공, 가격·할인·이미지 수 표시, 상품명 반영과 URL 변경
  초기화 흐름을 추가했고 261개 fixture 요청이 모두 통과했다.
- 최종 시각·탐색 확인은 사용자가 수행한다.
- 로그인 화면 오인식 회귀 test를 추가했고 쇼핑 manager focused test 27건이 모두 통과했다.
- browser fallback 보강 후 쇼핑 manager 및 상품 미리보기 contract focused test 31건이 통과했다.
- 동일 실 URL을 로컬 무설정 환경에서 재실행해 잘못된 로그인 문구가 더는 반환되지 않음을 확인했다.
  이 환경에는 라이선스 서버 설정이 없어 실제 상품 복구 gateway 결과까지는 확인할 수 없으므로,
  설정이 갖춰진 앱에서 해당 URL의 실제 상품 미리보기 확인이 남아 있다.
