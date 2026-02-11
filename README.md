# 🤖 네이버 블로그 자동 포스팅 봇 (Naver Blog Auto Bot)

![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green) ![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-blue) ![License](https://img.shields.io/badge/License-Commercial-blue)

> **"주제만 엑셀에 적어두세요. 글 작성부터 이미지 생성, 업로드까지 알아서 다 합니다."**

Google Gemini AI와 최신 자동화 기술을 결합하여 블로그 포스팅의 전 과정을 자동화한 솔루션입니다.
단순 반복 작업은 로봇에게 맡기고, 당신은 기획과 분석에 집중하세요.

### 📞 라이선스 키 발급 및 문의
👉 **[공식 홈페이지 / 구매 문의](https://linktr.ee/amadejjs)**

---

## ✨ 주요 기능


* **✍️ SEO 최적화 글쓰기**: 서론-본문-결론 구조를 갖춘 검색 최적화(SEO) 원고를 자동으로 작성합니다.
* **🎨 AI 이미지 자동 생성**: 글 내용을 분석해 **Google Gemini(Imagen)**가 고퀄리티 이미지를 생성하여 본문에 삽입합니다.
* **🎭 페르소나 커스텀**: `system_prompt.md`를 수정하여 봇의 말투, 성격, 글쓰기 스타일을 내 맘대로 조정할 수 있습니다.
* **🔧 하이브리드 모드**: 내가 쓴 글(`contents.md`)에 AI가 이미지만 채워넣는 협업이 가능합니다.
* **🛡️ 안전한 실행**: 기존 파일은 절대 덮어쓰지 않으며(이어쓰기 지원), 작업 로그가 상세히 기록됩니다.

---

## 🚀 설치 및 시작하기 (Quick Start)

### 1. 사전 준비
* **Node.js**: [공식 홈페이지](https://nodejs.org/)에서 LTS 버전을 설치해주세요.
* **Google Gemini API Key**: [Google AI Studio](https://aistudio.google.com/)에서 무료 키를 발급받으세요. (이미지 생성용)

### 2. 설치 (Installation)
프로젝트 폴더에서 터미널을 열고, **아래 명령어 하나만 실행하면 설치가 끝납니다.**

```bash
node setup.js
```
> _(라이브러리 설치, 설정 파일 생성, 브라우저 드라이버 세팅을 자동으로 수행합니다.)_

### 3. 설정 (Configuration)
`config/config.txt` 파일을 열어 발급받은 정보를 입력하세요.

```javascript
module.exports = {
    // [필수] 구매한 라이선스 키 입력
    LICENSE_KEY: '발급받은_라이선스_키_입력', 

    // [필수] 네이버 계정 및 구글 API
    NAVER_ID: '본인의_네이버_아이디',
    GEMINI_API_KEY: '발급받은_Gemini_API_Key',
    
    // [선택] 브라우저 화면 표시 여부 (true: 숨김, false: 보임)
    HEADLESS: true, 
};
```

---

## 🖥️ 사용 방법 (Usage)

터미널에서 `npm run` 명령어로 봇을 제어합니다.

### 1️⃣ 최초 로그인 (Login)
봇이 블로그에 글을 쓸 수 있도록 인증을 수행합니다. (최초 1회 필수)

```bash
npm run login
```
* 브라우저가 뜨면 네이버에 로그인하세요.
* 로그인이 완료되면 창이 자동으로 닫히고 인증 정보가 저장됩니다.

### 2️⃣ 엑셀 대량 발행 (Batch Mode) 🔥 [강력 추천]
`topics.xlsx` 파일에 주제나 URL을 적어두고 실행하면, 봇이 하나씩 처리합니다.

```bash
npm run batch
```
* **팁**: 엑셀의 `Image Gen` 칸을 비워두면 자동으로 이미지를 생성합니다.
* 작업 도중 중단되어도 다시 실행하면 **안 된 것부터 이어서** 작업합니다.

### 3️⃣ 단건 발행 (Auto Mode)
`topic.json` 파일을 수정해서 글 하나만 정교하게 테스트할 때 사용합니다.

```bash
npm run auto
```

### 4️⃣ 하이브리드 모드 (수동 글 + 자동 이미지)
**"글은 내가 쓰고, 이미지는 AI가 만들어줘!"**
이미 원고가 있는 폴더를 지정하면, 봇은 **글을 덮어쓰지 않고** 이미지만 생성해서 채워넣습니다.

```bash
# 특정 폴더 지정 실행
npm run auto -- -d "workspace/내_원고_폴더"
```

---

## 📂 파일 및 폴더 구조

```text
/NaverAutoBlog
├── config/             
│   ├── config.txt     # 아이디, API 키, 라이선스 키 설정
│   └── system_prompt.md # [Tip] 봇의 성격과 말투를 여기서 수정하세요!
├── logs/               # 실행 로그 (날짜별 자동 저장)
├── workspace/          # 결과물 저장소 (글, 이미지)

├── topic.json            # [Auto] 단건 작업 지시서
└── setup.js            # 간편 설치 스크립트
```

---

## ❓ 자주 묻는 질문 (FAQ)

**Q. "라이선스 오류"가 발생해요.**
* A. `config/config.txt`에 `LICENSE_KEY`가 정확히 입력되었는지 확인하세요. 인터넷 연결 상태도 확인이 필요합니다.

**Q. 이미지 생성이 실패해요.**
* A. Google Gemini API 키가 올바른지, 해당 계정에 이미지 생성 권한이 있는지 확인하세요.

**Q. 봇이 돌다가 멈춘 것 같아요.**
* A. AI가 글을 쓰는 동안(약 10~30초)은 대기 상태일 수 있습니다. `logs/` 폴더의 최신 로그 파일을 열어보면 현재 상태를 알 수 있습니다.

---

**[문의하기]**
더 궁금한 점이 있거나 기술 지원이 필요하시면 아래 링크를 이용해주세요.
👉 https://linktr.ee/amadejjs
