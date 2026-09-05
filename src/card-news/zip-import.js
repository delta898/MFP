const path = require('node:path');
const { inflateRawSync, crc32 } = require('node:zlib');

const MAX_ARCHIVE_BYTES = 40 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 60 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 200;
const MAX_CARD_IMAGES = 10;

function createZipError(code, message) {
    const error = new Error(message);
    error.code = code;
    error.status = 400;
    return error;
}

function decodeZipData(input = {}) {
    let encoded = String(input.base64_data || '').trim();
    const dataUrl = encoded.match(/^data:[^;,]*;base64,(.+)$/i);
    if (dataUrl) encoded = dataUrl[1] || '';
    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.length < 22) throw createZipError('CARD_NEWS_ZIP_INVALID', '올바른 ZIP 파일을 선택해 주세요.');
    if (buffer.length > MAX_ARCHIVE_BYTES) throw createZipError('CARD_NEWS_ZIP_TOO_LARGE', 'ZIP 파일은 최대 40MB까지 가져올 수 있습니다.');
    return buffer;
}

function findEndOfCentralDirectory(buffer) {
    const minimum = Math.max(0, buffer.length - 0xffff - 22);
    for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
        if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
    }
    return -1;
}

function normalizeEntryName(value) {
    const name = String(value || '').replace(/\\/g, '/');
    if (!name || name.startsWith('/') || name.split('/').some((part) => part === '..')) {
        throw createZipError('CARD_NEWS_ZIP_PATH_INVALID', 'ZIP 안에 안전하지 않은 파일 경로가 있습니다.');
    }
    return name;
}

function detectImage(buffer, fileName) {
    const extension = path.extname(fileName).toLowerCase();
    const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const webp = buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    if (png && extension === '.png') return { extension: '.png', mime_type: 'image/png' };
    if (jpeg && (extension === '.jpg' || extension === '.jpeg')) return { extension: '.jpg', mime_type: 'image/jpeg' };
    if (webp && extension === '.webp') return { extension: '.webp', mime_type: 'image/webp' };
    return null;
}

function extractEntryData(archive, entry, maxBytes = MAX_IMAGE_BYTES) {
    const offset = entry.localOffset;
    if (offset < 0 || offset + 30 > archive.length || archive.readUInt32LE(offset) !== 0x04034b50) {
        throw createZipError('CARD_NEWS_ZIP_INVALID', 'ZIP 파일 구조를 읽지 못했습니다.');
    }
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataStart < 0 || dataEnd > archive.length) throw createZipError('CARD_NEWS_ZIP_INVALID', 'ZIP 파일 구조를 읽지 못했습니다.');
    const compressed = archive.subarray(dataStart, dataEnd);
    let data;
    if (entry.method === 0) data = Buffer.from(compressed);
    else if (entry.method === 8) {
        try {
            data = inflateRawSync(compressed, { maxOutputLength: maxBytes + 1 });
        } catch (_error) {
            throw createZipError('CARD_NEWS_ZIP_EXTRACT_FAILED', `${entry.name} 파일의 압축을 풀지 못했습니다.`);
        }
    } else {
        throw createZipError('CARD_NEWS_ZIP_COMPRESSION_UNSUPPORTED', '지원하지 않는 ZIP 압축 방식이 포함되어 있습니다.');
    }
    if (data.length !== entry.uncompressedSize || data.length > maxBytes) {
        throw createZipError('CARD_NEWS_ZIP_ENTRY_TOO_LARGE', 'ZIP 안의 파일 크기가 허용 범위를 초과했습니다.');
    }
    if ((crc32(data) >>> 0) !== entry.checksum) throw createZipError('CARD_NEWS_ZIP_CHECKSUM_INVALID', `${entry.name} 파일이 손상되었습니다.`);
    return data;
}

function parseCardNewsZip(input = {}) {
    const archive = decodeZipData(input);
    const endOffset = findEndOfCentralDirectory(archive);
    if (endOffset < 0) throw createZipError('CARD_NEWS_ZIP_INVALID', '올바른 ZIP 파일을 선택해 주세요.');
    if (archive.readUInt16LE(endOffset + 4) !== 0 || archive.readUInt16LE(endOffset + 6) !== 0) {
        throw createZipError('CARD_NEWS_ZIP_MULTIDISK_UNSUPPORTED', '분할 ZIP 파일은 가져올 수 없습니다.');
    }
    const entryCount = archive.readUInt16LE(endOffset + 10);
    const centralOffset = archive.readUInt32LE(endOffset + 16);
    if (entryCount > MAX_ARCHIVE_ENTRIES || centralOffset >= archive.length) {
        throw createZipError('CARD_NEWS_ZIP_TOO_MANY_FILES', 'ZIP 안의 파일 수가 너무 많습니다.');
    }

    const entries = [];
    let cursor = centralOffset;
    for (let index = 0; index < entryCount; index += 1) {
        if (cursor + 46 > archive.length || archive.readUInt32LE(cursor) !== 0x02014b50) {
            throw createZipError('CARD_NEWS_ZIP_INVALID', 'ZIP 파일 목록을 읽지 못했습니다.');
        }
        const flags = archive.readUInt16LE(cursor + 8);
        if ((flags & 0x0001) !== 0) throw createZipError('CARD_NEWS_ZIP_ENCRYPTED', '암호화된 ZIP 파일은 가져올 수 없습니다.');
        const method = archive.readUInt16LE(cursor + 10);
        const checksum = archive.readUInt32LE(cursor + 16) >>> 0;
        const compressedSize = archive.readUInt32LE(cursor + 20);
        const uncompressedSize = archive.readUInt32LE(cursor + 24);
        const nameLength = archive.readUInt16LE(cursor + 28);
        const extraLength = archive.readUInt16LE(cursor + 30);
        const commentLength = archive.readUInt16LE(cursor + 32);
        const localOffset = archive.readUInt32LE(cursor + 42);
        const next = cursor + 46 + nameLength + extraLength + commentLength;
        if (next > archive.length || [compressedSize, uncompressedSize, localOffset].includes(0xffffffff)) {
            throw createZipError('CARD_NEWS_ZIP64_UNSUPPORTED', 'ZIP64 형식은 가져올 수 없습니다.');
        }
        const name = normalizeEntryName(archive.toString((flags & 0x0800) ? 'utf8' : 'latin1', cursor + 46, cursor + 46 + nameLength));
        entries.push({ name, flags, method, checksum, compressedSize, uncompressedSize, localOffset });
        cursor = next;
    }

    const manifestEntry = entries.find((entry) => {
        const normalized = entry.name.toLowerCase();
        return !normalized.startsWith('__macosx/') && (normalized === 'card-news.json' || normalized.endsWith('/card-news.json'));
    });
    let metadata = null;
    if (manifestEntry) {
        try {
            const raw = extractEntryData(archive, manifestEntry, 1024 * 1024).toString('utf8');
            const value = JSON.parse(raw);
            const source = value?.source && typeof value.source === 'object' ? value.source : {};
            const cards = Array.isArray(value?.cards) ? value.cards.slice(0, MAX_CARD_IMAGES) : [];
            metadata = {
                title: String(value?.title || '').trim().slice(0, 300),
                source_url: String(source.canonical_url || source.url || '').trim().slice(0, 4000),
                settings: value?.settings && typeof value.settings === 'object' ? value.settings : {},
                cards: cards.map((card) => ({
                    image_file: path.basename(String(card?.image_file || '')),
                    headline: String(card?.headline || '').trim().slice(0, 300),
                    body: String(card?.body || '').trim().slice(0, 2000),
                    image_prompt: String(card?.image_prompt || '').trim().slice(0, 12000)
                }))
            };
        } catch (_error) {
            throw createZipError('CARD_NEWS_ZIP_MANIFEST_INVALID', 'card-news.json 파일이 올바르지 않습니다. 일반 이미지 ZIP이라면 해당 파일을 제거한 뒤 다시 시도해 주세요.');
        }
    }

    const candidates = entries.filter((entry) => {
        const normalized = entry.name.toLowerCase();
        if (normalized.endsWith('/') || normalized.startsWith('__macosx/') || normalized.endsWith('/.ds_store') || normalized === '.ds_store') return false;
        return /\.(png|jpe?g|webp)$/i.test(entry.name);
    });
    if (!candidates.length) throw createZipError('CARD_NEWS_ZIP_IMAGES_REQUIRED', 'ZIP에서 PNG, JPG 또는 WebP 이미지를 찾지 못했습니다.');
    if (candidates.length > MAX_CARD_IMAGES) throw createZipError('CARD_NEWS_ZIP_TOO_MANY_IMAGES', '카드 이미지는 최대 10장까지 가져올 수 있습니다.');

    const collator = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' });
    candidates.sort((left, right) => collator.compare(path.basename(left.name), path.basename(right.name)) || collator.compare(left.name, right.name));
    let totalBytes = 0;
    const images = candidates.map((entry, index) => {
        const data = extractEntryData(archive, entry);
        totalBytes += data.length;
        if (totalBytes > MAX_TOTAL_IMAGE_BYTES) throw createZipError('CARD_NEWS_ZIP_CONTENT_TOO_LARGE', '가져올 이미지의 전체 크기가 너무 큽니다.');
        const detected = detectImage(data, entry.name);
        if (!detected) throw createZipError('CARD_NEWS_ZIP_IMAGE_INVALID', `${entry.name} 파일의 이미지 형식이 올바르지 않습니다.`);
        const originalName = path.basename(entry.name);
        const cardMetadata = metadata?.cards?.find((card) => card.image_file === originalName) || {};
        return { index: index + 1, original_name: originalName, data, ...cardMetadata, ...detected };
    });
    return { images, metadata, archive_size: archive.length, total_image_size: totalBytes };
}

function toZipPreview(parsed = {}) {
    return {
        card_count: parsed.images?.length || 0,
        total_image_size: parsed.total_image_size || 0,
        title: String(parsed.metadata?.title || ''),
        source_url: String(parsed.metadata?.source_url || ''),
        has_manifest: Boolean(parsed.metadata),
        images: (parsed.images || []).map((image) => ({
            index: image.index,
            file_name: image.original_name,
            mime_type: image.mime_type,
            data_url: `data:${image.mime_type};base64,${image.data.toString('base64')}`
        }))
    };
}

module.exports = {
    MAX_ARCHIVE_BYTES,
    MAX_CARD_IMAGES,
    decodeZipData,
    parseCardNewsZip,
    toZipPreview
};
