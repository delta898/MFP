const { buildPublishQuotaPreflight } = require('../publish-quota');
const { normalizeBlogImageMode, generatesBlogImages } = require('../content/blog-image-mode');

function createAutoCycleRuntime(deps = {}) {
    const {
        CONFIG,
        Logger,
        License,
        Utils,
        urlShorteningService,
        TelegramService,
        SlackService,
        ensureSheetsReadyForUi,
        checkAuthSessionValid,
        recordUiActivity,
        normalizeYmdToken,
        toBoolLike,
        parseCsvTokens,
        normalizeNonNegativeInt,
        parseConfigBool,
        normalizeBlogAutoSettings,
        getBlogAutoSettingsSnapshot,
        toFeatureMap,
        isCommandEnabled,
        parseMaxPosts,
        collectTrendsDefaults,
        blogAutoDefaults,
        autoRuntimeState,
        publishRuntimeState,
        refreshLegacyAutoRuntimeState,
        syncAutoRunnerWithConfig,
        executeTrendCollectWithRetry,
        processAndAppendTrendsToTopics,
        filterAutoTopicCandidates,
        executeBlogBatchRowsAction,
        snsRssDiscovery,
        snsDistributionRunner
    } = deps;

    function getTodayYmdSeoul() {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date());
    }

    async function executeAutoTrendsToTopics(settings = {}) {
        await ensureSheetsReadyForUi();

        const requestedTrendDate = normalizeYmdToken(settings.BLOG_AUTO_TARGET_TREND_DATE || '');
        const effectiveTrendDate = requestedTrendDate || getTodayYmdSeoul();
        const trendsResult = await Utils.readGoogleSheetTrendsAll({
            status: '',
            q: '',
            limit: 100000,
            offset: 0,
            sortBy: 'rowNumber',
            sortDir: 'asc'
        });
        const allItems = Array.isArray(trendsResult.items) ? trendsResult.items : [];
        const selectedItems = allItems
            .filter((item) => normalizeYmdToken(item?.date || '') === effectiveTrendDate)
            .map((item, index) => ({
                ...item,
                rowIndex: Number.isInteger(item?.rowIndex) ? item.rowIndex : index
            }));

        return processAndAppendTrendsToTopics(selectedItems, {
            ...settings,
            BLOG_AUTO_TARGET_TREND_DATE: effectiveTrendDate
        });
    }

    async function runAutoCycle(trigger = 'manual', options = {}) {
        const forceRun = options?.forceRun === true;
        const requestedTrendDate = normalizeYmdToken(options?.trendDate || options?.date || '');
        const skipTrendsCollect = toBoolLike(options?.skipTrends, false);
        const settingsOverrides = (options?.settingsOverrides && typeof options.settingsOverrides === 'object')
            ? options.settingsOverrides
            : {};
        const isManualTrigger = forceRun || String(trigger || '').toLowerCase().includes('manual');
        if (!forceRun && !autoRuntimeState.enabled) return { success: false, code: 'AUTO_DISABLED', message: '자동 실행이 비활성화되어 있습니다.' };
        if (autoRuntimeState.running) return { success: false, code: 'AUTO_ALREADY_RUNNING', message: '다른 자동 사이클이 실행 중입니다.' };

        autoRuntimeState.running = true;
        autoRuntimeState.status = 'running';
        autoRuntimeState.message = `자동 사이클 실행 중 (${trigger})`;
        autoRuntimeState.lastRunAt = new Date().toISOString();
        autoRuntimeState.nextRunAt = null;
        Logger.info(`🚀 [AUTO] 자동 발행 파이프라인(사이클) 시작! (Trigger: ${trigger})`);

        const summary = {
            trigger,
            trendsCollected: 0,
            trendsToTopics: 0,
            blogAttempted: 0,
            blogSuccess: 0,
            skipped: []
        };

        try {
            const settings = Object.keys(settingsOverrides).length > 0
                ? normalizeBlogAutoSettings({
                    ...getBlogAutoSettingsSnapshot(),
                    ...settingsOverrides
                })
                : getBlogAutoSettingsSnapshot();
            Logger.info(
                `ℹ️ [AUTO] 실행 설정값 (trigger=${trigger}, source=${Object.keys(settingsOverrides).length > 0 ? 'ui-overrides' : 'saved-config'}): `
                + `collect-enabled=${settings.COLLECT_TRENDS_ENABLED ? 'on' : 'off'}, `
                + `publish-enabled=${settings.PUBLISH_AUTO_ENABLED ? 'on' : 'off'}, `
                + `batchSize=${settings.PUBLISH_AUTO_BATCH_SIZE}, `
                + `categories=${settings.COLLECT_TRENDS_CATEGORIES || '(없음)'}, `
                + `trendTime=${settings.COLLECT_TRENDS_TIME || '07:30'}`
            );
            if (!settings.COLLECT_TRENDS_ENABLED && !forceRun) {
                syncAutoRunnerWithConfig();
                return { success: false, code: 'COLLECT_TRENDS_DISABLED_BY_CONFIG', message: '자동 수집 모드가 비활성화되어 있습니다.' };
            }

            const precheck = await License.checkLicenseStatus({ quiet: true });
            if (!precheck.success) {
                autoRuntimeState.status = 'error';
                autoRuntimeState.message = `라이선스 확인 실패: ${precheck.message}`;
                autoRuntimeState.lastSummary = summary;
                return {
                    success: false,
                    code: 'LICENSE_STATUS_FAILED',
                    message: precheck.message,
                    data: {
                        trigger,
                        trendDate: requestedTrendDate || '',
                        summary
                    }
                };
            }
            const features = toFeatureMap(precheck.features);
            const session = await checkAuthSessionValid();
            if (!session.ok) {
                autoRuntimeState.status = 'waiting';
                autoRuntimeState.message = '네이버 로그인 세션이 유효하지 않아 자동 사이클을 대기합니다.';
                autoRuntimeState.lastSummary = summary;
                return {
                    success: false,
                    code: 'NAVER_SESSION_INVALID',
                    message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 로그인 후 다시 시도해 주세요.',
                    data: {
                        trigger,
                        trendDate: requestedTrendDate || '',
                        summary
                    }
                };
            }

            let proceedAfterTrends = true;
            if (skipTrendsCollect) {
                summary.skipped.push('요청 옵션에 따라 트렌드 수집을 건너뜁니다. (기존 trends 데이터 사용)');
            } else if (!isCommandEnabled(features, 'trends')) {
                summary.skipped.push('트렌드 수집 권한이 없어 수집만 건너뜁니다. 기존 준비 글의 자동 발행은 계속합니다.');
            } else {
                const includeCategories = parseCsvTokens(settings.BLOG_AUTO_CATEGORIES);
                const trendsRetryResult = await executeTrendCollectWithRetry({
                    date: requestedTrendDate,
                    categories: includeCategories,
                    maxRetries: isManualTrigger ? 0 : blogAutoDefaults.trendsMaxRetries,
                    retryWaitMs: blogAutoDefaults.trendsRetryWaitMs,
                    headless: settings.BLOG_AUTO_HEADLESS
                });
                if (trendsRetryResult.success) {
                    summary.trendsCollected = Number(trendsRetryResult.collected || 0);
                } else {
                    proceedAfterTrends = false;
                    const retryInfo = Number.isFinite(trendsRetryResult.maxRetries)
                        ? trendsRetryResult.maxRetries
                        : (isManualTrigger ? 0 : blogAutoDefaults.trendsMaxRetries);
                    summary.skipped.push(
                        `트렌드 수집 실패(재시도 ${retryInfo}회): ${trendsRetryResult.message || 'unknown'}`
                    );
                }
            }

            let appendedTopicRowIndices = [];
            if (proceedAfterTrends) {
                try {
                    const mapResult = await executeAutoTrendsToTopics({
                        ...settings,
                        BLOG_AUTO_TARGET_TREND_DATE: requestedTrendDate
                    });
                    summary.trendsToTopics = Number(mapResult.appendedCount || 0);
                    appendedTopicRowIndices = Array.isArray(mapResult?.rowIndices)
                        ? mapResult.rowIndices.filter((value) => Number.isInteger(value) && value >= 0)
                        : [];
                    const filteredCount = Number(mapResult?.filteredCount || mapResult?.candidates || 0);
                    const duplicateCount = Number(mapResult?.duplicateCount || 0);
                    const reuseBlockedCount = Number(mapResult?.reuseBlockedCount || 0);
                    Logger.info(`ℹ️ [AUTO] trends→topics 결과: 필터 통과 ${filteredCount}건, 신규 추가 ${summary.trendsToTopics}건, 중복 제외 ${duplicateCount}건, 재사용 간격 제외 ${reuseBlockedCount}건`);
                    if (filteredCount === 0) {
                        summary.skipped.push('trends→topics 필터 조건에 맞는 항목이 없습니다. (카테고리/증감/기준일 확인)');
                    } else if (summary.trendsToTopics === 0) {
                        summary.skipped.push(`trends→topics 신규 추가 0건 (중복 ${duplicateCount}건, 재사용 간격 제외 ${reuseBlockedCount}건)`);
                    }
                    if (summary.trendsToTopics > 0 && appendedTopicRowIndices.length === 0) {
                        summary.skipped.push('이번 실행에서 추가된 토픽 행을 식별하지 못해 발행 후보를 찾지 못했습니다.');
                    }
                } catch (error) {
                    summary.skipped.push(`trends→topics 실패: ${error.message}`);
                }
            }

            const nowMs = Date.now();
            const minGapMin = normalizeNonNegativeInt(settings.BLOG_AUTO_MIN_POST_GAP_MIN, 0);
            const minGapMs = minGapMin * 60 * 1000;
            const gapAllowed = minGapMs <= 0
                || autoRuntimeState.lastPublishAtMs <= 0
                || (nowMs - autoRuntimeState.lastPublishAtMs >= minGapMs);
            if (!gapAllowed) {
                summary.skipped.push(`포스트 간격 제한(${minGapMin}분)으로 발행 대기`);
            }

            const maxPosts = parseMaxPosts(
                settings.BLOG_AUTO_MAX_POSTS_PER_RUN,
                blogAutoDefaults.maxPostsPerRun
            );
            const effectiveCycleBlogCap = maxPosts > 0 ? maxPosts : Number.MAX_SAFE_INTEGER;

            if (proceedAfterTrends && gapAllowed && isCommandEnabled(features, 'batch')) {
                const targetLimit = Math.max(0, effectiveCycleBlogCap);
                if (targetLimit > 0) {
                    const freshTopicRowSet = new Set(
                        appendedTopicRowIndices.filter((value) => Number.isInteger(value) && value >= 0)
                    );
                    const topicsRes = await Utils.readGoogleSheetTopicsAll({
                        status: '',
                        q: '',
                        limit: 100000,
                        offset: 0,
                        sortBy: 'rowNumber',
                        sortDir: 'asc'
                    });
                    const topicItems = Array.isArray(topicsRes.items) ? topicsRes.items : [];
                    const primaryCandidates = filterAutoTopicCandidates(topicItems, settings)
                        .filter((item) => freshTopicRowSet.has(item.rowIndex))
                        .sort((a, b) => Number(a.rowNumber || 0) - Number(b.rowNumber || 0));
                    let candidates = primaryCandidates;
                    let fallbackUsed = false;

                    if (candidates.length === 0) {
                        candidates = topicItems
                            .filter((item) => String(item?.status || '').trim() === '발행 준비 완료')
                            .sort((a, b) => Number(a.rowNumber || 0) - Number(b.rowNumber || 0));
                        fallbackUsed = candidates.length > 0;
                        if (fallbackUsed) {
                            Logger.info(`ℹ️ [AUTO] 신규 추가 토픽 후보가 없어, 기존 준비완료 토픽 ${candidates.length}건에서 발행 대상을 선택합니다.`);
                        }
                    }

                    candidates = candidates.slice(0, targetLimit);
                    const rowIndices = candidates
                        .map((item) => item.rowIndex)
                        .filter((value) => Number.isInteger(value) && value >= 0);
                    summary.blogAttempted = rowIndices.length;
                    if (rowIndices.length > 0) {
                        const blogResult = await executeBlogBatchRowsAction({
                            action: 'batch',
                            rowIndices,
                            headless: settings.BLOG_AUTO_HEADLESS,
                            isAutoCycle: true
                        });
                        const successCount = Number(blogResult?.data?.successCount || 0);
                        summary.blogSuccess = successCount;
                        if (successCount > 0) {
                            autoRuntimeState.lastPublishAtMs = Date.now();
                        }
                        const failCount = Number(blogResult?.data?.failCount || 0);
                        if (failCount > 0) summary.skipped.push(`블로그 발행 실패 ${failCount}건`);
                    } else {
                        summary.skipped.push(
                            fallbackUsed
                                ? '발행 후보가 없어 건너뜁니다. (조건: 상태=발행 준비 완료)'
                                : '블로그 발행 후보가 없어 건너뜁니다. (조건: 이번 실행에서 추가된 토픽 행 + 상태/소스/일자/카테고리)'
                        );
                    }
                } else {
                    summary.skipped.push(
                        `블로그 발행 한도가 0건이라 건너뜁니다. `
                        + `(설정=${maxPosts})`
                    );
                }
            } else if (proceedAfterTrends && gapAllowed && !isCommandEnabled(features, 'batch')) {
                summary.skipped.push('현재 플랜에서 블로그 batch 기능이 비활성화되어 건너뜁니다.');
            }

            autoRuntimeState.cycleCount += 1;
            autoRuntimeState.status = 'waiting';
            autoRuntimeState.message = '블로그 자동 사이클 완료';
            autoRuntimeState.lastSummary = summary;

            Logger.info(`✅ [AUTO][블로그] 파이프라인 완료! - 트렌드 수집: ${summary.trendsCollected}건, 토픽 전환: ${summary.trendsToTopics}건, 블로그 발행 시도/성공: ${summary.blogAttempted}/${summary.blogSuccess}`);
            if (summary.skipped && summary.skipped.length > 0) {
                Logger.info(`   👉 건너뛴 사유 내역:\n      - ${summary.skipped.join('\n      - ')}`);
            }

            return {
                success: true,
                data: {
                    trigger,
                    trendDate: requestedTrendDate || '',
                    summary
                }
            };
        } catch (error) {
            autoRuntimeState.status = 'error';
            autoRuntimeState.message = `블로그 자동 사이클 오류: ${error.message}`;
            autoRuntimeState.lastSummary = summary;
            Logger.error(`❌ [AUTO][블로그] 사이클 오류: ${error.message}`);
            return {
                success: false,
                code: 'AUTO_CYCLE_FAILED',
                message: error.message,
                data: {
                    trigger,
                    trendDate: requestedTrendDate || '',
                    summary
                }
            };
        } finally {
            autoRuntimeState.running = false;
            if (autoRuntimeState.enabled) syncAutoRunnerWithConfig();
        }
    }

    async function runTrendCollectCycle(trigger = 'manual', options = {}) {
        const isManual = String(trigger || '').toLowerCase().includes('manual');
        const requestedTrendDate = normalizeYmdToken(options?.trendDate || options?.date || '');
        const settingsOverride = {
            ...(options?.settings || {}),
            BLOG_AUTO_TARGET_TREND_DATE: requestedTrendDate
        };

        if (!CONFIG.COLLECT_TRENDS_ENABLED && !isManual) {
            return { success: false, message: '트렌드 수집이 비활성화되어 있습니다.' };
        }

        const precheck = await License.checkLicenseStatus({ quiet: true });
        if (!precheck.success) return { success: false, message: `라이선스 오류: ${precheck.message}` };
        const features = toFeatureMap(precheck.features);
        if (!isCommandEnabled(features, 'trends')) return { success: false, message: '트렌드 수집 권한이 없습니다.' };

        Logger.info(`🚀 [AUTO][Producer] 트렌드 수집 시작 (Trigger: ${trigger})`);
        const headless = !isManual;
        const includeCategories = parseCsvTokens(settingsOverride.COLLECT_TRENDS_CATEGORIES || CONFIG.COLLECT_TRENDS_CATEGORIES);
        const trendsRetryResult = await executeTrendCollectWithRetry({
            date: requestedTrendDate || undefined,
            categories: includeCategories,
            maxRetries: isManual ? 0 : collectTrendsDefaults.trendsMaxRetries,
            retryWaitMs: collectTrendsDefaults.trendsRetryWaitMs,
            headless,
            settings: settingsOverride
        });

        if (!trendsRetryResult.success) {
            Logger.error(`❌ [AUTO][Producer] 트렌드 수집 실패: ${trendsRetryResult.message}`);
            return { success: false, message: `수집 실패: ${trendsRetryResult.message}` };
        }

        try {
            const addedCount = Number(trendsRetryResult.data?.appendedCount || 0);
            const dupCount = Number(trendsRetryResult.data?.duplicateCount || 0);
            const reuseCount = Number(trendsRetryResult.data?.reuseBlockedCount || 0);

            Logger.info(`✅ [AUTO][Producer] 트렌드 수집 완료: Topics 신규 추가 ${addedCount}건 (중복 ${dupCount}, 재사용간격제외 ${reuseCount})`);

            return {
                success: true,
                data: {
                    trendsCollected: trendsRetryResult.data?.rawCollectedCount || trendsRetryResult.collected,
                    trendsToTopics: addedCount
                }
            };
        } catch (error) {
            Logger.error(`❌ [AUTO][Producer] trends->topics 데이터 구성 실패: ${error.message}`);
            return { success: false, message: `topics 등록 실패: ${error.message}` };
        }
    }

    async function runRssCollectCycle(trigger = 'manual', requestBody = {}) {
        const isManual = String(trigger || '').toLowerCase().includes('manual');
        const settingsOverrides = (requestBody?.settingsOverrides && typeof requestBody.settingsOverrides === 'object')
            ? requestBody.settingsOverrides
            : {};
        const imageMode = normalizeBlogImageMode(
            settingsOverrides.PUBLISH_AUTO_IMAGE_MODE ?? CONFIG.PUBLISH_AUTO_IMAGE_MODE,
            {
                legacyGenerate: typeof CONFIG.PUBLISH_AUTO_IMAGE_GENERATION === 'boolean'
                    ? CONFIG.PUBLISH_AUTO_IMAGE_GENERATION
                    : true,
                fallback: 'generate'
            }
        );

        let rssConfigs = Array.isArray(CONFIG.COLLECT_RSS_CONFIGS) ? CONFIG.COLLECT_RSS_CONFIGS : [];
        const isGlobalEnabled = parseConfigBool(CONFIG.COLLECT_RSS_ENABLED, false);

        if (!isManual && !isGlobalEnabled) {
            return { success: false, message: '글로벌 RSS 수집 설정이 비활성화되어 있습니다.' };
        }

        if (settingsOverrides.COLLECT_RSS_CONFIGS) {
            rssConfigs = Array.isArray(settingsOverrides.COLLECT_RSS_CONFIGS)
                ? settingsOverrides.COLLECT_RSS_CONFIGS
                : rssConfigs;
        }

        const enabledConfigs = (isManual && rssConfigs.length > 0) ? rssConfigs : rssConfigs.filter((config) => config.enabled);

        if (enabledConfigs.length === 0 && !isManual) {
            return { success: false, message: '활성화된 RSS 수집 설정이 없습니다.' };
        }

        const precheck = await License.checkLicenseStatus({ quiet: true });
        if (!precheck.success) return { success: false, message: `라이선스 오류: ${precheck.message}` };
        const feedUrls = enabledConfigs.map((config) => String(config.url || '').trim()).filter(Boolean);
        Logger.info(`🚀 [AUTO][Producer] RSS 수집 시작 (Trigger: ${trigger}, Feeds: ${enabledConfigs.length}개)`);
        recordUiActivity({
            category: 'collection',
            type: 'rss_collect_started',
            title: 'RSS 수집 시작',
            detail: `피드 ${enabledConfigs.length}개`
        });
        if (feedUrls.length > 0) {
            Logger.info(`   📝 수집 대상 피드: ${feedUrls.join(', ')}`);
        } else if (isManual) {
            Logger.warn('   ⚠️ 수집 가능한 피드 주소가 없습니다. 설정에서 RSS 주소를 입력해 주세요.');
        }

        let totalRssCollected = 0;
        let totalRssToTopics = 0;
        const allNewItems = [];

        try {
            const topicsSnapshot = await Utils.readGoogleSheetTopicsAll({ limit: 2000, silent: true });
            const existingLinks = new Set(
                (topicsSnapshot.items || [])
                    .map((item) => {
                        const refUrls = Array.isArray(item.content_guide?.reference_urls) ? item.content_guide.reference_urls : [];
                        const firstUrl = refUrls[0] || item.url || '';
                        return String(firstUrl).trim();
                    })
                    .filter(Boolean)
            );

            for (const config of enabledConfigs) {
                const feedUrl = String(config.url || '').trim();
                if (!feedUrl) continue;

                Logger.info(`   📡 RSS 피드 요청: ${feedUrl}`);
                const items = await Utils.fetchAndParseRss(feedUrl);
                totalRssCollected += items.length;

                const includeKws = Array.isArray(config.includeKeywords)
                    ? config.includeKeywords
                    : String(config.includeKeywords || '').split(',').map((value) => value.trim()).filter(Boolean);
                const excludeKws = Array.isArray(config.excludeKeywords)
                    ? config.excludeKeywords
                    : String(config.excludeKeywords || '').split(',').map((value) => value.trim()).filter(Boolean);

                const filteredItems = items.filter((item) => {
                    const title = String(item.title || '');
                    const desc = String(item.description || '');
                    const targetText = (title + ' ' + desc).toLowerCase();

                    if (includeKws.length > 0) {
                        const hasInclude = includeKws.some((keyword) => targetText.includes(keyword.toLowerCase()));
                        if (!hasInclude) return false;
                    }

                    if (excludeKws.length > 0) {
                        const hasExclude = excludeKws.some((keyword) => targetText.includes(keyword.toLowerCase()));
                        if (hasExclude) return false;
                    }

                    return true;
                });

                const newItemsFromFeed = filteredItems.filter((item) => {
                    let link = String(item.link || '').trim();
                    if (!link) return false;

                    if (link.includes('blog.naver.com')) {
                        link = Utils.convertToMobileNaverBlogUrl(link);
                    }

                    return !existingLinks.has(link);
                });

                newItemsFromFeed.reverse();

                for (const item of newItemsFromFeed) {
                    let normalizedLink = String(item.link || '').trim();
                    if (normalizedLink.includes('blog.naver.com')) {
                        normalizedLink = Utils.convertToMobileNaverBlogUrl(normalizedLink);
                    }

                    const naverCategory = String(config.naver_category || '').trim();
                    const wordpressCategory = String(config.wordpress_category || config.category || '').trim();
                    const finalCategory = (naverCategory || wordpressCategory) ? `N:${naverCategory}, W:${wordpressCategory}` : '';

                    allNewItems.push({
                        subject: item.title,
                        keywords: [],
                        content_guide: {
                            additional_instructions: '',
                            reference_urls: [normalizedLink]
                        },
                        use_external_ref: false,
                        image_options: { mode: imageMode, generate: generatesBlogImages(imageMode) },
                        source: 'rss',
                        status: '발행 준비 완료',
                        category: finalCategory,
                        postStatus: 'publish'
                    });
                    existingLinks.add(normalizedLink);
                }
            }

            if (allNewItems.length > 0) {
                await Utils.appendGoogleSheetTopics(allNewItems, { source: 'rss' });
                totalRssToTopics = allNewItems.length;
                Logger.info(`✅ [AUTO][Producer] RSS 수집 완료: Topics 신규 추가 ${totalRssToTopics}건 (전체 발견 ${totalRssCollected}건)`);
            } else {
                Logger.info('ℹ️ [AUTO][Producer] RSS 수집 완료: 새로운 항목이 없습니다.');
            }
            recordUiActivity({
                category: 'collection',
                type: 'rss_collect_completed',
                title: 'RSS 수집 완료',
                detail: `수집 ${totalRssCollected}건 · 토픽 추가 ${totalRssToTopics}건`
            });

            return {
                success: true,
                data: {
                    rssCollected: totalRssCollected,
                    rssToTopics: totalRssToTopics
                }
            };
        } catch (error) {
            Logger.error(`❌ [AUTO][Producer] RSS 수집 중 시스템 오류: ${error.message}`);
            recordUiActivity({
                category: 'collection',
                type: 'rss_collect_failed',
                level: 'error',
                title: 'RSS 수집 실패',
                detail: error.message || '알 수 없는 오류'
            });
            return { success: false, message: `RSS 수집 실패: ${error.message}` };
        }
    }

    async function runSnsDiscoveryCycle(trigger = 'manual') {
        if (!snsRssDiscovery || typeof snsRssDiscovery.run !== 'function') {
            return {
                success: false,
                code: 'SNS_DISCOVERY_NOT_CONFIGURED',
                message: 'SNS RSS Discovery가 구성되지 않았습니다.'
            };
        }

        const result = await snsRssDiscovery.run(trigger);
        const data = result?.data || {};
        recordUiActivity({
            category: 'collection',
            type: result?.success ? 'sns_discovery_completed' : 'sns_discovery_skipped',
            level: result?.success ? 'info' : 'warning',
            title: result?.success ? 'SNS RSS 확인 완료' : 'SNS RSS 확인 건너뜀',
            detail: result?.success
                ? `신규 원문 ${Number(data.newEntryCount || 0)}건 · 채널별 행 ${Number(data.addedDeliveryCount || 0)}건`
                : String(result?.message || '실행 조건을 충족하지 못했습니다.')
        });
        return result;
    }

    async function runSnsDistributionCycle(trigger = 'manual') {
        if (!snsDistributionRunner || typeof snsDistributionRunner.run !== 'function') {
            return {
                success: false,
                code: 'SNS_DISTRIBUTION_NOT_CONFIGURED',
                message: 'SNS Distribution Runner가 구성되지 않았습니다.'
            };
        }

        const result = await snsDistributionRunner.run(trigger);
        const data = result?.data || {};
        recordUiActivity({
            category: 'publish',
            type: result?.success ? 'sns_distribution_completed' : 'sns_distribution_failed',
            level: result?.success ? 'info' : 'warning',
            title: result?.success ? 'SNS 원문 글 발행 완료' : 'SNS 원문 글 발행 확인 필요',
            detail: result?.code === 'SNS_DISTRIBUTION_EMPTY'
                ? '발행 대기 중인 원문 글이 없습니다.'
                : `성공 ${Number(data.completedCount || 0)}건 · 실패 ${Number(data.failedCount || 0)}건 · 건너뜀 ${Number(data.skippedCount || 0)}건`
        });
        return result;
    }

    async function runSnsAutomationCycle(trigger = 'auto') {
        const discovery = await runSnsDiscoveryCycle(trigger);
        if (!discovery?.success) {
            return {
                success: false,
                code: discovery?.code || 'SNS_DISCOVERY_FAILED',
                message: discovery?.message || 'SNS RSS 확인에 실패했습니다.',
                data: { discovery, distribution: null }
            };
        }

        const distribution = await runSnsDistributionCycle(trigger);
        return {
            success: distribution?.success === true,
            code: distribution?.success
                ? 'SNS_AUTOMATION_COMPLETED'
                : (distribution?.code || 'SNS_DISTRIBUTION_FAILED'),
            message: distribution?.message || '',
            data: {
                discovery,
                distribution
            }
        };
    }

    async function runAutoPublishCycle(trigger = 'manual', options = {}) {
        const settingsOverrides = options?.settingsOverrides || {};
        const isManual = String(trigger || '').toLowerCase().includes('manual');
        if (!CONFIG.PUBLISH_AUTO_ENABLED && !isManual) {
            return { success: false, message: '자동 발행이 비활성화되어 있습니다.' };
        }

        const precheck = await License.checkLicenseStatus({ quiet: true });
        if (!precheck.success) return { success: false, message: `라이선스 오류: ${precheck.message}` };
        const features = toFeatureMap(precheck.features);

        if (!isCommandEnabled(features, 'batch')) {
            return { success: false, message: '블로그 batch 권한이 없습니다.' };
        }

        Logger.info(`🚀 [AUTO][Consumer] 자동 발행 시작 (Trigger: ${trigger})`);
        recordUiActivity({
            category: 'publish',
            type: 'auto_publish_started',
            title: '자동 포스팅 시작',
            detail: String(trigger || '').trim() || 'manual'
        });

        try {
            const topicsRes = await Utils.readGoogleSheetTopicsAll({
                status: '',
                limit: 100000,
                sortBy: 'rowNumber',
                sortDir: 'asc'
            });
            const topicItems = Array.isArray(topicsRes.items) ? topicsRes.items : [];

            let candidates = [];
            if (Array.isArray(options?.targetRowIndices) && options.targetRowIndices.length > 0) {
                candidates = topicItems.filter((item) => options.targetRowIndices.includes(item.rowIndex));
            } else {
                candidates = topicItems
                    .filter((item) => String(item?.status || '').trim() === '발행 준비 완료')
                    .sort((a, b) => Number(a.rowNumber || 0) - Number(b.rowNumber || 0));
            }

            let batchSize = normalizeNonNegativeInt(settingsOverrides.PUBLISH_AUTO_BATCH_SIZE ?? CONFIG.PUBLISH_AUTO_BATCH_SIZE, 1);
            if (batchSize === 0) batchSize = 1;

            const selectedCandidates = candidates.slice(0, batchSize);
            const quotaPreflight = buildPublishQuotaPreflight(selectedCandidates.length, precheck);
            const targetCandidates = selectedCandidates.slice(0, quotaPreflight.executable);
            if (targetCandidates.length === 0) {
                Logger.info(quotaPreflight.selected > 0
                    ? `[AUTO][Consumer] ${quotaPreflight.message}`
                    : 'ℹ️ [AUTO][Consumer] 발행 대기 상태인 토픽이 없습니다.');
                return {
                    success: quotaPreflight.selected === 0,
                    code: quotaPreflight.selected > 0 ? 'QUOTA_EXHAUSTED' : undefined,
                    message: quotaPreflight.selected > 0 ? quotaPreflight.message : undefined,
                    data: { published: 0, quotaPreflight }
                };
            }
            Logger.info(`[AUTO][Consumer] ${quotaPreflight.message}`);

            const rawTargets = String(settingsOverrides.PUBLISH_AUTO_TARGET_CHANNELS ?? CONFIG.PUBLISH_AUTO_TARGET_CHANNELS ?? 'naver')
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean);
            const targets = rawTargets.length > 0 ? rawTargets : ['naver'];

            const headless = settingsOverrides.PUBLISH_AUTO_HEADLESS !== undefined
                ? settingsOverrides.PUBLISH_AUTO_HEADLESS
                : (CONFIG.PUBLISH_AUTO_HEADLESS !== undefined ? CONFIG.PUBLISH_AUTO_HEADLESS : CONFIG.HEADLESS);
            const postStatus = String(
                settingsOverrides.PUBLISH_AUTO_POST_STATUS
                ?? CONFIG.PUBLISH_AUTO_POST_STATUS
                ?? 'publish'
            ).trim().toLowerCase() === 'draft' ? 'draft' : 'publish';

            let successCount = 0;
            let failCount = 0;
            const totalResults = [];

            for (const candidate of targetCandidates) {
                const rowOptions = candidate.options || {};
                let rowTargets = targets;
                if (rowOptions.platforms && Array.isArray(rowOptions.platforms) && rowOptions.platforms.length > 0) {
                    rowTargets = rowOptions.platforms;
                }

                const singleResult = await executeBlogBatchRowsAction({
                    action: 'batch',
                    rowIndices: [candidate.rowIndex],
                    headless,
                    targets: rowTargets,
                    postStatus,
                    isAutoCycle: true
                });

                successCount += Number(singleResult?.data?.successCount || 0);
                failCount += Number(singleResult?.data?.failCount || 0);
                if (singleResult?.data?.results) {
                    totalResults.push(...singleResult.data.results);
                }
            }

            const blogResult = { data: { successCount, failCount, results: totalResults } };
            const finalSuccessCount = Number(blogResult?.data?.successCount || 0);
            const finalFailCount = Number(blogResult?.data?.failCount || 0);

            Logger.info(`✅ [AUTO][Consumer] 자동 발행 완료: 성공 ${finalSuccessCount}건, 실패 ${finalFailCount}건`);
            recordUiActivity({
                category: 'publish',
                type: finalFailCount > 0 ? 'auto_publish_completed_with_failures' : 'auto_publish_completed',
                level: finalFailCount > 0 ? 'warn' : 'info',
                title: finalFailCount > 0 ? '자동 포스팅 일부 실패' : '자동 포스팅 완료',
                detail: `성공 ${finalSuccessCount}건 · 실패 ${finalFailCount}건`
            });

            const shouldSendSummary = (successCount + failCount) > 1 || failCount > 0;

            if (CONFIG.PUBLISH_AUTO_NOTIFY_ENABLED && shouldSendSummary) {
                let detailMsg = '';
                const successItems = (blogResult?.data?.results || []).filter((item) => item.success);
                const displayItems = successItems.slice(0, 3);

                if (displayItems.length > 0) {
                    detailMsg += '\n\n<b>[발행 내역 (최대 3건)]</b>';
                    for (const item of displayItems) {
                        const title = item.data?.title || '제목 없음';
                        const results = item.data?.results || {};

                        const platforms = [];
                        if (results.naver?.success) platforms.push('N');
                        if (results.wordpress?.success) platforms.push('W');
                        const platformIndicator = platforms.length > 0 ? `[${platforms.join('/')}] ` : '';

                        let itemLine = `\n• ${platformIndicator}${title}`;

                        if (results.wordpress?.success && results.wordpress?.postUrl) {
                            let shortUrl = results.wordpress.postUrl;
                            if (urlShorteningService?.isConfigured?.()) {
                                shortUrl = await urlShorteningService.shorten(results.wordpress.postUrl);
                            }
                            itemLine += ` (${shortUrl})`;
                        }

                        detailMsg += itemLine;
                    }
                }

                const msg = `<b>[블로그 자동 발행 완료]</b>\n- 성공: <b>${successCount}</b>건\n- 실패: <b>${failCount}</b>건${detailMsg}\n- 시각: ${new Date().toLocaleString()}`;
                if (CONFIG.NOTIFY_TELEGRAM_ENABLED) {
                    TelegramService.sendNotification(msg, {
                        botToken: CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN,
                        chatId: CONFIG.NOTIFY_TELEGRAM_CHAT_ID,
                        enabled: CONFIG.NOTIFY_TELEGRAM_ENABLED
                    }).catch((error) => Logger.error(`텔레그램 알림 전송 에러: ${error.message}`));
                }
                if (CONFIG.NOTIFY_SLACK_ENABLED) {
                    SlackService.sendNotification(msg, {
                        webhookUrl: CONFIG.NOTIFY_SLACK_WEBHOOK_URL,
                        enabled: CONFIG.NOTIFY_SLACK_ENABLED
                    }).catch((error) => Logger.error(`Slack 알림 전송 에러: ${error.message}`));
                }
            }

            return {
                success: true,
                data: {
                    published: successCount,
                    failed: failCount,
                    skipped: selectedCandidates.length - targetCandidates.length,
                    quotaPreflight
                }
            };
        } catch (error) {
            Logger.error(`❌ [AUTO][Consumer] 자동 발행 실패: ${error.message}`);
            recordUiActivity({
                category: 'publish',
                type: 'auto_publish_failed',
                level: 'error',
                title: '자동 포스팅 실패',
                detail: error.message || '알 수 없는 오류'
            });
            return { success: false, message: `자동 발행 실행 오류: ${error.message}` };
        }
    }

    function normalizeManualPublishTargetRowIndices(value) {
        if (!Array.isArray(value)) return [];
        return Array.from(new Set(
            value
                .map((item) => Number(item))
                .filter((item) => Number.isInteger(item) && item >= 0)
        ));
    }

    async function triggerAutoPublishCycle(trigger = 'manual', options = {}) {
        if (publishRuntimeState.running) {
            return {
                success: false,
                code: 'PUBLISH_AUTO_ALREADY_RUNNING',
                message: '이미 다른 발행 작업이 실행 중입니다.'
            };
        }

        const normalizedOptions = {
            ...options,
            targetRowIndices: normalizeManualPublishTargetRowIndices(options?.targetRowIndices)
        };
        const startedAt = new Date().toISOString();

        publishRuntimeState.running = true;
        publishRuntimeState.status = 'running';
        publishRuntimeState.message = '발행 작업을 시작했습니다.';
        autoRuntimeState.startedAt = startedAt;
        autoRuntimeState.lastRunAt = startedAt;
        refreshLegacyAutoRuntimeState();

        Promise.resolve()
            .then(async () => {
                const result = await runAutoPublishCycle(trigger, normalizedOptions);
                publishRuntimeState.lastSummary = result || null;
                if (result?.success === false) {
                    publishRuntimeState.status = 'error';
                    publishRuntimeState.message = result?.message || '발행 작업 처리 중 오류가 발생했습니다.';
                } else {
                    publishRuntimeState.message = '발행 작업이 백그라운드에서 완료되었습니다.';
                    autoRuntimeState.cycleCount = Number(autoRuntimeState.cycleCount || 0) + 1;
                }
                autoRuntimeState.lastSummary = result?.data || result || null;
            })
            .catch((error) => {
                Logger.error(`❌ [AUTO][Consumer] 비동기 자동 발행 시작 실패: ${error.message}`);
                publishRuntimeState.status = 'error';
                publishRuntimeState.message = error.message || '발행 작업 처리 중 오류가 발생했습니다.';
                publishRuntimeState.lastSummary = {
                    success: false,
                    message: publishRuntimeState.message
                };
                autoRuntimeState.lastSummary = publishRuntimeState.lastSummary;
            })
            .finally(() => {
                publishRuntimeState.running = false;
                if (publishRuntimeState.status !== 'error') {
                    publishRuntimeState.status = publishRuntimeState.enabled ? 'waiting' : 'stopped';
                }
                autoRuntimeState.lastRunAt = new Date().toISOString();
                refreshLegacyAutoRuntimeState();
            });

        return {
            success: true,
            data: {
                started: true,
                trigger,
                startedAt,
                targetRowIndices: normalizedOptions.targetRowIndices,
                targetRowCount: normalizedOptions.targetRowIndices.length
            }
        };
    }

    return {
        runAutoCycle,
        runTrendCollectCycle,
        runRssCollectCycle,
        runSnsDiscoveryCycle,
        runSnsDistributionCycle,
        runSnsAutomationCycle,
        runAutoPublishCycle,
        normalizeManualPublishTargetRowIndices,
        triggerAutoPublishCycle
    };
}

module.exports = {
    createAutoCycleRuntime
};
