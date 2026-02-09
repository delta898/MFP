const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const CONFIG = require('./config-loader');
const Logger = require('./logger');

const Utils = {
    sanitizeFileName: function (str) {
        if (!str) return "untitled";
        // 🔧 [Fixed] 파일명 길이 제한 추가 (파일 시스템 에러 방지)
        let cleaned = str.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_");
        // 파일명 최대 200자로 제한 (확장자 및 경로 고려)
        if (cleaned.length > 200) {
            cleaned = cleaned.substring(0, 200);
        }
        return cleaned;
    },

    sleep: (ms) => new Promise(res => setTimeout(res, ms)),

    /**
     * 🔐 수동 구글 액세스 토큰 발급
     */
    getGoogleAccessToken: async function () {
        const rawPath = CONFIG.GOOGLE_AUTH_JSON;
        if (!rawPath) throw new Error('설정 파일에 GOOGLE_AUTH_JSON 값이 없습니다.');
        const keyFilePath = path.resolve(process.cwd(), rawPath);

        if (!fs.existsSync(keyFilePath)) throw new Error(`인증 파일을 찾을 수 없습니다: ${keyFilePath}`);

        const fileContent = fs.readFileSync(keyFilePath, 'utf-8');
        const credentials = JSON.parse(fileContent);

        const privateKey = credentials.private_key.replace(/\\n/g, '\n');
        const clientEmail = credentials.client_email;

        const header = { alg: "RS256", typ: "JWT" };
        const now = Math.floor(Date.now() / 1000);
        const payload = {
            iss: clientEmail,
            scope: "https://www.googleapis.com/auth/spreadsheets",
            aud: "https://oauth2.googleapis.com/token",
            exp: now + 3600,
            iat: now
        };

        const base64UrlEncode = (obj) => {
            return Buffer.from(JSON.stringify(obj))
                .toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        };

        const encodedHeader = base64UrlEncode(header);
        const encodedPayload = base64UrlEncode(payload);

        const sign = crypto.createSign('RSA-SHA256');
        sign.update(`${encodedHeader}.${encodedPayload}`);
        sign.end();
        const signature = sign.sign(privateKey, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

        const jwt = `${encodedHeader}.${encodedPayload}.${signature}`;

        try {
            const res = await axios.post('https://oauth2.googleapis.com/token', null, {
                params: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }
            });
            return res.data.access_token;
        } catch (e) {
            throw new Error(`토큰 발급 실패: ${e.message}`);
        }
    },

    /**
     * 1. 구글 시트 읽기
     */
    readGoogleSheetTopics: async function () {
        try {
            Logger.info("🌐 구글 스프레드시트 읽기 (Native Auth Mode)");
            const accessToken = await this.getGoogleAccessToken();

            const sheetName = CONFIG.GOOGLE_SHEET_NAME || 'Sheet1';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;

            const res = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            });

            const rows = res.data.values;
            if (!rows || rows.length === 0) return [];

            const headers = rows[0].map(h => h.toLowerCase().replace(/[\s\/_]/g, '').trim());
            const results = rows.slice(1).map((row, index) => {
                const entry = {};
                headers.forEach((h, i) => { entry[h] = row[i] !== undefined ? row[i] : ""; });
                const getVal = (cols) => {
                    for (let col of cols) {
                        const cleanCol = col.toLowerCase().replace(/[\s\/_]/g, '').trim();
                        if (entry[cleanCol]) return String(entry[cleanCol]).trim();
                    }
                    return "";
                };

                const subject = getVal(['subject', '주제', '제목']);
                const kwStr = getVal(['keywords', '키워드']);
                const instruction = getVal(['참고지시사항', '참고/지시사항', 'instruction', '지시사항', '내용']);
                const urlStr = getVal(['참고url', '참고/url', 'references', 'url']);
                const status = getVal(['상태', 'status']);
                const imgGenStr = getVal(['이미지생성', 'image_gen', 'img_gen']);
                const imgCountStr = getVal(['이미지개수', 'image_count', 'count']);

                return {
                    rowIndex: index,
                    subject: subject || undefined,
                    keywords: kwStr ? kwStr.split(',').map(k => k.trim()).filter(k => k) : [],
                    content_guide: {
                        additional_instructions: instruction,
                        reference_urls: urlStr ? urlStr.split(',').map(u => u.trim()).filter(u => u) : []
                    },
                    status: status ? status.trim() : "",
                    image_options: {
                        generate: ['y', 'yes', 'true', 't', '예', '참', 'o'].includes(imgGenStr.toLowerCase()),
                        count: parseInt(imgCountStr) || 4
                    }
                };
            });

            // 🔥 [수정됨] 주제, 키워드, URL 중 하나라도 있으면 OK
            return results.filter(item => {
                const hasData = item.subject ||
                    item.keywords.length > 0 ||
                    item.content_guide.reference_urls.length > 0; // 👈 여기 추가됨
                return hasData && (item.status === '블로그 발행 준비 완료');
            });

        } catch (e) {
            Logger.error(`❌ 구글 시트 읽기 실패: ${e.message}`);
            return [];
        }
    },

    /**
     * 2. 구글 시트 상태 업데이트
     * 🔧 [Fixed] 재시도 로직 추가 및 백업 로깅
     */
    updateGoogleSheetStatus: async function (rowIndex, status, logMessage, retries = 2) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const accessToken = await this.getGoogleAccessToken();
                const sheetName = CONFIG.GOOGLE_SHEET_NAME || 'Sheet1';
                const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

                const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
                const headerRes = await axios.get(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });

                const headers = headerRes.data.values[0];
                let statusColIndex = -1, logColIndex = -1, timeColIndex = -1;

                headers.forEach((h, i) => {
                    const clean = h.toLowerCase().replace(/[\s\/_]/g, '');
                    if (clean.includes('상태') || clean.includes('status')) statusColIndex = i;
                    else if (clean.includes('로그') || clean.includes('log')) logColIndex = i;
                    else if (clean.includes('발행') || clean.includes('time')) timeColIndex = i;
                });

                const targetRow = rowIndex + 2;
                // 🔧 [Fixed] 구글 시트 A1 변환 버그 수정
                const toA1 = (colIdx) => {
                    let letter = '';
                    let num = colIdx;
                    while (num >= 0) {
                        letter = String.fromCharCode((num % 26) + 65) + letter;
                        num = Math.floor(num / 26) - 1;
                        if (num < 0) break; // 음수 방지
                    }
                    return letter;
                };

                const dataToUpdate = [];
                if (statusColIndex !== -1) dataToUpdate.push({ range: `${sheetName}!${toA1(statusColIndex)}${targetRow}`, values: [[status]] });
                if (logColIndex !== -1) dataToUpdate.push({ range: `${sheetName}!${toA1(logColIndex)}${targetRow}`, values: [[logMessage]] });
                if (timeColIndex !== -1) dataToUpdate.push({ range: `${sheetName}!${toA1(timeColIndex)}${targetRow}`, values: [[new Date().toLocaleString()]] });

                if (dataToUpdate.length === 0) return;

                const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
                await axios.post(updateUrl, { valueInputOption: 'USER_ENTERED', data: dataToUpdate }, {
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                });

                // 성공 시 즉시 리턴
                return;
            } catch (e) {
                if (attempt === retries) {
                    Logger.error(`❌ 구글 시트 업데이트 최종 실패 (Row ${rowIndex + 1}): ${e.message}`);
                    // 🔧 [Fixed] 로컬 파일에 백업 기록
                    const backupLog = `${new Date().toISOString()} | Row ${rowIndex + 1} | ${status} | ${logMessage}\n`;
                    try {
                        fs.appendFileSync('failed_updates.log', backupLog);
                        Logger.warn(`   💾 백업 로그에 기록됨: failed_updates.log`);
                    } catch (fileErr) {
                        Logger.error(`   ❌ 백업 로그 기록 실패: ${fileErr.message}`);
                    }
                } else {
                    Logger.warn(`⚠️ 구글 시트 업데이트 재시도 (${attempt}/${retries})`);
                    await this.sleep(1000);
                }
            }
        }
    },

    /**
     * 3. 엑셀 읽기 (기존 유지 + 필터 수정)
     */
    readExcelTopics: function (filePath) {
        const XLSX = require('xlsx');
        try {
            if (!fs.existsSync(filePath)) return [];
            const workbook = XLSX.readFile(filePath);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawData = XLSX.utils.sheet_to_json(sheet);

            return rawData.map((row, index) => {
                const entry = {};
                Object.keys(row).forEach(key => {
                    const cleanKey = key.toLowerCase().replace(/[\s\/_]/g, '').trim();
                    entry[cleanKey] = row[key];
                });

                const getVal = (cols) => {
                    for (let col of cols) {
                        const cleanCol = col.toLowerCase().replace(/[\s\/_]/g, '').trim();
                        if (entry[cleanCol] !== undefined) return String(entry[cleanCol]).trim();
                    }
                    return "";
                };

                const subject = getVal(['subject', '주제', '제목']);
                const kwStr = getVal(['keywords', '키워드']);
                const instruction = getVal(['참고지시사항', '참고/지시사항', 'instruction', '지시사항', '내용']);
                const urlStr = getVal(['참고url', '참고/url', 'references', 'url']);
                const status = getVal(['상태', 'status']);
                const imgGenStr = getVal(['이미지생성', 'image_gen', 'img_gen']);
                const imgCountStr = getVal(['이미지개수', 'image_count', 'count']);

                return {
                    rowIndex: index,
                    subject: subject || undefined,
                    keywords: kwStr ? kwStr.split(',').map(k => k.trim()).filter(k => k) : [],
                    content_guide: {
                        additional_instructions: instruction,
                        reference_urls: urlStr ? urlStr.split(',').map(u => u.trim()).filter(u => u) : []
                    },
                    status: status ? status.trim() : "",
                    image_options: {
                        generate: ['y', 'yes', 'true', 't', '예', '참', 'o'].includes(imgGenStr.toLowerCase()),
                        count: parseInt(imgCountStr) || 4
                    }
                };
            }).filter(item => {
                // 🔥 [수정됨] 주제, 키워드, URL 중 하나라도 있으면 OK
                const hasData = item.subject ||
                    item.keywords.length > 0 ||
                    item.content_guide.reference_urls.length > 0; // 👈 여기 추가됨
                return hasData && (item.status === '블로그 발행 준비 완료');
            });
        } catch (e) {
            Logger.error(`❌ 엑셀 읽기 에러: ${e.message}`);
            return [];
        }
    },

    // 🔧 [Fixed] 엑셀 업데이트 재시도 로직 추가
    updateExcelStatus: function (filePath, rowIndex, status, logMessage, retries = 2) {
        const XLSX = require('xlsx');

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const workbook = XLSX.readFile(filePath);
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const range = XLSX.utils.decode_range(sheet['!ref']);

                let statusCol, logCol, timeCol;
                for (let c = range.s.c; c <= range.e.c; c++) {
                    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: c });
                    const cell = sheet[cellAddress];
                    if (!cell) continue;
                    const hdr = cell.v.toString().toLowerCase().replace(/[\s\/_]/g, '');
                    if (hdr.includes('상태') || hdr.includes('status')) statusCol = c;
                    else if (hdr.includes('로그') || hdr.includes('log')) logCol = c;
                    else if (hdr.includes('발행') || hdr.includes('time')) timeCol = c;
                }

                const r = rowIndex + 1;
                const writeCell = (col, val) => {
                    if (col === undefined) return;
                    const cellAddress = XLSX.utils.encode_cell({ r: r, c: col });
                    sheet[cellAddress] = { v: val, t: 's' };
                };

                writeCell(statusCol, status);
                writeCell(logCol, logMessage);
                writeCell(timeCol, new Date().toLocaleString());
                XLSX.writeFile(workbook, filePath);

                // 성공 시 즉시 리턴
                return;
            } catch (e) {
                if (attempt === retries) {
                    Logger.error(`❌ 엑셀 업데이트 최종 실패 (Row ${rowIndex + 1}): ${e.message}`);
                    // 백업 로깅
                    const backupLog = `${new Date().toISOString()} | Row ${rowIndex + 1} | ${status} | ${logMessage}\n`;
                    try {
                        fs.appendFileSync('failed_updates.log', backupLog);
                        Logger.warn(`   💾 백업 로그에 기록됨: failed_updates.log`);
                    } catch (fileErr) {
                        Logger.error(`   ❌ 백업 로그 기록 실패: ${fileErr.message}`);
                    }
                } else {
                    Logger.warn(`⚠️ 엑셀 업데이트 재시도 (${attempt}/${retries})`);
                    this.sleep(500); // 짧은 대기 (동기 함수이므로 setTimeout 사용 불가)
                }
            }
        }
    },

    fetchReferenceContent: async function (url) {
        if (!url) return "";
        Logger.info(`🌐 [Scraping] 접속 시도: ${url}`);
        const cheerio = require('cheerio');
        try {
            // 🔧 [Fixed] 타임아웃 연장 및 리다이렉트 제한 추가
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                },
                timeout: CONFIG.SCRAPING_TIMEOUT || 20000,  // 설정 가능하게, 기본 20초
                maxRedirects: 5  // 리다이렉트 제한
            });
            const $ = cheerio.load(response.data);
            const tagsToRemove = ['script', 'style', 'nav', 'footer', 'header', 'iframe', 'noscript', '.ad', '#ad', 'form', 'button'];
            tagsToRemove.forEach(tag => $(tag).remove());
            const rawText = $('body').text();
            const cleanText = rawText.replace(/\s+/g, ' ').trim();
            Logger.info(`   ✅ 스크래핑 성공 (길이: ${cleanText.length}자)`);
            return cleanText.substring(0, 3500);
        } catch (e) {
            Logger.warn(`⚠️ 스크래핑 실패 (${url}): ${e.message}`);
            return "";
        }
    },

    // 🔧 [Fixed] Gemini API 재시도 로직 추가 (지수 백오프)
    callGeminiText: async function (prompt, retries = 3) {
        if (!CONFIG.GEMINI_API_KEY) throw new Error('API Key 누락');

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await axios.post(`${CONFIG.GEMINI_TEXT_ENDPOINT}?key=${CONFIG.GEMINI_API_KEY}`,
                    { contents: [{ parts: [{ text: prompt }] }] },
                    { headers: { 'Content-Type': 'application/json' } }
                );
                const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) throw new Error('Empty response from Gemini');
                return text;
            } catch (e) {
                Logger.warn(`⚠️ Gemini Text API 호출 실패 (시도 ${attempt}/${retries}): ${e.message}`);

                if (attempt === retries) {
                    Logger.error(`❌ Gemini Text API 최대 재시도 횟수 초과`);
                    throw e; // null 대신 에러 throw
                }

                // 지수 백오프 (1초, 2초, 4초...)
                const waitTime = 1000 * Math.pow(2, attempt - 1);
                Logger.info(`   ⏳ ${waitTime / 1000}초 후 재시도...`);
                await this.sleep(waitTime);
            }
        }
    },

    // 🔧 [Fixed] 이미지 생성 API 재시도 로직 추가
    callGeminiImage: async function (prompt, savePath, retries = 3) {
        if (!CONFIG.GEMINI_API_KEY) throw new Error('API Key 누락');

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const endpoint = `${CONFIG.GEMINI_IMAGE_ENDPOINT}?key=${CONFIG.GEMINI_API_KEY}`;
                const response = await axios.post(endpoint,
                    { contents: [{ parts: [{ text: prompt }] }] },
                    { headers: { 'Content-Type': 'application/json' } }
                );
                const candidates = response.data.candidates;
                if (!candidates || candidates.length === 0) throw new Error("No candidates returned");
                const imagePart = candidates[0].content.parts.find(part => part.inlineData);
                if (!imagePart) throw new Error('No inlineData found');

                const fullPath = `${savePath}.png`;
                fs.writeFileSync(fullPath, Buffer.from(imagePart.inlineData.data, 'base64'));
                Logger.info(`   ✅ 이미지 저장 완료: ${path.basename(fullPath)}`);
                return fullPath;
            } catch (e) {
                Logger.warn(`⚠️ Gemini Image API 호출 실패 (시도 ${attempt}/${retries}): ${e.message}`);

                if (attempt === retries) {
                    Logger.error(`❌ 이미지 생성 최대 재시도 횟수 초과`);
                    throw e; // null 대신 에러 throw
                }

                // 지수 백오프
                const waitTime = 1000 * Math.pow(2, attempt - 1);
                Logger.info(`   ⏳ ${waitTime / 1000}초 후 재시도...`);
                await this.sleep(waitTime);
            }
        }
    },

    parseMarkdown: function (raw) {
        const lines = raw.split('\n');
        let title = '';
        const contents = [];
        let skipImageBlock = false;
        let currentImageIndex = null;
        let currentImageLines = [];

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!title && trimmedLine.startsWith('# ')) {
                title = trimmedLine.replace(/^#\s+/, '').trim();
                continue;
            }
            const imageStart = trimmedLine.match(/^\[\[IMAGE_(\d+)/);
            if (imageStart) {
                // 🔧 [Fixed] 중첩된 이미지 블록 감지 및 처리
                if (skipImageBlock) {
                    Logger.warn(`⚠️ 중첩된 이미지 블록 감지: ${trimmedLine}`);
                    // 이전 블록 강제 종료
                    contents.push({
                        type: 'image',
                        index: currentImageIndex,
                        raw: currentImageLines.join('\n'),
                        text: 'Error: Nested block detected',
                        prompt: 'Invalid nested block'
                    });
                }

                skipImageBlock = true;
                currentImageIndex = Number(imageStart[1]);
                currentImageLines = [line];
                if (trimmedLine.endsWith(']]')) {
                    const blockText = currentImageLines.join('\n');
                    contents.push({
                        type: 'image', index: currentImageIndex, raw: blockText,
                        text: this.extractInfo(blockText, 'title'), prompt: this.extractInfo(blockText, 'prompt')
                    });
                    skipImageBlock = false;
                }
                continue;
            }
            if (skipImageBlock) {
                currentImageLines.push(line);
                if (trimmedLine.includes(']]')) {
                    const blockText = currentImageLines.join('\n');
                    contents.push({
                        type: 'image', index: currentImageIndex, raw: blockText,
                        text: this.extractInfo(blockText, 'title'), prompt: this.extractInfo(blockText, 'prompt')
                    });
                    skipImageBlock = false;
                }
                continue;
            }
            if (trimmedLine === '') { contents.push({ type: 'newline' }); continue; }
            if (/^##\s+/.test(trimmedLine)) {
                contents.push({ type: 'header-h2', text: trimmedLine.replace(/^##\s+/, '').trim() });
                continue;
            }
            contents.push({ type: 'paragraph', text: line.replace(/\*\*(.*?)\*\*/g, '$1') });
        }
        return { title, contents };
    },

    extractInfo: function (txt, key) {
        let val = '';
        const regex = new RegExp(`^${key}\\s*:`, 'i');
        txt.split('\n').forEach(l => {
            const trimmed = l.trim();
            if (regex.test(trimmed)) { val = trimmed.replace(regex, '').trim(); }
        });
        return val;
    }
};

module.exports = Utils;
