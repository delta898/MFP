const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright'); // 🔥 스크래핑용 (cheerio 대신 사용)
const CONFIG = require('../config/settings');

// 파일명 정리
function sanitizeFileName(str) { 
    return str.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_"); 
}

// 대기 함수
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// 🔥 [강화됨] 참고 자료 스크래핑 (Playwright 사용)
async function fetchReferenceContent(url) {
    if (!url) return "";
    console.log(`   🌐 [Scraping] 참고 자료 수집 중: ${url}`);
    
    let browser;
    try {
        // 1. 브라우저 실행 (가볍게)
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        
        // 2. 페이지 이동 (최대 10초 대기)
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        
        // 3. 본문 텍스트 추출 (불필요한 태그 제거 후)
        const text = await page.evaluate(() => {
            // 광고, 메뉴, 푸터 등 제거
            const badTags = ['script', 'style', 'nav', 'footer', 'header', 'iframe', 'noscript', '.ad', '#ad'];
            badTags.forEach(tag => {
                document.querySelectorAll(tag).forEach(el => el.remove());
            });
            return document.body.innerText;
        });
        
        // 4. 공백 정리 및 길이 제한
        const cleanText = text.replace(/\s+/g, ' ').trim().substring(0, 3000);
        console.log(`      ✅ 본문 추출 성공 (${cleanText.length}자)`);
        
        return cleanText;

    } catch (e) {
        console.warn(`      ⚠️ 스크래핑 실패 (무시하고 진행): ${e.message}`);
        return ""; // 실패해도 에러 내지 않고 빈 문자열 반환
    } finally {
        if (browser) await browser.close();
    }
}

// 텍스트 생성 (Gemini 1.5 Flash)
async function callGeminiText(prompt) {
    if (!CONFIG.GEMINI_API_KEY) throw new Error('API Key 누락');
    
    try {
        const response = await axios.post(
            `${CONFIG.GEMINI_TEXT_ENDPOINT}?key=${CONFIG.GEMINI_API_KEY}`, 
            { contents: [{ parts: [{ text: prompt }] }] }, 
            { headers: { 'Content-Type': 'application/json' } }
        );
        return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (e) {
        console.error("❌ Gemini API Error:", e.response?.data || e.message);
        return null;
    }
}

// 이미지 생성 (Imagen 3 호환)
async function callGeminiImage(prompt, savePath) {
    if (!CONFIG.GEMINI_API_KEY) return null;
    
    try {
        // 이미지가 이미 있으면 스킵
        if (fs.existsSync(savePath + '.png')) return savePath + '.png';

        const response = await axios.post(
            `${CONFIG.GEMINI_IMAGE_ENDPOINT}?key=${CONFIG.GEMINI_API_KEY}`, 
            {
                instances: [{ prompt: prompt }],
                parameters: { sampleCount: 1, aspectRatio: "4:3" }
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        // Imagen 3 응답 구조 처리
        const base64Data = response.data?.predictions?.[0]?.bytesBase64Encoded;
        
        if (!base64Data) return null;

        const fullPath = `${savePath}.png`;
        fs.writeFileSync(fullPath, Buffer.from(base64Data, 'base64'));
        return fullPath;

    } catch (e) {
        console.warn(`   ⚠️ 이미지 생성 실패: ${prompt.substring(0, 20)}...`);
        return null;
    }
}

// 🔥 [유지] 사용자님이 작성하신 파싱 로직 (그대로 유지)
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

        if (trimmedLine === '') {
            contents.push({ type: 'newline' });
            continue;
        }

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

module.exports = { sanitizeFileName, sleep, fetchReferenceContent, callGeminiText, callGeminiImage, parseMarkdown };
