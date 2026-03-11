function createTrendJobCapabilities(deps = {}) {
    const { axios, CONFIG } = deps;

    return [
        {
            id: 'jobs.trends.run_collect',
            type: 'job.run',
            domain: 'jobs.trends',
            confirmPolicy: 'required',
            validate(params = {}) {
                return {
                    ok: true,
                    errors: [],
                    normalizedParams: {
                        force: params.force === true
                    }
                };
            },
            async preview(params = {}) {
                return {
                    summary: '트렌드 수집 작업을 실행합니다.',
                    before: {},
                    after: {
                        force: params.force === true
                    }
                };
            },
            async execute(params = {}) {
                if (!axios || typeof axios.post !== 'function') {
                    throw new Error('axios dependency is required');
                }

                const port = CONFIG.UI_SERVER_PORT || 4577;
                try {
                    const response = await axios.post(`http://127.0.0.1:${port}/api/v1/auto/collect/trends/run`, {
                        force: params.force === true
                    });
                    const payload = response?.data?.data || {};
                    const trendsCollected = Number(payload?.trendsCollected || 0);
                    const trendsToTopics = Number(payload?.trendsToTopics || 0);

                    return {
                        success: true,
                        message: `트렌드 수집을 완료했습니다. 수집 ${trendsCollected}건, 토픽 추가 ${trendsToTopics}건입니다.`,
                        data: payload,
                        sideEffects: ['job_completed']
                    };
                } catch (error) {
                    const apiMessage = error?.response?.data?.error?.message
                        || error?.response?.data?.message
                        || error?.message
                        || '트렌드 수집 실행에 실패했습니다.';
                    throw new Error(apiMessage);
                }
            }
        }
    ];
}

module.exports = {
    createTrendJobCapabilities
};
