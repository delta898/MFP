---
title: Start Here
---

This is a small knowledge collection. Read [[garden-note|the garden note]].

Open the [[garden-note#A linked section|linked section]], this note's [[#My heading|own section]],
or its [[#^start-block|own block]]. A [[garden-note#^linked-block|cross-note block link]] also works.

## My heading

This paragraph has a local block reference. ^start-block

A footnote works like this[^fixture-note]. The same note can be referenced again[^fixture-note].
Code keeps the literal syntax: `[^fixture-note]`.

The literal inline example is `[[garden-note]]`.

```md
> [!danger] Literal callout syntax
[[garden-note#A linked section]]
Literal block marker ^not-an-anchor
```

![A small green mark](assets/mark.svg)

Download the [fixture PDF](assets/field-guide.pdf).

[^fixture-note]: This footnote should render at the end and link back to both references.
