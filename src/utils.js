const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // ✅ Node.js 기본 모듈 (pkg 호환성 100%)
const axios = require('axios');   // ✅ 이미 검증된 통신 모듈
const CONFIG = require('./config-loader');
const Logger = require('./logger');

const Utils = {
    sanitizeFileName: function(str) {
        if (!str) return "untitled";
        return str.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_");
    },

    sleep: (ms) => new Promise(res => setTimeout(res, ms)),

    /**
     * 🔐 [New] 수동으로 구글 액세스 토큰 발급 (Google 라이브러리 미사용)
     * pkg 환경에서 gaxios/http2 충돌을 피하기 위해 native crypto와 axios만 사용합니다.
     */
    getGoogleAccessToken: async function() {
        // 1. 설정 로드
        const rawPath = CONFIG.GOOGLE_AUTH_JSON;
        if (!rawPath) throw new Error('설정 파일에 GOOGLE_AUTH_JSON 값이 없습니다.');
        const keyFilePath = path.resolve(process.cwd(), rawPath);
        
        if (!fs.existsSync(keyFilePath)) throw new Error(`인증 파일을 찾을 수 없습니다: ${keyFilePath}`);
        
        const fileContent = fs.readFileSync(keyFilePath, 'utf-8');
        const credentials = JSON.parse(fileContent);
        
        // 키 포맷팅
        const privateKey = credentials.private_key.replace(/\\n/g, '\n');
        const clientEmail = credentials.client_email;

        // 2. JWT 생성 (Header & Payload)
        const header = {
            alg: "RS256",
            typ: "JWT"
        };
        
        const now = Math.floor(Date.now() / 1000);
        const payload = {
            iss: clientEmail,
            scope: "https://www.googleapis.com/auth/spreadsheets",
            aud: "https://oauth2.googleapis.com/token",
            exp: now + 3600, // 1시간 유효
            iat: now
        };

        // 3. Base64Url 인코딩 헬퍼
        const base64UrlEncode = (obj) => {
            return Buffer.from(JSON.stringify(obj))
                .toString('base64')
                .replace(/=/g, '')
                .replace(/\+/g, '-')
                .replace(/\//g, '_');
        };

        const encodedHeader = base64UrlEncode(header);
        const encodedPayload = base64UrlEncode(payload);

        // 4. 서명 (Sign)
        const sign = crypto.createSign('RSA-SHA256');
        sign.update(`${encodedHeader}.${encodedPayload}`);
        sign.end();
        const signature = sign.sign(privateKey, 'base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');

        const jwt = `${encodedHeader}.${encodedPayload}.${signature}`;

        // 5. 토큰 교환 요청 (Axios 사용)
        Logger.info("[DEBUG] Google Token 교환 요청 (via Axios)");
        
        try {
            const res = await axios.post('https://oauth2.googleapis.com/token', null, {
                params: {
                    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                    assertion: jwt
                }
            });
            
            return res.data.access_token;

        } catch (e) {
            throw new Error(`토큰 발급 실패: ${e.message}`);
        }
    },

    /**
     * 1. 구글 시트 읽기 (Fully Manual Mode)
     */
    readGoogleSheetTopics: async function() {
        try {
            Logger.info("🌐 구글 스프레드시트 읽기 (Native Auth Mode)");
            
            // 🔥 [변경] 직접 만든 함수로 토큰 획득
            const accessToken = await this.getGoogleAccessToken();
            Logger.info("[DEBUG] 8. Access Token 획득 완료");

            // Axios로 데이터 요청
            const sheetName = CONFIG.GOOGLE_SHEET_NAME || 'Sheet1';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;

            Logger.info(`[DEBUG] 9. Axios 요청 시도: ${url}`);

            const res = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            Logger.info("[DEBUG] 10. API 응답 수신 성공");

            const rows = res.data.values;
            if (!rows || rows.length === 0) return [];

            Logger.info(`[DEBUG] 11. 데이터 파싱 시작 (${rows.length} rows)`);

            // --- 기존 데이터 매핑 로직 유지 ---
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

            return results.filter(item => {
                const hasData = item.subject || item.keywords.length > 0;
                return hasData && (item.status === '블로그 발행 준비 완료');
            });

        } catch (e) {
            Logger.error(`❌ 구글 시트 읽기 실패: ${e.message}`);
            if (e.response) Logger.error(`👉 상세: ${JSON.stringify(e.response.data)}`);
            return [];
        }
    },

    /**
     * 2. 구글 시트 상태 업데이트 (Fully Manual Mode)
     */
    updateGoogleSheetStatus: async function(rowIndex, status, logMessage) {
        try {
            // 🔥 [변경] 직접 만든 함수로 토큰 획득
            const accessToken = await this.getGoogleAccessToken();

            const sheetName = CONFIG.GOOGLE_SHEET_NAME || 'Sheet1';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

            // 헤더 읽기
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
            const toA1 = (colIdx) => {
                let letter = '';
                while (colIdx >= 0) {
                    letter = String.fromCharCode((colIdx % 26) + 65) + letter;
                    colIdx = Math.floor(colIdx / 26) - 1;
                }
                return letter;
            };

            const dataToUpdate = [];
            if (statusColIndex !== -1) dataToUpdate.push({ range: `${sheetName}!${toA1(statusColIndex)}${targetRow}`, values: [[status]] });
            if (logColIndex !== -1) dataToUpdate.push({ range: `${sheetName}!${toA1(logColIndex)}${targetRow}`, values: [[logMessage]] });
            if (timeColIndex !== -1) dataToUpdate.push({ range: `${sheetName}!${toA1(timeColIndex)}${targetRow}`, values: [[new Date().toLocaleString()]] });

            if (dataToUpdate.length === 0) return;

            // 업데이트 요청
            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
            await axios.post(updateUrl, {
                valueInputOption: 'USER_ENTERED',
                data: dataToUpdate
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

        } catch (e) {
            Logger.error(`❌ 구글 시트 업데이트 실패: ${e.message}`);
        }
    },

    // 엑셀 관련 기존 함수들 (readExcelTopics, updateExcelStatus 등)은 유지
    readExcelTopics: function(filePath) {
        const XLSX = require('xlsx'); // 필요할 때만 require
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
                const hasData = item.subject || item.keywords.length > 0;
                return hasData && (item.status === '블로그 발행 준비 완료');
            });
        } catch (e) {
            Logger.error(`❌ 엑셀 읽기 에러: ${e.message}`);
            return [];
        }
    },

    updateExcelStatus: function(filePath, rowIndex, status, logMessage) {
        const XLSX = require('xlsx');
        try {
            const workbook = XLSX.readFile(filePath);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const range = XLSX.utils.decode_range(sheet['!ref']);
            
            let statusCol, logCol, timeCol;
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cellAddress = XLSX.utils.encode_cell({r: 0, c: c});
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
                const cellAddress = XLSX.utils.encode_cell({r: r, c: col});
                sheet[cellAddress] = { v: val, t: 's' };
            };

            writeCell(statusCol, status);
            writeCell(logCol, logMessage);
            writeCell(timeCol, new Date().toLocaleString());

            XLSX.writeFile(workbook, filePath);
        } catch (e) {
            Logger.error(`❌ 엑셀 업데이트 실패: ${e.message}`);
        }
    },

    // 나머지 Gemini 호출 함수 등은 그대로 유지
    fetchReferenceContent: async function(url) {
        // (기존 코드 생략 - 유지해주세요)
        if (!url) return "";
        Logger.info(`🌐 [Scraping] 접속 시도: ${url}`);
        const cheerio = require('cheerio'); // 필요할 때 require
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                },
                timeout: 10000 
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

    callGeminiText: async function(prompt) {
         if (!CONFIG.GEMINI_API_KEY) throw new Error('API Key 누락');
         try {
             const response = await axios.post(`${CONFIG.GEMINI_TEXT_ENDPOINT}?key=${CONFIG.GEMINI_API_KEY}`, 
                 { contents: [{ parts: [{ text: prompt }] }] }, 
                 { headers: { 'Content-Type': 'application/json' } }
             );
             return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
         } catch (e) {
             Logger.error(`❌ Gemini Text Error: ${e.message}`);
             return null;
         }
    },

    callGeminiImage: async function(prompt, savePath) {
        if (!CONFIG.GEMINI_API_KEY) return null;
        try {
            const endpoint = `${CONFIG.GEMINI_IMAGE_ENDPOINT}?key=${CONFIG.GEMINI_API_KEY}`;
            const response = await axios.post(endpoint, { contents: [{ parts: [{ text: prompt }] }] }, { headers: { 'Content-Type': 'application/json' } });
            const candidates = response.data.candidates;
            if (!candidates || candidates.length === 0) throw new Error("No candidates returned");
            const imagePart = candidates[0].content.parts.find(part => part.inlineData);
            if (!imagePart) throw new Error('No inlineData found');
            
            const fullPath = `${savePath}.png`;
            fs.writeFileSync(fullPath, Buffer.from(imagePart.inlineData.data, 'base64'));
            Logger.info(`   ✅ 이미지 저장 완료: ${path.basename(fullPath)}`);
            return fullPath;
        } catch (e) {
            Logger.error(`❌ 이미지 생성 에러: ${e.message}`);
            return null;
        }
    },

    parseMarkdown: function(raw) {
        // (기존 코드 유지)
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
                skipImageBlock = true;
                currentImageIndex = Number(imageStart[1]);
                currentImageLines = [line];
                if (trimmedLine.endsWith(']]')) {
                    const blockText = currentImageLines.join('\n');
                    contents.push({ 
                        type: 'image', 
                        index: currentImageIndex, 
                        raw: blockText, 
                        text: this.extractInfo(blockText, 'title'),
                        prompt: this.extractInfo(blockText, 'prompt') 
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
                        type: 'image', 
                        index: currentImageIndex, 
                        raw: blockText, 
                        text: this.extractInfo(blockText, 'title'), 
                        prompt: this.extractInfo(blockText, 'prompt') 
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

    extractInfo: function(txt, key) {
        let val = '';
        const regex = new RegExp(`^${key}\\s*:`, 'i'); 
        txt.split('\n').forEach(l => { 
            const trimmed = l.trim();
            if(regex.test(trimmed)) {
                val = trimmed.replace(regex, '').trim();
            }
        });
        return val;
    }
};

module.exports = Utils;
