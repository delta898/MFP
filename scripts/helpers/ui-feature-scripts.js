const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');

function readUiModules(paths) {
  return paths.map((relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')).join('\n');
}

function readBlogNextQueueScripts() {
  return readUiModules([
    'ui/scripts/features/blog-next/quick-queue.js',
    'ui/scripts/features/blog-next/queue-management.js'
  ]);
}

function readCardNewsPreviewScripts() {
  return readUiModules([
    'ui/scripts/features/card-news/source-preview.js',
    'ui/scripts/features/card-news/signature-requests.js',
    'ui/scripts/features/card-news/generation-workflow.js'
  ]);
}

module.exports = { readUiModules, readBlogNextQueueScripts, readCardNewsPreviewScripts };
