# Blog Writing Style

## Scope
Blog content generation supports two user-controlled Korean writing style axes:

- `writing_mode`: `conversational` or `written`
- `speech_level`: `polite` or `plain`

The default is conversational polite writing.

## Configuration
The persisted configuration lives at:

```json
{
  "content": {
    "blog": {
      "writing_style": {
        "writing_mode": "conversational",
        "speech_level": "polite"
      }
    }
  }
}
```

Invalid or missing values fall back independently to `conversational` and `polite`.

## UI
The Blog settings tab exposes two segmented controls:

- 표현 방식: 구어체 / 문어체
- 높임 방식: 존댓말 / 평어(반말)

The UI shows the expected style for the selected combination. Changes use the existing major settings save flow and are written to `config/config.json`.

## Prompt Application
`src/content/writing-style.js` converts the selected values into concrete Korean writing rules. `Core.generateContent` appends those rules to the blog writing system prompt for both Naver and WordPress blog content.

An explicit instruction for the current post takes precedence over the saved global style.
