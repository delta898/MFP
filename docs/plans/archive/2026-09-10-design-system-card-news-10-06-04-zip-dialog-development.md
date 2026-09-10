# Card News ZIP 가져오기 dialog 전환 개발 기록

## Branch

- Branch: `codex/feature/design-system-card-news-10-06-04-zip-dialog`
- Base/parent branch: `codex/feature/design-system-card-news-10`
- Start date: 2026-09-10
- Status: 완료 · parent merge 준비 완료

## 사용자 필요와 목표

`만든 카드뉴스` 목록 안에서 펼쳐지는 ZIP 가져오기 form을 독립 transaction dialog로 전환한다. 파일 선택 뒤
이미지 순서, 제목과 원문 URL을 확인하고 명시적으로 가져오거나 취소하는 작업임을 분명히 하며, 목록 레이아웃을
밀어내지 않게 한다.

## 범위

1. ZIP 파일 선택 성공 후 공통 transaction dialog 열기
2. preview, 제목, 원문 URL, 상태와 import action을 dialog 안에 유지
3. 취소 버튼과 Escape로 닫을 때 임시 ZIP preview 상태 정리
4. 성공 시 dialog를 닫고 만든 카드뉴스 목록·선 Stéph택 상태 갱신
5. 접근 가능한 dialog 제목·focus와 focused 회귀 계약 보강

## 명시적 비범위

- ZIP 파일 형식과 import backend 계약 변경
- Card News 프로젝트 snapshot 구조 변경
- 만든 카드뉴스 삭제, RSS 개수·제한 또는 주기 발행
- 실제 외부 AI·Buffer·Google Drive 호출

## 설계 원칙

- 파일 picker는 OS가 소유하며, 유효한 파일을 읽은 뒤에만 review dialog를 연다.
- dialog action은 `취소`와 `가져오기`만 둔다. 같은 의미의 상단 `닫기`를 중복하지 않는다.
- dialog 밖 화면으로 이동하지 않고, 취소·Escape·성공 종료 경로가 같은 cleanup을 사용한다.
- dialog shell, footer와 action hierarchy는 공통 transaction pattern을 재사용한다.
- 구현 중 focused test만 실행하며 browser 회귀와 전체 단위 테스트는 사용자 승인 뒤 실행한다.

## 조사·구현 결과

- 목록 내부에 있던 `card-news-zip-panel`을 제거하고 공통 `ui-transaction-dialog`와
  `ui-transaction-dialog-form/header/footer` 구조를 사용하는 native `dialog`로 교체했다.
- OS 파일 선택기는 기존대로 유지하되 preview API가 유효한 카드 순서를 반환한 뒤에만 dialog를 연다.
- preview 실패는 닫힌 panel 안에 숨기지 않고 공통 toast로 알리며, 파일·preview 임시 상태를 즉시 정리한다.
- 상단 `닫기`를 두지 않고 footer의 `취소`와 `가져오기`만 유지했다. Escape와 취소가 같은 reset 경로를
  사용하고, 처리 중에는 Escape 종료를 막아 실행 상태가 끊기지 않게 했다.
- 제목에서 Enter를 눌러도 native form이 임의로 닫히지 않고 명시적인 import 흐름을 실행하도록 submit을
  연결했다.
- dialog가 닫힐 때 파일 input, preview, 제목, URL, 매칭 안내와 상태 문구가 함께 초기화된다.
- 기존 panel shell용 feature CSS를 삭제하고 preview와 field에 필요한 도메인 스타일만 남겼다.
- focused contract와 browser smoke에 dialog 구조, 중복 닫기 제거, preview 후 열기, Escape cleanup 계약을
  추가했다.

## 검증과 남은 위험

- `node --test scripts/card-news-shell-contract.test.js`: 13개 통과
- `git diff --check`: 통과
- `npm run test:ui-browser`: 통과 (250 fixture requests)
- `npm run test:unit`: 1,598개 통과, 실패 0개, 기존 Windows bootstrap 1개 skip
- 실제 OS 파일 picker의 시각적 동작과 여러 장 preview의 scroll/반응형 배치는 사용자 수동 확인이 필요하다.
