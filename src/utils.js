const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const XLSX = require('xlsx');
const CONFIG = require('./config-loader');
const Logger = require('./logger');

const Utils = {
    /**
     * 1. 파일명 정리
     */
    sanitizeFileName: function(str) {
        if (!str) return "untitled";
        return str.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_");
    },

    /**
     * 2. 대기 함수
     */
    sleep: (ms) => new Promise(res => setTimeout(res, ms)),

    /**
     * 3. 엑셀 파일 읽기 (배열 변환 & 이미지 옵션 추가됨)
     */
    readExcelTopics: function(filePath) {
        try {
            if (!fs.existsSync(filePath)) return [];
            const workbook = XLSX.readFile(filePath);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawData = XLSX.utils.sheet_to_json(sheet);

            return rawData.map((row, index) => {
                const entry = {};
                // 키 정규화 (공백, 특수문자 제거로 매칭률 향상)
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
                const status = getVal(['상태', 'status']).toLowerCase();
                
                // 💡 [추가됨] 이미지 관련 옵션 읽기
                const imgGenStr = getVal(['이미지생성', 'image_gen', 'img_gen']);
                const imgCountStr = getVal(['이미지개수', 'image_count', 'count']);

                return {
                    rowIndex: index,
                    subject: subject || undefined,
                    // 💡 [수정됨] 문자열을 반드시 배열로 변환 (join 에러 해결)
                    keywords: kwStr ? kwStr.split(',').map(k => k.trim()).filter(k => k) : [],
                    content_guide: { 
                        additional_instructions: instruction, 
                        reference_urls: urlStr ? urlStr.split(',').map(u => u.trim()).filter(u => u) : [] 
                    },
                    status: status,
                    // 💡 [추가됨] 엑셀 설정 반영
                    image_options: {
                        generate: !['n', 'no', 'false', 'f', '거짓', '아니오'].includes(imgGenStr.toLowerCase()),
                        count: parseInt(imgCountStr) || 4
                    }
                };
            }).filter(item => {
                const hasData = item.subject || item.keywords.length > 0 || item.content_guide.additional_instructions || item.content_guide.reference_urls.length > 0;
                return hasData && (!item.status || ['ready', 'pending', ''].includes(item.status));
            });
        } catch (e) {
            Logger.error(`❌ 엑셀 읽기 에러: ${e.message}`);
            return [];
        }
    },

    /**
     * 4. 엑셀 상태 업데이트 (원본 보존)
     */
    updateExcelStatus: function(filePath, rowIndex, status, logMessage) {
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

    /**
     * 5. 참고 자료 스크래핑
     */
    fetchReferenceContent: async function(url) {
        if (!url) return "";
        Logger.info(`🌐 [Scraping] 접속 시도: ${url}`);

        try {
            // 1. HTTP GET 요청 (브라우저인 척 User-Agent 헤더 추가)
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                },
                timeout: 10000 // 10초 타임아웃
            });

            // 2. HTML 로드 (Cheerio)
            const $ = cheerio.load(response.data);

            // 3. 불필요한 태그 제거 (노이즈 필터링)
            const tagsToRemove = ['script', 'style', 'nav', 'footer', 'header', 'iframe', 'noscript', '.ad', '#ad', 'form', 'button'];
            tagsToRemove.forEach(tag => $(tag).remove());

            // 4. 본문 텍스트 추출 (body 전체)
            // 특정 div를 찾지 않고 body 전체에서 텍스트만 발라냅니다.
            const rawText = $('body').text();

            // 5. 공백 정리 (연속된 공백/줄바꿈을 스페이스 하나로)
            const cleanText = rawText.replace(/\s+/g, ' ').trim();

            Logger.info(`   ✅ 스크래핑 성공 (길이: ${cleanText.length}자)`);
            
            // 너무 길면 3500자로 자름 (Gemini 입력 한계 고려)
            return cleanText.substring(0, 3500);

        } catch (e) {
            // 실패 시 로그만 남기고 빈 문자열 반환 (프로세스 죽지 않음)
            Logger.warn(`⚠️ 스크래핑 실패 (${url}): ${e.message}`);
            return "";
        }
    },

    /**
     * 6. Gemini 텍스트 생성
     */
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

    /**
     * 7. Gemini 이미지 생성
     */
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

    /**
     * 8. 마크다운 파싱
     */
    parseMarkdown: function(raw) {
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
                    contents.push({ 
                        type: 'image', 
                        index: currentImageIndex, 
                        raw: currentImageLines.join('\n'), 
                        prompt: this.extractPrompt(currentImageLines.join('\n')) 
                    });
                    skipImageBlock = false;
                }
                continue;
            }
            if (skipImageBlock) {
                currentImageLines.push(line);
                if (trimmedLine.includes(']]')) {
                    contents.push({ 
                        type: 'image', 
                        index: currentImageIndex, 
                        raw: currentImageLines.join('\n'), 
                        prompt: this.extractPrompt(currentImageLines.join('\n')) 
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

    extractPrompt: function(txt) {
        let prompt = '';
        txt.split('\n').forEach(l => { if(l.trim().toLowerCase().startsWith('prompt:')) prompt = l.trim().substring(7).trim(); });
        return prompt;
    }
};

module.exports = Utils;
