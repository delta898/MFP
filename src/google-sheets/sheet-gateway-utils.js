function toA1Column(columnIndex) {
    let value = Number(columnIndex) + 1;
    if (!Number.isInteger(value) || value < 1) {
        throw new Error('Google Sheet column index가 올바르지 않습니다.');
    }
    let result = '';
    while (value > 0) {
        const remainder = (value - 1) % 26;
        result = String.fromCharCode(65 + remainder) + result;
        value = Math.floor((value - 1) / 26);
    }
    return result;
}

function parseUpdatedRowNumbers(updatedRange) {
    const right = String(updatedRange || '').split('!')[1] || '';
    const match = right.match(/[A-Z]+(\d+):[A-Z]+(\d+)/i) || right.match(/[A-Z]+(\d+)/i);
    if (!match) return [];
    const startRow = Number.parseInt(match[1], 10);
    const endRow = match[2] ? Number.parseInt(match[2], 10) : startRow;
    if (!Number.isInteger(startRow) || !Number.isInteger(endRow) || endRow < startRow) return [];
    return Array.from({ length: endRow - startRow + 1 }, (_, index) => startRow + index);
}

module.exports = { toA1Column, parseUpdatedRowNumbers };
