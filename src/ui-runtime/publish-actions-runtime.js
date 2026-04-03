function createPublishActionsRuntime(deps = {}) {
    const {
        fs,
        path,
        crypto,
        CONFIG,
        Logger,
        Utils,
        Core,
        License,
        TelegramBotService,
        buildLocalMarkdownPreview,
        materializeSelectedFilesToWorkspace,
        formatActivityTargets,
        recordUiActivity,
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
        getExecuteShoppingRowAction
    } = deps;

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

    async function buildMultiPlatformGeneratedContent(params = {}, options = {}) {
        const {
            context,
            targets,
            features,
            enableRelatedPostsAutoLink
        } = params;

        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
        const emitProgress = (message) => onProgress && onProgress(message);

        const imageGenerationEnabledByPlan = getFeatureBool(features, 'image_generation', true);
        const imageGenerationFinal = (context.imageOptions?.generate === true) && imageGenerationEnabledByPlan;

        const results = {
            naver: { success: false, message: '', targetDir: null },
            wordpress: { success: false, message: '', targetDir: null }
        };

        try {
            if (targets.includes('naver')) {
                const session = await checkAuthSessionValid();
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
                        generate: imageGenerationFinal,
                        count: context.imageOptions?.count || 4
                    }
                };
                const naverResult = await Core.generateContent(naverTopic, null, {
                    enableRelatedPostsAutoLink,
                    platform: 'naver'
                });
                results.naver.targetDir = naverResult.targetDir;
                results.finalSubject = naverResult.finalSubject;

                emitProgress('네이버 이미지 준비 중...');
                await Core.prepareImages(naverResult.targetDir, naverTopic, {
                    imageGenerationEnabled: imageGenerationFinal
                });
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
                        generate: imageGenerationFinal,
                        count: context.imageOptions?.count || 4
                    }
                };
                const wpResult = await Core.generateContent(wpTopic, null, {
                    enableRelatedPostsAutoLink,
                    platform: 'wordpress'
                });
                results.wordpress.targetDir = wpResult.targetDir;
                if (!results.finalSubject) results.finalSubject = wpResult.finalSubject;

                emitProgress('워드프레스 이미지 준비 중...');
                await Core.prepareImages(wpResult.targetDir, wpTopic, {
                    imageGenerationEnabled: imageGenerationFinal
                });
            }

            return { success: true, results };
        } catch (error) {
            Logger.error(`❌ [MultiPlatformGenerate] 오류: ${error.message}`);
            return { success: false, message: error.message, results };
        }
    }

    async function processMultiPlatformPublish(params = {}, options = {}) {
        const { context, targets, headless } = params;
        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
        const emitProgress = (message) => onProgress && onProgress(message);

        const generated = await buildMultiPlatformGeneratedContent(params, options);
        if (!generated.success) {
            return generated;
        }

        const results = generated.results || {
            naver: { success: false, message: '', targetDir: null },
            wordpress: { success: false, message: '', targetDir: null }
        };
        const imageGenerationEnabledByPlan = getFeatureBool(params.features || {}, 'image_generation', true);
        const imageGenerationFinal = (context.imageOptions?.generate === true) && imageGenerationEnabledByPlan;
        const subjectLabel = String(results.finalSubject || context.subject || '').trim() || '제목 미지정';
        const targetLabel = formatActivityTargets(targets);
        const publishLabel = context.postStatus === 'draft'
            ? '임시 저장'
            : (context.postStatus === 'schedule' ? '예약 포스팅' : '포스팅');

        try {
            recordUiActivity({
                category: 'publish',
                type: 'blog_publish_started',
                title: `${publishLabel} 시작`,
                detail: `${subjectLabel}${targetLabel ? ` · ${targetLabel}` : ''}`,
                meta: {
                    source: options.source || 'blog',
                    postStatus: context.postStatus || 'publish',
                    targets: Array.isArray(targets) ? targets.slice() : []
                }
            });
            emitProgress('라이선스 확인 중...');
            const verify = await License.verifyLicense();
            if (!verify.success) {
                throw new Error(`라이선스 확인 실패: ${verify.message}`);
            }

            if (targets.includes('naver') && results.naver.targetDir) {
                emitProgress('네이버 발행 중...');
                const naverActionLabel = getPostActionLabel(context.postStatus);
                const naverCompletionLabel = getPlatformCompletionLabel('네이버', context.postStatus);
                const naverRes = await Core.publishToBlog(results.naver.targetDir, {
                    headless,
                    category: context.naverCategory || context.category || '',
                    postStatus: context.postStatus || 'publish',
                    scheduleDate: context.scheduleDate || '',
                    isLast: options.isLast === true
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

            if (targets.includes('wordpress') && results.wordpress.targetDir) {
                emitProgress('워드프레스 발행 중...');
                const wpActionLabel = getPostActionLabel(context.postStatus);
                const wpCompletionLabel = getPlatformCompletionLabel('워드프레스', context.postStatus);
                const wpOptions = {
                    category: context.wordpressCategory || context.category || '',
                    postStatus: context.postStatus || 'draft',
                    wpScheduleDate: context.scheduleDate || '',
                    imageGeneration: imageGenerationFinal
                };
                const pubRes = await Core.publishToWordPress(results.wordpress.targetDir, wpOptions);
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

            const failedTargets = targets.filter((target) => results?.[target]?.success === false);
            recordUiActivity({
                category: 'publish',
                type: failedTargets.length > 0 ? 'blog_publish_completed_with_failures' : 'blog_publish_completed',
                level: failedTargets.length > 0 ? 'warn' : 'info',
                title: failedTargets.length > 0 ? `${publishLabel} 일부 실패` : `${publishLabel} 완료`,
                detail: `${subjectLabel}${targetLabel ? ` · ${targetLabel}` : ''}`,
                meta: {
                    source: options.source || 'blog',
                    postStatus: context.postStatus || 'publish',
                    targets: Array.isArray(targets) ? targets.slice() : [],
                    failedTargets
                }
            });
            return { success: true, results };
        } catch (error) {
            Logger.error(`❌ [CommonPublish] 오류: ${error.message}`);
            recordUiActivity({
                category: 'publish',
                type: 'blog_publish_failed',
                level: 'error',
                title: `${publishLabel} 실패`,
                detail: `${subjectLabel}${targetLabel ? ` · ${targetLabel}` : ''}${error.message ? ` · ${error.message}` : ''}`,
                meta: {
                    source: options.source || 'blog',
                    postStatus: context.postStatus || 'publish',
                    targets: Array.isArray(targets) ? targets.slice() : []
                }
            });
            return { success: false, message: error.message, results };
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
            Utils
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
        if (!isCommandEnabled(features, 'batch')) {
            return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 즉시 발행 기능이 비활성화되어 있습니다. (cmd_batch=false)' };
        }

        const generatedTargets = Array.isArray(session.targets) ? session.targets.slice() : [];
        const selectedTargets = Array.isArray(requestBody?.targets)
            ? requestBody.targets.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
            : generatedTargets.slice();
        if (selectedTargets.length === 0) {
            return { success: false, code: 'INVALID_TARGETS', message: '포스팅 대상을 하나 이상 선택해야 합니다.' };
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

        const imageGenerationEnabledByPlan = getFeatureBool(features, 'image_generation', true);
        const imageGenerationFinal = session.imageGenerationRequested === true && imageGenerationEnabledByPlan;
        const verify = await License.verifyLicense();
        if (!verify.success) {
            return { success: false, code: 'LICENSE_VERIFY_FAILED', message: verify.message };
        }

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
        try {
            if (selectedTargets.includes('naver') && session.targetDirs?.naver) {
                const naverActionLabel = getPostActionLabel(postStatus);
                const naverRes = await Core.publishToBlog(session.targetDirs.naver, {
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

            if (selectedTargets.includes('wordpress') && session.targetDirs?.wordpress) {
                const wpActionLabel = getPostActionLabel(postStatus);
                const wpRes = await Core.publishToWordPress(session.targetDirs.wordpress, {
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

            const failedTargets = Object.entries(results)
                .filter(([, value]) => value && value.success === false)
                .map(([platform, value]) => `${platform}: ${value.message || '실패'}`);

            if (Number.isInteger(session.rowIndex)) {
                if (failedTargets.length > 0) {
                    await Utils.updateGoogleSheetStatus(session.rowIndex, '발행 준비 완료', failedTargets.join(' / '));
                } else {
                    const completionStatus = getCompletionStatusLabel(postStatus);
                    const logArr = [];
                    if (results.naver?.success) {
                        logArr.push(results.naver.postUrl ? `네이버 완료(${results.naver.postUrl})` : '네이버 완료');
                    }
                    if (results.wordpress?.success) {
                        logArr.push(results.wordpress.postUrl ? `워드프레스 완료(${results.wordpress.postUrl})` : '워드프레스 완료');
                    }
                    await Utils.updateGoogleSheetStatus(session.rowIndex, completionStatus, logArr.join('/') || completionStatus);
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
                        results
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
                    results
                }
            };
        } catch (error) {
            Logger.error(`❌ [QuickPreviewPublish] 오류: ${error.message}`);
            if (Number.isInteger(session.rowIndex)) {
                await Utils.updateGoogleSheetStatus(session.rowIndex, '발행 준비 완료', error.message || '포스팅 실패');
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

    async function executeQuickPublish(requestBody) {
        const subject = String(requestBody?.subject || '').trim();
        const keywords = normalizeKeywords(requestBody?.keywords);
        const instruction = String(requestBody?.instruction || '').trim();
        const externalReference = normalizeBool(requestBody?.externalReference, true);
        const imageGenerationRequested = normalizeBool(requestBody?.imageGeneration, false);
        const headless = typeof requestBody?.headless === 'boolean' ? requestBody.headless : Boolean(CONFIG.HEADLESS);
        let referenceUrl = String(requestBody?.referenceUrl || '').trim();
        if (referenceUrl) {
            referenceUrl = Utils.convertToMobileNaverBlogUrl(referenceUrl);
        }
        const publishMode = normalizePublishMode(requestBody?.publishMode);
        const targets = Array.isArray(requestBody?.targets) ? requestBody.targets : ['naver'];
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
        if (!precheck.success) {
            return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
        }

        const features = toFeatureMap(precheck.features);
        const enableRelatedPostsAutoLink = getFeatureBool(features, 'enable_related_posts_auto_link', true);
        const imageGenerationEnabledByPlan = getFeatureBool(features, 'image_generation', true);
        const imageGenerationFinal = imageGenerationRequested && imageGenerationEnabledByPlan;

        const nowMs = Date.now();
        cleanupQuickPublishDedupeCache(nowMs);
        const dedupeKey = buildQuickPublishDedupeKey({
            subject,
            keywords,
            instruction,
            referenceUrl,
            imageGeneration: imageGenerationFinal,
            externalReference
        });
        const existingEntry = getQuickPublishRecentEntry(dedupeKey) || null;

        await Utils.ensureAllSheetsExist();

        let appendStatus = (publishMode === 'append_and_generate' || publishMode === 'publish') ? '발행 준비 완료' : '대기';
        let rowNumber = null;
        let rowIndex = null;
        let deduplicated = false;

        if (existingEntry && Number.isInteger(existingEntry.rowIndex)) {
            deduplicated = true;
            rowNumber = existingEntry.rowNumber ?? null;
            rowIndex = existingEntry.rowIndex;
            appendStatus = existingEntry.status || appendStatus;

            if (publishMode === 'append_only') {
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
                await Utils.updateGoogleSheetStatus(rowIndex, '발행 준비 완료', '기존 글감 재사용');
                appendStatus = '발행 준비 완료';
            }
            setQuickPublishRecentEntry(dedupeKey, {
                ...existingEntry,
                status: appendStatus,
                updatedAtMs: nowMs
            });
        } else {
            const appendResult = await Utils.appendGoogleSheetTopics([{
                subject,
                keywords,
                content_guide: {
                    additional_instructions: instruction,
                    reference_urls: referenceUrl ? [referenceUrl] : []
                },
                use_external_ref: externalReference,
                image_options: {
                    generate: imageGenerationFinal,
                    count: 4
                },
                source: 'manual',
                trendDate: '',
                status: appendStatus,
                category: (requestBody?.naverCategory || requestBody?.wordpressCategory)
                    ? `N:${requestBody.naverCategory || ''}, W:${requestBody.wordpressCategory || ''}`
                    : (requestBody?.category || ''),
                postStatus,
                scheduleDate,
                targets: targets.join(', ')
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
                keywords,
                instruction,
                referenceUrls: referenceUrl ? [referenceUrl] : [],
                useExternalRef: externalReference,
                imageOptions: {
                    generate: imageGenerationFinal,
                    count: 4
                },
                category: requestBody?.category || '',
                naverCategory: requestBody?.naverCategory || '',
                wordpressCategory: requestBody?.wordpressCategory || '',
                postStatus,
                scheduleDate
            },
            targets,
            headless,
            features,
            enableRelatedPostsAutoLink
        };

        if (publishMode === 'append_and_generate') {
            const generated = await buildMultiPlatformGeneratedContent(publishParams);
            if (!generated.success) {
                if (Number.isInteger(rowIndex)) {
                    await Utils.updateGoogleSheetStatus(rowIndex, '발행 준비 완료', generated.message || '생성 실패');
                }
                recordUiActivity({
                    category: 'publish',
                    type: 'quick_preview_generate_failed',
                    level: 'error',
                    title: '빠른 포스팅 미리보기 생성 실패',
                    detail: generated.message || finalSubject
                });
                setQuickPublishRecentEntry(dedupeKey, {
                    rowNumber,
                    rowIndex,
                    status: '발행 준비 완료',
                    published: false,
                    targetDir: null,
                    updatedAtMs: Date.now()
                });
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
                previewsByTarget
            });

            setQuickPublishRecentEntry(dedupeKey, {
                rowNumber,
                rowIndex,
                status: '발행 준비 완료',
                published: false,
                targetDir: primaryTargetDir,
                updatedAtMs: Date.now()
            });

            if (Number.isInteger(rowIndex)) {
                await Utils.updateGoogleSheetStatus(rowIndex, '발행 준비 완료', `생성 완료 (${primaryTarget}): ${path.basename(primaryTargetDir)}`);
            }

            recordUiActivity({
                category: 'publish',
                type: 'quick_preview_generated',
                title: '빠른 포스팅 미리보기 생성 완료',
                detail: `${finalSubject} · ${formatActivityTargets(targets)}`
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
                    status: '생성 완료',
                    deduplicated,
                    ...previewResponse
                }
            };
        }

        try {
            const publishRes = await processMultiPlatformPublish(publishParams, {
                isLast: true
            });

            if (!publishRes.success) {
                if (Number.isInteger(rowIndex)) {
                    await Utils.updateGoogleSheetStatus(rowIndex, '발행 준비 완료', publishRes.message || '발행 실패');
                }
                setQuickPublishRecentEntry(dedupeKey, {
                    rowNumber,
                    rowIndex,
                    status: '발행 준비 완료',
                    published: false,
                    targetDir: null,
                    updatedAtMs: Date.now()
                });
                return { success: false, code: 'PUBLISH_FAILED', message: publishRes.message };
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
                await Utils.updateGoogleSheetStatus(rowIndex, finalStatusStr, finalLogStr);
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
                await Utils.updateGoogleSheetStatus(rowIndex, '실패', error.message);
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
                await Utils.sleep(1000);
            }

            Logger.info(`   🎨 [LocalMarkdown] 누락 이미지 생성 중 (Index ${image.index})`);
            try {
                await Utils.callWritingImage(
                    prompt,
                    path.join(tempDir, `${String(image.index).padStart(2, '0')}_image`),
                    3,
                    { useCase: 'blog' }
                );
            } catch (imageError) {
                Logger.warn(`⚠️ [LocalMarkdown] 누락 이미지 생성 실패 (Index ${image.index}): ${imageError.message}`);
            }
            lastCall = Date.now();
        }
    }

    async function executeLocalMarkdownPublish(requestBody = {}) {
        const selectedFiles = Array.isArray(requestBody?.selectedFiles) ? requestBody.selectedFiles : [];
        const targets = Array.isArray(requestBody?.targets) ? requestBody.targets : ['naver'];
        const headless = typeof requestBody?.headless === 'boolean' ? requestBody.headless : Boolean(CONFIG.HEADLESS);
        const postStatus = String(requestBody?.postStatus || 'publish').trim() || 'publish';
        const scheduleDate = String(requestBody?.scheduleDate || '').trim();
        const imageGenerationRequested = normalizeBool(requestBody?.imageGeneration, false);

        if (selectedFiles.length === 0) {
            return { success: false, code: 'INVALID_LOCAL_MARKDOWN_SOURCE', message: '선택된 원고 파일이 없습니다.' };
        }
        if (!Array.isArray(targets) || targets.length === 0) {
            return { success: false, code: 'INVALID_TARGETS', message: '포스팅 대상을 1개 이상 선택해야 합니다.' };
        }
        if (postStatus === 'schedule' && !scheduleDate) {
            return { success: false, code: 'INVALID_SCHEDULE_DATE', message: '예약 발행을 위해서는 예약 일시가 필요합니다.' };
        }

        const precheck = await License.checkLicenseStatus();
        if (!precheck.success) {
            return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
        }

        const features = toFeatureMap(precheck.features);
        if (!isCommandEnabled(features, 'batch')) {
            return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 즉시 발행 기능이 비활성화되어 있습니다. (cmd_batch=false)' };
        }

        const imageGenerationEnabledByPlan = getFeatureBool(features, 'image_generation', true);
        const imageGenerationFinal = imageGenerationRequested && imageGenerationEnabledByPlan;
        const sourceLabel = String(requestBody?.folderName || '').trim() || '원고 폴더';
        const targetLabel = formatActivityTargets(targets);
        const publishLabel = postStatus === 'draft'
            ? '임시 저장'
            : (postStatus === 'schedule' ? '예약 포스팅' : '포스팅');

        let previewData;
        try {
            previewData = buildLocalMarkdownPreview({
                folderName: requestBody?.folderName,
                selectedFiles,
                targets,
                postStatus,
                scheduleDate,
                imageGeneration: imageGenerationFinal
            }, {
                fs,
                path,
                Utils
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

        let workspace = null;
        try {
            recordUiActivity({
                category: 'publish',
                type: 'local_markdown_publish_started',
                title: `원고 ${publishLabel} 시작`,
                detail: `${sourceLabel}${targetLabel ? ` · ${targetLabel}` : ''}`,
                meta: {
                    source: 'local_markdown',
                    postStatus,
                    targets: Array.isArray(targets) ? targets.slice() : []
                }
            });
            workspace = materializeSelectedFilesToWorkspace({ selectedFiles }, { fs, path });
            await prepareMissingImagesForLocalMarkdown(workspace.tempDir, previewData, {
                imageGenerationEnabled: imageGenerationFinal
            });

            const verify = await License.verifyLicense();
            if (!verify.success) {
                return { success: false, code: 'LICENSE_VERIFY_FAILED', message: verify.message };
            }

            const results = {};
            const actionLabel = getPostActionLabel(postStatus);

            if (targets.includes('naver')) {
                const naverRes = await Core.publishToBlog(workspace.tempDir, {
                    headless,
                    category: requestBody?.naverCategory || '',
                    postStatus,
                    scheduleDate,
                    isLast: !targets.includes('wordpress')
                }) || { success: false, message: '네이버 포스팅 응답이 비어 있습니다.' };
                results.naver = {
                    success: Boolean(naverRes.success),
                    message: naverRes.message || '',
                    postUrl: naverRes.postUrl || ''
                };
                if (naverRes.success && CONFIG.NOTIFY_TELEGRAM_ENABLED) {
                    const urlMsg = naverRes.postUrl ? `\n\n🔗 [글 보기](${naverRes.postUrl})` : '';
                    await TelegramBotService.sendNotification(`✅ *네이버 블로그 ${actionLabel} 완료!*${urlMsg}`);
                }
            }

            if (targets.includes('wordpress')) {
                const wpRes = await Core.publishToWordPress(workspace.tempDir, {
                    category: requestBody?.wordpressCategory || '',
                    postStatus,
                    wpScheduleDate: scheduleDate || '',
                    imageGeneration: imageGenerationFinal
                }) || { success: false, message: '워드프레스 포스팅 응답이 비어 있습니다.' };
                results.wordpress = {
                    success: Boolean(wpRes.success),
                    message: wpRes.message || '',
                    postUrl: wpRes.postUrl || ''
                };
                if (wpRes.success && CONFIG.NOTIFY_TELEGRAM_ENABLED) {
                    const urlMsg = wpRes.postUrl ? `\n\n🔗 [글 보기](${wpRes.postUrl})` : '';
                    await TelegramBotService.sendNotification(`✅ *워드프레스 ${actionLabel} 완료!*${urlMsg}`);
                }
            }

            const failedTargets = Object.entries(results)
                .filter(([, value]) => value && value.success === false)
                .map(([platform, value]) => `${platform}: ${value.message || '실패'}`);

            if (failedTargets.length > 0) {
                recordUiActivity({
                    category: 'publish',
                    type: 'local_markdown_publish_failed',
                    level: 'error',
                    title: `원고 ${publishLabel} 실패`,
                    detail: `${sourceLabel}${targetLabel ? ` · ${targetLabel}` : ''} · ${failedTargets.join(' / ')}`,
                    meta: {
                        source: 'local_markdown',
                        postStatus,
                        targets: Array.isArray(targets) ? targets.slice() : []
                    }
                });
                return {
                    success: false,
                    code: 'LOCAL_MARKDOWN_PUBLISH_FAILED',
                    message: failedTargets.join(' / '),
                    data: {
                        status: '일부 포스팅 실패',
                        results
                    }
                };
            }

            recordUiActivity({
                category: 'publish',
                type: 'local_markdown_publish_completed',
                title: `원고 ${publishLabel} 완료`,
                detail: `${sourceLabel}${targetLabel ? ` · ${targetLabel}` : ''}`,
                meta: {
                    source: 'local_markdown',
                    postStatus,
                    targets: Array.isArray(targets) ? targets.slice() : []
                }
            });
            return {
                success: true,
                data: {
                    status: getCompletionStatusLabel(postStatus),
                    postStatus,
                    results,
                    source: {
                        folderName: previewData?.source?.folderName || '',
                        fileName: previewData?.source?.fileName || ''
                    }
                }
            };
        } catch (error) {
            Logger.error(`❌ [LocalMarkdownPublish] 오류: ${error.message}`);
            recordUiActivity({
                category: 'publish',
                type: 'local_markdown_publish_failed',
                level: 'error',
                title: `원고 ${publishLabel} 실패`,
                detail: `${sourceLabel}${targetLabel ? ` · ${targetLabel}` : ''}${error.message ? ` · ${error.message}` : ''}`,
                meta: {
                    source: 'local_markdown',
                    postStatus,
                    targets: Array.isArray(targets) ? targets.slice() : []
                }
            });
            return { success: false, code: 'LOCAL_MARKDOWN_PUBLISH_FAILED', message: error.message || '원고 포스팅에 실패했습니다.' };
        } finally {
            if (workspace?.tempDir) {
                try {
                    fs.rmSync(workspace.tempDir, { recursive: true, force: true });
                } catch (_cleanupError) { }
            }
        }
    }

    async function executeShoppingQuickPublish(requestBody = {}) {
        const shortUrl = String(requestBody?.shortUrl || requestBody?.url || '').trim();
        const product = String(requestBody?.product || '').trim();
        const publishMode = normalizePublishMode(requestBody?.publishMode);
        const headless = typeof requestBody?.headless === 'boolean' ? requestBody.headless : Boolean(CONFIG.HEADLESS);
        const targets = Array.isArray(requestBody?.targets) ? requestBody.targets : ['naver'];
        const postStatus = String(requestBody?.postStatus || 'publish').trim() || 'publish';
        const scheduleDate = String(requestBody?.scheduleDate || '').trim();

        if (!shortUrl) {
            return { success: false, code: 'INVALID_SHOPPING_URL', message: '쇼핑 URL은 필수입니다.' };
        }
        if (!/^https?:\/\//i.test(shortUrl)) {
            return { success: false, code: 'INVALID_SHOPPING_URL', message: '쇼핑 URL 형식이 올바르지 않습니다. (http/https)' };
        }
        if (!['publish', 'draft', 'schedule'].includes(postStatus)) {
            return { success: false, code: 'INVALID_POST_STATUS', message: `postStatus 값이 올바르지 않습니다: ${postStatus}` };
        }
        if (postStatus === 'schedule' && !scheduleDate) {
            return { success: false, code: 'INVALID_SCHEDULE_DATE', message: '예약 발행을 위해서는 예약 일시가 필수입니다.' };
        }

        const precheck = await License.checkLicenseStatus();
        if (!precheck.success) {
            return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
        }
        const features = toFeatureMap(precheck.features);
        if (publishMode === 'append_and_publish' && !isCommandEnabled(features, 'shopping')) {
            return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 shopping 기능이 비활성화되어 있습니다. (cmd_shopping=false)' };
        }

        await Utils.ensureAllSheetsExist();
        const appendStatus = publishMode === 'append_and_publish' ? '발행 준비 완료' : '준비';
        const targetLabel = formatActivityTargets(targets);
        const productLabel = product || shortUrl || '쇼핑 포스팅';
        const naverCategory = String(requestBody?.naverCategory || '').trim();
        const wordpressCategory = String(requestBody?.wordpressCategory || requestBody?.category || '').trim();
        let categoryField = '';
        if (naverCategory || wordpressCategory) {
            categoryField = `N:${naverCategory}, W:${wordpressCategory}`;
        }
        const appendResult = await Utils.appendGoogleSheetShopping([{
            shortUrl,
            product,
            status: appendStatus,
            category: categoryField,
            postStatus,
            scheduleDate
        }], {
            defaultStatus: appendStatus
        });

        if (!appendResult?.success) {
            return {
                success: false,
                code: 'SHOPPING_APPEND_FAILED',
                message: appendResult?.message || 'shopping 시트 추가에 실패했습니다.'
            };
        }

        const rowNumber = Array.isArray(appendResult.rowNumbers) ? appendResult.rowNumbers[0] : null;
        const rowIndex = Array.isArray(appendResult.rowIndices) ? appendResult.rowIndices[0] : null;

        if (publishMode === 'append_only') {
            return {
                success: true,
                data: {
                    mode: publishMode,
                    executionMode: publishMode,
                    postStatus,
                    sheet: CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping',
                    rowNumber,
                    rowIndex,
                    status: appendStatus
                }
            };
        }

        if (!Number.isInteger(rowIndex)) {
            return {
                success: false,
                code: 'SHOPPING_APPEND_ROW_INDEX_MISSING',
                message: '추가된 행 인덱스를 확인하지 못했습니다.'
            };
        }

        const session = await checkAuthSessionValid();
        if (!session.ok) {
            return {
                success: false,
                code: 'NAVER_SESSION_INVALID',
                message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 login을 다시 실행해 주세요.'
            };
        }

        const executeShoppingRowAction = typeof getExecuteShoppingRowAction === 'function'
            ? getExecuteShoppingRowAction()
            : null;
        if (typeof executeShoppingRowAction !== 'function') {
            throw new Error('쇼핑 row action 런타임이 연결되지 않았습니다.');
        }

        const result = await executeShoppingRowAction(
            { rowIndex, headless, targets, isLast: true },
            { enableRelatedPostsAutoLink: getFeatureBool(features, 'enable_related_posts_auto_link', true) }
        );

        if (!result.success) {
            recordUiActivity({
                category: 'publish',
                type: 'shopping_publish_failed',
                level: 'error',
                title: '쇼핑 포스팅 실패',
                detail: `${productLabel}${targetLabel ? ` · ${targetLabel}` : ''}${result.message ? ` · ${result.message}` : ''}`,
                meta: {
                    source: 'shopping_quick',
                    targets: Array.isArray(targets) ? targets.slice() : []
                }
            });
            return result;
        }

        if (publishMode === 'append_and_publish') {
            recordUiActivity({
                category: 'publish',
                type: 'shopping_publish_completed',
                title: '쇼핑 포스팅 완료',
                detail: `${productLabel}${targetLabel ? ` · ${targetLabel}` : ''}`,
                meta: {
                    source: 'shopping_quick',
                    targets: Array.isArray(targets) ? targets.slice() : []
                }
            });
        }

        return {
            success: true,
            data: {
                mode: publishMode,
                executionMode: publishMode,
                postStatus,
                sheet: CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping',
                rowNumber,
                rowIndex,
                ...(result.data || {})
            }
        };
    }

    return {
        buildMultiPlatformGeneratedContent,
        executeLocalMarkdownPublish,
        executeQuickPreviewPublish,
        executeQuickPublish,
        executeShoppingQuickPublish,
        getQuickPreviewImagePayload,
        processMultiPlatformPublish
    };
}

module.exports = {
    createPublishActionsRuntime
};
