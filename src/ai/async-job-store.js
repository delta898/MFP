const fs = require('fs');
const path = require('path');

const JOURNAL_SCHEMA_VERSION = 1;
const MAX_JOBS = 100;

function createEmptyJournal() {
    return {
        schema_version: JOURNAL_SCHEMA_VERSION,
        jobs: []
    };
}

function sanitizeJobRecord(record = {}) {
    const taskId = String(record.taskId || record.task_id || '').trim().slice(0, 256);
    if (!taskId) throw new Error('저장할 비동기 작업 ID가 없습니다.');
    return {
        task_id: taskId,
        provider: String(record.provider || '').trim().toLowerCase().slice(0, 64),
        transport: String(record.transport || '').trim().slice(0, 128),
        model_id: String(record.modelId || record.model_id || '').trim().slice(0, 256),
        state: String(record.state || 'submitted').trim().toLowerCase().slice(0, 64),
        created_at: String(record.createdAt || record.created_at || '').trim(),
        updated_at: String(record.updatedAt || record.updated_at || '').trim(),
        error: String(record.error || '').trim().slice(0, 500)
    };
}

function createAsyncJobStore(options = {}) {
    const fsImpl = options.fsImpl || fs;
    const pathImpl = options.pathImpl || path;
    const filePath = String(options.filePath || '').trim();
    const now = typeof options.now === 'function' ? options.now : () => new Date();

    if (!filePath) throw new Error('비동기 작업 journal 경로가 없습니다.');

    function readJournal() {
        try {
            if (!fsImpl.existsSync(filePath)) return createEmptyJournal();
            const parsed = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
            if (
                Number(parsed?.schema_version) !== JOURNAL_SCHEMA_VERSION
                || !Array.isArray(parsed?.jobs)
            ) {
                return createEmptyJournal();
            }
            return {
                schema_version: JOURNAL_SCHEMA_VERSION,
                jobs: parsed.jobs.map(sanitizeJobRecord).slice(0, MAX_JOBS)
            };
        } catch (_error) {
            return createEmptyJournal();
        }
    }

    function writeJournal(journal) {
        const directory = pathImpl.dirname(filePath);
        const tempPath = `${filePath}.tmp`;
        fsImpl.mkdirSync(directory, { recursive: true });
        fsImpl.writeFileSync(tempPath, `${JSON.stringify(journal, null, 2)}\n`, 'utf8');
        fsImpl.renameSync(tempPath, filePath);
    }

    function upsert(record = {}) {
        const timestamp = now().toISOString();
        const journal = readJournal();
        const taskId = String(record.taskId || record.task_id || '').trim();
        const previous = journal.jobs.find((item) => item.task_id === taskId);
        const merged = sanitizeJobRecord({
            taskId,
            provider: record.provider !== undefined ? record.provider : previous?.provider,
            transport: record.transport !== undefined ? record.transport : previous?.transport,
            modelId: record.modelId !== undefined
                ? record.modelId
                : (record.model_id !== undefined ? record.model_id : previous?.model_id),
            state: record.state !== undefined ? record.state : previous?.state,
            createdAt: previous?.created_at
                || record.createdAt
                || record.created_at
                || timestamp,
            updatedAt: timestamp,
            error: record.error !== undefined ? record.error : previous?.error
        });
        journal.jobs = [
            merged,
            ...journal.jobs.filter((item) => item.task_id !== merged.task_id)
        ].slice(0, MAX_JOBS);
        writeJournal(journal);
        return { ...merged };
    }

    function get(taskId) {
        const normalized = String(taskId || '').trim();
        const matched = readJournal().jobs.find((item) => item.task_id === normalized);
        return matched ? { ...matched } : null;
    }

    return {
        get,
        getFilePath: () => filePath,
        list: () => readJournal().jobs.map((item) => ({ ...item })),
        upsert
    };
}

module.exports = {
    JOURNAL_SCHEMA_VERSION,
    MAX_JOBS,
    createAsyncJobStore,
    sanitizeJobRecord
};
