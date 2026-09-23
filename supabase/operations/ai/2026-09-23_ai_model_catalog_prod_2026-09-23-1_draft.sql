-- Production-only v0.5.2 AI model catalog draft.
-- This embeds the exact 39-model payload validated in Development.
-- Run only against BlogGenius Production.

begin;

with prepared as (
    select jsonb_set(
        jsonb_set(
            $catalog$
{
  "models": [
    {
      "key": "openai:gpt-5.6-sol",
      "kind": "text",
      "status": "active",
      "model_id": "gpt-5.6-sol",
      "provider": "openai",
      "transport": "openai_chat_completions",
      "sort_order": 30,
      "capabilities": {
        "image_input": true,
        "temperature": false,
        "reasoning_efforts": [
          "none",
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "structured_output": true
      },
      "display_name": "GPT-5.6 Sol"
    },
    {
      "key": "openai:gpt-5.6-terra",
      "kind": "text",
      "status": "active",
      "model_id": "gpt-5.6-terra",
      "provider": "openai",
      "transport": "openai_chat_completions",
      "sort_order": 40,
      "capabilities": {
        "image_input": true,
        "temperature": false,
        "reasoning_efforts": [
          "none",
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "structured_output": true
      },
      "display_name": "GPT-5.6 Terra"
    },
    {
      "key": "openai:gpt-5.6-luna",
      "kind": "text",
      "status": "active",
      "model_id": "gpt-5.6-luna",
      "provider": "openai",
      "transport": "openai_chat_completions",
      "sort_order": 50,
      "capabilities": {
        "image_input": true,
        "temperature": false,
        "reasoning_efforts": [
          "none",
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "structured_output": true
      },
      "display_name": "GPT-5.6 Luna"
    },
    {
      "key": "google:gemini-3.7-flash",
      "kind": "text",
      "status": "active",
      "model_id": "gemini-3.7-flash",
      "provider": "google",
      "transport": "gemini_generate_content",
      "sort_order": 10,
      "capabilities": {
        "image_input": true,
        "temperature": false,
        "thinking_levels": [
          "low",
          "medium",
          "high"
        ],
        "structured_output": true
      },
      "display_name": "Gemini 3.7 Flash"
    },
    {
      "key": "google:gemini-3.6-flash",
      "kind": "text",
      "status": "active",
      "model_id": "gemini-3.6-flash",
      "provider": "google",
      "transport": "gemini_generate_content",
      "sort_order": 20,
      "capabilities": {
        "image_input": true,
        "temperature": false,
        "thinking_levels": [
          "minimal",
          "low",
          "medium",
          "high"
        ],
        "structured_output": true
      },
      "display_name": "Gemini 3.6 Flash"
    },
    {
      "key": "anthropic:claude-fable-5",
      "kind": "text",
      "status": "hidden",
      "model_id": "claude-fable-5",
      "provider": "anthropic",
      "transport": "anthropic_openai_compat",
      "sort_order": 10,
      "capabilities": {
        "image_input": true,
        "temperature": true,
        "structured_output": false
      },
      "display_name": "Claude Fable 5"
    },
    {
      "key": "anthropic:claude-opus-5",
      "kind": "text",
      "status": "active",
      "model_id": "claude-opus-5",
      "provider": "anthropic",
      "transport": "anthropic_openai_compat",
      "sort_order": 20,
      "capabilities": {
        "image_input": true,
        "temperature": true,
        "structured_output": false
      },
      "display_name": "Claude Opus 5"
    },
    {
      "key": "anthropic:claude-sonnet-5",
      "kind": "text",
      "status": "active",
      "model_id": "claude-sonnet-5",
      "provider": "anthropic",
      "transport": "anthropic_openai_compat",
      "sort_order": 30,
      "capabilities": {
        "image_input": true,
        "temperature": false,
        "structured_output": false
      },
      "display_name": "Claude Sonnet 5"
    },
    {
      "key": "kie:gpt-5-6-sol",
      "kind": "text",
      "status": "active",
      "model_id": "gpt-5-6-sol",
      "provider": "kie",
      "transport": "kie_responses",
      "sort_order": 10,
      "capabilities": {
        "image_input": false,
        "temperature": false,
        "reasoning_efforts": [
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "structured_output": false
      },
      "display_name": "GPT 5.6 Sol"
    },
    {
      "key": "kie:gpt-5-6-terra",
      "kind": "text",
      "status": "active",
      "model_id": "gpt-5-6-terra",
      "provider": "kie",
      "transport": "kie_responses",
      "sort_order": 20,
      "capabilities": {
        "image_input": false,
        "temperature": false,
        "reasoning_efforts": [
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "structured_output": false
      },
      "display_name": "GPT 5.6 Terra"
    },
    {
      "key": "kie:gpt-5-6-luna",
      "kind": "text",
      "status": "active",
      "model_id": "gpt-5-6-luna",
      "provider": "kie",
      "transport": "kie_responses",
      "sort_order": 30,
      "capabilities": {
        "image_input": false,
        "temperature": false,
        "reasoning_efforts": [
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "structured_output": false
      },
      "display_name": "GPT 5.6 Luna"
    },
    {
      "key": "kie:gemini-3-6-flash-openai",
      "kind": "text",
      "status": "active",
      "model_id": "gemini-3-6-flash-openai",
      "provider": "kie",
      "transport": "kie_openai_chat",
      "sort_order": 40,
      "capabilities": {
        "image_input": false,
        "temperature": false,
        "structured_output": false
      },
      "display_name": "Gemini 3.6 Flash"
    },
    {
      "key": "kie:gemini-3-5-flash-openai",
      "kind": "text",
      "status": "hidden",
      "model_id": "gemini-3-5-flash-openai",
      "provider": "kie",
      "transport": "kie_openai_chat",
      "sort_order": 50,
      "capabilities": {
        "image_input": false,
        "temperature": true,
        "structured_output": false
      },
      "display_name": "Gemini 3.5 Flash"
    },
    {
      "key": "kie:gemini-3.1-pro",
      "kind": "text",
      "status": "active",
      "model_id": "gemini-3.1-pro",
      "provider": "kie",
      "transport": "kie_openai_chat",
      "sort_order": 60,
      "capabilities": {
        "image_input": false,
        "temperature": true,
        "structured_output": false
      },
      "display_name": "Gemini 3.1 Pro"
    },
    {
      "key": "openai:gpt-image-2",
      "kind": "image",
      "status": "active",
      "model_id": "gpt-image-2",
      "provider": "openai",
      "transport": "openai_images",
      "sort_order": 30,
      "capabilities": {
        "quality": [
          "low",
          "medium",
          "high",
          "auto"
        ],
        "output_format": [
          "png",
          "jpeg",
          "webp"
        ],
        "arbitrary_size": true,
        "response_format": false
      },
      "display_name": "GPT Image 2"
    },
    {
      "key": "kie:gpt-image-2-text-to-image",
      "kind": "image",
      "status": "active",
      "model_id": "gpt-image-2-text-to-image",
      "provider": "kie",
      "transport": "kie_market_image_jobs",
      "sort_order": 30,
      "capabilities": {
        "image_size": [
          "1K",
          "2K"
        ],
        "aspect_ratio": true
      },
      "display_name": "GPT Image 2"
    },
    {
      "key": "kie:nano-banana-2",
      "kind": "image",
      "status": "active",
      "model_id": "nano-banana-2",
      "provider": "kie",
      "transport": "kie_market_image_jobs",
      "sort_order": 50,
      "capabilities": {
        "image_size": [
          "1K",
          "2K"
        ],
        "aspect_ratio": true,
        "output_format": [
          "png"
        ]
      },
      "display_name": "Nano Banana 2"
    },
    {
      "key": "kie:nano-banana-pro",
      "kind": "image",
      "status": "active",
      "model_id": "nano-banana-pro",
      "provider": "kie",
      "transport": "kie_market_image_jobs",
      "sort_order": 60,
      "capabilities": {
        "image_size": [
          "1K",
          "2K"
        ],
        "aspect_ratio": true,
        "output_format": [
          "png"
        ]
      },
      "display_name": "Nano Banana Pro"
    },
    {
      "key": "kie:seedream/5-pro-text-to-image",
      "kind": "image",
      "status": "active",
      "model_id": "seedream/5-pro-text-to-image",
      "provider": "kie",
      "transport": "kie_market_image_jobs",
      "sort_order": 70,
      "capabilities": {
        "image_size": [
          "1K",
          "2K"
        ],
        "aspect_ratio": true,
        "output_format": [
          "png"
        ]
      },
      "display_name": "Seedream 5 Pro"
    },
    {
      "key": "kie:seedream/4.5-text-to-image",
      "kind": "image",
      "status": "active",
      "model_id": "seedream/4.5-text-to-image",
      "provider": "kie",
      "transport": "kie_market_image_jobs",
      "sort_order": 80,
      "capabilities": {
        "image_size": [
          "1K",
          "2K"
        ],
        "aspect_ratio": true
      },
      "display_name": "Seedream 4.5"
    },
    {
      "key": "openai:gpt-6-astra",
      "kind": "text",
      "status": "active",
      "model_id": "gpt-6-astra",
      "provider": "openai",
      "transport": "openai_chat_completions",
      "sort_order": 5,
      "capabilities": {
        "image_input": true,
        "temperature": false,
        "reasoning_efforts": [
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "structured_output": true
      },
      "display_name": "GPT-6 Astra"
    },
    {
      "key": "google:gemini-3.8-flash",
      "kind": "text",
      "status": "active",
      "model_id": "gemini-3.8-flash",
      "provider": "google",
      "transport": "gemini_generate_content",
      "sort_order": 5,
      "capabilities": {
        "image_input": true,
        "temperature": false,
        "thinking_levels": [
          "low",
          "medium",
          "high"
        ],
        "structured_output": true
      },
      "display_name": "Gemini 3.8 Flash"
    },
    {
      "key": "google:gemini-3.5-flash",
      "kind": "text",
      "status": "hidden",
      "model_id": "gemini-3.5-flash",
      "provider": "google",
      "transport": "gemini_generate_content",
      "sort_order": 30,
      "capabilities": {
        "image_input": true,
        "temperature": true,
        "structured_output": true
      },
      "display_name": "Gemini 3.5 Flash"
    },
    {
      "key": "kie:gpt-6-astra",
      "kind": "text",
      "status": "active",
      "model_id": "gpt-6-astra",
      "provider": "kie",
      "transport": "kie_responses",
      "sort_order": 5,
      "capabilities": {
        "image_input": false,
        "temperature": false,
        "reasoning_efforts": [
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "structured_output": false
      },
      "display_name": "GPT-6 Astra"
    },
    {
      "key": "kie:gemini-3-8-flash-openai",
      "kind": "text",
      "status": "active",
      "model_id": "gemini-3-8-flash-openai",
      "provider": "kie",
      "transport": "kie_openai_chat",
      "sort_order": 35,
      "capabilities": {
        "image_input": false,
        "temperature": false,
        "structured_output": false
      },
      "display_name": "Gemini 3.8 Flash"
    },
    {
      "key": "anthropic:claude-fable-5-1",
      "kind": "text",
      "status": "active",
      "model_id": "claude-fable-5-1",
      "provider": "anthropic",
      "transport": "anthropic_openai_compat",
      "sort_order": 10,
      "capabilities": {
        "image_input": true,
        "temperature": true,
        "structured_output": false
      },
      "display_name": "Claude Fable 5.1"
    },
    {
      "key": "anthropic:claude-haiku-4-5",
      "kind": "text",
      "status": "active",
      "model_id": "claude-haiku-4-5",
      "provider": "anthropic",
      "transport": "anthropic_openai_compat",
      "sort_order": 40,
      "capabilities": {
        "image_input": true,
        "temperature": true,
        "structured_output": false
      },
      "display_name": "Claude Haiku 4.5"
    },
    {
      "key": "anthropic:claude-opus-4-6",
      "kind": "text",
      "status": "hidden",
      "model_id": "claude-opus-4-6",
      "provider": "anthropic",
      "transport": "anthropic_openai_compat",
      "sort_order": 100,
      "capabilities": {
        "image_input": true,
        "temperature": true,
        "structured_output": false
      },
      "display_name": "Claude Opus 4.6"
    },
    {
      "key": "anthropic:claude-sonnet-4-6",
      "kind": "text",
      "status": "hidden",
      "model_id": "claude-sonnet-4-6",
      "provider": "anthropic",
      "transport": "anthropic_openai_compat",
      "sort_order": 110,
      "capabilities": {
        "image_input": true,
        "temperature": true,
        "structured_output": false
      },
      "display_name": "Claude Sonnet 4.6"
    },
    {
      "key": "anthropic:claude-opus-4-5",
      "kind": "text",
      "status": "hidden",
      "model_id": "claude-opus-4-5",
      "provider": "anthropic",
      "transport": "anthropic_openai_compat",
      "sort_order": 120,
      "capabilities": {
        "image_input": true,
        "temperature": true,
        "structured_output": false
      },
      "display_name": "Claude Opus 4.5"
    },
    {
      "key": "anthropic:claude-sonnet-4-5",
      "kind": "text",
      "status": "hidden",
      "model_id": "claude-sonnet-4-5",
      "provider": "anthropic",
      "transport": "anthropic_openai_compat",
      "sort_order": 130,
      "capabilities": {
        "image_input": true,
        "temperature": true,
        "structured_output": false
      },
      "display_name": "Claude Sonnet 4.5"
    },
    {
      "key": "openai:gpt-image-2.5-sunburst",
      "kind": "image",
      "status": "active",
      "model_id": "gpt-image-2.5-sunburst",
      "provider": "openai",
      "transport": "openai_images",
      "sort_order": 10,
      "capabilities": {
        "quality": [
          "low",
          "medium",
          "high",
          "xhigh",
          "max",
          "auto"
        ],
        "output_format": [
          "png",
          "jpeg",
          "webp"
        ],
        "arbitrary_size": true,
        "response_format": false
      },
      "display_name": "GPT Image 2.5 Sunburst"
    },
    {
      "key": "openai:gpt-image-2.5-flare",
      "kind": "image",
      "status": "active",
      "model_id": "gpt-image-2.5-flare",
      "provider": "openai",
      "transport": "openai_images",
      "sort_order": 20,
      "capabilities": {
        "quality": [
          "low",
          "medium",
          "high",
          "xhigh",
          "max",
          "auto"
        ],
        "output_format": [
          "png",
          "jpeg",
          "webp"
        ],
        "arbitrary_size": true,
        "response_format": false
      },
      "display_name": "GPT Image 2.5 Flare"
    },
    {
      "key": "google:gemini-3.1-flash-lite-image",
      "kind": "image",
      "status": "active",
      "model_id": "gemini-3.1-flash-lite-image",
      "provider": "google",
      "transport": "gemini_generate_content",
      "sort_order": 20,
      "capabilities": {
        "image_size": [
          "1K"
        ],
        "aspect_ratio": true
      },
      "display_name": "Nano Banana 2 Lite"
    },
    {
      "key": "kie:gpt-image-2-5-sunburst-text-to-image",
      "kind": "image",
      "status": "active",
      "model_id": "gpt-image-2-5-sunburst-text-to-image",
      "provider": "kie",
      "transport": "kie_market_image_jobs",
      "sort_order": 10,
      "capabilities": {
        "image_size": [
          "1K",
          "2K"
        ],
        "aspect_ratio": true
      },
      "display_name": "GPT Image 2.5 Sunburst"
    },
    {
      "key": "kie:gpt-image-2-5-flare-text-to-image",
      "kind": "image",
      "status": "active",
      "model_id": "gpt-image-2-5-flare-text-to-image",
      "provider": "kie",
      "transport": "kie_market_image_jobs",
      "sort_order": 20,
      "capabilities": {
        "image_size": [
          "1K",
          "2K"
        ],
        "aspect_ratio": true
      },
      "display_name": "GPT Image 2.5 Flare"
    },
    {
      "key": "kie:nano-banana-2-lite",
      "kind": "image",
      "status": "active",
      "model_id": "nano-banana-2-lite",
      "provider": "kie",
      "transport": "kie_market_image_jobs",
      "sort_order": 40,
      "capabilities": {
        "image_size": [
          "1K"
        ],
        "aspect_ratio": true,
        "output_format": [
          "png"
        ]
      },
      "display_name": "Nano Banana 2 Lite"
    },
    {
      "key": "openai:gpt-6-sol",
      "kind": "text",
      "status": "active",
      "model_id": "gpt-6-sol",
      "provider": "openai",
      "transport": "openai_chat_completions",
      "sort_order": 10,
      "capabilities": {
        "image_input": true,
        "temperature": false,
        "reasoning_efforts": [
          "none",
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "structured_output": true
      },
      "display_name": "GPT-6 Sol"
    },
    {
      "key": "openai:gpt-6-luna",
      "kind": "text",
      "status": "active",
      "model_id": "gpt-6-luna",
      "provider": "openai",
      "transport": "openai_chat_completions",
      "sort_order": 20,
      "capabilities": {
        "image_input": true,
        "temperature": false,
        "reasoning_efforts": [
          "none",
          "low",
          "medium",
          "high",
          "xhigh",
          "max"
        ],
        "structured_output": true
      },
      "display_name": "GPT-6 Luna"
    }
  ],
  "version": "2026-09-23.1",
  "providers": [
    {
      "id": "openai",
      "kind": "text",
      "sort_order": 10,
      "display_name": "OpenAI"
    },
    {
      "id": "anthropic",
      "kind": "text",
      "sort_order": 20,
      "display_name": "Anthropic"
    },
    {
      "id": "google",
      "kind": "text",
      "sort_order": 30,
      "display_name": "Google"
    },
    {
      "id": "kie",
      "kind": "text",
      "sort_order": 40,
      "display_name": "KIE.ai"
    },
    {
      "id": "openai",
      "kind": "image",
      "sort_order": 10,
      "display_name": "OpenAI"
    },
    {
      "id": "google",
      "kind": "image",
      "sort_order": 20,
      "display_name": "Google"
    },
    {
      "id": "kie",
      "kind": "image",
      "sort_order": 30,
      "display_name": "KIE.ai"
    }
  ],
  "generated_at": "2026-09-22 22:35:39.076195",
  "schema_version": 1,
  "minimum_app_version": "0.5.2"
}
$catalog$::jsonb,
            '{generated_at}',
            to_jsonb(timezone('utc', now())::text),
            false
        ),
        '{minimum_app_version}',
        '"0.5.2"'::jsonb,
        true
    ) as payload
)
insert into public.ai_model_catalog_versions (
    version, schema_version, channel, status, payload, minimum_app_version, published_at
)
select '2026-09-23.1', 1, 'stable', 'draft', payload, '0.5.2', null
  from prepared
on conflict (version) do update
set schema_version = excluded.schema_version,
    channel = excluded.channel,
    payload = excluded.payload,
    minimum_app_version = excluded.minimum_app_version,
    published_at = null
where public.ai_model_catalog_versions.status = 'draft';

do $$
declare
    target_payload jsonb;
begin
    select payload
      into target_payload
      from public.ai_model_catalog_versions
     where version = '2026-09-23.1'
       and channel = 'stable'
       and status = 'draft';

    if target_payload is null then
        raise exception 'Production draft 2026-09-23.1 was not created';
    end if;
    if jsonb_array_length(target_payload->'models') <> 39 then
        raise exception 'Expected 39 models in Production draft';
    end if;
    if target_payload->>'minimum_app_version' <> '0.5.2' then
        raise exception 'Payload minimum_app_version must be 0.5.2';
    end if;
    if not exists (
        select 1 from jsonb_array_elements(target_payload->'models') model
         where model->>'key' = 'openai:gpt-6-sol'
           and model->'capabilities'->'reasoning_efforts' ? 'medium'
    ) or not exists (
        select 1 from jsonb_array_elements(target_payload->'models') model
         where model->>'key' = 'openai:gpt-6-luna'
           and model->'capabilities'->'reasoning_efforts' ? 'low'
    ) then
        raise exception 'Production GPT-6 catalog validation failed';
    end if;
end
$$;

commit;
