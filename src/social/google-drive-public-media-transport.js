const crypto = require('node:crypto');

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';

function createTransportError(code, message, cause) {
    const error = new Error(message);
    error.code = code;
    error.status = 502;
    if (cause) error.cause = cause;
    return error;
}

function normalizePublicUrl(value) {
    let parsed;
    try { parsed = new URL(String(value || '').trim()); } catch (_error) { }
    if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password) {
        throw createTransportError('GOOGLE_DRIVE_MEDIA_URL_INVALID', 'Google Drive가 공개 이미지 주소를 반환하지 않았습니다.');
    }
    return parsed.toString();
}

function buildMultipartBody({ boundary, metadata, buffer, mimeType }) {
    return Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`, 'utf8'),
        Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`, 'utf8'),
        buffer,
        Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
    ]);
}

function createGoogleDrivePublicMediaTransport(options = {}) {
    const { httpClient, getAccessToken, peekStatus, logger } = options;
    if (!httpClient?.post || !httpClient?.get || !httpClient?.delete) throw new Error('Google Drive HTTP client가 필요합니다.');
    if (typeof getAccessToken !== 'function') throw new Error('Google Drive OAuth token provider가 필요합니다.');

    function isAvailable() {
        if (typeof peekStatus !== 'function') return true;
        const status = peekStatus() || {};
        return status.connected === true || ['connected', 'connected_cached'].includes(String(status.state || ''));
    }

    async function accessToken() {
        try {
            return await getAccessToken([DRIVE_FILE_SCOPE]);
        } catch (error) {
            throw createTransportError('GOOGLE_DRIVE_AUTH_REQUIRED', '설정에서 Google 계정을 먼저 연결해 주세요.', error);
        }
    }

    async function remove(item = {}) {
        const id = String(item.id || item.file_id || '').trim();
        if (!id) return false;
        try {
            const token = await accessToken();
            await httpClient.delete(`${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(id)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            logger?.info?.(`🧹 [PublicMedia] Google Drive 임시 이미지 삭제 완료: ${id}`);
            return true;
        } catch (error) {
            logger?.warn?.(`⚠️ [PublicMedia] Google Drive 임시 이미지 삭제 실패: ${error.message}`);
            return false;
        }
    }

    async function upload(input = {}) {
        const buffer = input.buffer;
        const fileName = String(input.file_name || input.fileName || '').trim();
        const mimeType = String(input.mime_type || input.mimeType || '').trim();
        if (!Buffer.isBuffer(buffer) || !buffer.length || !fileName || !mimeType.startsWith('image/')) {
            throw createTransportError('GOOGLE_DRIVE_MEDIA_INPUT_INVALID', 'Google Drive에 올릴 이미지 정보가 올바르지 않습니다.');
        }
        const token = await accessToken();
        const boundary = `bloggenius-${crypto.randomBytes(12).toString('hex')}`;
        const body = buildMultipartBody({
            boundary,
            metadata: {
                name: fileName.slice(0, 240),
                description: String(input.description || 'BlogGenius temporary public media').slice(0, 1000)
            },
            buffer,
            mimeType
        });
        let fileId = '';
        try {
            const uploaded = await httpClient.post(
                `${DRIVE_UPLOAD_ENDPOINT}?uploadType=multipart&fields=id,name,mimeType,webContentLink`,
                body,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': `multipart/related; boundary=${boundary}`,
                        'Content-Length': body.length
                    },
                    maxBodyLength: Infinity,
                    timeout: 60_000
                }
            );
            fileId = String(uploaded?.data?.id || '').trim();
            if (!fileId) throw createTransportError('GOOGLE_DRIVE_MEDIA_UPLOAD_FAILED', 'Google Drive 이미지 업로드 결과를 확인하지 못했습니다.');
            await httpClient.post(
                `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}/permissions?fields=id`,
                { type: 'anyone', role: 'reader', allowFileDiscovery: false },
                {
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    timeout: 30_000
                }
            );
            let webContentLink = String(uploaded?.data?.webContentLink || '').trim();
            if (!webContentLink) {
                const file = await httpClient.get(`${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?fields=id,webContentLink`, {
                    headers: { Authorization: `Bearer ${token}` },
                    timeout: 30_000
                });
                webContentLink = String(file?.data?.webContentLink || '').trim();
            }
            const url = normalizePublicUrl(webContentLink);
            logger?.info?.(`☁️ [PublicMedia] Google Drive 임시 이미지 준비 완료: ${fileName}`);
            return { id: fileId, url, provider: 'google_drive' };
        } catch (error) {
            if (fileId) await remove({ id: fileId });
            if (error?.code && String(error.code).startsWith('GOOGLE_DRIVE_')) throw error;
            throw createTransportError('GOOGLE_DRIVE_MEDIA_UPLOAD_FAILED', 'Google Drive에 임시 이미지를 준비하지 못했습니다.', error);
        }
    }

    return { kind: 'public_media', transport: 'google_drive', isAvailable, upload, remove };
}

module.exports = {
    DRIVE_FILE_SCOPE,
    buildMultipartBody,
    normalizePublicUrl,
    createGoogleDrivePublicMediaTransport
};
