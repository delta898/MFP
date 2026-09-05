const { createControllerErrorResponder, sendMethodNotAllowed } = require('./controller-common');

function createCardNewsController(deps = {}) {
    const { service, sendSuccess, sendError, fs } = deps;
    const toErrorResponse = createControllerErrorResponder(sendError, { defaultStatus: 500 });
    const encodeHeaderFileName = (value) => encodeURIComponent(String(value || ''))
        .replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

    return {
        async sources({ requestId, method, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.listSources());
            } catch (error) {
                return toErrorResponse(res, requestId, 'CARD_NEWS_SOURCES_FAILED', '블로그 글 목록을 불러오지 못했습니다.', error);
            }
        },

        async managed({ requestId, method, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.listManagedItems());
            } catch (error) {
                return toErrorResponse(res, requestId, 'CARD_NEWS_MANAGED_LIST_FAILED', '만든 카드뉴스 목록을 불러오지 못했습니다.', error);
            }
        },

        async generation({ requestId, method, pathname, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            const match = String(pathname || '').match(/^\/api\/v1\/card-news\/generations\/([^/]+)$/);
            let generationId = '';
            try { generationId = decodeURIComponent(match?.[1] || ''); } catch (_error) { }
            try {
                return sendSuccess(res, requestId, service.getGeneration(generationId));
            } catch (error) {
                return toErrorResponse(res, requestId, 'CARD_NEWS_GENERATION_NOT_FOUND', '카드뉴스 결과를 찾지 못했습니다.', error);
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

        async generateImages({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.generateImages(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'CARD_NEWS_IMAGE_GENERATION_FAILED', '카드 이미지를 만들지 못했습니다.', error);
            }
        },

        async importImage({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.importLocalImage(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'CARD_NEWS_IMAGE_IMPORT_FAILED', '선택한 이미지를 적용하지 못했습니다.', error);
            }
        },

        async previewZip({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, service.previewZip(requestBody || {}));
            } catch (error) {
                return toErrorResponse(res, requestId, 'CARD_NEWS_ZIP_PREVIEW_FAILED', 'ZIP 파일을 확인하지 못했습니다.', error);
            }
        },

        async importZip({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.importZip(requestBody || {}), 201);
            } catch (error) {
                return toErrorResponse(res, requestId, 'CARD_NEWS_ZIP_IMPORT_FAILED', 'ZIP 카드뉴스를 가져오지 못했습니다.', error);
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

        async exportBundle({ requestId, method, pathname, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            const match = String(pathname || '').match(/^\/api\/v1\/card-news\/exports\/([^/]+)\.zip$/);
            let generationId = '';
            try {
                generationId = decodeURIComponent(match?.[1] || '');
            } catch (_error) { }
            try {
                const bundle = service.createExportBundle(generationId);
                res.writeHead(200, {
                    'Content-Type': bundle.mime_type,
                    'Content-Length': bundle.buffer.length,
                    'Content-Disposition': `attachment; filename="${bundle.fallback_file_name.replace(/["\\]/g, '')}"; filename*=UTF-8''${encodeHeaderFileName(bundle.file_name)}`,
                    'Cache-Control': 'no-store'
                });
                res.end(bundle.buffer);
                return true;
            } catch (error) {
                return toErrorResponse(res, requestId, 'CARD_NEWS_EXPORT_FAILED', '전체 이미지를 준비하지 못했습니다.', error);
            }
        },

        async publishingConfig({ requestId, method, searchParams, res }) {
            if (method !== 'GET') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, service.getPublishingConfig(searchParams?.get('generation_id') || ''));
            } catch (error) {
                return toErrorResponse(res, requestId, 'CARD_NEWS_PUBLISHING_CONFIG_FAILED', '카드뉴스 발행 설정을 확인하지 못했습니다.', error);
            }
        },

        async publish({ requestId, method, requestBody, res }) {
            if (method !== 'POST') return sendMethodNotAllowed(sendError, res, requestId);
            try {
                return sendSuccess(res, requestId, await service.publish({ ...(requestBody || {}), request_id: requestId }));
            } catch (error) {
                return toErrorResponse(res, requestId, 'CARD_NEWS_PUBLISH_FAILED', '카드뉴스를 Buffer로 발행하지 못했습니다.', error);
            }
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
