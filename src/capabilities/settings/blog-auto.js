const { validateBoolean, validateTimeWindow } = require('../validators');

function createBlogAutoCapabilities(deps = {}) {
    const { configState } = deps;

    return [
        {
            id: 'settings.blog_auto.get_enabled',
            type: 'setting.query',
            domain: 'settings.blog_auto',
            confirmPolicy: 'never',
            validate() {
                return { ok: true, errors: [], normalizedParams: {} };
            },
            async preview() {
                const config = configState.loadStructuredConfig();
                return {
                    summary: '블로그 자동 포스팅 활성화 여부를 조회합니다.',
                    before: { enabled: Boolean(config.automation.publish.blog.enabled) },
                    after: {}
                };
            },
            async execute() {
                const config = configState.loadStructuredConfig();
                const enabled = Boolean(config.automation.publish.blog.enabled);
                return {
                    success: true,
                    message: `현재 블로그 자동 포스팅은 ${enabled ? '활성화' : '비활성화'} 상태입니다.`,
                    data: { enabled },
                    sideEffects: []
                };
            }
        },
        {
            id: 'settings.blog_auto.set_enabled',
            type: 'setting.update',
            domain: 'settings.blog_auto',
            confirmPolicy: 'required',
            validate(params = {}) {
                const validated = validateBoolean(params.enabled, 'enabled');
                return {
                    ok: validated.ok,
                    errors: validated.ok ? [] : [validated.error],
                    normalizedParams: { enabled: validated.value }
                };
            },
            async preview(params = {}) {
                const config = configState.loadStructuredConfig();
                return {
                    summary: '블로그 자동 포스팅 활성화 상태를 변경합니다.',
                    before: { enabled: Boolean(config.automation.publish.blog.enabled) },
                    after: { enabled: Boolean(params.enabled) }
                };
            },
            async execute(params = {}) {
                const config = configState.loadStructuredConfig();
                const enabled = Boolean(params.enabled);
                config.automation.publish.blog.enabled = enabled;
                configState.persistAndSync(config, {
                    PUBLISH_AUTO_ENABLED: enabled,
                    automation: config.automation
                }, { syncAuto: true });
                return {
                    success: true,
                    message: `블로그 자동 포스팅을 ${enabled ? '활성화' : '비활성화'}했습니다.`,
                    data: { enabled },
                    sideEffects: ['config_saved', 'runner_synced']
                };
            }
        },
        {
            id: 'settings.blog_auto.get_time_window',
            type: 'setting.query',
            domain: 'settings.blog_auto',
            confirmPolicy: 'never',
            validate() {
                return { ok: true, errors: [], normalizedParams: {} };
            },
            async preview() {
                const config = configState.loadStructuredConfig();
                return {
                    summary: '블로그 자동 포스팅 허용 시간대를 조회합니다.',
                    before: {
                        start_time: String(config.automation.publish.blog.start_time || '00:00'),
                        end_time: String(config.automation.publish.blog.end_time || '23:59')
                    },
                    after: {}
                };
            },
            async execute() {
                const config = configState.loadStructuredConfig();
                const startTime = String(config.automation.publish.blog.start_time || '00:00').trim();
                const endTime = String(config.automation.publish.blog.end_time || '23:59').trim();
                return {
                    success: true,
                    message: `현재 블로그 자동 포스팅 허용 시간대는 ${startTime} ~ ${endTime} 입니다.`,
                    data: { startTime, endTime },
                    sideEffects: []
                };
            }
        },
        {
            id: 'settings.blog_auto.set_time_window',
            type: 'setting.update',
            domain: 'settings.blog_auto',
            confirmPolicy: 'required',
            validate(params = {}) {
                const validated = validateTimeWindow(params.start_time || params.startTime, params.end_time || params.endTime);
                return {
                    ok: validated.ok,
                    errors: validated.errors,
                    normalizedParams: validated.value
                };
            },
            async preview(params = {}) {
                const config = configState.loadStructuredConfig();
                return {
                    summary: '블로그 자동 포스팅 허용 시간대를 변경합니다.',
                    before: {
                        start_time: String(config.automation.publish.blog.start_time || '00:00'),
                        end_time: String(config.automation.publish.blog.end_time || '23:59')
                    },
                    after: {
                        start_time: params.startTime,
                        end_time: params.endTime
                    }
                };
            },
            async execute(params = {}) {
                const config = configState.loadStructuredConfig();
                config.automation.publish.blog.start_time = params.startTime;
                config.automation.publish.blog.end_time = params.endTime;
                configState.persistAndSync(config, {
                    PUBLISH_AUTO_START_TIME: params.startTime,
                    PUBLISH_AUTO_END_TIME: params.endTime,
                    automation: config.automation
                }, { syncAuto: true });
                return {
                    success: true,
                    message: `블로그 자동 포스팅 허용 시간대를 ${params.startTime} ~ ${params.endTime}로 변경했습니다.`,
                    data: { startTime: params.startTime, endTime: params.endTime },
                    sideEffects: ['config_saved', 'runner_synced']
                };
            }
        }
    ];
}

module.exports = {
    createBlogAutoCapabilities
};
