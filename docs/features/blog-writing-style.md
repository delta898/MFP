# Legacy Writing Style Compatibility

The former `writing_mode` and `speech_level` settings now belong to the selected global content writing profile under `common.voice`. Their current UI, persistence, precedence and blog/shopping projection are documented in [Content Writing Profiles](./content-writing-profiles.md).

Legacy `content.writing_style` and `content.blog.writing_style` values remain migration inputs. At startup, a non-default legacy combination seeds a complete custom profile; runtime compatibility aliases continue to expose `CONFIG.CONTENT_*` and `CONFIG.BLOG_*` values to older consumers.

New code must read the selected `CONFIG.CONTENT_WRITING_PROFILE` through a blog or shopping projection. It must not add new behavior to the legacy two-axis adapter or persist new profile fields in `config/config.json`.
