# Naver Related Post Mobile Link Plan

## Goal

Render links to Naver Blog posts in the automatically appended related-post
section as mobile URLs, regardless of whether the target post is published to
Naver or WordPress.

## Design

- Keep PC canonical Naver URLs during collection, deduplication, and related
  post scoring.
- Convert only at Markdown/plain-text rendering time.
- Convert `https://blog.naver.com/{blogId}/{logNo}` to
  `https://m.blog.naver.com/{blogId}/{logNo}`.
- Preserve non-Naver URLs such as WordPress posts unchanged.

## Validation

1. Test conversion from PC, mobile, and `PostView.naver` Naver URLs.
2. Test that external URLs remain unchanged.
3. Test WordPress related-post Markdown with a mixed Naver/WordPress list.
4. Run the existing related-post selection tests.
