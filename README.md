# 🤖 네이버 블로그 자동 포스팅 솔루션 (Naver Blog Auto Posting Solution)

![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green) ![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-blue) ![License](https://img.shields.io/badge/License-MIT-yellow)

**"주제만 던져주면, 글 작성부터 이미지 생성, 업로드까지 알아서!"**

Google Gemini AI를 활용하여 블로그 포스팅의 전 과정을 자동화한 도구입니다.
엑셀에 주제를 쭉 적어두면, 알아서 글을 쓰고 이미지를 그려서 블로그에 발행까지 마칩니다.

## ✨ 주요 기능

* **🏭 엑셀 대량 발행 (Batch)**: `jobs.xlsx` 엑셀 파일에 주제 100개를 적어두면, 봇이 순차적으로 모두 발행합니다.
* **✍️ 자동 글쓰기 (SEO)**: 서론-본문-결론 구조를 갖춘 검색 최적화(SEO) 원고를 자동으로 작성합니다.
* **🎨 AI 이미지 생성**: 글 내용을 분석해 **Google Gemini(Imagen)**가 이미지를 생성하여 본문에 삽입합니다.
* **🔧 하이브리드 모드**: 내가 쓴 글(`contents.md`)에 AI가 이미지만 채워넣는 협업이 가능합니다.
* **🛡️ 안전한 실행**: 기존 파일은 절대 덮어쓰지 않습니다. (이어쓰기 지원)
* **📝 상세 로그**: 실행 과정과 에러 내역이 `logs/` 폴더에 날짜별로 기록됩니다.

---

## 🚀 설치 및 시작하기 (Quick Start)

### 1. 사전 준비
* **Node.js**: [공식 홈페이지](https://nodejs.org/)에서 LTS 버전을 설치해주세요.
* **Google Gemini API Key**: [Google AI Studio](https://aistudio.google.com/)에서 무료 키를 발급받으세요.

### 2. 설치 (Installation)
프로젝트 폴더에서 터미널을 열고, **아래 명령어 하나만 실행하면 설치가 끝납니다.**

```bash
node src/setup.js
```
> _(라이브러리 설치 및 설정 파일 복사를 자동으로 수행합니다.)_

### 3. 설정 (Configuration)
`config/settings.js` 파일을 열어 다음을 입력하세요.

```javascript
module.exports = {
    NAVER_ID: '본인의_네이버_아이디',
    GEMINI_API_KEY: '발급받은_Gemini_API_Key',
    
    // [중요] 이미지 생성이 가능한 모델 Endpoint 확인
    // 보통 'imagen-3.0-generate-001' 또는 'gemini-pro-vision' 등을 사용합니다.
    GEMINI_IMAGE_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:generateContent',
};
```

---

## 🖥️ 사용 방법 (Usage)

터미널에서 `npm run` 명령어로 봇을 제어합니다.

### 1️⃣ 최초 로그인 (Login)
봇이 블로그에 글을 쓸 수 있도록 인증을 수행합니다. (쿠키 만료 시 재실행)

```bash
npm run login
```
* 브라우저가 뜨면 네이버에 로그인하세요.
* 로그인이 완료되면 창이 자동으로 닫히고 `auth.json`이 생성됩니다.

### 2️⃣ 엑셀 대량 발행 (Batch Mode) 🔥 [추천]
`jobs.xlsx` 파일에 주제나 URL을 적어두고 실행하면, 봇이 하나씩 처리합니다.

```bash
npm run batch
```
* **장점**: 예약 발행, 작업 상태 관리(Done/Error), URL 기반 작성 등 모든 기능 지원.
* **팁**: 컴퓨터 스케줄러에 등록하면 완전 자동화가 가능합니다.

### 3️⃣ 단건 발행 (Auto Mode)
`job.json` 파일을 수정해서 글 하나만 정교하게 발행하고 싶을 때 사용합니다.

```bash
npm run auto
```

### 4️⃣ 하이브리드 모드 (수동 글 + 자동 이미지)
**"글은 내가 쓰고, 이미지는 AI가 만들어줘!"**
이미 원고가 있는 폴더를 지정하면, 봇은 **글을 덮어쓰지 않고** 이미지만 생성해서 채워넣습니다.

```bash
# 특정 폴더 지정 실행
npm run auto -- -d "workspace/내폴더"
```

---

## 📂 파일 구조 및 역할

### 1. `jobs.xlsx` (배치 작업용)
가장 많이 쓰게 될 파일입니다. 엑셀을 열어 아래 컬럼을 채우세요.
* **Subject (A열)**: 글 주제 (예: 강남역 맛집 추천)
* **Keywords (B열)**: 필수 포함 키워드 (쉼표로 구분)
* **Ref URL (G열)**: 참고할 뉴스나 블로그 링크 (없으면 빈칸)
* **Image Gen (E열)**: 이미지 생성 여부 (비워두면 자동 생성)

### 2. `job.json` (정밀 작업용)
프롬프트를 디테일하게 제어하고 싶을 때 사용합니다.

```json
{
  "subject": "맥북 프로 M5 리뷰",
  "keywords": ["애플", "노트북"],
  "content_guide": {
    "tone_and_manner": "전문적인 IT 리뷰어 톤으로",
    "additional_instructions": "발열 문제를 중점적으로 다뤄줘."
  },
  "image_options": {
    "generate": true,
    "style": "cinematic tech product photography"
  }
}
```

---

## 📂 프로젝트 구조

```text
/NaverAutoBlog
├── config/             # 설정 파일 (settings.js, auth.json)
├── logs/               # 실행 로그 (날짜별 자동 저장)
├── src/                # 소스 코드 (main.js, batch.js, core.js)
├── workspace/          # 결과물 저장소 (글, 이미지)
├── jobs.xlsx           # [Batch] 엑셀 작업 리스트
├── job.json            # [Auto] 단건 작업 지시서
└── setup.js            # 간편 설치 스크립트
```

---

## ❓ 자주 묻는 질문 (FAQ)

**Q. 봇이 돌다가 멈춘 것 같아요.**
* A. 처음 실행 시 브라우저를 켜는 데 시간이 걸릴 수 있습니다. 또한, AI가 글을 쓰는 동안(약 10~20초)은 대기 상태입니다. `logs/` 폴더의 최신 로그를 확인해보세요.

**Q. 이미지 생성이 안 돼요.**
* A. `config/settings.js`의 `GEMINI_IMAGE_ENDPOINT`가 정확한지 확인하세요. Google 계정에 따라 사용 가능한 모델이 다를 수 있습니다.

**Q. 브라우저 창을 보고 싶어요 / 숨기고 싶어요.**
* A. `config/settings.js`에서 `HEADLESS` 값을 변경하세요.
    * `true`: 화면 없이 백그라운드 실행 (서버용)
    * `false`: 브라우저 화면 표시 (PC용 권장)

---

Made with ❤️ by **Naver Blog Auto Bot**
