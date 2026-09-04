const crypto = require('node:crypto');
const { createCardNewsSourceService } = require('../../card-news/source-service');
const { createCardNewsProject } = require('../../card-news/project');
const { createCardNewsProjectRepository } = require('../../card-news/project-repository');
const { createCardNewsGenerationService } = require('../../card-news/generation-service');
const { normalizeImageMode } = require('../../card-news/generation');
const { createStyleReferenceFetcher } = require('../../content/style-reference-fetcher');
const { parseFeedXml } = require('../../social/feed-entry');

const CARD_NEWS_SOURCE_LIMIT = 30;

function limitArticlesPerPlatform(articles = [], limit = CARD_NEWS_SOURCE_LIMIT) {
    const counts = new Map();
    return articles.filter((article) => {
        const platform = String(article?.source_platform || 'unknown');
        const count = counts.get(platform) || 0;
        if (count >= limit) return false;
        counts.set(platform, count + 1);
        return true;
    });
}

function createApiError(code, message, status = 400, cause) {
    const error = new Error(message);
    error.code = code;
    error.apiCode = code;
    error.status = status;
    if (cause) error.cause = cause;
    return error;
}

function toCardNewsError(error, fallbackCode, fallbackMessage) {
    if (error?.apiCode) return error;
    const code = String(error?.code || fallbackCode).replace(/^STYLE_REFERENCE_/, 'CARD_NEWS_SOURCE_');
    const styleMessage = String(error?.message || '');
    const message = styleMessage
        .replace(/문체 참고 URL/g, '입력한 URL')
        .replace(/참고 URL/g, '입력한 URL')
        .replace(/참고 페이지/g, '입력한 페이지')
        .replace(/분석할 본문/g, '카드뉴스로 만들 본문');
    return createApiError(code, message || fallbackMessage, Number(error?.status || 400), error);
}

function summarizeProject(project = {}) {
    return {
        id: String(project.id || ''),
        title: String(project.title || '새 카드뉴스'),
        status: String(project.status || 'draft'),
        revision: Number(project.revision || 1),
        source_kind: String(project.source_snapshot?.source?.kind || ''),
        source_url: String(project.source_snapshot?.canonical_url || ''),
        source_excerpt: String(project.source_snapshot?.excerpt || ''),
        created_at: String(project.created_at || ''),
        updated_at: String(project.updated_at || '')
    };
}

function isConfiguredAiModel(model = {}) {
    const provider = String(model.provider || '').trim().toLowerCase();
    const code = String(model.code || '').trim();
    if (!code) return false;
    if (provider === 'direct') return Boolean(String(model.base_url || '').trim());
    return Boolean(String(model.api_key || '').trim());
}

function createCardNewsService(deps = {}) {
    const {
        CONFIG = {},
        axios,
        cheerio,
        fs,
        path,
        logger,
        Utils,
        now = () => new Date().toISOString(),
        createId = () => crypto.randomUUID()
    } = deps;

    const fetchFeed = deps.fetchFeed || (async (url) => {
        if (!axios) throw createApiError('CARD_NEWS_FEED_UNAVAILABLE', '블로그 글 목록 조회 기능이 준비되지 않았습니다.', 500);
        const response = await axios.get(url, {
            responseType: 'text',
            timeout: 10000,
            maxRedirects: 5,
            validateStatus: (status) => status >= 200 && status < 300,
            headers: {
                'User-Agent': 'BlogGenius Card News/1.0',
                Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml'
            }
        });
        return parseFeedXml(String(response.data || ''), { feedUrl: url });
    });

    let sourceService = deps.sourceService;
    if (!sourceService) {
        const fetchReference = deps.fetchPublicDocument || createStyleReferenceFetcher({ axios, cheerio });
        sourceService = createCardNewsSourceService({
            fetchFeed,
            fetchPublicDocument: fetchReference,
            now
        });
    }
    const repository = deps.repository || createCardNewsProjectRepository({
        fs,
        path,
        workspaceDir: CONFIG.PATHS?.workspace
    });
    const generationService = deps.generationService || (Utils ? createCardNewsGenerationService({
        fs,
        path,
        workspaceDir: CONFIG.PATHS?.workspace,
        callWritingText: Utils.callWritingText.bind(Utils),
        callWritingImage: Utils.callWritingImage.bind(Utils),
        parseStructuredJsonResponse: Utils.parseStructuredJsonResponse,
        logger,
        now,
        createId
    }) : null);

    async function listSources() {
        try {
            const result = await sourceService.discoverConfiguredArticles(CONFIG);
            return {
                ...result,
                articles: limitArticlesPerPlatform(result.articles)
            };
        } catch (error) {
            logger?.warn?.(`⚠️ [CardNews] 소스 목록 조회 실패: ${error.message}`);
            throw toCardNewsError(error, 'CARD_NEWS_SOURCES_FAILED', '블로그 글 목록을 불러오지 못했습니다.');
        }
    }

    async function previewSource(input = {}) {
        if (!input?.source || typeof input.source !== 'object') {
            throw createApiError('CARD_NEWS_SOURCE_REQUIRED', '카드뉴스로 만들 내용을 선택하거나 입력해 주세요.');
        }
        try {
            return { source_snapshot: await sourceService.resolveSourceSnapshot(input.source) };
        } catch (error) {
            throw toCardNewsError(error, 'CARD_NEWS_SOURCE_PREVIEW_FAILED', '선택한 내용을 확인하지 못했습니다.');
        }
    }

    async function createProject(input = {}) {
        const { source_snapshot: sourceSnapshot } = await previewSource(input);
        const project = createCardNewsProject({
            title: input.title,
            source_snapshot: sourceSnapshot
        }, { createId, now });
        try {
            return { project: summarizeProject(repository.save(project)) };
        } catch (error) {
            throw toCardNewsError(error, 'CARD_NEWS_PROJECT_SAVE_FAILED', '카드뉴스 프로젝트를 저장하지 못했습니다.');
        }
    }

    function listProjects() {
        try {
            return { projects: repository.list().map(summarizeProject) };
        } catch (error) {
            throw toCardNewsError(error, 'CARD_NEWS_PROJECT_LIST_FAILED', '카드뉴스 프로젝트 목록을 불러오지 못했습니다.');
        }
    }

    async function generate(input = {}) {
        if (!generationService) {
            throw createApiError('CARD_NEWS_GENERATION_UNAVAILABLE', '카드뉴스 생성 기능이 준비되지 않았습니다.', 500);
        }
        if (!isConfiguredAiModel(CONFIG.TEXT_MODEL_CONFIG)) {
            throw createApiError('CARD_NEWS_TEXT_MODEL_REQUIRED', '설정에서 글쓰기 AI를 먼저 연결해 주세요.');
        }
        if (normalizeImageMode(input.image_mode) === 'generate' && !isConfiguredAiModel(CONFIG.IMAGE_MODEL_CONFIG)) {
            throw createApiError('CARD_NEWS_IMAGE_MODEL_REQUIRED', '설정에서 이미지 AI를 먼저 연결해 주세요.');
        }
        try {
            return { generation: await generationService.generate(input) };
        } catch (error) {
            throw toCardNewsError(error, 'CARD_NEWS_GENERATION_FAILED', '카드뉴스를 만들지 못했습니다. 설정한 AI 모델을 확인한 뒤 다시 시도해 주세요.');
        }
    }

    function resolveAsset(generationId, fileName) {
        return generationService?.resolveAsset(generationId, fileName) || null;
    }

    return { listSources, previewSource, createProject, listProjects, generate, resolveAsset };
}

module.exports = {
    CARD_NEWS_SOURCE_LIMIT,
    createCardNewsService,
    limitArticlesPerPlatform,
    summarizeProject,
    isConfiguredAiModel
};
