-- ============================================================
-- BlogGenius Configurable Surface Content PoC
-- 대상: Supabase SQL Editor
-- ============================================================
-- 목적:
-- 1) 앱 배포 없이 support/resource/affiliate 콘텐츠를 운영
-- 2) license plan 기반 audience 정책을 서버에서 판정
-- 3) 원본 테이블을 공개하지 않고 resolved surface payload만 RPC로 제공
-- 4) 공개 promotional image를 전용 Storage bucket에서 관리
--
-- 최초 PoC surface/region:
-- - surface: sidebar
-- - region: utility
-- - presentation: nav_item

begin;

-- ------------------------------------------------------------
-- Public promotional assets
-- ------------------------------------------------------------
-- 공개 전자책 표지/thumbnail 전용입니다. 사용자 비공개 파일을 넣지 않습니다.
-- Dashboard Storage UI를 통한 upload는 운영자 권한으로 수행합니다.
insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'app-public-content',
    'app-public-content',
    true,
    2097152,
    array['image/webp', 'image/png', 'image/jpeg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------
-- Data model
-- ------------------------------------------------------------
create table if not exists public.app_surface_assets (
    asset_key text primary key
        check (asset_key ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
    kind text not null default 'image'
        check (kind in ('image')),
    transport text not null default 'supabase_storage'
        check (transport in ('supabase_storage')),
    bucket_name text not null default 'app-public-content'
        check (bucket_name = 'app-public-content'),
    object_path text not null
        check (
            length(trim(object_path)) between 1 and 500
            and object_path !~ '^/'
            and object_path !~ '//'
            and object_path !~ '(^|/)[.]($|/)'
            and object_path !~ '(^|/)[.][.]($|/)'
            and object_path !~ '[\\]'
        ),
    mime_type text not null
        check (mime_type in ('image/webp', 'image/png', 'image/jpeg')),
    width integer not null check (width between 1 and 4000),
    height integer not null check (height between 1 and 4000),
    byte_size integer not null check (byte_size between 1 and 2097152),
    alt_text text not null default '' check (length(alt_text) <= 240),
    revision integer not null default 1 check (revision > 0),
    status text not null default 'draft'
        check (status in ('draft', 'active', 'retired')),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (bucket_name, object_path)
);

create table if not exists public.app_surface_contents (
    content_key text primary key
        check (content_key ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
    kind text not null
        check (kind in ('support', 'resource', 'affiliate')),
    title text not null check (length(trim(title)) between 1 and 80),
    target_url text not null
        check (length(target_url) <= 2000 and target_url ~* '^https://'),
    icon_key text not null default 'link'
        check (length(trim(icon_key)) between 1 and 40),
    cta_label text check (cta_label is null or length(cta_label) <= 80),
    disclosure_text text check (disclosure_text is null or length(disclosure_text) <= 240),
    primary_asset_key text references public.app_surface_assets(asset_key)
        on update cascade on delete set null,
    status text not null default 'draft'
        check (status in ('draft', 'active', 'retired')),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    check (kind <> 'affiliate' or length(trim(coalesce(disclosure_text, ''))) > 0)
);

create table if not exists public.app_surface_campaigns (
    campaign_key text primary key
        check (campaign_key ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
    content_key text not null references public.app_surface_contents(content_key)
        on update cascade on delete restrict,
    audience_mode text not null default 'include'
        check (audience_mode in ('all', 'include', 'exclude')),
    plan_codes text[] not null default '{}'::text[],
    starts_at timestamptz,
    ends_at timestamptz,
    minimum_app_version text not null default '0.0.0'
        check (
            minimum_app_version
            ~ '^[vV]?[0-9]+[.][0-9]+[.][0-9]+([+-][0-9A-Za-z.-]+)?$'
        ),
    maximum_app_version text
        check (
            maximum_app_version is null
            or maximum_app_version
               ~ '^[vV]?[0-9]+[.][0-9]+[.][0-9]+([+-][0-9A-Za-z.-]+)?$'
        ),
    status text not null default 'draft'
        check (status in ('draft', 'published', 'paused', 'retired')),
    policy_revision bigint not null default 1 check (policy_revision > 0),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    published_at timestamptz,
    check (ends_at is null or starts_at is null or ends_at > starts_at),
    check (
        (audience_mode = 'all' and cardinality(plan_codes) = 0)
        or
        (audience_mode in ('include', 'exclude') and cardinality(plan_codes) > 0)
    )
);

create table if not exists public.app_surface_campaign_placements (
    campaign_key text not null references public.app_surface_campaigns(campaign_key)
        on update cascade on delete cascade,
    surface_key text not null
        check (surface_key ~ '^[a-z][a-z0-9_-]{0,39}$'),
    region_key text not null
        check (region_key ~ '^[a-z][a-z0-9_-]{0,39}$'),
    presentation text not null
        check (presentation ~ '^[a-z][a-z0-9_-]{0,39}$'),
    sort_order integer not null default 500 check (sort_order between 0 and 10000),
    is_active boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    primary key (campaign_key, surface_key, region_key)
);

create index if not exists app_surface_campaigns_published_idx
    on public.app_surface_campaigns (status, starts_at, ends_at)
    where status = 'published';

create index if not exists app_surface_placements_lookup_idx
    on public.app_surface_campaign_placements (surface_key, region_key, sort_order)
    where is_active = true;

-- ------------------------------------------------------------
-- updated_at maintenance
-- ------------------------------------------------------------
create or replace function public.set_app_surface_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at := timezone('utc', now());
    return new;
end;
$$;

drop trigger if exists app_surface_assets_updated_at on public.app_surface_assets;
create trigger app_surface_assets_updated_at
before update on public.app_surface_assets
for each row execute function public.set_app_surface_updated_at();

drop trigger if exists app_surface_contents_updated_at on public.app_surface_contents;
create trigger app_surface_contents_updated_at
before update on public.app_surface_contents
for each row execute function public.set_app_surface_updated_at();

drop trigger if exists app_surface_campaigns_updated_at on public.app_surface_campaigns;
create trigger app_surface_campaigns_updated_at
before update on public.app_surface_campaigns
for each row execute function public.set_app_surface_updated_at();

drop trigger if exists app_surface_placements_updated_at on public.app_surface_campaign_placements;
create trigger app_surface_placements_updated_at
before update on public.app_surface_campaign_placements
for each row execute function public.set_app_surface_updated_at();

-- ------------------------------------------------------------
-- RLS and grants
-- ------------------------------------------------------------
alter table public.app_surface_assets enable row level security;
alter table public.app_surface_contents enable row level security;
alter table public.app_surface_campaigns enable row level security;
alter table public.app_surface_campaign_placements enable row level security;

revoke all on table public.app_surface_assets from anon, authenticated;
revoke all on table public.app_surface_contents from anon, authenticated;
revoke all on table public.app_surface_campaigns from anon, authenticated;
revoke all on table public.app_surface_campaign_placements from anon, authenticated;

grant all on table public.app_surface_assets to service_role;
grant all on table public.app_surface_contents to service_role;
grant all on table public.app_surface_campaigns to service_role;
grant all on table public.app_surface_campaign_placements to service_role;

-- ------------------------------------------------------------
-- Version comparison helper
-- ------------------------------------------------------------
create or replace function public.app_surface_version_tuple(p_version text)
returns integer[]
language sql
immutable
set search_path = public
as $$
    with parsed as (
        select regexp_match(
            trim(coalesce(p_version, '')),
            '^[vV]?([0-9]+)[.]([0-9]+)[.]([0-9]+)'
        ) as parts
    )
    select array[
        coalesce((parts)[1]::integer, 0),
        coalesce((parts)[2]::integer, 0),
        coalesce((parts)[3]::integer, 0)
    ]
      from parsed;
$$;

-- ------------------------------------------------------------
-- Resolved surface RPC
-- ------------------------------------------------------------
drop function if exists public.get_app_surface_content(text, text, text, text);

create or replace function public.get_app_surface_content(
    p_license_key text,
    p_hwid text,
    p_surface text,
    p_app_version text default '0.0.0'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_now timestamptz := timezone('utc', now());
    v_license_key text := trim(coalesce(p_license_key, ''));
    v_hwid text := trim(coalesce(p_hwid, ''));
    v_surface text := lower(trim(coalesce(p_surface, '')));
    v_app_version text := trim(coalesce(p_app_version, '0.0.0'));
    v_license_result jsonb;
    v_plan_code text;
    v_regions jsonb := '{}'::jsonb;
    v_policy_revision bigint := 0;
begin
    if v_license_key = '' or v_hwid = '' or v_surface = '' then
        return jsonb_build_object(
            'schema_version', 1,
            'policy_revision', 0,
            'resolved_for', jsonb_build_object('plan_code', null),
            'surface', v_surface,
            'regions', '{}'::jsonb,
            'generated_at', v_now
        );
    end if;

    -- 라이선스 저장 구조를 재해석하지 않고 기존 무차감 판정 RPC를 사용합니다.
    -- quota 소진 응답도 유효 plan_code를 포함하므로 콘텐츠 노출은 발행 quota와 분리됩니다.
    v_license_result := public.check_license_status(v_license_key, v_hwid);
    v_plan_code := lower(trim(coalesce(v_license_result->>'plan_code', '')));

    if v_plan_code = ''
       or not exists (
            select 1
              from public.license_plans lp
             where lower(trim(lp.plan_code)) = v_plan_code
               and lp.status = 'active'
       ) then
        return jsonb_build_object(
            'schema_version', 1,
            'policy_revision', 0,
            'resolved_for', jsonb_build_object('plan_code', null),
            'surface', v_surface,
            'regions', '{}'::jsonb,
            'generated_at', v_now
        );
    end if;

    select coalesce(max(c.policy_revision), 0)
      into v_policy_revision
      from public.app_surface_campaigns c
      join public.app_surface_campaign_placements p
        on p.campaign_key = c.campaign_key
     where p.surface_key = v_surface;

    with eligible as (
        select
            c.campaign_key,
            c.policy_revision,
            c.starts_at,
            c.ends_at,
            p.region_key,
            p.presentation,
            p.sort_order,
            content.content_key,
            content.kind,
            content.title,
            content.target_url,
            content.icon_key,
            content.cta_label,
            content.disclosure_text,
            asset.asset_key,
            asset.kind as asset_kind,
            asset.transport as asset_transport,
            asset.bucket_name,
            asset.object_path,
            asset.mime_type,
            asset.width,
            asset.height,
            asset.byte_size,
            asset.alt_text,
            asset.revision as asset_revision
        from public.app_surface_campaigns c
        join public.app_surface_contents content
          on content.content_key = c.content_key
        join public.app_surface_campaign_placements p
          on p.campaign_key = c.campaign_key
        left join public.app_surface_assets asset
          on asset.asset_key = content.primary_asset_key
         and asset.status = 'active'
        where c.status = 'published'
          and content.status = 'active'
          and p.is_active = true
          and p.surface_key = v_surface
          and (c.starts_at is null or c.starts_at <= v_now)
          and (c.ends_at is null or c.ends_at > v_now)
          and public.app_surface_version_tuple(c.minimum_app_version)
              <= public.app_surface_version_tuple(v_app_version)
          and (
              c.maximum_app_version is null
              or public.app_surface_version_tuple(v_app_version)
                 <= public.app_surface_version_tuple(c.maximum_app_version)
          )
          and (
              c.audience_mode = 'all'
              or (
                  c.audience_mode = 'include'
                  and exists (
                      select 1
                        from unnest(c.plan_codes) plan_code
                       where lower(trim(plan_code)) = v_plan_code
                  )
              )
              or (
                  c.audience_mode = 'exclude'
                  and not exists (
                      select 1
                        from unnest(c.plan_codes) plan_code
                       where lower(trim(plan_code)) = v_plan_code
                  )
              )
          )
    ), ranked as (
        select
            eligible.*,
            row_number() over (
                partition by region_key
                order by sort_order, campaign_key
            ) as region_rank
        from eligible
    ), region_payloads as (
        select
            region_key,
            jsonb_build_object(
                'blocks',
                jsonb_agg(
                    jsonb_strip_nulls(
                        jsonb_build_object(
                            'id', content_key,
                            'campaign_id', campaign_key,
                            'kind', kind,
                            'presentation', presentation,
                            'title', title,
                            'icon', icon_key,
                            'media', case
                                when asset_key is null then null
                                else jsonb_build_object(
                                    'asset_key', asset_key,
                                    'kind', asset_kind,
                                    'transport', asset_transport,
                                    'bucket', bucket_name,
                                    'object_path', object_path,
                                    'mime_type', mime_type,
                                    'width', width,
                                    'height', height,
                                    'byte_size', byte_size,
                                    'alt', alt_text,
                                    'revision', asset_revision
                                )
                            end,
                            'target_url', target_url,
                            'cta_label', cta_label,
                            'disclosure', disclosure_text,
                            'sort_order', sort_order,
                            'starts_at', starts_at,
                            'ends_at', ends_at,
                            'policy_revision', policy_revision
                        )
                    )
                    order by sort_order, campaign_key
                )
            ) as payload
        from ranked
        where region_rank <= 10
        group by region_key
    )
    select coalesce(jsonb_object_agg(region_key, payload), '{}'::jsonb)
      into v_regions
      from region_payloads;

    return jsonb_build_object(
        'schema_version', 1,
        'policy_revision', v_policy_revision,
        'resolved_for', jsonb_build_object('plan_code', v_plan_code),
        'surface', v_surface,
        'regions', coalesce(v_regions, '{}'::jsonb),
        'generated_at', v_now
    );
end;
$$;

grant execute on function public.get_app_surface_content(text, text, text, text)
    to anon, authenticated, service_role;
revoke all on function public.get_app_surface_content(text, text, text, text)
    from public;
revoke all on function public.app_surface_version_tuple(text)
    from public;

commit;

-- ============================================================
-- 운영 예시: 아래 값은 그대로 실행하지 말고 실제 값으로 교체합니다.
-- ============================================================

-- 1) Storage UI에서 다음과 같은 immutable path로 이미지를 업로드합니다.
--    bucket: app-public-content
--    path: surface-content/ebooks/affiliate-guide/cover-v1.webp

-- 2) 선택적 asset metadata
-- insert into public.app_surface_assets (
--     asset_key, object_path, mime_type, width, height, byte_size,
--     alt_text, revision, status
-- ) values (
--     'ebook-affiliate-guide-cover-v1',
--     'surface-content/ebooks/affiliate-guide/cover-v1.webp',
--     'image/webp', 600, 900, 120000,
--     '제휴마케팅 전자책 표지', 1, 'active'
-- )
-- on conflict (asset_key) do update set
--     object_path = excluded.object_path,
--     mime_type = excluded.mime_type,
--     width = excluded.width,
--     height = excluded.height,
--     byte_size = excluded.byte_size,
--     alt_text = excluded.alt_text,
--     revision = excluded.revision,
--     status = excluded.status;

-- 3) Content
-- insert into public.app_surface_contents (
--     content_key, kind, title, target_url, icon_key,
--     cta_label, disclosure_text, primary_asset_key, status
-- ) values (
--     'affiliate-guide', 'resource', '제휴마케팅 전자책',
--     'https://example.com/ebook', 'book',
--     '전자책 보기', null, 'ebook-affiliate-guide-cover-v1', 'active'
-- )
-- on conflict (content_key) do update set
--     kind = excluded.kind,
--     title = excluded.title,
--     target_url = excluded.target_url,
--     icon_key = excluded.icon_key,
--     cta_label = excluded.cta_label,
--     disclosure_text = excluded.disclosure_text,
--     primary_asset_key = excluded.primary_asset_key,
--     status = excluded.status;

-- 4) Campaign: Tester/Free only
-- insert into public.app_surface_campaigns (
--     campaign_key, content_key, audience_mode, plan_codes,
--     minimum_app_version, status, policy_revision, published_at
-- ) values (
--     'affiliate-guide-sidebar-v1', 'affiliate-guide',
--     'include', array['test', 'free'],
--     '0.1.18', 'published', 1, timezone('utc', now())
-- )
-- on conflict (campaign_key) do update set
--     audience_mode = excluded.audience_mode,
--     plan_codes = excluded.plan_codes,
--     minimum_app_version = excluded.minimum_app_version,
--     status = excluded.status,
--     policy_revision = app_surface_campaigns.policy_revision + 1,
--     published_at = timezone('utc', now());

-- 5) Placement: Help(sort 500) 위
-- insert into public.app_surface_campaign_placements (
--     campaign_key, surface_key, region_key, presentation, sort_order, is_active
-- ) values (
--     'affiliate-guide-sidebar-v1', 'sidebar', 'utility', 'nav_item', 400, true
-- )
-- on conflict (campaign_key, surface_key, region_key) do update set
--     presentation = excluded.presentation,
--     sort_order = excluded.sort_order,
--     is_active = excluded.is_active;

-- 6) 긴급 pause 예시
-- update public.app_surface_campaigns
--    set status = 'paused',
--        policy_revision = policy_revision + 1
--  where campaign_key = 'affiliate-guide-sidebar-v1';

-- 7) RPC smoke check: 실제 발급된 license key와 해당 기기의 HWID를 사용합니다.
-- select public.get_app_surface_content(
--     '<actual-license-key>',
--     '<actual-hwid>',
--     'sidebar',
--     '0.1.18'
-- );

-- 8) audience mode truth-table 검증 (read-only)
-- with cases(mode, plan_codes, current_plan, expected) as (
--     values
--         ('all',     '{}'::text[],               'test',  true),
--         ('all',     '{}'::text[],               'ultra', true),
--         ('include', array['test', 'free']::text[], 'free', true),
--         ('include', array['test', 'free']::text[], 'pro',  false),
--         ('exclude', array['pro']::text[],          'free', true),
--         ('exclude', array['pro']::text[],          'pro',  false)
-- ), evaluated as (
--     select *,
--         mode = 'all'
--         or (mode = 'include' and current_plan = any(plan_codes))
--         or (mode = 'exclude' and not (current_plan = any(plan_codes))) as actual
--       from cases
-- )
-- select *, actual = expected as passed
--   from evaluated;
