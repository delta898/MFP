function createAgentPendingCapabilities() {
    return [
        {
            id: 'agent.pending.get',
            effect: 'read_only',
            type: 'agent.query',
            domain: 'agent.pending',
            confirmPolicy: 'never',
            agentExposure: {
                category: '확인 요청',
                title: '확인 대기 요청 조회',
                description: '적용 여부를 기다리는 요청을 확인합니다.',
                useWhen: '사용자가 아직 승인하거나 거절하지 않은 요청을 확인합니다.',
                avoidWhen: '사용자가 새 요청을 만들거나 이미 확정된 결과를 묻습니다.',
                inputSchema: { type: 'object', properties: {}, additionalProperties: false },
                outputDescription: '대기 중인 확인 요청의 요약 목록을 반환합니다.',
                examples: ['확인 대기 중인 요청 보여줘']
            },
            validate() {
                return { ok: true, errors: [], normalizedParams: {} };
            },
            async preview(_params = {}, context = {}) {
                const pending = Array.isArray(context?.memory?.pending_confirmations)
                    ? context.memory.pending_confirmations
                    : [];
                return {
                    summary: '현재 확인 대기 중인 요청을 조회합니다.',
                    before: {
                        pending_count: pending.length
                    },
                    after: {}
                };
            },
            async execute(_params = {}, context = {}) {
                const pending = Array.isArray(context?.memory?.pending_confirmations)
                    ? context.memory.pending_confirmations
                    : [];

                if (pending.length === 0) {
                    return {
                        success: true,
                        message: '현재 확인 대기 중인 설정 변경 요청은 없습니다.',
                        data: { pending: [] },
                        sideEffects: []
                    };
                }

                const summaries = pending.map((item, index) => {
                    const firstPreview = Array.isArray(item.previews) ? item.previews[0] : null;
                    const summary = firstPreview?.preview?.summary || '확인 대기 중 요청';
                    return `${index + 1}. ${summary}`;
                });

                return {
                    success: true,
                    message: `현재 확인 대기 중인 요청은 ${pending.length}건입니다.\n${summaries.join('\n')}`,
                    data: { pending },
                    sideEffects: []
                };
            }
        },
        {
            id: 'agent.pending.apply_latest',
            effect: 'local_change',
            type: 'agent.command',
            domain: 'agent.pending',
            name: 'apply_latest',
            confirmPolicy: 'never',
            agentExposure: {
                category: '확인 요청',
                title: '대기 요청 적용',
                description: '가장 최근 확인 대기 요청을 적용합니다.',
                useWhen: '사용자가 확인 대기 중인 가장 최근 요청을 명시적으로 적용하라고 합니다.',
                avoidWhen: '어떤 요청을 적용할지 모호하거나 사용자가 새 작업을 요청합니다.',
                inputSchema: { type: 'object', properties: {}, additionalProperties: false },
                outputDescription: '가장 최근 확인 요청의 적용 결과를 반환합니다.',
                examples: ['방금 확인한 요청 적용해']
            },
            validate() {
                return { ok: true, errors: [], normalizedParams: {} };
            },
            async preview(_params = {}, context = {}) {
                const pending = Array.isArray(context?.memory?.pending_confirmations)
                    ? context.memory.pending_confirmations
                    : [];
                return {
                    summary: '가장 최근 확인 대기 중인 요청을 적용합니다.',
                    before: {
                        pending_count: pending.length
                    },
                    after: {}
                };
            },
            async execute(_params = {}, _context = {}) {
                return {
                    success: true,
                    message: '가장 최근 확인 대기 중인 요청을 적용합니다.',
                    data: {},
                    sideEffects: []
                };
            }
        },
        {
            id: 'agent.pending.reject_latest',
            effect: 'local_change',
            type: 'agent.command',
            domain: 'agent.pending',
            name: 'reject_latest',
            confirmPolicy: 'never',
            agentExposure: {
                category: '확인 요청',
                title: '대기 요청 취소',
                description: '가장 최근 확인 대기 요청을 취소합니다.',
                useWhen: '사용자가 확인 대기 중인 가장 최근 요청을 명시적으로 취소하라고 합니다.',
                avoidWhen: '어떤 요청을 취소할지 모호하거나 사용자가 다른 작업을 취소하라고 합니다.',
                inputSchema: { type: 'object', properties: {}, additionalProperties: false },
                outputDescription: '가장 최근 확인 요청의 취소 결과를 반환합니다.',
                examples: ['대기 요청 취소해']
            },
            validate() {
                return { ok: true, errors: [], normalizedParams: {} };
            },
            async preview(_params = {}, context = {}) {
                const pending = Array.isArray(context?.memory?.pending_confirmations)
                    ? context.memory.pending_confirmations
                    : [];
                return {
                    summary: '가장 최근 확인 대기 중인 요청을 취소합니다.',
                    before: {
                        pending_count: pending.length
                    },
                    after: {}
                };
            },
            async execute(_params = {}, _context = {}) {
                return {
                    success: true,
                    message: '가장 최근 확인 대기 중인 요청을 취소합니다.',
                    data: {},
                    sideEffects: []
                };
            }
        }
    ];
}

module.exports = {
    createAgentPendingCapabilities
};
