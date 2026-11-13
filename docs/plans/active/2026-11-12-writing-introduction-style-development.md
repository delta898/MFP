# 소개·추천형 전개 방식 개발 기록

## 브랜치와 상태

- 브랜치: `feature/writing-introduction-style`
- 시작일: 2026-11-12
- 부모 브랜치: `dev`
- 상태: 구현 및 집중 검증 완료, 사용자 요청으로 feature 브랜치 커밋

## 사용자 요구와 목표

블로그 글쓰기 전개 방식에 `introduction` 하나를 추가한다. 이는 상품, 서비스 또는 장소 하나를 소개하는 본문 흐름으로, 무엇인지, 누구에게 맞는지, 이유가 무엇인지, 선택 전에 무엇을 확인할지를 설명한다.

## 확정된 결정

- 저장 값은 `introduction`, 한국어 라벨은 `소개·추천형`이다.
- 광고 형식이 아닌 본문 전개 방식이다. 라벨에 `광고` 또는 `홍보`를 쓰지 않는다.
- 입력에 없는 가격, 효과, 방문 또는 개인 경험을 지어내지 않는다.
- 슬로건이나 구매를 압박하는 문구를 쓰지 않는다.
- 기본 전개 방식은 계속 `explanatory`(설명형)로 둔다.
- 쇼핑 콘텐츠 초점 옵션은 변경하지 않는다.

## 범위와 비목표

전개 enum, 모든 UI/프롬프트/분석 미러와 해당 계약 테스트를 함께 갱신하는 구현 슬라이스다. 호출 경로에서 쓰는 `development` 값은 같은 닫힌 선택지를 유지해야 한다.

비목표:

- 최초 범위에서는 커밋하지 않는 것으로 기록했으나, 사용자가 이후 현재 feature 브랜치 커밋을 명시적으로 요청했다.
- 쇼핑 플로우와 쇼핑 콘텐츠 초점 옵션을 변경하지 않는다.
- 기존 테스트가 새 fingerprint 값을 강제하지 않는 한 fingerprint enum이나 값을 추가하지 않는다.
- 릴리스, 푸시, 제품 코드 구현은 이 기록 작성 작업에 포함하지 않는다.

## 구현 시 변경해야 할 파일

- `src/services/content-writing/writing-profile.js` — `PROFILE_ENUMS.development`에 `introduction` 추가. 기본값은 유지한다.
- `src/services/content-writing/writing-profile-prompt.js` — `DEVELOPMENT_RULES`에 아래 문장을 추가한다.
- `ui/scripts/features/blog/writing-overrides.js` — Blog Beta의 전개 옵션 라벨 미러 갱신.
- `ui/partials/views/blog-next/content-settings.html` — Blog Beta 전개 선택지 추가.
- `ui/scripts/features/settings/writing-defaults.js` — 설정 화면의 전개 라벨 미러 갱신.
- `ui/partials/views/settings-next.html` — 설정 화면의 전개 선택지 추가.
- `src/applications/settings/writing-profile/reference-analyzer.js` — fingerprint 분석의 전개 라벨 미러 갱신. fingerprint enum 자체는 기존 계약 테스트가 요구하는 경우에만 확장한다.
- `src/services/content-writing/writing-profile.test.js` — 닫힌 enum 허용 및 거부 계약을 확인한다.
- `src/services/content-writing/writing-profile-prompt.test.js` — `introduction` 프롬프트 규칙을 확인한다.
- `src/applications/settings/writing-profile/reference-analyzer.test.js` — analyzer의 허용 라벨/출력을 확인한다. 새 fingerprint 값을 추가할 필요가 없다면 기존 입력 및 계약을 유지한다.

## 프롬프트 문장

기존 `DEVELOPMENT_RULES` 항목 옆에 다음 문장을 추가한다.

> 본문은 상품·서비스·장소 하나가 무엇인지, 누구에게 왜 맞는지, 선택 전에 확인할 점이 무엇인지 설명하고 입력에 없는 가격·효과·방문·개인 경험, 슬로건이나 구매 압박 문구를 만들지 마세요.

## 테스트 검색 결과와 후보

저장 enum의 폐쇄 집합은 `src/services/content-writing/writing-profile.test.js`에서 검증 대상이다. 새 값의 실제 연결을 확인할 테스트는 `src/services/content-writing/writing-profile-prompt.test.js`와 `src/applications/settings/writing-profile/reference-analyzer.test.js`다. 기존 전개 값을 입력하는 투영/호출 테스트는 다음과 같으며, 전체 enum 계약을 직접 단언하는지 확인하고 필요한 경우 함께 갱신한다.

- `src/services/content-writing/writing-profile-projection.test.js`
- `src/applications/blog/writing/blog-writing-overrides.test.js`
- `src/applications/blog/writing/blog-generation-prompt.test.js`
- `src/applications/shopping/generation/writing-profile-prompt.test.js` — 공통 프롬프트 계약만 확인하고 쇼핑 플로우/초점은 바꾸지 않는다.
- `src/adapters/storage/writing-profiles/repository.test.js`
- `src/adapters/storage/google-sheets/publish-options.test.js`
- `src/applications/settings/writing-profile/preview.test.js`
- `src/adapters/ui/settings/service.writing-profile.test.js`

현재 검색에서 기존 네 개발 라벨을 전체 목록으로 직접 검증하는 테스트는 발견되지 않았다. UI와 analyzer는 `PROFILE_ENUMS.development`를 사용하거나 같은 라벨 맵을 보유하므로 구현 때 enum 미러 누락 여부를 확인한다.

## 검증과 잔여 작업

구현 시 수정된 프로필 계약, 프롬프트 생성, analyzer 계약에 대한 집중 테스트를 실행하고 UI 라벨/선택지가 두 화면에 반영됐는지 확인한다. 최종 브라우저 확인은 사용자 UI 수용 절차에 따른다.

집중 테스트 `node --test src/services/content-writing/writing-profile.test.js src/services/content-writing/writing-profile-prompt.test.js src/applications/settings/writing-profile/reference-analyzer.test.js`는 15개 통과, 0개 실패다. 전체 단위 테스트는 실행하지 않았다. 후보 목록의 투영·호출 테스트는 전개 값의 닫힌 집합을 단언하지 않아 수정하지 않았다.

## 추가 단계: 글감별 Auto (AI) 구성

### 사용자 결정

- Blog Beta의 글 구성 제목과 기본값 변경 링크를 제거하고 같은 위치에 `Auto (AI)` 체크박스를 둔다.
- 활성화하면 본문 길이, 도입, 전개, 마무리 선택지를 비활성화한다. 글감별 수동값은 보존해 Auto를 끈 뒤 복구한다.
- 기존 단일 글쓰기 호출 안에서 먼저 네 구성값을 글감·키워드·참고사항에 맞춰 고른 다음, 그 값을 적용해 본문을 작성한다. 별도 AI 호출이나 선택 결과 설명은 추가하지 않는다.
- Auto 모드에서는 저장된 수동값과 프로필 기본값을 해당 네 구성의 결정값으로 사용하지 않는다. 프로필의 문체 지침과 사실성/경험 비조작 규칙은 유지한다.

### 구현 및 경계

- 글감의 `writing_overrides.auto`를 저장/복원하고 boolean으로 검증한다. 수동값을 함께 보존하되 자동 선택 시 프로필 projection에 적용하지 않는다.
- 프롬프트 조합기가 Auto 모드를 전달해 동일 생성 prompt에 자동 선택 규칙을 넣고, 참고 글의 문체 fingerprint가 자동 선택값과 충돌하지 않도록 한다.
- Blog Beta 전용 UI에서 네 선택지를 잠그며 설정 복제본과 빠른 작성 흐름 모두 변경 상태를 동기화한다.
- 범위는 Blog Beta에 한정하며 독립된 두 번째 생성 요청은 만들지 않는다.

### 검증 및 결과

- Auto 관련 집중 검증: `node --test scripts/blog-next-quick-flow-contract.test.js src/applications/blog/writing/blog-generation-prompt.test.js src/applications/blog/writing/blog-prompt.test.js src/applications/blog/writing/blog-writing-overrides.test.js src/services/content-writing/writing-profile.test.js src/services/content-writing/writing-profile-prompt.test.js src/applications/settings/writing-profile/reference-analyzer.test.js` — 62개 통과, 0개 실패.
- `git diff --check` 통과.
- 전체 단위 테스트는 실행하지 않았다. 브라우저/시각적 수용은 사용자 확인이 남아 있다.
- 2026-11-14: 사용자가 현재 feature 브랜치 커밋을 요청했다. Codex Security 로컬 점검은 별도의 `dev` 기반 feature 브랜치에서 수행한다.
