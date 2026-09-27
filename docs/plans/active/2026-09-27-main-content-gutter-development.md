# Main Content Gutter Development

- Branch: `codex/feat/main-content-gutter`
- Base/parent branch: `dev`
- Start date: 2026-09-27
- Status: Implemented; awaiting user visual review

## User need and goal

Reduce the visually excessive horizontal whitespace around the client area after narrowing the left navigation. The user identified that the remaining gap is the shared main-content gutter, not the sidebar width itself.

## Scope and non-goals

In scope:

- Reduce the desktop horizontal padding of the shared `.main` shell from 40px to 20px.
- Preserve the existing 20px horizontal padding at viewport widths of 960px and below, plus the 14px override in mobile quick mode.
- Tighten the dashboard's readiness/overview and overview-card gaps, plus the Card News two-panel layout gap, by one spacing token without changing global spacing.
- Verify shared-shell layout contracts and browser regression.

Out of scope:

- Changing sidebar width or individual page max-widths.
- Global spacing-token changes or unrelated component redesign.
- Changing responsive breakpoints or mobile spacing.

## Design and decisions

- `.main` is the shared shell container, so the desktop adjustment intentionally applies across pages.
- Use a clear but controlled reduction (20px per side) to reclaim 40px of content width while preserving a consistent gutter.
- Narrow viewports keep the existing responsive gutters: 20px normally and 14px in mobile quick mode.
- Screenshots made clear that the dashboard and Card News gaps felt more pronounced after reclaiming client width. Although the shared gutter change does not alter their gap values, tighten those specific layout gaps from `--ui-space-5` to `--ui-space-4`; avoid changing the shared token, which would affect unrelated screens.
- User owns final visual acceptance across representative pages.

## Implementation and verification

- Reduced shared desktop `.main` horizontal padding from 40px to 20px after the user's visual review found the first 8px-per-side reduction too subtle.
- Preserved the existing standard responsive gutter (20px at widths up to 960px) and mobile quick-mode gutter (14px).
- Added a CSS structure contract for the desktop and responsive gutter values.
- Focused structure tests passed: `node --test scripts/ui-style-structure.test.js` (12/12).
- Browser smoke passed: `npm run test:ui-browser` (519 fixture requests; no page or console errors); verified computed desktop padding is 20px per side and mobile quick-mode left padding remains 14px.
- Reduced dashboard readiness-to-overview spacing and its two-card grid gap to `--ui-space-4`; reduced the Card News two-panel layout gap to the same token. Added static contract assertions for these targeted values.
- Focused style structure test rerun after the targeted spacing update: `node --test scripts/ui-style-structure.test.js` passed (13/13).
- Final visual review remains with the user.

## Remaining work and risks

- Check for unintended wrapping or density changes across dashboard, settings, Card News, and other shared-shell pages.
- Automated checks cannot replace the user's visual review at their normal display size.
