'use strict';

const fs = require('node:fs');
const path = require('node:path');

function createManuscriptImageFileReader(options = {}) {
    const fsImpl = options.fs || fs;
    const pathImpl = options.path || path;
    const logger = options.logger || console;

    return function findImageByPrefix(directoryPath, index) {
        if (!directoryPath || !fsImpl.existsSync(directoryPath)) return null;
        try {
            const prefix = String(index).padStart(2, '0');
            const priority = ['.avif', '.webp', '.png', '.jpg', '.jpeg'];
            const candidates = fsImpl.readdirSync(directoryPath)
                .filter((fileName) => fileName.startsWith(`${prefix}_`))
                .filter((fileName) => /\.(png|jpg|jpeg|webp|avif)$/i.test(fileName));
            candidates.sort((left, right) => {
                const leftPriority = priority.indexOf(pathImpl.extname(left).toLowerCase());
                const rightPriority = priority.indexOf(pathImpl.extname(right).toLowerCase());
                return (leftPriority < 0 ? 99 : leftPriority) - (rightPriority < 0 ? 99 : rightPriority);
            });
            return candidates.length ? pathImpl.join(directoryPath, candidates[0]) : null;
        } catch (error) {
            logger.error(`❌ 이미지 파일 탐색 실패 (Index: ${index}): ${error.message}`);
            return null;
        }
    };
}

module.exports = { createManuscriptImageFileReader };
