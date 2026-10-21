-- Standalone development AI model catalog snapshot.
-- Inserts the complete catalog payload without reading or inheriting any prior catalog row.
-- Apply once in the Development Supabase SQL Editor after confirming this version is unused.

begin;

do $$
declare
    target_version constant text := '2026-10-22.1';
    target_channel constant text := 'development';
    target_minimum_app_version constant text := '0.7.0';
    catalog_payload constant jsonb := $catalog$
{
  "models": [
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
      "key": "kie:gpt-5-6-sol",
      "kind": "text",
      "status": "active",
      "model_id": "gpt-5-6-sol",
      "provider": "kie",
      "transport": "kie_responses",
      "sort_order": 330,
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
      "display_name": "GPT 5.6 Sol"
    },
    {
      "key": "kie:gpt-5-6-terra",
      "kind": "text",
      "status": "active",
      "model_id": "gpt-5-6-terra",
      "provider": "kie",
      "transport": "kie_responses",
      "sort_order": 340,
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
        "structured_output": true
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
      "sort_order": 350,
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
        "structured_output": true
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
      "sort_order": 230,
      "capabilities": {
        "image_input": false,
        "temperature": false,
        "structured_output": false
      },
      "display_name": "Gemini 3.6 Flash"
    },
    {
      "key": "kie:gemini-3.1-pro",
      "kind": "text",
      "status": "active",
      "model_id": "gemini-3.1-pro",
      "provider": "kie",
      "transport": "kie_openai_chat",
      "sort_order": 240,
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
      "sort_order": 130,
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
      "sort_order": 320,
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
      "sort_order": 340,
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
      "sort_order": 520,
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
      "sort_order": 530,
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
      "key": "kie:gpt-6-astra",
      "kind": "text",
      "status": "active",
      "model_id": "gpt-6-astra",
      "provider": "kie",
      "transport": "kie_responses",
      "sort_order": 320,
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
      "sort_order": 220,
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
      "key": "kie:gpt-image-2-5-sunburst-text-to-image",
      "kind": "image",
      "status": "active",
      "model_id": "gpt-image-2-5-sunburst-text-to-image",
      "provider": "kie",
      "transport": "kie_market_image_jobs",
      "sort_order": 110,
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
      "sort_order": 120,
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
      "sort_order": 330,
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
      "sort_order": 15,
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
    },
    {
      "key": "openai:gpt-6.1-sol",
      "kind": "text",
      "status": "active",
      "model_id": "gpt-6.1-sol",
      "provider": "openai",
      "transport": "openai_chat_completions",
      "sort_order": 10,
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
      "display_name": "GPT-6.1 Sol"
    },
    {
      "key": "anthropic:claude-opus-5-5",
      "kind": "text",
      "status": "active",
      "model_id": "claude-opus-5-5",
      "provider": "anthropic",
      "transport": "anthropic_openai_compat",
      "sort_order": 20,
      "capabilities": {
        "image_input": true,
        "temperature": false,
        "structured_output": false
      },
      "display_name": "Claude Opus 5.5"
    },
    {
      "key": "anthropic:claude-sonnet-5-5",
      "kind": "text",
      "status": "active",
      "model_id": "claude-sonnet-5-5",
      "provider": "anthropic",
      "transport": "anthropic_openai_compat",
      "sort_order": 30,
      "capabilities": {
        "image_input": true,
        "temperature": false,
        "structured_output": false
      },
      "display_name": "Claude Sonnet 5.5"
    },
    {
      "key": "anthropic:claude-haiku-5-5",
      "kind": "text",
      "status": "active",
      "model_id": "claude-haiku-5-5",
      "provider": "anthropic",
      "transport": "anthropic_openai_compat",
      "sort_order": 40,
      "capabilities": {
        "image_input": true,
        "temperature": false,
        "structured_output": false
      },
      "display_name": "Claude Haiku 5.5"
    },
    {
      "key": "google:gemini-nano-banana-2.1",
      "kind": "image",
      "status": "active",
      "model_id": "gemini-nano-banana-2.1",
      "provider": "google",
      "transport": "gemini_generate_content",
      "sort_order": 5,
      "capabilities": {
        "aspect_ratio": true
      },
      "display_name": "Nano Banana 2.1"
    },
    {
      "key": "google:gemini-3.1-flash-image",
      "kind": "image",
      "status": "active",
      "model_id": "gemini-3.1-flash-image",
      "provider": "google",
      "transport": "gemini_generate_content",
      "sort_order": 10,
      "capabilities": {
        "aspect_ratio": true
      },
      "display_name": "Nano Banana 2"
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
      "key": "google:gemini-3.8-flash",
      "kind": "text",
      "status": "active",
      "model_id": "gemini-3.8-flash",
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
      "display_name": "Gemini 3.8 Flash"
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
      "key": "google:gemini-3.5-flash-lite",
      "kind": "text",
      "status": "active",
      "model_id": "gemini-3.5-flash-lite",
      "provider": "google",
      "transport": "gemini_generate_content",
      "sort_order": 30,
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
      "display_name": "Gemini 3.5 Flash-Lite"
    },
    {
      "key": "google:gemini-3.1-pro-preview",
      "kind": "text",
      "status": "preview",
      "model_id": "gemini-3.1-pro-preview",
      "provider": "google",
      "transport": "gemini_generate_content",
      "sort_order": 40,
      "capabilities": {
        "image_input": true,
        "temperature": true,
        "structured_output": true
      },
      "display_name": "Gemini 3.1 Pro Preview"
    },
    {
      "key": "google:gemini-2.5-flash-image",
      "kind": "image",
      "status": "active",
      "model_id": "gemini-2.5-flash-image",
      "provider": "google",
      "transport": "gemini_generate_content",
      "sort_order": 30,
      "capabilities": {
        "aspect_ratio": true
      },
      "display_name": "Nano Banana"
    },
    {
      "key": "google:gemini-3-pro-image",
      "kind": "image",
      "status": "active",
      "model_id": "gemini-3-pro-image",
      "provider": "google",
      "transport": "gemini_generate_content",
      "sort_order": 40,
      "capabilities": {
        "aspect_ratio": true
      },
      "display_name": "Nano Banana Pro"
    },
    {
      "key": "google:gemini-4-argon",
      "kind": "text",
      "status": "active",
      "model_id": "gemini-4-argon",
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
      "display_name": "Gemini 4 Argon"
    },
    {
      "key": "kie:gemini-4-argon-openai",
      "kind": "text",
      "status": "active",
      "model_id": "gemini-4-argon-openai",
      "provider": "kie",
      "transport": "kie_openai_chat",
      "sort_order": 210,
      "capabilities": {
        "image_input": false,
        "temperature": false,
        "structured_output": false
      },
      "display_name": "Gemini 4 Argon"
    },
    {
      "key": "kie:claude-haiku-5-5",
      "kind": "text",
      "status": "active",
      "model_id": "claude-haiku-5-5",
      "provider": "kie",
      "transport": "kie_claude_messages",
      "sort_order": 30,
      "capabilities": {
        "image_input": false,
        "temperature": true,
        "structured_output": false
      },
      "display_name": "Claude Haiku 5.5"
    },
    {
      "key": "kie:claude-sonnet-5-5",
      "kind": "text",
      "status": "active",
      "model_id": "claude-sonnet-5-5",
      "provider": "kie",
      "transport": "kie_claude_messages",
      "sort_order": 20,
      "capabilities": {
        "image_input": false,
        "temperature": true,
        "structured_output": false
      },
      "display_name": "Claude Sonnet 5.5"
    },
    {
      "key": "kie:claude-opus-5-5",
      "kind": "text",
      "status": "active",
      "model_id": "claude-opus-5-5",
      "provider": "kie",
      "transport": "kie_claude_messages",
      "sort_order": 10,
      "capabilities": {
        "image_input": false,
        "temperature": true,
        "structured_output": false
      },
      "display_name": "Claude Opus 5.5"
    },
    {
      "key": "kie:gpt-6-1-sol",
      "kind": "text",
      "status": "active",
      "model_id": "gpt-6-1-sol",
      "provider": "kie",
      "transport": "kie_responses",
      "sort_order": 310,
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
      "display_name": "GPT-6.1 Sol"
    },
    {
      "key": "kie:nano-banana-2-1",
      "kind": "image",
      "status": "active",
      "model_id": "nano-banana-2-1",
      "provider": "kie",
      "transport": "kie_market_image_jobs",
      "sort_order": 310,
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
      "display_name": "Nano Banana 2.1"
    },
    {
      "key": "kie:seedream/5-flash-text-to-image",
      "kind": "image",
      "status": "active",
      "model_id": "seedream/5-flash-text-to-image",
      "provider": "kie",
      "transport": "kie_market_image_jobs",
      "sort_order": 510,
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
      "display_name": "Seedream 5.0 Flash Image"
    },
    {
      "key": "kie:deepseek-v4-1-flash",
      "kind": "text",
      "status": "active",
      "model_id": "deepseek-v4-1-flash",
      "provider": "kie",
      "transport": "kie_openai_responses",
      "sort_order": 110,
      "capabilities": {
        "image_input": true,
        "temperature": false,
        "reasoning_efforts": [
          "low",
          "medium",
          "high"
        ],
        "structured_output": true
      },
      "display_name": "DeepSeek V4.1 Flash"
    },
    {
      "key": "kie:grok-4-7",
      "kind": "text",
      "status": "active",
      "model_id": "grok-4-7",
      "provider": "kie",
      "transport": "kie_grok_responses",
      "sort_order": 410,
      "capabilities": {
        "image_input": true,
        "temperature": false,
        "reasoning_efforts": [
          "low",
          "medium",
          "high"
        ],
        "structured_output": true
      },
      "display_name": "Grok 4.7"
    },
    {
      "key": "kie:kimi-k3",
      "kind": "text",
      "status": "active",
      "model_id": "kimi-k3",
      "provider": "kie",
      "transport": "kie_openai_responses",
      "sort_order": 510,
      "capabilities": {
        "image_input": true,
        "temperature": false,
        "reasoning_efforts": [
          "low",
          "medium",
          "high"
        ],
        "structured_output": true
      },
      "display_name": "Kimi K3"
    },
    {
      "key": "kie:flux-3/klein-text-to-image",
      "kind": "image",
      "status": "active",
      "model_id": "flux-3/klein-text-to-image",
      "provider": "kie",
      "transport": "kie_market_image_jobs",
      "sort_order": 10,
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
      "display_name": "FLUX 3"
    },
    {
      "key": "kie:grok-imagine-image-2-0/text-to-image",
      "kind": "image",
      "status": "active",
      "model_id": "grok-imagine-image-2-0/text-to-image",
      "provider": "kie",
      "transport": "kie_market_image_jobs",
      "sort_order": 210,
      "capabilities": {
        "aspect_ratio": true
      },
      "display_name": "Grok Imagine Image 2.0"
    },
    {
      "key": "kie:qwen3/text-to-image",
      "kind": "image",
      "status": "active",
      "model_id": "qwen3/text-to-image",
      "provider": "kie",
      "transport": "kie_market_image_jobs",
      "sort_order": 410,
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
      "display_name": "Qwen Image 3.0"
    },
    {
      "key": "kie:qwen2-1/text-to-image",
      "kind": "image",
      "status": "active",
      "model_id": "qwen2-1/text-to-image",
      "provider": "kie",
      "transport": "kie_market_image_jobs",
      "sort_order": 420,
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
      "display_name": "Qwen Image 2.1"
    },
    {
      "key": "kie:wan/2-7-image",
      "kind": "image",
      "status": "active",
      "model_id": "wan/2-7-image",
      "provider": "kie",
      "transport": "kie_market_image_jobs",
      "sort_order": 610,
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
      "display_name": "Wan 2.7"
    },
    {
      "key": "kie:z-image",
      "kind": "image",
      "status": "active",
      "model_id": "z-image",
      "provider": "kie",
      "transport": "kie_market_image_jobs",
      "sort_order": 710,
      "capabilities": {
        "aspect_ratio": true,
        "output_format": [
          "png"
        ]
      },
      "display_name": "Z-Image"
    }
  ],
  "version": "2026-10-22.1",
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
  "generated_at": "2026-10-22T00:00:00Z",
  "schema_version": 1,
  "minimum_app_version": "0.7.0"
}
$catalog$::jsonb;
    expected record;
    actual_count integer;
begin
    if exists (select 1 from public.ai_model_catalog_versions where version = target_version) then
        raise exception 'Catalog version % already exists; choose an unused version', target_version;
    end if;
    if catalog_payload->>'version' is distinct from target_version
       or catalog_payload->>'minimum_app_version' is distinct from target_minimum_app_version
       or (catalog_payload->>'schema_version')::integer is distinct from 1 then
        raise exception 'Inline catalog metadata does not match row metadata';
    end if;
    if jsonb_typeof(catalog_payload->'models') is distinct from 'array'
       or jsonb_typeof(catalog_payload->'providers') is distinct from 'array' then
        raise exception 'Catalog models and providers must both be JSON arrays';
    end if;
    if exists (
        select 1 from jsonb_array_elements(catalog_payload->'models') as entries(model)
         where model->>'key' = 'kie:gemini-3-5-flash-openai'
            or model->>'model_id' = 'gemini-3-5-flash-openai'
            or model->>'display_name' = 'Gemini 3.5 Flash'
    ) then raise exception 'Gemini 3.5 Flash must be omitted from the catalog'; end if;
    if jsonb_array_length(catalog_payload->'models') <> 60 then
        raise exception 'Expected complete catalog with 60 models';
    end if;
    select count(*) into actual_count from jsonb_array_elements(catalog_payload->'models') as entries(model)
     where model->>'kind'='text' and model->>'provider'='kie' and model->>'status'='active';
    if actual_count <> 15 then raise exception 'Expected 15 active KIE text models, found %', actual_count; end if;
    select count(*) into actual_count from jsonb_array_elements(catalog_payload->'models') as entries(model)
     where model->>'kind'='image' and model->>'provider'='kie' and model->>'status'='active';
    if actual_count <> 16 then raise exception 'Expected 16 active KIE image models, found %', actual_count; end if;

    for expected in select * from (values
            ('kie:claude-opus-5-5', 10),
            ('kie:claude-sonnet-5-5', 20),
            ('kie:claude-haiku-5-5', 30),
            ('kie:deepseek-v4-1-flash', 110),
            ('kie:gemini-4-argon-openai', 210),
            ('kie:gemini-3-8-flash-openai', 220),
            ('kie:gemini-3-6-flash-openai', 230),
            ('kie:gemini-3.1-pro', 240),
            ('kie:gpt-6-1-sol', 310),
            ('kie:gpt-6-astra', 320),
            ('kie:gpt-5-6-sol', 330),
            ('kie:gpt-5-6-terra', 340),
            ('kie:gpt-5-6-luna', 350),
            ('kie:grok-4-7', 410),
            ('kie:kimi-k3', 510)
    ) as expected_model(model_key, sort_order)
    loop
        if not exists (select 1 from jsonb_array_elements(catalog_payload->'models') as entries(model)
             where model->>'key'=expected.model_key and model->>'kind'='text'
               and model->>'provider'='kie' and model->>'status'='active'
               and (model->>'sort_order')::integer=expected.sort_order) then
            raise exception 'KIE text model missing or incorrectly ordered: %', expected.model_key;
        end if;
    end loop;
    for expected in select * from (values
            ('kie:flux-3/klein-text-to-image', 10),
            ('kie:gpt-image-2-5-sunburst-text-to-image', 110),
            ('kie:gpt-image-2-5-flare-text-to-image', 120),
            ('kie:gpt-image-2-text-to-image', 130),
            ('kie:grok-imagine-image-2-0/text-to-image', 210),
            ('kie:nano-banana-2-1', 310),
            ('kie:nano-banana-2', 320),
            ('kie:nano-banana-2-lite', 330),
            ('kie:nano-banana-pro', 340),
            ('kie:qwen3/text-to-image', 410),
            ('kie:qwen2-1/text-to-image', 420),
            ('kie:seedream/5-flash-text-to-image', 510),
            ('kie:seedream/5-pro-text-to-image', 520),
            ('kie:seedream/4.5-text-to-image', 530),
            ('kie:wan/2-7-image', 610),
            ('kie:z-image', 710)
    ) as expected_model(model_key, sort_order)
    loop
        if not exists (select 1 from jsonb_array_elements(catalog_payload->'models') as entries(model)
             where model->>'key'=expected.model_key and model->>'kind'='image'
               and model->>'provider'='kie' and model->>'status'='active'
               and (model->>'sort_order')::integer=expected.sort_order) then
            raise exception 'KIE image model missing or incorrectly ordered: %', expected.model_key;
        end if;
    end loop;

    insert into public.ai_model_catalog_versions (
        version, schema_version, channel, status, payload, minimum_app_version, published_at
    ) values (
        target_version, 1, target_channel, 'published', catalog_payload,
        target_minimum_app_version, timezone('utc', now())
    );
end
$$;

commit;

select version, schema_version, channel, status, minimum_app_version, published_at,
       jsonb_array_length(payload->'models') as model_count
  from public.ai_model_catalog_versions
 where version = '2026-10-22.1' and channel = 'development';
