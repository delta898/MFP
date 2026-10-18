'use strict';

const fsDefault = require('node:fs');
const pathDefault = require('node:path');
const momentDefault = require('moment-timezone');
const blogPromptPaths = require('../../../content/prompts/blog/paths');
const { buildBlogGenerationPrompt } = require('../../../content/blog-generation-prompt');
const { collectBlogReferenceContext } = require('../../../content/blog-reference-context');
const { validateBlogImageBlocks } = require('../../../content/blog-image-plan');
const { normalizeBlogImageMode, generatesBlogImages } = require('../../../content/blog-image-mode');
const { rethrowIfCanceled, sleepWithCancellation, throwIfCanceled } = require('../../../utilities/async/cancellation');
const { buildRelatedPostsSectionMarkdown, stripAiRelatedPostsSection } = require('./related-posts-markdown');

function normalizeHashtagTokens(rawHashtags, maxCount = 20) {
    const source = Array.isArray(rawHashtags) ? rawHashtags : [rawHashtags];
    const normalized = [];
    const seen = new Set();
    for (const item of source) {
        if (item === null || item === undefined) continue;
        for (const tokenRaw of String(item).split(/[\s,]+/)) {
            const token = String(tokenRaw || '').trim().replace(/^[#＃]+/, '').replace(/^[^0-9A-Za-z가-힣_]+/, '').replace(/[^0-9A-Za-z가-힣_]+$/, '');
            if (!token) continue;
            const key = token.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            normalized.push(token);
            if (normalized.length >= maxCount) return normalized;
        }
    }
    return normalized;
}

function createBlogPostingApplication(options = {}) {
    const writing = options.blogWritingApplication;
    const Utils = options.Utils;
    const CONFIG = options.CONFIG || {};
    const promptPaths = options.blogPromptPaths || blogPromptPaths;
    const Logger = options.Logger || console;
    const fs = options.fs || fsDefault;
    const path = options.path || pathDefault;
    const moment = options.moment || momentDefault;
    if (typeof writing?.generateText !== 'function' || typeof writing?.generateImage !== 'function') {
        throw new TypeError('Blog Posting Application requires Blog Writing Application.');
    }
    if (!Utils || typeof Utils.parseStructuredJsonResponse !== 'function' || typeof Utils.parseMarkdown !== 'function') {
        throw new TypeError('Blog Posting Application requires content utilities.');
    }

    async function generateContent(jobData, customDir = null, runtimeOptions = {}) {
        const signal = runtimeOptions.signal;
        throwIfCanceled(signal);
        Logger.info('🚀 [Blog Posting] 콘텐츠 생성 프로세스 시작');
        const hasSubject = Boolean(jobData.subject);
        const hasKeywords = Array.isArray(jobData.keywords) && jobData.keywords.length > 0;
        const hasInstructions = Boolean(jobData.content_guide?.additional_instructions);
        const hasRef = Array.isArray(jobData.content_guide?.reference_urls) && jobData.content_guide.reference_urls.length > 0;
        const useExternalRef = jobData.use_external_ref === true;
        const effectivePostStatusRaw = String(jobData.post_status || jobData.postStatus || runtimeOptions.postStatus || runtimeOptions.post_status || 'draft').trim().toLowerCase();
        const effectivePostStatusLabel = effectivePostStatusRaw === 'publish' ? '즉시 발행' : effectivePostStatusRaw === 'schedule' ? '예약 발행' : '임시저장';
        Logger.info('┌─────────────────────────────────────────');
        Logger.info(`│ 📌 주제       : ${jobData.subject || '(없음)'}`);
        Logger.info(`│ 📝 제목       : ${jobData.title || jobData.content_guide?.title || '(AI 생성)'}`);
        Logger.info(`│ 🏷️  키워드     : ${hasKeywords ? jobData.keywords.join(', ') : '(없음)'}`);
        Logger.info(`│ 🔗 참고 URL   : ${hasRef ? jobData.content_guide.reference_urls.join(', ') : '(없음)'}`);
        Logger.info(`│ 🌐 외부 참고  : ${useExternalRef ? '✅ 예' : '❌ 아니오'}`);
        const loggedImageMode = normalizeBlogImageMode(jobData.image_options?.mode, { legacyGenerate: jobData.image_options?.generate, fallback: 'prompt_only' });
        Logger.info(`│ 🖼️ 이미지 처리: ${loggedImageMode === 'generate' ? '이미지 생성' : (loggedImageMode === 'none' ? '미포함' : '프롬프트 포함')}`);
        Logger.info(`│ 🤖 TEXT 모델  : ${String(runtimeOptions.textModelConfig?.name || runtimeOptions.textModelConfig?.code || CONFIG.TEXT_MODEL_NAME || CONFIG.TEXT_MODEL || '(없음)')}`);
        Logger.info(`│ 🎨 IMG 모델   : ${String(runtimeOptions.imageModelConfig?.name || runtimeOptions.imageModelConfig?.code || CONFIG.IMAGE_MODEL_NAME || CONFIG.IMAGE_MODEL || '(없음)')}`);
        Logger.info(`│ 📤 발행 옵션  : ${effectivePostStatusLabel}`);
        Logger.info('└─────────────────────────────────────────');
        if (!hasSubject && !hasKeywords && !hasRef && !hasInstructions) {
            throw new Error('❌ [Error] 주제, 키워드, 지시사항, URL 중 적어도 하나는 필요합니다.');
        }

        const { referenceContext } = await collectBlogReferenceContext({
            Utils,
            Logger,
            signal,
            jobData,
            referenceSearchGateway: options.referenceSearchGateway
        });
        const requestedTitle = String(jobData.title || jobData.content_guide?.title || '').trim();
        const resolvedPrompt = buildBlogGenerationPrompt({
            profile: CONFIG.CONTENT_WRITING_PROFILE,
            strategy: jobData.writing_strategy || jobData.writingStrategy || jobData.options?.writing_strategy,
            globalStrategy: CONFIG.BLOG_WRITING_STRATEGY,
            config: CONFIG,
            promptPaths: promptPaths,
            post: {
                subject: jobData.subject,
                title: requestedTitle,
                keywords: jobData.keywords,
                instruction: jobData.content_guide?.additional_instructions,
                image_mode: jobData.image_options?.mode,
                image_generate: jobData.image_options?.generate,
                image_count: jobData.image_options?.count,
                reference_context: referenceContext,
                writing_overrides: jobData.content_guide?.writing_overrides || jobData.writing_overrides || jobData.options?.writing_overrides
            }
        });
        Logger.info('📝 AI에게 글 작성을 요청합니다...');
        const rawResult = await writing.generateText(resolvedPrompt.prompt, {
            ...(signal ? { signal } : {}),
            ...(runtimeOptions.textModelConfig ? { modelSelection: { provider: runtimeOptions.textModelConfig.provider, modelId: runtimeOptions.textModelConfig.code || runtimeOptions.textModelConfig.modelId } } : {})
        });
        throwIfCanceled(signal);
        if (!rawResult) throw new Error('API 응답이 비어있습니다.');
        let parsedData;
        try {
            parsedData = Utils.parseStructuredJsonResponse(rawResult);
        } catch (error) {
            Logger.error(`❌ JSON 파싱 실패. 원본 응답 (처음 500자):\n${String(rawResult).substring(0, 500)}...`);
            throw new Error(`JSON 파싱 에러: ${error.message}. AI 응답이 올바른 JSON 형식이 아닙니다.`);
        }
        validateBlogImageBlocks(parsedData.content, resolvedPrompt.image_plan);
        const finalSubject = requestedTitle || parsedData.title || parsedData.subject || jobData.subject || '제목 없음';
        const finalContent = parsedData.content || '';
        const finalHashtags = normalizeHashtagTokens(parsedData.hashtags || [], 20);
        const enableRelatedPostsAutoLink = runtimeOptions.enableRelatedPostsAutoLink !== false;
        const platform = String(runtimeOptions.platform || 'naver').toLowerCase();
        let relatedPostsMarkdown = '';
        if (enableRelatedPostsAutoLink) {
            if (platform === 'wordpress') {
                Logger.info('🔎 [WordPress] 하이브리드 관련 글 수집 중...');
                try {
                    const wpRandomPosts = await Utils.fetchWordPressRandomPosts(CONFIG.WORDPRESS_URL, 2);
                    throwIfCanceled(signal);
                    const naverRandomPosts = await Utils.fetchOwnBlogRelatedPosts({ title: finalSubject, content: finalContent, keywords: jobData.keywords || [] }, 2);
                    throwIfCanceled(signal);
                    const combinedPosts = Utils._shuffleArray([...wpRandomPosts, ...naverRandomPosts]).slice(0, 3);
                    if (combinedPosts.length > 0) {
                        relatedPostsMarkdown = Utils.generateRelatedPostsMarkdown(combinedPosts);
                        Logger.info(`🔗 [WordPress] 관련 글 ${combinedPosts.length}개 자동 생성 완료`);
                    }
                } catch (error) {
                    rethrowIfCanceled(error, signal);
                    Logger.error(`⚠️ [WordPress] 관련 글 수집 중 오류: ${error.message}`);
                }
            } else {
                Logger.info('🔎 [Blog] 네이버 관련 글 자동 수집 중...');
                const relatedPosts = await Utils.fetchOwnBlogRelatedPosts({ title: finalSubject, content: finalContent, keywords: jobData.keywords || [] }, 3);
                throwIfCanceled(signal);
                if (relatedPosts.length > 0) {
                    relatedPostsMarkdown = `\n\n${buildRelatedPostsSectionMarkdown(relatedPosts, Utils.pickRelatedPostsHeading(), true, Utils)}`;
                    Logger.info(`🔗 [Blog] 관련 글 자동 수집 완료 (${relatedPosts.length}건)`);
                } else Logger.info('ℹ️ [Blog] 관련 글 수집 결과 없음');
            }
        } else Logger.info('ℹ️ [Blog Posting] 관련 글 자동 링크 기능 비활성화');

        throwIfCanceled(signal);
        const safeSubject = Utils.sanitizeFileName(String(finalSubject));
        const targetDir = customDir
            ? path.resolve(customDir)
            : path.join(Utils.resolvePlatformWorkspaceDir(runtimeOptions.platform), `${moment().tz('Asia/Seoul').format('YYYYMMDD_HHmmss')}_${safeSubject}`);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        let pureContent = String(finalContent).replace(/^#\s+.+\n?/, '').trim();
        pureContent = stripAiRelatedPostsSection(pureContent);
        const hashtagLine = finalHashtags.length > 0 ? `\n\n\n${finalHashtags.map((tag) => `#${tag}`).join(' ')}` : '';
        fs.writeFileSync(path.join(targetDir, 'contents.md'), `# ${finalSubject}\n${pureContent}${relatedPostsMarkdown}${hashtagLine}`, 'utf8');
        return { targetDir, finalSubject, imagePlan: resolvedPrompt.image_plan };
    }

    async function prepareImages(dirPath, jobData, runtimeOptions = {}) {
        const signal = runtimeOptions.signal;
        throwIfCanceled(signal);
        if (runtimeOptions.imageGenerationEnabled === false) {
            Logger.info('🖼️ 이미지 생성 기능이 플랜 정책으로 비활성화되어 건너뜁니다.');
            return;
        }
        const imageMode = normalizeBlogImageMode(jobData.image_options?.mode, { legacyGenerate: jobData.image_options?.generate, fallback: 'prompt_only' });
        if (!generatesBlogImages(imageMode)) {
            Logger.info(imageMode === 'none' ? '🖼️ 이미지 사용 안 함 옵션입니다.' : '🖼️ 이미지 프롬프트만 유지합니다.');
            return;
        }
        const contentFile = path.join(dirPath, 'contents.md');
        if (!fs.existsSync(contentFile)) return;
        const { contents } = Utils.parseMarkdown(fs.readFileSync(contentFile, 'utf8'));
        const imageItems = contents.filter((item) => item.type === 'image');
        const reportImageProgress = (progress) => {
            try { runtimeOptions.onImageProgress?.(progress); }
            catch (error) { Logger.debug(`⚠️ [Blog Posting] 이미지 진행 상태 전달 실패: ${error.message}`); }
        };
        let lastCall = 0;
        for (let imagePosition = 0; imagePosition < imageItems.length; imagePosition += 1) {
            const item = imageItems[imagePosition];
            throwIfCanceled(signal);
            if (lastCall > 0 && Date.now() - lastCall < 1000) {
                await sleepWithCancellation(1000, signal, (ms) => Utils.sleep(ms));
            }
            const imageProgress = { current: imagePosition + 1, total: imageItems.length, imageIndex: item.index };
            Logger.info(`   🎨 이미지 생성 중 (${imageProgress.current}/${imageProgress.total})`);
            reportImageProgress({ ...imageProgress, state: 'started' });
            const style = jobData.image_options?.style || CONFIG.IMAGE_STYLE || 'photorealistic';
            const prompt = `${item.prompt}, ${style}, high quality, no text`;
            try {
                const imageOptions = { aspectRatio: '4:3', size: '1K', count: 1 };
                const executionContext = {
                    ...(signal ? { signal } : {}),
                    ...(typeof runtimeOptions.reportImageProgress === 'function' ? { reportProgress: runtimeOptions.reportImageProgress } : {})
                };
                if (runtimeOptions.imageModelConfig) executionContext.modelSelection = {
                    provider: runtimeOptions.imageModelConfig.provider,
                    modelId: runtimeOptions.imageModelConfig.code || runtimeOptions.imageModelConfig.modelId
                };
                const generated = await writing.generateImage(prompt, imageOptions, executionContext);
                if (typeof generated?.dataBase64 !== 'string' || !generated.dataBase64.trim()) {
                    throw Object.assign(new Error('AI Gateway가 올바른 이미지 결과를 반환하지 않았습니다.'), { code: 'AI_GATEWAY_INVALID_PROVIDER_RESPONSE' });
                }
                const imageBuffer = Buffer.from(generated.dataBase64, 'base64');
                if (imageBuffer.length === 0) throw Object.assign(new Error('AI Gateway 이미지 결과가 비어 있습니다.'), { code: 'AI_GATEWAY_INVALID_PROVIDER_RESPONSE' });
                fs.writeFileSync(path.join(dirPath, `${String(item.index).padStart(2, '0')}_image.png`), imageBuffer);
                reportImageProgress({ ...imageProgress, state: 'completed' });
            } catch (error) {
                rethrowIfCanceled(error, signal);
                Logger.warn(`⚠️ 이미지 생성 실패 (Index ${item.index}): ${error.message}. 백업 프롬프트를 유지하고 다음으로 넘어갑니다.`);
                reportImageProgress({ ...imageProgress, state: 'failed' });
            }
            lastCall = Date.now();
        }
    }

    return Object.freeze({
        async preparePost(topic, settings = {}) {
            const signal = settings.signal;
            settings.onStage?.('writing');
            const generated = await generateContent(topic, settings.workspaceDir || null, {
                ...(settings.enableRelatedPostsAutoLink !== undefined ? { enableRelatedPostsAutoLink: settings.enableRelatedPostsAutoLink } : {}),
                ...(settings.platform ? { platform: settings.platform } : {}),
                ...(settings.textModelConfig ? { textModelConfig: settings.textModelConfig } : {}),
                ...(settings.imageModelConfig ? { imageModelConfig: settings.imageModelConfig } : {}),
                ...(signal ? { signal } : {})
            });
            throwIfCanceled(signal);
            settings.onStage?.('images');
            await prepareImages(generated.targetDir, topic, {
                imageGenerationEnabled: settings.imageGenerationEnabled !== false,
                ...(settings.imageModelConfig ? { imageModelConfig: settings.imageModelConfig } : {}),
                ...(signal ? { signal } : {}),
                ...(typeof settings.onImageProgress === 'function' ? { onImageProgress: settings.onImageProgress } : {}),
                ...(typeof settings.reportImageProgress === 'function' ? { reportImageProgress: settings.reportImageProgress } : {})
            });
            return generated;
        }
    });
}

module.exports = { createBlogPostingApplication, normalizeHashtagTokens };
