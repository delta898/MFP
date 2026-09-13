const DESIGN_SYSTEM_VIEW_IDS = Object.freeze([
  'view-blog-next',
  'view-settings-next',
  'view-dashboard-beta',
  'view-card-news',
  'view-shopping',
  'view-social',
  'view-account',
  'view-help'
]);

const CONTRACTS = Object.freeze({
  LEGACY_TOKEN_FREE: 'legacy-token-free',
  STRICT_STYLE: 'strict-style',
  TYPOGRAPHY: 'typography',
  MOTION: 'motion'
});

function target(path, contracts, options = {}) {
  return Object.freeze({
    path,
    contracts: Object.freeze([...contracts]),
    ...options
  });
}

const PRODUCT_CONTRACTS = Object.freeze([
  CONTRACTS.STRICT_STYLE,
  CONTRACTS.TYPOGRAPHY,
  CONTRACTS.MOTION
]);

const DESIGN_SYSTEM_STYLE_TARGETS = Object.freeze([
  target('ui/styles/base/foundation.css', [CONTRACTS.LEGACY_TOKEN_FREE], {
    strictStyleExclusion: 'Accessibility and shared hidden utilities intentionally require !important.'
  }),
  target('ui/styles/layout/shell-navigation.css', [CONTRACTS.LEGACY_TOKEN_FREE], {
    strictStyleExclusion: 'Shell visibility utilities remain an explicit cascade exception.'
  }),
  target('ui/styles/layout/responsive.css', [CONTRACTS.LEGACY_TOKEN_FREE], {
    strictStyleExclusion: 'This module still contains frozen compatibility-only mobile rules.'
  }),
  target('ui/styles/layout/responsive-shell.css', [CONTRACTS.LEGACY_TOKEN_FREE], {
    strictStyleExclusion: 'This module still contains frozen compatibility-only shell rules.'
  }),
  target('ui/styles/layout/responsive-forms.css', [CONTRACTS.LEGACY_TOKEN_FREE], {
    strictStyleExclusion: 'This module still contains frozen compatibility-only form rules.'
  }),
  target('ui/styles/layout/responsive-blog-quick.css', [CONTRACTS.LEGACY_TOKEN_FREE], {
    strictStyleExclusion: 'This module still contains frozen compatibility-only Blog quick mode rules.'
  }),
  target('ui/styles/layout/responsive-footer.css', [CONTRACTS.LEGACY_TOKEN_FREE], {
    strictStyleExclusion: 'This module still contains frozen compatibility-only footer rules.'
  }),
  target('ui/styles/components/clock.css', [CONTRACTS.LEGACY_TOKEN_FREE], {
    strictStyleExclusion: 'Seasonal, Pomodoro, and clock identity colors are intentional local accents.'
  }),
  target('ui/styles/components/clock-pomodoro-controls.css', [CONTRACTS.LEGACY_TOKEN_FREE], {
    strictStyleExclusion: 'Pomodoro controls retain intentional local identity colors.'
  }),
  target('ui/styles/components/clock-pomodoro-faces.css', [CONTRACTS.LEGACY_TOKEN_FREE], {
    strictStyleExclusion: 'Pomodoro faces retain intentional local identity colors and shadow recipes.'
  }),
  target('ui/styles/components/clock-celebration.css', [CONTRACTS.LEGACY_TOKEN_FREE], {
    strictStyleExclusion: 'Celebration feedback retains intentional transient accent colors.'
  }),
  target('ui/styles/components/clock-status.css', [CONTRACTS.LEGACY_TOKEN_FREE], {
    strictStyleExclusion: 'Clock status and split displays retain intentional local identity styling.'
  }),
  target('ui/styles/components/app-chrome.css', [CONTRACTS.LEGACY_TOKEN_FREE, CONTRACTS.TYPOGRAPHY, CONTRACTS.MOTION], {
    strictStyleExclusion: 'The global update banner still owns one legacy shadow and visibility override.'
  }),
  target('ui/styles/components/feedback.css', PRODUCT_CONTRACTS),
  target('ui/styles/components/global-publishing-status.css', [CONTRACTS.TYPOGRAPHY, CONTRACTS.MOTION], {
    strictStyleExclusion: 'Publishing indicators intentionally own state-ring geometry.'
  }),
  target('ui/styles/patterns/actions.css', [...PRODUCT_CONTRACTS, CONTRACTS.LEGACY_TOKEN_FREE]),
  target('ui/styles/patterns/selection-controls.css', PRODUCT_CONTRACTS),
  target('ui/styles/patterns/select-shell.css', PRODUCT_CONTRACTS),
  target('ui/styles/patterns/tab-navigation.css', [...PRODUCT_CONTRACTS, CONTRACTS.LEGACY_TOKEN_FREE]),
  target('ui/styles/patterns/overview-card.css', PRODUCT_CONTRACTS),
  target('ui/styles/patterns/settings-card.css', PRODUCT_CONTRACTS),
  target('ui/styles/patterns/transaction-dialog.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/account.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/social.css', [CONTRACTS.TYPOGRAPHY, CONTRACTS.MOTION], {
    strictStyleExclusion: 'The editor focus ring retains its existing bounded raw recipe until the shared focus contract migration.'
  }),
  target('ui/styles/features/social-media.css', [CONTRACTS.TYPOGRAPHY, CONTRACTS.MOTION], {
    strictStyleExclusion: 'Inverse image controls and the visually hidden file input retain bounded compatibility declarations.'
  }),
  target('ui/styles/features/social-actions.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/social-density.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/social-surfaces.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/dashboard-beta.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/dashboard-beta-responsive.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/help.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/shopping-connect.css', [CONTRACTS.TYPOGRAPHY, CONTRACTS.MOTION], {
    strictStyleExclusion: 'The preview hidden-state utility intentionally overrides composed display rules.'
  }),
  target('ui/styles/features/shopping-image-settings.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/continuous-publishing.css', [...PRODUCT_CONTRACTS, CONTRACTS.LEGACY_TOKEN_FREE]),
  target('ui/styles/features/continuous-publishing-queue.css', [...PRODUCT_CONTRACTS, CONTRACTS.LEGACY_TOKEN_FREE]),
  target('ui/styles/features/continuous-publishing-automation.css', [...PRODUCT_CONTRACTS, CONTRACTS.LEGACY_TOKEN_FREE]),
  target('ui/styles/features/continuous-publishing-drafts.css', [...PRODUCT_CONTRACTS, CONTRACTS.LEGACY_TOKEN_FREE]),
  target('ui/styles/features/continuous-publishing-responsive.css', [...PRODUCT_CONTRACTS, CONTRACTS.LEGACY_TOKEN_FREE]),
  target('ui/styles/features/continuous-publishing-interactions.css', [...PRODUCT_CONTRACTS, CONTRACTS.LEGACY_TOKEN_FREE]),
  target('ui/styles/features/continuous-publishing-usability.css', [...PRODUCT_CONTRACTS, CONTRACTS.LEGACY_TOKEN_FREE]),
  target('ui/styles/features/blog-next-baseline.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/blog-next-panel-anatomy.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/blog-next-quick-flow.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/blog-next-smart-comment.css', [...PRODUCT_CONTRACTS, CONTRACTS.LEGACY_TOKEN_FREE]),
  target('ui/styles/features/card-news.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/card-news-management.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/card-news-results.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/settings-next.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/settings-next-appearance.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/recommendations.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/recommendation-center.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/discovery-modal.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/discovery-keyword-research.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/discovery-responsive.css', PRODUCT_CONTRACTS),
  target('ui/styles/features/discovery-writing-assists.css', PRODUCT_CONTRACTS)
]);

function getDesignSystemStylePaths(contract) {
  return DESIGN_SYSTEM_STYLE_TARGETS
    .filter((entry) => entry.contracts.includes(contract))
    .map((entry) => entry.path);
}

module.exports = {
  CONTRACTS,
  DESIGN_SYSTEM_VIEW_IDS,
  DESIGN_SYSTEM_STYLE_TARGETS,
  getDesignSystemStylePaths
};
