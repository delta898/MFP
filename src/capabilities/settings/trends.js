const {
    parseCategoryList,
    serializeCategoryList,
    validateTime,
    resolveAllowedTrendCategory,
    readTrendCategoryCatalog
} = require('../validators');

function createTrendsCapabilities(deps = {}) {
    const { configState, CONFIG, eventStore, resolveNaverAutoCategoryCatalog } = deps;

    return [
        {
            id: 'settings.trends.get_time',
            type: 'setting.query',
            domain: 'settings.trends',
            confirmPolicy: 'never',
            validate() {
                return { ok: true, errors: [], normalizedParams: {} };
            },
            async preview() {
                const config = configState.loadStructuredConfig();
                return {
                    summary: '현재 트렌드 수집 시간을 조회합니다.',
                    before: { time: String(config.automation.collect.blog.trends.time || '07:30') },
                    after: {}
                };
            },
            async execute() {
                const config = configState.loadStructuredConfig();
                const time = String(config.automation.collect.blog.trends.time || '07:30').trim();
                return { success: true, message: `현재 트렌드 수집 시간은 ${time}입니다.`, data: { time }, sideEffects: [] };
            }
        },
        {
            id: 'settings.trends.set_time',
            type: 'setting.update',
            domain: 'settings.trends',
            confirmPolicy: 'required',
            async validate(params = {}) {
                const validated = validateTime(params.time, 'time');
                return {
                    ok: validated.ok,
                    errors: validated.ok ? [] : [validated.error],
                    normalizedParams: { time: validated.value }
                };
            },
            async preview(params = {}) {
                const config = configState.loadStructuredConfig();
                return {
                    summary: '트렌드 수집 시간을 변경합니다.',
                    before: { time: String(config.automation.collect.blog.trends.time || '07:30') },
                    after: { time: String(params.time || '').trim() }
                };
            },
            async execute(params = {}) {
                const config = configState.loadStructuredConfig();
                const time = String(params.time || '').trim();
                config.automation.collect.blog.trends.time = time;
                configState.persistAndSync(config, { COLLECT_TRENDS_TIME: time, automation: config.automation }, {});
                return { success: true, message: `트렌드 수집 시간을 ${time}로 변경했습니다.`, data: { time }, sideEffects: ['config_saved'] };
            }
        },
        {
            id: 'settings.trends.get_categories',
            type: 'setting.query',
            domain: 'settings.trends',
            confirmPolicy: 'never',
            validate() {
                return { ok: true, errors: [], normalizedParams: {} };
            },
            async preview() {
                const config = configState.loadStructuredConfig();
                const categories = parseCategoryList(config.automation.collect.blog.trends.categories);
                return {
                    summary: '현재 트렌드 수집 카테고리를 조회합니다.',
                    before: { categories },
                    after: {}
                };
            },
            async execute() {
                const config = configState.loadStructuredConfig();
                const categories = parseCategoryList(config.automation.collect.blog.trends.categories);
                const message = categories.length > 0
                    ? `현재 트렌드 수집 카테고리는 ${categories.join(', ')} 입니다.`
                    : '현재 트렌드 수집 카테고리는 비어 있습니다.';
                return { success: true, message, data: { categories }, sideEffects: [] };
            }
        },
        {
            id: 'settings.trends.add_category',
            type: 'setting.update',
            domain: 'settings.trends',
            confirmPolicy: 'required',
            async validate(params = {}) {
                const validated = await resolveAllowedTrendCategory(params.category, { CONFIG, configState, eventStore, resolveNaverAutoCategoryCatalog });
                if (validated.ok) {
                    const current = parseCategoryList(configState.loadStructuredConfig().automation.collect.blog.trends.categories);
                    if (current.includes(validated.value)) {
                        return {
                            ok: false,
                            errors: [`카테고리 '${validated.value}'는 이미 현재 설정에 있습니다.`],
                            normalizedParams: { category: validated.value }
                        };
                    }
                }
                return {
                    ok: validated.ok,
                    errors: validated.ok ? [] : [validated.error],
                    normalizedParams: { category: validated.value },
                    correctionProposal: validated.correctionProposal || null
                };
            },
            async preview(params = {}) {
                const config = configState.loadStructuredConfig();
                const current = parseCategoryList(config.automation.collect.blog.trends.categories);
                const next = serializeCategoryList([...current, params.category]);
                return {
                    summary: '트렌드 수집 카테고리를 추가합니다.',
                    before: { categories: current },
                    after: { categories: parseCategoryList(next) }
                };
            },
            async execute(params = {}) {
                const config = configState.loadStructuredConfig();
                const current = parseCategoryList(config.automation.collect.blog.trends.categories);
                const categories = serializeCategoryList([...current, params.category]);
                config.automation.collect.blog.trends.categories = categories;
                configState.persistAndSync(config, {
                    COLLECT_TRENDS_CATEGORIES: categories,
                    automation: config.automation
                }, {});
                return {
                    success: true,
                    message: `트렌드 수집 카테고리에 ${params.category}를 추가했습니다.`,
                    data: { categories: parseCategoryList(categories) },
                    sideEffects: ['config_saved']
                };
            }
        },
        {
            id: 'settings.trends.remove_category',
            type: 'setting.update',
            domain: 'settings.trends',
            confirmPolicy: 'required',
            async validate(params = {}) {
                const validated = await resolveAllowedTrendCategory(params.category, { CONFIG, configState, eventStore, resolveNaverAutoCategoryCatalog });
                if (!validated.ok) {
                    return {
                        ok: false,
                        errors: [validated.error],
                        normalizedParams: { category: '' },
                        correctionProposal: validated.correctionProposal || null
                    };
                }
                const current = parseCategoryList(configState.loadStructuredConfig().automation.collect.blog.trends.categories);
                if (!current.includes(validated.value)) {
                    return {
                        ok: false,
                        errors: [`카테고리 '${validated.value}'는 현재 설정에 없습니다.`],
                        normalizedParams: { category: validated.value }
                    };
                }
                return { ok: true, errors: [], normalizedParams: { category: validated.value } };
            },
            async preview(params = {}) {
                const config = configState.loadStructuredConfig();
                const current = parseCategoryList(config.automation.collect.blog.trends.categories);
                const next = current.filter((item) => item !== params.category);
                return {
                    summary: '트렌드 수집 카테고리를 제거합니다.',
                    before: { categories: current },
                    after: { categories: next }
                };
            },
            async execute(params = {}) {
                const config = configState.loadStructuredConfig();
                const current = parseCategoryList(config.automation.collect.blog.trends.categories);
                const categories = serializeCategoryList(current.filter((item) => item !== params.category));
                config.automation.collect.blog.trends.categories = categories;
                configState.persistAndSync(config, {
                    COLLECT_TRENDS_CATEGORIES: categories,
                    automation: config.automation
                }, {});
                return {
                    success: true,
                    message: `트렌드 수집 카테고리에서 ${params.category}를 제거했습니다.`,
                    data: { categories: parseCategoryList(categories) },
                    sideEffects: ['config_saved']
                };
            }
        }
    ];
}

module.exports = {
    createTrendsCapabilities,
    parseCategoryList,
    serializeCategoryList,
    readTrendCategoryCatalog
};
