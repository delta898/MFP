const http = require('http');

const data = JSON.stringify({
    rowIndex: 22,
    subject: "맛집 test api",
    keywords: "keyword 1, keyword 2",
    instruction: "",
    referenceUrl: "",
    category: "테스트",
    status: "대기",
    postStatus: "publish",
    imageGeneration: true,
    externalReference: false,
    scheduleDate: ""
});

const req = http.request({
    hostname: '127.0.0.1',
    port: 4577,
    path: '/api/v1/blog/topic/update',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
    }
}, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => console.log('Response:', res.statusCode, body));
});

req.on('error', e => console.error('Error:', e.message));
req.write(data);
req.end();
