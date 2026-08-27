const { isTransientBufferError } = require('./gateways/buffer-client');
const {
    LIVE_PUBLISH_BLOCKED_CODE,
    LIVE_PUBLISH_BLOCKED_MESSAGE,
    isLivePublishAllowed
} = require('../environment/runtime-effects');
const {
    formatSnsPost,
    isSnsServiceSupported,
    isSnsServiceDisabled,
    normalizeHashtagTokens,
    requiresImageAsset
} = require('./sns-content-formatter');

function normalizeTokens(value) {
    return [...new Set((Array.isArray(value) ? value : [])
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean))];
}

function normalizeBufferPostText(value) {
    return String(value || '')
        .replace(/\r\n?/g, '\n')
        .trim();
}

function buildBufferPostMatchKey(channelId, text) {
    return `${String(channelId || '').trim()}\n${normalizeBufferPostText(text)}`;
}

function isBufferDuplicatePostError(value) {
    const message = String(value?.message || value || '').trim().toLowerCase();
    return message.includes('already got this one scheduled or posted')
        || (message.includes('same thing') && message.includes('too close together'));
}

function composeSnsPostText(row = {}, options = {}) {
    const formatted = formatSnsPost({
        service: row.service || options.service || 'facebook',
        title: row.title,
        summary: row.summary,
        url: options.url || row.originalUrl,
        hashtags: options.hashtags ?? row.hashtags
    });
    return formatted.success ? formatted.text : '';
}

function escapeTelegramHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildSnsFailureNotification(group = {}, failures = []) {
    const first = Array.isArray(group.rows) ? group.rows[0] || {} : {};
    const title = escapeTelegramHtml(first.title || '(제목 없음)');
    const originalUrl = String(first.originalUrl || '').trim();
    const lines = failures.map((failure) => {
        const row = failure.row || {};
        const channel = escapeTelegramHtml(row.channelName || row.service || row.channelId || '알 수 없는 채널');
        return `• <b>${channel}</b>: ${escapeTelegramHtml(failure.message || '알 수 없는 오류')}`;
    });
    return [
        '<b>❌ BlogGenius SNS 발행 실패</b>',
        '',
        `<b>글:</b> ${title}`,
        ...(originalUrl
            ? [`<b>원문:</b> <a href="${escapeTelegramHtml(originalUrl)}">${escapeTelegramHtml(originalUrl)}</a>`]
            : []),
        `<b>실패 채널:</b> ${failures.length}개`,
        ...lines
    ].join('\n');
}

function createSnsDistributionRunner(options = {}) {
    const {
        CONFIG,
        License,
        store,
        bufferClient,
        aiService,
        urlService,
        notificationService,
        getEnableSnsDistribution,
        Logger,
        recordActivityLifecycle = async () => null
    } = options;
    const sleep = typeof options.sleep === 'function'
        ? options.sleep
        : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? 10000) || 0);
    const maxAttempts = Math.max(1, Number.parseInt(options.maxAttempts, 10) || 3);

    if (!CONFIG
        || !License
        || !store
        || typeof store.findFirstPendingGroup !== 'function'
        || typeof store.markGroupProcessing !== 'function'
        || typeof store.applyDeliveryResults !== 'function'
        || typeof store.saveEntryHashtags !== 'function'
        || !bufferClient
        || typeof bufferClient.shareNowMany !== 'function'
        || typeof bufferClient.listRecentPosts !== 'function'
        || !aiService
        || typeof aiService.generateHashtags !== 'function'
        || !urlService
        || typeof urlService.shorten !== 'function'
        || !notificationService
        || typeof notificationService.sendNotification !== 'function'
        || typeof getEnableSnsDistribution !== 'function') {
        throw new Error('SNS Distribution Runner 의존성이 올바르지 않습니다.');
    }

    async function reconcilePublishedDeliveries(apiKey, deliveries, startedAt) {
        const targets = Array.isArray(deliveries) ? deliveries : [];
        if (targets.length === 0) {
            return { success: true, matches: new Map(), posts: [] };
        }
        const startedAtMs = Date.parse(String(startedAt || ''));
        const startDate = new Date(
            (Number.isFinite(startedAtMs) ? startedAtMs : Date.now()) - (5 * 60 * 1000)
        ).toISOString();
        try {
            const posts = await bufferClient.listRecentPosts(apiKey, {
                organizationId: CONFIG.BUFFER_ORGANIZATION_ID,
                channelIds: targets.map((delivery) => delivery.channelId),
                startDate,
                first: Math.max(20, targets.length * 10)
            });
            const postsByKey = new Map();
            for (const post of Array.isArray(posts) ? posts : []) {
                const key = buildBufferPostMatchKey(post?.channelId, post?.text);
                if (!postsByKey.has(key)) postsByKey.set(key, post);
            }
            const matches = new Map();
            for (const delivery of targets) {
                const post = postsByKey.get(buildBufferPostMatchKey(delivery.channelId, delivery.text));
                if (post?.id) matches.set(delivery.deliveryKey, post);
            }
            return { success: true, matches, posts };
        } catch (error) {
            Logger?.warn?.(`⚠️ [SNS] Buffer 최근 게시물 확인 실패: ${error.message}`);
            return { success: false, matches: new Map(), posts: [], error };
        }
    }

    async function notifyFinalFailures(group, failures) {
        if (failures.length === 0
            || CONFIG.NOTIFY_TELEGRAM_ENABLED !== true
            || !String(CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN || '').trim()
            || !String(CONFIG.NOTIFY_TELEGRAM_CHAT_ID || '').trim()) {
            return { attempted: false, success: false };
        }
        try {
            const result = await notificationService.sendNotification(
                buildSnsFailureNotification(group, failures),
                {
                    enabled: true,
                    botToken: CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN,
                    chatId: CONFIG.NOTIFY_TELEGRAM_CHAT_ID
                }
            );
            return { attempted: true, success: result?.success === true };
        } catch (error) {
            Logger?.warn?.(`⚠️ [SNS] 최종 실패 Telegram 알림 전송 실패: ${error.message}`);
            return { attempted: true, success: false };
        }
    }

    async function applyPreparationFailure(group, rows, error, trigger, skippedCount) {
        const message = `SNS 발행 준비 실패: ${error.message}`;
        const deliveryResults = rows.map((row) => ({
            rowNumber: row.rowNumber,
            status: '실패',
            log: message
        }));
        await store.applyDeliveryResults(deliveryResults);
        const notification = await notifyFinalFailures(
            group,
            rows.map((row) => ({ row, message }))
        );
        return {
            success: false,
            code: 'SNS_DISTRIBUTION_PREPARATION_FAILED',
            message,
            data: {
                trigger,
                entryKey: group.entryKey,
                attemptedCount: rows.length,
                completedCount: 0,
                failedCount: rows.length,
                skippedCount,
                attempts: 0,
                notification,
                rowNumbers: group.rows.map((row) => row.rowNumber)
            }
        };
    }

    async function run(trigger = 'auto') {
        if (!isLivePublishAllowed(CONFIG)) {
            return {
                success: false,
                code: LIVE_PUBLISH_BLOCKED_CODE,
                message: LIVE_PUBLISH_BLOCKED_MESSAGE
            };
        }
        if (CONFIG.SNS_PUBLISH_ENABLED !== true) {
            return {
                success: false,
                code: 'SNS_DISTRIBUTION_DISABLED',
                message: 'SNS 자동 발행이 비활성화되어 있습니다.'
            };
        }

        const license = await License.checkLicenseStatus({ quiet: true });
        if (!license?.success) {
            return {
                success: false,
                code: 'LICENSE_STATUS_FAILED',
                message: license?.message || '라이선스 확인에 실패했습니다.'
            };
        }
        if (!getEnableSnsDistribution(license.features)) {
            return {
                success: false,
                code: 'SNS_CAPABILITY_DISABLED',
                message: 'SNS 자동 발행 capability가 비활성화되어 있습니다.'
            };
        }

        const apiKey = String(CONFIG.BUFFER_API_KEY || '').trim();
        if (!apiKey) {
            return {
                success: false,
                code: 'BUFFER_API_KEY_REQUIRED',
                message: 'Buffer API Key가 필요합니다.'
            };
        }

        const group = await store.findFirstPendingGroup();
        if (!group || group.rows.length === 0) {
            return {
                success: true,
                code: 'SNS_DISTRIBUTION_EMPTY',
                data: {
                    trigger,
                    entryKey: '',
                    attemptedCount: 0,
                    completedCount: 0,
                    failedCount: 0,
                    skippedCount: 0,
                    message: '발행 대기 중인 원문 글이 없습니다.'
                }
            };
        }

        const selectedSources = new Set(normalizeTokens(CONFIG.SNS_SOURCE_BLOGS));
        const selectedChannelIds = new Set(
            (Array.isArray(CONFIG.BUFFER_CHANNELS) ? CONFIG.BUFFER_CHANNELS : [])
                .map((channel) => String(channel?.id || channel?.channelId || '').trim())
                .filter(Boolean)
        );
        const skipped = [];
        const publishable = [];

        for (const row of group.rows) {
            if (!selectedSources.has(String(row.sourcePlatform || '').trim().toLowerCase())) {
                skipped.push({
                    rowNumber: row.rowNumber,
                    status: '건너뜀',
                    log: 'SNS 발행 대상 블로그에서 제외됨'
                });
                continue;
            }
            if (!selectedChannelIds.has(String(row.channelId || '').trim())) {
                skipped.push({
                    rowNumber: row.rowNumber,
                    status: '건너뜀',
                    log: '현재 Buffer 발행 채널에서 제외됨'
                });
                continue;
            }
            if (!isSnsServiceSupported(row.service)) {
                skipped.push({
                    rowNumber: row.rowNumber,
                    status: '건너뜀',
                    log: isSnsServiceDisabled(row.service)
                        ? `${row.service || '해당 채널'}은(는) SNS 자동 발행 지원 대상에서 제외됨`
                        : `${row.service || '해당 채널'}은(는) SNS 자동 발행에서 지원하지 않음`
                });
                continue;
            }
            if (requiresImageAsset(row.service) && !String(row.imageUrl || '').trim()) {
                skipped.push({
                    rowNumber: row.rowNumber,
                    status: '건너뜀',
                    log: `${row.service || '해당 채널'}은(는) 대표 이미지가 필요함`
                });
                continue;
            }
            publishable.push(row);
        }

        if (skipped.length > 0) {
            await store.applyDeliveryResults(skipped);
        }
        if (publishable.length === 0) {
            return {
                success: true,
                code: 'SNS_DISTRIBUTION_SKIPPED',
                data: {
                    trigger,
                    entryKey: group.entryKey,
                    attemptedCount: 0,
                    completedCount: 0,
                    failedCount: 0,
                    skippedCount: skipped.length,
                    rowNumbers: group.rows.map((row) => row.rowNumber)
                }
            };
        }

        const firstRow = publishable[0];
        let publishUrl = String(firstRow.originalUrl || '').trim();
        try {
            publishUrl = await urlService.shorten(publishUrl, CONFIG.NOTIFY_BITLY_TOKEN) || publishUrl;
        } catch (error) {
            Logger?.warn?.(`⚠️ [SNS] Bitly URL 단축 실패, 원문 URL을 사용합니다: ${error.message}`);
        }

        let hashtags = normalizeHashtagTokens(
            publishable.find((row) => String(row.hashtags || '').trim())?.hashtags
        );
        if (hashtags.length === 0) {
            const aiResult = await aiService.generateHashtags({
                mode: CONFIG.SNS_AI_MODE,
                title: firstRow.title,
                summary: firstRow.summary
            });
            hashtags = normalizeHashtagTokens(aiResult?.hashtags);
        }

        if (hashtags.length > 0) {
            try {
                await store.saveEntryHashtags(group.entryKey, hashtags.join(' '));
            } catch (error) {
                return applyPreparationFailure(group, publishable, error, trigger, skipped.length);
            }
        }

        const deliveries = [];
        const formattingFailures = [];
        for (const row of publishable) {
            const formatted = formatSnsPost({
                service: row.service,
                title: row.title,
                summary: row.summary,
                url: publishUrl,
                hashtags
            });
            if (!formatted.success) {
                formattingFailures.push({
                    row,
                    message: formatted.message
                });
                continue;
            }
            deliveries.push({
                deliveryKey: row.deliveryKey,
                channelId: row.channelId,
                text: formatted.text,
                imageUrl: row.imageUrl
            });
        }

        if (formattingFailures.length > 0) {
            await store.applyDeliveryResults(formattingFailures.map(({ row, message }) => ({
                rowNumber: row.rowNumber,
                status: '실패',
                log: message
            })));
        }
        const formattedRows = publishable.filter(
            (row) => !formattingFailures.some((failure) => failure.row.rowNumber === row.rowNumber)
        );

        if (deliveries.length > 0) {
            await store.markGroupProcessing(
                formattedRows,
                `원문 글 묶음 발행 시작 · 채널 ${formattedRows.length}개`
            );
            for (const row of formattedRows) {
                await recordActivityLifecycle({
                    domain: 'sns',
                    stage: 'selected',
                    subject: row.title || row.summary || row.originalUrl,
                    source: `sns-distribution:${trigger}`,
                    entity_ref: String(row.deliveryKey || `sns-row-${row.rowNumber}`),
                    platform: row.service,
                    evidence_id: `sns-distribution:${row.deliveryKey || row.rowNumber}:selected`,
                    metadata: {
                        entry_key: group.entryKey,
                        row_number: row.rowNumber,
                        channel_id: row.channelId,
                        source_platform: row.sourcePlatform
                    }
                });
            }
        }

        let attempts = 0;
        let pendingDeliveries = [...deliveries];
        const confirmedPublishResults = new Map();
        const terminalPublishResults = new Map();
        let finalError = null;
        const publishStartedAt = new Date().toISOString();
        if (pendingDeliveries.length > 0) {
            while (attempts < maxAttempts && pendingDeliveries.length > 0) {
                attempts += 1;
                try {
                    const attemptDeliveries = [...pendingDeliveries];
                    const publishResults = await bufferClient.shareNowMany(apiKey, attemptDeliveries);
                    const deliveriesByKey = new Map(
                        attemptDeliveries.map((delivery) => [delivery.deliveryKey, delivery])
                    );
                    const duplicateDeliveries = [];
                    for (const result of publishResults) {
                        const deliveryKey = String(result?.deliveryKey || '').trim();
                        if (!deliveryKey || !deliveriesByKey.has(deliveryKey)) continue;
                        if (result.success) {
                            confirmedPublishResults.set(deliveryKey, result);
                        } else if (isBufferDuplicatePostError(result)) {
                            duplicateDeliveries.push(deliveriesByKey.get(deliveryKey));
                        } else {
                            terminalPublishResults.set(deliveryKey, result);
                        }
                    }
                    const resolvedKeys = new Set(publishResults
                        .map((result) => String(result?.deliveryKey || '').trim())
                        .filter(Boolean));
                    for (const delivery of attemptDeliveries) {
                        if (resolvedKeys.has(delivery.deliveryKey)) continue;
                        terminalPublishResults.set(delivery.deliveryKey, {
                            success: false,
                            deliveryKey: delivery.deliveryKey,
                            channelId: delivery.channelId,
                            message: 'Buffer 응답에서 채널별 결과를 찾지 못함'
                        });
                    }

                    if (duplicateDeliveries.length > 0) {
                        const reconciliation = await reconcilePublishedDeliveries(
                            apiKey,
                            duplicateDeliveries,
                            publishStartedAt
                        );
                        for (const delivery of duplicateDeliveries) {
                            const post = reconciliation.matches.get(delivery.deliveryKey);
                            if (post) {
                                confirmedPublishResults.set(delivery.deliveryKey, {
                                    success: true,
                                    deliveryKey: delivery.deliveryKey,
                                    channelId: delivery.channelId,
                                    bufferPostId: post.id,
                                    reconciled: true
                                });
                            } else {
                                confirmedPublishResults.set(delivery.deliveryKey, {
                                    success: true,
                                    deliveryKey: delivery.deliveryKey,
                                    channelId: delivery.channelId,
                                    bufferPostId: '',
                                    duplicateConfirmed: true,
                                    reconciliationFailed: !reconciliation.success
                                });
                            }
                        }
                    }
                    pendingDeliveries = [];
                    finalError = null;
                    break;
                } catch (error) {
                    finalError = error;
                    const canRetry = isTransientBufferError(error) && attempts < maxAttempts;
                    Logger?.warn?.(
                        `⚠️ [SNS] Buffer 묶음 발행 ${attempts}차 실패`
                        + `${canRetry ? `, ${Math.round(retryDelayMs / 1000)}초 후 재시도` : ''}: ${error.message}`
                    );
                    if (isTransientBufferError(error)) {
                        await sleep(retryDelayMs);
                        const reconciliation = await reconcilePublishedDeliveries(
                            apiKey,
                            pendingDeliveries,
                            publishStartedAt
                        );
                        if (!reconciliation.success) {
                            if (canRetry) continue;
                            break;
                        }

                        const unresolved = [];
                        for (const delivery of pendingDeliveries) {
                            const post = reconciliation.matches.get(delivery.deliveryKey);
                            if (post) {
                                confirmedPublishResults.set(delivery.deliveryKey, {
                                    success: true,
                                    deliveryKey: delivery.deliveryKey,
                                    channelId: delivery.channelId,
                                    bufferPostId: post.id,
                                    reconciled: true
                                });
                            } else {
                                unresolved.push(delivery);
                            }
                        }
                        pendingDeliveries = unresolved;
                        if (pendingDeliveries.length === 0) {
                            finalError = null;
                            break;
                        }
                        if (canRetry) continue;
                    }
                    break;
                }
            }
        }

        const rowsByDeliveryKey = new Map(
            formattedRows.map((row) => [String(row.deliveryKey || '').trim(), row])
        );
        const deliveryResults = [];
        for (const result of confirmedPublishResults.values()) {
            const row = rowsByDeliveryKey.get(String(result?.deliveryKey || '').trim());
            if (!row) continue;
            await recordActivityLifecycle({
                domain: 'sns',
                stage: 'published',
                subject: row.title || row.summary || row.originalUrl,
                source: `sns-distribution:${trigger}`,
                entity_ref: String(row.deliveryKey || `sns-row-${row.rowNumber}`),
                platform: row.service,
                result_ref: result.bufferPostId || '',
                evidence_id: `sns-distribution:${row.deliveryKey || row.rowNumber}:published`,
                metadata: {
                    entry_key: group.entryKey,
                    row_number: row.rowNumber,
                    channel_id: row.channelId,
                    reconciled: result.reconciled === true,
                    duplicate_confirmed: result.duplicateConfirmed === true
                }
            });
            deliveryResults.push({
                rowNumber: row.rowNumber,
                status: '완료',
                bufferPostId: result.bufferPostId,
                log: result.reconciled
                    ? `Buffer 최근 게시물 조회로 발행 완료 확인 (${attempts}차 시도 후)`
                    : result.duplicateConfirmed
                        ? `Buffer 중복 방지 응답으로 기존 발행 확인${result.reconciliationFailed ? ' (게시물 ID 조회 실패)' : ''}`
                    : `Buffer 즉시 발행 완료 (${attempts}차 시도)`
            });
        }
        for (const result of terminalPublishResults.values()) {
            const row = rowsByDeliveryKey.get(String(result?.deliveryKey || '').trim());
            if (!row) continue;
            deliveryResults.push({
                rowNumber: row.rowNumber,
                status: '실패',
                log: `Buffer 발행 실패: ${result.message || '알 수 없는 오류'}`
            });
        }
        if (pendingDeliveries.length > 0) {
            for (const delivery of pendingDeliveries) {
                const row = rowsByDeliveryKey.get(String(delivery.deliveryKey || '').trim());
                if (!row) continue;
                deliveryResults.push({
                    rowNumber: row.rowNumber,
                    status: '실패',
                    log: isTransientBufferError(finalError)
                        ? `Buffer 발행 여부 확인 실패 (${attempts}회 시도, 자동 재시도 중단): ${finalError.message}`
                        : `Buffer 발행 실패 (${attempts}회 시도): ${finalError?.message || '알 수 없는 오류'}`
                });
            }
        }

        if (deliveryResults.length > 0) {
            await store.applyDeliveryResults(deliveryResults);
        }
        const allFailures = [
            ...formattingFailures,
            ...deliveryResults
                .filter((item) => item.status === '실패')
                .map((item) => ({
                    row: formattedRows.find((row) => row.rowNumber === item.rowNumber) || {},
                    message: item.log
                }))
        ];
        const notification = await notifyFinalFailures(group, allFailures);
        const completedCount = deliveryResults.filter((item) => item.status === '완료').length;
        const failedCount = allFailures.length;
        const result = {
            success: failedCount === 0,
            code: failedCount === 0 ? 'SNS_DISTRIBUTION_COMPLETED' : 'SNS_DISTRIBUTION_PARTIAL',
            message: failedCount > 0 ? `SNS 채널 ${failedCount}개 발행에 실패했습니다.` : '',
            data: {
                trigger,
                entryKey: group.entryKey,
                attemptedCount: publishable.length,
                completedCount,
                failedCount,
                skippedCount: skipped.length,
                attempts,
                notification,
                rowNumbers: group.rows.map((row) => row.rowNumber)
            }
        };
        Logger?.info?.(
            `✅ [SNS] 원문 글 묶음 처리 완료: 성공 ${completedCount}건, 실패 ${failedCount}건, `
            + `건너뜀 ${skipped.length}건`
        );
        return result;
    }

    return {
        run
    };
}

module.exports = {
    normalizeTokens,
    normalizeBufferPostText,
    buildBufferPostMatchKey,
    isBufferDuplicatePostError,
    requiresImageAsset,
    composeSnsPostText,
    escapeTelegramHtml,
    buildSnsFailureNotification,
    createSnsDistributionRunner
};
