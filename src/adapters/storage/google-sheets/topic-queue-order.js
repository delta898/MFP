'use strict';

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

module.exports = { buildTopicRowMoveRequest };
