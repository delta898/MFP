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
const { createStoredZip } = require('./zip-bundle');
const { parseCardNewsZip, toZipPreview } = require('./zip-import');

function safeGenerationId(value) {
    const normalized = String(value || '').trim();
    return /^[a-zA-Z0-9_-]{8,100}$/.test(normalized) ? normalized : '';
}

function safeAssetName(value) {
    const normalized = String(value || '').trim();
    return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/.test(normalized) ? normalized : '';
}

function safeCardIndex(value) {
    const index = Number(value);
    return Number.isInteger(index) && index >= 1 && index <= 50 ? index : 0;
}

function imageExtension(fileName = '', mimeType = '') {
    const extension = path.extname(String(fileName || '')).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp', '.avif'].includes(extension)) return extension === '.jpeg' ? '.jpg' : extension;
    const normalizedMime = String(mimeType || '').toLowerCase();
    if (normalizedMime === 'image/png') return '.png';
    if (normalizedMime === 'image/jpeg') return '.jpg';
    if (normalizedMime === 'image/webp') return '.webp';
    if (normalizedMime === 'image/avif') return '.avif';
    return '';
}

function decodeLocalImage(input = {}) {
    const fileName = String(input.file_name || '').trim();
    const mimeType = String(input.mime_type || '').trim();
    let base64Data = String(input.base64_data || '').trim();
    const dataUrl = base64Data.match(/^data:([^;,]+);base64,(.+)$/i);
    if (dataUrl) base64Data = dataUrl[2] || '';
    const extension = imageExtension(fileName, mimeType || dataUrl?.[1]);
    if (!extension) {
        const error = new Error('PNG, JPG, WebP 또는 AVIF 이미지를 선택해 주세요.');
        error.code = 'CARD_NEWS_IMAGE_FORMAT_INVALID';
        throw error;
    }
    const buffer = Buffer.from(base64Data, 'base64');
    if (!buffer.length || buffer.length < 128) {
        const error = new Error('선택한 이미지 데이터가 올바르지 않습니다.');
        error.code = 'CARD_NEWS_IMAGE_DATA_INVALID';
        throw error;
    }
    if (buffer.length > 10 * 1024 * 1024) {
        const error = new Error('이미지는 최대 10MB까지 선택할 수 있습니다.');
        error.code = 'CARD_NEWS_IMAGE_TOO_LARGE';
        throw error;
    }
    return { buffer, extension };
}

function deriveGenerationStatus(cards = []) {
    const imageCount = cards.filter((card) => card?.file_name).length;
    if (imageCount === 0) return 'prompt_ready';
    return imageCount === cards.length ? 'completed' : 'partial';
}

function safeExportTitle(value) {
    const normalized = String(value || '')
        .normalize('NFKC')
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/g, '');
    return Array.from(normalized || '카드뉴스').slice(0, 80).join('');
}

function cardPlanMaxTokens(slideCount) {
    const count = Number(slideCount);
    if (count <= 3) return 4096;
    if (count <= 5) return 6144;
    return 8192;
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
        source_url: String(generation.source?.canonical_url || ''),
        source_platform: String(generation.source?.source_platform || ''),
        status: generation.status,
        image_mode: generation.image_mode,
        settings: generation.settings,
        variation: generation.variation,
        created_at: generation.created_at,
        completed_at: generation.completed_at,
        publishing_copy: {
            caption: String(generation.publishing_copy?.caption || generation.title || ''),
            hashtags: Array.isArray(generation.publishing_copy?.hashtags) ? generation.publishing_copy.hashtags : []
        },
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

    function resolveGeneration(generationId) {
        const id = safeGenerationId(generationId);
        if (!id) {
            const error = new Error('카드뉴스 결과를 찾지 못했습니다.');
            error.code = 'CARD_NEWS_GENERATION_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const outputDir = pathApi.join(exportRoot, id);
        const manifestPath = pathApi.join(outputDir, 'manifest.json');
        if (!fileSystem.existsSync(manifestPath)) {
            const error = new Error('카드뉴스 결과를 찾지 못했습니다.');
            error.code = 'CARD_NEWS_GENERATION_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        let generation;
        try {
            generation = JSON.parse(fileSystem.readFileSync(manifestPath, 'utf8'));
        } catch (_error) {
            const error = new Error('저장된 카드뉴스 결과를 읽지 못했습니다.');
            error.code = 'CARD_NEWS_GENERATION_INVALID';
            throw error;
        }
        if (generation?.id !== id || !Array.isArray(generation.cards)) {
            const error = new Error('저장된 카드뉴스 결과가 올바르지 않습니다.');
            error.code = 'CARD_NEWS_GENERATION_INVALID';
            throw error;
        }
        return { generation, outputDir, manifestPath };
    }

    function getGeneration(generationId) {
        return toPublicGenerationResult(resolveGeneration(generationId).generation);
    }

    function listGenerations() {
        if (!fileSystem.existsSync(exportRoot)) return [];
        return fileSystem.readdirSync(exportRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && safeGenerationId(entry.name))
            .map((entry) => {
                try {
                    return getGeneration(entry.name);
                } catch (error) {
                    logger?.warn?.(`⚠️ [CardNews] 로컬 결과 목록에서 제외 (${entry.name}): ${error.message}`);
                    return null;
                }
            })
            .filter((generation) => generation && generation.cards.length > 0)
            .sort((left, right) => String(right.completed_at || right.created_at).localeCompare(String(left.completed_at || left.created_at)));
    }

    function getGenerationCard(generation, cardIndex) {
        const index = safeCardIndex(cardIndex);
        const card = generation.cards.find((item) => Number(item.index) === index);
        if (!card) {
            const error = new Error('선택한 카드를 찾지 못했습니다.');
            error.code = 'CARD_NEWS_CARD_NOT_FOUND';
            throw error;
        }
        return card;
    }

    function removePreviousAsset(outputDir, previousFileName, nextFileName) {
        if (!previousFileName || previousFileName === nextFileName || !safeAssetName(previousFileName)) return;
        const previousPath = pathApi.join(outputDir, previousFileName);
        try {
            if (fileSystem.existsSync(previousPath)) fileSystem.unlinkSync(previousPath);
        } catch (error) {
            logger?.debug?.(`🛠️ [CardNews] 이전 이미지 정리 실패: ${error.message}`);
        }
    }

    function saveGeneratedImage({ generation, outputDir, manifestPath, card, generatedPath }) {
        const resolvedPath = pathApi.resolve(String(generatedPath || ''));
        if (pathApi.dirname(resolvedPath) !== pathApi.resolve(outputDir) || !fileSystem.existsSync(resolvedPath)) {
            const error = new Error(`${card.index}번째 카드 이미지를 저장하지 못했습니다.`);
            error.code = 'CARD_NEWS_IMAGE_MISSING';
            throw error;
        }
        const extension = imageExtension(pathApi.basename(resolvedPath));
        if (!extension) {
            const error = new Error(`${card.index}번째 카드 이미지 형식을 확인하지 못했습니다.`);
            error.code = 'CARD_NEWS_IMAGE_FORMAT_INVALID';
            throw error;
        }
        const suffix = crypto.randomUUID().slice(0, 8);
        const nextFileName = `card-${String(card.index).padStart(2, '0')}-${suffix}${extension}`;
        const nextPath = pathApi.join(outputDir, nextFileName);
        fileSystem.renameSync(resolvedPath, nextPath);
        const previousFileName = card.file_name;
        card.file_name = nextFileName;
        writeJsonAtomic(fileSystem, pathApi, manifestPath, generation);
        removePreviousAsset(outputDir, previousFileName, nextFileName);
    }

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
                source_platform: String(snapshot.source?.source_platform || ''),
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
                    maxTokens: cardPlanMaxTokens(settings.slide_count),
                    temperature: 0.8,
                    responseMimeType: 'application/json',
                    logTokenUsage: true
                }
            );
            const plan = normalizeCardPlan(parseStructuredJsonResponse(planRaw), settings);
            generation.title = plan.set_title || snapshot.title;
            generation.art_direction = plan.art_direction;
            generation.publishing_copy = plan.publishing_copy;
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
                    logger?.info?.(`✅ [CardNews] ${card.index}번 카드 이미지 적용 완료`);
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

    async function generateImages(input = {}) {
        if (typeof callWritingImage !== 'function') {
            const error = new Error('카드 이미지를 만들 이미지 AI 기능이 준비되지 않았습니다.');
            error.code = 'CARD_NEWS_IMAGE_GENERATOR_UNAVAILABLE';
            throw error;
        }
        const { generation, outputDir, manifestPath } = resolveGeneration(input.generation_id);
        const mode = ['all', 'missing', 'single'].includes(input.mode) ? input.mode : 'missing';
        const targets = mode === 'single'
            ? [getGenerationCard(generation, input.card_index)]
            : generation.cards.filter((card) => mode === 'all' || !card.file_name);
        if (!targets.length) return toPublicGenerationResult(generation);

        generation.status = 'generating_images';
        generation.image_mode = 'generate';
        delete generation.error;
        writeJsonAtomic(fileSystem, pathApi, manifestPath, generation);

        for (const card of targets) {
            logger?.info?.(`🎨 [CardNews] ${card.index}번 카드 이미지 ${card.file_name ? '다시 생성' : '생성'} 중`);
            try {
                const temporaryBase = pathApi.join(outputDir, `pending-${String(card.index).padStart(2, '0')}-${crypto.randomUUID().slice(0, 8)}`);
                const generatedPath = await callWritingImage(
                    card.image_prompt,
                    temporaryBase,
                    2,
                    { aspectRatio: generation.settings?.aspect_ratio || '4:5', imageSize: '1K', useCase: 'card_news' }
                );
                saveGeneratedImage({ generation, outputDir, manifestPath, card, generatedPath });
                logger?.info?.(`✅ [CardNews] ${card.index}번 카드 이미지 적용 완료`);
            } catch (error) {
                generation.status = 'partial';
                generation.completed_at = now();
                generation.error = {
                    code: String(error?.code || 'CARD_NEWS_IMAGE_GENERATION_FAILED'),
                    message: String(error?.message || '카드 이미지를 만들지 못했습니다.').slice(0, 500),
                    occurred_at: now()
                };
                writeJsonAtomic(fileSystem, pathApi, manifestPath, generation);
                logger?.warn?.(`⚠️ [CardNews] 이미지 작업 중단: ${generation.error.message}`);
                return {
                    ...toPublicGenerationResult(generation),
                    message: '완성한 이미지는 유지했습니다. 만들지 못한 이미지는 다시 시도해 주세요.'
                };
            }
        }

        generation.status = deriveGenerationStatus(generation.cards);
        generation.completed_at = now();
        delete generation.error;
        writeJsonAtomic(fileSystem, pathApi, manifestPath, generation);
        logger?.info?.(`✅ [CardNews] 이미지 작업 완료 (${targets.length}장)`);
        return toPublicGenerationResult(generation);
    }

    function importLocalImage(input = {}) {
        const { generation, outputDir, manifestPath } = resolveGeneration(input.generation_id);
        const card = getGenerationCard(generation, input.card_index);
        const { buffer, extension } = decodeLocalImage(input);
        const suffix = crypto.randomUUID().slice(0, 8);
        const nextFileName = `card-${String(card.index).padStart(2, '0')}-local-${suffix}${extension}`;
        const nextPath = pathApi.join(outputDir, nextFileName);
        const temporaryPath = `${nextPath}.${process.pid}.${Date.now()}.tmp`;
        fileSystem.writeFileSync(temporaryPath, buffer, { mode: 0o600 });
        fileSystem.renameSync(temporaryPath, nextPath);
        const previousFileName = card.file_name;
        card.file_name = nextFileName;
        generation.status = deriveGenerationStatus(generation.cards);
        generation.completed_at = now();
        delete generation.error;
        writeJsonAtomic(fileSystem, pathApi, manifestPath, generation);
        removePreviousAsset(outputDir, previousFileName, nextFileName);
        logger?.info?.(`✅ [CardNews] ${card.index}번 카드 로컬 이미지 적용 완료`);
        return toPublicGenerationResult(generation);
    }

    function previewZip(input = {}) {
        return toZipPreview(parseCardNewsZip(input));
    }

    function importZip(input = {}) {
        const parsed = parseCardNewsZip(input);
        const id = safeGenerationId(input.id) || safeGenerationId(createId()) || crypto.randomUUID();
        const title = String(input.title || parsed.metadata?.title || '').trim().slice(0, 300) || '가져온 카드뉴스';
        const sourceUrl = String(input.source_url || parsed.metadata?.source_url || '').trim();
        if (sourceUrl) {
            let parsedUrl;
            try { parsedUrl = new URL(sourceUrl); } catch (_error) { }
            if (!parsedUrl || parsedUrl.protocol !== 'https:') {
                const error = new Error('원문 주소는 공개된 HTTPS 주소만 입력할 수 있습니다.');
                error.code = 'CARD_NEWS_IMPORT_SOURCE_URL_INVALID';
                throw error;
            }
        }
        const outputDir = pathApi.join(exportRoot, id);
        const manifestPath = pathApi.join(outputDir, 'manifest.json');
        if (fileSystem.existsSync(outputDir)) {
            const error = new Error('같은 카드뉴스 결과가 이미 존재합니다.');
            error.code = 'CARD_NEWS_GENERATION_EXISTS';
            throw error;
        }
        fileSystem.mkdirSync(outputDir, { recursive: true });
        const generation = {
            schema_version: CARD_NEWS_GENERATION_SCHEMA_VERSION,
            id,
            title,
            status: 'completed',
            image_mode: 'imported',
            settings: {
                aspect_ratio: String(parsed.metadata?.settings?.aspect_ratio || '4:5'),
                slide_count: parsed.images.length,
                style: String(parsed.metadata?.settings?.style || 'imported'),
                include_korean_text: parsed.metadata?.settings?.include_korean_text !== false,
                additional_request: ''
            },
            variation: null,
            source: {
                kind: sourceUrl ? 'url' : 'manuscript',
                title,
                canonical_url: sourceUrl,
                management_id: String(input.management_id || id)
            },
            publishing_copy: { caption: title, hashtags: [] },
            cards: [],
            created_at: now(),
            completed_at: now()
        };
        try {
            for (const image of parsed.images) {
                const fileName = `card-${String(image.index).padStart(2, '0')}-imported${image.extension}`;
                const temporaryPath = pathApi.join(outputDir, `${fileName}.${process.pid}.${Date.now()}.tmp`);
                const finalPath = pathApi.join(outputDir, fileName);
                fileSystem.writeFileSync(temporaryPath, image.data, { mode: 0o600 });
                fileSystem.renameSync(temporaryPath, finalPath);
                generation.cards.push({
                    index: image.index,
                    headline: image.headline || pathApi.basename(image.original_name, pathApi.extname(image.original_name)),
                    body: image.body || '',
                    scene_prompt: '',
                    image_prompt: image.image_prompt || '',
                    file_name: fileName,
                    imported_file_name: image.original_name
                });
            }
            writeJsonAtomic(fileSystem, pathApi, manifestPath, generation);
        } catch (error) {
            try { fileSystem.rmSync(outputDir, { recursive: true, force: true }); } catch (_cleanupError) { }
            throw error;
        }
        logger?.info?.(`✅ [CardNews] ZIP 카드뉴스 가져오기 완료 (${generation.cards.length}장)`);
        return toPublicGenerationResult(generation);
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
            : (extension === '.webp'
                ? 'image/webp'
                : (extension === '.avif' ? 'image/avif' : (extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'application/octet-stream')));
        return { path: assetPath, file_name: safeName, mime_type: mimeType };
    }

    function resolveCompleteAssets(generationId) {
        const { generation, outputDir } = resolveGeneration(generationId);
        const cards = [...generation.cards].sort((left, right) => Number(left.index) - Number(right.index));
        if (!cards.length || cards.some((card) => !safeAssetName(card.file_name))) {
            const error = new Error('모든 카드의 이미지를 준비한 후 전체 이미지를 받아 주세요.');
            error.code = 'CARD_NEWS_EXPORT_INCOMPLETE';
            error.status = 409;
            throw error;
        }
        const assets = cards.map((card) => {
            const sourcePath = pathApi.join(outputDir, card.file_name);
            if (!fileSystem.existsSync(sourcePath) || !fileSystem.statSync(sourcePath).isFile()) {
                const error = new Error('일부 카드 이미지를 찾지 못했습니다. 해당 이미지를 다시 준비해 주세요.');
                error.code = 'CARD_NEWS_EXPORT_ASSET_MISSING';
                error.status = 409;
                throw error;
            }
            return {
                index: Number(card.index),
                path: sourcePath,
                file_name: card.file_name,
                mime_type: resolveAsset(generation.id, card.file_name)?.mime_type || 'application/octet-stream'
            };
        });
        return { generation, cards, assets };
    }

    function createExportBundle(generationId) {
        const { generation, cards, assets } = resolveCompleteAssets(generationId);
        const entries = assets.map((asset) => ({
            name: `${String(asset.index).padStart(2, '0')}${imageExtension(asset.file_name)}`,
            data: fileSystem.readFileSync(asset.path)
        }));
        const exportedNames = new Map(cards.map((card, index) => [Number(card.index), entries[index].name]));
        const portableManifest = {
            schema_version: 1,
            title: generation.title,
            source: generation.source,
            settings: generation.settings,
            created_at: generation.created_at,
            completed_at: generation.completed_at,
            cards: cards.map((card) => ({
                index: card.index,
                headline: card.headline,
                body: card.body,
                image_prompt: card.image_prompt,
                image_file: exportedNames.get(Number(card.index)) || ''
            }))
        };
        entries.push({
            name: 'card-news.json',
            data: Buffer.from(`${JSON.stringify(portableManifest, null, 2)}\n`, 'utf8')
        });
        const archive = createStoredZip(entries, { date: new Date(generation.completed_at || generation.created_at || Date.now()) });
        logger?.info?.(`✅ [CardNews] 전체 이미지 묶음 준비 완료 (${cards.length}장)`);
        return {
            buffer: archive,
            file_name: `카드뉴스-${safeExportTitle(generation.title)}.zip`,
            fallback_file_name: `card-news-${generation.id}.zip`,
            mime_type: 'application/zip',
            card_count: cards.length
        };
    }

    return { generate, generateImages, importLocalImage, previewZip, importZip, getGeneration, listGenerations, resolveAsset, resolveCompleteAssets, createExportBundle, exportRoot };
}

module.exports = {
    safeGenerationId,
    safeAssetName,
    safeCardIndex,
    imageExtension,
    decodeLocalImage,
    deriveGenerationStatus,
    safeExportTitle,
    cardPlanMaxTokens,
    toPublicGenerationResult,
    createCardNewsGenerationService
};
