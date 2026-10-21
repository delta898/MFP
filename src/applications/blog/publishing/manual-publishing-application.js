const {
    createPublishOperationId,
    hasSuccessfulPlatformResult,
    settlePublishQuota
} = require('../../../services/licensing/publish-quota');
const { normalizeWritingStrategyOverride } = require('../../../services/content-writing/writing-strategy');
const { parseImageCount } = require('../writing/blog-image-plan');
const {
    parseBlogImageMode,
    generatesBlogImages,
    stripBlogImagePromptBlocks
} = require('../writing/blog-image-mode');
const { createTopicRecommendationLearningService } = require('../../../services/recommendations/topic-recommendation-learning');
const { buildBlogPublishResultEvidence } = require('../operations-reporting/blog-publish-result');
const { normalizePublishTargets } = require('../../../services/content-delivery/single-publish-target');
const { parseBlogManuscriptMarkdown } = require('../manuscript-drafts/markdown-parser');
const { sleep } = require('../../../utilities/async/sleep');
const {
    MANUAL_PUBLISH_BLOCKED_CODE,
    assertDirectPublishAllowed
} = require('../../../services/runtime-environment/effects');
const { rethrowIfCanceled, throwIfCanceled } = require('../../../utilities/async/cancellation');
const { marked } = require('marked');
const { convertToMobileNaverBlogUrl } = require('../../../utilities/text/naver-blog-url');

function createBlogManualPublishingApplication(deps = {}) {
    const {
        fs,
        path,
        crypto,
        CONFIG,
        Logger,
        relatedPostsService,
        findImageByPrefix,
        GoogleSheets,
        blogPostingApplication,
        blogWritingApplication,
        blogPublishingApplication,
        License,
        TelegramBotService,
        buildLocalMarkdownPreview,
        materializeSelectedFilesToWorkspace,
        appendRelatedPostsToPastedMarkdown,
        getContentType,
        normalizeKeywords,
        normalizeBool,
        normalizePublishMode,
        parseIntSafe,
        toFeatureMap,
        isCommandEnabled,
        getFeatureBool,
        checkAuthSessionValid,
        buildQuickPublishDedupeKey,
        cleanupQuickPublishDedupeCache,
        getQuickPublishRecentEntry,
        hasQuickPublishRecentEntry,
        setQuickPublishRecentEntry,
        getQuickPublishPreviewSession,
        deleteQuickPublishPreviewSession,
        registerQuickPublishPreviewSession,
        selectQuickPublishPreviewTarget,
        trackQuickPublishPreviewDirs,
        presentBlogImageGenerationProgress,
        presentNaverPublishProgress,
        recordActivityLifecycle = async () => null
    } = deps;
    const topicRecommendationLearning = createTopicRecommendationLearningService({ recordActivityLifecycle });

    async function publishNaver(directory, request = {}) {
        if (typeof blogPublishingApplication?.publishNaver !== 'function') {
            throw new TypeError('Blog Publishing Application does not provide Naver publishing.');
        }
        return blogPublishingApplication.publishNaver(directory, request);
    }

    async function publishWordPressManuscript(directory, request = {}) {
        if (typeof blogPublishingApplication?.publishWordPressManuscript !== 'function') {
            throw new TypeError('Blog Publishing Application does not provide WordPress manuscript publishing.');
        }
        return blogPublishingApplication.publishWordPressManuscript(directory, request);
    }

    function buildWordPressPluginContent(markdown, images, tempDir) {
        if (!/\[\[IMAGE(?:_\d+)?(?:\s|\]\]|$)/i.test(String(markdown || ''))) {
            return { contentMarkdown: String(markdown || ''), assets: [] };
        }
        const parsedImages = (parseBlogManuscriptMarkdown(markdown, Logger)?.contents || []).filter((item) => item?.type === 'image');
        const assets = [];
        const assetsByIndex = new Map();
        let imagePosition = 0;
        const mimeTypes = {
            '.avif': 'image/avif',
            '.gif': 'image/gif',
            '.jpeg': 'image/jpeg',
            '.jpg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp'
        };
        const contentMarkdown = String(markdown || '').replace(
            /^\s*\[\[IMAGE(?:_(\d+))?(?:\s|\]\]|$)[\s\S]*?\]\]\s*$/gm,
            (block, explicitIndex) => {
                const parsedImage = parsedImages[imagePosition++];
                if (!parsedImage) return '';
                const index = explicitIndex === undefined ? Number(parsedImage.index) : Number(explicitIndex);
                const key = `image-${index}`;
                if (assetsByIndex.has(index)) return `{{asset:${key}}}`;
                const imagePath = findImageByPrefix(tempDir, index);
                if (!imagePath || !fs?.existsSync?.(imagePath)) {
                    const error = new Error(`원고 이미지 ${index + 1}번 파일을 찾을 수 없습니다.`);
                    error.code = 'WORDPRESS_IMAGE_ASSET_MISSING';
                    throw error;
                }
                const extension = path.extname(imagePath).toLowerCase();
                const mimeType = mimeTypes[extension];
                if (!mimeType) {
                    const error = new Error(`원고 이미지 ${index + 1}번의 파일 형식을 지원하지 않습니다.`);
                    error.code = 'WORDPRESS_IMAGE_MIME_UNSUPPORTED';
                    throw error;
                }
                const asset = {
                    key,
                    bytes: fs.readFileSync(imagePath),
                    filename: path.basename(imagePath),
                    mimeType,
                    altText: String(images?.[imagePosition - 1]?.title || parsedImage.text || '').trim()
                };
                assets.push(asset);
                assetsByIndex.set(index, asset);
                return `{{asset:${key}}}`;
            }
        );
        return { contentMarkdown, assets };
    }

    async function recordTopicRecommendationOutcome({ requestBody, stage, subject, entityRef, resultRef, platform = '' }) {
        const recommendation = requestBody?.recommendation;
        if (!recommendation || requestBody?.source !== 'topic_recommendation') return null;
        try {
            return await topicRecommendationLearning.recordOutcome({
                stage,
                subject,
                source: 'topic-recommendation-ui',
                recommendation,
                entity_ref: entityRef,
                result_ref: resultRef,
                platform,
                provenance: {
                    channel: 'ui',
                    surface: 'blog.quick',
                    action: stage
                }
            });
        } catch (error) {
            Logger.warn(`[TopicRecommendation] ${stage} outcome 저장 실패: ${error.message}`);
            return null;
        }
    }

    async function recordTopicRecommendationTerminalResults({ requestBody, subject, postStatus, results, operationId }) {
        const normalizedStatus = String(postStatus || '').trim().toLowerCase();
        const stage = normalizedStatus === 'draft' ? 'drafted' : (normalizedStatus === 'publish' ? 'published' : '');
        if (!stage) return;
        for (const [platform, result] of Object.entries(results || {})) {
            if (result?.success !== true) continue;
            await recordTopicRecommendationOutcome({
                requestBody,
                stage,
                subject,
                entityRef: operationId,
                resultRef: result.postUrl || operationId,
                platform
            });
        }
    }

    async function recordBlogSelection({ operationId, subject, source, targets, entityRef = '' }) {
        return recordActivityLifecycle({
            domain: 'blog',
            stage: 'selected',
            subject,
            source,
            entity_ref: entityRef || operationId,
            evidence_id: `${operationId}:blog:selected`,
            metadata: {
                targets: Array.isArray(targets) ? targets.slice() : []
            }
        });
    }

    async function recordBlogTerminalResults({ operationId, subject, source, postStatus, results }) {
        const recorded = [];
        const evidenceItems = buildBlogPublishResultEvidence({
            operationId,
            subject,
            source,
            postStatus,
            results
        });
        for (const evidence of evidenceItems) {
            recorded.push(await recordActivityLifecycle(evidence));
        }
        return recorded;
    }

    function getCompletionStatusLabel(postStatus) {
        const normalized = String(postStatus || '').trim().toLowerCase();
        if (normalized === 'draft') return '임시 저장 완료';
        if (normalized === 'schedule') return '예약 포스팅 등록 완료';
        return '발행 완료';
    }

    function getPostActionLabel(postStatus) {
        const normalized = String(postStatus || '').trim().toLowerCase();
        if (normalized === 'draft') return '저장';
        if (normalized === 'schedule') return '예약 등록';
        return '발행';
    }

    function getPlatformCompletionLabel(platformLabel, postStatus) {
        const normalized = String(postStatus || '').trim().toLowerCase();
        if (normalized === 'draft') return `${platformLabel} 임시 저장 완료`;
        if (normalized === 'schedule') return `${platformLabel} 예약 포스팅 등록 완료`;
        return `${platformLabel} 발행 완료`;
    }

    async function reserveQuota(operationId, metadata) {
        const reservation = await License.reservePublishQuota(operationId, metadata);
        if (!reservation.success) {
            const error = new Error(`라이선스 사용량 예약 실패: ${reservation.message}`);
            error.code = reservation.code || 'QUOTA_RESERVE_FAILED';
            throw error;
        }
        return reservation;
    }

    async function settleQuota(operationId, results, metadata) {
        const settlement = await settlePublishQuota({ License, operationId, results, metadata });
        if (!settlement.success) {
            Logger.error(`[PublishQuota] 사용량 확정 동기화 실패 (${operationId}): ${settlement.message}`);
        }
        return settlement;
    }

    function applyPreviouslySuccessfulTargets(results, targets, reservation) {
        const successfulTargets = Array.isArray(reservation?.metadata?.successful_targets)
            ? reservation.metadata.successful_targets
            : [];
        for (const target of successfulTargets) {
            if (!targets.includes(target)) continue;
            if (!results[target]) results[target] = {};
            results[target].success = true;
            results[target].message = '이전 시도에서 완료';
            results[target].reused = true;
        }
        return targets.filter((target) => !successfulTargets.includes(target));
    }

    async function buildMultiPlatformGeneratedContent(params = {}, options = {}) {
        const signal = options.signal;
        const {
            context,
            targets,
            features,
            enableRelatedPostsAutoLink
        } = params;

        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
        const emitProgress = (message) => onProgress && onProgress(message);

        const imageGenerationFinal = context.imageOptions?.generate === true;

        const results = {
            naver: { success: false, message: '', targetDir: null },
            wordpress: { success: false, message: '', targetDir: null }
        };

        try {
            throwIfCanceled(signal);
            if (targets.includes('naver')) {
                const session = await checkAuthSessionValid();
                throwIfCanceled(signal);
                if (!session.ok) {
                    return {
                        success: false,
                        message: session.reason === 'expired' ? '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.' : '네이버 로그인이 필요합니다.'
                    };
                }
            }

            if (targets.includes('naver')) {
                emitProgress('네이버 콘텐츠 생성 중...');
                const naverTopic = {
                    ...context,
                    category: context.naverCategory || context.category || '',
                    use_external_ref: context.useExternalRef,
                    content_guide: {
                        additional_instructions: context.instruction || '',
                        reference_urls: context.referenceUrls || []
                    },
                    image_options: {
                        mode: context.imageOptions?.mode || 'prompt_only',
                        generate: imageGenerationFinal,
                        count: context.imageOptions?.count
                    }
                };
                const naverResult = await blogPostingApplication.preparePost(naverTopic, {
                    workspaceDir: options.transientWorkspaceDir || null,
                    enableRelatedPostsAutoLink,
                    platform: 'naver',
                    signal,
                    textModelConfig: options.textModelConfig,
                    imageModelConfig: options.imageModelConfig,
                    imageGenerationEnabled: imageGenerationFinal,
                    onImageProgress(progress) {
                        const message = presentBlogImageGenerationProgress(progress, 'naver');
                        if (message) emitProgress(message);
                    },
                    onStage(stage) {
                        if (stage === 'images') {
                            emitProgress('네이버 이미지 준비 중...');
                            if (imageGenerationFinal) options.onStage?.('images');
                        }
                    }
                });
                throwIfCanceled(signal);
                results.naver.targetDir = naverResult.targetDir;
                results.finalSubject = naverResult.finalSubject;
            }

            if (targets.includes('wordpress')) {
                emitProgress('워드프레스 콘텐츠 생성 중...');
                const wpTopic = {
                    ...context,
                    category: context.wordpressCategory || context.category || '',
                    use_external_ref: context.useExternalRef,
                    content_guide: {
                        additional_instructions: context.instruction || '',
                        reference_urls: context.referenceUrls || []
                    },
                    image_options: {
                        mode: context.imageOptions?.mode || 'prompt_only',
                        generate: imageGenerationFinal,
                        count: context.imageOptions?.count
                    }
                };
                const wpResult = await blogPostingApplication.preparePost(wpTopic, {
                    workspaceDir: options.transientWorkspaceDir || null,
                    enableRelatedPostsAutoLink,
                    platform: 'wordpress',
                    signal,
                    textModelConfig: options.textModelConfig,
                    imageModelConfig: options.imageModelConfig,
                    imageGenerationEnabled: imageGenerationFinal,
                    onImageProgress(progress) {
                        const message = presentBlogImageGenerationProgress(progress, 'wordpress');
                        if (message) emitProgress(message);
                    },
                    onStage(stage) {
                        if (stage === 'images') {
                            emitProgress('워드프레스 이미지 준비 중...');
                            if (imageGenerationFinal) options.onStage?.('images');
                        }
                    }
                });
                throwIfCanceled(signal);
                results.wordpress.targetDir = wpResult.targetDir;
                if (!results.finalSubject) results.finalSubject = wpResult.finalSubject;
            }

            return { success: true, results };
        } catch (error) {
            rethrowIfCanceled(error, signal);
            Logger.error(`❌ [MultiPlatformGenerate] 오류: ${error.message}`);
            return { success: false, message: error.message, results };
        }
    }

    async function processMultiPlatformPublish(params = {}, options = {}) {
        const { context, targets, headless } = params;
        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
        const emitProgress = (message) => onProgress && onProgress(message);

        const operationId = options.operationId || createPublishOperationId({
            scope: options.source || 'blog',
            stableKey: options.stableKey || '',
            postStatus: context.postStatus
        });
        const ensurePlatformPostAllowed = async (target) => {
            if (typeof options.beforePlatformPost !== 'function') return;
            const gate = await options.beforePlatformPost({ target });
            if (gate?.success === false) {
                const error = new Error(gate.message || '예약 시각이 지나 포스팅을 건너뛰었습니다.');
                error.code = gate.code || 'SCHEDULE_DATE_PAST';
                throw error;
            }
        };
        const requestedSubject = String(context.subject || '').trim() || '제목 미지정';
        await recordBlogSelection({
            operationId,
            subject: requestedSubject,
            source: options.source || 'blog',
            targets,
            entityRef: options.stableKey || operationId
        });

        const generated = await buildMultiPlatformGeneratedContent(params, options);
        if (!generated.success) {
            return generated;
        }

        try {
            await ensurePlatformPostAllowed('preflight');
        } catch (error) {
            return { success: false, code: error.code || 'PUBLISH_PREFLIGHT_FAILED', message: error.message };
        }

        const results = generated.results || {
            naver: { success: false, message: '', targetDir: null },
            wordpress: { success: false, message: '', targetDir: null }
        };
        const imageGenerationFinal = context.imageOptions?.generate === true;
        const subjectLabel = String(results.finalSubject || context.subject || '').trim() || '제목 미지정';
        let quotaReserved = false;
        try {
            emitProgress('라이선스 사용량 예약 중...');
            const reservation = await reserveQuota(operationId, {
                source: options.source || 'blog',
                post_status: context.postStatus || 'publish',
                targets
            });
            quotaReserved = true;
            const executionTargets = applyPreviouslySuccessfulTargets(results, targets, reservation);

            if (executionTargets.includes('naver') && results.naver.targetDir) {
                await ensurePlatformPostAllowed('naver');
                emitProgress('네이버 발행 중...');
                const naverActionLabel = getPostActionLabel(context.postStatus);
                const naverCompletionLabel = getPlatformCompletionLabel('네이버', context.postStatus);
                const reportNaverProgress = (event) => {
                    const progress = presentNaverPublishProgress(event, context.postStatus || 'publish');
                    if (!progress) return;
                    Logger?.info?.(`[Blog Beta][Progress] ${progress.message}`);
                    emitProgress(progress.message);
                };
                const naverRes = await publishNaver(results.naver.targetDir, {
                    headless,
                    category: context.naverCategory || context.category || '',
                    postStatus: context.postStatus || 'publish',
                    scheduleDate: context.scheduleDate || '',
                    isLast: options.isLast === true,
                    onProgress: reportNaverProgress
                }) || { success: false, message: 'Naver publish returned no response' };
                results.naver.success = naverRes.success;
                results.naver.postUrl = naverRes.postUrl;
                results.naver.message = naverRes.message || (naverRes.postUrl ? `${naverCompletionLabel}: ${naverRes.postUrl}` : naverCompletionLabel);
                emitProgress(naverRes.success ? naverCompletionLabel : `네이버 ${naverActionLabel} 실패: ${naverRes.message}`);

                if (naverRes.success) {
                    const urlMsg = naverRes.postUrl ? `\n\n🔗 [글 보기](${naverRes.postUrl})` : '';
                    await TelegramBotService.sendNotification(`✅ *네이버 블로그 ${naverActionLabel} 완료!*${urlMsg}`);
                }
            }

            if (executionTargets.includes('wordpress') && results.wordpress.targetDir) {
                await ensurePlatformPostAllowed('wordpress');
                emitProgress('워드프레스 발행 중...');
                const wpActionLabel = getPostActionLabel(context.postStatus);
                const wpCompletionLabel = getPlatformCompletionLabel('워드프레스', context.postStatus);
                const wpOptions = {
                    category: context.wordpressCategory || context.category || '',
                    postStatus: context.postStatus || 'draft',
                    wpScheduleDate: context.scheduleDate || '',
                    imageGeneration: imageGenerationFinal
                };
                const pubRes = await publishWordPressManuscript(results.wordpress.targetDir, wpOptions);
                results.wordpress.success = pubRes.success;
                results.wordpress.postUrl = pubRes.postUrl;
                results.wordpress.message = pubRes.message || (pubRes.success ? wpCompletionLabel : `워드프레스 ${wpActionLabel} 실패`);
                if (pubRes.success) {
                    emitProgress(wpCompletionLabel);
                    const urlMsg = pubRes.postUrl ? `\n\n🔗 [글 보기](${pubRes.postUrl})` : '';
                    await TelegramBotService.sendNotification(`✅ *워드프레스 ${wpActionLabel} 완료!*${urlMsg}`);
                } else {
                    emitProgress(`워드프레스 ${wpActionLabel} 실패: ${pubRes.message}`);
                }
            }

            const quotaSettlement = await settleQuota(operationId, results, {
                targets,
                successful_targets: targets.filter((target) => results?.[target]?.success === true)
            });
            quotaReserved = false;
            await recordBlogTerminalResults({
                operationId,
                subject: subjectLabel,
                source: options.source || 'blog',
                postStatus: context.postStatus || 'publish',
                results
            });
            return {
                success: hasSuccessfulPlatformResult(results),
                results,
                operationId,
                quotaSettlement
            };
        } catch (error) {
            if (quotaReserved) {
                await settleQuota(operationId, results, { error: error.message });
            }
            Logger.error(`❌ [CommonPublish] 오류: ${error.message}`);
            return { success: false, code: error.code || 'PUBLISH_FAILED', message: error.message, results, operationId };
        }
    }

    function buildQuickPreviewDataFromDirectory({
        directoryPath,
        previewId,
        target,
        targets,
        postStatus,
        scheduleDate,
        imageGeneration
    } = {}) {
        const preview = buildLocalMarkdownPreview({
            directoryPath,
            targets,
            postStatus,
            scheduleDate,
            imageGeneration
        }, {
            fs,
            path,
            findImageByPrefix,
        });

        preview.source = {
            ...(preview.source || {}),
            type: 'generated_quick_post'
        };
        preview.previewId = String(previewId || '').trim();
        preview.target = String(target || '').trim();
        preview.images = Array.isArray(preview.images)
            ? preview.images.map((image) => ({
                ...image,
                previewUrl: image.exists
                    ? `/api/v1/blog/quick-preview/image?previewId=${encodeURIComponent(String(previewId || ''))}&target=${encodeURIComponent(String(target || ''))}&index=${encodeURIComponent(String(image.index))}`
                    : ''
            }))
            : [];
        return preview;
    }

    async function executeQuickPreviewPublish(requestBody = {}) {
        const previewId = String(requestBody?.previewId || '').trim();
        const session = getQuickPublishPreviewSession(previewId);
        if (!session) {
            return { success: false, code: 'QUICK_PREVIEW_NOT_FOUND', message: '빠른 포스팅 preview를 찾지 못했습니다. 다시 생성해 주세요.' };
        }

        const precheck = await License.checkLicenseStatus();
        if (!precheck.success) {
            return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
        }
        const features = toFeatureMap(precheck.features);
        const generatedTargets = Array.isArray(session.targets) ? session.targets.slice() : [];
        const selectedTargets = Array.isArray(requestBody?.targets)
            ? requestBody.targets.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
            : generatedTargets.slice();
        if (selectedTargets.length !== 1) {
            return {
                success: false,
                code: selectedTargets.length === 0 ? 'PUBLISH_TARGET_REQUIRED' : 'MULTIPLE_PUBLISH_TARGETS',
                message: '하나의 원고에는 발행 대상을 하나만 선택해 주세요.'
            };
        }
        const missingPreviewTargets = selectedTargets.filter((target) => !generatedTargets.includes(target) || !session.targetDirs?.[target]);
        if (missingPreviewTargets.length > 0) {
            return {
                success: false,
                code: 'QUICK_PREVIEW_TARGET_MISSING',
                message: `${missingPreviewTargets.join(', ')} 대상은 생성된 preview가 없습니다. 미리보기를 다시 생성해 주세요.`
            };
        }

        const headless = typeof requestBody?.headless === 'boolean' ? requestBody.headless : Boolean(CONFIG.HEADLESS);
        const postStatus = String(requestBody?.postStatus || 'publish').trim() || 'publish';
        const scheduleDate = String(requestBody?.scheduleDate || '').trim();
        if (postStatus === 'schedule' && !scheduleDate) {
            return { success: false, code: 'INVALID_SCHEDULE_DATE', message: '예약 발행을 위해서는 예약 일시가 필수입니다.' };
        }

        const imageGenerationFinal = session.imageGenerationRequested === true;

        if (selectedTargets.includes('naver')) {
            const sessionCheck = await checkAuthSessionValid();
            if (!sessionCheck.ok) {
                return {
                    success: false,
                    code: 'NAVER_SESSION_INVALID',
                    message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 login을 다시 실행해 주세요.'
                };
            }
        }

        const results = {};
        const operationId = createPublishOperationId({ scope: 'quick-preview', stableKey: previewId, postStatus });
        let quotaReserved = false;
        try {
            await recordBlogSelection({
                operationId,
                subject: session.subject || '빠른 포스팅 원고',
                source: 'quick-preview',
                targets: selectedTargets,
                entityRef: previewId
            });
            const reservation = await reserveQuota(operationId, { source: 'quick-preview', preview_id: previewId, post_status: postStatus, targets: selectedTargets });
            quotaReserved = true;
            const executionTargets = applyPreviouslySuccessfulTargets(results, selectedTargets, reservation);
            if (executionTargets.includes('naver') && session.targetDirs?.naver) {
                const naverActionLabel = getPostActionLabel(postStatus);
                const naverRes = await publishNaver(session.targetDirs.naver, {
                    headless,
                    category: requestBody?.naverCategory || '',
                    postStatus,
                    scheduleDate,
                    isLast: !selectedTargets.includes('wordpress')
                }) || { success: false, message: 'Naver publish returned no response' };
                results.naver = {
                    success: Boolean(naverRes.success),
                    message: naverRes.message || '',
                    postUrl: naverRes.postUrl || ''
                };
                if (naverRes.success && CONFIG.NOTIFY_TELEGRAM_ENABLED) {
                    const urlMsg = naverRes.postUrl ? `\n\n🔗 [글 보기](${naverRes.postUrl})` : '';
                    await TelegramBotService.sendNotification(`✅ *네이버 블로그 ${naverActionLabel} 완료!*${urlMsg}`);
                }
            }

            if (executionTargets.includes('wordpress') && session.targetDirs?.wordpress) {
                const wpActionLabel = getPostActionLabel(postStatus);
                const wpRes = await publishWordPressManuscript(session.targetDirs.wordpress, {
                    category: requestBody?.wordpressCategory || '',
                    postStatus,
                    wpScheduleDate: scheduleDate || '',
                    imageGeneration: imageGenerationFinal
                }) || { success: false, message: 'WordPress publish returned no response' };
                results.wordpress = {
                    success: Boolean(wpRes.success),
                    message: wpRes.message || '',
                    postUrl: wpRes.postUrl || ''
                };
                if (wpRes.success && CONFIG.NOTIFY_TELEGRAM_ENABLED) {
                    const urlMsg = wpRes.postUrl ? `\n\n🔗 [글 보기](${wpRes.postUrl})` : '';
                    await TelegramBotService.sendNotification(`✅ *워드프레스 ${wpActionLabel} 완료!*${urlMsg}`);
                }
            }

            const quotaSettlement = await settleQuota(operationId, results, { successful_targets: Object.keys(results).filter((target) => results[target]?.success) });
            quotaReserved = false;
            await recordBlogTerminalResults({
                operationId,
                subject: session.subject || '빠른 포스팅 원고',
                source: 'quick-preview',
                postStatus,
                results
            });
            await recordTopicRecommendationTerminalResults({
                requestBody: session.recommendation
                    ? { source: 'topic_recommendation', recommendation: session.recommendation }
                    : {},
                subject: session.subject || '빠른 포스팅 원고',
                postStatus,
                results,
                operationId
            });
            const failedTargets = Object.entries(results)
                .filter(([, value]) => value && value.success === false)
                .map(([platform, value]) => `${platform}: ${value.message || '실패'}`);

            if (Number.isInteger(session.rowIndex)) {
                if (failedTargets.length > 0) {
                    await GoogleSheets.updateGoogleSheetStatus(session.rowIndex, '발행 준비 완료', failedTargets.join(' / '));
                } else {
                    const completionStatus = getCompletionStatusLabel(postStatus);
                    const logArr = [];
                    if (results.naver?.success) {
                        logArr.push(results.naver.postUrl ? `네이버 완료(${results.naver.postUrl})` : '네이버 완료');
                    }
                    if (results.wordpress?.success) {
                        logArr.push(results.wordpress.postUrl ? `워드프레스 완료(${results.wordpress.postUrl})` : '워드프레스 완료');
                    }
                    await GoogleSheets.updateGoogleSheetStatus(session.rowIndex, completionStatus, logArr.join('/') || completionStatus);
                }
            }

            if (session.dedupeKey && hasQuickPublishRecentEntry(session.dedupeKey)) {
                const completionStatus = getCompletionStatusLabel(postStatus);
                setQuickPublishRecentEntry(session.dedupeKey, {
                    ...(getQuickPublishRecentEntry(session.dedupeKey) || {}),
                    rowNumber: session.rowNumber,
                    rowIndex: session.rowIndex,
                    status: failedTargets.length > 0 ? '발행 준비 완료' : completionStatus,
                    published: failedTargets.length === 0,
                    targetDir: session.targetDirs?.[selectedTargets[0]] || session.targetDirs?.[session.primaryTarget] || session.targetDirs?.naver || session.targetDirs?.wordpress || null,
                    updatedAtMs: Date.now()
                });
            }

            if (failedTargets.length > 0) {
                return {
                    success: false,
                    code: 'QUICK_PREVIEW_PUBLISH_FAILED',
                    message: failedTargets.join(' / '),
                    data: {
                        status: '일부 포스팅 실패',
                        results,
                        operationId,
                        quotaSettlement
                    }
                };
            }

            deleteQuickPublishPreviewSession(previewId);
            return {
                success: true,
                data: {
                    status: getCompletionStatusLabel(postStatus),
                    postStatus,
                    rowIndex: session.rowIndex,
                    rowNumber: session.rowNumber,
                    results,
                    operationId,
                    quotaSettlement
                }
            };
        } catch (error) {
            if (quotaReserved) {
                await settleQuota(operationId, results, { error: error.message });
            }
            Logger.error(`❌ [QuickPreviewPublish] 오류: ${error.message}`);
            if (Number.isInteger(session.rowIndex)) {
                await GoogleSheets.updateGoogleSheetStatus(session.rowIndex, '발행 준비 완료', error.message || '포스팅 실패');
            }
            return { success: false, code: 'QUICK_PREVIEW_PUBLISH_FAILED', message: error.message || '빠른 포스팅 실행에 실패했습니다.' };
        }
    }

    function getQuickPreviewImagePayload({ previewId, target, index } = {}) {
        const session = getQuickPublishPreviewSession(previewId);
        if (!session) {
            throw new Error('빠른 포스팅 preview를 찾지 못했습니다.');
        }
        const normalizedTarget = String(target || '').trim().toLowerCase();
        if (!normalizedTarget) {
            throw new Error('preview target이 필요합니다.');
        }
        const imageIndex = parseIntSafe(index, null, 0);
        if (imageIndex === null) {
            throw new Error('image index가 올바르지 않습니다.');
        }
        const previewData = session.previewsByTarget?.[normalizedTarget] || null;
        const image = Array.isArray(previewData?.images)
            ? previewData.images.find((item) => Number(item.index) === imageIndex)
            : null;
        if (!image?.exists || !image.imagePath || !fs.existsSync(image.imagePath)) {
            throw new Error('preview 이미지를 찾지 못했습니다.');
        }
        return {
            binary: true,
            contentType: getContentType(image.imagePath) || 'application/octet-stream',
            body: fs.readFileSync(image.imagePath)
        };
    }

    async function executeQuickPublish(requestBody, executionOptions = {}) {
        const workspaceDraft = executionOptions.workspaceDraft === true;
        const signal = executionOptions.signal;
        throwIfCanceled(signal);
        const subject = String(requestBody?.subject || '').trim();
        const title = String(requestBody?.title || '').trim();
        const keywords = normalizeKeywords(requestBody?.keywords);
        const instruction = String(requestBody?.instruction || '').trim();
        const rawWritingStrategy = String(requestBody?.writingStrategy || '').trim().toLowerCase();
        if (rawWritingStrategy && !['inherit', 'search', 'discovery'].includes(rawWritingStrategy)) {
            return { success: false, code: 'INVALID_WRITING_STRATEGY', message: '글 작성 전략 값이 올바르지 않습니다.' };
        }
        const writingStrategy = normalizeWritingStrategyOverride(rawWritingStrategy);
        const source = requestBody?.source === 'naver_trend'
            ? 'naver_trend'
            : (requestBody?.source === 'topic_recommendation' ? 'topic_recommendation' : 'manual');
        const trendDate = source === 'naver_trend' ? String(requestBody?.trendDate || '').trim() : '';
        const parsedTrendDate = new Date(`${trendDate}T00:00:00.000Z`);
        if (source === 'naver_trend' && (
            !/^\d{4}-\d{2}-\d{2}$/.test(trendDate)
            || Number.isNaN(parsedTrendDate.getTime())
            || parsedTrendDate.toISOString().slice(0, 10) !== trendDate
        )) {
            return { success: false, code: 'INVALID_TREND_DATE', message: '트렌드 날짜가 올바르지 않습니다.' };
        }
        const externalReference = normalizeBool(requestBody?.externalReference, true);
        let imageMode;
        try {
            imageMode = parseBlogImageMode(requestBody?.imageMode, {
                legacyGenerate: typeof requestBody?.imageGeneration === 'boolean'
                    ? requestBody.imageGeneration : undefined,
                fallback: 'prompt_only'
            });
        } catch (error) {
            return { success: false, code: error.code, message: error.message };
        }
        let requestedImageCount;
        try {
            requestedImageCount = parseImageCount(requestBody?.imageCount ?? requestBody?.image_count) ?? undefined;
        } catch (error) {
            return { success: false, code: error.code || 'INVALID_BLOG_IMAGE_COUNT', message: error.message };
        }
        const headless = typeof requestBody?.headless === 'boolean' ? requestBody.headless : Boolean(CONFIG.HEADLESS);
        let referenceUrl = String(requestBody?.referenceUrl || '').trim();
        if (referenceUrl) {
            referenceUrl = convertToMobileNaverBlogUrl(referenceUrl);
        }
        const publishMode = normalizePublishMode(requestBody?.publishMode);
        const targets = normalizePublishTargets(Array.isArray(requestBody?.targets) ? requestBody.targets : ['naver']);
        if (targets.length !== 1) {
            return {
                success: false,
                code: targets.length === 0 ? 'PUBLISH_TARGET_REQUIRED' : 'MULTIPLE_PUBLISH_TARGETS',
                message: '하나의 원고에는 발행 대상을 하나만 선택해 주세요.'
            };
        }
        if (publishMode !== 'append_only' && publishMode !== 'append_and_generate' && publishMode !== 'publish') {
            return {
                success: false,
                code: 'INVALID_QUICK_PUBLISH_MODE',
                message: '빠른 포스팅은 append_only, append_and_generate, publish만 지원합니다.'
            };
        }

        if (!subject && (!keywords || keywords.length === 0) && !referenceUrl) {
            return { success: false, code: 'INVALID_INPUT', message: 'Subject, Keywords, 참고 URL 중 최소 하나는 입력해야 합니다.' };
        }

        const finalSubject = subject || '(제목 미지정)';
        const finalTitle = title;

        if (referenceUrl && !/^https?:\/\//i.test(referenceUrl)) {
            return { success: false, code: 'INVALID_REFERENCE_URL', message: '참고 URL 형식이 올바르지 않습니다. (http/https)' };
        }

        const postStatus = String(requestBody?.postStatus || 'publish').trim() || 'publish';
        const scheduleDate = String(requestBody?.scheduleDate || '').trim();
        if (!['publish', 'draft', 'schedule'].includes(postStatus)) {
            return { success: false, code: 'INVALID_POST_STATUS', message: `postStatus 값이 올바르지 않습니다: ${postStatus}` };
        }
        if (postStatus === 'schedule' && !scheduleDate) {
            return { success: false, code: 'INVALID_SCHEDULE_DATE', message: '예약 발행을 위해서는 예약 일시가 필수입니다.' };
        }

        const precheck = await License.checkLicenseStatus();
        throwIfCanceled(signal);
        if (!precheck.success) {
            return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
        }

        const features = toFeatureMap(precheck.features);
        const enableRelatedPostsAutoLink = workspaceDraft
            ? false
            : getFeatureBool(features, 'enable_related_posts_auto_link', false);
        const imageGenerationFinal = generatesBlogImages(imageMode);

        const nowMs = Date.now();
        cleanupQuickPublishDedupeCache(nowMs);
        const dedupeKey = buildQuickPublishDedupeKey({
            subject,
            title: finalTitle,
            keywords,
            instruction,
            referenceUrl,
            imageMode,
            imageGeneration: imageGenerationFinal,
            imageCount: requestedImageCount,
            externalReference,
            writingStrategy,
            source,
            trendDate
        });
        const existingEntry = getQuickPublishRecentEntry(dedupeKey) || null;

        if (!workspaceDraft) await GoogleSheets.ensureAllSheetsExist();

        let appendStatus = (publishMode === 'append_and_generate' || publishMode === 'publish') ? '발행 준비 완료' : '대기';
        let rowNumber = null;
        let rowIndex = null;
        let deduplicated = false;

        if (workspaceDraft) {
            // Draft workspace generation is intentionally local until the user confirms publication.
        } else if (existingEntry && Number.isInteger(existingEntry.rowIndex)) {
            deduplicated = true;
            rowNumber = existingEntry.rowNumber ?? null;
            rowIndex = existingEntry.rowIndex;
            appendStatus = existingEntry.status || appendStatus;

            if (publishMode === 'append_only') {
                await recordTopicRecommendationOutcome({
                    requestBody,
                    stage: 'saved',
                    subject: finalSubject,
                    entityRef: Number.isInteger(rowIndex) ? `topics-row-${rowIndex}` : dedupeKey,
                    resultRef: String(rowNumber || rowIndex || dedupeKey)
                });
                return {
                    success: true,
                    data: {
                        mode: publishMode,
                        executionMode: publishMode,
                        postStatus,
                        sheet: CONFIG.GOOGLE_TOPICS_SHEET || 'topics',
                        rowNumber,
                        rowIndex,
                        status: appendStatus,
                        deduplicated
                    }
                };
            }

            if ((publishMode === 'append_and_generate' || publishMode === 'publish')
                && appendStatus !== '발행 준비 완료'
                && Number.isInteger(rowIndex)) {
                await GoogleSheets.updateGoogleSheetStatus(rowIndex, '발행 준비 완료', '기존 글감 재사용');
                appendStatus = '발행 준비 완료';
            }
            setQuickPublishRecentEntry(dedupeKey, {
                ...existingEntry,
                status: appendStatus,
                updatedAtMs: nowMs
            });
        } else {
            const appendResult = await GoogleSheets.appendGoogleSheetTopics([{
                subject,
                title: finalTitle,
                keywords,
                content_guide: {
                    title: finalTitle,
                    additional_instructions: instruction,
                    reference_urls: referenceUrl ? [referenceUrl] : []
                },
                use_external_ref: externalReference,
                image_options: {
                    mode: imageMode,
                    generate: imageGenerationFinal,
                    count: requestedImageCount
                },
                source,
                trendDate,
                status: appendStatus,
                category: (requestBody?.naverCategory || requestBody?.wordpressCategory)
                    ? `N:${requestBody.naverCategory || ''}, W:${requestBody.wordpressCategory || ''}`
                    : (requestBody?.category || ''),
                postStatus,
                scheduleDate,
                targets: targets.join(', '),
                writing_strategy: writingStrategy
            }], {
                defaultStatus: appendStatus
            });

            if (!appendResult?.success) {
                return { success: false, code: 'TOPICS_APPEND_FAILED', message: appendResult?.message || 'topics 시트 추가에 실패했습니다.' };
            }

            rowNumber = Array.isArray(appendResult.rowNumbers) ? appendResult.rowNumbers[0] : null;
            rowIndex = Array.isArray(appendResult.rowIndices) ? appendResult.rowIndices[0] : null;

            setQuickPublishRecentEntry(dedupeKey, {
                rowNumber,
                rowIndex,
                status: appendStatus,
                published: false,
                targetDir: null,
                updatedAtMs: nowMs
            });
        }

        if (publishMode === 'append_only') {
            await recordTopicRecommendationOutcome({
                requestBody,
                stage: 'saved',
                subject: finalSubject,
                entityRef: Number.isInteger(rowIndex) ? `topics-row-${rowIndex}` : dedupeKey,
                resultRef: String(rowNumber || rowIndex || dedupeKey)
            });
            return {
                success: true,
                data: {
                    mode: publishMode,
                    executionMode: publishMode,
                    postStatus,
                    sheet: CONFIG.GOOGLE_TOPICS_SHEET || 'topics',
                    rowNumber,
                    rowIndex,
                    status: appendStatus,
                    deduplicated
                }
            };
        }

        const publishParams = {
            context: {
                subject,
                title: finalTitle,
                keywords,
                instruction,
                referenceUrls: referenceUrl ? [referenceUrl] : [],
                useExternalRef: externalReference,
                imageOptions: {
                    mode: imageMode,
                    generate: imageGenerationFinal,
                    count: requestedImageCount
                },
                category: requestBody?.category || '',
                naverCategory: requestBody?.naverCategory || '',
                wordpressCategory: requestBody?.wordpressCategory || '',
                postStatus,
                scheduleDate,
                writingStrategy
            },
            targets,
            headless,
            features,
            enableRelatedPostsAutoLink
        };

        if (!workspaceDraft) {
            await recordTopicRecommendationOutcome({
                requestBody,
                stage: 'saved',
                subject: finalSubject,
                entityRef: Number.isInteger(rowIndex) ? `topics-row-${rowIndex}` : dedupeKey,
                resultRef: String(rowNumber || rowIndex || dedupeKey)
            });
        }

        if (publishMode === 'append_and_generate') {
            const generated = await buildMultiPlatformGeneratedContent(publishParams, {
                signal,
                textModelConfig: executionOptions.textModelConfig,
                imageModelConfig: executionOptions.imageModelConfig,
                onStage: executionOptions.onStage,
                transientWorkspaceDir: workspaceDraft ? executionOptions.transientWorkspaceDir : undefined
            });
            throwIfCanceled(signal);
            if (!generated.success) {
                if (Number.isInteger(rowIndex)) {
                    await GoogleSheets.updateGoogleSheetStatus(rowIndex, '발행 준비 완료', generated.message || '생성 실패');
                }
                if (!workspaceDraft) {
                    setQuickPublishRecentEntry(dedupeKey, {
                        rowNumber,
                        rowIndex,
                        status: '발행 준비 완료',
                        published: false,
                        targetDir: null,
                        updatedAtMs: Date.now()
                    });
                }
                return { success: false, code: 'GENERATE_FAILED', message: generated.message || '저장 및 생성에 실패했습니다.' };
            }

            const targetDirs = {
                naver: generated.results?.naver?.targetDir || null,
                wordpress: generated.results?.wordpress?.targetDir || null
            };
            const primaryTarget = selectQuickPublishPreviewTarget(targets, targetDirs);
            const primaryTargetDir = primaryTarget ? targetDirs[primaryTarget] : '';
            if (!primaryTargetDir) {
                return { success: false, code: 'QUICK_PREVIEW_TARGET_MISSING', message: '미리보기에 사용할 생성 결과를 찾지 못했습니다.' };
            }

            const previewId = crypto.randomUUID();
            if (typeof trackQuickPublishPreviewDirs === 'function') {
                trackQuickPublishPreviewDirs(targetDirs, previewId);
            }
            const previewsByTarget = {};
            if (targetDirs.naver) {
                const previewData = buildQuickPreviewDataFromDirectory({
                    directoryPath: targetDirs.naver,
                    previewId,
                    target: 'naver',
                    targets,
                    postStatus,
                    scheduleDate,
                    imageGeneration: imageGenerationFinal
                });
                previewsByTarget.naver = {
                    ...previewData,
                    images: Array.isArray(previewData.images)
                        ? previewData.images.map((image) => ({
                            ...image,
                            previewUrl: ''
                        }))
                        : []
                };
            }
            if (targetDirs.wordpress) {
                const previewData = buildQuickPreviewDataFromDirectory({
                    directoryPath: targetDirs.wordpress,
                    previewId,
                    target: 'wordpress',
                    targets,
                    postStatus,
                    scheduleDate,
                    imageGeneration: imageGenerationFinal
                });
                previewsByTarget.wordpress = {
                    ...previewData,
                    images: Array.isArray(previewData.images)
                        ? previewData.images.map((image) => ({
                            ...image,
                            previewUrl: ''
                        }))
                        : []
                };
            }
            const previewResponse = registerQuickPublishPreviewSession({
                previewId,
                rowIndex,
                rowNumber,
                dedupeKey,
                imageGenerationRequested: imageGenerationFinal,
                targets,
                primaryTarget,
                targetDirs,
                previewsByTarget,
                subject: finalSubject,
                recommendation: requestBody?.recommendation || null
            });

            if (!workspaceDraft) {
                setQuickPublishRecentEntry(dedupeKey, {
                    rowNumber,
                    rowIndex,
                    status: '발행 준비 완료',
                    published: false,
                    targetDir: primaryTargetDir,
                    updatedAtMs: Date.now()
                });
            }

            if (!workspaceDraft && Number.isInteger(rowIndex)) {
                await GoogleSheets.updateGoogleSheetStatus(rowIndex, '발행 준비 완료', `생성 완료 (${primaryTarget}): ${path.basename(primaryTargetDir)}`);
            }


            return {
                success: true,
                data: {
                    mode: publishMode,
                    executionMode: publishMode,
                    postStatus,
                    sheet: CONFIG.GOOGLE_TOPICS_SHEET || 'topics',
                    rowNumber,
                    rowIndex,
                    status: '생성 완료',
                    deduplicated,
                    ...previewResponse
                }
            };
        }

        try {
            const publishRes = await processMultiPlatformPublish(publishParams, {
                isLast: true,
                source: 'quick-publish',
                stableKey: Number.isInteger(rowIndex) ? `topics-row-${rowIndex}` : dedupeKey,
                operationId: requestBody?.operationId
            });

            if (!publishRes.success) {
                if (Number.isInteger(rowIndex)) {
                    await GoogleSheets.updateGoogleSheetStatus(rowIndex, '발행 준비 완료', publishRes.message || '발행 실패');
                }
                setQuickPublishRecentEntry(dedupeKey, {
                    rowNumber,
                    rowIndex,
                    status: '발행 준비 완료',
                    published: false,
                    targetDir: null,
                    updatedAtMs: Date.now()
                });
                return { success: false, code: publishRes.code || 'PUBLISH_FAILED', message: publishRes.message };
            }

            const naverPubSuccess = publishRes.results.naver.success;
            const wpPubSuccess = publishRes.results.wordpress.success;
            const naverDir = publishRes.results.naver.targetDir;
            const wpDir = publishRes.results.wordpress.targetDir;

            if (Number.isInteger(rowIndex)) {
                const logArr = [];
                if (naverPubSuccess) logArr.push('네이버 완료');
                if (wpPubSuccess) logArr.push('워드프레스 완료');

                const finalStatusStr = (naverPubSuccess || wpPubSuccess) ? getCompletionStatusLabel(postStatus) : '실패';
                const finalLogStr = logArr.length > 0 ? logArr.join('/') : (publishRes.message || '실패');
                await GoogleSheets.updateGoogleSheetStatus(rowIndex, finalStatusStr, finalLogStr);
            }

            const summaryStatus = (naverPubSuccess || wpPubSuccess) ? getCompletionStatusLabel(postStatus) : '발행 실패';
            setQuickPublishRecentEntry(dedupeKey, {
                rowNumber,
                rowIndex,
                status: summaryStatus,
                published: true,
                targetDir: naverDir || wpDir,
                updatedAtMs: Date.now()
            });

            await recordTopicRecommendationTerminalResults({
                requestBody,
                subject: finalSubject,
                postStatus,
                results: publishRes.results,
                operationId: publishRes.operationId
            });

            return {
                success: true,
                data: {
                    mode: publishMode,
                    executionMode: publishMode,
                    postStatus,
                    sheet: CONFIG.GOOGLE_TOPICS_SHEET || 'topics',
                    rowNumber,
                    rowIndex,
                    status: summaryStatus,
                    deduplicated,
                    targetDir: naverDir || wpDir
                }
            };
        } catch (error) {
            if (Number.isInteger(rowIndex)) {
                await GoogleSheets.updateGoogleSheetStatus(rowIndex, '실패', error.message);
            }
            setQuickPublishRecentEntry(dedupeKey, {
                rowNumber,
                rowIndex,
                status: '실패',
                published: false,
                targetDir: null,
                updatedAtMs: Date.now()
            });
            return {
                success: false,
                code: 'QUICK_PUBLISH_FAILED',
                message: error.message
            };
        }
    }

    async function prepareMissingImagesForLocalMarkdown(tempDir, previewData, runtimeOptions = {}) {
        if (runtimeOptions.imageGenerationEnabled === false) return;

        const missingImages = Array.isArray(previewData?.images)
            ? previewData.images.filter((item) => !item.exists)
            : [];
        if (missingImages.length === 0) return;

        let lastCall = 0;
        for (const image of missingImages) {
            const prompt = String(image.prompt || '').trim();
            if (!prompt) continue;

            const now = Date.now();
            if (lastCall > 0 && (now - lastCall) < 1000) {
                await sleep(1000);
            }

            Logger.info(`   🎨 [LocalMarkdown] 누락 이미지 생성 중 (Index ${image.index})`);
            try {
                const generated = await blogWritingApplication.generateImage(prompt, {}, {
                    ...(runtimeOptions.signal ? { signal: runtimeOptions.signal } : {})
                });
                if (typeof generated?.dataBase64 !== 'string' || !generated.dataBase64.trim()) {
                    throw Object.assign(new Error('AI Gateway가 올바른 이미지 결과를 반환하지 않았습니다.'), { code: 'AI_GATEWAY_INVALID_PROVIDER_RESPONSE' });
                }
                const imageBuffer = Buffer.from(generated.dataBase64, 'base64');
                if (imageBuffer.length === 0) throw Object.assign(new Error('AI Gateway 이미지 결과가 비어 있습니다.'), { code: 'AI_GATEWAY_INVALID_PROVIDER_RESPONSE' });
                fs.writeFileSync(path.join(tempDir, `${String(image.index).padStart(2, '0')}_image.png`), imageBuffer);
            } catch (imageError) {
                Logger.warn(`⚠️ [LocalMarkdown] 누락 이미지 생성 실패 (Index ${image.index}): ${imageError.message}`);
            }
            lastCall = Date.now();
        }
    }

    async function executeLocalMarkdownPublish(requestBody = {}, executionOptions = {}) {
        const signal = executionOptions.signal;
        const throwIfStopped = () => {
            if (!signal?.aborted) return;
            const error = new Error('블로그 포스팅을 중지했습니다. 이미 처리된 업로드·발행은 되돌리지 않습니다.');
            error.code = 'BLOG_NEXT_EXECUTION_STOPPED';
            throw error;
        };
        throwIfStopped();
        const selectedFiles = Array.isArray(requestBody?.selectedFiles) ? requestBody.selectedFiles : [];
        const hasPastedMarkdown = Object.prototype.hasOwnProperty.call(requestBody, 'markdownText');
        const markdownText = hasPastedMarkdown ? String(requestBody.markdownText || '') : '';
        const targets = normalizePublishTargets(Array.isArray(requestBody?.targets) ? requestBody.targets : ['naver']);
        const headless = typeof requestBody?.headless === 'boolean' ? requestBody.headless : Boolean(CONFIG.HEADLESS);
        const postStatus = String(requestBody?.postStatus || 'publish').trim() || 'publish';
        const scheduleDate = String(requestBody?.scheduleDate || '').trim();
        try {
            assertDirectPublishAllowed(CONFIG, { postStatus });
        } catch (error) {
            return {
                success: false,
                code: error.code || MANUAL_PUBLISH_BLOCKED_CODE,
                message: error.message
            };
        }
        let imageMode;
        try {
            imageMode = parseBlogImageMode(requestBody?.imageMode, {
                legacyGenerate: typeof requestBody?.imageGeneration === 'boolean'
                    ? requestBody.imageGeneration : undefined,
                fallback: 'prompt_only'
            });
        } catch (error) {
            return { success: false, code: error.code, message: error.message };
        }

        if (selectedFiles.length === 0 && !markdownText.trim()) {
            return { success: false, code: 'INVALID_LOCAL_MARKDOWN_SOURCE', message: '선택하거나 붙여넣은 원고가 없습니다.' };
        }
        if (targets.length !== 1) {
            return {
                success: false,
                code: targets.length === 0 ? 'PUBLISH_TARGET_REQUIRED' : 'MULTIPLE_PUBLISH_TARGETS',
                message: '하나의 원고에는 발행 대상을 하나만 선택해 주세요.'
            };
        }
        if (postStatus === 'schedule' && !scheduleDate) {
            return { success: false, code: 'INVALID_SCHEDULE_DATE', message: '예약 발행을 위해서는 예약 일시가 필요합니다.' };
        }

        throwIfStopped();
        const precheck = await License.checkLicenseStatus();
        if (!precheck.success) {
            return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
        }

        const features = toFeatureMap(precheck.features);
        const imageGenerationFinal = generatesBlogImages(imageMode);
        const relatedPostsEnabled = getFeatureBool(features, 'enable_related_posts_auto_link', false);
        const sourceType = hasPastedMarkdown ? 'pasted_markdown' : 'local_markdown';
        const sourceLabel = hasPastedMarkdown
            ? '붙여넣은 원고'
            : (String(requestBody?.folderName || '').trim() || '원고 폴더');
        let effectiveMarkdownText = imageMode === 'none'
            ? stripBlogImagePromptBlocks(markdownText)
            : markdownText;
        const effectiveSelectedFiles = imageMode === 'none'
            ? selectedFiles.map((entry) => ({
                ...entry,
                textContent: typeof entry?.textContent === 'string'
                    ? stripBlogImagePromptBlocks(entry.textContent)
                    : entry?.textContent
            }))
            : selectedFiles;
        let previewData;
        try {
            previewData = buildLocalMarkdownPreview({
                folderName: requestBody?.folderName,
                selectedFiles: effectiveSelectedFiles,
                ...(hasPastedMarkdown ? { markdownText: effectiveMarkdownText } : {}),
                targets,
                postStatus,
                scheduleDate,
                imageGeneration: imageGenerationFinal
            }, {
                fs,
                path,
                findImageByPrefix,
            });
        } catch (error) {
            return { success: false, code: 'LOCAL_MARKDOWN_PREVIEW_INVALID', message: error.message || '원고 검증에 실패했습니다.' };
        }

        if (!previewData?.validation?.ok) {
            return {
                success: false,
                code: 'LOCAL_MARKDOWN_VALIDATION_FAILED',
                message: previewData.validation.errors.join(' / ') || '원고 검증에 실패했습니다.'
            };
        }

        if (requestBody?.usePluginPublisher === true) {
            if (!['draft', 'publish'].includes(postStatus)) {
                return {
                    success: false,
                    code: 'WORDPRESS_PLUGIN_STATUS_UNSUPPORTED',
                    message: '현재 WordPress Plugin 발행 경로는 임시 저장과 즉시 발행만 지원합니다.'
                };
            }
            if (typeof blogPublishingApplication?.publishWordPressPlugin !== 'function') {
                return { success: false, code: 'BLOG_PLUGIN_HOST_UNAVAILABLE', message: 'WordPress Plugin 실행 경로를 준비하지 못했습니다.' };
            }
        }

        if (hasPastedMarkdown && relatedPostsEnabled) {
            try {
                Logger.info('🔎 [PastedMarkdown] 관련 글 자동 수집 중...');
                const relatedPosts = await relatedPostsService.fetchOwnBlogRelatedPosts({
                    title: previewData.title,
                    content: previewData.rawMarkdown,
                    keywords: []
                }, 3);
                if (relatedPosts.length > 0) {
                    const heading = relatedPostsService.pickHeading();
                    const relatedSection = blogPostingApplication.buildRelatedPostsSectionMarkdown(relatedPosts, heading, true);
                    effectiveMarkdownText = appendRelatedPostsToPastedMarkdown(
                        effectiveMarkdownText,
                        relatedSection,
                        blogPostingApplication.stripAiRelatedPostsSection
                    );
                    previewData = buildLocalMarkdownPreview({
                        markdownText: effectiveMarkdownText,
                        targets,
                        postStatus,
                        scheduleDate,
                        imageGeneration: imageGenerationFinal
                    }, {
                        fs,
                        path,
                        findImageByPrefix,
                    });
                    Logger.info(`🔗 [PastedMarkdown] 관련 글 ${relatedPosts.length}개 자동 추가 완료`);
                } else {
                    Logger.info('ℹ️ [PastedMarkdown] 추가할 관련 글을 찾지 못했습니다.');
                }
            } catch (relatedError) {
                Logger.warn(`⚠️ [PastedMarkdown] 관련 글 자동 추가 실패: ${relatedError.message}`);
            }
        }

        let workspace = null;
        const operationId = requestBody?.operationId || createPublishOperationId({
            scope: sourceType,
            stableKey: requestBody?.requestId || '',
            postStatus
        });
        const results = {};
        let quotaReserved = false;
        try {
            await recordBlogSelection({
                operationId,
                subject: previewData.title || sourceLabel,
                source: sourceType,
                targets,
                entityRef: previewData?.source?.fileName || operationId
            });
            workspace = materializeSelectedFilesToWorkspace({
                selectedFiles: effectiveSelectedFiles,
                ...(hasPastedMarkdown ? { markdownText: effectiveMarkdownText } : {})
            }, { fs, path });
            throwIfStopped();
            await prepareMissingImagesForLocalMarkdown(workspace.tempDir, previewData, {
                imageGenerationEnabled: imageGenerationFinal,
                signal
            });

            throwIfStopped();
            requestBody?.onPreparationComplete?.();
            const reservation = await reserveQuota(operationId, { source: sourceType, post_status: postStatus, targets });
            quotaReserved = true;
            const executionTargets = applyPreviouslySuccessfulTargets(results, targets, reservation);
            const actionLabel = getPostActionLabel(postStatus);

            if (executionTargets.includes('naver')) {
                throwIfStopped();
                const naverRes = await publishNaver(workspace.tempDir, {
                    headless,
                    category: requestBody?.naverCategory || '',
                    postStatus,
                    scheduleDate,
                    isLast: !targets.includes('wordpress'),
                    onProgress: requestBody?.onNaverProgress,
                    signal
                }) || { success: false, message: '네이버 포스팅 응답이 비어 있습니다.' };
                results.naver = {
                    success: Boolean(naverRes.success),
                    message: naverRes.message || '',
                    postUrl: naverRes.postUrl || '',
                    status: naverRes.status || postStatus
                };
                if (naverRes.success && CONFIG.NOTIFY_TELEGRAM_ENABLED) {
                    const urlMsg = naverRes.postUrl ? `\n\n🔗 [글 보기](${naverRes.postUrl})` : '';
                    await TelegramBotService.sendNotification(`✅ *네이버 블로그 ${getPostActionLabel(naverRes.status || postStatus)} 완료!*${urlMsg}`);
                }
            }

            if (executionTargets.includes('wordpress')) {
                let wpRes;
                if (requestBody?.usePluginPublisher === true) {
                    const bodyMarkdown = String(previewData.rawMarkdown || '').replace(/^#\s+.+\n?/, '').trim();
                    const wordpressContent = buildWordPressPluginContent(bodyMarkdown, previewData.images, workspace.tempDir);
                    const featuredAsset = wordpressContent.assets[0]?.key || '';
                    if (typeof blogPublishingApplication?.publishWordPressPlugin !== 'function') {
                        wordpressContent.assets.forEach((asset, index) => {
                            Logger?.info?.(`[Blog Beta][Publishing] 이미지 업로드 준비 (${index + 1}/${wordpressContent.assets.length}, mime=${asset.mimeType}, bytes=${asset.bytes.length})`);
                        });
                    }
                    Logger?.info?.(`[Blog Beta][Publishing] WordPress 발행 시작 (assets=${wordpressContent.assets.length})`);
                    try {
                        const publishRequest = {
                            title: previewData.title,
                            content: marked.parse(wordpressContent.contentMarkdown),
                            status: postStatus,
                            category: requestBody?.wordpressCategory || '',
                            assets: wordpressContent.assets,
                            ...(featuredAsset ? { featuredAsset } : {})
                        };
                        wpRes = await blogPublishingApplication.publishWordPressPlugin(publishRequest, { signal });
                    } catch (error) {
                        Logger?.error?.(`[Blog Beta][Publishing] WordPress 발행 실패 (code=${String(error?.code || error?.apiCode || error?.name || 'unknown').slice(0, 80)})`);
                        throw error;
                    }
                    Logger?.info?.(`[Blog Beta][Publishing] WordPress 발행 완료 (success=${wpRes?.success === true}, requestedAssets=${wordpressContent.assets.length}, warnings=${Array.isArray(wpRes?.warnings) ? wpRes.warnings.length : 0})`);
                } else {
                    wpRes = await publishWordPressManuscript(workspace.tempDir, {
                        category: requestBody?.wordpressCategory || '',
                        postStatus,
                        wpScheduleDate: scheduleDate || '',
                        imageGeneration: imageGenerationFinal
                    });
                }
                wpRes = wpRes || { success: false, message: '워드프레스 포스팅 응답이 비어 있습니다.' };
                results.wordpress = {
                    success: Boolean(wpRes.success),
                    message: wpRes.message || '',
                    postId: wpRes.postId ? String(wpRes.postId) : '',
                    postUrl: wpRes.postUrl || '',
                    status: wpRes.status || postStatus,
                    warnings: Array.isArray(wpRes.warnings) ? wpRes.warnings.filter((warning) => typeof warning === 'string') : []
                };
                if (wpRes.success && CONFIG.NOTIFY_TELEGRAM_ENABLED) {
                    const urlMsg = wpRes.postUrl ? `\n\n🔗 [글 보기](${wpRes.postUrl})` : '';
                    await TelegramBotService.sendNotification(`✅ *워드프레스 ${getPostActionLabel(wpRes.status || postStatus)} 완료!*${urlMsg}`);
                }
            }

            const quotaSettlement = await settleQuota(operationId, results, {
                successful_targets: Object.keys(results).filter((target) => results[target]?.success)
            });
            quotaReserved = false;
            await recordBlogTerminalResults({
                operationId,
                subject: previewData.title || sourceLabel,
                source: sourceType,
                postStatus,
                results
            });
            const failedTargets = Object.entries(results)
                .filter(([, value]) => value && value.success === false)
                .map(([platform, value]) => `${platform}: ${value.message || '실패'}`);

            if (failedTargets.length > 0) {
                return {
                    success: false,
                    code: 'LOCAL_MARKDOWN_PUBLISH_FAILED',
                    message: failedTargets.join(' / '),
                    data: {
                        status: '일부 포스팅 실패',
                        results,
                        operationId,
                        quotaSettlement
                    }
                };
            }

            const successfulStatuses = Object.values(results)
                .filter((result) => result?.success)
                .map((result) => result.status === 'future' ? 'schedule' : String(result.status || postStatus));
            const actualPostStatus = successfulStatuses.includes('draft')
                ? 'draft'
                : (successfulStatuses.length > 0 && successfulStatuses.every((status) => status === 'schedule') ? 'schedule' : postStatus);
            const safetyAdjustedTargets = Object.entries(results)
                .filter(([, result]) => result?.success && result.status === 'draft' && postStatus !== 'draft')
                .map(([target]) => target);
            return {
                success: true,
                data: {
                    status: getCompletionStatusLabel(actualPostStatus),
                    postStatus: actualPostStatus,
                    requestedPostStatus: postStatus,
                    safetyAdjustedTargets,
                    results,
                    operationId,
                    quotaSettlement,
                    source: {
                        folderName: previewData?.source?.folderName || '',
                        fileName: previewData?.source?.fileName || ''
                    }
                }
            };
        } catch (error) {
            if (quotaReserved) {
                await settleQuota(operationId, results, { error: error.message });
            }
            if (signal?.aborted || error.code === 'BLOG_NEXT_EXECUTION_STOPPED') {
                const message = '블로그 포스팅을 중지했습니다. 이미 처리된 업로드·발행은 되돌리지 않습니다.';
                return { success: false, code: 'BLOG_NEXT_EXECUTION_STOPPED', message };
            }
            Logger.error(`❌ [LocalMarkdownPublish] 오류: ${error.message}`);
            return { success: false, code: 'LOCAL_MARKDOWN_PUBLISH_FAILED', message: error.message || '원고 포스팅에 실패했습니다.' };
        } finally {
            if (workspace?.tempDir) {
                try {
                    fs.rmSync(workspace.tempDir, { recursive: true, force: true });
                } catch (_cleanupError) { }
            }
        }
    }


    return {
        buildMultiPlatformGeneratedContent,
        executeLocalMarkdownPublish,
        executeQuickPreviewPublish,
        executeQuickPublish,
        getQuickPreviewImagePayload,
        processMultiPlatformPublish
    };
}

module.exports = {
    createBlogManualPublishingApplication
};
