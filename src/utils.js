const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const CONFIG = require('./config-loader'); // config-loader 사용
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

// 텍스트 생성
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

// 🔥 [수정] 프롬프트 내용을 로그로 확인 + 1K 옵션 유지
async function callGeminiImage(prompt, savePath) {
    if (!CONFIG.GEMINI_API_KEY) {
        Logger.error("❌ API Key가 설정되지 않았습니다.");
        return null;
    }
    
    try {
        if (fs.existsSync(savePath + '.png')) {
            Logger.info(`   ⏭️ 이미지 이미 존재: ${path.basename(savePath)}.png`);
            return savePath + '.png'; 
        }

        const endpoint = `${CONFIG.GEMINI_IMAGE_ENDPOINT}?key=${CONFIG.GEMINI_API_KEY}`;
        
        // 🔥 [진단 1] 프롬프트가 혹시 비어있는지 확인
        if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
            console.error(`🚨 [DEBUG] 프롬프트 오류: 프롬프트가 비어있습니다! (값: ${prompt})`);
            return null;
        }

        console.log(`\n🔍 [DEBUG] 생성할 프롬프트 내용: "${prompt.substring(0, 100)}..."`); // 너무 길면 자름

        // 🔥 [설정] 어제 잘 되셨다는 1K 옵션 그대로 유지
        const requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        };

        // 🔥 [진단 2] 구글로 날아가는 최종 데이터 확인
        Logger.debug(`🔍 [DEBUG] 요청 Body 전체: ${JSON.stringify(requestBody)}`);

        const response = await axios.post(
            endpoint, 
            requestBody,
            { headers: { 'Content-Type': 'application/json' } }
        );

        const candidates = response.data.candidates;
        if (!candidates || candidates.length === 0) throw new Error("No candidates returned");

        const imagePart = candidates[0].content.parts.find(part => part.inlineData);
        if (!imagePart) throw new Error('No inlineData found');

        const base64Data = imagePart.inlineData.data;
        const mimeType = imagePart.inlineData.mimeType || "image/png";
        let extension = mimeType.split('/')[1] || "png";
        if (extension === 'jpeg') extension = 'jpg';

        const fullPath = `${savePath}.${extension}`;
        fs.writeFileSync(fullPath, Buffer.from(base64Data, 'base64'));
        
        Logger.info(`   ✅ 이미지 저장 완료: ${path.basename(fullPath)}`);
        return fullPath;

    } catch (e) {
        // 🔥 [진단 3] 에러가 났을 때 구글의 답변(이유)을 정확히 출력
        console.error(`\n❌ [구글 API 에러 발생]`);
        if (e.response && e.response.data) {
            console.error(`   이유: ${JSON.stringify(e.response.data, null, 2)}`);
        } else {
            console.error(`   이유: ${e.message}`);
        }
        return null;
    }
}

// ... (이후 analyzeContentForSEO, parseMarkdown 등 기존 코드 유지) ...

// SEO 분석
async function analyzeContentForSEO(text) {
    if (!text || text.length < 50) return null;
    const analysisPrompt = `
    다음 텍스트를 분석하여 네이버 블로그 포스팅에 적합한 '매력적인 제목(Subject)'과 '검색 키워드(Keywords) 5개'를 추출해줘.
    [텍스트 내용]: ${text.substring(0, 3000)}
    [응답 형식]: JSON {"subject": "...", "keywords": [...]}
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
