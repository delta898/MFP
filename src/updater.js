const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process');
const CONFIG = require('./config-loader');
const Logger = require('./logger');
const { APP_VERSION } = require('./constants');

/**
 * Updater Module
 * Handles version checking and self-updating from a public GitHub mirror repository.
 */
class Updater {
    constructor() {
        this.currentVersion = APP_VERSION;
        this.repo = CONFIG.UPDATE_MIRROR_REPO || CONFIG.DEFAULT_UPDATE_MIRROR_REPO;
        this.tempDir = path.join(CONFIG.APP_ROOT_DIR, CONFIG.UPDATE_TEMP_DIR || 'tmp_update');
        this.isUpdating = false;
        this.lastCheck = 0;
        this.updateInfo = null;
    }

    /**
     * Get the latest release information from GitHub API
     */
    async getLatestRelease(includePrerelease = false) {
        try {
            const url = `https://api.github.com/repos/${this.repo}/releases`;
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'BlogGenius-Updater' },
                timeout: 5000
            });

            const releases = Array.isArray(response.data) ? response.data : [];
            if (releases.length === 0) return null;

            if (includePrerelease) {
                return releases[0];
            } else {
                return releases.find(r => !r.prerelease) || null;
            }
        } catch (e) {
            Logger.error(`❌ [Updater] 버전 체크 실패: ${e.message}`);
            return null;
        }
    }

    /**
     * Check if a new version is available
     */
    async checkForUpdate() {
        const now = Date.now();
        if (this.updateInfo && (now - this.lastCheck < 60000)) return this.updateInfo;

        const isBetaChannel = CONFIG.UPDATE_CHANNEL === 'beta';
        const latest = await this.getLatestRelease(isBetaChannel);

        if (!latest) return null;

        const latestVersion = latest.tag_name.replace(/^v/, '');
        const hasUpdate = this.compareVersions(latestVersion, this.currentVersion) > 0;

        this.lastCheck = now;
        this.updateInfo = {
            hasUpdate,
            currentVersion: this.currentVersion,
            latestVersion,
            tagName: latest.tag_name,
            body: latest.body,
            assets: latest.assets,
            publishDate: latest.published_at,
            isPrerelease: latest.prerelease,
            htmlUrl: latest.html_url
        };

        return this.updateInfo;
    }

    /**
     * Compare semver strings
     */
    compareVersions(v1, v2) {
        const p1 = v1.split('.').map(Number);
        const p2 = v2.split('.').map(Number);
        for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
            const n1 = p1[i] || 0;
            const n2 = p2[i] || 0;
            if (n1 > n2) return 1;
            if (n1 < n2) return -1;
        }
        return 0;
    }

    /**
     * Determine the correct asset for the current platform
     */
    getPlatformAsset(assets) {
        if (!Array.isArray(assets)) return null;

        const platform = process.platform;
        const arch = process.arch;

        let pattern = '';
        if (platform === 'darwin') {
            pattern = arch === 'arm64' ? 'mac-arm64' : 'mac-intel';
        } else if (platform === 'win32') {
            pattern = 'win-x64';
        } else if (platform === 'linux') {
            pattern = 'linux-x64';
        }

        return assets.find(a => a.name.toLowerCase().includes(pattern) && a.name.endsWith('.zip'));
    }

    /**
     * Download and apply the update
     */
    async applyUpdate(onProgress = null) {
        if (this.isUpdating) throw new Error('업데이트가 이미 진행 중입니다.');
        if (!this.updateInfo || !this.updateInfo.hasUpdate) throw new Error('업데이트 정보가 없거나 최신 버전입니다.');

        const asset = this.getPlatformAsset(this.updateInfo.assets);
        if (!asset) throw new Error(`현재 플랫폼(${process.platform}-${process.arch})에 맞는 배포 파일을 찾을 수 없습니다.`);

        this.isUpdating = true;
        try {
            if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
            const zipPath = path.join(this.tempDir, 'update.zip');
            const extractDir = path.join(this.tempDir, 'extracted');
            if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
            fs.mkdirSync(extractDir, { recursive: true });

            Logger.info(`📂 [Updater] 다운로드 시작: ${asset.browser_download_url}`);
            const response = await axios({
                url: asset.browser_download_url,
                method: 'GET',
                responseType: 'stream'
            });

            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloadedSize = 0;
            const writer = fs.createWriteStream(zipPath);

            response.data.on('data', (chunk) => {
                downloadedSize += chunk.length;
                if (onProgress) onProgress({ percent: Math.round((downloadedSize / totalSize) * 100), totalSize, downloadedSize });
            });

            await new Promise((resolve, reject) => {
                response.data.pipe(writer);
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            Logger.info('📂 [Updater] 압축 해제 중...');
            await this.unzip(zipPath, extractDir);

            const currentBinPath = process.execPath;
            const binName = path.basename(currentBinPath);
            const newBinPath = path.join(extractDir, binName);

            if (!fs.existsSync(newBinPath)) {
                const files = fs.readdirSync(extractDir);
                const possibleBin = files.find(f => f.startsWith('BlogGenius') && !f.endsWith('.bat') && !f.endsWith('.md'));
                if (possibleBin) {
                    Logger.info(`📂 [Updater] 새 바이너리 발견: ${possibleBin}`);
                    fs.renameSync(path.join(extractDir, possibleBin), path.join(extractDir, binName));
                } else {
                    throw new Error('압축 파일 내에서 실행 파일을 찾을 수 없습니다.');
                }
            }

            const backupPath = currentBinPath + '.bak';
            if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);

            Logger.info('📂 [Updater] 바이너리 교체 중...');
            fs.renameSync(currentBinPath, backupPath);
            fs.copyFileSync(path.join(extractDir, binName), currentBinPath);

            if (process.platform !== 'win32') {
                fs.chmodSync(currentBinPath, '755');
            }

            Logger.info('✅ [Updater] 업데이트 완료! 앱을 재시작해 주세요.');
            return true;
        } catch (e) {
            Logger.error(`❌ [Updater] 업데이트 실패: ${e.message}`);
            throw e;
        } finally {
            this.isUpdating = false;
        }
    }

    async unzip(zipPath, targetDir) {
        return new Promise((resolve, reject) => {
            let cmd = '';
            if (process.platform === 'win32') {
                cmd = `powershell -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${targetDir.replace(/'/g, "''")}' -Force"`;
            } else {
                cmd = `unzip -o "${zipPath}" -d "${targetDir}"`;
            }

            const child = spawn(cmd, { shell: true });
            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`압축 해제 실패 (Exit code: ${code})`));
            });
        });
    }

    restart() {
        const bin = process.execPath;
        const args = process.argv.slice(1).filter(arg => arg !== 'ui'); // UI 모드면 UI로 다시 뜨게 하거나, CMD면 CMD로

        Logger.info('🔄 [Updater] 프로세스 재시작 중...');

        const child = spawn(bin, args, {
            detached: true,
            stdio: 'inherit'
        });
        child.unref();
        process.exit(0);
    }
}

module.exports = new Updater();
