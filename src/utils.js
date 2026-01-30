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
     * 3. 엑셀 파일 읽기 (기존 유지)
     */
    readExcelTopics: function(filePath) {
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
                const status = getVal(['상태', 'status']).toLowerCase();
                
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
                    status: status,
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
     * 4. 엑셀 상태 업데이트 (기존 유지)
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
     * 5. 참고 자료 스크래핑 (기존 유지)
     */
    fetchReferenceContent: async function(url) {
        if (!url) return "";
        Logger.info(`🌐 [Scraping] 접속 시도: ${url}`);

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

    /**
     * 6. Gemini 텍스트 생성 (기존 유지)
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
     * 7. Gemini 이미지 생성 (기존 유지)
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
     * 8. 마크다운 파싱 (🔥 수정됨: title/text 추출 추가)
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
            // 제목(# ) 추출
            if (!title && trimmedLine.startsWith('# ')) {
                title = trimmedLine.replace(/^#\s+/, '').trim();
                continue;
            }

            // 이미지 블록 시작 감지 [[IMAGE_...
            const imageStart = trimmedLine.match(/^\[\[IMAGE_(\d+)/);
            if (imageStart) {
                skipImageBlock = true;
                currentImageIndex = Number(imageStart[1]);
                currentImageLines = [line];
                
                // 한 줄에 끝나는 경우 ([[IMAGE_1 ... ]])
                if (trimmedLine.endsWith(']]')) {
                    const blockText = currentImageLines.join('\n');
                    contents.push({ 
                        type: 'image', 
                        index: currentImageIndex, 
                        raw: blockText, 
                        // 🔥 [Fix] prompt 뿐만 아니라 title(text)도 추출
                        text: this.extractInfo(blockText, 'title'),
                        prompt: this.extractInfo(blockText, 'prompt') 
                    });
                    skipImageBlock = false;
                }
                continue;
            }

            // 이미지 블록 내부 처리
            if (skipImageBlock) {
                currentImageLines.push(line);
                // 블록 끝 감지 ]]
                if (trimmedLine.includes(']]')) {
                    const blockText = currentImageLines.join('\n');
                    contents.push({ 
                        type: 'image', 
                        index: currentImageIndex, 
                        raw: blockText, 
                        // 🔥 [Fix] 여기서도 title(text) 추출 적용
                        text: this.extractInfo(blockText, 'title'), 
                        prompt: this.extractInfo(blockText, 'prompt') 
                    });
                    skipImageBlock = false;
                }
                continue;
            }

            if (trimmedLine === '') { contents.push({ type: 'newline' }); continue; }
            
            // 소제목 감지
            if (/^##\s+/.test(trimmedLine)) {
                contents.push({ type: 'header-h2', text: trimmedLine.replace(/^##\s+/, '').trim() });
                continue;
            }
            
            // 일반 텍스트
            contents.push({ type: 'paragraph', text: line.replace(/\*\*(.*?)\*\*/g, '$1') });
        }
        return { title, contents };
    },

    /**
     * 🔥 [New Helper] 정보 추출 함수 (title:과 prompt: 모두 처리)
     * 예: "title: 제목" -> "제목" 반환
     */
    extractInfo: function(txt, key) {
        let val = '';
        // 정규식: 대소문자 무시(i), 키 뒤에 공백 허용(\s*), 콜론(:)
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
