const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
    CARD_NEWS_GENERATION_SCHEMA_VERSION,
    createVariation,
    normalizeGenerationSettings,
    normalizeImageMode,
    validateSourceSnapshot,
    buildCardPlanPrompt,
    normalizeCardPlan,
    buildSlideImagePrompt
} = require('./generation');

function safeGenerationId(value) {
    const normalized = String(value || '').trim();
    return /^[a-zA-Z0-9_-]{8,100}$/.test(normalized) ? normalized : '';
}

function safeAssetName(value) {
    const normalized = String(value || '').trim();
    return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/.test(normalized) ? normalized : '';
}

function writeJsonAtomic(fileSystem, pathApi, filePath, payload) {
    fileSystem.mkdirSync(pathApi.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fileSystem.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fileSystem.renameSync(temporary, filePath);
}

function toPublicGenerationResult(generation) {
    return {
        schema_version: generation.schema_version,
        id: generation.id,
        title: generation.title,
        status: generation.status,
        image_mode: generation.image_mode,
        settings: generation.settings,
        variation: generation.variation,
        created_at: generation.created_at,
        completed_at: generation.completed_at,
        cards: generation.cards.map((card) => ({
            index: card.index,
            headline: card.headline,
            body: card.body,
            image_prompt: card.image_prompt,
            image_url: card.file_name
                ? `/api/v1/card-news/assets/${encodeURIComponent(generation.id)}/${encodeURIComponent(card.file_name)}`
                : '',
            download_url: card.file_name
                ? `/api/v1/card-news/assets/${encodeURIComponent(generation.id)}/${encodeURIComponent(card.file_name)}?download=1`
                : ''
        }))
    };
}

function createCardNewsGenerationService(options = {}) {
    const fileSystem = options.fs || fs;
    const pathApi = options.path || path;
    const workspaceDir = String(options.workspaceDir || '').trim();
    const callWritingText = options.callWritingText;
    const callWritingImage = options.callWritingImage;
    const parseStructuredJsonResponse = options.parseStructuredJsonResponse;
    const logger = options.logger;
    const now = options.now || (() => new Date().toISOString());
    const createId = options.createId || (() => crypto.randomUUID());

    if (!workspaceDir) throw new Error('카드뉴스 결과 workspace 경로가 필요합니다.');
    if (typeof callWritingText !== 'function' || typeof parseStructuredJsonResponse !== 'function') {
        throw new Error('카드뉴스 AI 생성 의존성이 올바르지 않습니다.');
    }

    const exportRoot = pathApi.join(workspaceDir, 'card-news', 'exports');

    async function generate(input = {}) {
        const snapshot = validateSourceSnapshot(input.source_snapshot);
        const settings = normalizeGenerationSettings(input.settings);
        const imageMode = normalizeImageMode(input.image_mode);
        const id = safeGenerationId(input.id) || safeGenerationId(createId()) || crypto.randomUUID();
        const variation = createVariation(input.variation_seed || createId());
        const outputDir = pathApi.join(exportRoot, id);
        const manifestPath = pathApi.join(outputDir, 'manifest.json');
        fileSystem.mkdirSync(outputDir, { recursive: true });

        const generation = {
            schema_version: CARD_NEWS_GENERATION_SCHEMA_VERSION,
            id,
            title: snapshot.title,
            status: 'generating',
            image_mode: imageMode,
            settings,
            variation,
            source: {
                kind: String(snapshot.source?.kind || ''),
                title: snapshot.title,
                canonical_url: String(snapshot.canonical_url || '')
            },
            cards: [],
            created_at: now(),
            completed_at: ''
        };
        writeJsonAtomic(fileSystem, pathApi, manifestPath, generation);

        try {
            logger?.info?.(`🎴 [CardNews] 카드 구성 생성 시작 (${settings.slide_count}장, ${settings.aspect_ratio})`);
            const planRaw = await callWritingText(
                buildCardPlanPrompt(snapshot, settings, variation),
                2,
                {
                    usageLabel: '카드뉴스 구성 AI',
                    maxTokens: 3200,
                    temperature: 0.8,
                    responseMimeType: 'application/json'
                }
            );
            const plan = normalizeCardPlan(parseStructuredJsonResponse(planRaw), settings);
            generation.title = plan.set_title || snapshot.title;
            generation.art_direction = plan.art_direction;
            generation.cards = plan.cards.map((card) => ({
                index: card.index,
                headline: card.headline,
                body: card.body,
                scene_prompt: card.image_prompt,
                image_prompt: buildSlideImagePrompt(card, plan, settings, variation),
                file_name: ''
            }));
            writeJsonAtomic(fileSystem, pathApi, manifestPath, generation);

            if (imageMode === 'prompt_only') {
                generation.status = 'prompt_ready';
                generation.completed_at = now();
                writeJsonAtomic(fileSystem, pathApi, manifestPath, generation);
                logger?.info?.(`✅ [CardNews] 카드 구성 및 이미지 프롬프트 준비 완료 (${generation.cards.length}장)`);
                return toPublicGenerationResult(generation);
            }

            if (typeof callWritingImage !== 'function') {
                const error = new Error('카드 이미지를 만들 이미지 AI 기능이 준비되지 않았습니다.');
                error.code = 'CARD_NEWS_IMAGE_GENERATOR_UNAVAILABLE';
                throw error;
            }

            for (const card of plan.cards) {
                logger?.info?.(`🎨 [CardNews] ${card.index}/${settings.slide_count} 카드 이미지 생성 중`);
                try {
                    const baseName = `card-${String(card.index).padStart(2, '0')}`;
                    const generatedPath = await callWritingImage(
                        generation.cards[card.index - 1].image_prompt,
                        pathApi.join(outputDir, baseName),
                        2,
                        { aspectRatio: settings.aspect_ratio, imageSize: '1K', useCase: 'card_news' }
                    );
                    const fileName = pathApi.basename(String(generatedPath || ''));
                    if (!safeAssetName(fileName) || !fileSystem.existsSync(generatedPath)) {
                        const error = new Error(`${card.index}번째 카드 이미지를 저장하지 못했습니다.`);
                        error.code = 'CARD_NEWS_IMAGE_MISSING';
                        throw error;
                    }
                    generation.cards[card.index - 1].file_name = fileName;
                    writeJsonAtomic(fileSystem, pathApi, manifestPath, generation);
                } catch (error) {
                    generation.status = 'partial';
                    generation.completed_at = now();
                    generation.error = {
                        code: String(error?.code || 'CARD_NEWS_IMAGE_GENERATION_FAILED'),
                        message: String(error?.message || '카드 이미지를 만들지 못했습니다.').slice(0, 500),
                        occurred_at: now()
                    };
                    writeJsonAtomic(fileSystem, pathApi, manifestPath, generation);
                    logger?.warn?.(`⚠️ [CardNews] 이미지 생성 중단 (${generation.cards.filter((item) => item.file_name).length}/${settings.slide_count}장): ${generation.error.message}`);
                    return {
                        ...toPublicGenerationResult(generation),
                        message: '카드 구성은 보관했습니다. 만들지 못한 이미지는 다음 단계에서 다시 채울 수 있습니다.'
                    };
                }
            }

            generation.status = 'completed';
            generation.completed_at = now();
            writeJsonAtomic(fileSystem, pathApi, manifestPath, generation);
            logger?.info?.(`✅ [CardNews] 카드뉴스 생성 완료 (${generation.cards.length}장)`);
            return toPublicGenerationResult(generation);
        } catch (error) {
            generation.status = 'failed';
            generation.error = {
                code: String(error?.code || 'CARD_NEWS_GENERATION_FAILED'),
                message: String(error?.message || '카드뉴스를 만들지 못했습니다.').slice(0, 500),
                occurred_at: now()
            };
            writeJsonAtomic(fileSystem, pathApi, manifestPath, generation);
            logger?.warn?.(`⚠️ [CardNews] 생성 실패 (${generation.cards.length}/${settings.slide_count}장): ${generation.error.message}`);
            throw error;
        }
    }

    function resolveAsset(generationId, fileName) {
        const safeId = safeGenerationId(generationId);
        const safeName = safeAssetName(fileName);
        if (!safeId || !safeName) return null;
        const assetPath = pathApi.join(exportRoot, safeId, safeName);
        if (!fileSystem.existsSync(assetPath) || !fileSystem.statSync(assetPath).isFile()) return null;
        const extension = pathApi.extname(safeName).toLowerCase();
        const mimeType = extension === '.png'
            ? 'image/png'
            : (extension === '.webp' ? 'image/webp' : (extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'application/octet-stream'));
        return { path: assetPath, file_name: safeName, mime_type: mimeType };
    }

    return { generate, resolveAsset, exportRoot };
}

module.exports = {
    safeGenerationId,
    safeAssetName,
    toPublicGenerationResult,
    createCardNewsGenerationService
};
