function escapeMarkdown(text) {
    if (!text) return '';
    return String(text)
        .replace(/_/g, '\\_')
        .replace(/\*/g, '\\*')
        .replace(/\[/g, '\\[')
        .replace(/`/g, '\\`');
}

function formatStructuredPreviewLines(preview = {}) {
    const kind = String(preview?.kind || '').trim();
    if (kind === 'topic_registration') {
        return [
            `🎯 *주제:* ${escapeMarkdown(preview.theme || '주제 없음')}`,
            `🔑 *키워드:* ${Array.isArray(preview.keywords) && preview.keywords.length > 0 ? preview.keywords.map((item) => escapeMarkdown(item)).join(', ') : '없음'}`,
            `🖼️ *이미지 생성:* ${preview.options?.image_gen === true ? '✅' : '❌'}`,
            `🔍 *외부 자료 참고:* ${preview.options?.external_reference !== false ? '✅' : '❌'}`
        ];
    }

    if (kind === 'publish_request') {
        const lines = [];
        if (Array.isArray(preview.platforms) && preview.platforms.length > 0) {
            const labels = preview.platforms.map((item) => item === 'wordpress' ? '워드프레스' : '네이버 블로그');
            lines.push(`🏷️ *적용 대상:* ${labels.join(', ')}`);
        }
        lines.push(`🚀 *발행까지:* ${preview.auto_trigger === false ? '❌' : '✅'}`);
        lines.push(`📌 *발행 형태:* ${preview.options?.post_status === 'draft' ? '임시저장' : '최종발행'}`);
        if (typeof preview.target_row_count === 'number' && preview.target_row_count > 0) {
            lines.push(`📦 *대상 건수:* ${Number(preview.target_row_count || 0)}건`);
        }
        if (preview.settings?.headless === true) {
            lines.push(`👁️ *헤드리스:* ✅`);
        }
        return lines;
    }

    return [];
}

function formatPreviewMessage(confirmation = null, previews = []) {
    const plan = confirmation?.plan && typeof confirmation.plan === 'object' ? confirmation.plan : null;
    const isCorrection = String(confirmation?.kind || '').trim() === 'correction';
    const title = isCorrection ? '⚙️ *설정 보정 요청을 확인했습니다.*' : '⚙️ *실행 계획을 확인했습니다.*';
    const lines = [title, ''];

    if (plan?.goal) {
        lines.push(`목표: *${escapeMarkdown(plan.goal)}*`);
    }
    if (Array.isArray(plan?.steps) && plan.steps.length > 0) {
        lines.push(`단계 수: ${plan.steps.length}`);
    }
    if (plan?.goal || (Array.isArray(plan?.steps) && plan.steps.length > 0)) {
        lines.push('');
    }

    if (confirmation?.supersededConfirmationId) {
        lines.push('기존 확인 대기 중 요청 1건을 대체합니다.');
        lines.push('');
    }

    previews.forEach((item, index) => {
        const preview = item.preview || {};
        lines.push(`${index + 1}. *${escapeMarkdown(preview.summary || item.capability_id || '변경 요청')}*`);
        const structuredLines = formatStructuredPreviewLines(preview);
        if (structuredLines.length > 0) {
            structuredLines.forEach((line) => lines.push(`   ${line}`));
        } else if (preview.before && Object.keys(preview.before).length > 0) {
            lines.push(`   • 현재: \`${escapeMarkdown(JSON.stringify(preview.before))}\``);
        }
        if (!structuredLines.length && preview.after && Object.keys(preview.after).length > 0) {
            lines.push(`   • 변경: \`${escapeMarkdown(JSON.stringify(preview.after))}\``);
        }
        lines.push('');
    });

    const planSteps = Array.isArray(plan?.steps) ? plan.steps : [];
    const planPreconditions = planSteps.flatMap((step) => Array.isArray(step.preconditions) ? step.preconditions : []);
    if (planPreconditions.length > 0) {
        lines.push('사전 조건');
        planPreconditions.forEach((precondition, index) => {
            if (precondition.type === 'knowledge_provider_available') {
                lines.push(`- ${index + 1}. knowledge route \`${escapeMarkdown(precondition.route || '')}\` 에 provider가 연결되어 있어야 합니다.`);
                return;
            }
            if (precondition.type === 'trend_category_catalog_available') {
                lines.push(`- ${index + 1}. 트렌드 카테고리 기준 목록이 필요합니다.`);
                return;
            }
            lines.push(`- ${index + 1}. ${escapeMarkdown(JSON.stringify(precondition))}`);
        });
        lines.push('');
    }

    lines.push('진행할까요?');
    return lines.join('\n');
}

function formatContentRequestMessage(bundle = {}) {
    const explicitParams = Array.isArray(bundle?.meta?.explicit_params) ? bundle.meta.explicit_params : [];
    const registerPreview = bundle?.register_request?.preview || null;
    const registerPayload = bundle?.register_request?.payload || null;
    const publishPreview = bundle?.publish_request?.preview || null;
    const showPublishOptions = bundle?.ui?.show_publish_options === true;
    const lines = ['✨ *분석 완료!* 다음 조건으로 준비할까요?', ''];

    if (registerPreview) {
        const registerLines = formatStructuredPreviewLines(registerPreview).map((line) => {
            if (line.startsWith('🖼️')) {
                return `${line}${explicitParams.includes('image_gen') ? '' : ' 💡 _(기본 설정)_'}`;
            }
            if (line.startsWith('🔍')) {
                return `${line}${explicitParams.includes('external_reference') ? '' : ' 💡 _(기본 설정)_'}`;
            }
            return line;
        });
        lines.push(...registerLines);
    }

    if (showPublishOptions && publishPreview) {
        if (registerPreview) {
            lines.push('');
        }
        lines.push(...formatStructuredPreviewLines(publishPreview));
    } else if (!registerPreview && publishPreview) {
        lines.push(...formatStructuredPreviewLines(publishPreview));
    }

    if (registerPayload?.options?.schedule_date) {
        lines.push(`⏰ *예약 일시:* ${escapeMarkdown(registerPayload.options.schedule_date)}`);
    }
    if (registerPayload?.options?.instruction) {
        lines.push(`📝 *추가 지시:* ${escapeMarkdown(registerPayload.options.instruction)}`);
    }
    if (registerPayload?.options?.category) {
        lines.push(`📁 *카테고리:* ${escapeMarkdown(registerPayload.options.category)}`);
    }

    return lines.join('\n');
}

function buildContentRequestKeyboard(bundle = {}) {
    const registerPayload = bundle?.register_request?.payload || null;
    const publishPayload = bundle?.publish_request?.payload || null;
    const showPublishOptions = bundle?.ui?.show_publish_options === true;
    const keyboard = [];

    if (registerPayload) {
        const imgGenVal = registerPayload.options?.image_gen !== false;
        const extRefVal = registerPayload.options?.external_reference !== false;
        keyboard.push([
            { text: `🖼️ 이미지: ${imgGenVal ? '✅' : '❌'}`, callback_data: 'toggle_image' },
            { text: `🔍 외부참고: ${extRefVal ? '✅' : '❌'}`, callback_data: 'toggle_extref' }
        ]);
    }

    if (registerPayload && showPublishOptions && publishPayload) {
        const isDraft = publishPayload.options?.post_status === 'draft';
        const autoTrigger = publishPayload.auto_trigger !== false;
        keyboard.push([
            { text: `📌 ${isDraft ? '임시저장' : '최종발행'}`, callback_data: 'toggle_poststatus' },
            { text: `🚀 발행까지: ${autoTrigger ? '✅' : '❌'}`, callback_data: 'toggle_autotrigger' }
        ]);
    }

    const hasPublishExecution = !!publishPayload && showPublishOptions && publishPayload.auto_trigger !== false;
    const confirmLabel = hasPublishExecution
        ? '✅ 네, 이대로 진행해 주세요'
        : (registerPayload ? '✅ 네, 이대로 등록해 주세요' : '✅ 네, 진행해 주세요');
    keyboard.push([{ text: confirmLabel, callback_data: 'publish_confirm' }]);
    keyboard.push([{ text: '❌ 아뇨, 취소할게요', callback_data: 'publish_cancel' }]);

    return keyboard;
}

function formatExecutionMessage(results = []) {
    if (!Array.isArray(results) || results.length === 0) {
        return 'ℹ️ 처리할 결과가 없습니다.';
    }

    const first = results[0] || {};
    const actionType = String(first.action_type || '').trim();
    const actionDomain = String(first.action_domain || '').trim();
    let title = '✅ *요청을 처리했습니다.*';
    if (actionType === 'setting.query' || actionType === 'agent.query') {
        title = 'ℹ️ *확인했습니다.*';
    } else if (actionType === 'setting.update') {
        title = '✅ *변경했습니다.*';
    } else if (actionType === 'content.generate') {
        title = '💡 *이렇게 제안드립니다.*';
    } else if (actionType === 'job.run') {
        title = '🚀 *실행했습니다.*';
    }
    if (actionDomain === 'content.register_topic') {
        title = '📝 *등록했습니다.*';
    } else if (actionDomain === 'content.publish') {
        title = '🚀 *발행을 시작했습니다.*';
    }
    if (actionDomain === 'agent.meta') {
        title = 'ℹ️ *안내드립니다.*';
    }

    const lines = [title, ''];
    results.forEach((item, index) => {
        const result = item.result || {};
        lines.push(`${index + 1}. ${escapeMarkdown(result.message || item.capability_id || '완료')}`);
    });
    return lines.join('\n');
}

function formatSupersededConfirmationMessage() {
    return 'ℹ️ 이 확인 요청은 더 최신 설정 변경 요청으로 대체되었습니다.\n\n최신 요청 카드에서 계속 진행하세요.';
}

function buildRecommendationKeyboard(results = []) {
    const recommendationRows = [];
    results.forEach((item, index) => {
        const recommendations = Array.isArray(item?.result?.data?.recommendations) ? item.result.data.recommendations : [];
        recommendations.forEach((recommendation, recommendationIndex) => {
            const id = String(recommendation?.recommendation_id || '').trim();
            if (!id || recommendation?.feedback_enabled === false) return;
            const labelIndex = `${index + 1}.${recommendationIndex + 1}`;
            recommendationRows.push([
                { text: `👍 도움됨 ${labelIndex}`, callback_data: `rec_fb:h:${id}` },
                { text: `👎 별로 ${labelIndex}`, callback_data: `rec_fb:n:${id}` }
            ]);
        });
    });
    return recommendationRows;
}

function buildArtifactKeyboard(results = []) {
    const rows = [];
    results.forEach((item, index) => {
        const ideas = Array.isArray(item?.result?.data?.ideas) ? item.result.data.ideas : [];
        ideas.forEach((idea, ideaIndex) => {
            const id = String(idea?.id || '').trim();
            if (!id) return;
            const labelIndex = `${index + 1}.${ideaIndex + 1}`;
            rows.push([
                { text: `👍 도움됨 ${labelIndex}`, callback_data: `artifact_feedback:helpful:${id}` },
                { text: `👎 별로 ${labelIndex}`, callback_data: `artifact_feedback:not_helpful:${id}` }
            ]);
        });
    });
    return rows;
}

module.exports = {
    escapeMarkdown,
    formatStructuredPreviewLines,
    formatPreviewMessage,
    formatContentRequestMessage,
    formatExecutionMessage,
    formatSupersededConfirmationMessage,
    buildRecommendationKeyboard,
    buildArtifactKeyboard,
    buildContentRequestKeyboard
};
