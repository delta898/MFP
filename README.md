# 🤖 네이버 블로그 자동 포스팅 봇 (Naver Blog Auto Bot)

**"주제만 던져주면, 글 작성부터 이미지 생성, 업로드까지 알아서!"**

Google Gemini AI를 활용하여 블로그 포스팅의 전 과정을 자동화한 도구입니다. SEO(검색 최적화)된 글쓰기는 물론, AI가 본문 내용을 분석해 적절한 이미지를 그려주고 네이버 블로그 에디터에 자동으로 발행합니다.

## ✨ 주요 기능

* **✍️ 자동 글쓰기**: `job.json`에 주제와 키워드만 입력하면 서론-본문-결론이 완벽한 원고를 작성합니다.
* **🎨 이미지 자동 생성**: 글의 맥락을 이해하고 이에 어울리는 고퀄리티 이미지를 생성(Gemini/Imagen)하여 본문에 삽입합니다.
* **🔧 하이브리드 모드**: 내가 쓴 글(`contents.md`)에 AI가 이미지만 채워넣는 협업이 가능합니다.
* **🛡️ 안전한 실행**: **절대 기존 파일을 덮어쓰지 않습니다.** (글/이미지가 있으면 건너뛰고 없는 것만 만듭니다.)
* **🚀 자동 발행**: 완성된 원고와 이미지를 네이버 스마트 에디터에 자동으로 입력하고, 소제목 스타일링까지 수행합니다.

---

## 🚀 설치 및 설정 (Setup)

### 1. 사전 준비
* **Node.js**: v18 이상 버전이 설치되어 있어야 합니다.
* **네이버 계정**: 글을 발행할 블로그 아이디.
* **Google Gemini API Key**: [Google AI Studio](https://aistudio.google.com/)에서 무료로 발급받을 수 있습니다.

### 2. 설치 (Installation)
터미널(Terminal)을 열고 프로젝트 폴더로 이동한 뒤 명령어를 입력하세요.
```bash
npm install
```

### 3. 필수 설정 (Configuration)

**1) 네이버 로그인 쿠키 (`config/auth.json`)**
* 로그인된 브라우저의 쿠키 정보를 JSON 배열(Playwright storageState 형식)로 추출하여 이 파일에 저장하세요.
* *(이 파일이 없거나 비어있으면 발행 단계에서 로그인이 되지 않습니다.)*

**2) 설정 파일 (`config/settings.js`)**
* `HEADLESS: true` (백그라운드 실행) 또는 `false` (화면 보임) 설정
* `GEMINI_API_KEY` 입력

---

## 🖥️ 사용 방법 (Usage)

터미널에서 `npm run` 명령어로 모든 기능을 제어합니다.

### 1️⃣ 최초 로그인 (Login Setup)
봇이 블로그에 글을 쓸 수 있도록 인증 정보를 저장하는 단계입니다. (최초 1회 필수)

```bash
npm run login
```
1. 브라우저 창이 열리면 사용자가 직접 네이버에 로그인합니다. (2단계 인증 포함)
2. 로그인이 완료되어 메인 화면으로 이동하면, **창이 자동으로 닫히고** 인증 정보가 저장됩니다.

### 2️⃣ 완전 자동 모드 (Auto Mode)
주제(`job.json`)만 주면 폴더 생성, 글 작성, 이미지 생성, 발행까지 **논스톱**으로 처리합니다.
* **기본 동작**: `workspace/날짜_시간_주제명` 폴더를 자동으로 생성합니다.

```bash
npm run auto
```

### 3️⃣ 하이브리드 모드 (수동 글 + 자동 이미지) 🔥
**"글은 내가 쓰고, 이미지는 AI가 만들어줘!"**
이미 글이 있는 폴더를 지정하면, 봇은 **글을 덮어쓰지 않고** 부족한 이미지만 생성해서 채워넣습니다.

1. `workspace/내폴더`를 만들고 `contents.md`를 직접 작성해서 넣습니다. (이미지 위치에 `[[IMAGE_0 ...]]` 표시)
2. 아래 명령어로 실행합니다.

```bash
# 특정 폴더 지정 실행 (-d 옵션)
npm run auto -- -d "workspace/내폴더"
```
> **안전 장치**: 폴더 안에 이미 `contents.md`나 이미지 파일이 있다면 **절대 덮어쓰지 않고 스킵**합니다.

### 4️⃣ 글/이미지 생성만 하기 (Generate Only)
발행은 하지 않고 결과물만 만듭니다.

```bash
# 자동 폴더 생성
npm run gen

# 특정 폴더에 생성 (하이브리드 작업 시 유용)
npm run gen -- -d "workspace/내폴더"
```

### 5️⃣ 발행만 하기 (Publish Only)
이미 만들어진 폴더를 블로그에 업로드합니다.

```bash
npm run pub -- -d "workspace/20260126_맛집_탐방"
```
---

## 💡 `job.json` 작성 가이드 & 예시

`job.json` 파일은 AI에게 일을 시키는 **작업 지시서**입니다.

```json
{
  "subject": "맥북 프로 M5 루머 총정리",
  "keywords": ["맥북프로", "M5칩", "애플신제품", "노트북추천"],
  "content_guide": {
    "target_audience": "IT 기기에 관심 많은 대학생 및 직장인",
    "tone_and_manner": "전문적이고 분석적인 톤",
    "additional_instructions": "가격 인상 루머에 대해서는 비판적인 시각도 포함해줘."
  },
  "image_options": {
    "generate": true,
    "count": 4,  // 생성할 이미지 개수 강제 지정 (Override)
    "style": "cinematic tech product photography, high detail"
  }
}
```

---

## 📂 폴더 구조 및 파일

작업이 완료되면 `workspace` 폴더 안에 아래와 같이 파일이 생성됩니다.

```text
/MyAutoBlog
├── config/             # 설정 (auth.json, settings.js, system_prompt.md)
├── src/                # 소스 코드 (main.js, core.js, utils.js)
├── workspace/          # 결과물 저장소
│   └── 20260126_.../   # 자동 생성된 작업 폴더
│       ├── contents.md # 원고 파일
│       └── 00_image.png # 생성된 이미지
└── job.json            # 작업 지시서
```

---

## ❓ 자주 묻는 질문 (FAQ)

**Q. 기존에 만든 폴더를 다시 `-d`로 실행하면 어떻게 되나요?**
* A. **안전합니다.**
    * `contents.md`가 있으면 글 작성 단계를 건너뜁니다.
    * 이미지가 있으면 건너뛰고, 없는 이미지만 새로 만듭니다.
    * 즉, **중단된 작업을 이어하거나(Resume), 이미지만 추가할 때** 유용합니다.

**Q. `Error: API 응답 없음` 또는 503 에러가 떠요.**
* A. Google Gemini 서버가 일시적으로 바빠서 그렇습니다. `config/settings.js`에서 모델을 `gemini-1.5-flash`로 변경하거나, 잠시 후 다시 시도해보세요.

**Q. 브라우저 창이 안 떠요.**
* A. `config/settings.js`에서 `HEADLESS: true`로 설정되어 있어서 그렇습니다. 과정을 보고 싶다면 `false`로 변경하세요.

---

Made with ❤️ by Auto Blog Bot
