const axios = require('axios');
const { KIE_BASE_URL } = require('../ai-model-catalog');
const { getModelRuntimeDefinition } = require('./model-runtime-policy');
const { pollAsyncJob } = require('./async-job-runner');

const KIE_MARKET_CREATE_TASK_ENDPOINT = `${KIE_BASE_URL}/api/v1/jobs/createTask`;
const KIE_MARKET_TASK_INFO_ENDPOINT = `${KIE_BASE_URL}/api/v1/jobs/recordInfo`;
const KIE_MARKET_SUBMIT_TIMEOUT_MS = 30000;
const KIE_MARKET_POLL_REQUEST_TIMEOUT_MS = 15000;
const KIE_MARKET_TOTAL_TIMEOUT_MS = 15 * 60 * 1000;
const KIE_MARKET_DOWNLOAD_TIMEOUT_MS = 120000;

function buildKieMarketHeaders(apiKey = '') {
    const normalized = String(apiKey || '').trim();
    return {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(normalized ? { Authorization: `Bearer ${normalized}` } : {})
    };
}

function buildNanoBanana2TaskRequest(modelConfig = {}, prompt = '', options = {}) {
    const definition = getModelRuntimeDefinition('image', modelConfig);
    if (definition.transport !== 'kie_market_image_jobs') {
        throw new Error(`Nano Banana 2에 사용할 수 없는 transport입니다: ${definition.transport || 'missing'}`);
    }
    if (String(modelConfig.code || '').trim() !== 'nano-banana-2') {
        throw new Error('지원하지 않는 KIE Market 이미지 request profile입니다.');
    }

    const aspectRatio = String(options.aspectRatio || '4:3').trim();
    const resolution = String(options.imageSize || '1K').trim().toUpperCase() === '2K'
        ? '2K'
        : '1K';
    return {
        definition,
        body: {
            model: 'nano-banana-2',
            input: {
                prompt: String(prompt || ''),
                image_input: [],
                aspect_ratio: aspectRatio,
                resolution,
                output_format: 'png'
            }
        }
    };
}

function extractKieMarketTaskId(data) {
    const taskId = String(data?.data?.taskId || data?.taskId || '').trim();
    if (!taskId) throw new Error('KIE Market 작업 생성 응답에 taskId가 없습니다.');
    return taskId;
}

function parseResultJson(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function normalizeKieMarketTask(data) {
    const payload = data?.data && typeof data.data === 'object' ? data.data : data;
    const state = String(payload?.state || payload?.status || '').trim().toLowerCase();
    const result = parseResultJson(payload?.resultJson || payload?.result_json);
    const resultUrls = [
        ...(Array.isArray(result?.resultUrls) ? result.resultUrls : []),
        ...(Array.isArray(payload?.resultUrls) ? payload.resultUrls : []),
        ...(Array.isArray(payload?.response?.resultUrls) ? payload.response.resultUrls : [])
    ].map((item) => String(item || '').trim()).filter(Boolean);

    return {
        taskId: String(payload?.taskId || '').trim(),
        state,
        progress: Number.isFinite(Number(payload?.progress)) ? Number(payload.progress) : null,
        resultUrls,
        creditsConsumed: Number.isFinite(Number(payload?.creditsConsumed))
            ? Number(payload.creditsConsumed)
            : null,
        errorCode: String(payload?.failCode || payload?.errorCode || '').trim(),
        errorMessage: String(payload?.failMsg || payload?.errorMessage || '').trim()
    };
}

function isRetryableKieMarketPollError(error) {
    const status = Number(error?.response?.status || 0);
    if (!status) return true;
    return status === 429 || status >= 500;
}

function assertSafeKieResultUrl(rawUrl) {
    const url = new URL(String(rawUrl || '').trim());
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') throw new Error('KIE 이미지 결과 URL은 HTTPS여야 합니다.');
    if (
        hostname === 'localhost'
        || hostname === '::1'
        || hostname === '127.0.0.1'
        || /^10\./.test(hostname)
        || /^192\.168\./.test(hostname)
        || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname)
    ) {
        throw new Error('KIE 이미지 결과 URL이 안전하지 않습니다.');
    }
    return url.toString();
}

function createKieMarketImageClient(options = {}) {
    const httpClient = options.httpClient || axios;
    const sleep = typeof options.sleep === 'function'
        ? options.sleep
        : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const now = typeof options.now === 'function' ? options.now : Date.now;
    const jobStore = options.jobStore || null;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    const submitTimeoutMs = Number(options.submitTimeoutMs) || KIE_MARKET_SUBMIT_TIMEOUT_MS;
    const pollRequestTimeoutMs = Number(options.pollRequestTimeoutMs) || KIE_MARKET_POLL_REQUEST_TIMEOUT_MS;
    const totalTimeoutMs = Number(options.totalTimeoutMs) || KIE_MARKET_TOTAL_TIMEOUT_MS;
    const downloadTimeoutMs = Number(options.downloadTimeoutMs) || KIE_MARKET_DOWNLOAD_TIMEOUT_MS;

    async function updateJournal(record) {
        if (!jobStore || typeof jobStore.upsert !== 'function') return;
        try {
            jobStore.upsert(record);
        } catch (error) {
            onProgress({
                taskId: record.taskId,
                state: 'journal_error',
                error: String(error?.message || error)
            });
        }
    }

    async function downloadResult(resultUrl) {
        const safeUrl = assertSafeKieResultUrl(resultUrl);
        let lastError = null;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
                const response = await httpClient.get(safeUrl, {
                    responseType: 'arraybuffer',
                    timeout: downloadTimeoutMs
                });
                return Buffer.from(response.data);
            } catch (error) {
                lastError = error;
                if (attempt < 3) await sleep(1000 * Math.pow(2, attempt - 1));
            }
        }
        throw new Error(`KIE 이미지 결과 다운로드에 실패했습니다: ${lastError?.message || 'unknown error'}`);
    }

    async function generate(params = {}) {
        const modelConfig = params.modelConfig || {};
        const apiKey = String(modelConfig.api_key || '').trim();
        if (!apiKey) throw new Error('KIE API Key 누락');
        const request = buildNanoBanana2TaskRequest(
            modelConfig,
            params.prompt,
            params.options
        );
        const headers = buildKieMarketHeaders(apiKey);

        const submitResponse = await httpClient.post(
            KIE_MARKET_CREATE_TASK_ENDPOINT,
            request.body,
            { headers, timeout: submitTimeoutMs }
        );
        const taskId = extractKieMarketTaskId(submitResponse?.data);
        const journalBase = {
            taskId,
            provider: 'kie',
            transport: request.definition.transport,
            modelId: String(modelConfig.code || '').trim()
        };
        await updateJournal({ ...journalBase, state: 'submitted' });
        onProgress({ taskId, state: 'submitted' });

        let completedTask;
        try {
            completedTask = await pollAsyncJob({
                taskId,
                sleep,
                now,
                totalTimeoutMs,
                isRetryablePollError: isRetryableKieMarketPollError,
                queryTask: async () => {
                    const response = await httpClient.get(KIE_MARKET_TASK_INFO_ENDPOINT, {
                        params: { taskId },
                        headers,
                        timeout: pollRequestTimeoutMs
                    });
                    const task = normalizeKieMarketTask(response?.data);
                    if (!task.state) {
                        const remoteCode = Number(response?.data?.code || 0);
                        const error = new Error(String(
                            response?.data?.msg
                            || 'KIE Market 작업 상태 응답을 확인하지 못했습니다.'
                        ));
                        error.response = {
                            status: remoteCode >= 400 ? remoteCode : 500
                        };
                        throw error;
                    }
                    return task;
                },
                normalizeTask: (task) => task,
                onUpdate: async (task) => {
                    const state = task.state === 'poll_retry'
                        ? String(jobStore?.get?.(taskId)?.state || 'submitted')
                        : task.state;
                    await updateJournal({
                        ...journalBase,
                        state,
                        error: task.state === 'poll_retry' ? task.error : ''
                    });
                    onProgress(task);
                }
            });
        } catch (error) {
            await updateJournal({
                ...journalBase,
                state: error?.state || (error?.code === 'AI_ASYNC_JOB_TIMEOUT' ? 'timed_out' : 'fail'),
                error: String(error?.message || error)
            });
            throw error;
        }

        const resultUrl = completedTask.resultUrls?.[0];
        if (!resultUrl) {
            const error = new Error('KIE 완료 작업에 이미지 결과 URL이 없습니다.');
            await updateJournal({ ...journalBase, state: 'fail', error: error.message });
            throw error;
        }
        const imageBuffer = await downloadResult(resultUrl);
        await updateJournal({ ...journalBase, state: 'downloaded', error: '' });
        return {
            taskId,
            imageBuffer,
            resultUrl,
            creditsConsumed: completedTask.creditsConsumed
        };
    }

    return {
        downloadResult,
        generate
    };
}

module.exports = {
    KIE_MARKET_CREATE_TASK_ENDPOINT,
    KIE_MARKET_DOWNLOAD_TIMEOUT_MS,
    KIE_MARKET_POLL_REQUEST_TIMEOUT_MS,
    KIE_MARKET_SUBMIT_TIMEOUT_MS,
    KIE_MARKET_TASK_INFO_ENDPOINT,
    KIE_MARKET_TOTAL_TIMEOUT_MS,
    assertSafeKieResultUrl,
    buildKieMarketHeaders,
    buildNanoBanana2TaskRequest,
    createKieMarketImageClient,
    extractKieMarketTaskId,
    isRetryableKieMarketPollError,
    normalizeKieMarketTask
};
