'use strict';

const http = require('http');

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function createSafeModeHtml(diagnosticRoot) {
    const root = escapeHtml(diagnosticRoot);
    return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BlogGenius 안전 모드</title>
<style>
body{margin:0;background:#f6f4ef;color:#24211d;font-family:"Malgun Gothic",sans-serif}
main{max-width:720px;margin:12vh auto;padding:40px;background:#fff;border:1px solid #ded8cd;border-radius:18px;box-shadow:0 16px 48px rgba(48,40,28,.10)}
h1{margin:0 0 16px;font-size:28px}p{line-height:1.75}.path{padding:14px;background:#f2efe8;border-radius:10px;word-break:break-all;font-family:Consolas,monospace}
.note{color:#6c6255;font-size:14px}
</style>
</head>
<body><main data-bloggenius-safe-mode-ready="true">
<h1>BlogGenius 안전 모드</h1>
<p>정상 시작 중 문제가 감지되어 그래픽 가속과 선택 백그라운드 기능을 끈 최소 화면으로 시작했습니다.</p>
<p>프로그램을 닫은 뒤 다시 실행하면 정상 모드로 다시 시도합니다. 문제가 반복되면 아래 폴더의 진단 자료를 개발자에게 전달해 주세요.</p>
<p class="path">${root}</p>
<p class="note">진단 자료는 자동 전송되지 않습니다. 안전 모드에서는 작성·발행·자동화 기능이 실행되지 않습니다.</p>
</main></body></html>`;
}

function startSafeModeServer(options = {}) {
    const host = '127.0.0.1';
    const html = createSafeModeHtml(options.diagnosticRoot || '');
    const server = http.createServer((_request, response) => {
        response.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'"
        });
        response.end(html);
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, host, () => {
            const address = server.address();
            resolve({ server, host, openHost: host, port: address.port });
        });
    });
}

module.exports = {
    createSafeModeHtml,
    startSafeModeServer
};
