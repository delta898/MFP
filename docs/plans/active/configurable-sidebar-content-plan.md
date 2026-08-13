# Configurable Sidebar Content PoC Plan

## Status

- Phase: implementation (sidebar resource, support, audience, and managed media verified)
- Branch: `codex/feature/configurable-sidebar-content`
- First surface: sidebar only
- Expansion to Dashboard and Account is explicitly deferred until the sidebar PoC is operated and reviewed.

## Purpose

BlogGenius의 고정 제품 메뉴를 원격 설정으로 바꾸지 않으면서, 개발자 후원·전자책·블로그 글·제휴 자료처럼 앱 배포와 독립적으로 교체할 필요가 있는 리소스를 사이드바에 안전하게 노출한다.

이 PoC의 목표는 범용 CMS나 광고 플랫폼을 만드는 것이 아니다. 다음 질문을 작은 범위에서 검증한다.

- 고정 UI와 동적 콘텐츠를 하나의 사이드바 영역에서 예측 가능하게 조합할 수 있는가?
- 플랜별 노출 정책을 앱 배포 없이 서버에서 변경할 수 있는가?
- 원격 콘텐츠가 앱의 핵심 탐색과 로딩 안정성을 해치지 않는가?
- 실제 운영에서 복수 콘텐츠, 순서, 기간, 비활성화 기능이 필요한가?

## Scope Boundary

### In Scope

- `sidebar.utility` region 한 곳
- 동적 block `0..3`개
- `support`, `resource`, `affiliate` 세 content kind
- `nav_item` presentation 한 종류
- 선택적 managed content thumbnail
- 서버에서 audience, 기간, 활성 상태, 순서를 평가
- 앱에서 schema와 URL을 검증한 뒤 안전한 UI로 렌더링
- 클릭 시 외부 브라우저로 HTTPS URL 열기
- Supabase SQL Editor를 이용한 초기 운영
- 로컬 UI API를 통한 UI/원격 서버 경계 분리

### Out of Scope

- Dashboard 및 Account surface
- 운영자용 콘텐츠 관리 UI
- 원격 HTML, CSS, JavaScript
- 원격 SVG 또는 임의 아이콘 URL
- BlogGenius가 관리하지 않는 외부 image host
- 이미지형 사이드바 배너
- 자동 carousel, animation, popup
- 사용자별 행동 기반 개인화
- impression/click 분석 수집
- 결제 성공 확인, 후원 내역 저장, 플랜 또는 크레딧 변경
- 외부 광고 네트워크 SDK

## Core Design Decision

사이드바 전체를 configurable하게 만들지 않는다. 앱의 제품 탐색 메뉴는 Core Block으로 유지하고, 명시적으로 허용한 region에만 Dynamic Block을 삽입한다.

```text
Surface: sidebar
  Region: navigation     Core only
  Region: utility        Core + Dynamic
```

PoC의 `sidebar.utility` 구성 예:

```text
sort 400  개발자 응원       Dynamic
sort 500  Help              Core
sort 600  전자책 보기       Dynamic
sort 700  제휴마케팅 가이드 Dynamic
```

`before_help`, `after_help` 같은 관계형 anchor는 사용하지 않는다. Core Block과 Dynamic Block이 동일 region 안에서 `sort_order`로 정렬된다.

Core Block은 원격 설정으로 숨기거나 변경할 수 없다. 순서가 같으면 Core Block이 먼저 오고, 같은 source끼리는 stable key 순서로 정렬한다.

## Responsibility Boundary

### Server-Owned Operating Policy

- 캠페인 활성/비활성
- 시작일과 종료일
- 대상 플랜
- surface와 region 배정
- 노출 순서
- 최소/최대 지원 앱 버전
- 콘텐츠 제목, 허용 아이콘 key, URL, CTA 및 고지 문구

### App-Owned Safety Policy

- 지원하는 surface, region, presentation
- 지원하는 content kind
- 앱 region별 최대 block 안전 상한
- 제목과 문자열 길이 제한
- 허용 아이콘 registry
- HTTPS URL 검증
- 원격 HTML/script/style 실행 금지
- affiliate 표시 강제
- Core Block 보호
- 잘못된 응답 전체 또는 block의 fail-closed 처리

플랜별 노출 매트릭스는 앱에 하드코딩하지 않는다. 서버가 현재 라이선스의 plan을 확인하고 최종 block 목록만 반환한다.

## Audience Policy

캠페인은 다음 세 mode 중 하나를 사용한다.

- `all`: 현재 및 향후 모든 plan
- `include`: `plan_codes`에 명시된 plan만
- `exclude`: `plan_codes`에 명시된 plan을 제외한 모든 plan

초기 운영 원칙:

- 기본값은 `include`
- 모든 미래 plan에도 의도적으로 보여야 할 콘텐츠만 `all`
- 명확한 예외 목적이 있을 때만 `exclude`
- mode 또는 plan 설정이 잘못되면 default deny

예:

```json
{
  "audience_mode": "include",
  "plan_codes": ["test", "free"]
}
```

```json
{
  "audience_mode": "all",
  "plan_codes": []
}
```

## Proposed Supabase Model

PoC는 asset, 콘텐츠, 캠페인, 배치를 분리한다. 운영 결과가 단순하더라도 각 책임은 의미가 다르며, 콘텐츠 문구를 유지한 채 표지만 교체하거나 하나의 콘텐츠를 여러 캠페인과 향후 surface에서 재사용할 수 있다.

### `app_surface_assets`

전자책 표지나 콘텐츠 thumbnail처럼 콘텐츠에 종속된 원격 media를 표현한다. UI chrome icon과 구분한다.

- `asset_key text primary key`
- `kind text`: PoC는 `image`만 허용
- `transport text`: PoC는 `supabase_storage`만 허용
- `bucket_name text`
- `object_path text`
- `mime_type text`: `image/webp | image/png | image/jpeg`
- `width integer`, `height integer`, `byte_size integer`
- `alt_text text`
- `revision integer`
- `status text`: `draft | active | retired`
- `created_at`, `updated_at`

Storage object는 가능한 한 immutable path를 사용한다.

```text
surface-content/ebooks/affiliate-guide/cover-v1.webp
surface-content/ebooks/affiliate-guide/cover-v2.webp
```

이미지를 변경할 때 기존 URL의 파일을 덮어쓰지 않고 새 object/asset revision을 만든 뒤 콘텐츠의 asset reference를 교체한다. 이렇게 해야 브라우저/CDN cache와 rollback을 예측할 수 있다.

### `app_surface_contents`

리소스 자체를 표현한다.

- `content_key text primary key`
- `kind text`: `support | resource | affiliate`
- `title text`
- `target_url text`
- `icon_key text`
- `cta_label text null`
- `disclosure_text text null`
- `primary_asset_key text null references app_surface_assets`
- `status text`: `draft | active | retired`
- `created_at`, `updated_at`

### `app_surface_campaigns`

리소스를 누구에게 언제 노출할지 표현한다.

- `campaign_key text primary key`
- `content_key text references app_surface_contents`
- `audience_mode text`: `all | include | exclude`
- `plan_codes text[]`
- `starts_at timestamptz null`
- `ends_at timestamptz null`
- `minimum_app_version text`
- `maximum_app_version text null`
- `status text`: `draft | published | paused | retired`
- `policy_revision bigint`
- `created_at`, `updated_at`, `published_at`

Audience constraint:

- `all`은 빈 `plan_codes`만 허용
- `include`, `exclude`는 하나 이상의 plan code 필요
- 빈 값이나 알 수 없는 mode는 노출하지 않음

### `app_surface_campaign_placements`

캠페인을 어느 region에 어떤 순서로 표시할지 표현한다.

- `campaign_key text references app_surface_campaigns`
- `surface_key text`
- `region_key text`
- `presentation text`
- `sort_order integer`
- `is_active boolean`
- primary key `(campaign_key, surface_key, region_key)`

PoC 운영값:

- `surface_key = sidebar`
- `region_key = utility`
- `presentation = nav_item`

향후 값을 DB에 등록할 수는 있지만, 해당 surface/region/presentation을 지원하지 않는 앱은 이를 무시한다. 새 물리적 region을 실제로 표현하려면 앱 지원이 먼저 추가되어야 한다.

## Supabase Read Contract

앱은 anon key로 원본 테이블을 직접 읽지 않는다. 테이블은 RLS를 활성화하고 `anon`, `authenticated`의 table 권한을 제거한다. 공개 실행 가능한 `security definer` RPC가 현재 라이선스와 정책을 평가해 필요한 필드만 반환한다.

Proposed RPC:

```text
get_app_surface_content(
  p_license_key text,
  p_hwid text,
  p_surface text,
  p_app_version text
) returns jsonb
```

Server evaluation order:

1. license key와 HWID로 현재 license context를 확인한다.
2. 기존 무차감 `check_license_status` RPC 결과에서 plan code를 결정한다.
3. `published` campaign만 선택한다.
4. `starts_at`, `ends_at`을 평가한다.
5. app version 범위를 평가한다.
6. `all/include/exclude` audience를 평가한다.
7. 요청 surface의 active placement만 선택한다.
8. `sort_order`, campaign key 순으로 정렬한다.
9. server limit을 적용한다.
10. 원본 audience와 license credential을 제외한 resolved response를 반환한다.

콘텐츠는 entitlement가 아니므로 quota가 소진된 유효 Tester/Free license에도 표시할 수 있다. 다만 존재하지 않는 license key에는 빈 결과를 반환한다.

## Remote Response Contract

```json
{
  "schema_version": 1,
  "policy_revision": 12,
  "resolved_for": {
    "plan_code": "free"
  },
  "surface": "sidebar",
  "regions": {
    "utility": {
      "blocks": [
        {
          "id": "affiliate-guide",
          "kind": "resource",
          "presentation": "nav_item",
          "title": "제휴마케팅 전자책",
          "icon": "book",
          "media": {
            "kind": "image",
            "transport": "supabase_storage",
            "bucket": "app-public-content",
            "object_path": "surface-content/ebooks/guide/cover-v2.webp",
            "mime_type": "image/webp",
            "alt": "블로그 제휴마케팅 시작 가이드 전자책 표지",
            "width": 600,
            "height": 900,
            "revision": 2
          },
          "target_url": "https://example.com/ebook",
          "cta_label": "전자책 보기",
          "disclosure": "",
          "sort_order": 400,
          "starts_at": null,
          "ends_at": null
        }
      ]
    }
  },
  "generated_at": "2026-08-13T00:00:00Z"
}
```

앱에는 audience 규칙 자체를 내려보내지 않는다. 서버가 이미 판정한 결과만 반환한다.

## Local App Boundary

원격 Supabase 응답을 UI에서 직접 소비하지 않는다.

```text
UI
  -> GET /api/v1/surface-content/sidebar
    -> Surface Content Service
      -> Supabase Provider
        -> get_app_surface_content RPC
```

Proposed modules:

- `src/surface-content/supabase-provider.js`
  - RPC transport, timeout, credential 전달
- `src/surface-content/schema.js`
  - remote payload normalization과 validation
- `src/surface-content/service.js`
  - supported surface/region registry, 안전 상한, 응답 구성
- `src/ui-api/controllers/surface-content.controller.js`
- `src/ui-api/routes/surface-content.routes.js`

Implemented foundation:

- `sql/supabase_surface_content.sql`
- `src/surface-content/supabase-provider.js`
- `src/surface-content/schema.js`
- `src/surface-content/service.js`
- `GET /api/v1/surface-content/sidebar`
- `sidebar.utility` Core/Dynamic composer

라이선스 저장 테이블은 배포 환경에 따라 진화할 수 있으므로 Surface RPC가 이를 직접 읽지 않는다.
기존 `check_license_status` RPC를 호환 경계로 사용하고, quota 소진 여부와 콘텐츠 노출은 분리한다.

라이선스 모듈은 UI에 credential을 반환하지 않고, 신뢰된 provider가 호출하는
`resolveAuthenticatedServerContext()` capability만 제공한다. Surface provider는 이 좁은 경계에서
license key와 HWID를 받아 RPC 요청에만 사용하며 local API response에는 포함하지 않는다.

Raw license key와 HWID는 UI에 반환하지 않는다. 현재 license 모듈이 runtime credential을 소유하므로, PoC 구현에서는 credential을 UI 또는 일반 domain object에 노출하지 않는 좁은 provider 호출 경계를 사용한다. 공용 Supabase client 추출은 동일 요구가 반복될 때 별도 refactor로 판단한다.

Local endpoint:

```text
GET /api/v1/surface-content/sidebar
```

Normalized UI response에는 지원하는 region과 유효 block만 포함한다.

## Client Validation Rules

PoC app limits:

- supported surface: `sidebar`
- supported region: `utility`
- supported presentation: `nav_item`
- maximum dynamic blocks: `3`
- supported kinds: `support`, `resource`, `affiliate`
- supported icons: `heart`, `coffee`, `book`, `link`, `sparkles`
- title: trim 후 1~24자
- CTA/disclosure: 정해진 길이 이하
- URL: parse 가능한 absolute `https:` URL
- `javascript:`, `data:`, `file:`, localhost URL 거부
- media URL: 설정된 BlogGenius Supabase Storage origin과 허용 bucket만
- media MIME: `image/webp`, `image/png`, `image/jpeg`
- media metadata가 제한을 벗어나면 이미지 없이 block을 유지

`affiliate` block은 서버가 disclosure를 누락해도 앱이 최소 `제휴` label을 강제로 표시한다.

## Asset and Icon Policy

아이콘과 콘텐츠 이미지를 분리한다.

### UI Chrome Icon

사이드바 아이콘은 원격 URL로 받지 않는다. 아이콘은 navigation 의미와 크기·정렬을 결정하는 UI chrome이므로 앱에 내장된 registry가 소유한다. 서버는 registry key만 반환한다.

```json
{
  "icon": "heart"
}
```

앱은 key를 내장 SVG factory에 매핑한다.

```text
heart    -> bundled heart SVG
coffee   -> bundled coffee SVG
book     -> bundled book SVG
link     -> bundled external-link SVG
sparkles -> bundled sparkles SVG
```

규칙:

- raw SVG, SVG markup, data URL, icon image URL은 거부
- 알 수 없는 icon key는 block을 제거하지 않고 bundled `link` icon으로 fallback
- provider 로고보다 일반 의미 아이콘을 우선 사용
- 새 icon 의미가 꼭 필요하면 앱 release에서 registry를 확장

### Content Media

전자책 표지처럼 콘텐츠에 종속된 이미지는 서버에서 동적으로 관리한다. 콘텐츠 문구와 캠페인을 유지한 채 `primary_asset_key`만 변경할 수 있다.

PoC 규칙:

- BlogGenius가 관리하는 Supabase Storage bucket만 사용
- 외부 임의 image URL은 허용하지 않음
- public promotional asset만 저장하며 사용자 비공개 자료는 저장하지 않음
- upload/write는 운영자만 가능하고 앱은 read-only
- WebP 우선, PNG/JPEG 허용
- sidebar용으로 최적화한 작은 thumbnail object를 별도 업로드
- immutable object path와 revision 사용
- load 실패 시 bundled icon으로 fallback하고 block 자체는 유지
- expanded sidebar의 resource/affiliate block에서만 thumbnail 표시 가능
- collapsed sidebar, support block, thumbnail 없는 block은 bundled icon 사용

향후 Dashboard/Account에서는 같은 asset을 더 큰 card presentation에 재사용하거나 surface별 derivative asset을 연결할 수 있다.

## Sidebar Composition

현재 Help link를 포함하는 하단 utility 영역을 명시적인 DOM region으로 감싼다.

```html
<div id="sidebar-utility-region" data-surface-region="sidebar.utility">
  <a data-core-block="help" data-sort-order="500">Help</a>
</div>
```

UI composer는 다음 순서로 동작한다.

1. 기존 Core Block을 수집한다.
2. API가 반환한 Dynamic Block을 안전한 DOM API로 생성한다.
3. 두 목록을 `sort_order`로 합친다.
4. 동순위에서는 Core Block을 먼저 둔다.
5. 사이드바 접힘 상태에서는 icon과 tooltip만 표시한다.
6. 모바일 사이드바에서 클릭 후 메뉴를 닫는다.
7. 허용된 thumbnail이 있으면 expanded sidebar에서만 작게 표시하고, 실패하면 bundled icon으로 복구한다.

원격 문자열을 `innerHTML`로 삽입하지 않는다.

## Loading, Cache, and Failure Policy

Dynamic content는 비핵심 기능이다.

- 사이드바 Core 메뉴를 먼저 즉시 렌더링
- 페이지 초기화 후 비동기로 동적 콘텐츠 조회
- RPC timeout 적용
- PoC에서는 disk cache를 사용하지 않음
- 동일 앱 세션에서만 짧은 memory cache 허용
- 조회 실패, invalid schema, unsupported version이면 Dynamic Block 전체 숨김
- 실패 문구나 retry UI를 사이드바에 표시하지 않음
- 앱 주요 기능과 account overview 요청에 영향을 주지 않음

이 정책은 오래된 홍보나 중단된 링크를 offline cache에서 계속 노출하는 위험을 피한다. 실제 운영에서 네트워크 비용이 문제가 될 때 versioned snapshot cache를 별도로 검토한다.

## Security and Trust Rules

- Supabase 원본 테이블은 service role 또는 SQL Editor만 수정
- 앱에는 Supabase service role key를 넣지 않음
- RPC는 필요한 공개 필드만 반환
- 원격 HTML/JS/CSS 실행 금지
- raw SVG, 임의 외부 image URL, inline style 금지
- managed media는 allowlisted Supabase Storage origin/bucket만 허용
- 앱 내장 icon registry만 사용
- 외부 링크에는 `noopener`, `noreferrer` 적용
- Electron embedded UI가 사용될 경우 OS external browser API를 사용
- Core navigation을 원격 응답으로 대체하거나 제거하지 않음
- schema version이 앱 지원 범위를 벗어나면 fail closed

## Operations Without an Admin UI

PoC 운영은 Supabase SQL Editor에서 수행한다.

필요한 운영 작업:

- content draft 생성
- thumbnail asset upload 및 asset metadata 생성
- campaign draft 생성
- placement 연결
- audience와 기간 검토
- campaign publish
- pause/retire
- `policy_revision` 증가

개별 row를 즉석에서 직접 수정하는 것보다, 검토 가능한 UPSERT와 publish SQL 예제를 함께 제공한다. 운영 경험을 수집한 후에만 admin UI 필요 여부를 결정한다.

## Implementation Phases

### Phase 0 — Design

- 이 plan 문서 승인
- schema, RPC, local API contract 확정
- PoC용 실제 콘텐츠 값과 URL 확정

### Phase 1 — Supabase Foundation

- table, constraint, index, RLS 생성 SQL
- audience resolver와 surface RPC 구현
- support/resource/affiliate fixture 예제 작성
- SQL 수준의 all/include/exclude 검증 query 작성

### Phase 2 — Local Server

- Supabase provider
- payload validator/normalizer
- surface content service
- local UI API controller/route
- timeout과 fail-closed 처리

### Phase 3 — Sidebar UI

- `sidebar.utility` DOM region 도입
- Core/Dynamic Block composer
- 내장 icon registry
- collapsed/mobile 상태 처리
- external link 처리

### Phase 4 — Test and Operation Review

- unit/contract tests
- malformed payload와 failure tests
- 사용자 UI 테스트
- Supabase에서 콘텐츠 순서·audience·pause를 실제 변경해 앱 재배포 없는 반영 확인
- PoC 운영 결과 기록

### Phase 5 — Decision

다음을 검토한 뒤 Dashboard/Account 확장 여부를 결정한다.

- 실제 복수 block 운영 필요성
- sort order 운영 난이도
- 콘텐츠 변경 빈도
- 서버 장애/지연 영향
- 클릭 분석 필요성
- admin UI 필요성

PoC가 안정화되면 현재 구조를 `docs/architecture/`에 승격하고 장기 tradeoff를 `docs/decisions/`에 기록한다. 확장하지 않으면 sidebar 전용으로 명확히 제한한다.

## Test Matrix

### Server Policy

- `all`: test/free/pro 및 신규 plan에도 노출
- `include [test, free]`: test/free에만 노출
- `exclude [pro]`: pro만 제외
- invalid mode 또는 empty include/exclude: 미노출
- draft/paused/retired: 미노출
- 시작 전/종료 후: 미노출
- app version 범위 밖: 미노출
- invalid license: 빈 regions 또는 빈 blocks

### App Contract

- unknown surface/region/presentation 무시
- unknown kind는 무시하고 unknown icon은 bundled `link` icon으로 fallback
- invalid/untrusted media는 제거하고 block은 bundled icon으로 유지
- HTTP, file, data, javascript URL 거부
- 4개 이상 응답 시 앱 hard cap 3개
- affiliate disclosure 강제
- duplicate id 안정적 제거
- timeout/invalid JSON/RPC failure 시 Core 메뉴 정상 유지

### UI

- Dynamic Block이 Help 위와 아래에 sort order대로 표시
- sidebar collapse 시 icon/tooltip 정상 표시
- mobile sidebar 클릭 후 닫힘
- 외부 링크가 앱 주요 화면을 대체하지 않음
- 동적 콘텐츠 0개일 때 기존 사이드바와 동일

## PoC Verification Log

### 2026-08-13 — Sidebar text resource

- Supabase foundation schema와 resolved surface RPC 적용 성공
- `developer-blog` resource를 `sidebar.utility`, sort 400으로 등록
- Pro plan을 audience에 임시 포함했을 때 Help 위에 정상 노출
- bundled `sparkles` icon, 기존 sidebar alignment와 link rendering 확인
- campaign audience를 `include [test, free]`로 복구
- 앱 재시작 후 Pro plan에서 항목이 사라지는 것을 확인
- 앱 재배포 없이 audience 정책 변경이 반영되는 핵심 PoC 통과

검증 중 저장소의 migration SQL과 실제 운영 Supabase schema가 완전히 동일하지 않음을 확인했다.
Surface RPC는 라이선스 내부 테이블을 직접 참조하지 않고, 운영 중인 `check_license_status`
RPC를 호환 경계로 사용하도록 수정했다.

### 2026-08-13 — Managed ebook thumbnail

- 원본 1024×1024 JPEG에서 sidebar용 256×256 WebP 파생본 생성
- 232,755 bytes에서 20,178 bytes로 최적화
- `app-public-content/surface-content/ebooks/oracle-cloud-guide/sidebar-v1.webp`에 업로드
- asset metadata와 `oracle-cloud-guide` resource를 분리 등록
- Latpeed 전자책 URL과 `무료 오라클 가이드` 문구 연결
- Pro 임시 audience에서 Storage thumbnail 로딩 확인
- sort 400 개발자 블로그, sort 450 전자책, sort 500 Help 순서 확인
- 앱 배포 없이 media와 콘텐츠 참조를 운영하는 경로 검증 완료

### 2026-08-13 — All-plan developer support

- `developer-support`를 `support` kind와 `audience_mode = all`로 등록
- 크티 후원 페이지 `https://ctee.kr/place/amadejjs/donation` 연결
- bundled `heart` icon과 `개발자 응원하기` 문구 표시 확인
- sort 600으로 Help 아래 배치 확인
- Pro plan에서 노출 및 외부 페이지 이동 확인
- 현재 및 향후 plan 전체에 적용하는 `all` audience 경로 검증 완료

## Operator/User Tasks

구현 단계에서 사용자에게 필요한 작업은 다음과 같다. 각 단계가 준비되면 실행할 SQL과 확인 방법을 별도로 전달한다.

1. PoC에 사용할 실제 링크 결정
   - 개발자 후원 URL
   - 선택 사항: 전자책 또는 블로그 글 URL
2. 각 콘텐츠의 사용자 노출 문구 승인
   - 제목
   - CTA
   - affiliate 여부와 고지 문구
3. 선택적 thumbnail 이미지 준비
   - 전자책 표지 등 공개 가능한 이미지
   - 원본과 별도로 sidebar용 최적화본 준비
4. 제공된 Supabase SQL을 SQL Editor에서 실행
5. 안내된 Supabase Storage bucket에 thumbnail 업로드
6. 제공된 seed/publish SQL에서 실제 URL, 문구, asset key 입력
7. Tester/Free/Pro test license별 노출 확인
8. UI에서 접힘/모바일/외부 브라우저 동작 확인

사용자는 Supabase service role key를 앱이나 채팅에 전달할 필요가 없다.

## Initial Acceptance Criteria

- 앱 배포 없이 Supabase 설정 변경으로 sidebar block의 제목, URL, 활성 상태, 순서, audience를 변경할 수 있다.
- Core 메뉴와 Help는 원격 설정 장애나 잘못된 데이터에도 유지된다.
- 플랜 정책은 서버에서만 판정된다.
- 앱은 지원하지 않는 데이터와 위험한 URL을 표시하지 않는다.
- Tester/Free/Pro 정책 변경을 SQL만으로 검증할 수 있다.
- 사용자가 제공해야 할 값과 실행해야 할 SQL이 단계별로 명확히 안내된다.
