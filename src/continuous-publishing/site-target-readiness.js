'use strict';

async function diagnoseSiteTargetAvailability(topic = {}, getSiteHostingSiteService) {
    if (typeof getSiteHostingSiteService !== 'function') return null;
    const target = topic.options?.site_target || {};
    const projectId = String(target.project_id ?? target.projectId ?? '').trim();
    const siteId = String(target.site_id ?? target.siteId ?? '').trim();
    if (!projectId || !siteId) return null;
    const kind = String(target.kind ?? target.site_kind ?? target.siteKind ?? '').trim().toLowerCase();
    try {
        const sites = await getSiteHostingSiteService()?.list(projectId);
        const site = Array.isArray(sites) ? sites.find((item) => String(item?.id) === siteId) : null;
        if (!site) return { field: 'siteTarget', code: 'SITE_NOT_FOUND', message: '선택한 사이트를 찾을 수 없습니다. 포스팅 대상을 다시 선택해 주세요.' };
        if (site.posting_target?.kind && site.posting_target.kind !== kind) {
            return { field: 'siteTarget', code: 'SITE_TARGET_CHANGED', message: '사이트 유형이 변경되었습니다. 포스팅 대상을 다시 선택해 주세요.' };
        }
        if (site.posting_target?.eligible !== true) {
            return {
                field: 'siteTarget',
                code: 'SITE_POSTING_UNAVAILABLE',
                message: site.posting_target?.reason
                    ? `선택한 사이트는 포스팅할 수 없습니다: ${site.posting_target.reason}.`
                    : '선택한 사이트는 현재 포스팅할 수 없습니다.'
            };
        }
        return null;
    } catch (_error) {
        return { field: 'siteTarget', code: 'SITE_STATUS_UNAVAILABLE', message: '사이트 상태를 확인할 수 없습니다. 사이트 설정을 새로고침한 뒤 다시 시도해 주세요.' };
    }
}

module.exports = { diagnoseSiteTargetAvailability };
