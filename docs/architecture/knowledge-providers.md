# Knowledge Providers

## Model
Knowledge providers are defined by three independent axes:
- `kind`
  - What knowledge is returned (`trends`, `weather`, `news`, ...)
- `transport`
  - How it is fetched (`builtin_api`, `mcp_tool`, `internal_query`)
- `config`
  - Instance-specific connection and routing data

## Current Structure
Configuration is expected under `knowledge.providers` and `knowledge.routing`.

A provider instance contains:
- `id`
- `kind`
- `transport`
- `enabled`
- `label`
- `config`

## Current Transport Contracts
- `builtin_api`
- `mcp_tool`
- `internal_query`

## Current Sample Provider
- `trends + builtin_api + SerpApi`

## Consumer Rule
Suggestion and content idea engines should consume normalized provider results and must not depend on vendor-specific response shapes.

## Current Gap
- `mcp_tool` transport is still structural only and needs real implementation.
