# 로컬 template cache와 호환 fixture

BlogGenius의 기본 template source는 GitHub에 있는 Amade catalog입니다. 외부 resource는 checksum 검증 후 workspace의 `site-hosting/template-cache/`에 캐시되고, Site 생성 시 복사됩니다. 이 폴더의 `minimal-homepage`는 기존 Site 흐름과 저장소 계약 테스트에서 쓰는 fixture이며 새 Site 목록의 기본 source가 아닙니다.

Amade package format과 첫 Astro starter는 Amade 저장소의 `amade/spec/` 및 `amade/templates/site-hosting/`에서 관리합니다. Site metadata에는 선택한 template ID, version, source revision을 기록합니다. Screenshot은 Site 폴더의 `.bloggenius/` 아래에 template 이미지와 마지막 성공 build capture 각각 하나씩 저장합니다.
