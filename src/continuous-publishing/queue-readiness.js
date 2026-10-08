const { normalizePublishTargets } = require('../content/single-publish-target');
const { validateBlogWritingOverrides } = require('../content/blog-writing-overrides');
const { getScheduleDateIssue } = require('./topic-capture');

const QUEUE_POST_STATUSES = Object.freeze(['publish', 'draft', 'schedule']);

function cleanText(value) {
    return String(value ?? '').trim();
}

function asList(value) {
    if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
    const text = cleanText(value);
    return text ? text.split(',').map(cleanText).filter(Boolean) : [];
}

function resolveStoredPostStatus(topic = {}) {
    const options = topic.options && typeof topic.options === 'object' ? topic.options : {};
    const optionStatus = cleanText(options.post_status).toLowerCase();
    if (optionStatus) return optionStatus;
    if (topic.post_status_explicit === true || topic.postStatusExplicit === true) {
        return cleanText(topic.postStatus).toLowerCase();
    }
    if (Object.prototype.hasOwnProperty.call(options, 'post_status')) return '';
    // Test/in-process callers may provide an explicit normalized value without the
    // Sheet reader's provenance marker. The reader marks synthesized defaults false.
    if (topic.post_status_explicit !== false && topic.postStatusExplicit !== false
        && Object.prototype.hasOwnProperty.call(topic, 'postStatus')) {
        return cleanText(topic.postStatus).toLowerCase();
    }
    return '';
}

function diagnoseQueueReadiness(topic = {}, options = {}) {
    const issues = [];
    const add = (field, code, message) => issues.push({ field, code, message });
    const subject = cleanText(topic.subject || topic.options?.subject);
    if (!subject) add('subject', 'SUBJECT_REQUIRED', '주제가 없습니다.');

    const targetCandidates = [topic.options?.platforms, topic.options?.targets, topic.targets, topic.platforms];
    const rawTargets = targetCandidates.map(asList).find((targets) => targets.length > 0) || [];
    const listedTargets = Array.from(new Set(rawTargets.map((target) => target.toLowerCase())));
    if (listedTargets.length === 0) {
        add('platforms', 'PUBLISH_TARGET_REQUIRED', '포스팅 대상이 없습니다.');
    } else {
        if (listedTargets.length > 1) {
            add('platforms', 'MULTIPLE_PUBLISH_TARGETS', '포스팅 대상이 여러 개입니다.');
        }
        if (listedTargets.includes('site-hosting')) {
            add('platforms', 'SITE_QUEUE_UNSUPPORTED', '사이트 포스팅은 현재 대기열 실행을 지원하지 않습니다.');
        }
        const unsupported = listedTargets.filter((target) => target !== 'site-hosting' && !normalizePublishTargets([target]).length);
        if (unsupported.length > 0) {
            add('platforms', 'PUBLISH_TARGET_UNSUPPORTED', `현재 대기열에서 지원하지 않는 포스팅 대상이 있습니다: ${unsupported.join(', ')}.`);
        }
    }
    const targets = normalizePublishTargets(listedTargets);

    const postStatus = resolveStoredPostStatus(topic);
    if (!postStatus) {
        add('postStatus', 'POST_STATUS_REQUIRED', '포스팅 방식이 없습니다.');
    } else if (!QUEUE_POST_STATUSES.includes(postStatus)) {
        add('postStatus', 'POST_STATUS_UNSUPPORTED', '지원하지 않는 포스팅 방식입니다.');
    }

    const scheduleDate = cleanText(topic.options?.schedule_date || topic.scheduleDate || topic.schedule_date);
    if (postStatus === 'schedule') {
        if (!scheduleDate) {
            add('scheduleDate', 'SCHEDULE_DATE_REQUIRED', '예약 일시가 없습니다.');
        } else if (!Number.isFinite(Date.parse(scheduleDate))) {
            add('scheduleDate', 'SCHEDULE_DATE_INVALID', '예약 일시가 올바르지 않습니다.');
        } else {
            const scheduleIssue = getScheduleDateIssue(scheduleDate, options.now);
            if (scheduleIssue?.code === 'SCHEDULE_DATE_PAST') {
                add('scheduleDate', scheduleIssue.code, '예약 시각이 지났습니다.');
            }
        }
    }

    const referenceUrls = asList(topic.content_guide?.reference_urls ?? topic.referenceUrls ?? topic.options?.reference_urls);
    if (referenceUrls.some((url) => !/^https?:\/\//i.test(url))) {
        add('referenceUrls', 'REFERENCE_URL_INVALID', '참고 URL이 올바르지 않습니다.');
    }
    const writingOverrides = topic.writing_overrides ?? topic.options?.writing_overrides ?? topic.content_guide?.writing_overrides;
    const writingValidation = validateBlogWritingOverrides(writingOverrides);
    if (writingValidation.errors.length > 0) {
        add('writingOverrides', writingValidation.errors[0].code || 'WRITING_OVERRIDES_INVALID', '글 구성 설정이 올바르지 않습니다.');
    }

    return {
        ready: issues.length === 0 && targets.length === 1,
        issues,
        plan: { subject, targets, postStatus, scheduleDate }
    };
}

module.exports = { QUEUE_POST_STATUSES, diagnoseQueueReadiness };
