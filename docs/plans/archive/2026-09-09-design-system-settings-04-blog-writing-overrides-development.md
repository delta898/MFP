# Blog Beta 글쓰기 기본값 상속과 글별 override 개발 기록

## Branch

- Branch: `codex/feature/design-system-settings-04-blog-writing-overrides`
- Base/parent branch: `codex/feature/design-system-settings-main`
- Start date: 2026-09-09
- Status: 완료 · parent merge 준비

## 사용자 필요와 목표

Settings Beta의 `글쓰기 기본값`이 Blog Beta `빠른 글 작성 > 바로 생성`과 실제 생성 prompt에 적용되게 한다. 글 구성 중 본문 길이·도입·전개·마무리만 이번 글의 부분 override로 제공하며, 연속 시리즈 작성에 유용한 선택은 이 기기의 최근값으로 유지한다.

## 범위

1. Blog Beta 바로 생성의 글쓰기 기본값 요약과 Settings Beta 이동
2. 본문 길이·도입·전개·마무리의 선택적 글 단위 override
3. 기기에 유지되는 반복 선택용 최근 선택 state
4. 글감 보관·대기열·수정 dialog의 글별 override 저장과 복원
5. 전역 기본값과 글별 override를 최종 blog generation prompt에 조합
6. prompt precedence, image count, UI/payload/session 회귀 테스트와 관련 canonical 문서

## 명시적 비범위

- Settings Beta 글쓰기 기본값 schema의 재설계
- 표현 방식·높임 방식·어조의 글별 override
- 이름 있는 profile 생성·선택
- 기존 `블로그` surface 변경
- 최근 선택을 공통 Settings Beta 기본값이나 설정 파일에 반영
- 기본값과 최근 선택의 출처를 설명하는 별도 UI
- parent merge, release, tag, push

## 합의한 설계

- Settings Beta는 장기 공통 기본값을 소유한다.
- Blog Beta의 구조화 override는 해당 글에만 저장되며 새 글의 전역 기본값을 바꾸지 않는다.
- 새 글에 사용한 반복 선택은 성공적인 보관·대기열 추가·발행 뒤 browser localStorage의 기기 최근값으로 유지한다.
- 기존 글감 수정은 그 글의 저장값을 복원하지만 다음 새 글의 최근값을 바꾸지 않는다.
- 주제·키워드·제목·경험·방향·참고 URL·예약 일시는 다음 글로 이어지지 않는다.
- 선택하지 않은 구조 항목은 실제 생성 시점의 최신 Settings Beta 기본값을 상속한다.
- 사용자는 항상 화면에 표시된 선택값을 확인할 수 있으므로 `기본값 사용`·`최근 선택 사용` 같은 별도 출처 라벨은 두지 않는다.

## 구현 단계

1. 기존 quick form·queue editor 재사용 구조와 topic/prompt 계약 확인
2. 공통 기본값 read model과 Blog Beta summary/override UI 연결
3. 기기 최근 선택과 글감 payload 저장·복원
4. generation profile merge와 prompt precedence 적용
5. focused unit/UI contract와 browser smoke
6. 사용자 hands-on 확인 뒤 full regression과 parent integration

## 검증 계획

- 바로 생성과 글감 수정 dialog가 같은 UI·payload 계약을 공유하는지 확인
- 저장된 기기 최근값이 다음 새 글과 앱 재시작 뒤에도 복원되는지 확인
- 저장된 글감은 자체 override를 복원하고 수정만으로 기기 최근값을 바꾸지 않는지 확인
- Settings Beta 기본값과 부분 override가 허용된 field만 final prompt에 반영되는지 확인
- 전역 설정 변경이 override하지 않은 field에만 반영되는지 확인
- image plan 결과가 요구한 이미지 block 개수와 일치하는지 검증

## 진행 기록

- 2026-09-09: Settings Beta 글쓰기 기본값 stage를 full unit 1,547개(통과 1,546·실패 0·skip 1) 뒤 parent에 fast-forward merge하고 완료 branch를 삭제했다.
- 2026-09-09: 사용자가 앱 실행 중 최근 선택을 유지하되 파일에 장기 저장하지 않고, 저장된 글감의 override는 해당 글의 수명 동안만 유지하는 기준을 승인했다.
- 2026-09-09: 사용자가 끊김 없는 연속 작성을 위해 최근 선택을 앱 재시작 뒤에도 유지하도록 localStorage 사용을 선택했다. 별도 출처 라벨은 두지 않고 화면의 실제 선택값 자체를 적용값으로 삼는다.
- 2026-09-09: Blog Beta 공용 바로 생성/글감 수정 form에 네 가지 override를 추가했다. 새 글 성공 시에만 기기 최근값을 갱신하고, 글감의 `options.writing_overrides`를 Sheet schema 확장 없이 저장·복원하도록 연결했다.
- 2026-09-09: 최종 generation composer가 최신 Settings Beta 기본값에 명시적 글별 값만 병합하도록 했고, 적용된 길이가 자동 이미지 수에도 반영되며 생성 결과의 이미지 block 수가 계획과 정확히 일치하는지 검증하도록 강화했다.
- 2026-09-09: 관련 domain/prompt/Sheet/service/route/UI contract 86개가 통과했고, 최종 모듈 분리 뒤 browser UI smoke 244 fixture request도 통과했다.
- 2026-09-09: 최초 full unit에서 새 필드로 인한 레이아웃 계약 불일치와 quick queue 모듈 800줄 제한 초과를 발견했다. 계약을 7개 공통 select 구조로 갱신하고 글쓰기 override UI 책임을 독립 모듈로 분리했다.
- 2026-09-09: 수정 뒤 full unit 1,552개(통과 1,551·실패 0·skip 1)가 통과했다.

## 현재 결과와 남은 확인

- 구현과 자동 검증 완료. parent fast-forward merge 대상으로 준비했다.
- 사용자 확인 예정: 새 글 성공 뒤 최근 선택 복원, 앱 재시작 뒤 복원, 저장된 글감 수정 시 자체 override 복원, 실제 생성 글의 길이·도입·전개·마무리와 이미지 영역 수.
