const { normalizeWritingStrategyOverride } = require('../content/writing-strategy');
const { normalizeShoppingContentFocus } = require('../content/shopping-editorial-plan-prompt');
const { requireSinglePublishTarget } = require('../content/single-publish-target');
const {
    LIFECYCLE_POST_STATUSES,
    LIFECYCLE_TARGETS,
    normalizeTargets
} = require('./content-lifecycle-adapter');

const SHOPPING_TOPIC_STATUS = Object.freeze({
    SAVED: '준비'
});
const POST_STATUSES = LIFECYCLE_POST_STATUSES;
const PLATFORMS = LIFECYCLE_TARGETS;

function text(value) {
    return String(value || '').trim();
}

function buildShoppingTopicSheetRow(input = {}) {
    const shortUrl = text(input.shortUrl || input.url);
    const product = text(input.product);
    const instruction = text(input.instruction);
    const postStatus = text(input.postStatus || 'publish').toLowerCase() || 'publish';
    const scheduleDate = text(input.scheduleDate);
    const writingStrategy = normalizeWritingStrategyOverride(text(input.writingStrategy || 'search'));
    const contentFocus = normalizeShoppingContentFocus(text(input.contentFocus || 'auto'));

    if (!/^https?:\/\//i.test(shortUrl)) {
        const error = new Error('상품 URL은 http 또는 https 주소로 입력해 주세요.');
        error.code = 'SHOPPING_URL_INVALID';
        throw error;
    }
    if (instruction.length > 1000) {
        const error = new Error('담고 싶은 경험·방향은 1,000자 이내로 입력해 주세요.');
        error.code = 'SHOPPING_INSTRUCTION_TOO_LONG';
        throw error;
    }
    if (!POST_STATUSES.includes(postStatus)) {
        const error = new Error('발행 설정을 확인해 주세요.');
        error.code = 'SHOPPING_POST_STATUS_INVALID';
        throw error;
    }
    if (postStatus === 'schedule' && !scheduleDate) {
        const error = new Error('예약 발행 일시를 입력해 주세요.');
        error.code = 'SHOPPING_SCHEDULE_REQUIRED';
        throw error;
    }

    const naverCategory = text(input.naverCategory);
    const wordpressCategory = text(input.wordpressCategory || input.category);
    return {
        shortUrl,
        product,
        instruction,
        status: SHOPPING_TOPIC_STATUS.SAVED,
        category: (naverCategory || wordpressCategory)
            ? `N:${naverCategory}, W:${wordpressCategory}`
            : '',
        postStatus,
        scheduleDate: postStatus === 'schedule' ? scheduleDate : '',
        writingStrategy,
        contentFocus,
        targets: requireSinglePublishTarget(normalizeTargets(input.targets), { required: false })
    };
}

module.exports = {
    PLATFORMS,
    POST_STATUSES,
    SHOPPING_TOPIC_STATUS,
    buildShoppingTopicSheetRow
};
