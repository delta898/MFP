const { isTransientBufferError } = require('./gateways/buffer-client');

const IMAGE_REQUIRED_SERVICES = Object.freeze(new Set([
    'instagram'
]));

function normalizeTokens(value) {
    return [...new Set((Array.isArray(value) ? value : [])
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean))];
}

function requiresImageAsset(service) {
    return IMAGE_REQUIRED_SERVICES.has(String(service || '').trim().toLowerCase());
}

function composeSnsPostText(row = {}) {
    const title = String(row.title || '').trim();
    const originalUrl = String(row.originalUrl || '').trim();
    return [title, originalUrl].filter(Boolean).join('\n\n');
}

function createSnsDistributionRunner(options = {}) {
    const {
        CONFIG,
        License,
        store,
        bufferClient,
        getEnableSnsDistribution,
        Logger
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
        || !bufferClient
        || typeof bufferClient.shareNowMany !== 'function'
        || typeof getEnableSnsDistribution !== 'function') {
        throw new Error('SNS Distribution Runner 의존성이 올바르지 않습니다.');
    }

    async function run(trigger = 'auto') {
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

        await store.markGroupProcessing(
            publishable,
            `원문 글 묶음 발행 시작 · 채널 ${publishable.length}개`
        );

        const deliveries = publishable.map((row) => ({
            deliveryKey: row.deliveryKey,
            channelId: row.channelId,
            text: composeSnsPostText(row),
            imageUrl: row.imageUrl
        }));
        let attempts = 0;
        let publishResults = [];
        let finalError = null;

        while (attempts < maxAttempts) {
            attempts += 1;
            try {
                publishResults = await bufferClient.shareNowMany(apiKey, deliveries);
                finalError = null;
                break;
            } catch (error) {
                finalError = error;
                const canRetry = isTransientBufferError(error) && attempts < maxAttempts;
                Logger?.warn?.(
                    `⚠️ [SNS] Buffer 묶음 발행 ${attempts}차 실패`
                    + `${canRetry ? `, ${Math.round(retryDelayMs / 1000)}초 후 재시도` : ''}: ${error.message}`
                );
                if (!canRetry) break;
                await sleep(retryDelayMs);
            }
        }

        const rowsByDeliveryKey = new Map(
            publishable.map((row) => [String(row.deliveryKey || '').trim(), row])
        );
        const deliveryResults = [];
        if (finalError) {
            for (const row of publishable) {
                deliveryResults.push({
                    rowNumber: row.rowNumber,
                    status: '실패',
                    log: `Buffer 발행 실패 (${attempts}회 시도): ${finalError.message}`
                });
            }
        } else {
            for (const result of publishResults) {
                const row = rowsByDeliveryKey.get(String(result?.deliveryKey || '').trim());
                if (!row) continue;
                deliveryResults.push(result.success
                    ? {
                        rowNumber: row.rowNumber,
                        status: '완료',
                        bufferPostId: result.bufferPostId,
                        log: `Buffer 즉시 발행 완료 (${attempts}차 시도)`
                    }
                    : {
                        rowNumber: row.rowNumber,
                        status: '실패',
                        log: `Buffer 발행 실패: ${result.message || '알 수 없는 오류'}`
                    });
            }
            const resolvedRows = new Set(deliveryResults.map((item) => item.rowNumber));
            for (const row of publishable) {
                if (resolvedRows.has(row.rowNumber)) continue;
                deliveryResults.push({
                    rowNumber: row.rowNumber,
                    status: '실패',
                    log: 'Buffer 응답에서 채널별 결과를 찾지 못함'
                });
            }
        }

        await store.applyDeliveryResults(deliveryResults);
        const completedCount = deliveryResults.filter((item) => item.status === '완료').length;
        const failedCount = deliveryResults.filter((item) => item.status === '실패').length;
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
    IMAGE_REQUIRED_SERVICES,
    normalizeTokens,
    requiresImageAsset,
    composeSnsPostText,
    createSnsDistributionRunner
};
