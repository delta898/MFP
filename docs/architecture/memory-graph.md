# Memory Graph

## Principle
Memory is event-first. Facts are stored first; preferences, suggestions, aliases, and domain knowledge are derived later.

## Current Node Types
- `MessageNode`
- `ActionNode`
- `SettingChangeNode`
- `JobRunNode`
- `ArtifactNode`
- `SuggestionNode`
- `PreferenceNode`
- `DomainKnowledgeNode`

## Current Roles
- Working memory: recent messages, actions, pending confirmations, recent artifacts.
- Preference memory: accumulated user tendencies from accepted actions and feedback.
- Suggestion memory: suggested items and their user feedback.
- Domain knowledge: canonical values and learned aliases.

## Retrieval
Typed retrieval currently builds a context packet with:
- recent messages
- recent actions
- recent setting changes
- recent job runs
- recent artifacts
- pending confirmations
- preference summary

## Current Gaps
- Preference scoring is still simple accumulation.
- Promotion rules need stronger recency/confidence handling.
- Planner-aware memory retrieval is not yet implemented.
