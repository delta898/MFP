const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../ui/scripts/features/card-news/signature-requests.js'), 'utf8');

function createContext() {
    const elements = {
        'card-news-signature-enabled': { checked: true },
        'card-news-signature': { disabled: false, value: 'My Signature' }
    };
    const context = {
        URLSearchParams,
        localStorage: { getItem: () => null },
        document: { getElementById: (id) => elements[id] || null },
        cardNewsViewState: { signaturePreviewEffectiveSignature: 'My Signature', signaturePreviewResolved: true }
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    return context;
}

test('Card News signature URL helper leaves data and blob URLs intact', () => {
    const context = createContext();
    const dataUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    const blobUrl = 'blob:http://localhost/1234';

    assert.equal(context.cardNewsUrlWithSignature(dataUrl), dataUrl);
    assert.equal(context.cardNewsUrlWithSignature(blobUrl), blobUrl);
});

test('Card News signature URL helper adds signature policy only to request URLs', () => {
    const context = createContext();

    assert.equal(
        context.cardNewsUrlWithSignature('/api/v1/card-news/image?job_id=abc#preview'),
        '/api/v1/card-news/image?job_id=abc&signature=My+Signature&expected_signature=My+Signature#preview'
    );
});
