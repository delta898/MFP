const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const CONFIG = require('../config/settings');

function sanitizeFileName(str) { return str.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_"); }
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function fetchReferenceContent(url) {
    try {
        console.log(`   🌐 [Scraping] ${url}`);
        const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
        const $ = cheerio.load(data);
        $('script, style, nav, footer, header, .ad').remove();
        return $('body').text().replace(/\s+/g, ' ').trim().substring(0, 3000);
    } catch (e) { return null; }
}

async function callGeminiText(prompt) {
    if (!CONFIG.GEMINI_API_KEY) throw new Error('API Key 누락');
    const response = await axios.post(`${CONFIG.GEMINI_TEXT_ENDPOINT}?key=${CONFIG.GEMINI_API_KEY}`, 
        { contents: [{ parts: [{ text: prompt }] }] }, 
        { headers: { 'Content-Type': 'application/json' } }
    );
    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

async function callGeminiImage(prompt, savePath) {
    if (!CONFIG.GEMINI_API_KEY) return null;
    try {
        const response = await axios.post(`${CONFIG.GEMINI_IMAGE_ENDPOINT}`, 
            { contents: [{ parts: [{ text: prompt }] }], generationConfig: { imageConfig: { imageSize: "1K" } } },
            { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': CONFIG.GEMINI_API_KEY } }
        );
        const imagePart = response.data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePart) return null;
        const ext = imagePart.inlineData.mimeType.split('/')[1];
        const fullPath = `${savePath}.${ext}`;
        fs.writeFileSync(fullPath, Buffer.from(imagePart.inlineData.data, 'base64'));
        return fullPath;
    } catch (e) { return null; }
}

// 🔥 [강화된 파싱 로직] 보내주신 코드의 로직을 그대로 가져왔습니다.
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
                // 이미지 블록 바로 위의 불필요한 엔터 제거
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
            contents.push({ type: 'header-h2', text: text }); // 타입명을 header-h2로 변경
            continue;
        }

        // ### 도 본문으로 처리
        if (/^###+\s+/.test(trimmedLine)) {
            const text = trimmedLine.replace(/^###+\s+/, '').trim();
            contents.push({ type: 'paragraph', text: text });
            continue;
        }

        let cleanLine = line.replace(/\*\*(.*?)\*\*/g, '$1'); 
        // 링크 처리 로직 유지
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
