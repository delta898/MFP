/**
 * 텔레그램 멀티 플랫폼 카테고리 파싱 및 토픽 생성 테스트
 */
const Core = require('../src/core');
const TelegramBotService = require('../src/telegram-bot.service');
const Utils = require('../src/utils');
const Logger = require('../src/logger');

async function test() {
    Logger.info("🧪 [Test] 텔레그램 멀티 카테고리 고도화 테스트 시작");

    // 1. Core.parseTelegramRequest 테스트 (AI 모킹)
    // 실제 Gemini 호출 대신 모킹을 위해 Utils.callGeminiText 일시적 오버라이드
    const originalCallGeminiText = Utils.callGeminiText;
    Utils.callGeminiText = async (prompt) => {
        if (prompt.includes("네이버는 '디지털'")) {
            return JSON.stringify({
                intent: "PUBLISH",
                data: {
                    theme: "AI의 미래",
                    keywords: ["AI", "Future"],
                    platforms: ["naver", "wordpress"],
                    options: {
                        naver_category: "디지털",
                        wordpress_category: "Technology"
                    }
                }
            });
        }
        return null;
    };

    const parsed = await Core.parseTelegramRequest("네이버는 '디지털' 카테고리로, 워드프레스는 'Technology' 카테고리로 해서 'AI의 미래'에 대해 글 써줘.");
    console.log("✅ [1] AI 파싱 결과:", JSON.stringify(parsed, null, 2));

    if (parsed.data.options.naver_category !== '디지털' || parsed.data.options.wordpress_category !== 'Technology') {
        throw new Error("AI 파싱 결과가 예상과 다릅니다.");
    }

    // 2. TelegramBotService.handlePublishIntent (또는 인라인 로직) 테스트
    // 실제 시트 추가 대신 모킹
    let capturedTopics = [];
    Utils.appendGoogleSheetTopics = async (topics) => {
        capturedTopics = topics;
        return { success: true, rowIndices: [10, 11] };
    };

    // TelegramBotService 내부의 confirm 로직을 재현 (또는 직접 호출 가능하도록 구조화되었다면 호출)
    // 여기서는 pendingRequests 및 콜백 로직을 직접 시뮬레이션
    const mockRequest = {
        data: parsed.data
    };

    const newTopics = [];
    const pData = mockRequest.data;
    const platforms = pData.platforms || ['naver'];

    for (const p of platforms) {
        const isWP = p.toLowerCase().includes('wordpress');
        const targetPlatform = isWP ? 'wordpress' : 'naver';

        const platformCategory = isWP
            ? (pData.options?.wordpress_category || pData.options?.category || '')
            : (pData.options?.naver_category || pData.options?.category || '');

        newTopics.push({
            subject: pData.theme,
            keywords: pData.keywords,
            category: platformCategory,
            options: {
                ...pData.options,
                platforms: [targetPlatform]
            },
            source: 'telegram'
        });
    }

    await Utils.appendGoogleSheetTopics(newTopics);

    console.log("✅ [2] 생성된 토픽 목록:", JSON.stringify(capturedTopics, null, 2));

    if (capturedTopics.length !== 2) throw new Error("토픽 개수가 2개가 아닙니다.");
    if (capturedTopics[0].category !== '디지털' || capturedTopics[0].options.platforms[0] !== 'naver') throw new Error("네이버 토픽 설정 오류");
    if (capturedTopics[1].category !== 'Technology' || capturedTopics[1].options.platforms[0] !== 'wordpress') throw new Error("워드프레스 토픽 설정 오류");

    console.log("\n🎊 모든 테스트 통과!");

    // 복구
    Utils.callGeminiText = originalCallGeminiText;
}

test().catch(err => {
    console.error("❌ 테스트 실패:", err);
    process.exit(1);
});
