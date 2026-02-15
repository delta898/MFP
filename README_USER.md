# BlogGenius 사용자 가이드 (초보자용)

> 주제만 준비하면, 블로그 글 생성부터 저장까지 자동으로 처리합니다.

이 문서는 처음 사용하는 분도 중도 포기하지 않도록 "꼭 필요한 순서"만 남겨서 작성했습니다.

빠른 질문/문제 해결은 오픈채팅방이 가장 빠르니 아래 링크를 통해 들어오시기 바랍니다.

[도전인생의 100% 완전 자동화 블로깅 오픈채팅방](https://open.kakao.com/o/gZWL25Zh)

---

## 0. 먼저 이해할 것 (아주 중요)

- 이 프로그램은 **구글 스프레드시트 + 네이버 로그인 + Gemini API**를 사용합니다.
- 한 번 세팅하면 이후 반복 작업이 매우 편해집니다.

---

## 1. 빠른 시작 체크리스트 (권장 순서)

아래 7개만 끝내면 실행할 수 있습니다.

1. Gemini API Key 발급
2. Google Service Account JSON 발급
3. Google Spreadsheet 생성
4. Apps Script 코드 붙여넣기 + `setupTrigger` 1회 실행
5. 서비스 계정 이메일을 시트에 "공유(편집자 권한)"
6. `config/config.txt` 내용 수정
7. `./BlogGenius login` 실행

### 1-1. 여기까지 되면 정상

아래 3가지가 되면 세팅 완료입니다.
1. `./BlogGenius login` 후 로그인 성공 메시지 확인
2. `./BlogGenius trends` 실행 시 `trends/keywords/topics/shopping` 시트 자동 생성 확인
3. 시트에서 상태 변경 시 `topics`에 주제가 누적되면 정상

---

## 2. 준비물 발급

### 2-1. Gemini API Key

1. [Google AI Studio](https://aistudio.google.com/) 접속
2. `Get API key` 클릭
3. 키(`AIza...`) 복사 -> config/config.txt 파일에 반영

---

### 2-2. Google Service Account JSON

- [구글 서비스 계정 발급 안내 참고](https://buly.kr/5UJLf0u)

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 프로젝트 생성
3. `Google Sheets API` 사용 설정
4. `사용자 인증 정보 > 서비스 계정` 생성
5. `키 > 새 키 만들기 > JSON` 다운로드
6. 파일명을 `service_account.json`으로 바꿔 `config/` 폴더에 저장

예시:

```text
BlogGenius/
├─ config/
│  ├─ config.txt
│  └─ service_account.json
└─ ...
```

---

### 2-3. Google Spreadsheet 생성 + 공유

- [구글 서비스 계정 발급 안내 참고](https://buly.kr/5UJLf0u)

1. [Google Sheets](https://sheets.google.com/)에서 새 시트 생성
2. URL에서 시트 ID 복사 -> config/config.txt 파일에 반영
예시:
`https://docs.google.com/spreadsheets/d/1xQg0PuYHGKeM49TmxK4nIykFqtzGWRyQP8hygts-BVY/edit?gid=1568478969`
위 URL의 시트 ID는 `1xQg0PuYHGKeM49TmxK4nIykFqtzGWRyQP8hygts-BVY` 입니다.
3. 우측 상단 `공유` 클릭
4. `service_account.json` 안의 `client_email` 주소를 공유에 추가
5. 권한을 **편집자**로 지정 후 저장

중요:
- 개인 구글 계정 이메일이 아니라 **서비스 계정 이메일**을 공유해야 합니다.
- 이 단계가 빠지면 시트 읽기/쓰기 실패합니다.

---

### 2-4. Apps Script 설정

공유 파일 위치:
- `scripts/google_apps_script.js`

설정 순서:
1. 구글 스프레드시트에서 `확장 프로그램 > Apps Script` 열기
2. 기본으로 열린 `Code.gs` 내용을 전부 지우기
3. 이 프로젝트의 `scripts/google_apps_script.js` 전체 내용을 복사해서 붙여넣기
4. 상단의 기본제목('제목 없는 프로젝트')을 원하는 임의 이름으로 변경
5. `저장` 클릭
6. 상단 함수 선택에서 `setupTrigger` 선택 후 '실행' 버튼 클릭 (저장 버튼, 실행, 디버그 있는 위치)
7. `구글에서 확인하지 않은 앱` 팝업이 나오면 좌측 하단의 '고급' 선택
8. 팝업 좌측 하단의 <프로젝트이름>(으)로 이동(안전하지 않음) 클릭
9. <프로젝트 이름>에서 Google 계정에 대한 액세스를 요청합니다 팝업이 뜸
10. 액세스 항목에 '모두 허용'을 체크하고 '계속' 클릭
11. Apps Script 화면 하단의 '실행 로그'에서 '실행이 시작됨' 로그가 나오면 성공
12. 스프레드시트로 돌아와서 trends sheet나 keywords sheet의 드롭다운 값을 바꿔 테스트

동작 예시:
- `trends` 시트 E열 값을 `키워드 목록에 추가`로 바꾸면 `keywords` 시트에 추가
- `trends` 또는 `keywords` 시트에서 `연관검색어 조사`를 선택하면 `topics` 시트에 주제 추가

---

## 3. config.txt 설정 수정
- 에디터에서 config/config.txt 파일을 엽니다.

```ini
NAVER_ID = 본인_네이버_아이디
LICENSE_KEY = test
GEMINI_API_KEY = AIza...
GOOGLE_SHEET_ID = 구글시트_ID
```

포인트:
- `LICENSE_KEY = test` 기본값으로 시작하면 됩니다.
- `free`는 정식 무료 플랜(월 갱신) 키로 사용할 수 있습니다.
- 유료 라이선스 사용 시 나중에 키만 교체하면 됩니다.
- 프롬프트 커스터마이징이 필요하면 아래 파일을 직접 추가하세요(없으면 내부 기본값 사용):
  - `config/blog_prompt.md`
  - `config/shopping_prompt.md`

---

## 4. 실행 방법

### 4-1. 최초 1회 로그인

```bash
./BlogGenius login
```

브라우저에서 네이버 로그인 완료 후 인증 정보 자동 저장됩니다.

---

### 4-2. 주요 명령

```bash
# 트렌드 수집
./BlogGenius trends

# 구글 시트 기반 대량 블로그 발행
./BlogGenius batch

# 쇼핑 시트 기반 쇼핑 커넥트 블로그 발행
./BlogGenius shopping
```

---

### 4-3. Windows는 더 쉽게

아래 파일 더블클릭:

- `실행하기_로그인.bat`
- `실행하기_일괄발행.bat`
- `실행하기_쇼핑발행.bat`

---

### 4-4. macOS 보안 경고 해결

- 본 프로그램은 아직 '개발 단계'라 애플 인증을 얻기 전입니다.
- 실행 시 아래 메시지에 따라 추가 보안 조치 필요합니다.

`"개발자를 확인할 수 없어 열 수 없습니다"` 혹은 `"손상되었거나 악성 코드가 없음 확인 불가"` + `휴지통으로 이동` 팝업이 나오면 아래 조치 필요합니다.

아래 3줄을 터미널에서 실행한 뒤 다시 실행하세요.
Architecture(ex: Apple Silicon, Intel)에 따라 실행파일명이 다를 수 있습니다.
- BlogGenius-mac-arm64 혹은 BlogGenius-mac-intel

```bash
cd <프로그램이 설치된 경로>
xattr -dr com.apple.quarantine ./BlogGenius-mac-arm64   # Intel이면 BlogGenius-mac-intel
chmod +x ./BlogGenius-mac-arm64                         # Intel이면 BlogGenius-mac-intel
```

---

## 5. 워크플로우 (실사용 기준)

1. `trends` 실행 -> `trends` 시트에 키워드 적재
2. 시트 드롭다운에서 동작 선택 -> `keywords/topics` 자동 적재
3. `batch` 실행 -> `블로그 발행 준비 완료` 항목 순차 처리
4. `shopping` 실행 -> `shopping` 시트 URL 기반 글 생성/발행

자동 생성되는 시트:
- `trends`
- `keywords`
- `topics`
- `shopping`


---

## 6. 자주 묻는 문제

### Q1. 로그인 세션 만료라고 나옵니다.

- 먼저 아래 명령으로 다시 로그인하세요.

```bash
./BlogGenius login
```

---

### Q2. 시트 접근 실패(권한 오류)가 납니다.

아래 2개를 다시 확인하세요.

1. `GOOGLE_SHEET_ID`가 정확한가?
2. 스프레드시트 공유 대상이 **service account client_email**인가?

---

### Q3. 라이선스 오류가 납니다.

- `config/config.txt`의 `LICENSE_KEY` 확인
- 무료 사용은 `free`로 시작 가능
- 네트워크 연결 확인

---

### Q4. 이미지 생성이 안 됩니다.

- `GEMINI_API_KEY` 확인
- Gemini API 사용량/결제 상태 확인 (https://aistudio.google.com)

---

## 7. 지원

가장 빠른 지원:
- 오픈채팅: [https://open.kakao.com/o/gZWL25Zh](https://open.kakao.com/o/gZWL25Zh)
- Threads: [https://threads.net/amadejjs](https://threads.net/amadejjs)

---

## 8. 안내 및 주의사항

- 본 도구 사용으로 인한 외부 서비스 정책 이슈(예: 과도한 요청)는 사용자 책임입니다.
- 무리한 반복 실행은 피하고, 로그를 확인하면서 사용하세요.
