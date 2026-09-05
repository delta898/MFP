const test = require('node:test');
const assert = require('node:assert/strict');
const {
    DRIVE_FILE_SCOPE,
    buildMultipartBody,
    createGoogleDrivePublicMediaTransport
} = require('./google-drive-public-media-transport');

test('Google Drive public media upload uses drive.file, anyone reader, and the returned direct URL', async () => {
    const calls = [];
    const transport = createGoogleDrivePublicMediaTransport({
        peekStatus: () => ({ connected: true }),
        getAccessToken: async (scopes) => {
            assert.deepEqual(scopes, [DRIVE_FILE_SCOPE]);
            return 'access-token';
        },
        httpClient: {
            async post(url, body, options) {
                calls.push({ method: 'post', url, body, options });
                if (url.includes('/permissions')) return { data: { id: 'permission-1' } };
                return { data: { id: 'drive-file-1', webContentLink: 'https://drive.usercontent.google.com/download?id=drive-file-1&export=download' } };
            },
            async get() { throw new Error('unexpected get'); },
            async delete() { calls.push({ method: 'delete' }); return { status: 204 }; }
        }
    });
    assert.equal(transport.isAvailable(), true);
    const result = await transport.upload({
        buffer: Buffer.from('image-bytes'),
        file_name: 'card-01.png',
        mime_type: 'image/png'
    });
    assert.deepEqual(result, {
        id: 'drive-file-1',
        url: 'https://drive.usercontent.google.com/download?id=drive-file-1&export=download',
        provider: 'google_drive'
    });
    assert.match(String(calls[0].options.headers['Content-Type']), /^multipart\/related; boundary=/);
    assert.match(calls[0].body.toString('utf8'), /card-01\.png/);
    assert.deepEqual(calls[1].body, { type: 'anyone', role: 'reader', allowFileDiscovery: false });
    assert.equal(await transport.remove(result), true);
});

test('Google Drive public media removes an uploaded file when public sharing fails', async () => {
    const deleted = [];
    const transport = createGoogleDrivePublicMediaTransport({
        getAccessToken: async () => 'access-token',
        httpClient: {
            async post(url) {
                if (url.includes('/permissions')) throw new Error('permission denied');
                return { data: { id: 'drive-file-2' } };
            },
            async get() { return { data: {} }; },
            async delete(url) { deleted.push(url); return { status: 204 }; }
        }
    });
    await assert.rejects(
        () => transport.upload({ buffer: Buffer.from('image'), file_name: 'card.png', mime_type: 'image/png' }),
        (error) => error.code === 'GOOGLE_DRIVE_MEDIA_UPLOAD_FAILED'
    );
    assert.deepEqual(deleted, ['https://www.googleapis.com/drive/v3/files/drive-file-2']);
});

test('Google Drive public media reports missing connection before upload', async () => {
    const transport = createGoogleDrivePublicMediaTransport({
        peekStatus: () => ({ connected: false, state: 'disconnected' }),
        getAccessToken: async () => { throw new Error('not connected'); },
        httpClient: { post() {}, get() {}, delete() {} }
    });
    assert.equal(transport.isAvailable(), false);
    await assert.rejects(
        () => transport.upload({ buffer: Buffer.from('image'), file_name: 'card.png', mime_type: 'image/png' }),
        (error) => error.code === 'GOOGLE_DRIVE_AUTH_REQUIRED' && /Google 계정/.test(error.message)
    );
});

test('multipart body keeps metadata and binary payload in separate parts', () => {
    const body = buildMultipartBody({
        boundary: 'boundary',
        metadata: { name: 'card.png' },
        buffer: Buffer.from([0, 1, 2, 3]),
        mimeType: 'image/png'
    });
    assert.match(body.toString('latin1'), /Content-Type: application\/json/);
    assert.match(body.toString('latin1'), /Content-Type: image\/png/);
    assert.equal(body.includes(Buffer.from([0, 1, 2, 3])), true);
});
