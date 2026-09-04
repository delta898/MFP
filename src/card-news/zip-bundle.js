const { crc32 } = require('node:zlib');

function toDosDateTime(value = new Date()) {
    const date = value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();
    const year = Math.max(1980, Math.min(2107, date.getFullYear()));
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { dosTime, dosDate };
}

function validateEntryName(value) {
    const name = String(value || '').replace(/\\/g, '/');
    if (!name || name.startsWith('/') || name.split('/').some((part) => !part || part === '.' || part === '..')) {
        throw new Error('ZIP 항목 이름이 올바르지 않습니다.');
    }
    return name;
}

function createStoredZip(entries = [], options = {}) {
    if (!Array.isArray(entries) || !entries.length) throw new Error('ZIP으로 묶을 파일이 없습니다.');
    if (entries.length > 0xffff) throw new Error('ZIP 항목 수가 너무 많습니다.');
    const { dosTime, dosDate } = toDosDateTime(options.date);
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBuffer = Buffer.from(validateEntryName(entry?.name), 'utf8');
        const data = Buffer.isBuffer(entry?.data) ? entry.data : Buffer.from(entry?.data || '');
        const checksum = crc32(data) >>> 0;
        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt16LE(0x0800, 6);
        localHeader.writeUInt16LE(0, 8);
        localHeader.writeUInt16LE(dosTime, 10);
        localHeader.writeUInt16LE(dosDate, 12);
        localHeader.writeUInt32LE(checksum, 14);
        localHeader.writeUInt32LE(data.length, 18);
        localHeader.writeUInt32LE(data.length, 22);
        localHeader.writeUInt16LE(nameBuffer.length, 26);
        localHeader.writeUInt16LE(0, 28);
        localParts.push(localHeader, nameBuffer, data);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt16LE(0x0800, 8);
        centralHeader.writeUInt16LE(0, 10);
        centralHeader.writeUInt16LE(dosTime, 12);
        centralHeader.writeUInt16LE(dosDate, 14);
        centralHeader.writeUInt32LE(checksum, 16);
        centralHeader.writeUInt32LE(data.length, 20);
        centralHeader.writeUInt32LE(data.length, 24);
        centralHeader.writeUInt16LE(nameBuffer.length, 28);
        centralHeader.writeUInt16LE(0, 30);
        centralHeader.writeUInt16LE(0, 32);
        centralHeader.writeUInt16LE(0, 34);
        centralHeader.writeUInt16LE(0, 36);
        centralHeader.writeUInt32LE(0, 38);
        centralHeader.writeUInt32LE(offset, 42);
        centralParts.push(centralHeader, nameBuffer);
        offset += localHeader.length + nameBuffer.length + data.length;
    }

    const centralDirectory = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);
    return Buffer.concat([...localParts, centralDirectory, end]);
}

module.exports = { createStoredZip, validateEntryName, toDosDateTime };
