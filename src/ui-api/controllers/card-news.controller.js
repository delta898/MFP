const { createControllerErrorResponder, sendMethodNotAllowed } = require('./controller-common');

function createCardNewsController(deps = {}) {
    const { service, sendSuccess, sendError, fs } = deps;
    const toErrorResponse = createControllerErrorResponder(sendError, { defaultStatus: 500 });

    return {
        async sources({ requestId, method, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.listSources());
            } catch (error) {
                return toErrorResponse(res, requestId, 'CARD_NEWS_SOURCES_FAILED', '블로그 글 목록을 불러오지 못했습니다.', error);
            }
        },

        async preview({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.previewSource(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'CARD_NEWS_SOURCE_PREVIEW_FAILED', '원문 미리보기를 만들지 못했습니다.', error);
            }
        },

        async generate({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.generate(requestBody || {}), 201);
            } catch (error) {
                return toErrorResponse(res, requestId, 'CARD_NEWS_GENERATION_FAILED', '카드뉴스를 만들지 못했습니다.', error);
            }
        },

        async asset({ requestId, method, pathname, searchParams, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            const match = String(pathname || '').match(/^\/api\/v1\/card-news\/assets\/([^/]+)\/([^/]+)$/);
            let generationId = '';
            let fileName = '';
            try {
                generationId = decodeURIComponent(match?.[1] || '');
                fileName = decodeURIComponent(match?.[2] || '');
            } catch (_error) { }
            const asset = service.resolveAsset(generationId, fileName);
            if (!asset || !fs) {
                return sendError(res, requestId, 404, 'CARD_NEWS_ASSET_NOT_FOUND', '카드 이미지를 찾지 못했습니다.');
            }
            const headers = {
                'Content-Type': asset.mime_type,
                'Cache-Control': 'private, max-age=3600'
            };
            if (searchParams?.get('download') === '1') {
                headers['Content-Disposition'] = `attachment; filename="${asset.file_name.replace(/["\\]/g, '')}"`;
            }
            res.writeHead(200, headers);
            fs.createReadStream(asset.path).pipe(res);
            return true;
        },

        async projects({ requestId, method, requestBody, res }) {
            if (method === 'GET') {
                try {
                    return sendSuccess(res, requestId, service.listProjects());
                } catch (error) {
                    return toErrorResponse(res, requestId, 'CARD_NEWS_PROJECT_LIST_FAILED', '카드뉴스 프로젝트 목록을 불러오지 못했습니다.', error);
                }
            }
            if (method === 'POST') {
                try {
                    return sendSuccess(res, requestId, await service.createProject(requestBody || {}), 201);
                } catch (error) {
                    return toErrorResponse(res, requestId, 'CARD_NEWS_PROJECT_CREATE_FAILED', '카드뉴스 프로젝트를 만들지 못했습니다.', error);
                }
            }
            return sendMethodNotAllowed(sendError, res, requestId);
        }
    };
}

module.exports = { createCardNewsController };
