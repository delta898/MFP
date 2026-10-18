const { TOPIC_STATUS } = require('./contract');
const { diagnoseQueueReadiness } = require('../applications/blog/queue-management/queue-readiness');
const { diagnoseSiteTargetAvailability } = require('./site-target-readiness');

function createSiteHostingQueueExecutor(deps = {}) {
    const { Utils, ensureSheetsReadyForUi, generateAiManuscriptDraft, getSiteHostingSiteService } = deps;
    const now = typeof deps.now === 'function' ? deps.now : () => new Date();

    function currentTime() {
        const value = now();
        return value instanceof Date ? value.getTime() : Number.isFinite(Number(value)) ? Number(value) : Date.parse(value);
    }

    async function setTopicStatus(rowIndex, status, message) {
        await Utils.updateGoogleSheetStatus(rowIndex, status, message);
        Utils.clearSheetCache?.('topics');
    }

    return async function executeSiteHostingQueueRowAction(input = {}) {
        const rowIndex = Number(input.rowIndex);
        if (!Number.isInteger(rowIndex) || rowIndex < 0) {
            return { success: false, code: 'INVALID_ROW_INDEX', message: '대기열 글감을 확인해 주세요.' };
        }

        let topic;
        let started = false;
        try {
            await ensureSheetsReadyForUi();
            Utils.clearSheetCache?.('topics');
            const sheet = await Utils.readGoogleSheetTopicsAll({ limit: 100000, offset: 0, sortBy: 'rowNumber', sortDir: 'asc' });
            topic = (Array.isArray(sheet?.items) ? sheet.items : []).find((item) => Number(item.rowIndex) === rowIndex);
            if (!topic) return { success: false, code: 'TOPIC_NOT_FOUND', message: '대기열 글감을 찾을 수 없습니다.' };
            if (String(topic.status || '').trim() !== TOPIC_STATUS.READY) {
                return { success: false, code: 'TOPIC_NOT_READY', message: '이 글감은 더 이상 포스팅 준비 상태가 아닙니다.' };
            }

            const readiness = diagnoseQueueReadiness(topic, { now: currentTime() });
            const siteIssue = await diagnoseSiteTargetAvailability(topic, getSiteHostingSiteService);
            const issues = siteIssue ? [...readiness.issues, siteIssue] : readiness.issues;
            if (issues.length > 0 || !readiness.ready) {
                const message = issues.map((issue) => issue.message).join(' ');
                return { success: false, code: issues[0]?.code || 'QUEUE_ITEM_NOT_READY', message, issues };
            }
            if (!readiness.plan.targets.includes('site-hosting')) {
                return { success: false, code: 'SITE_TARGET_REQUIRED', message: '이 글감의 포스팅 대상이 사이트가 아닙니다.' };
            }

            const settings = topic.options && typeof topic.options === 'object' ? topic.options : {};
            const guide = topic.content_guide && typeof topic.content_guide === 'object' ? topic.content_guide : {};
            const siteTarget = settings.site_target;
            const postStatus = readiness.plan.postStatus;
            const referenceUrls = Array.isArray(guide.reference_urls ?? settings.reference_urls)
                ? (guide.reference_urls ?? settings.reference_urls)
                : String(guide.reference_urls ?? settings.reference_urls ?? '').split(',');
            await setTopicStatus(rowIndex, TOPIC_STATUS.RUNNING, '사이트 대기열 포스팅 시작');
            started = true;
            input.execution?.onProgress?.('AI 원고 생성 중...');

            const draft = await generateAiManuscriptDraft({
                subject: readiness.plan.subject,
                title: String(settings.title ?? topic.title ?? '').trim(),
                keywords: topic.keywords ?? settings.keywords ?? [],
                instruction: String(guide.additional_instructions ?? settings.instruction ?? '').trim(),
                referenceUrl: referenceUrls.map((url) => String(url || '').trim()).filter(Boolean).join(', '),
                externalReference: settings.external_reference ?? topic.use_external_ref,
                writingStrategy: settings.writing_strategy ?? topic.writing_strategy,
                writingOverrides: settings.writing_overrides ?? guide.writing_overrides ?? {},
                imageMode: settings.image_mode ?? topic.image_options?.mode ?? topic.image_mode ?? 'prompt_only',
                targets: ['site-hosting'],
                postStatus
            });
            if (!draft?.draftId || !Number.isInteger(Number(draft.revision))) {
                throw Object.assign(new Error('생성한 원고 작업공간을 확인할 수 없습니다.'), { code: 'SITE_QUEUE_DRAFT_INVALID' });
            }

            input.execution?.onProgress?.(postStatus === 'draft' ? '사이트에 임시 저장 중...' : '사이트 포스팅 중...');
            const siteService = getSiteHostingSiteService();
            const result = await siteService.postMarkdown(
                String(siteTarget.project_id ?? siteTarget.projectId),
                String(siteTarget.site_id ?? siteTarget.siteId),
                {
                    draftId: draft.draftId,
                    revision: Number(draft.revision),
                    postStatus,
                    ...(String(siteTarget.kind ?? '').toLowerCase() === 'vault'
                        ? { destinationPath: siteTarget.destination_path ?? siteTarget.destinationPath }
                        : {})
                },
                { requestId: String(input.execution?.operationId || `continuous-publishing:row-${rowIndex}`) }
            );

            const actualPostStatus = result.postStatus === 'draft' ? 'draft' : postStatus;
            const nextStatus = actualPostStatus === 'draft' ? TOPIC_STATUS.DRAFTED : TOPIC_STATUS.PUBLISHED;
            const linkOrId = result.post_url || result.post_id || '';
            const log = [result.status, result.warning, linkOrId].filter(Boolean).join(' · ');
            await setTopicStatus(rowIndex, nextStatus, log);
            input.execution?.onProgress?.('완료');
            return {
                success: true,
                data: {
                    status: nextStatus,
                    postStatus: actualPostStatus,
                    ...(result.forcedDraft ? { forcedDraft: true, warning: result.warning } : {}),
                    title: draft.title || topic.subject,
                    post_id: result.post_id,
                    post_url: result.post_url || '',
                    results: { 'site-hosting': { success: true, postUrl: result.post_url || '', postId: result.post_id } }
                }
            };
        } catch (error) {
            const status = error?.code === 'SITE_HOSTING_POST_SAVED_DEPLOY_FAILED'
                ? TOPIC_STATUS.NEEDS_ATTENTION
                : TOPIC_STATUS.FAILED;
            if (started) {
                try { await setTopicStatus(rowIndex, status, error.message || '사이트 대기열 포스팅에 실패했습니다.'); } catch (_) { }
            }
            return { success: false, code: error?.code || 'SITE_QUEUE_EXECUTION_FAILED', message: error?.message || '사이트 대기열 포스팅에 실패했습니다.' };
        }
    };
}

module.exports = { createSiteHostingQueueExecutor };
