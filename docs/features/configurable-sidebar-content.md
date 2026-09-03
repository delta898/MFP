# Configurable Sidebar Content

## Purpose

BlogGenius의 제품 탐색 메뉴는 앱이 소유하고, 홍보·후원처럼 운영 중 바뀔 수 있는 항목만 Supabase에서 관리한다. 이 경계를 통해 앱을 다시 배포하지 않고도 동적 사이드바 항목의 문구, 링크, 순서, 노출 상태와 대상 플랜을 변경할 수 있다.

## Current Scope

- surface: `sidebar`
- region: `utility`
- presentation: `nav_item`
- supported content kinds: `resource`, `support`, `affiliate`
- supported bundled icons: `heart`, `coffee`, `book`, `link`, `sparkles`
- 한 번에 표시하는 동적 항목: 최대 3개
- Core 메뉴와 Help는 원격 설정과 무관하게 앱이 항상 렌더링한다.

Dashboard는 같은 기반 계약의 `dashboard.recommendations / compact_card`를 사용한다. 이 영역은 공식 BlogGenius 사용 가이드 8건을 모든 유효 플랜에 제공하고, 앱에서 30분마다 한 건씩 순환한다. resolved RPC와 클라이언트 schema가 한 region당 최대 10건까지만 전달하므로 서로 다른 목적의 콘텐츠를 한 후보 풀에 무제한으로 섞지 않는다.

새로운 `resource`, `support` 또는 disclosure가 포함된 `affiliate` 항목은 아래 계약 안에서 Supabase 데이터만으로 추가할 수 있다. 새로운 surface, region, presentation, content kind, 아이콘 또는 상호작용을 추가하려면 앱 변경과 배포가 필요하다.

## Placement Model

동적 항목과 Core Help는 공통 `sort_order` 기준으로 정렬된다. 현재 기준값은 다음과 같다.

| 항목 | 소유자 | sort_order | 운영 대상 |
| --- | --- | ---: | --- |
| 개발자 블로그 | Supabase | 400 | Tester, Free |
| 무료 오라클 가이드 | Supabase | 450 | Tester, Free |
| Help | App Core | 500 | 전체 |
| 개발자 응원하기 | Supabase | 600 | 전체 |

동적 항목의 `sort_order`를 변경하면 앱 배포 없이 Help 위·아래 순서를 바꿀 수 있다. 다른 Core 메뉴 구역에 임의로 삽입하는 기능은 제공하지 않는다.

## Audience Policy

- `all`: 현재 및 향후 모든 유효 플랜에 노출한다. `plan_codes`는 빈 배열을 사용한다.
- `include`: `plan_codes`에 지정한 플랜에만 노출한다.
- `exclude`: `plan_codes`에 지정한 플랜만 제외한다.

운영 정책은 다음과 같다.

- 홍보 리소스(`developer-blog`, `oracle-cloud-guide`): `include ['test', 'free']`
- 후원(`developer-support`): `all`

유효하지 않은 라이선스, 잘못된 audience 설정, 기간 또는 앱 버전 범위 밖의 캠페인은 노출하지 않는다.

## Content and Asset Ownership

- 제목, CTA, 링크와 disclosure: `app_surface_contents`
- 대상 플랜, 기간, 상태와 앱 버전 범위: `app_surface_campaigns`
- surface, region, presentation과 순서: `app_surface_campaign_placements`
- 교체 가능한 이미지 메타데이터: `app_surface_assets`
- 실제 이미지 파일: Supabase Storage의 공개 콘텐츠 bucket
- 메뉴 의미와 정렬에 영향을 주는 아이콘: 앱 내 bundled icon registry

전자책 표지처럼 콘텐츠에 종속된 이미지는 Storage object와 asset metadata를 교체한다. 메뉴 아이콘은 서버 URL로 받지 않고 지원되는 `icon_key`만 사용한다.

## Operating Procedures

### Add a supported item

1. 이미지가 있다면 Storage에 최적화된 파생본을 업로드한다.
2. `app_surface_assets`에 이미지 메타데이터를 등록한다.
3. `app_surface_contents`에 `resource`, `support` 또는 `affiliate` 콘텐츠를 등록한다.
4. `app_surface_campaigns`에 audience와 게시 상태를 등록한다.
5. `app_surface_campaign_placements`에 `sidebar.utility`, `nav_item`, `sort_order`를 등록한다.
6. 실제 라이선스로 resolved RPC와 앱 표시를 확인한다.

기존 seed SQL을 복사하기 전에 key, URL, 문구, audience와 sort order를 명시적으로 검토한다. key는 한 번 운영에 사용한 뒤 의미를 바꾸지 않는다.

### Change text, link, image or order

- 문구·링크: `app_surface_contents` 수정
- 이미지: 새 Storage object와 asset revision을 등록한 뒤 `primary_asset_key` 수정
- 순서: `app_surface_campaign_placements.sort_order` 수정
- 변경 후 해당 캠페인의 `policy_revision`을 증가시킨다.

### Hide or restore immediately

- 숨김: campaign `status = 'paused'`
- 복원: campaign `status = 'published'`
- 영구 종료: campaign `status = 'retired'`

긴급 중단은 콘텐츠나 placement를 삭제하지 않는다. 상태 변경과 `policy_revision` 증가를 같은 작업으로 실행한다.

### Change plan targeting

`audience_mode`와 `plan_codes`를 함께 변경하고 `policy_revision`을 증가시킨다. 과거 복구 SQL은 `supabase/archive/recovery/`에 참고용으로만 보관한다.

## Refresh Behavior

- 앱은 정상 payload를 세션 메모리에 1분간 캐시한다.
- 앱 창 focus 또는 tab visibility 복귀 시 다시 조회한다.
- 따라서 Supabase 변경은 최대 약 1분 뒤 앱으로 돌아왔을 때 반영된다.
- 조회 실패나 잘못된 payload가 발생하면 마지막 정상 동적 항목과 Core 메뉴를 유지한다.

즉시 반영이 필요한 운영 변경도 1분을 기다린 뒤 앱 창을 다시 활성화하여 확인한다. 반복 새로고침이나 앱 재시작은 필요하지 않다.

## SQL Catalog

### Foundation — 최초 환경 구성

1. `supabase/migrations/202608270012_surface_content.sql`
   - 테이블, 제약, RLS, Storage 정책과 resolved RPC를 구성한다.

### Production content — 재실행 가능한 upsert

2. `supabase/operations/content/supabase_surface_content_developer_blog_seed.sql`
   - Tester/Free 대상 개발자 블로그 리소스
3. `supabase/operations/content/supabase_surface_content_ebook_seed.sql`
   - Tester/Free 대상 전자책 리소스와 Storage asset
4. `supabase/operations/content/supabase_surface_content_support_seed.sql`
   - 전체 플랜 대상 개발자 후원
5. `supabase/operations/content/supabase_surface_content_dashboard_seed.sql`
   - 기존 세 campaign을 Dashboard supporting region에 배치
6. `supabase/operations/content/supabase_surface_content_account_seed.sql`
   - 기존 resource campaign을 Account supporting region에 배치
7. `supabase/operations/content/supabase_surface_content_draft_resource_catalog_seed.sql`
   - 향후 운영 후보인 전자책·블로그 resource를 비노출 `draft` 카탈로그로 등록
   - campaign과 placement는 만들지 않으며, 재실행 시 기존 lifecycle 상태를 보존
8. `supabase/operations/content/supabase_surface_content_dashboard_recommendations_seed.sql`
   - draft resource 5개를 Tester/Free 대상 Dashboard 추천 자료로 게시한 이전 운영 seed
   - `dashboard.recommendations` region에 배치
9. `supabase/operations/content/supabase_surface_content_bloggenius_guides_seed.sql`
   - 설치·연동·글쓰기·SEO 관련 공식 사용 가이드 8건을 모든 유효 플랜에 게시
   - `dashboard.recommendations` region에 30분 순환 후보로 배치
10. `supabase/operations/content/supabase_surface_content_dashboard_guides_policy.sql`
   - 공식 가이드 8건을 검증한 뒤 이전 추천 자료 campaign 5건을 삭제 없이 pause
   - Dashboard 활용 팁 후보를 공식 가이드로 한정해 region 10건 제한에 걸리지 않게 함
11. Production recovery is a separately approved operator action; archived examples are not migrations.
   - 운영 중인 resource와 support campaign의 audience를 운영 정책으로 복원

### Validation only — 운영값을 잠시 변경하고 반드시 복원

- `supabase/archive/tests/supabase_surface_content_test_preview_pro.sql`
  - 홍보 리소스를 Pro에서도 임시로 표시
- `supabase/archive/tests/supabase_surface_content_refresh_test.sql`
  - 제목과 순서를 임시 변경하여 focus refresh 검증
- `supabase/archive/recovery/supabase_surface_content_refresh_restore.sql`
  - refresh 검증값 복원
- `supabase/archive/tests/supabase_surface_content_pause_test.sql`
  - 후원 캠페인 pause 검증
- `supabase/archive/recovery/supabase_surface_content_pause_restore.sql`
  - 후원 캠페인 publish 복원

Validation SQL은 한 쌍의 restore SQL까지 같은 작업으로 취급한다. 테스트가 중단되었거나 상태가 불확실하면 production policy 복원 SQL과 각 restore SQL의 결과 조회를 확인한다.

## Release Boundary

다음 변경은 앱 재배포 없이 가능하다.

- 지원되는 동적 항목 추가·수정
- 제목, 링크, Storage 이미지 교체
- 순서 변경
- `published`/`paused` 전환
- plan audience와 기간 변경

다음 변경은 앱 배포가 필요하다.

- Core 메뉴 추가 또는 탐색 동작 변경
- 새로운 content kind, presentation, region 또는 surface
- 새로운 bundled icon
- 앱이 모르는 데이터 표현이나 사용자 상호작용

## Safety Checklist

- 외부 URL은 HTTPS만 사용한다.
- affiliate 콘텐츠에는 disclosure를 설정한다.
- Storage에는 sidebar 크기에 맞춘 파생 이미지를 사용한다.
- 동적 항목 3개 제한과 Core Help의 위치를 확인한다.
- audience 변경 후 Tester/Free/Pro에서 각각 기대 노출을 확인한다.
- 장애 시 Core 메뉴가 유지되는지 확인한다.
