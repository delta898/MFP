const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const CONFIG = require('../config/settings');
const Logger = require('./logger');

// 파일명 정리
function sanitizeFileName(str) { 
    return str.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_"); 
}

// 대기 함수
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// 참고 자료 스크래핑
async function fetchReferenceContent(url) {
    if (!url) return "";
    Logger.info(`🌐 [Scraping] 접속 시도: ${url}`);
    
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        
        const text = await page.evaluate(() => {
            const badTags = ['script', 'style', 'nav', 'footer', 'header', 'iframe', 'noscript', '.ad', '#ad'];
            badTags.forEach(tag => {
                document.querySelectorAll(tag).forEach(el => el.remove());
            });
            return document.body.innerText;
        });
        
        const cleanText = text.replace(/\s+/g, ' ').trim().substring(0, 3000);
        Logger.info(`✅ 본문 추출 성공 (${cleanText.length}자)`);
        return cleanText;
    } catch (e) {
        Logger.warn(`⚠️ 스크래핑 실패: ${e.message}`);
        return "";
    } finally {
        if (browser) await browser.close();
    }
}

// 텍스트 생성 (Gemini 1.5 Flash)
async function callGeminiText(prompt) {
    if (!CONFIG.GEMINI_API_KEY) {
        Logger.error("❌ API Key 누락");
        throw new Error('API Key 누락');
    }
    
    try {
        const response = await axios.post(
            `${CONFIG.GEMINI_TEXT_ENDPOINT}?key=${CONFIG.GEMINI_API_KEY}`, 
            { contents: [{ parts: [{ text: prompt }] }] }, 
            { headers: { 'Content-Type': 'application/json' } }
        );
        return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (e) {
        Logger.error(`❌ Gemini Text Error: ${JSON.stringify(e.response?.data || e.message)}`);
        return null;
    }
}

// 🔥 [이미지 생성 - 사용자 로직 100% 반영]
async function callGeminiImage(prompt, savePath) {
    if (!CONFIG.GEMINI_API_KEY) {
        Logger.error("❌ API Key가 설정되지 않았습니다.");
        return null;
    }
    
    try {
        // 중복 체크 (확장자를 모르므로 .png, .jpeg, .jpg 다 체크해봄직 하지만, 일단 기본 로직 유지)
        if (fs.existsSync(savePath + '.png') || fs.existsSync(savePath + '.jpeg') || fs.existsSync(savePath + '.jpg')) {
            Logger.info(`   ⏭️ 이미지 이미 존재: ${path.basename(savePath)}.*`);
            return savePath + '.png'; // 편의상 리턴
        }

        const endpoint = `${CONFIG.GEMINI_IMAGE_ENDPOINT}?key=${CONFIG.GEMINI_API_KEY}`;
        
        // 1. 요청 Body (사용자 제공)
        const requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                imageConfig: {
                    imageSize: "1K" // 필요시 "1024x1024" 등으로 변경 가능 (모델에 따라 다름)
                }
            }
        };

        Logger.info(`   📡 [Google API] 이미지 요청 전송...`);

        const response = await axios.post(
            endpoint, 
            requestBody,
            { headers: { 'Content-Type': 'application/json' } }
        );

        // 2. 응답 파싱 (사용자 제공 로직: .find 사용)
        const candidates = response.data.candidates;
        if (!candidates || candidates.length === 0) {
             throw new Error("Candidates가 비어있습니다.");
        }

        const parts = candidates[0].content.parts;
        // inlineData가 있는 part를 찾음 (아주 안전한 방식!)
        const imagePart = parts.find(part => part.inlineData);

        if (!imagePart) {
            throw new Error('응답에서 이미지 데이터(inlineData)를 찾을 수 없습니다.');
        }

        // 3. 데이터 추출
        const base64Data = imagePart.inlineData.data;
        const mimeType = imagePart.inlineData.mimeType; // 예: "image/jpeg"
        let extension = mimeType.split('/')[1]; // "jpeg"
        
        if (extension === 'jpeg') extension = 'jpg'; // 익숙한 확장자로 통일

        // 4. 저장
        const fullPath = `${savePath}.${extension}`;
        fs.writeFileSync(fullPath, Buffer.from(base64Data, 'base64'));
        
        Logger.info(`   ✅ 이미지 저장 완료: ${path.basename(fullPath)} (${mimeType})`);
        return fullPath;

    } catch (e) {
        const errorDetail = e.response?.data?.error?.message || e.message;
        Logger.error(`❌ 구글 이미지 생성 실패: ${errorDetail}`);
        // Logger.error(`   (참고) 요청 Body: ${JSON.stringify(requestBody)}`); // 필요시 주석 해제
        return null;
    }
}

// SEO 분석 (Gemini 사용)
async function analyzeContentForSEO(text) {
    if (!text || text.length < 50) return null;
    const analysisPrompt = `
    다음 텍스트를 분석하여 네이버 블로그 포스팅에 적합한 '매력적인 제목(Subject)'과 '검색 키워드(Keywords) 5개'를 추출해줘.
    
    [텍스트 내용]:
    ${text.substring(0, 3000)}

    [응답 형식]:
    반드시 아래 JSON 포맷으로만 응답해줘.
    {
        "subject": "제목",
        "keywords": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"]
    }
    `;
    try {
        const result = await callGeminiText(analysisPrompt);
        if(!result) return null;
        const cleanJson = result.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) { return null; }
}

// 마크다운 파싱
function parseMarkdown(raw) {
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
                contents.push({ type: 'image', index: currentImageIndex, raw: currentImageLines.join('\n'), ...parseImageInfo(currentImageLines.join('\n')) });
                skipImageBlock = false;
            }
            continue;
        }
        if (skipImageBlock) {
            currentImageLines.push(line);
            if (trimmedLine.includes(']]')) {
                if (contents.length > 0 && contents[contents.length - 1].type === 'newline') contents.pop();
                contents.push({ type: 'image', index: currentImageIndex, raw: currentImageLines.join('\n'), ...parseImageInfo(currentImageLines.join('\n')) });
                skipImageBlock = false;
            }
            continue; 
        }
        if (trimmedLine === '') { contents.push({ type: 'newline' }); continue; }
        if (/^##\s+/.test(trimmedLine)) {
            const text = trimmedLine.replace(/^##\s+/, '').trim();
            contents.push({ type: 'header-h2', text: text });
            continue;
        }
        if (/^###+\s+/.test(trimmedLine)) {
            const text = trimmedLine.replace(/^###+\s+/, '').trim();
            contents.push({ type: 'paragraph', text: text });
            continue;
        }
        let cleanLine = line.replace(/\*\*(.*?)\*\*/g, '$1'); 
        cleanLine = cleanLine.replace(/<a\s+[^>]*href=[\\"]+([^"\\>]+)[\\"]+[^>]*>(.*?)<\/a>/gi, (match, url, text) => {
            if (text.includes('http') || text.trim() === '') return url;
            return `${text}: ${url}`;
        });
        contents.push({ type: 'paragraph', text: cleanLine });
    }
    return { title, contents };
}

function parseImageInfo(txt) {
    let prompt = ''; 
    txt.split('\n').forEach(l => { if(l.trim().toLowerCase().startsWith('prompt:')) prompt = l.trim().substring(7).trim(); }); 
    return { prompt };
}

module.exports = { 
    sanitizeFileName, 
    sleep, 
    fetchReferenceContent, 
    callGeminiText, 
    callGeminiImage, 
    parseMarkdown,
    analyzeContentForSEO 
};
