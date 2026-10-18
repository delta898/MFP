const DEFAULT_SETTINGS = Object.freeze({
    aiMode: 'default',
    fetchLimit: 3,
    maxChars: 60,
    headless: true
});

function createError(status, apiCode, message) {
    const error = new Error(message);
    error.status = status;
    error.apiCode = apiCode;
    return error;
}

function normalizeSettings(input = {}, config = {}) {
    const fetchLimit = Number.parseInt(input.fetchLimit ?? input.fetch_limit ?? config.NAVER_COMMENT_DRAFT_FETCH_LIMIT ?? DEFAULT_SETTINGS.fetchLimit, 10);
    const maxChars = Number.parseInt(input.maxChars ?? input.max_chars ?? config.NAVER_COMMENT_DRAFT_MAX_CHARS ?? DEFAULT_SETTINGS.maxChars, 10);
    return {
        aiMode: String(input.aiMode ?? input.ai_mode ?? config.NAVER_COMMENT_DRAFT_AI_MODE ?? DEFAULT_SETTINGS.aiMode).trim().toLowerCase() === 'custom' ? 'custom' : 'default',
        fetchLimit: Number.isFinite(fetchLimit) ? Math.min(10, Math.max(1, fetchLimit)) : DEFAULT_SETTINGS.fetchLimit,
        maxChars: Number.isFinite(maxChars) ? Math.min(200, Math.max(20, maxChars)) : DEFAULT_SETTINGS.maxChars,
        headless: typeof input.headless === 'boolean'
            ? input.headless
            : (input.headless === undefined ? (config.NAVER_COMMENT_DRAFT_HEADLESS ?? DEFAULT_SETTINGS.headless) : Boolean(input.headless))
    };
}

function createSmartCommentApplication(deps = {}) {
    const config = deps.config || {};
    const logger = deps.logger || console;
    const now = typeof deps.now === 'function' ? deps.now : () => new Date();
    let progress = {
        state: 'idle', phase: 'idle', message: '대기 중', completedCount: 0,
        totalCount: 0, batchIndex: 0, batchTotal: 0, retryAt: '', updatedAt: now().toISOString()
    };

    function updateProgress(patch = {}) {
        progress = { ...progress, ...patch, updatedAt: now().toISOString() };
        deps.onProgress?.({ ...progress });
        return progress;
    }

    function fail(error) {
        updateProgress({ state: 'failed', phase: 'failed', retryAt: '', message: `오류: ${error?.message || '스마트 댓글 실행에 실패했습니다.'}` });
        return error;
    }

    function progressSnapshot() {
        const snapshot = { ...progress };
        if (snapshot.phase === 'rate_limited' && snapshot.retryAt) {
            const remaining = Math.max(0, Math.ceil((Date.parse(snapshot.retryAt) - now().getTime()) / 1000));
            snapshot.retryRemainingSeconds = remaining;
            snapshot.message = `AI 요청 한도 대기 중 · 약 ${remaining}초 후 재시도`;
        }
        return snapshot;
    }

    async function run(input = {}) {
        if (progress.state === 'running') {
            throw createError(409, 'NAVER_COMMENT_DRAFT_BUSY', '다른 스마트 댓글 작업을 처리하고 있습니다. 현재 실행이 끝난 뒤 다시 시도해 주세요.');
        }
        const settings = normalizeSettings(input, config);
        updateProgress({ state: 'running', phase: 'session', message: '네이버 로그인 상태를 확인하고 있습니다.', completedCount: 0, totalCount: 0, batchIndex: 0, batchTotal: 0, retryAt: '' });
        if (settings.aiMode === 'custom' && !String(deps.getChatModelCode?.() ?? deps.chatModelCode ?? '').trim()) {
            throw fail(createError(400, 'INVALID_CHAT_MODEL', 'Chat Model을 사용하려면 AI 설정에서 사용할 모델을 선택해야 합니다.'));
        }
        if (typeof deps.checkSession !== 'function') {
            throw fail(createError(500, 'NAVER_SESSION_CHECK_UNAVAILABLE', '네이버 로그인 상태를 확인할 수 없습니다.'));
        }
        let session;
        try {
            session = await deps.checkSession({ forceRefresh: true });
        } catch (error) {
            throw fail(error);
        }
        if (!session?.ok) {
            const reason = String(session?.reason || '').trim().toLowerCase();
            const message = reason === 'missing_auth'
                ? '스마트 댓글을 사용하려면 설정에서 네이버 로그인을 먼저 진행해 주세요.'
                : (reason === 'expired' ? '네이버 로그인 세션이 만료되었습니다. 설정에서 다시 로그인해 주세요.' : '네이버 로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
            const error = createError(401, 'NAVER_SESSION_INVALID', message);
            error.reason = reason || 'check_failed';
            throw fail(error);
        }

        updateProgress({ phase: 'collecting', message: '이웃새글 후보를 수집하고 있습니다.' });
        let candidates;
        try {
            candidates = await deps.collectCandidates({
                fetchLimit: settings.fetchLimit,
                headless: settings.headless,
                excludePostUrls: Array.isArray(input.excludePostUrls) ? input.excludePostUrls : []
            });
        } catch (error) {
            throw fail(error);
        }
        if (!Array.isArray(candidates) || candidates.length === 0) {
            logger.info?.('ℹ️ [NaverCommentDraft] 조건에 맞는 이웃새글 후보가 없습니다.');
            updateProgress({ state: 'completed', phase: 'completed', message: '조건에 맞는 이웃새글 후보가 없습니다.' });
            return { items: [], settings, summary: { status: 'no_candidates', candidateCount: 0, successCount: 0, failureCount: 0 } };
        }

        logger.info?.(`📝 [NaverCommentDraft] 댓글 초안 생성 시작 (${candidates.length}건, AI: ${settings.aiMode === 'custom' ? 'Chat Model' : '글쓰기 모델'})`);
        const items = [];
        const batchSize = 3;
        const batchTotal = Math.ceil(candidates.length / batchSize);
        updateProgress({ phase: 'generating', message: `댓글 초안 생성 준비 중 · 0/${candidates.length}건`, totalCount: candidates.length, batchTotal });
        let stoppedByRateLimit = false;
        for (let offset = 0; offset < candidates.length; offset += batchSize) {
            const batchIndex = Math.floor(offset / batchSize) + 1;
            updateProgress({ phase: 'generating', retryAt: '', batchIndex, message: `댓글 초안 생성 중 · ${batchIndex}/${batchTotal} 배치 · ${offset}/${candidates.length}건 완료` });
            const batch = candidates.slice(offset, offset + batchSize).map((candidate, index) => ({ ...candidate, id: String(offset + index) }));
            try {
                const results = await deps.generateBatch({ aiMode: settings.aiMode, candidates: batch, maxChars: settings.maxChars });
                batch.forEach((candidate, index) => {
                    const { id: _id, ...item } = candidate;
                    const result = results[index] || {};
                    items.push({ ...item, drafts: Array.isArray(result.drafts) ? result.drafts : [], error: String(result.error || '') });
                });
            } catch (error) {
                const rateLimited = error?.code === 'AI_RATE_LIMITED' || Number(error?.status) === 429;
                const partial = Array.isArray(error?.partialResults) ? error.partialResults : [];
                batch.forEach((candidate, index) => {
                    const { id: _id, ...item } = candidate;
                    items.push({ ...item, drafts: Array.isArray(partial[index]?.drafts) ? partial[index].drafts : [], error: String(partial[index]?.error || error.message || '댓글 초안 생성 실패') });
                });
                if (rateLimited) {
                    candidates.slice(offset + batch.length).forEach((candidate) => items.push({ ...candidate, drafts: [], error: 'AI 요청 한도로 인해 실행을 중단했습니다.' }));
                    stoppedByRateLimit = true;
                }
            }
            const completedCount = stoppedByRateLimit ? items.filter((item) => item.drafts.length > 0).length : offset + batch.length;
            updateProgress({
                phase: stoppedByRateLimit ? 'rate_limit_stopped' : 'generating', retryAt: '', completedCount,
                message: stoppedByRateLimit ? `AI 요청 한도로 실행 중단 · ${completedCount}/${candidates.length}건 생성` : `댓글 초안 생성 중 · ${batchIndex}/${batchTotal} 배치 · ${completedCount}/${candidates.length}건 완료`
            });
            if (stoppedByRateLimit) break;
            if (completedCount < candidates.length) logger.debug?.(`📝 [NaverCommentDraft] 댓글 초안 생성 진행 ${completedCount}/${candidates.length}`);
        }
        const successCount = items.filter((item) => item.drafts.length > 0).length;
        const failureCount = items.length - successCount;
        const status = stoppedByRateLimit ? 'rate_limited' : (successCount === 0 ? 'draft_generation_failed' : (failureCount > 0 ? 'partial_success' : 'success'));
        (failureCount > 0 ? logger.warn : logger.info)?.call(logger, `${failureCount > 0 ? '⚠️' : '✅'} [NaverCommentDraft] 댓글 초안 생성 완료 (성공 ${successCount}건, 실패 ${failureCount}건)`);
        updateProgress({ state: 'completed', phase: 'completed', retryAt: '', message: stoppedByRateLimit ? `AI 요청 한도로 실행 중단 · ${successCount}/${candidates.length}건 생성` : (failureCount > 0 ? `일부 완료 · ${successCount}건 생성, ${failureCount}건 실패` : `완료 · ${successCount}건의 댓글 초안을 생성했습니다.`) });
        return { items, settings, summary: { status, candidateCount: candidates.length, successCount, failureCount } };
    }

    async function redraft(input = {}) {
        const settings = normalizeSettings(input, config);
        if (settings.aiMode === 'custom' && !String(deps.getChatModelCode?.() ?? deps.chatModelCode ?? '').trim()) throw createError(400, 'INVALID_CHAT_MODEL', 'Chat Model을 사용하려면 AI 설정에서 사용할 모델을 선택해야 합니다.');
        const title = String(input.title || '').trim();
        const excerpt = String(input.excerpt || '').trim();
        if (!title || !excerpt) throw createError(400, 'INVALID_REQUEST', '제목과 본문 일부가 필요합니다.');
        return { drafts: await deps.generateDraft({ aiMode: settings.aiMode, authorName: String(input.authorName || '').trim(), title, excerpt, maxChars: settings.maxChars }) };
    }

    function applySettings(settings = {}) {
        config.NAVER_COMMENT_DRAFT_AI_MODE = settings.aiMode;
        config.NAVER_COMMENT_DRAFT_FETCH_LIMIT = settings.fetchLimit;
        config.NAVER_COMMENT_DRAFT_MAX_CHARS = settings.maxChars;
        config.NAVER_COMMENT_DRAFT_HEADLESS = settings.headless;
        return normalizeSettings(settings, config);
    }

    return { normalizeSettings: (input) => normalizeSettings(input, config), applySettings, run, redraft, getProgress: progressSnapshot, updateProgress };
}

module.exports = { createSmartCommentApplication, normalizeSettings };
