function escapeMarkdown(text) {
    if (!text) return '';
    return String(text)
        .replace(/_/g, '\\_')
        .replace(/\*/g, '\\*')
        .replace(/\[/g, '\\[')
        .replace(/`/g, '\\`');
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
        if (preview.before && Object.keys(preview.before).length > 0) {
            lines.push(`   • 현재: \`${escapeMarkdown(JSON.stringify(preview.before))}\``);
        }
        if (preview.after && Object.keys(preview.after).length > 0) {
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

    const lines = ['✅ *요청을 처리했습니다.*', ''];
    results.forEach((item, index) => {
        const result = item.result || {};
        lines.push(`${index + 1}. ${escapeMarkdown(result.message || item.capability_id || '완료')}`);
    });
    return lines.join('\n');
}

function formatSupersededConfirmationMessage() {
    return 'ℹ️ 이 확인 요청은 더 최신 설정 변경 요청으로 대체되었습니다.\n\n최신 요청 카드에서 계속 진행하세요.';
}

function buildSuggestionKeyboard(results = []) {
    const suggestionRows = [];
    results.forEach((item, index) => {
        const suggestions = Array.isArray(item?.result?.data?.suggestions) ? item.result.data.suggestions : [];
        suggestions.forEach((suggestion, suggestionIndex) => {
            const id = String(suggestion?.id || '').trim();
            if (!id) return;
            const labelIndex = `${index + 1}.${suggestionIndex + 1}`;
            const type = String(suggestion?.type || '').trim();
            const isActionProposal = type === 'action_proposal' || type === 'next_action';
            const positiveLabel = isActionProposal ? `✅ 수락 ${labelIndex}` : `👍 도움됨 ${labelIndex}`;
            const negativeLabel = isActionProposal ? `❌ 거절 ${labelIndex}` : `👎 별로 ${labelIndex}`;
            const positiveValue = isActionProposal ? 'accepted' : 'helpful';
            const negativeValue = isActionProposal ? 'rejected' : 'not_helpful';
            suggestionRows.push([
                { text: positiveLabel, callback_data: `suggest_feedback:${positiveValue}:${id}` },
                { text: negativeLabel, callback_data: `suggest_feedback:${negativeValue}:${id}` }
            ]);
        });
    });
    return suggestionRows;
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

function formatCapabilityHelpMessage() {
    return [
        'ℹ️ *현재 Agent가 직접 처리할 수 있는 설정 작업*',
        '',
        '• 트렌드 수집 시간 조회/변경',
        '• 트렌드 카테고리 조회/추가/삭제',
        '• 블로그 자동 포스팅 활성화 조회/변경',
        '• 블로그 자동 포스팅 허용 시간대 조회/변경',
        '• Telegram 채팅 AI 모드 조회/변경',
        '• Custom AI 설정 요약 조회',
        '• 확인 대기 중인 설정 변경 요청 조회',
        '• 누적된 사용자 선호 요약 조회',
        '• 현재 기준 추천 조회',
        '• 새로운 글감 추천',
        '• 트렌드 수집 작업 실행',
        '',
        '*예시*',
        '• `현재 트렌드 수집 시간이 언제야?`',
        '• `트렌드 수집 시간을 07:00으로 바꿔줘`',
        '• `트렌드 카테고리 보여줘`',
        '• `자동 블로그 포스팅 시간대를 09:00~18:00으로 바꿔줘`',
        '• `현재 Telegram 채팅 AI 모드가 뭐야?`',
        '• `현재 Custom AI 설정 요약 보여줘`',
        '• `지금 바꾸려는 설정이 뭐였지?`',
        '• `내 성향 알려줘`',
        '• `지금 기준으로 추천할 것 있어?`',
        '• `새로운 글감 하나 추천해줄래?`',
        '• `지금 트렌드 수집 실행해줘`'
    ].join('\n');
}

module.exports = {
    escapeMarkdown,
    formatPreviewMessage,
    formatExecutionMessage,
    formatSupersededConfirmationMessage,
    formatCapabilityHelpMessage,
    buildSuggestionKeyboard,
    buildArtifactKeyboard
};
