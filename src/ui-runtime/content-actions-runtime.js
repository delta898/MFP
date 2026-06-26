const {
    buildPublishQuotaPreflight,
    createPublishOperationId,
    hasSuccessfulPlatformResult,
    settlePublishQuota
} = require('../publish-quota');

function createContentActionsRuntime(deps = {}) {
    const {
        path,
        CONFIG,
        Utils,
        Core,
        License,
        ShoppingManager,
        ensureSheetsReadyForUi,
        parseIntSafe,
        normalizeBool,
        checkAuthSessionValid,
        toFeatureMap,
        getFeatureBool,
        isCommandEnabled,
        getBlogAutoSettingsSnapshot,
        processMultiPlatformPublish,
        normalizeShoppingAutoSettings,
        normalizeNonNegativeInt,
        publishAutoDefaults,
        clearAllBlogRuntimeLogs,
        setBlogRuntimeLog,
        clearAllShoppingRuntimeLogs,
        setShoppingRuntimeLog
    } = deps;

    function parseUniqueRowIndices(rawValue) {
        const rowValues = Array.isArray(rawValue) ? rawValue : [];
        return Array.from(new Set(
            rowValues
                .map((value) => parseIntSafe(value, null, 0))
                .filter((value) => value !== null)
        ));
    }

    function getCompletionStatusLabel(postStatus) {
        const normalized = String(postStatus || '').trim().toLowerCase();
        if (normalized === 'draft') return '임시 저장 완료';
        if (normalized === 'schedule') return '예약 포스팅 등록 완료';
        return '발행 완료';
    }

    async function deleteSheetRows(rowIndices, sheetName) {
        const sortedIndices = [...rowIndices].sort((a, b) => b - a);
        const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
        const sheetId = await Utils.getSheetIdByName(spreadsheetId, sheetName);

        if (sheetId === null) {
            return { success: false, code: 'SHEET_NOT_FOUND', message: `대상 시트(${sheetName})를 찾지 못했습니다.` };
        }

        const requests = sortedIndices.map((index) => ({
            deleteDimension: {
                range: {
                    sheetId,
                    dimension: 'ROWS',
                    startIndex: index + 1,
                    endIndex: index + 2
                }
            }
        }));

        const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
        const response = await Utils.googleSheetPost(updateUrl, { requests });
        if (!response.spreadsheetId) {
            throw new Error('시트 삭제 응답이 유효하지 않습니다.');
        }

        return {
            success: true,
            data: {
                deletedCount: rowIndices.length
            }
        };
    }

    async function executeBlogRowAction(requestBody, options = {}) {
        const action = String(requestBody?.action || '').trim().toLowerCase();
        const rowIndex = parseIntSafe(requestBody?.rowIndex, null, 0);
        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
        const emitProgress = (message) => {
            if (!onProgress) return;
            try {
                onProgress(String(message || ''));
            } catch (_error) { }
        };

        if (!['gen', 'batch'].includes(action)) {
            return { success: false, code: 'INVALID_ACTION', message: '지원하지 않는 action입니다. (gen|batch)' };
        }
        if (rowIndex === null) {
            return { success: false, code: 'INVALID_ROW_INDEX', message: 'rowIndex는 0 이상의 정수여야 합니다.' };
        }

        const topics = await Utils.readGoogleSheetTopicsAll({ limit: 100000, offset: 0 });
        const topicData = (topics.items || []).find((item) => item.rowIndex === rowIndex);
        if (!topicData) {
            return { success: false, code: 'TOPIC_NOT_FOUND', message: `대상 rowIndex(${rowIndex})를 찾지 못했습니다.` };
        }

        const precheck = await License.checkLicenseStatus();
        if (!precheck.success) {
            return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
        }
        const features = toFeatureMap(precheck.features);
        const enableRelatedPostsAutoLink = getFeatureBool(features, 'enable_related_posts_auto_link', false);

        const rowOptions = topicData.options || {};
        const getVal = (key, fallback) => {
            if (rowOptions[key] !== undefined && rowOptions[key] !== null && rowOptions[key] !== '') return rowOptions[key];
            return fallback;
        };

        const effectiveTargets = getVal('platforms', Array.isArray(requestBody?.targets) ? requestBody.targets : ['naver']);
        const effectiveSubject = getVal('subject', topicData.subject);
        const effectiveKeywords = getVal('keywords', topicData.keywords || []);
        const effectiveInstruction = getVal('instruction', topicData.content_guide?.additional_instructions || '');
        const effectiveRefUrls = getVal('reference_urls', topicData.content_guide?.reference_urls || []);
        const effectiveCategory = getVal('category', topicData.category || '');
        const effectivePostStatus = getVal('post_status', topicData.postStatus || 'publish');
        const effectiveScheduleDate = getVal('schedule_date', topicData.scheduleDate || '');
        const effectiveImgGenRequested = topicData.image_gen === true;
        const effectiveImgCount = parseIntSafe(getVal('image_count', topicData.image_count), 4, 1) || 4;
        const effectiveExtRef = topicData.external_reference === true;
        const effectiveImgGen = effectiveImgGenRequested;

        const autoSettingsSnapshot = getBlogAutoSettingsSnapshot();
        const resolvedHeadless = typeof requestBody?.headless === 'boolean'
            ? requestBody.headless
            : autoSettingsSnapshot.BLOG_AUTO_HEADLESS;

        let naverCat = getVal('naver_category', '');
        let wpCat = getVal('wordpress_category', '');

        if (!naverCat || !wpCat) {
            if (effectiveCategory.includes('N:') || effectiveCategory.includes('W:')) {
                const nMatch = effectiveCategory.match(/N:([^,]*)/);
                const wMatch = effectiveCategory.match(/W:([^,]*)/);
                if (!naverCat) naverCat = nMatch ? nMatch[1].trim() : '';
                if (!wpCat) wpCat = wMatch ? wMatch[1].trim() : '';
            }
            if (!naverCat) naverCat = effectiveCategory;
            if (!wpCat) wpCat = effectiveCategory;
        }

        const publishParams = {
            context: {
                subject: effectiveSubject,
                keywords: effectiveKeywords,
                instruction: effectiveInstruction,
                referenceUrls: effectiveRefUrls,
                useExternalRef: effectiveExtRef,
                imageOptions: {
                    generate: effectiveImgGen,
                    count: effectiveImgCount
                },
                category: effectiveCategory,
                naverCategory: naverCat,
                wordpressCategory: wpCat,
                postStatus: effectivePostStatus,
                scheduleDate: effectiveScheduleDate
            },
            targets: effectiveTargets,
            headless: resolvedHeadless,
            features,
            enableRelatedPostsAutoLink
        };

        try {
            if (action === 'gen') {
                emitProgress('콘텐츠 생성 중...');
                const targetPlatform = Array.isArray(effectiveTargets) && effectiveTargets.length > 0 ? effectiveTargets[0] : 'naver';
                const topic = {
                    ...publishParams.context,
                    use_external_ref: publishParams.context.useExternalRef,
                    content_guide: {
                        additional_instructions: publishParams.context.instruction || '',
                        reference_urls: publishParams.context.referenceUrls || []
                    },
                    image_options: {
                        generate: effectiveImgGen,
                        count: publishParams.context.imageOptions?.count || 4
                    }
                };
                const result = await Core.generateContent(topic, null, {
                    enableRelatedPostsAutoLink,
                    platform: targetPlatform
                });
                emitProgress('이미지 준비 중...');
                await Core.prepareImages(result.targetDir, publishParams.context, {
                    imageGenerationEnabled: effectiveImgGen
                });

                emitProgress('시트 상태 반영 중...');
                await Utils.updateGoogleSheetStatus(rowIndex, '발행 준비 완료', `생성 완료 (${targetPlatform}): ${path.basename(result.targetDir)}`);
                return {
                    success: true,
                    data: {
                        action,
                        rowIndex,
                        rowNumber: rowIndex + 2,
                        status: '발행 준비 완료',
                        targetDir: result.targetDir
                    }
                };
            }

            if (!isCommandEnabled(features, 'batch')) {
                await Utils.updateGoogleSheetStatus(rowIndex, '발행 준비 완료', '플랜 정책으로 발행 불가(cmd_batch=false)');
                return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 batch 기능이 비활성화되어 있습니다. (cmd_batch=false)' };
            }

            emitProgress('사전 검증 중...');
            await Utils.updateGoogleSheetStatus(rowIndex, '발행 중', '프로세스 시작');

            const session = await checkAuthSessionValid();
            if (!session.ok) {
                await Utils.updateGoogleSheetStatus(rowIndex, '발행 준비 완료', '네이버 세션 만료');
                return {
                    success: false,
                    code: 'NAVER_SESSION_INVALID',
                    message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 login을 다시 실행해 주세요.'
                };
            }

            emitProgress('발행 처리 시작...');
            const publishRes = await processMultiPlatformPublish(publishParams, {
                onProgress: emitProgress,
                isLast: options.isLast === true,
                source: options.isAutoCycle === true ? 'auto-publish' : 'sheet-publish',
                stableKey: `topics-row-${rowIndex}`,
                operationId: options.operationId
            });

            if (!publishRes.success) {
                await Utils.updateGoogleSheetStatus(rowIndex, '발행 준비 완료', publishRes.message || '발행 실패');
                return { success: false, code: publishRes.code || 'PUBLISH_FAILED', message: publishRes.message };
            }

            const naverPubSuccess = publishRes.results.naver.success;
            const wpPubSuccess = publishRes.results.wordpress.success;
            const naverDir = publishRes.results.naver.targetDir;
            const wpDir = publishRes.results.wordpress.targetDir;

            emitProgress('시트 상태 반영 중...');
            const logArr = [];
            if (naverPubSuccess) {
                const nUrl = publishRes.results.naver.postUrl;
                logArr.push(nUrl ? `네이버 완료(${nUrl})` : '네이버 완료');
            }
            if (wpPubSuccess) {
                logArr.push('워드프레스 완료');
            }

            const finalStatus = (naverPubSuccess || wpPubSuccess) ? getCompletionStatusLabel(effectivePostStatus) : '실패';
            const finalLog = logArr.length > 0 ? logArr.join('/') : (publishRes.message || '실패');
            await Utils.updateGoogleSheetStatus(rowIndex, finalStatus, finalLog);

            emitProgress('완료');
            return {
                success: true,
                data: {
                    action,
                    rowIndex,
                    rowNumber: rowIndex + 2,
                    status: finalStatus,
                    postStatus: effectivePostStatus,
                    targetDir: naverDir || wpDir,
                    title: publishRes.results.finalSubject || topicData.subject,
                    results: publishRes.results
                }
            };
        } catch (error) {
            await Utils.updateGoogleSheetStatus(rowIndex, '실패', error.message);
            return { success: false, code: 'BLOG_ACTION_FAILED', message: error.message };
        }
    }

    async function executeBlogTopicsDelete(requestBody) {
        const rowIndices = parseUniqueRowIndices(requestBody?.rowIndices);
        if (rowIndices.length === 0) {
            return { success: false, code: 'INVALID_ROW_INDICES', message: '삭제할 rowIndices 배열이 필요합니다.' };
        }

        try {
            await ensureSheetsReadyForUi();
            const result = await deleteSheetRows(rowIndices, CONFIG.GOOGLE_TOPICS_SHEET || 'topics');
            if (!result.success) return result;
            return {
                success: true,
                data: {
                    deletedCount: rowIndices.length,
                    message: `${rowIndices.length}개의 글감이 삭제되었습니다.`
                }
            };
        } catch (error) {
            return { success: false, code: 'TOPICS_DELETE_FAILED', message: `삭제 실패: ${error.message}` };
        }
    }

    async function executeShoppingTopicsDelete(requestBody) {
        const rowIndices = parseUniqueRowIndices(requestBody?.rowIndices);
        if (rowIndices.length === 0) {
            return { success: false, code: 'INVALID_ROW_INDICES', message: '삭제할 rowIndices 배열이 필요합니다.' };
        }

        try {
            await ensureSheetsReadyForUi();
            const result = await deleteSheetRows(rowIndices, CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping');
            if (!result.success) return result;
            return {
                success: true,
                data: {
                    deletedCount: rowIndices.length,
                    message: `${rowIndices.length}개의 쇼핑 상품이 삭제되었습니다.`
                }
            };
        } catch (error) {
            return { success: false, code: 'SHOPPING_DELETE_FAILED', message: `삭제 실패: ${error.message}` };
        }
    }

    async function executeBlogBatchRowsAction(requestBody) {
        try {
            await ensureSheetsReadyForUi();
        } catch (error) {
            return { success: false, code: 'SHEETS_NOT_READY', message: `필수 시트 준비 실패: ${error.message}` };
        }

        const rowIndices = parseUniqueRowIndices(requestBody?.rowIndices);
        if (rowIndices.length === 0) {
            return { success: false, code: 'INVALID_ROW_INDICES', message: 'rowIndices는 0 이상의 정수 배열이어야 합니다.' };
        }

        clearAllBlogRuntimeLogs();
        rowIndices.forEach((rowIndex) => {
            setBlogRuntimeLog(rowIndex, '요청 접수');
        });

        const precheck = await License.checkLicenseStatus();
        if (!precheck.success) {
            rowIndices.forEach((rowIndex) => {
                setBlogRuntimeLog(rowIndex, `중단: ${precheck.message || '라이선스 확인 실패'}`);
            });
            return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
        }

        const features = toFeatureMap(precheck.features);
        if (!isCommandEnabled(features, 'batch')) {
            rowIndices.forEach((rowIndex) => {
                setBlogRuntimeLog(rowIndex, '중단: 현재 플랜에서 batch 사용 불가');
            });
            return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 batch 기능이 비활성화되어 있습니다. (cmd_batch=false)' };
        }

        const initialSession = await checkAuthSessionValid();
        if (!initialSession.ok) {
            rowIndices.forEach((rowIndex) => {
                setBlogRuntimeLog(rowIndex, '중단: 네이버 로그인 세션이 유효하지 않습니다.');
            });
            return {
                success: false,
                code: 'NAVER_SESSION_INVALID',
                message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 login을 다시 실행해 주세요.'
            };
        }

        const quotaPreflight = buildPublishQuotaPreflight(rowIndices.length, precheck);
        const targetRowIndices = rowIndices.slice(0, quotaPreflight.executable);
        if (targetRowIndices.length === 0) {
            rowIndices.forEach((rowIndex) => setBlogRuntimeLog(rowIndex, `중단: ${quotaPreflight.message}`));
            return { success: false, code: 'QUOTA_EXHAUSTED', message: quotaPreflight.message, data: { quotaPreflight } };
        }
        const headless = typeof requestBody?.headless === 'boolean' ? requestBody.headless : null;
        const targets = Array.isArray(requestBody?.targets) ? requestBody.targets : ['naver'];

        const results = [];
        let successCount = 0;
        let failCount = 0;
        const batchOperationId = String(requestBody?.operationId || '').trim()
            || createPublishOperationId({ scope: 'blog-batch', postStatus: 'publish' });

        targetRowIndices.forEach((rowIndex, index) => {
            setBlogRuntimeLog(rowIndex, `대기열 등록 (${index + 1}/${targetRowIndices.length})`);
        });
        rowIndices.slice(targetRowIndices.length).forEach((rowIndex) => {
            setBlogRuntimeLog(rowIndex, `건너뜀: ${quotaPreflight.message}`);
        });

        for (let index = 0; index < targetRowIndices.length; index += 1) {
            const rowIndex = targetRowIndices[index];
            setBlogRuntimeLog(rowIndex, `처리 시작 (${index + 1}/${targetRowIndices.length})`);
            const result = await executeBlogRowAction(
                { action: 'batch', rowIndex, headless, targets, isLast: index === targetRowIndices.length - 1 },
                {
                    onProgress: (message) => setBlogRuntimeLog(rowIndex, message),
                    isAutoCycle: requestBody?.isAutoCycle === true,
                    operationId: `${batchOperationId}:row-${rowIndex}`
                }
            );

            if (result.success) {
                successCount += 1;
                results.push({ rowIndex, success: true, data: result.data });
                setBlogRuntimeLog(rowIndex, '완료');
                continue;
            }

            failCount += 1;
            setBlogRuntimeLog(rowIndex, `실패: ${result.message || 'unknown error'}`);
            results.push({
                rowIndex,
                success: false,
                code: result.code || 'BLOG_ACTION_FAILED',
                message: result.message || '블로그 발행 처리에 실패했습니다.'
            });

            const shouldStop = ['QUOTA_EXHAUSTED', 'QUOTA_RESERVE_FAILED', 'LICENSE_STATUS_FAILED', 'NAVER_SESSION_INVALID'].includes(result.code);
            if (shouldStop) {
                const remaining = targetRowIndices.slice(index + 1);
                for (const restRowIndex of remaining) {
                    setBlogRuntimeLog(restRowIndex, '중단: 이전 치명 오류로 실행 중단');
                    results.push({
                        rowIndex: restRowIndex,
                        success: false,
                        code: 'SKIPPED_AFTER_FATAL_ERROR',
                        message: '이전 치명 오류로 인해 실행이 중단되었습니다.'
                    });
                }
                break;
            }
        }

        return {
            success: true,
            data: {
                requestedCount: rowIndices.length,
                attemptedCount: targetRowIndices.length,
                quotaPreflight,
                skippedCount: rowIndices.length - targetRowIndices.length,
                successCount,
                failCount,
                results
            }
        };
    }

    async function executeShoppingRowAction(requestBody, options = {}) {
        const rowIndex = parseIntSafe(requestBody?.rowIndex, null, 0);
        const targets = Array.isArray(requestBody?.targets) ? requestBody.targets : ['naver'];
        if (rowIndex === null) {
            return { success: false, code: 'INVALID_ROW_INDEX', message: 'rowIndex는 0 이상의 정수여야 합니다.' };
        }

        let features = options.features ? toFeatureMap(options.features) : null;
        if (!features) {
            const precheck = await License.checkLicenseStatus();
            if (!precheck.success) {
                return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
            }
            features = toFeatureMap(precheck.features);
        }
        if (!isCommandEnabled(features, 'shopping')) {
            return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 쇼핑커넥트 실행 기능을 사용할 수 없습니다.' };
        }

        const progress = typeof options.onProgress === 'function' ? options.onProgress : null;
        const report = (message) => {
            if (progress) progress(String(message || '').trim());
        };

        const results = {
            naver: { success: false, message: '', targetDir: null },
            wordpress: { success: false, message: '', targetDir: null }
        };
        const operationId = String(requestBody?.operationId || '').trim() || createPublishOperationId({
            scope: 'shopping-publish',
            postStatus: requestBody?.postStatus || 'publish'
        });
        let quotaReserved = false;

        try {
            const shoppingResult = await Utils.readGoogleSheetShoppingAll({ limit: 100000, offset: 0 });
            const allItems = Array.isArray(shoppingResult.items) ? shoppingResult.items : [];
            const target = allItems.find((item) => item.rowIndex === rowIndex);
            if (!target) {
                return { success: false, code: 'SHOPPING_ROW_NOT_FOUND', message: `shopping row(${rowIndex + 2})를 찾지 못했습니다.` };
            }
            const shortUrl = String(target.shortUrl || '').trim();
            if (!shortUrl) {
                return { success: false, code: 'INVALID_SHOPPING_URL', message: '쇼핑 URL이 비어 있습니다.' };
            }

            report('상태 업데이트: 발행 중');
            await Utils.updateGoogleSheetShoppingStatus(rowIndex, '발행 중', false);

            const blogAutoSettings = getBlogAutoSettingsSnapshot();
            const publishHeadless = typeof requestBody?.headless === 'boolean'
                ? requestBody.headless
                : blogAutoSettings.BLOG_AUTO_HEADLESS;
            const scrapingHeadless = true;
            const enableRelatedPostsAutoLink = getFeatureBool(features, 'enable_related_posts_auto_link', false);

            let preScrapedData = null;
            if (targets.length > 0) {
                report('쇼핑 상품 데이터 수집 시작');
                preScrapedData = await ShoppingManager.scrapeShoppingProduct(shortUrl, {
                    headless: scrapingHeadless
                });
            }

            if (targets.includes('naver')) {
                report('네이버 쇼핑 콘텐츠 생성 중');
                const naverBuildResult = await ShoppingManager.buildPostFromShortUrl(shortUrl, {
                    enableRelatedPostsAutoLink,
                    platform: 'naver',
                    headless: publishHeadless,
                    preScrapedData
                });
                results.naver.targetDir = naverBuildResult.targetDir;
            }

            if (targets.includes('wordpress')) {
                report('워드프레스 쇼핑 콘텐츠 생성 중');
                const wpBuildResult = await ShoppingManager.buildPostFromShortUrl(shortUrl, {
                    enableRelatedPostsAutoLink,
                    platform: 'wordpress',
                    headless: publishHeadless,
                    preScrapedData
                });
                results.wordpress.targetDir = wpBuildResult.targetDir;
            }

            report('라이선스 사용량 예약 중');
            const reservation = await License.reservePublishQuota(operationId, {
                source: 'shopping-publish',
                row_index: rowIndex,
                post_status: target.postStatus || 'publish',
                targets
            });
            if (!reservation.success) {
                await Utils.updateGoogleSheetShoppingStatus(rowIndex, '발행 준비 완료');
                return { success: false, code: reservation.code || 'QUOTA_RESERVE_FAILED', message: reservation.message };
            }
            quotaReserved = true;
            const previouslySuccessfulTargets = Array.isArray(reservation?.metadata?.successful_targets)
                ? reservation.metadata.successful_targets
                : [];
            previouslySuccessfulTargets.forEach((targetName) => {
                if (!targets.includes(targetName) || !results[targetName]) return;
                results[targetName].success = true;
                results[targetName].message = '이전 시도에서 완료';
                results[targetName].reused = true;
            });
            const executionTargets = targets.filter((targetName) => !previouslySuccessfulTargets.includes(targetName));

            if (executionTargets.includes('naver') && results.naver.targetDir) {
                report('네이버 발행 단계 진행 중');
                const pubRes = await Core.publishToBlog(results.naver.targetDir, {
                    affiliateUrl: shortUrl,
                    requireAffiliateUrl: true,
                    headless: publishHeadless,
                    postStatus: target.postStatus || 'publish',
                    scheduleDate: target.scheduleDate || '',
                    isLast: requestBody.isLast === true
                }) || { success: false, message: '네이버 포스팅 응답이 비어 있습니다.' };
                results.naver.success = pubRes.success === true;
                results.naver.message = pubRes.message || (pubRes.success ? '네이버 완료' : '네이버 실패');
            }

            if (executionTargets.includes('wordpress') && results.wordpress.targetDir) {
                report('워드프레스 발행 단계 진행 중');
                const pubRes = await Core.publishToWordPress(results.wordpress.targetDir, {
                    category: target.category || 'Shopping',
                    postStatus: target.postStatus || 'publish',
                    wpScheduleDate: target.scheduleDate || null,
                    headless: publishHeadless
                });
                results.wordpress.success = pubRes.success;
                results.wordpress.message = pubRes.message || (pubRes.success ? '워드프레스 완료' : '워드프레스 실패');
            }

            const quotaSettlement = await settlePublishQuota({
                License,
                operationId,
                results,
                metadata: { successful_targets: Object.keys(results).filter((targetName) => results[targetName]?.success) }
            });
            quotaReserved = false;
            if (!quotaSettlement.success) {
                report(`사용량 동기화 실패: ${quotaSettlement.message}`);
            }

            const anySuccess = hasSuccessfulPlatformResult(results);
            const finalStatus = anySuccess ? getCompletionStatusLabel(target.postStatus) : '실패';
            const logArr = [];
            if (targets.includes('naver') && results.naver.success) logArr.push('네이버 완료');
            if (targets.includes('wordpress') && results.wordpress.success) logArr.push('워드프레스 완료');
            const finalLog = logArr.length > 0 ? logArr.join('/') : '발행 실패';
            await Utils.updateGoogleSheetShoppingStatus(rowIndex, finalStatus, false, finalLog);

            return {
                success: anySuccess,
                data: {
                    rowIndex,
                    rowNumber: rowIndex + 2,
                    status: finalStatus,
                    postStatus: target.postStatus || 'publish',
                    shortUrl,
                    targetDir: results.naver.targetDir || results.wordpress.targetDir,
                    results,
                    operationId,
                    quotaSettlement
                }
            };
        } catch (error) {
            if (quotaReserved) {
                await settlePublishQuota({ License, operationId, results, metadata: { error: error.message } });
            }
            await Utils.updateGoogleSheetShoppingStatus(rowIndex, '실패');
            return { success: false, code: 'SHOPPING_ACTION_FAILED', message: error.message };
        }
    }

    async function executeShoppingBatchRowsAction(requestBody = {}) {
        try {
            await ensureSheetsReadyForUi();
        } catch (error) {
            return { success: false, code: 'SHEETS_NOT_READY', message: `필수 시트 준비 실패: ${error.message}` };
        }

        const rowIndices = parseUniqueRowIndices(requestBody?.rowIndices);
        if (rowIndices.length === 0) {
            return { success: false, code: 'INVALID_ROW_INDICES', message: 'rowIndices는 0 이상의 정수 배열이어야 합니다.' };
        }

        clearAllShoppingRuntimeLogs();
        rowIndices.forEach((rowIndex) => {
            setShoppingRuntimeLog(rowIndex, '요청 접수');
        });

        const precheck = await License.checkLicenseStatus();
        if (!precheck.success) {
            rowIndices.forEach((rowIndex) => {
                setShoppingRuntimeLog(rowIndex, `중단: ${precheck.message || '라이선스 확인 실패'}`);
            });
            return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
        }

        const features = toFeatureMap(precheck.features);
        if (!isCommandEnabled(features, 'shopping')) {
            rowIndices.forEach((rowIndex) => {
                setShoppingRuntimeLog(rowIndex, '중단: 현재 플랜에서 shopping 사용 불가');
            });
            return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 shopping 기능이 비활성화되어 있습니다. (cmd_shopping=false)' };
        }
        if (!isCommandEnabled(features, 'batch')) {
            rowIndices.forEach((rowIndex) => {
                setShoppingRuntimeLog(rowIndex, '중단: 현재 플랜에서 batch 사용 불가');
            });
            return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 일괄·자동 발행 기능을 사용할 수 없습니다.' };
        }

        const initialSession = await checkAuthSessionValid();
        if (!initialSession.ok) {
            rowIndices.forEach((rowIndex) => {
                setShoppingRuntimeLog(rowIndex, '중단: 네이버 로그인 세션이 유효하지 않습니다.');
            });
            return {
                success: false,
                code: 'NAVER_SESSION_INVALID',
                message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 login을 다시 실행해 주세요.'
            };
        }

        const quotaPreflight = buildPublishQuotaPreflight(rowIndices.length, precheck);
        const targetRowIndices = rowIndices.slice(0, quotaPreflight.executable);
        if (targetRowIndices.length === 0) {
            rowIndices.forEach((rowIndex) => setShoppingRuntimeLog(rowIndex, `중단: ${quotaPreflight.message}`));
            return { success: false, code: 'QUOTA_EXHAUSTED', message: quotaPreflight.message, data: { quotaPreflight } };
        }
        const enableRelatedPostsAutoLink = getFeatureBool(features, 'enable_related_posts_auto_link', false);
        const headless = typeof requestBody?.headless === 'boolean' ? requestBody.headless : null;
        const targets = Array.isArray(requestBody?.targets) ? requestBody.targets : ['naver'];

        targetRowIndices.forEach((rowIndex, index) => {
            setShoppingRuntimeLog(rowIndex, `대기열 등록 (${index + 1}/${targetRowIndices.length})`);
        });
        rowIndices.slice(targetRowIndices.length).forEach((rowIndex) => {
            setShoppingRuntimeLog(rowIndex, `건너뜀: ${quotaPreflight.message}`);
        });

        const results = [];
        let successCount = 0;
        let failCount = 0;
        const batchOperationId = String(requestBody?.operationId || '').trim()
            || createPublishOperationId({ scope: 'shopping-batch', postStatus: 'publish' });

        for (let index = 0; index < targetRowIndices.length; index += 1) {
            const rowIndex = targetRowIndices[index];
            setShoppingRuntimeLog(rowIndex, `처리 시작 (${index + 1}/${targetRowIndices.length})`);
            const result = await executeShoppingRowAction(
                { rowIndex, targets, headless, isLast: index === targetRowIndices.length - 1, operationId: `${batchOperationId}:row-${rowIndex}` },
                {
                    features,
                    enableRelatedPostsAutoLink,
                    onProgress: (message) => setShoppingRuntimeLog(rowIndex, message)
                }
            );

            if (result.success) {
                successCount += 1;
                results.push({ rowIndex, success: true, data: result.data });
                setShoppingRuntimeLog(rowIndex, '완료');
                continue;
            }

            failCount += 1;
            setShoppingRuntimeLog(rowIndex, `실패: ${result.message || 'unknown error'}`);
            results.push({
                rowIndex,
                success: false,
                code: result.code || 'SHOPPING_ACTION_FAILED',
                message: result.message || '쇼핑 발행 처리에 실패했습니다.'
            });

            const shouldStop = ['QUOTA_EXHAUSTED', 'QUOTA_RESERVE_FAILED', 'LICENSE_STATUS_FAILED', 'NAVER_SESSION_INVALID'].includes(result.code);
            if (shouldStop) {
                const remaining = targetRowIndices.slice(index + 1);
                for (const restRowIndex of remaining) {
                    setShoppingRuntimeLog(restRowIndex, '중단: 이전 치명 오류로 실행 중단');
                    results.push({
                        rowIndex: restRowIndex,
                        success: false,
                        code: 'SKIPPED_AFTER_FATAL_ERROR',
                        message: '이전 치명 오류로 인해 실행이 중단되었습니다.'
                    });
                }
                break;
            }
        }

        return {
            success: true,
            data: {
                requestedCount: rowIndices.length,
                attemptedCount: targetRowIndices.length,
                quotaPreflight,
                skippedCount: rowIndices.length - targetRowIndices.length,
                successCount,
                failCount,
                results
            }
        };
    }

    async function executeShoppingAutoManualAction(requestBody = {}) {
        try {
            await ensureSheetsReadyForUi();
        } catch (error) {
            return { success: false, code: 'SHEETS_NOT_READY', message: `필수 시트 준비 실패: ${error.message}` };
        }

        const settingsOverrides = (requestBody?.settingsOverrides && typeof requestBody.settingsOverrides === 'object')
            ? requestBody.settingsOverrides
            : {};
        const settings = normalizeShoppingAutoSettings({
            ...CONFIG,
            ...settingsOverrides
        });

        const summary = {
            shoppingAttempted: 0,
            shoppingSuccess: 0,
            skipped: []
        };

        const targetLimit = normalizeNonNegativeInt(
            settings.SHOPPING_PUBLISH_AUTO_BATCH_SIZE,
            publishAutoDefaults.batchSize
        );
        if (targetLimit <= 0) {
            summary.skipped.push('1회 최대 발행수가 0건으로 설정되어 실행을 건너뜁니다.');
            return { success: true, data: { summary } };
        }

        const shoppingRes = await Utils.readGoogleSheetShoppingAll({
            status: '발행 준비 완료',
            q: '',
            limit: 100000,
            offset: 0,
            sortBy: 'rowNumber',
            sortDir: 'asc'
        });
        const shoppingItems = Array.isArray(shoppingRes.items) ? shoppingRes.items : [];
        const rowIndices = shoppingItems
            .sort((a, b) => Number(a.rowNumber || 0) - Number(b.rowNumber || 0))
            .slice(0, targetLimit)
            .map((item) => item.rowIndex)
            .filter((value) => Number.isInteger(value) && value >= 0);

        summary.shoppingAttempted = rowIndices.length;
        if (rowIndices.length === 0) {
            summary.skipped.push('상태가 "발행 준비 완료"인 쇼핑 후보가 없어 실행을 건너뜁니다.');
            return { success: true, data: { summary } };
        }

        const batchResult = await executeShoppingBatchRowsAction({ action: 'batch', rowIndices });
        if (!batchResult.success) {
            return batchResult;
        }
        summary.shoppingSuccess = Number(batchResult?.data?.successCount || 0);
        const failCount = Number(batchResult?.data?.failCount || 0);
        if (failCount > 0) summary.skipped.push(`쇼핑 발행 실패 ${failCount}건`);

        return {
            success: true,
            data: {
                summary,
                batch: batchResult.data
            }
        };
    }

    async function executeShoppingRowUpdate(requestBody = {}) {
        const rowIndex = parseIntSafe(requestBody?.rowIndex, null, 0);
        if (rowIndex === null) {
            return { success: false, code: 'INVALID_ROW_INDEX', message: 'rowIndex는 0 이상의 정수여야 합니다.' };
        }

        const product = requestBody?.product !== undefined ? String(requestBody.product || '').trim() : undefined;
        const shortUrl = requestBody?.shortUrl !== undefined ? String(requestBody.shortUrl || '').trim() : undefined;
        const status = requestBody?.status !== undefined ? String(requestBody.status || '').trim() : undefined;
        const category = requestBody?.category !== undefined ? String(requestBody.category || '').trim() : undefined;
        const postStatus = requestBody?.postStatus !== undefined ? String(requestBody.postStatus || '').trim() : undefined;
        const scheduleDate = requestBody?.scheduleDate !== undefined ? String(requestBody.scheduleDate || '').trim() : undefined;

        const allowedStatus = new Set(['준비', '발행 준비 완료', '발행 중', '발행 완료', '임시 저장 완료', '예약 포스팅 등록 완료', '실패']);

        if (shortUrl && !/^https?:\/\//i.test(shortUrl)) {
            return { success: false, code: 'INVALID_SHOPPING_URL', message: 'URL 형식이 올바르지 않습니다. (http/https)' };
        }
        if (status && !allowedStatus.has(status)) {
            return { success: false, code: 'INVALID_STATUS', message: '상태 값이 올바르지 않습니다.' };
        }
        if (postStatus && !['publish', 'draft', 'private', 'future', 'schedule'].includes(postStatus)) {
            // schedule is often used as a synonym for future in this app
        }

        try {
            await Utils.updateGoogleSheetShoppingEditableFields(rowIndex, {
                product,
                shortUrl,
                status,
                category,
                postStatus,
                scheduleDate
            });
            return {
                success: true,
                data: {
                    rowIndex,
                    rowNumber: rowIndex + 2,
                    message: '수정 완료'
                }
            };
        } catch (error) {
            return {
                success: false,
                code: 'SHOPPING_ROW_UPDATE_FAILED',
                message: error.message
            };
        }
    }

    async function executeBlogTopicUpdate(requestBody) {
        const rowIndex = parseIntSafe(requestBody?.rowIndex, null, 0);
        if (rowIndex === null) {
            return { success: false, code: 'INVALID_ROW_INDEX', message: 'rowIndex는 0 이상의 정수여야 합니다.' };
        }

        const subject = String(requestBody?.subject || '').trim();
        if (!subject) {
            return { success: false, code: 'INVALID_SUBJECT', message: 'Subject는 비워둘 수 없습니다.' };
        }

        const referenceUrl = String(requestBody?.referenceUrl || '').trim();
        const rawStatus = String(requestBody?.status || '').trim();
        const statusAliases = {
            '블로그 발행 준비 완료': '발행 준비 완료',
            '블로그 발행 완료': '발행 완료',
            '블로그 임시 저장 완료': '임시 저장 완료',
            '블로그 예약 포스팅 등록 완료': '예약 포스팅 등록 완료'
        };
        const status = statusAliases[rawStatus] || rawStatus;
        const allowedStatus = new Set(['대기', '발행 준비 완료', '발행 중', '발행 완료', '임시 저장 완료', '예약 포스팅 등록 완료', '실패']);
        if (referenceUrl) {
            const urls = referenceUrl
                .split(',')
                .map((value) => String(value || '').trim())
                .filter(Boolean);
            const invalid = urls.find((value) => !/^https?:\/\//i.test(value));
            if (invalid) {
                return { success: false, code: 'INVALID_REFERENCE_URL', message: `참고 URL 형식이 올바르지 않습니다: ${invalid}` };
            }
        }
        if (status && !allowedStatus.has(status)) {
            return { success: false, code: 'INVALID_STATUS', message: '상태 값이 올바르지 않습니다.' };
        }

        try {
            const allowedPostStatus = new Set(['publish', 'draft', 'schedule', '']);
            const postStatusRaw = String(requestBody?.postStatus || '').trim();
            if (postStatusRaw && !allowedPostStatus.has(postStatusRaw)) {
                return { success: false, code: 'INVALID_POST_STATUS', message: `post_status 값이 올바르지 않습니다: ${postStatusRaw}` };
            }

            const naverCat = String(requestBody?.naverCategory || '').trim();
            const wpCat = String(requestBody?.wordpressCategory || '').trim();
            const finalCategory = (naverCat || wpCat) ? `N:${naverCat}, W:${wpCat}` : String(requestBody?.category || '').trim();

            await Utils.updateGoogleSheetTopicEditableFields(rowIndex, {
                category: finalCategory,
                postStatus: postStatusRaw,
                scheduleDate: String(requestBody?.scheduleDate || '').trim(),
                subject,
                keywords: String(requestBody?.keywords || '').trim(),
                instruction: String(requestBody?.instruction || '').trim(),
                referenceUrl,
                status,
                imageGeneration: normalizeBool(requestBody?.imageGeneration, false),
                externalReference: normalizeBool(requestBody?.externalReference, true)
            });

            return {
                success: true,
                data: {
                    rowIndex,
                    rowNumber: rowIndex + 2,
                    message: '수정 완료'
                }
            };
        } catch (error) {
            return {
                success: false,
                code: 'TOPIC_UPDATE_FAILED',
                message: error.message
            };
        }
    }

    return {
        executeBlogBatchRowsAction,
        executeBlogRowAction,
        executeBlogTopicUpdate,
        executeBlogTopicsDelete,
        executeShoppingAutoManualAction,
        executeShoppingBatchRowsAction,
        executeShoppingRowAction,
        executeShoppingRowUpdate,
        executeShoppingTopicsDelete
    };
}

module.exports = {
    createContentActionsRuntime
};
