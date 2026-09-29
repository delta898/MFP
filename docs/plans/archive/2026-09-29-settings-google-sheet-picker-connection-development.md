# Google Spreadsheet 설정 연결 흐름 개발 기록

- Branch: `codex/feat/settings-google-sheet-picker-connection`
- Start date: 2026-09-29
- Base/parent branch: `release/v0.5.4`
- Status: 구현 및 자동 검증 완료, 사용자 실계정 최종 확인 대기

## 사용자 필요와 목표

BlogGenius 설정의 현재 Spreadsheet 선택 방식을 사용자가 명확히 이해하고 통제할 수 있게 한다. 연결 시작 시 사용자는 앱이 새 파일을 만들지 기존 파일을 선택할지 결정한다. 새 파일은 앱 전용 `BlogGenius/BlogGenius_YYYYMMDD` 위치/이름으로 만들고 바로 연결한다. 기존 파일은 Google Picker에서 선택한다.

## 범위

- 설정의 Spreadsheet 연결 UI를 `새 파일 생성`과 `기존 파일 선택` 두 동작으로 단순화한다.
- 새 파일 생성 전에 저장 위치/이름을 분명히 안내하고, 사용자 동작 후 Drive의 `BlogGenius` 폴더에 날짜 이름의 Spreadsheet를 생성해 즉시 연결한다.
- 기존 Spreadsheet는 Desktop OAuth 기반 Google Picker에서 선택해 연결한다.
- 새로 생성/선택된 Spreadsheet를 이후 기존 콘텐츠 공간 기능이 사용하는 연결 대상으로 전달한다.
- 기존 OAuth/API 경계와 연결 저장 방식, 오류·재시도 동작을 확인하고 필요한 계약 문서를 갱신한다.

## 비범위

- Google Cloud Console의 OAuth 동의 화면/프로젝트 설정 변경 (사용자 측에서 Picker API 활성화 및 scope 정리)
- Spreadsheet 데이터/탭 구조, 게시 시트 계약 변경
- Blog 편집 UI 변경
- Google 계정 연결 해제/토큰 회수 UX의 전면 개편
- 커밋 외 push, release tag, 배포

## 제안 설계와 단계

1. 설정 UI와 현재 OAuth/Sheets/Drive 연결 경계, 저장된 Spreadsheet 식별 방식, 기존 테스트를 추적한다.
2. 새 파일 생성과 기존 파일 Picker 선택을 하나의 명시적 연결 선택지로 정리한다. 빈번한 신규 생성에서 Picker 이동을 요구하지 않는다.
3. `drive.file`로 폴더/Spreadsheet를 만들고 선택된 기존 파일을 연결하는 경로를 구현한다. 기존 데이터/계정 전체 Drive 탐색 권한을 추가하지 않는다.
4. 기존 콘텐츠 공간 연결 소비자와 통합하고, 필요한 경우 연결된 파일 메타데이터(이름/URL)를 보여준다.
5. 좁은 단위/계약/설정 UI 테스트를 수행하고, 사용자의 Google Cloud Picker API 활성화 후 수동 Picker 및 생성 플로우를 확인한다.

## 사용자와 합의한 결정

- 연결 시작에는 `새 파일`과 `기존 파일 선택` 두 동작만 제공하고 짧고 분명한 안내를 둔다.
- 신규 파일 경로는 `BlogGenius/BlogGenius_YYYYMMDD`; 기존 파일 경로는 Picker.
- 제품이 사용자 모르게 임의 파일을 만들지 않는다. 파일 생성은 사용자가 새 파일 버튼을 눌렀을 때만 실행한다.
- 생성 파일을 자동으로 브라우저에서 열거나, 생성 후 Picker로 다시 선택시키지 않는다. 생성 결과는 즉시 연결하고 필요 시 사용할 수 있는 `열기` 링크를 제공한다.
- 사용자가 Google Console에서 `spreadsheets` scope를 제거하기로 했고, 새 OAuth 인증 요청 및 Sheets API 호출은 `drive.file`만 사용한다.
- Google Picker API는 사용자가 자신의 Google Cloud 프로젝트에서 활성화한다.
- 설정 UI는 별도의 Google 계정 연결 카드/동작을 두지 않고 Spreadsheet 연결을 중심으로 통합한다. 계정 인증은 새 파일 생성 또는 Picker 선택 중 필요할 때 같은 흐름 안에서 진행한다.
- Google OAuth는 Electron 내장 브라우저가 아니라 OS 기본 브라우저에서 연다. 완료 결과는 callback 서버가 보관하고 앱이 flow 상태를 조회한다. 외부 브라우저 창을 닫아도 앱의 `인증 취소` 동작으로 대기를 끝낼 수 있어야 한다.
- 기존 config URL은 Picker 검증 성공 전에는 지우거나 덮어쓰지 않는다. 동일 파일 Picker 선택 성공 시 URL은 유지하고, 선택 파일 ID와 전환 완료 상태를 저장한다. 다른 파일이면 성공 후에만 URL을 교체한다.
- 기존 URL만 있고 Picker 완료 상태가 없는 사용자는 기존 파일을 다시 선택하도록 한 번 안내한다. 성공 후 같은 파일에 대해 재안내하지 않는다. 취소/실패 시 기존 연결은 보존하고 재시도할 수 있다.
- 신규 연결에서도 별도 계정 연결 단계를 요구하지 않는다. 사용자가 `새 파일 생성` 또는 `기존 파일 선택`을 눌렀을 때 인증이 필요하면 그 자리에서 OAuth를 진행하고 원래 동작을 이어간다.
- 사용자가 Google Console에서 legacy `spreadsheets` scope를 제거했으므로 새 인증 경로는 `drive.file`만 요청하고, 앱이 재인증 과정에서 제거한 scope를 다시 요청하지 않도록 정리한다.
- 사용자가 설정 화면의 표현이 이미 연결된 상태로 오해될 수 있다고 지적했다. 전환 상태에는 `전환할 기존 Spreadsheet`와 `기존 파일 열기`를 표시하고, 같은 파일을 다시 선택하면 전환되며 내용은 유지된다는 설명을 연결 영역 안에 둔다. Google Picker라는 내부 구현 용어는 사용자 문구에 노출하지 않는다.

## 영향 경계 조사

- 적용 대상은 신규 설정 흐름인 `설정 > 기본 연결 > 콘텐츠 공간` (`settings-next`)으로 한정한다. 구형 설정 화면은 이번 범위에서 수정하지 않는다.
- OAuth callback은 현재 계정 연결과 Picker 선택이 같은 토큰 저장소를 사용하므로, Picker mode를 구분하고 기존 로그인 상태를 보존한다.
- 선택한 파일의 ID/URL과 표시 이름은 기본 연결 설정에 저장해 재시작 후에도 파일명을 표시한다. 기존 파일의 내용과 탭은 변경하지 않는다.
- 앱이 생성한 `BlogGenius` 폴더를 재사용하고, 오늘 날짜 파일이 이미 있으면 중복 생성하지 않고 기존 파일 선택을 안내한다.

## 진행 기록

- FBR은 `release/v0.5.4` (`b0613cbe`)에서 시작했다. 선행 POC 브랜치 `codex/feat/drive-file-sheets-poc`의 검증 결과는 별도 커밋 `106e90d2`에 기록되어 있다.
- 작업 트리에는 POC의 로컬 상태 파일(`prototypes/google-drive-file-sheets-poc/*.json`)이 존재한다. 사용자 로컬 데이터로 보존하며 FBR 커밋에 포함하지 않는다.
- 사용자가 Google Picker API를 활성화했다.
- Settings Beta에서 URL 직접 입력 UI를 `새 파일 생성`과 `기존 파일 선택`으로 교체하고, 연결된 파일명을 표시하도록 했다. 파일명과 URL은 콘텐츠 연결 설정에 함께 저장된다.
- Picker 경로는 `drive.file` 단독 scope 및 spreadsheet MIME 필터를 사용한다. Picker 인증에서 refresh token/email 응답이 생략되어도 기존 OAuth 연결 정보를 보존하도록 했다.
- 신규 생성은 Drive `BlogGenius` 폴더와 `BlogGenius_YYYYMMDD`를 재사용/생성하고, 같은 날짜 문서가 이미 있으면 중복 생성을 거부해 기존 파일 선택을 안내한다. 새 파일에는 앱 기본 탭을 초기화한다.
- 기존 파일 선택은 Picker 반환 ID를 Drive/Sheets로 검증한 뒤 URL과 제목을 저장한다. 기존 파일의 데이터/탭은 변경하지 않는다.
- Settings Beta는 Google 계정 연결과 파일 연결 카드를 하나의 Spreadsheet 연결 카드로 통합한다. 기존 URL은 유지한 채 Picker에서 해당 파일을 다시 선택하도록 안내하고, 파일 ID 기반 전환 완료 값을 URL과 함께 저장해 같은 파일에 재안내하지 않는다.
- 새 파일 생성과 Picker 선택은 Google 계정 연결이 없을 때 각 버튼 안에서 필요한 OAuth를 진행한다. 새 파일 생성도 인증 후 원래 동작을 이어간다.
- Picker 버튼을 눌렀을 때 Electron 내부 브라우저에서 Google이 “지원되지 않는 브라우저”로 인증을 차단하는 문제를 확인했다. 시스템 기본 브라우저 실행과 callback flow polling으로 변경했고, 각 진행 버튼은 대기 중 `인증 취소`로 바뀌어 UI 잠금을 풀 수 있게 했다.
- OAuth 기본/Picker 경로와 앱의 Sheets API 호출은 `drive.file`만 사용하며 `spreadsheets` scope를 재요청하지 않는다.
- 수동 검토에서 확인된 legacy 전환 UX를 보완했다. URL이 설정되어 있어도 Picker 승인 파일 ID와 일치하지 않으면 backend setup readiness를 미완료로 반환해 Dashboard가 잘못 초록 완료 처리하지 않게 한다. 해당 항목은 경고색과 짧은 `전환 필요` 상태로 강조하고, 자세한 설명은 설정 화면에 둔다.
- Settings의 `기존 파일 선택`은 migration이 필요할 때만 `전환`으로 표시하고, Spreadsheet 생성/선택 동작은 카드의 우측 하단에 배치했다(모바일은 가로폭에 맞춰 전체 폭 유지).
- 전환 상태의 기존 파일 영역 문구를 `전환할 기존 Spreadsheet` / `기존 파일 열기`로 바꾸고, 같은 파일 선택 시 내용이 유지된다는 안내를 영역 안에 배치했다. 사용자에게 보이는 안내에서 내부 구현 명칭을 제거했다.
- 사용자 피드백에 따라 legacy 전환이 필요한 동안에는 `전환`을 primary, `새 파일 생성`을 secondary로 표시한다. 정상 상태에서는 신규 파일 생성이 primary인 기본 위계를 유지한다.
- 실사용에서 Picker 연결 완료 피드백과 우측 상태 뱃지가 서로 달라지는 문제를 확인했다. 일시적인 접근 검증 상태를 URL 문자열이 아닌 Spreadsheet ID 기준으로 연결해 표시가 같은 파일을 안정적으로 가리키도록 보완한다.
- Dashboard에서는 Spreadsheet 전환이 끝난 경우에도 다른 준비 카드처럼 번호 `2`와 기본 카드 스타일을 유지한다. legacy 전환이 필요한 경우에만 작은 `전환 필요` 배지와 경고 테두리로 강조하며, 연결 방법 상세는 설정 화면에 둔다. 카드 내부는 고정 마크 열과 유연한 텍스트 열의 grid로 배치한다.
- 공통 긴급 공지 기능은 이번 연결 전환에서 구현하지 않는다. 필요 시 노출 조건과 확인 상태를 별도 설계하도록 backlog P3에 기록했다.
- 이 보완의 집중 검증: system/account setup readiness 및 Dashboard/Settings 계약 테스트 45개 통과, `git diff --check` 통과.
- 집중 검증: 41개 관련 단위/설정 UI 계약 테스트 통과, JavaScript 구문 검사 및 `git diff --check` 통과.
- OAuth 외부 브라우저 flow 상태/취소 단위 테스트와 Settings UI 계약 테스트 16개 통과. JavaScript 구문 검사 및 `git diff --check` 통과.
- 변경 후 전체 UI browser smoke를 다시 실행했다. 설정·계정·블로그 자동화 단계를 통과했지만, 이전과 같은 `local manuscript import and publish flows` fixture assertion (`scripts/test-ui-browser-smoke.js:4541`, `true !== false`)에서 실패했다. 이번 OAuth 변경과 무관한 영역으로 보이며 별도 확인이 필요하다.
- `npm run test:ui-browser`는 갱신된 Spreadsheet 설정 시나리오를 통과했으나 이후 `local manuscript import and publish flows` 단계에서 기존 fixture 예상값 assertion이 실패했다 (`scripts/test-ui-browser-smoke.js:4541`). Google Picker 실인증/선택은 자동 스모크에서 호출하지 않으므로 사용자 수동 확인이 남아 있다.
- Spreadsheet UI 코드 분리 후 관련 계약 테스트가 소스 파일 경계를 따라가도록 갱신했다. manifest 순서 계약, 캐시 버전 계약, 현재 패키지 버전(`0.5.4`) 계약도 정렬했다.
- 최신 집중 검증: 관련 Dashboard/Settings/구조/스타일/버전/시작 순서 테스트 55개 통과, JS 구문 검사 및 `git diff --check` 통과.
- 승인된 전체 검증: `npm run test:unit` 통과 (370개 파일, 2,034 tests: 2,033 통과, 1 skipped), 보안 audit 취약점 0건.
- 최신 `npm run test:ui-browser`는 Dashboard 및 설정 구간을 통과했으나, Blog Beta 원고 편집 시나리오에서 이미지 생성 버튼 기대값이 `중지`가 아닌 `준비 중…`으로 관찰되어 실패했다 (`scripts/test-ui-browser-smoke.js:4085`). Spreadsheet 연결 플로우와는 별도 영역이며, 실계정 OAuth/파일 선택은 수동 확인 대상이다.

## 결과 및 검증

- 사용자 수동 확인: 설정 Beta에서 (1) 새 계정 연결 후 신규 파일 생성 및 파일명/열기 링크 표시, (2) 같은 날짜 중복 생성 시 기존 파일 선택 안내, (3) Picker에서 기존 Spreadsheet 선택/취소, (4) 앱 재시작 후 파일명/연결 유지, (5) 저장된 파일로 기존 콘텐츠 공간 읽기/쓰기.
- 브라우저 smoke의 Blog 편집 assertion 실패는 별도 확인이 필요하다. Google Cloud Console scope와 설정 사용자 흐름은 실제 계정으로 수동 확인이 남아 있다.
