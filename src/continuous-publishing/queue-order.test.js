const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeReadyQueue,
    resolveReadyQueueMove,
    buildTopicRowMoveRequest
} = require('./queue-order');

const READY = '발행 준비 완료';

test('ready queue follows physical Spreadsheet row order', () => {
    const result = normalizeReadyQueue([
        { rowIndex: 8, rowNumber: 10, status: READY, subject: '셋째' },
        { rowIndex: 2, rowNumber: 4, status: '대기', subject: '보관' },
        { rowIndex: 5, rowNumber: 7, status: READY, subject: '둘째' },
        { rowIndex: 1, rowNumber: 3, status: READY, subject: '첫째' }
    ]);

    assert.deepEqual(result.map(item => item.subject), ['첫째', '둘째', '셋째']);
});

test('moving up places the source row before the previous ready row', () => {
    const move = resolveReadyQueueMove([
        { rowIndex: 1, rowNumber: 3, status: READY },
        { rowIndex: 5, rowNumber: 7, status: READY }
    ], 5, 'up');

    assert.equal(move.sourceStartIndex, 6);
    assert.equal(move.sourceEndIndex, 7);
    assert.equal(move.destinationIndex, 2);
    assert.equal(move.target.rowIndex, 1);
});

test('moving down places the source row after the next ready row using pre-removal coordinates', () => {
    const move = resolveReadyQueueMove([
        { rowIndex: 1, rowNumber: 3, status: READY },
        { rowIndex: 5, rowNumber: 7, status: READY }
    ], 1, 'down');

    assert.equal(move.sourceStartIndex, 2);
    assert.equal(move.sourceEndIndex, 3);
    assert.equal(move.destinationIndex, 7);
    assert.equal(move.target.rowIndex, 5);
});

test('queue movement rejects boundaries and rows that are no longer ready', () => {
    const items = [
        { rowIndex: 1, rowNumber: 3, status: READY },
        { rowIndex: 5, rowNumber: 7, status: READY },
        { rowIndex: 8, rowNumber: 10, status: '대기' }
    ];

    assert.throws(() => resolveReadyQueueMove(items, 1, 'up'), error => error.code === 'QUEUE_MOVE_BOUNDARY');
    assert.throws(() => resolveReadyQueueMove(items, 5, 'down'), error => error.code === 'QUEUE_MOVE_BOUNDARY');
    assert.throws(() => resolveReadyQueueMove(items, 8, 'up'), error => error.code === 'QUEUE_READY_TOPIC_NOT_FOUND');
});

test('move request moves one complete Spreadsheet row', () => {
    assert.deepEqual(buildTopicRowMoveRequest(91, {
        sourceStartIndex: 6,
        sourceEndIndex: 7,
        destinationIndex: 2
    }), {
        moveDimension: {
            source: {
                sheetId: 91,
                dimension: 'ROWS',
                startIndex: 6,
                endIndex: 7
            },
            destinationIndex: 2
        }
    });
});
