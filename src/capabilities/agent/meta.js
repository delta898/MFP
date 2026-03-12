function createAgentMetaCapabilities() {
    return [
        {
            id: 'agent.meta.get_current_time',
            type: 'agent.query',
            domain: 'agent.meta',
            name: 'get_current_time',
            confirmPolicy: 'never',
            validate() {
                return { ok: true, errors: [], normalizedParams: {} };
            },
            async preview() {
                return {
                    summary: '현재 시각을 확인합니다.',
                    before: {},
                    after: {}
                };
            },
            async execute() {
                const now = new Date();
                const formatter = new Intl.DateTimeFormat('ko-KR', {
                    timeZone: 'Asia/Seoul',
                    hour12: false,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                const formatted = formatter.format(now).replace(/\.\s*/g, '-').replace(/-$/, '').trim();
                return {
                    success: true,
                    message: `현재 시각은 ${formatted}입니다.`,
                    data: { now: formatted },
                    sideEffects: []
                };
            }
        },
        {
            id: 'agent.meta.get_help',
            type: 'agent.query',
            domain: 'agent.meta',
            name: 'get_help',
            confirmPolicy: 'never',
            validate() {
                return { ok: true, errors: [], normalizedParams: {} };
            },
            async preview() {
                return {
                    summary: 'Agent 사용법을 안내합니다.',
                    before: {},
                    after: {}
                };
            },
            async execute() {
                return {
                    success: true,
                    message: [
                        '지금 바로 도와드릴 수 있는 작업입니다.',
                        '• 설정 조회/변경',
                        '• 확인 대기 요청 조회/적용/취소',
                        '• 현재 기준 추천 조회',
                        '• 글감 추천',
                        '• 트렌드 수집 실행',
                        '',
                        '예시',
                        '• 현재 트렌드 수집 시간이 언제야?',
                        '• 트렌드 수집 시간을 07:30으로 바꿔줘',
                        '• 그거 적용해',
                        '• 내 성향 알려줘',
                        '• 최신 트렌드 반영해서 글감 추천해줘'
                    ].join('\n'),
                    data: {},
                    sideEffects: []
                };
            }
        },
        {
            id: 'agent.meta.get_identity',
            type: 'agent.query',
            domain: 'agent.meta',
            name: 'get_identity',
            confirmPolicy: 'never',
            validate() {
                return { ok: true, errors: [], normalizedParams: {} };
            },
            async preview() {
                return {
                    summary: 'Agent 정체성과 역할을 설명합니다.',
                    before: {},
                    after: {}
                };
            },
            async execute() {
                return {
                    success: true,
                    message: '저는 BlogGenius를 도와드리는 운영 비서입니다. Telegram에서 설정 확인과 변경, 추천, 글감 제안, 작업 실행을 도와드립니다. 필요한 일을 편하게 말씀하시면 됩니다.',
                    data: {},
                    sideEffects: []
                };
            }
        }
    ];
}

module.exports = {
    createAgentMetaCapabilities
};
