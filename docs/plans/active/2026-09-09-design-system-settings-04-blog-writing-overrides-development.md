# Blog Beta 글쓰기 기본값 상속과 글별 override 개발 기록

## Branch

- Branch: `codex/feature/design-system-settings-04-blog-writing-overrides`
- Base/parent branch: `codex/feature/design-system-settings-main`
- Start date: 2026-09-09
- Status: 진행 중

## 사용자 필요와 목표

Settings Beta의 `글쓰기 기본값`이 Blog Beta `빠른 글 작성 > 바로 생성`과 실제 생성 prompt에 적용되는 사실을 사용자가 화면에서 이해할 수 있게 한다. 글 구성 중 본문 길이·도입·전개·마무리만 이번 글의 부분 override로 제공하며, 연속 시리즈 작성에 유용한 선택은 앱 실행 동안 최근값으로 유지한다.

## 범위

1. Blog Beta 바로 생성의 글쓰기 기본값 요약과 Settings Beta 이동
2. 본문 길이·도입·전개·마무리의 선택적 글 단위 override
3. 앱 실행 동안만 유지되는 반복 선택용 session state
4. 글감 보관·대기열·수정 dialog의 글별 override 저장과 복원
5. 전역 기본값과 글별 override를 최종 blog generation prompt에 조합
6. prompt precedence, image count, UI/payload/session 회귀 테스트와 관련 canonical 문서

## 명시적 비범위

- Settings Beta 글쓰기 기본값 schema의 재설계
- 표현 방식·높임 방식·어조의 글별 override
- 이름 있는 profile 생성·선택
- 기존 `블로그` surface 변경
- 장기 실행 기본값을 browser localStorage 또는 설정 파일에 추가
- parent merge, release, tag, push

## 합의한 설계

- Settings Beta는 장기 공통 기본값을 소유한다.
- Blog Beta의 구조화 override는 해당 글에만 저장되며 새 글의 전역 기본값을 바꾸지 않는다.
- 새 글에 사용한 반복 선택은 성공적인 보관·대기열 추가·발행 뒤 앱 실행 동안만 최근값으로 유지한다.
- 기존 글감 수정은 그 글의 저장값을 복원하지만 다음 새 글의 session 최근값을 바꾸지 않는다.
- 주제·키워드·제목·경험·방향·참고 URL·예약 일시는 다음 글로 이어지지 않는다.
- 선택하지 않은 구조 항목은 실제 생성 시점의 최신 Settings Beta 기본값을 상속한다.

## 구현 단계

1. 기존 quick form·queue editor 재사용 구조와 topic/prompt 계약 확인
2. 공통 기본값 read model과 Blog Beta summary/override UI 연결
3. session state와 글감 payload 저장·복원
4. generation profile merge와 prompt precedence 적용
5. focused unit/UI contract와 browser smoke
6. 사용자 hands-on 확인 뒤 full regression과 parent integration

## 검증 계획

- 바로 생성과 글감 수정 dialog가 같은 UI·payload 계약을 공유하는지 확인
- 첫 글은 전역 기본값, 다음 새 글은 이번 실행의 최근 선택을 사용하는지 확인
- 앱 재시작에 해당하는 새 renderer session에서는 실행 최근값이 남지 않는지 확인
- 저장된 글감은 자체 override를 복원하고 수정만으로 session 최근값을 바꾸지 않는지 확인
- Settings Beta 기본값과 부분 override가 허용된 field만 final prompt에 반영되는지 확인
- 전역 설정 변경이 override하지 않은 field에만 반영되는지 확인
- image plan 결과가 요구한 이미지 block 개수와 일치하는지 검증

## 진행 기록

- 2026-09-09: Settings Beta 글쓰기 기본값 stage를 full unit 1,547개(통과 1,546·실패 0·skip 1) 뒤 parent에 fast-forward merge하고 완료 branch를 삭제했다.
- 2026-09-09: 사용자가 앱 실행 중 최근 선택을 유지하되 파일에 장기 저장하지 않고, 저장된 글감의 override는 해당 글의 수명 동안만 유지하는 기준을 승인했다.

## 현재 결과와 남은 확인

- 구현 전.
- 사용자 확인 예정: 기본값과 이번 글 override의 시각적 구분, 시리즈 글 연속 입력 편의, 글감 dialog 복원, 실제 생성 품질.
