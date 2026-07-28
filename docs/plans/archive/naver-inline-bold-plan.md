# Naver Markdown Inline Bold Plan

## Goal

Render valid Markdown inline bold (`**text**`) as native bold text in the
Naver SmartEditor while keeping WordPress's existing Markdown-to-HTML path
unchanged.

## Scope

- Preserve plain text plus bold character ranges when parsing Markdown blocks.
- Render those ranges as bold in local and quick-preview HTML.
- While Naver types a paragraph or list item, toggle the SmartEditor bold
  shortcut only around each bold range.
- Keep malformed or escaped Markdown outside this feature's scope.

## Non-goals

- Do not change WordPress publishing: it continues to convert the original
  Markdown through `marked()`.
- Do not introduce additional author-facing Markdown syntax.
- Do not apply a whole-block bold format when only an inline range is marked.

## Validation

1. Unit-test extraction of one and multiple bold ranges and preservation of
   unmarked text.
2. Unit-test preview HTML for bold ranges.
3. Run the existing Markdown separator tests to guard parser compatibility.
4. Manually publish a Naver draft containing multiple `**bold**` spans in a
   paragraph and a list item.
