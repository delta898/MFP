'use strict';

const CONTENT_LIFECYCLE_KIND = Object.freeze({
    BLOG: 'blog',
    SHOPPING: 'shopping',
    SITE_HOSTING: 'site-hosting'
});

const LIFECYCLE_TARGETS = Object.freeze(['naver', 'wordpress', 'site-hosting']);
const LIFECYCLE_POST_STATUSES = Object.freeze(['publish', 'draft', 'schedule']);

function normalizeText(value) {
    return String(value || '').trim();
}

function normalizeTargets(value) {
    const values = Array.isArray(value) ? value : normalizeText(value).split(',');
    return Array.from(new Set(values
        .map((item) => normalizeText(item).toLowerCase())
        .filter((item) => LIFECYCLE_TARGETS.includes(item))));
}

function normalizePostStatus(value) {
    const status = normalizeText(value).toLowerCase();
    return LIFECYCLE_POST_STATUSES.includes(status) ? status : 'publish';
}

function resolveDeliveryPlan(item = {}) {
    const options = item.options && typeof item.options === 'object' ? item.options : {};
    const targets = normalizeTargets(item.targets || options.platforms || options.targets);
    const postStatus = normalizePostStatus(item.postStatus || options.post_status);
    const scheduleDate = postStatus === 'schedule'
        ? normalizeText(item.scheduleDate || options.schedule_date)
        : '';
    return { targets, postStatus, scheduleDate };
}

module.exports = {
    CONTENT_LIFECYCLE_KIND,
    LIFECYCLE_POST_STATUSES,
    LIFECYCLE_TARGETS,
    normalizePostStatus,
    normalizeTargets,
    resolveDeliveryPlan
};
