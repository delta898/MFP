function createAgentPendingCapabilities() {
    return [
        {
            id: 'agent.pending.get',
            type: 'agent.query',
            domain: 'agent.pending',
            confirmPolicy: 'never',
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
            type: 'agent.command',
            domain: 'agent.pending',
            name: 'apply_latest',
            confirmPolicy: 'never',
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
            type: 'agent.command',
            domain: 'agent.pending',
            name: 'reject_latest',
            confirmPolicy: 'never',
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
