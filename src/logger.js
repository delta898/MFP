const fs = require('fs');
const path = require('path');
const moment = require('moment'); // 날짜 포맷팅용 (없으면 npm install moment)
const CONFIG = require('./config-loader');

// 로그 레벨 정의 (숫자가 클수록 중요함)
const LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

// 현재 설정된 레벨 가져오기 (설정 없으면 info가 기본값)
const currentLevelName = (CONFIG.LOG_LEVEL || 'info').toLowerCase();
const currentLevel = LEVELS[currentLevelName] || 1;

// 로그 저장 폴더 결정
// 🚀 [Portable Mode Support]
// config-loader 에서 결정한 ROOT_DIR 내의 logs 폴더를 최우선으로 사용합니다.
logDir = path.join(CONFIG.ROOT_DIR || process.cwd(), 'logs');

// 폴더 생성 (이미 있으면 통과)
try {
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
} catch (e) {
    // EROFS 등 권한 문제 발생 시 콘솔에만 출력하고 진행
    console.error(`⚠️ 로그 폴더 생성 실패 (${logDir}): ${e.message}`);
}

class Logger {
    static _recentLogs = [];
    static _maxRecentLogs = 200;

    static _write(level, message) {
        // 1. 레벨 체크: 설정된 레벨보다 낮은 중요도의 로그는 무시
        if (LEVELS[level] < currentLevel) {
            return;
        }

        const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
        const dateStr = moment().format('YYYY-MM-DD');
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

        // 대시보드 표시용으로 메모리에 최근 로그 저장
        this._recentLogs.unshift({ timestamp, level, message });
        if (this._recentLogs.length > this._maxRecentLogs) {
            this._recentLogs.pop();
        }

        // 2. 콘솔 출력 (색상 입히기)
        switch (level) {
            case 'debug': console.log(`\x1b[90m${logMessage}\x1b[0m`); break; // 회색
            case 'info': console.log(`\x1b[36m${logMessage}\x1b[0m`); break; // 청록색
            case 'warn': console.log(`\x1b[33m${logMessage}\x1b[0m`); break; // 노란색
            case 'error': console.error(`\x1b[31m${logMessage}\x1b[0m`); break; // 빨간색
        }

        // 3. 파일 저장 (오늘 날짜 파일에 이어쓰기)
        try {
            const logFile = path.join(logDir, `${dateStr}.log`);
            fs.appendFileSync(logFile, logMessage + '\n');
        } catch (fileErr) {
            // 파일 쓰기 실패 시 콘솔에만 남김 (앱 중단 방지)
            // 무한 루프 방지를 위해 Logger.error 대신 console.error 사용
        }
    }

    static debug(message) { this._write('debug', message); }
    static info(message) { this._write('info', message); }
    static warn(message) { this._write('warn', message); }
    // 🔧 [Fixed] error 메서드에 스택 트레이스 자동 로깅 추가
    static error(message, error = null) {
        this._write('error', message);
        // DEBUG 모드일 때 스택 트레이스 자동 출력
        if (process.env.DEBUG && error && error.stack) {
            this._write('debug', `Stack trace: ${error.stack}`);
        }
    }

    static getRecentLogs(limit = 20) {
        return this._recentLogs.slice(0, limit);
    }
}

module.exports = Logger;
