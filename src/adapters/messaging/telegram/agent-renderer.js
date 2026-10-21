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

    if (kind === 'manuscript_generation') {
        const lines = [`📝 *저장:* BlogGenius 원고 작업공간`, `🎯 *주제:* ${escapeMarkdown(preview.subject || '')}`];
        if (preview.source_topic) lines.push(`🗂️ *글감:* #${Number(preview.source_topic.rowNumber)} ${escapeMarkdown(preview.source_topic.subject)} 설정 재사용`);
        if (Array.isArray(preview.keywords) && preview.keywords.length > 0) lines.push(`🔑 *키워드:* ${preview.keywords.map(escapeMarkdown).join(', ')}`);
        if (preview.image_mode) lines.push(`🖼️ *이미지:* ${preview.image_mode === 'generate' ? '생성' : preview.image_mode === 'none' ? '미포함' : '프롬프트만'}`);
        if (typeof preview.external_reference === 'boolean') lines.push(`🔍 *외부 참고:* ${preview.external_reference ? '사용' : '사용 안 함'}`);
        return lines;
    }

    if (kind === 'manuscript_workflow' || kind === 'manuscript_publication') {
        const target = preview.target === 'wordpress' ? '워드프레스' : '네이버 블로그';
        const status = preview.post_status === 'draft' ? '임시저장'
            : (preview.post_status === 'schedule' ? '예약발행' : '즉시 게시');
        const lines = [`📝 *대상:* ${target}`, `📌 *방식:* ${status}`];
        if (Array.isArray(preview.keywords) && preview.keywords.length > 0) lines.push(`🔑 *키워드:* ${preview.keywords.map(escapeMarkdown).join(', ')}`);
        if (preview.image_mode) lines.push(`🖼️ *이미지:* ${preview.image_mode === 'generate' ? '생성' : preview.image_mode === 'none' ? '미포함' : '프롬프트만'}`);
        if (typeof preview.external_reference === 'boolean') lines.push(`🔍 *외부 참고:* ${preview.external_reference ? '사용' : '사용 안 함'}`);
        if (preview.source_topic) lines.push(`🗂️ *글감:* #${Number(preview.source_topic.rowNumber)} ${escapeMarkdown(preview.source_topic.subject)} 설정 재사용`);
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

function formatExecutionMessage(results = []) {
    if (!Array.isArray(results) || results.length === 0) {
        return 'ℹ️ 처리할 결과가 없습니다.';
    }

    const first = results[0] || {};
    const hasFailure = results.some((item) => item?.result?.success === false);
    const actionType = String(first.action_type || '').trim();
    const actionDomain = String(first.action_domain || '').trim();
    let title = hasFailure ? '⚠️ *일부 작업이 완료되지 않았습니다.*' : '✅ *요청을 처리했습니다.*';
    if (actionType === 'setting.query' || actionType === 'agent.query') {
        title = 'ℹ️ *확인했습니다.*';
    } else if (actionType === 'setting.update') {
        title = '✅ *변경했습니다.*';
    } else if (actionType === 'content.generate') {
        title = '💡 *이렇게 제안드립니다.*';
    } else if (actionType === 'job.run') {
        title = '🚀 *실행했습니다.*';
    }
    if (actionDomain === 'content.register_topic' && first.result?.data?.persisted === true) {
        title = '📝 *등록했습니다.*';
    } else if (actionDomain === 'content.register_topic') {
        title = '💡 *이렇게 준비했습니다.*';
    } else if (actionDomain === 'content.publish' && !hasFailure) {
        title = '🚀 *발행을 시작했습니다.*';
    } else if (actionDomain === 'content.manuscript' && !hasFailure) {
        title = actionType === 'content.generate' ? '📝 *원고를 준비했습니다.*' : '🚀 *원고 발행을 처리했습니다.*';
    }
    if (actionDomain === 'agent.meta') {
        title = 'ℹ️ *안내드립니다.*';
    }

    const lines = [title, ''];
    results.forEach((item, index) => {
        const result = item.result || {};
        const message = escapeMarkdown(result.message || item.capability_id || '완료');
        if (String(item.capability_id || '').trim() === 'content.queue.list_topics') {
            lines.push(message);
        } else {
            lines.push(`${index + 1}. ${message}`);
        }
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
    formatExecutionMessage,
    formatSupersededConfirmationMessage,
    buildRecommendationKeyboard,
    buildArtifactKeyboard
};
