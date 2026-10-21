function createAgentMetaCapabilities(deps = {}) {
    const agentHelp = typeof deps.listAgentCapabilities === 'function'
        ? deps.listAgentCapabilities
        : () => [];

    return [
        {
            id: 'agent.meta.get_current_time',
            effect: 'read_only',
            type: 'agent.query',
            domain: 'agent.meta',
            name: 'get_current_time',
            confirmPolicy: 'never',
            agentExposure: {
                category: '기본 안내',
                title: '현재 시각 확인',
                description: '현재 날짜와 시각을 확인합니다.',
                useWhen: '사용자가 현재 시각이나 오늘 날짜를 묻습니다.',
                avoidWhen: '사용자가 알람, 일정, 타이머를 설정하거나 미래 시각을 계산해 달라고 합니다.',
                inputSchema: { type: 'object', properties: {}, additionalProperties: false },
                outputDescription: '시간대가 명시된 현재 날짜와 시각을 반환합니다.',
                examples: ['지금 몇 시야?']
            },
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
                const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
                const formatted = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
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
            effect: 'read_only',
            type: 'agent.query',
            domain: 'agent.meta',
            name: 'get_help',
            confirmPolicy: 'never',
            agentExposure: {
                discoverable: false,
                category: '기본 안내',
                title: '현재 기능 목록 안내',
                description: '현재 Agent에 등록된 기능을 조회하고 설명합니다.',
                useWhen: '사용자가 가능한 기능, 사용 방법 또는 지원 범위를 묻습니다.',
                avoidWhen: '사용자가 기능 안내가 아니라 실제 작업 실행을 요청합니다.',
                inputSchema: { type: 'object', properties: {}, additionalProperties: false },
                outputDescription: '현재 사용할 수 있도록 등록된 기능과 요청 예시를 반환합니다.',
                examples: ['사용 가능한 기능 알려줘']
            },
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
            async execute(_params = {}, context = {}) {
                const capabilities = await agentHelp(context);
                const groups = new Map();
                for (const capability of capabilities) {
                    const exposure = capability?.agentExposure;
                    if (!exposure || typeof exposure !== 'object') continue;
                    const category = String(exposure.category || '기타').trim();
                    if (!groups.has(category)) groups.set(category, []);
                    const examples = Array.isArray(exposure.examples)
                        ? exposure.examples.map((item) => String(item || '').trim()).filter(Boolean)
                        : [];
                    const exampleText = examples.length > 0 ? `\n  예: ${examples.map((item) => `“${item}”`).join(', ')}` : '';
                    const confirmationText = capability.confirmPolicy === 'required'
                        ? '\n  실행 전에 사용자 확인이 필요합니다.'
                        : '';
                    const availabilityText = String(exposure.availabilityNote || '').trim()
                        ? `\n  이용 조건: ${String(exposure.availabilityNote).trim()}`
                        : '';
                    groups.get(category).push(`• ${String(exposure.title || capability.id).trim()} — ${String(exposure.description || '').trim()}${exampleText}${availabilityText}${confirmationText}`);
                }
                const sections = [...groups.entries()].map(([category, items]) => `【${category}】\n${items.join('\n')}`);
                const message = sections.length > 0
                    ? [
                        'Telegram에서 요청할 수 있도록 등록된 기능입니다. 필요한 일을 자연스럽게 말씀해 주세요.',
                        ...sections,
                        '이 목록은 Telegram Agent에 등록된 요청 경로입니다. 화면 메뉴 전체나 Plugin Host에 설치된 기능을 모두 뜻하지는 않습니다. 외부 연결이나 데이터가 필요한 기능은 실행 시 준비 상태와 결과에 따라 이용이 제한될 수 있습니다.'
                    ].join('\n\n')
                    : '현재 Telegram에 연결된 기능 목록을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.';
                return {
                    success: true,
                    message,
                    data: { capabilities: [...groups.values()].flat().length },
                    sideEffects: []
                };
            }
        },
        {
            id: 'agent.meta.get_identity',
            effect: 'read_only',
            type: 'agent.query',
            domain: 'agent.meta',
            name: 'get_identity',
            confirmPolicy: 'never',
            agentExposure: {
                category: '기본 안내',
                title: '역할과 사용법 안내',
                description: 'BlogGenius와 Telegram에서 할 수 있는 일을 안내합니다.',
                useWhen: '사용자가 봇의 정체, 역할 또는 전반적인 사용법을 묻습니다.',
                avoidWhen: '사용자가 특정 기능을 실행하거나 구체적인 기능 목록을 요청합니다.',
                inputSchema: { type: 'object', properties: {}, additionalProperties: false },
                outputDescription: 'Agent 역할과 도움말 경로를 반환합니다.',
                examples: ['너는 무엇을 할 수 있니?']
            },
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
                    message: '저는 BlogGenius의 Telegram 대화 도우미입니다. 현재 Telegram에서 사용할 수 있도록 등록된 기능과 요청 예시는 /help에서 확인할 수 있습니다. 외부 연결이 필요한 기능은 실행할 때 연결 상태에 따라 결과가 달라질 수 있습니다.',
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
