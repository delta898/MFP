# Content Writing Style

## Scope
BlogGenius content generation supports two user-controlled Korean writing style axes:

- `writing_mode`: `conversational` or `written`
- `speech_level`: `polite` or `plain`

The default is conversational polite writing.

## Configuration
The canonical persisted configuration lives at:

```json
{
  "content": {
    "writing_style": {
      "writing_mode": "conversational",
      "speech_level": "polite"
    }
  }
}
```

Existing `content.blog.writing_style` values remain a supported fallback and are mirrored during settings saves. Runtime aliases expose both `CONFIG.CONTENT_*` and the existing `CONFIG.BLOG_*` keys during the transition.

Invalid or missing values fall back independently to `conversational` and `polite`.

## UI
The Blog settings tab exposes two segmented controls:

- 표현 방식: 구어체 / 문어체
- 높임 방식: 존댓말 / 평어(반말)

The UI shows both the expected style description and a live sentence example for the selected combination. Each example conveys the same basic meaning so users can compare the expression and sentence ending directly.

- 구어체 + 존댓말: `직접 써보니 생각보다 편했고, 처음 쓰는 분도 금방 익힐 수 있어요.`
- 구어체 + 평어: `직접 써보니 생각보다 편했고, 처음 써도 금방 익힐 수 있어.`
- 문어체 + 존댓말: `직접 사용해 본 결과 편의성이 높았으며, 처음 사용하는 경우에도 쉽게 익힐 수 있습니다.`
- 문어체 + 평어: `직접 사용해 본 결과 편의성이 높았고, 처음 사용하는 경우에도 쉽게 익힐 수 있다.`

Changes use the existing major settings save flow and are written to `config/config.json`.

## Prompt Application
`src/content/writing-style.js` converts the selected values into concrete Korean writing rules.

- `Core.generateContent` appends the blog rules to the blog writing system prompt for both Naver and WordPress.
- `ShoppingManager` appends shopping-specific rules to the independent shopping prompt for quick, batch, and automatic shopping content.

Shopping content follows the selected expression and speech level, but the anti-fabrication rule remains stronger than a conversational or review-like tone. The AI must not claim that the writer bought or used the product unless such an instruction is explicitly supported by input data.

An explicit instruction for the current post takes precedence over the saved global style.
