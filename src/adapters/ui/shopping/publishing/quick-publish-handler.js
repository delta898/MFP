'use strict';

const { normalizeWritingStrategyOverride } = require('../../../../services/content-writing/writing-strategy');
const { normalizePublishTargets } = require('../../../../services/content-delivery/single-publish-target');

function createShoppingQuickPublishHandler(deps = {}) {
    const {
        CONFIG, License, GoogleSheets, normalizePublishMode, toFeatureMap,
        isCommandEnabled, checkAuthSessionValid, getFeatureBool, getExecuteShoppingRowAction
    } = deps;

    async function executeShoppingQuickPublish(requestBody = {}) {
        const shortUrl = String(requestBody?.shortUrl || requestBody?.url || '').trim();
        const product = String(requestBody?.product || '').trim();
        const instruction = String(requestBody?.instruction || '').trim();
        const rawWritingStrategy = String(requestBody?.writingStrategy || '').trim().toLowerCase();
        if (rawWritingStrategy && !['search', 'discovery'].includes(rawWritingStrategy)) {
            return { success: false, code: 'INVALID_WRITING_STRATEGY', message: '글쓰기 전략 값이 올바르지 않습니다.' };
        }
        const writingStrategy = normalizeWritingStrategyOverride(rawWritingStrategy);
        const contentFocus = String(requestBody?.contentFocus || 'auto').trim().toLowerCase();
        if (!['auto', 'product_intro', 'comparison', 'usage'].includes(contentFocus)) {
            return { success: false, code: 'INVALID_SHOPPING_CONTENT_FOCUS', message: '글의 초점 값이 올바르지 않습니다.' };
        }
        const publishMode = normalizePublishMode(requestBody?.publishMode);
        const headless = typeof requestBody?.headless === 'boolean' ? requestBody.headless : Boolean(CONFIG.HEADLESS);
        const targets = normalizePublishTargets(Array.isArray(requestBody?.targets) ? requestBody.targets : ['naver']);
        const postStatus = String(requestBody?.postStatus || 'publish').trim() || 'publish';
        const scheduleDate = String(requestBody?.scheduleDate || '').trim();

        if (targets.length !== 1) {
            return {
                success: false,
                code: targets.length === 0 ? 'PUBLISH_TARGET_REQUIRED' : 'MULTIPLE_PUBLISH_TARGETS',
                message: '하나의 쇼핑 원고에는 발행 대상을 하나만 선택해 주세요.'
            };
        }

        if (!shortUrl) {
            return { success: false, code: 'INVALID_SHOPPING_URL', message: '쇼핑 URL은 필수입니다.' };
        }
        if (!/^https?:\/\//i.test(shortUrl)) {
            return { success: false, code: 'INVALID_SHOPPING_URL', message: '쇼핑 URL 형식이 올바르지 않습니다. (http/https)' };
        }
        if (instruction.length > 1000) {
            return { success: false, code: 'INVALID_SHOPPING_INSTRUCTION', message: '참고/지시사항은 1,000자 이내로 입력해 주세요.' };
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

        await GoogleSheets.ensureAllSheetsExist();
        const appendStatus = publishMode === 'append_and_publish' ? '발행 준비 완료' : '준비';
        const naverCategory = String(requestBody?.naverCategory || '').trim();
        const wordpressCategory = String(requestBody?.wordpressCategory || requestBody?.category || '').trim();
        let categoryField = '';
        if (naverCategory || wordpressCategory) {
            categoryField = `N:${naverCategory}, W:${wordpressCategory}`;
        }
        const appendResult = await GoogleSheets.appendGoogleSheetShopping([{
            shortUrl,
            product,
            instruction,
            status: appendStatus,
            category: categoryField,
            postStatus,
            scheduleDate,
            writingStrategy,
            contentFocus
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
            { rowIndex, headless, targets, isLast: true, operationId: requestBody?.operationId },
            {
                features,
                enableRelatedPostsAutoLink: getFeatureBool(features, 'enable_related_posts_auto_link', false),
                lifecycleSource: 'shopping-quick'
            }
        );

        if (!result.success) {
            return result;
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


    return Object.freeze({ executeShoppingQuickPublish });
}

module.exports = { createShoppingQuickPublishHandler };
