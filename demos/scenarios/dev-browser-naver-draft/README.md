# Dev Browser Naver Draft Demo

실제 BlogGenius Development UI를 Playwright 브라우저로 조작하고, 원고 붙여넣기·편집·로컬 이미지 첨부·AI 이미지 생성·네이버 임시저장을 녹화하는 시나리오입니다. 공개 발행은 하지 않습니다.

## 실행

```sh
node demos/scenarios/dev-browser-naver-draft/run-demo.js
```

Chrome이 headed 모드로 열립니다. Development 연결과 저장된 네이버 인증 세션이 필요합니다. AI 이미지 API가 실제 호출되며 비용이 발생할 수 있고, 결과는 네이버 블로그에 임시저장됩니다. CAPTCHA나 로그인 화면이 나타나면 자동으로 우회하지 않고 작업을 중단하세요.

완성 영상은 `dev-browser-naver-draft.mp4`에 저장합니다. 임시 녹화 조각은 OS 임시 폴더에서 합친 뒤 제거합니다.
