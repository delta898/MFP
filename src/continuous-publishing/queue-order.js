const { TOPIC_STATUS } = require('./contract');

const QUEUE_MOVE_DIRECTIONS = Object.freeze({
    UP: 'up',
    DOWN: 'down'
});

function normalizeReadyQueue(items = []) {
    return (Array.isArray(items) ? items : [])
        .filter(item => String(item?.status || '').trim() === TOPIC_STATUS.READY)
        .filter(item => Number.isInteger(Number(item?.rowIndex)))
        .slice()
        .sort((left, right) => Number(left.rowNumber || Number(left.rowIndex) + 2)
            - Number(right.rowNumber || Number(right.rowIndex) + 2));
}

function resolveReadyQueueMove(items = [], rowIndexValue, directionValue) {
    const rowIndex = Number.parseInt(String(rowIndexValue), 10);
    const direction = String(directionValue || '').trim().toLowerCase();
    if (!Number.isInteger(rowIndex) || rowIndex < 0) {
        const error = new Error('이동할 대기열 항목을 확인해 주세요.');
        error.code = 'QUEUE_ROW_INVALID';
        throw error;
    }
    if (![QUEUE_MOVE_DIRECTIONS.UP, QUEUE_MOVE_DIRECTIONS.DOWN].includes(direction)) {
        const error = new Error('대기열 이동 방향을 확인해 주세요.');
        error.code = 'QUEUE_MOVE_DIRECTION_INVALID';
        throw error;
    }

    const readyItems = normalizeReadyQueue(items);
    const sourcePosition = readyItems.findIndex(item => Number(item.rowIndex) === rowIndex);
    if (sourcePosition < 0) {
        const error = new Error('발행 준비된 글감을 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.');
        error.code = 'QUEUE_READY_TOPIC_NOT_FOUND';
        throw error;
    }

    const targetPosition = direction === QUEUE_MOVE_DIRECTIONS.UP
        ? sourcePosition - 1
        : sourcePosition + 1;
    if (targetPosition < 0 || targetPosition >= readyItems.length) {
        const error = new Error(direction === QUEUE_MOVE_DIRECTIONS.UP
            ? '이미 대기열의 첫 번째 글감입니다.'
            : '이미 대기열의 마지막 글감입니다.');
        error.code = 'QUEUE_MOVE_BOUNDARY';
        throw error;
    }

    const source = readyItems[sourcePosition];
    const target = readyItems[targetPosition];
    const sourceGridIndex = Number(source.rowIndex) + 1;
    const targetGridIndex = Number(target.rowIndex) + 1;
    return {
        direction,
        source,
        target,
        sourceStartIndex: sourceGridIndex,
        sourceEndIndex: sourceGridIndex + 1,
        destinationIndex: direction === QUEUE_MOVE_DIRECTIONS.UP
            ? targetGridIndex
            : targetGridIndex + 1
    };
}

function buildTopicRowMoveRequest(sheetId, move = {}) {
    const normalizedSheetId = Number(sheetId);
    if (!Number.isInteger(normalizedSheetId)) {
        throw new Error('Topics Sheet ID를 확인하지 못했습니다.');
    }
    return {
        moveDimension: {
            source: {
                sheetId: normalizedSheetId,
                dimension: 'ROWS',
                startIndex: move.sourceStartIndex,
                endIndex: move.sourceEndIndex
            },
            destinationIndex: move.destinationIndex
        }
    };
}

module.exports = {
    QUEUE_MOVE_DIRECTIONS,
    normalizeReadyQueue,
    resolveReadyQueueMove,
    buildTopicRowMoveRequest
};
