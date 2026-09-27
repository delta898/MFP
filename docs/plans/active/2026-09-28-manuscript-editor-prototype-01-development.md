# 원고 편집기 후보 prototype 개발 기록

- Branch: `codex/manuscript-editor-prototype-01`
- Start date: 2026-09-28
- Base/parent branch: `codex/manuscript-workspace-editor`
- Status: 후보 비교 완료; Tiptap 우선 후보 합의

## 사용자 필요와 목표

사용자는 공통 원고 작업공간의 블록 편집기 후보를 실제 UX로 비교하고자 한다. 후보는 Tiptap 기반 최소 편집 UI를 먼저 구성하고, Milkdown Crepe를 같은 원고와 기능 범위로 비교한다.

## 범위

- 두 편집기를 동일한 고정 샘플 원고와 동일한 허용 서식으로 직접 조작 가능한 prototype으로 비교한다.
- Tiptap은 vanilla JavaScript에서 BlogGenius 스타일의 최소 도구 UI를 적용한다.
- Crepe는 실제 사용할 기능만 활성화할 수 있는지, 기본 제공 UI를 BlogGenius에 맞출 수 있는지 확인한다.
- 제목/문단/소제목/굵게·기울임/목록/인용/링크/이미지 블록 및 Markdown round-trip, 한글 IME, 키보드/선택 동작, 화면 스타일, 배포 번들 영향을 평가한다.
- Naver 발행에서 지원하지 않는 기능을 사용자에게 제공해 발행 시 사라지는 혼란을 방지하도록 허용 서식과 publish capability의 연결 방식을 점검한다. 미지원 내용을 조용히 제거하는 흐름은 허용하지 않는다.
- prototype은 개발/비교용이며 BlogGenius 사용자 경로에 편집 기능을 활성화하거나 Naver/WordPress 발행 로직을 바꾸지 않는다.

## 비범위

- production 통합 및 AI/folder/paste 사용자 경로 연결
- AI/폴더/붙여넣기 세 입력 경로 통합
- 최종 이미지 prompt/asset 저장 계약 확정
- Naver의 전체 Markdown/서식 호환 규칙 및 후처리 정책 결정
- 미완성 원고 재개 기능

## 설계와 접근

- 동일한 sample document와 동일한 기능 허용 목록을 양 후보에 적용한다. 비교 시 UI의 편리함과 문서 모델의 표현력을 별도 항목으로 본다.
- Tiptap은 vanilla JS가 직접 연결 가능한 핵심만 사용하고, toolbar/menu는 최소 기능으로 구현한다. UI 패키지를 위해 React를 도입하지 않는다.
- Crepe는 기능 toggle로 불필요한 표/수식/코드 등의 편집 affordance를 제거할 수 있는지 본다. 기본 UI가 사용자가 실제 발행할 수 있는 표현과 일치하는지 확인한다.
- editor document는 preview/publish 변환과 분리한다. 편집기 내부 UI 또는 미지원 기능이 publish payload로 흘러들지 않도록 adapter 경계를 확인한다.
- prototype dependency는 가능한 한 development-only로 두어 packaged app/runtime의 의존성 footprint를 증가시키지 않는다. 불가피하면 사용자와 별도 합의한다.

## 사용자 결정

- 후보 확인 순서는 Tiptap first, Crepe second다.
- prototype 비교 후 사용자는 Tiptap의 간결한 custom toolbar와 Crepe 화면의 본문/toolbar rendering 문제를 근거로 Tiptap을 우선 후보로 삼기로 했다. 이 선택은 production 통합 승인과는 구분한다.
- 이후 `블록 편집`과 `Markdown 편집` mode는 별도 UI mode로 제공하되 같은 canonical document를 공유한다. Markdown mode는 사용자의 “Markdown editor” 고려 요청을 반영하며, Markdown extension/custom image block의 왕복 변환과 입력 보존을 추가 검증한다.
- Toast UI Editor의 Markdown/WYSIWYG dual mode UX는 참고한다. 공식 저장소 archived에 따른 유지보수 위험 때문에 library dependency로는 채택하지 않는다. Tiptap 공식 toolbar/head UI도 조사했지만 React 기반이므로 vanilla JS custom toolbar의 참고 자료로 활용한다.
- 이미지 prompt 형식은 필요하면 재설계할 수 있고 하위 호환은 요구하지 않는다.
- 수동 이미지 첨부와 prompt 기반 자동 생성이 공통 이미지 block 모델에서 함께 가능해야 한다.
- 발행 플랫폼 선택 전에는 플랫폼 독립 원고를 편집한다. Naver의 표현 제약을 고려하되 구체 후처리 규칙은 지금 결정하지 않는다.
- 발행할 수 없는 편집 표현을 노출해 나중에 필터링하는 경험은 피해야 한다. 허용 문법과 사용자 피드백 경계를 prototype에서 확인한다.

## 구현 단계와 완료 기준

1. prototype을 앱 사용자 경로와 분리해 실행하는 방법 및 dependency 경계를 확인한다.
2. Tiptap 최소 UI prototype을 동일 sample로 구현하고 후보 비교 항목을 검증한다.
3. Crepe prototype을 같은 shell/sample/기능 허용 범위로 붙인다.
4. 독립 비교 기록에 스타일 적용성, 기능 노출 통제, Markdown round-trip, 이미지 블록, 한글 IME, 접근성/키보드, 설치·패키징 footprint를 기록하고 다음 채택 결정을 사용자에게 제안한다.

완료 시 사용자는 같은 원고를 두 편집기로 직접 사용하고 비교할 수 있다. prototype이 production publish endpoint를 호출하거나 원격 데이터를 변경하지 않음을 확인한다.

## 진행 기록 및 검증

- 시작 시 parent branch는 `codex/manuscript-workspace-editor`; 해당 branch의 untracked 설계 기록은 사용자 요청으로 보존한다.
- 앱 UI는 vanilla JS의 include-manifest 방식이며, 사용자 작성 흐름은 `view-blog-next` 아래에 있다. 프로토타입의 모듈/번들 구성이 기존 app runtime에 바로 들어갈 수 있는지 신중하게 분리 검토한다.
- 앱 UI와 분리한 Vite prototype을 추가했다. `npm run editor:prototype`으로 `http://127.0.0.1:5173/`에서 실행하며 개발 의존성으로만 관리한다. 앱 버전은 변경하지 않았다.
- 사용한 후보 버전: Tiptap `3.31.3`, Milkdown Crepe/kit `7.22.2`, Vite `8.3.1`. 보안 감사는 `0 vulnerabilities`; 앱 런타임 의존성을 추가하지 않도록 모두 `devDependencies`에 두었다.
- 동일한 한국어 샘플 원고로 바닐라 JS Tiptap 최소 툴바와 Crepe 자체 툴바/블록 메뉴를 한 화면에서 비교한다. 양 편집기 모두 초기 Markdown 결과를 그대로 직렬화하는 것을 브라우저에서 확인했고, 두 편집기에서 문장 선택 후 굵게 서식 적용도 확인했다.
- Crepe 기본 UI는 heading 1–6, 취소선, 인라인 코드, 코드/표/수식/작업 목록 등 현재 비교 범위를 넘는 선택지를 노출한다. 옵션을 조합해 툴바는 굵게/기울임만, 블록 메뉴는 소제목/인용/일반·번호 목록만 보이도록 제한할 수 있었다. 공식 API도 기능 토글과 이 메뉴 구성을 지원한다.
- Tiptap에는 공식 MIT UI Components가 있다. 다만 React 기반 컴포넌트이며 CLI가 컴포넌트 소스 파일을 프로젝트에 복사하는 방식이다. 현재 앱은 바닐라 JS이므로 그대로 삽입하는 대안이라기보다 디자인/동작 참고 자료다. React를 UI만을 위해 도입하는 것은 prototype 범위에서 제외했다.
- `vite build` 성공. 통합 비교 build는 전체 assets 약 2.9 MB(약 1.0 MB gzip), 초기 main JS 약 1.35 MB(약 419 KB gzip)다. 두 편집기를 함께 포함한 prototype 수치라 각 편집기 단독 사용 크기로 해석하면 안 된다. Crepe feature 토글을 껐더라도 일부 lazy chunks가 산출되므로 실제 채택 시 최종 앱 기준 bundle 분석이 필요하다.
- 브라우저 시각 확인에서 Crepe의 글머리 목록 bullet이 중복된 것처럼 보였다. 목록 편집 계약은 작동하지만 현재 theme/CSS 조합의 시각 품질은 추가 확인이 필요하다. 샘플 리셋 이후 원문 Markdown으로 돌아오는 것도 확인했다.
- 최신 공식 릴리스 조사 시 Tiptap 3.31.3(2026-09-04), Milkdown 7.22.2(2026-09-23)가 각 저장소의 최근 릴리스로 보인다. 두 프로젝트 모두 현재 관리 중인 것으로 판단한다. [Tiptap releases](https://github.com/ueberdosis/tiptap/releases), [Milkdown releases](https://github.com/Milkdown/milkdown/releases).
- 외부 사용자에게 보여주는 툴바 범위와 Naver publish 지원 여부는 별도 계약으로 관리해야 한다. 이 prototype은 publish 변환/검증을 하지 않으며 실제 저장·발행 endpoint도 호출하지 않는다.

## 결과 및 후속 작업

- 검증 결과, 테스트, 수동 확인 및 선택 권고를 진행 중 갱신한다.
- 후보 비교는 완료했고 우선 후보는 Tiptap이다. 후속 work는 같은 브랜치의 parent 설계 기록에서 정한 검증 단계에 따른다. 이 branch는 아직 commit/merge되지 않았으며 production 경로에는 연결하지 않았다.
