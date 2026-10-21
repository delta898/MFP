const { TOPIC_STATUS } = require('../../../services/topics/contract');
const { buildTopicSheetRow } = require('./topic-capture');
const { diagnoseQueueReadiness } = require('./queue-readiness');
const { resolveReadyQueueMove } = require('./queue-order');

function appError(status, apiCode, message, details) {
    const error = new Error(message);
    error.status = status;
    error.apiCode = apiCode;
    if (details !== undefined) error.details = details;
    return error;
}

function createBlogQueueManagementApplication(deps = {}) {
    const topicStore = deps.topicStore || {};
    const isBusy = typeof deps.isBusy === 'function' ? deps.isBusy : () => false;
    const diagnoseTopic = typeof deps.diagnoseTopic === 'function'
        ? deps.diagnoseTopic
        : async (topic) => diagnoseQueueReadiness(topic, { now: typeof deps.now === 'function' ? deps.now() : Date.now() });
    const getReadyQueueForMove = typeof deps.getReadyQueue === 'function' ? deps.getReadyQueue : async () => ({ items: [] });

    function parseRowIndex(value) {
        const rowIndex = Number.parseInt(String(value), 10);
        if (!Number.isInteger(rowIndex) || rowIndex < 0) throw appError(400, 'QUEUE_ROW_INVALID', '대기열 항목을 확인해 주세요.');
        return rowIndex;
    }

    function requireIdle() {
        if (isBusy()) throw appError(409, 'CONTINUOUS_RUNNER_BUSY', '다른 글감을 처리하는 동안에는 발행 대기열을 변경하거나 추가 실행할 수 없습니다.');
    }

    async function requireTopicInStatus(rowIndex, expectedStatus) {
        const result = await topicStore.readByStatus(expectedStatus, { limit: 10000, offset: 0, sortBy: 'rowNumber', sortDir: 'asc' });
        const item = (Array.isArray(result?.items) ? result.items : []).find((candidate) => Number(candidate?.rowIndex) === rowIndex);
        if (!item) {
            const ready = expectedStatus === TOPIC_STATUS.READY;
            throw appError(409, ready ? 'QUEUE_ITEM_NOT_READY' : 'SAVED_TOPIC_NOT_WAITING', ready
                ? '이 글감은 더 이상 발행 대기 상태가 아닙니다. 대기열을 새로고침해 주세요.'
                : '이 글감은 더 이상 보관 상태가 아닙니다. 목록을 새로고침해 주세요.');
        }
        return item;
    }

    async function readyTopic(rowIndex) {
        const result = await topicStore.readByStatus(TOPIC_STATUS.READY, { limit: 10000, offset: 0, sortBy: 'rowNumber', sortDir: 'asc' });
        const item = (Array.isArray(result?.items) ? result.items : []).find((candidate) => Number(candidate?.rowIndex) === rowIndex);
        if (!item) throw appError(409, 'QUEUE_ITEM_NOT_READY', '이 글감은 더 이상 발행 대기 상태가 아닙니다. 대기열을 새로고침해 주세요.');
        return item;
    }

    async function updateTopic(input = {}) {
        const rowIndex = parseRowIndex(input.rowIndex);
        const sourceStatus = String(input.sourceStatus || TOPIC_STATUS.READY).trim();
        if (![TOPIC_STATUS.WAITING, TOPIC_STATUS.READY].includes(sourceStatus)) throw appError(400, 'TOPIC_SOURCE_STATUS_INVALID', '수정할 글감 상태를 확인해 주세요.');
        if (sourceStatus === TOPIC_STATUS.READY) requireIdle();
        const existing = await requireTopicInStatus(rowIndex, sourceStatus);
        const options = existing.options || {};
        const guide = existing.content_guide || {};
        const merged = {
            subject: existing.subject || '', title: existing.title || '', keywords: existing.keywords || [],
            instruction: guide.additional_instructions || '', referenceUrls: guide.reference_urls || [],
            platforms: options.platforms || [], siteTarget: options.site_target || null,
            naverCategory: options.naver_category || '', wordpressCategory: options.wordpress_category || '',
            writingStrategy: existing.writing_strategy || options.writing_strategy,
            writingOverrides: guide.writing_overrides || options.writing_overrides,
            imageMode: existing.image_mode || options.image_mode,
            externalReference: existing.external_reference !== false,
            postStatus: existing.postStatus || options.post_status || 'publish',
            scheduleDate: existing.scheduleDate || options.schedule_date || '',
            ...input
        };
        const ready = sourceStatus === TOPIC_STATUS.READY;
        let row;
        try { row = buildTopicSheetRow(merged, { ready, now: typeof deps.now === 'function' ? deps.now() : Date.now() }); }
        catch (error) { throw appError(400, error.code || 'TOPIC_UPDATE_INVALID', error.message); }
        if (ready) {
            const readiness = await diagnoseTopic(row);
            if (!readiness.ready) throw appError(400, readiness.issues[0]?.code || 'TOPIC_QUEUE_NOT_READY', readiness.issues.map((issue) => issue.message).filter(Boolean).join(' ') || '대기열에 추가할 수 없는 글감입니다.', readiness.issues);
        }
        await topicStore.updateEditableFields(rowIndex, {
            title: row.options.title || '', category: row.category, postStatus: row.postStatus,
            scheduleDate: row.scheduleDate, subject: row.subject, keywords: row.keywords,
            instruction: row.content_guide.additional_instructions, referenceUrl: row.content_guide.reference_urls,
            status: row.status, imageMode: row.image_options.mode, imageGeneration: row.image_options.generate,
            externalReference: row.use_external_ref, writingStrategy: row.writing_strategy,
            writingOverrides: row.content_guide.writing_overrides, platforms: row.targets,
            siteTarget: row.options.site_target || null
        });
        return { rowIndex, rowNumber: rowIndex + 2, status: row.status, subject: row.subject };
    }

    async function updateTopicDetails(input = {}) {
        const subject = String(input.subject || '').trim();
        const requestedRowNumber = Number(input.rowNumber);
        const hasRowNumber = Number.isInteger(requestedRowNumber) && requestedRowNumber >= 2;
        if (!subject && !hasRowNumber) throw appError(400, 'TOPIC_SUBJECT_REQUIRED', '수정할 글감의 주제나 목록 번호가 필요합니다.');
        const location = String(input.location || 'any').trim();
        if (!['any', 'queue', 'saved'].includes(location)) throw appError(400, 'TOPIC_LOCATION_INVALID', '글감의 현재 위치를 확인해 주세요.');
        const statuses = location === 'queue' ? [TOPIC_STATUS.READY]
            : location === 'saved' ? [TOPIC_STATUS.WAITING]
                : [TOPIC_STATUS.READY, TOPIC_STATUS.WAITING];
        const matches = [];
        for (const status of statuses) {
            const result = await topicStore.readByStatus(status, { limit: 10000, offset: 0, sortBy: 'rowNumber', sortDir: 'asc' });
            for (const item of Array.isArray(result?.items) ? result.items : []) {
                if (hasRowNumber && Number(item?.rowNumber) !== requestedRowNumber) continue;
                if (subject && String(item?.subject || '').trim().toLocaleLowerCase('ko-KR') !== subject.toLocaleLowerCase('ko-KR')) continue;
                matches.push({ item, status });
            }
        }
        if (matches.length === 0) throw appError(404, 'TOPIC_UPDATE_NOT_FOUND', '수정할 글감을 찾지 못했습니다. 현재 보관함이나 발행 대기열을 확인해 주세요.');
        if (matches.length > 1) throw appError(409, 'TOPIC_UPDATE_AMBIGUOUS', `“${subject}” 글감이 여러 건 있습니다. 목록 번호나 현재 위치를 지정해 주세요.`);
        const { item, status } = matches[0];
        return updateTopic({
            ...input,
            subject: input.newSubject === undefined ? item.subject : input.newSubject,
            rowIndex: item.rowIndex,
            sourceStatus: status
        });
    }

    async function captureTopic(input = {}, appendOptions = {}) {
        const action = String(input.action || '').trim();
        if (!['save', 'enqueue'].includes(action)) throw appError(400, 'TOPIC_CAPTURE_ACTION_INVALID', '글감 저장 방식을 확인해 주세요.');
        const ready = action === 'enqueue';
        let row;
        try { row = buildTopicSheetRow(input, { ready, now: typeof deps.now === 'function' ? deps.now() : Date.now() }); }
        catch (error) { throw appError(400, error.code || 'TOPIC_CAPTURE_INVALID', error.message, error.details); }
        const result = await topicStore.append([row], {
            ...appendOptions,
            defaultStatus: row.status,
            postAppendDelayMs: 0
        });
        if (!result?.success) throw appError(400, 'TOPIC_CAPTURE_FAILED', result?.message || '글감을 저장하지 못했습니다.');
        return {
            action, status: row.status,
            rowNumber: Array.isArray(result.rowNumbers) ? result.rowNumbers[0] ?? null : null,
            rowIndex: Array.isArray(result.rowIndices) ? result.rowIndices[0] ?? null : null
        };
    }

    async function deleteSavedTopic(input = {}) {
        const rowIndex = parseRowIndex(input.rowIndex);
        await requireTopicInStatus(rowIndex, TOPIC_STATUS.WAITING);
        const result = await topicStore.deleteRows([rowIndex]);
        if (!result?.success) throw appError(400, result?.code || 'SAVED_TOPIC_DELETE_FAILED', result?.message || '보관한 글감을 삭제하지 못했습니다.');
        return { rowIndex, rowNumber: rowIndex + 2, deleted: true };
    }

    async function removeReadyTopic(input = {}) {
        requireIdle();
        const rowIndex = parseRowIndex(input.rowIndex);
        await readyTopic(rowIndex);
        await topicStore.updateStatus(rowIndex, TOPIC_STATUS.WAITING, '연속 발행 대기열에서 제외');
        return { rowIndex, rowNumber: rowIndex + 2, status: TOPIC_STATUS.WAITING };
    }

    async function addSavedTopicToQueue(input = {}) {
        requireIdle();
        const rowIndex = parseRowIndex(input.rowIndex);
        const topic = await requireTopicInStatus(rowIndex, TOPIC_STATUS.WAITING);
        const readiness = await diagnoseTopic(topic);
        if (!readiness.ready) throw appError(409, readiness.issues[0]?.code || 'TOPIC_QUEUE_NOT_READY', readiness.issues.map((issue) => issue.message).filter(Boolean).join(' ') || '대기열에 추가할 수 없는 글감입니다.', readiness.issues);
        await topicStore.updateStatus(rowIndex, TOPIC_STATUS.READY, '연속 발행 대기열에 추가');
        return { rowIndex, rowNumber: rowIndex + 2, status: TOPIC_STATUS.READY };
    }

    async function moveTopic(input = {}) {
        const subject = String(input.subject || '').trim();
        const requestedRowNumber = Number(input.rowNumber);
        const source = String(input.source || '').trim();
        const destination = String(input.destination || '').trim();
        const hasRowNumber = Number.isInteger(requestedRowNumber) && requestedRowNumber >= 2;
        if (!subject && !hasRowNumber) throw appError(400, 'TOPIC_SUBJECT_REQUIRED', '옮길 글감의 주제를 확인해 주세요.');
        if (!['queue', 'saved'].includes(source) || !['queue', 'saved'].includes(destination) || source === destination) {
            throw appError(400, 'TOPIC_MOVE_DIRECTION_INVALID', '글감을 옮길 위치를 확인해 주세요.');
        }

        const sourceStatus = source === 'queue' ? TOPIC_STATUS.READY : TOPIC_STATUS.WAITING;
        const result = await topicStore.readByStatus(sourceStatus, { limit: 10000, offset: 0, sortBy: 'rowNumber', sortDir: 'asc' });
        const normalizedSubject = subject.toLocaleLowerCase('ko-KR');
        const matches = (Array.isArray(result?.items) ? result.items : []).filter((item) => {
            if (hasRowNumber && Number(item?.rowNumber) !== requestedRowNumber) return false;
            return !subject || String(item?.subject || '').trim().toLocaleLowerCase('ko-KR') === normalizedSubject;
        });
        if (matches.length === 0) {
            const selection = subject ? `“${subject}” 주제` : `${requestedRowNumber}번 행`;
            throw appError(404, 'TOPIC_MOVE_NOT_FOUND', `${selection}의 글감을 ${source === 'queue' ? '발행 대기열' : '글감 저장소'}에서 찾지 못했습니다.`);
        }
        if (matches.length > 1) {
            throw appError(409, 'TOPIC_MOVE_AMBIGUOUS', `“${subject}” 주제의 글감이 여러 건 있습니다. 구분할 수 있도록 키워드나 제목을 알려주세요.`);
        }

        const rowIndex = parseRowIndex(matches[0].rowIndex);
        if (destination === 'saved') await removeReadyTopic({ rowIndex });
        else await addSavedTopicToQueue({ rowIndex });
        return {
            subject: String(matches[0].subject || '').trim(),
            rowNumber: Number(matches[0].rowNumber) || rowIndex + 2,
            source,
            destination,
            rowIndex,
        };
    }

    async function reorderReadyTopic(input = {}) {
        requireIdle();
        const rowIndex = parseRowIndex(input.rowIndex);
        const topics = await topicStore.readAll({ limit: 100000, offset: 0, sortBy: 'rowNumber', sortDir: 'asc' });
        let move;
        try { move = resolveReadyQueueMove(topics?.items, rowIndex, input.direction); }
        catch (error) { throw appError(error.code === 'QUEUE_MOVE_BOUNDARY' ? 409 : 400, error.code || 'QUEUE_MOVE_INVALID', error.message); }
        if (typeof topicStore.moveRow !== 'function') throw appError(500, 'QUEUE_MOVE_UNAVAILABLE', '대기열 순서 변경 기능을 준비하지 못했습니다.');
        await topicStore.moveRow(move);
        const queue = await getReadyQueueForMove({ searchParams: new URLSearchParams('limit=50') });
        return {
            ...queue,
            moved: { direction: move.direction, subject: move.source.subject || '', previousRowIndex: Number(move.source.rowIndex), adjacentRowIndex: Number(move.target.rowIndex) }
        };
    }

    async function listTopics(query = {}) {
        if (typeof topicStore.list !== 'function') throw appError(500, 'TOPIC_STORE_UNAVAILABLE', '글감 저장소를 사용할 수 없습니다.');
        const { result, sortBy, sortDir } = await topicStore.list(query);
        if (typeof deps.hydrateTopicItems === 'function') return deps.hydrateTopicItems(result, sortBy, sortDir);
        return result;
    }

    async function getReadyQueue({ limit = 50 } = {}) {
        if (typeof topicStore.readAll !== 'function') throw appError(500, 'TOPIC_STORE_UNAVAILABLE', '글감 저장소를 사용할 수 없습니다.');
        if (typeof topicStore.prepareRead === 'function') await topicStore.prepareRead();
        const topics = await topicStore.readAll({ limit: 100000, offset: 0, sortBy: 'rowNumber', sortDir: 'asc' });
        const allItems = Array.isArray(topics?.items) ? topics.items : [];
        const readyItems = allItems.filter(item => String(item?.status || '').trim() === TOPIC_STATUS.READY);
        const savedItems = allItems.filter(item => String(item?.status || '').trim() === TOPIC_STATUS.WAITING);
        const activeRowIndex = typeof deps.getActiveRowIndex === 'function' ? deps.getActiveRowIndex() : null;
        const activeItem = activeRowIndex === null ? null : allItems.find(item => Number(item?.rowIndex) === activeRowIndex) || null;
        const scheduledQueue = typeof deps.addQueueSchedule === 'function' ? deps.addQueueSchedule(readyItems) : { items: readyItems, automation_schedule: null };
        const visibleItems = scheduledQueue.items.map(item => Number(item?.rowIndex) === activeRowIndex
            ? { ...item, processing_estimate_at: null, queue_runtime_state: 'running' }
            : item);
        if (activeItem && !visibleItems.some(item => Number(item?.rowIndex) === activeRowIndex)) {
            visibleItems.push({ ...activeItem, processing_estimate_at: null, queue_runtime_state: 'running' });
            visibleItems.sort((left, right) => Number(left?.rowNumber || 0) - Number(right?.rowNumber || 0));
        }
        const diagnose = async item => {
            const diagnosis = await diagnoseTopic(item);
            return { ...item, queue_readiness: { ready: diagnosis.ready, issues: diagnosis.issues } };
        };
        const runningCount = activeItem && !readyItems.some(item => Number(item?.rowIndex) === activeRowIndex) ? 1 : 0;
        return {
            items: await Promise.all(visibleItems.map(diagnose)),
            saved_items: await Promise.all(savedItems.slice(0, limit).map(diagnose)),
            total: readyItems.length + runningCount,
            limit,
            offset: 0,
            automation_schedule: scheduledQueue.automation_schedule,
            status_summary: { saved: savedItems.length, ready: readyItems.length, running: runningCount }
        };
    }

    return { captureTopic, updateTopic, updateTopicDetails, deleteSavedTopic, removeReadyTopic, addSavedTopicToQueue, moveTopic, reorderReadyTopic, listTopics, getReadyQueue };
}

module.exports = { createBlogQueueManagementApplication };
