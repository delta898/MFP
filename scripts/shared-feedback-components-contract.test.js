const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('status and release badges have separate shared semantic contracts', () => {
  const feedback = read('ui/styles/components/feedback.css');
  const settings = read('ui/partials/views/settings-next.html');
  const settingsStyle = read('ui/styles/features/settings-next.css');
  const settingsRuntime = `${read('ui/scripts/features/settings-next/shell.js')}\n${read('ui/scripts/features/settings-next/ai-model-roles.js')}`;

  assert.doesNotMatch(settings, /class="ui-release-badge">Beta<\/span>/);
  assert.doesNotMatch(settings, /settings-next-beta-badge|class="settings-next-status"/);
  assert.match(settings, /class="ui-status-badge" data-state="neutral"/);
  assert.doesNotMatch(settingsStyle, /\.settings-next-(?:beta-badge|status)(?:\s|\[|\{)/);
  assert.match(settingsRuntime, /dataset\.state = tone/g);
  assert.doesNotMatch(settingsRuntime, /(?:status|el)\.dataset\.tone = tone/);
  assert.match(feedback, /\.ui-release-badge\s*\{[^}]*var\(--ui-action-primary-soft\)/s);
  assert.match(feedback, /\[data-state="success"\]/);
  assert.match(feedback, /\[data-state="warning"\]/);
  assert.match(feedback, /\[data-state="error"\]/);
});

test('active surfaces use shared loading action and standalone spinner primitives', () => {
  const feedback = read('ui/styles/components/feedback.css');
  const social = read('ui/partials/views/social.html');
  const shopping = read('ui/partials/views/shopping.html');
  const cardNews = read('ui/partials/views/card-news.html');
  const dashboard = read('ui/partials/views/dashboard-beta.html');
  const cardNewsRuntime = read('ui/scripts/features/card-news/source-preview.js');
  const featureStyles = [
    'ui/styles/features/social.css',
    'ui/styles/features/social-media.css',
    'ui/styles/features/social-actions.css',
    'ui/styles/features/social-density.css',
    'ui/styles/features/shopping-connect.css',
    'ui/styles/features/card-news.css',
    'ui/styles/features/card-news-results.css',
    'ui/styles/features/recommendation-center.css'
  ].map(read).join('\n');

  assert.match(feedback, /button\.ui-loading-action\.is-loading::before/);
  assert.match(feedback, /\.ui-spinner\.ui-spinner-md/);
  assert.match(feedback, /\.ui-spinner\.ui-spinner-lg/);
  assert.match(social, /id="manual-sns-publish-btn" class="primary ui-loading-action"/);
  assert.match(shopping, /class="ui-spinner ui-spinner-md ui-spinner-accent"/);
  assert.equal((cardNews.match(/ui-loading-action/g) || []).length, 3);
  assert.match(cardNews, /class="ui-workflow-feedback ui-loading-indicator"/);
  assert.match(dashboard, /data-recommendation-refresh[^>]*data-idle-label=/);
  assert.match(dashboard, /class="secondary compact ui-loading-action"/);
  assert.match(cardNewsRuntime, /class="ui-spinner ui-spinner-lg ui-spinner-accent"/);
  assert.doesNotMatch(featureStyles, /(?:shopping-quick-preview-spinner|card-news-image-working-spinner)|is-loading::before/);
});

test('full empty states share one anatomy while transient placeholders stay contextual', () => {
  const feedback = read('ui/styles/components/feedback.css');
  const blogView = read('ui/partials/views/blog-next.html');
  const blogQueue = read('ui/scripts/features/blog-next/queue-ui.js');
  const cardView = read('ui/partials/views/card-news.html');
  const cardManagement = read('ui/scripts/features/card-news/management.js');
  const socialRuntime = read('ui/scripts/features/social/manual-composer.js');
  const blogStyle = read('ui/styles/features/continuous-publishing.css');
  const cardStyle = read('ui/styles/features/card-news.css');
  const socialStyle = [
    'ui/styles/features/social.css',
    'ui/styles/features/social-media.css',
    'ui/styles/features/social-actions.css',
    'ui/styles/features/social-density.css'
  ].map(read).join('\n');

  assert.match(feedback, /\.ui-empty-state\s*\{[^}]*var\(--ui-border-default\)[^}]*var\(--ui-surface-muted\)/s);
  assert.match(feedback, /\.ui-empty-state\[data-state="error"\]/);
  assert.match(blogView, /blog-next-smart-comment-empty ui-empty-state/);
  assert.match(blogQueue, /className = 'blog-next-empty-state ui-empty-state'/);
  assert.match(blogQueue, /empty\.dataset\.state = state/);
  assert.match(cardView, /card-news-empty-state ui-empty-state/);
  assert.match(cardManagement, /card-news-empty-state ui-empty-state/);
  assert.match(socialRuntime, /className = 'social-channel-empty ui-empty-state'/);
  assert.doesNotMatch(blogStyle, /\.blog-next-empty-state\s*\{/);
  assert.doesNotMatch(cardStyle, /\.card-news-empty-state\s*\{/);
  assert.doesNotMatch(socialStyle, /\.social-channel-empty\s*\{[^}]*(?:display|color|font-size)/s);
});
