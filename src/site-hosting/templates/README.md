# 임시 Site 생성 template

`minimal-homepage`는 Project/Site 로컬 생성 흐름을 검증하기 위해 새로 만든 임시 Astro starter다. 기존 Amade template이나 contract spike를 가져오지 않았다.

## Template descriptor

각 템플릿은 `template.json`으로 설명한다.

- `id`, `version`, `name`, `description`: 템플릿 식별 및 표시 정보
- `source_directory`: 새 Site에 복사할 Astro 프로젝트 디렉터리
- `preview_file` (선택): 템플릿 기본 카드 이미지. 템플릿 루트 기준 상대 경로이며 Site 생성 때 `.bloggenius/template-preview.svg`로 복사한다.

사이트 빌드는 Electron 내장 Chromium으로 `dist/`를 캡처해 `.bloggenius/build-preview.jpg`에 저장한다. 빌드마다 같은 파일을 교체하며, `.bloggenius/site.json`에는 템플릿 기본 이미지와 최신 캡처 정보만 따로 기록한다. 캡처 실패는 Astro 빌드 성공을 실패로 바꾸지 않으며, 마지막 유효 이미지가 계속 표시된다.

이 폴더는 아직 제품의 완성된 template catalog 표준이 아니다. 별도 template repository와 catalog를 설계하면 `createSiteTemplateCatalog`의 공급 위치/로딩 경계를 그 source를 참조하도록 확장한다. Site manifest에는 template ID와 version을 기록해 생성 당시 선택을 보존한다.
