const fs = require('fs');
const path = require('path');
const Logger = require('./logger');
const { loadSharp } = require('./sharp-loader');

let sharpInstance = null;
let sharpLoadError = null;
let sharpLoadLogged = false;
let sharpLoadSource = '';

function getSharp() {
    if (sharpInstance) {
        return sharpInstance;
    }

    if (sharpLoadError) {
        return null;
    }

    try {
        const loaded = loadSharp();
        sharpInstance = loaded.sharp;
        sharpLoadSource = loaded.source || '';
        if (sharpLoadSource) {
            Logger.debug(`   ℹ️ sharp 로드 성공: ${sharpLoadSource}`);
        }
        return sharpInstance;
    } catch (error) {
        sharpLoadError = error;
        if (!sharpLoadLogged) {
            sharpLoadLogged = true;
            Logger.warn(`   ⚠️ sharp 로드 실패: ${error.message}`);
        }
        return null;
    }
}

/**
 * ImageService: 플랫폼별 최적화된 이미지 포맷 변환 서비스
 */
const ImageService = {
    /**
     * 플랫폼에 맞는 최적의 이미지 포맷으로 변환 (파일 기반)
     * @param {string} filePath 원본 파일 경로
     * @param {string} platform 'naver' | 'wordpress'
     * @param {object} options 추가 옵션 (quality 등)
     * @returns {Promise<string>} 변환된 파일 경로 (실패 시 원본 경로)
     */
    optimizeImageForPlatform: async function (filePath, platform, options = {}) {
        // config-loader를 여기서 require하여 순환 참조 방지 및 동적 로드
        const CONFIG = require('./config-loader');
        if (!CONFIG.IMAGE_OPTIMIZATION_ENABLED) return filePath;
        if (!filePath || !fs.existsSync(filePath)) return filePath;
        const sharp = getSharp();
        if (!sharp) return filePath;

        const ext = path.extname(filePath).toLowerCase();
        // Naver -> WebP, WordPress -> AVIF
        const targetFormat = platform === 'wordpress' ? 'avif' : 'webp';

        // 이미 최적화된 포맷이면 스킵 (중복 변환 방지)
        if (ext === `.${targetFormat}`) return filePath;

        try {
            const dir = path.dirname(filePath);
            const baseName = path.basename(filePath, ext);
            const newFilePath = path.join(dir, `${baseName}.${targetFormat}`);

            let pipeline = sharp(filePath);

            if (targetFormat === 'avif') {
                // AVIF: 고효율 압축 (WordPress 추천)
                pipeline = pipeline.avif({
                    quality: options.quality || 55,
                    effort: 4
                });
            } else {
                // WebP: 범용 최적화 (Naver 블로그 추천)
                pipeline = pipeline.webp({
                    quality: options.quality || 85
                });
            }

            await pipeline.toFile(newFilePath);

            Logger.info(`   ✨ 이미지 최적화 완료: ${path.basename(filePath)} -> ${path.basename(newFilePath)}`);

            // 원본 파일 삭제 여부: 여기서는 호출 측에서 판단하도록 유지하거나, 
            // 원본이 JPG/PNG고 성공했다면 삭제하는 정책을 취할 수 있음 (용량 관리)
            // 안전을 위해 여기서는 경로만 반환.

            return newFilePath;
        } catch (e) {
            Logger.warn(`   ⚠️ 이미지 최적화 실패 (${path.basename(filePath)}): ${e.message}`);
            return filePath;
        }
    },

    /**
     * 버퍼를 받아 최적화된 버퍼로 변환
     * @param {Buffer} buffer 이미지 버퍼
     * @param {string} platform 'naver' | 'wordpress'
     * @param {object} options 추가 옵션
     * @returns {Promise<{buffer: Buffer, ext: string}>} 최적화된 버퍼와 확장자
     */
    optimizeBufferForPlatform: async function (buffer, platform, options = {}) {
        const CONFIG = require('./config-loader');
        if (!CONFIG.IMAGE_OPTIMIZATION_ENABLED || !buffer) {
            return { buffer, ext: options.fallbackExt || '' };
        }
        const sharp = getSharp();
        if (!sharp) {
            return { buffer, ext: options.fallbackExt || '' };
        }

        const targetFormat = platform === 'wordpress' ? 'avif' : 'webp';

        try {
            let pipeline = sharp(buffer);

            if (targetFormat === 'avif') {
                pipeline = pipeline.avif({ quality: options.quality || 55, effort: 4 });
            } else {
                pipeline = pipeline.webp({ quality: options.quality || 85 });
            }

            const optimizedBuffer = await pipeline.toBuffer();
            return { buffer: optimizedBuffer, ext: targetFormat };
        } catch (e) {
            Logger.warn(`   ⚠️ 이미지 버퍼 최적화 실패: ${e.message}`);
            return { buffer, ext: options.fallbackExt || '' };
        }
    }
};

module.exports = ImageService;
