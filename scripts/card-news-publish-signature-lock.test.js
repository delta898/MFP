const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

test('Card News captures preview-bound signature values before locking publish controls', () => {
  const publishing = fs.readFileSync(
    path.join(repoRoot, 'ui/scripts/features/card-news/publishing.js'),
    'utf8'
  );
  const publishFlow = publishing.slice(
    publishing.indexOf('async function publishCardNews()'),
    publishing.indexOf('\nasync function ', publishing.indexOf('async function publishCardNews()') + 1)
  );

  assert.match(publishFlow, /ensureCardNewsSignaturePreviewCurrent\(\)[\s\S]*const signature = getCardNewsSignatureForRequest\(\);[\s\S]*const expectedSignature = cardNewsViewState\.signaturePreviewEffectiveSignature;[\s\S]*const previewToken = cardNewsViewState\.signaturePreviewToken;[\s\S]*setCardNewsPublishing\(true\);/);
  assert.match(publishFlow, /signature,[\s\S]*expected_signature: expectedSignature,[\s\n]*preview_token: previewToken/);
});
