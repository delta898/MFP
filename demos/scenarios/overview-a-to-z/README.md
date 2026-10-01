# BlogGenius overview demo

## Purpose

Fast-cut, headed UI overview for first-time viewers. The intended feel is a quick A-to-Z tour, not a detailed tutorial.

## Scene order

1. Dashboard and sidebar
2. Focus timer
3. Three appearance styles across Dashboard, Blog, and Card News
4. Blog trends
5. AI topic recommendation
6. Keyword exploration
7. Block manuscript editor and image block
8. Naver temporary-save settings
9. Card News source/result and generated-image layout
10. SNS copy and additional image request
11. Branded fireworks-style outro

Short Korean captions are rendered as lower thirds. The finale uses a visual animation rather than performing an app update.

## Safety and current limits

This is a local fixture-backed demo, not a production recording. External origins are blocked, AI outputs are fixture/demo visuals, and Naver publishing, paid generation, and self-update are not executed. The trends screen is likewise fixture data; use a separately approved production recording if live trend results are required.

## Generate

From the repository root, launch the UI browser smoke script in headed mode with `UI_BROWSER_DEMO_SCENARIO=overview-a-to-z` and `UI_BROWSER_DEMO_VIDEO_PATH` set to the destination video path. The output is a Playwright WebM recording; the existing `sidebar-style` scenario remains available.

Generated recordings should be kept alongside their scenario only when intentionally retained for review; do not commit them by default.
