// src/logger.js
const fs = require('fs');
const path = require('path');

// 로그 폴더 생성
const LOG_DIR = path.join(__dirname, '../logs');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR);
}

function getTimestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function getLogFileName() {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return path.join(LOG_DIR, `${today}.log`);
}

function write(level, message) {
    const timestamp = getTimestamp();
    const logMessage = `[${timestamp}] [${level}] ${message}\n`;
    
    // 1. 콘솔 출력
    if (level === 'ERROR') console.error(message);
    else console.log(message);

    // 2. 파일 저장
    try {
        fs.appendFileSync(getLogFileName(), logMessage, 'utf-8');
    } catch (e) {
        console.error("로그 저장 실패:", e);
    }
}

module.exports = {
    info: (msg) => write('INFO', msg),
    error: (msg) => write('ERROR', msg),
    warn: (msg) => write('WARN', msg)
};
