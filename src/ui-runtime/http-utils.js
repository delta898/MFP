function createUiHttpUtils(deps = {}) {
    const {
        fs,
        path,
        Logger,
        currentDir,
        appRoot
    } = deps;

    function resolveUiRoot() {
        const candidates = [
            path.join(currentDir, '..', 'ui'),
            path.join(appRoot || process.cwd(), 'ui')
        ];

        for (const dir of candidates) {
            try {
                if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
                    return dir;
                }
            } catch (e) { }
        }
        return null;
    }

    function jsonMeta(requestId) {
        return {
            requestId,
            timestamp: new Date().toISOString()
        };
    }

    function sendJson(res, requestId, statusCode, payload) {
        if (res.headersSent || res.writableEnded) {
            Logger.warn(`⚠️ [UI][API] 응답이 이미 전송되어 중복 응답을 건너뜁니다. (requestId: ${requestId})`);
            return false;
        }
        res.writeHead(statusCode, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({
            ...payload,
            meta: jsonMeta(requestId)
        }));
        return true;
    }

    function sendSuccess(res, requestId, data, statusCode = 200) {
        return sendJson(res, requestId, statusCode, { success: true, data, error: null });
    }

    function sendError(res, requestId, statusCode, code, message) {
        return sendJson(res, requestId, statusCode, {
            success: false,
            data: null,
            error: { code, message: String(message || '요청 처리 중 오류가 발생했습니다.') }
        });
    }

    function getContentType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.html') return 'text/html; charset=utf-8';
        if (ext === '.css') return 'text/css; charset=utf-8';
        if (ext === '.js') return 'application/javascript; charset=utf-8';
        if (ext === '.json') return 'application/json; charset=utf-8';
        if (ext === '.svg') return 'image/svg+xml';
        if (ext === '.png') return 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
        return 'application/octet-stream';
    }

    function sanitizePathname(pathname) {
        const rawPath = String(pathname || '/')
            .split('?')[0]
            .split('#')[0]
            .replace(/\\/g, '/');
        const segments = [];

        for (const segment of rawPath.split('/')) {
            if (!segment || segment === '.') continue;
            if (segment === '..') {
                segments.pop();
                continue;
            }
            segments.push(segment);
        }

        return segments.join('/');
    }

    function shouldServeUiShell(pathname, safePath) {
        if (pathname === '/') return true;
        if (!safePath) return true;
        return path.extname(safePath) === '';
    }

    function createRequestId() {
        return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function readJsonBody(req, limitBytes = 1024 * 1024) {
        return new Promise((resolve, reject) => {
            let total = 0;
            const chunks = [];
            req.on('data', (chunk) => {
                total += chunk.length;
                if (total > limitBytes) {
                    reject(new Error('요청 본문이 너무 큽니다.'));
                    req.destroy();
                    return;
                }
                chunks.push(chunk);
            });
            req.on('end', () => {
                try {
                    const raw = Buffer.concat(chunks).toString('utf-8').trim();
                    if (!raw) return resolve({});
                    resolve(JSON.parse(raw));
                } catch (e) {
                    reject(new Error('JSON 본문 파싱에 실패했습니다.'));
                }
            });
            req.on('error', reject);
        });
    }

    return {
        resolveUiRoot,
        sendSuccess,
        sendError,
        getContentType,
        sanitizePathname,
        shouldServeUiShell,
        createRequestId,
        readJsonBody
    };
}

module.exports = {
    createUiHttpUtils
};
