# 임시 Site 생성 template

`minimal-homepage`는 Project/Site 로컬 생성 흐름을 검증하기 위해 새로 만든 임시 Astro starter다. 기존 Amade template이나 contract spike를 가져오지 않았다.

이 폴더는 제품의 template catalog 표준이 아니다. 별도 template repository와 catalog를 설계하면 `createSiteTemplateCatalog`의 공급 위치/로딩 경계를 그 source를 참조하도록 확장한다. Site manifest에는 template ID와 version을 기록해 생성 당시 선택을 보존한다.
