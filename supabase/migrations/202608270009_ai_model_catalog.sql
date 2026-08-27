-- ============================================================
-- BlogGenius Versioned AI Model Catalog
-- 대상: Supabase SQL Editor
-- ============================================================
-- 앱은 published snapshot만 RPC로 읽습니다.
-- draft 작성/publish/rollback은 service_role 또는 SQL Editor에서 수행합니다.

begin;

create table if not exists public.ai_model_catalog_versions (
    version text primary key,
    schema_version integer not null default 1 check (schema_version > 0),
    channel text not null default 'stable',
    status text not null default 'draft'
        check (status in ('draft', 'published', 'retired')),
    payload jsonb not null,
    minimum_app_version text not null default '0.0.0',
    created_at timestamptz not null default timezone('utc', now()),
    published_at timestamptz
);

create index if not exists ai_model_catalog_versions_published_idx
    on public.ai_model_catalog_versions (channel, published_at desc)
    where status = 'published';

alter table public.ai_model_catalog_versions enable row level security;
revoke all on table public.ai_model_catalog_versions from anon, authenticated;
grant all on table public.ai_model_catalog_versions to service_role;

drop function if exists public.get_ai_model_catalog(text, text);
drop function if exists public.ai_catalog_version_tuple(text);

create or replace function public.ai_catalog_version_tuple(p_version text)
returns integer[]
language sql
immutable
set search_path = public
as $$
    with parsed as (
        select regexp_match(coalesce(p_version, ''), '^([0-9]+)[.]([0-9]+)[.]([0-9]+)') as parts
    )
    select array[
        coalesce((parts)[1]::integer, 0),
        coalesce((parts)[2]::integer, 0),
        coalesce((parts)[3]::integer, 0)
    ]
      from parsed;
$$;

create or replace function public.get_ai_model_catalog(
    p_channel text default 'stable',
    p_app_version text default '0.0.0'
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select jsonb_build_object(
        'version', version,
        'schema_version', schema_version,
        'payload', payload,
        'minimum_app_version', minimum_app_version,
        'published_at', published_at
    )
      from public.ai_model_catalog_versions
     where status = 'published'
       and channel = coalesce(nullif(trim(p_channel), ''), 'stable')
       and public.ai_catalog_version_tuple(minimum_app_version)
           <= public.ai_catalog_version_tuple(p_app_version)
     order by published_at desc nulls last, created_at desc
     limit 1;
$$;

grant execute on function public.get_ai_model_catalog(text, text)
    to anon, authenticated, service_role;
revoke all on function public.get_ai_model_catalog(text, text) from public;
revoke all on function public.ai_catalog_version_tuple(text) from public;

insert into public.ai_model_catalog_versions (
    version,
    schema_version,
    channel,
    status,
    payload,
    minimum_app_version,
    published_at
)
values (
    '2026-08-21.1',
    1,
    'stable',
    'published',
    '{
      "schema_version": 1,
      "version": "2026-08-21.1",
      "generated_at": "2026-08-21T00:00:00Z",
      "providers": [
        {"kind": "text", "id": "openai", "display_name": "OpenAI", "sort_order": 10},
        {"kind": "text", "id": "anthropic", "display_name": "Anthropic", "sort_order": 20},
        {"kind": "text", "id": "google", "display_name": "Google", "sort_order": 30},
        {"kind": "text", "id": "kie", "display_name": "KIE.ai", "sort_order": 40},
        {"kind": "image", "id": "openai", "display_name": "OpenAI", "sort_order": 10},
        {"kind": "image", "id": "google", "display_name": "Google", "sort_order": 20},
        {"kind": "image", "id": "kie", "display_name": "KIE.ai", "sort_order": 30}
      ],
      "models": [
        {
          "key": "openai:gpt-5.6-sol",
          "kind": "text",
          "provider": "openai",
          "transport": "openai_chat_completions",
          "model_id": "gpt-5.6-sol",
          "display_name": "GPT-5.6 Sol",
          "status": "active",
          "sort_order": 10,
          "capabilities": {"temperature": false, "structured_output": true, "image_input": true}
        },
        {
          "key": "openai:gpt-5.6-terra",
          "kind": "text",
          "provider": "openai",
          "transport": "openai_chat_completions",
          "model_id": "gpt-5.6-terra",
          "display_name": "GPT-5.6 Terra",
          "status": "active",
          "sort_order": 20,
          "capabilities": {"temperature": false, "structured_output": true, "image_input": true}
        },
        {
          "key": "openai:gpt-5.6-luna",
          "kind": "text",
          "provider": "openai",
          "transport": "openai_chat_completions",
          "model_id": "gpt-5.6-luna",
          "display_name": "GPT-5.6 Luna",
          "status": "active",
          "sort_order": 30,
          "capabilities": {"temperature": false, "structured_output": true, "image_input": true}
        },
        {
          "key": "google:gemini-3.7-flash",
          "kind": "text",
          "provider": "google",
          "transport": "gemini_generate_content",
          "model_id": "gemini-3.7-flash",
          "display_name": "Gemini 3.7 Flash",
          "status": "active",
          "sort_order": 10,
          "capabilities": {"temperature": false, "structured_output": true, "image_input": true, "thinking_levels": ["low", "medium", "high"]}
        },
        {
          "key": "google:gemini-3.6-flash",
          "kind": "text",
          "provider": "google",
          "transport": "gemini_generate_content",
          "model_id": "gemini-3.6-flash",
          "display_name": "Gemini 3.6 Flash",
          "status": "active",
          "sort_order": 20,
          "capabilities": {"temperature": false, "structured_output": true, "image_input": true, "thinking_levels": ["minimal", "low", "medium", "high"]}
        },
        {
          "key": "anthropic:claude-fable-5",
          "kind": "text",
          "provider": "anthropic",
          "transport": "anthropic_openai_compat",
          "model_id": "claude-fable-5",
          "display_name": "Claude Fable 5",
          "status": "active",
          "sort_order": 10,
          "capabilities": {"temperature": true, "structured_output": false, "image_input": true}
        },
        {
          "key": "anthropic:claude-opus-5",
          "kind": "text",
          "provider": "anthropic",
          "transport": "anthropic_openai_compat",
          "model_id": "claude-opus-5",
          "display_name": "Claude Opus 5",
          "status": "active",
          "sort_order": 20,
          "capabilities": {"temperature": true, "structured_output": false, "image_input": true}
        },
        {
          "key": "anthropic:claude-sonnet-5",
          "kind": "text",
          "provider": "anthropic",
          "transport": "anthropic_openai_compat",
          "model_id": "claude-sonnet-5",
          "display_name": "Claude Sonnet 5",
          "status": "active",
          "sort_order": 30,
          "capabilities": {"temperature": true, "structured_output": false, "image_input": true}
        },
        {
          "key": "kie:gpt-5-6-sol",
          "kind": "text",
          "provider": "kie",
          "transport": "kie_responses",
          "model_id": "gpt-5-6-sol",
          "display_name": "GPT 5.6 Sol",
          "status": "active",
          "sort_order": 10,
          "capabilities": {"temperature": false, "structured_output": false, "image_input": false}
        },
        {
          "key": "kie:gpt-5-6-terra",
          "kind": "text",
          "provider": "kie",
          "transport": "kie_responses",
          "model_id": "gpt-5-6-terra",
          "display_name": "GPT 5.6 Terra",
          "status": "active",
          "sort_order": 20,
          "capabilities": {"temperature": false, "structured_output": false, "image_input": false}
        },
        {
          "key": "kie:gpt-5-6-luna",
          "kind": "text",
          "provider": "kie",
          "transport": "kie_responses",
          "model_id": "gpt-5-6-luna",
          "display_name": "GPT 5.6 Luna",
          "status": "active",
          "sort_order": 30,
          "capabilities": {"temperature": false, "structured_output": false, "image_input": false}
        },
        {
          "key": "kie:gemini-3-6-flash-openai",
          "kind": "text",
          "provider": "kie",
          "transport": "kie_openai_chat",
          "model_id": "gemini-3-6-flash-openai",
          "display_name": "Gemini 3.6 Flash",
          "status": "active",
          "sort_order": 40,
          "capabilities": {"temperature": false, "structured_output": false, "image_input": false}
        },
        {
          "key": "kie:gemini-3-5-flash-openai",
          "kind": "text",
          "provider": "kie",
          "transport": "kie_openai_chat",
          "model_id": "gemini-3-5-flash-openai",
          "display_name": "Gemini 3.5 Flash",
          "status": "active",
          "sort_order": 50,
          "capabilities": {"temperature": true, "structured_output": false, "image_input": false}
        },
        {
          "key": "kie:gemini-3.1-pro",
          "kind": "text",
          "provider": "kie",
          "transport": "kie_openai_chat",
          "model_id": "gemini-3.1-pro",
          "display_name": "Gemini 3.1 Pro",
          "status": "active",
          "sort_order": 60,
          "capabilities": {"temperature": true, "structured_output": false, "image_input": false}
        },
        {
          "key": "openai:gpt-image-2",
          "kind": "image",
          "provider": "openai",
          "transport": "openai_images",
          "model_id": "gpt-image-2",
          "display_name": "GPT Image 2",
          "status": "active",
          "sort_order": 10,
          "capabilities": {
            "response_format": false,
            "arbitrary_size": true,
            "output_format": ["png", "jpeg", "webp"],
            "quality": ["low", "medium", "high", "auto"]
          }
        },
        {
          "key": "kie:gpt-image-2-text-to-image",
          "kind": "image",
          "provider": "kie",
          "transport": "kie_market_image_jobs",
          "model_id": "gpt-image-2-text-to-image",
          "display_name": "GPT Image 2",
          "status": "active",
          "sort_order": 10,
          "capabilities": {
            "aspect_ratio": true,
            "image_size": ["1K", "2K"]
          }
        },
        {
          "key": "kie:nano-banana-2",
          "kind": "image",
          "provider": "kie",
          "transport": "kie_market_image_jobs",
          "model_id": "nano-banana-2",
          "display_name": "Nano Banana 2",
          "status": "active",
          "sort_order": 20,
          "capabilities": {
            "aspect_ratio": true,
            "image_size": ["1K", "2K"],
            "output_format": ["png"]
          }
        },
        {
          "key": "kie:nano-banana-pro",
          "kind": "image",
          "provider": "kie",
          "transport": "kie_market_image_jobs",
          "model_id": "nano-banana-pro",
          "display_name": "Nano Banana Pro",
          "status": "active",
          "sort_order": 30,
          "capabilities": {
            "aspect_ratio": true,
            "image_size": ["1K", "2K"],
            "output_format": ["png"]
          }
        },
        {
          "key": "kie:seedream/5-pro-text-to-image",
          "kind": "image",
          "provider": "kie",
          "transport": "kie_market_image_jobs",
          "model_id": "seedream/5-pro-text-to-image",
          "display_name": "Seedream 5 Pro",
          "status": "active",
          "sort_order": 40,
          "capabilities": {
            "aspect_ratio": true,
            "image_size": ["1K", "2K"],
            "output_format": ["png"]
          }
        },
        {
          "key": "kie:seedream/4.5-text-to-image",
          "kind": "image",
          "provider": "kie",
          "transport": "kie_market_image_jobs",
          "model_id": "seedream/4.5-text-to-image",
          "display_name": "Seedream 4.5",
          "status": "active",
          "sort_order": 50,
          "capabilities": {
            "aspect_ratio": true,
            "image_size": ["1K", "2K"]
          }
        }
      ]
    }'::jsonb,
    '0.1.16',
    timezone('utc', now())
)
on conflict (version) do nothing;

commit;

-- 운영 예시:
-- 1) draft insert
-- insert into public.ai_model_catalog_versions (
--     version, schema_version, channel, status, payload, minimum_app_version
-- ) values (
--     '2026-08-21.1',
--     1,
--     'stable',
--     'draft',
--     '{"schema_version":1,"version":"2026-08-21.1","models":[]}'::jsonb,
--     '0.1.16'
-- );
--
-- 2) publish
-- 초기 Model Catalog 소비 버전은 0.1.15 이상입니다.
-- 이후 호환 계약이 바뀌는 경우에만 minimum_app_version별 snapshot을 분리합니다.
-- update public.ai_model_catalog_versions
--    set status = 'retired'
--  where channel = 'stable' and status = 'published';
--
-- update public.ai_model_catalog_versions
--    set status = 'published', published_at = timezone('utc', now())
--  where version = '2026-08-21.1';
