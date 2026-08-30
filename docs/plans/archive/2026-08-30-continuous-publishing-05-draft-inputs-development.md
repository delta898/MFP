# 연속 발행 Stage 5 — 원고 폴더·원고 붙여넣기

## 브랜치 정보

- branch: `feature/continuous-publishing-05-draft-inputs`
- 시작일: 2026-08-30
- base/parent branch: `feature/continuous-publishing-main`
- 상태: 완료 및 parent 통합 승인

## 사용자 필요와 목표

기존 빠른 포스팅의 `원고 폴더`와 `원고 붙여넣기`를 `블로그 Beta`에서도 사용한다.
두 방식은 이미 완성된 원고가 있으므로 Topics Queue에 저장하지 않고, 원고 미리보기·검증 후
사용자가 선택한 공개 발행·임시 저장·예약 등록을 즉시 실행한다.

## 초기 범위

- 기존 `원고 폴더`·`원고 붙여넣기` 동작과 Topics Sheet 저장 필드 조사
- 폴더·붙여넣기를 구분하는 독립 `blog-next-*` UI controller
- 로컬 Markdown preview·validation API 재사용
- 대상, 대상별 카테고리, 이미지 처리, 공개·임시 저장·예약 옵션
- 검증된 기존 local Markdown publish API를 통한 즉시 실행
- Local은 차단하고 Development·Production의 수동 발행 정책을 그대로 적용
- validation·service unit·browser smoke 회귀 보강

## 비목표

- 원고 폴더를 여러 PC 사이에 동기화
- 로컬 파일 본문을 Supabase에 저장
- Queue 등록 시 AI로 원고를 재작성
- 원고나 파일을 Topics Queue에 저장
- Stage 4 runner를 통한 후속 실행
- 기존 `블로그` 메뉴의 포스팅 흐름 제거·교체
- 주기 timer와 여러 PC distributed lease

## 설계 원칙

- 이미 원고가 있는 흐름은 글감 Queue와 개념적으로 분리한다.
- 파일은 현재 브라우저 세션에서만 보유하고, 실행 요청에만 직렬화한다.
- preview/validation은 외부 플랫폼 변경과 quota를 발생시키지 않는다.
- 발행 대상·카테고리·이미지·발행 방식은 즉시 실행 요청이 소유한다.
- 자동 테스트는 fixture/mock만 사용하고 외부 AI·원격 Sheet·실제 발행을 호출하지 않는다.

## 조사 결과와 확정된 결정

- legacy 붙여넣기는 Markdown 문자열을 즉시 요청에 포함하고 임시 workspace에 `contents.md`로 물질화한 뒤 실행 후 삭제한다.
- legacy 폴더 입력은 브라우저가 Markdown·이미지 파일 내용을 직렬화해 즉시 요청으로 보내며, 영구 Queue source를 만들지 않는다.
- Topics Sheet의 `options` JSON은 메타데이터를 위한 단일 cell이므로 여러 이미지 base64와 폴더 파일을 저장하기에 부적합하다.
- 사용자와 논의한 결과, 완성 원고를 지속 Queue source로 만들 필요보다 즉시 실행의 단순성이 더 크다고 결정했다.
- 따라서 Sheet 본문 저장, local artifact store, owner device·fingerprint가 모두 불필요해졌다.

## 구현 단계

1. legacy 원고 입력·파일·preview·publish 계약 조사
2. 붙여넣기 UI·preview·직접 publish 수직 흐름
3. 폴더 파일 직렬화·preview·직접 publish 수직 흐름
4. 환경 발행 gate·browser smoke·전체 unit 회귀

## 진행 기록

- 2026-08-30: Stage 4 수동 단건 runner를 parent에 통합하고 Stage 5 하위 브랜치를 생성했다.
- 2026-08-30: legacy 원고 흐름이 즉시 요청·임시 workspace 기반이며 Queue에 지속되는 source contract은 없음을 확인했다.
- 2026-08-30: 붙여넣은 원고와 폴더 파일의 저장 성격을 분리하는 권장안을 정리했다.
- 2026-08-30: 사용자와 추가 논의 후 완성 원고 두 흐름은 Queue에 넣지 않고 바로 실행하기로 범위를 변경했다.
- 2026-08-30: 독립 `blog-next-*` 원고 UI, 미리보기·검증, 대상·발행 옵션과 직접 publish client를 구현했다.
- 2026-08-30: 원고 직접 publish 경계에 환경 manual/automated publish policy를 적용해 Local이 원격 플랫폼을 변경하지 못하게 했다.
- 2026-08-30: 붙여넣기 원고의 preview→확인→직접 실행 브라우저 fixture를 추가하고, 같은 폴더 재선택·오래된 preview 응답·브라우저 임시 저장 한도도 안전하게 처리했다.
- 2026-08-30: 전체 단위 테스트 1,163개와 브라우저 UI smoke 76개 fixture 요청이 통과했다. 브라우저 검증 최초 1회는 기존 성공 토스트가 Queue 버튼을 가린 테스트 타이밍으로 실패했으나 재실행은 통과했고 기능 응답 실패는 없었다.
- 2026-08-30: 사용자가 Development에서 원고 폴더와 원고 붙여넣기 직접 실행 흐름이 정상 동작함을 확인하고 parent 통합을 승인했다.

## 완료 결과

- `바로 생성`만 Topics Queue의 글감 등록·발행 계획 흐름을 사용한다.
- `원고 폴더`와 `원고 붙여넣기`는 원고·파일을 Queue나 Supabase에 저장하지 않는다.
- 두 완성 원고 흐름은 미리보기와 validation을 통과한 뒤 기존 Markdown 포스팅 경계로 직접 실행한다.
- 직접 실행도 공통 환경 정책을 적용해 Local 원격 변경을 차단하고 Development 수동 실행만 허용한다.

## 수동 확인과 남은 위험

- 사용자가 Development에서 Markdown 원고 폴더와 붙여넣기 원고의 직접 실행을 확인했다.
- 실행 결과가 Queue 흐름과 분리되어 정상 동작함을 확인했다.
- 예약 등록은 Development 환경 정책상 차단된다. Production 후보 검증 전에는 실제 예약 발행을 수행하지 않는다.
- 실제 플랫폼별 예약 등록은 Production 후보 검증 때 별도로 확인한다.
