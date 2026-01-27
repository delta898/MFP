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

// 로그 저장 폴더 만들기
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

class Logger {
    static _write(level, message) {
        // 1. 레벨 체크: 설정된 레벨보다 낮은 중요도의 로그는 무시
        if (LEVELS[level] < currentLevel) {
            return; 
        }

        const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
        const dateStr = moment().format('YYYY-MM-DD');
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

        // 2. 콘솔 출력 (색상 입히기)
        switch (level) {
            case 'debug': console.log(`\x1b[90m${logMessage}\x1b[0m`); break; // 회색
            case 'info':  console.log(`\x1b[36m${logMessage}\x1b[0m`); break; // 청록색
            case 'warn':  console.log(`\x1b[33m${logMessage}\x1b[0m`); break; // 노란색
            case 'error': console.error(`\x1b[31m${logMessage}\x1b[0m`); break; // 빨간색
        }

        // 3. 파일 저장 (오늘 날짜 파일에 이어쓰기)
        // 파일에는 레벨 상관없이 다 남길지, 파일도 필터링할지 결정해야 하는데
        // 보통 디버깅을 위해 파일에는 '전부' 남기거나, 똑같이 필터링합니다.
        // 여기서는 "설정된 레벨만" 파일에 남기도록 통일하겠습니다.
        const logFile = path.join(logDir, `${dateStr}.log`);
        fs.appendFileSync(logFile, logMessage + '\n');
    }

    static debug(message) { this._write('debug', message); }
    static info(message)  { this._write('info', message); }
    static warn(message)  { this._write('warn', message); }
    static error(message) { this._write('error', message); }
}

module.exports = Logger;
