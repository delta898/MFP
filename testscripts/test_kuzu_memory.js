const KuzuService = require('../src/kuzu-service');
const Logger = require('../src/logger');

async function test() {
    Logger.info("🧪 [Test] Kuzu Memory Service 테스트 시작");

    const chatId = "123456789";
    const username = "TestUser";

    // 1. 초기화
    await KuzuService.initialize();

    // 2. 메시지 기록
    Logger.info("📝 메시지 기록 중...");
    await KuzuService.recordMessage(chatId, "안녕하세요, 인공지능에 대해 알려주세요.", "PUBLISH");
    await KuzuService.recordMessage(chatId, "네이버 블로그에 발행해줘.", "PUBLISH");

    // 3. 토픽 기록
    Logger.info("📋 토픽 기록 중...");
    await KuzuService.recordTopic(chatId, {
        subject: "인공지능의 미래",
        platform: "naver",
        category: "기술"
    });

    // 4. 히스토리 조회
    Logger.info("🔍 히스토리 조회 중...");
    const history = await KuzuService.getHistory(chatId);
    console.log("히스토리 결과:", JSON.stringify(history, null, 2));

    if (history.length < 2) {
        throw new Error("히스토리 기록이 제대로 되지 않았습니다.");
    }

    // 5. 인사이트 저장 및 조회
    Logger.info("💡 인사이트 테스트...");
    const mockInsight = "이 사용자는 최신 기술 트렌드와 네이버 블로그 발행에 관심이 많음.";
    await KuzuService.updateUserInsight(chatId, mockInsight);

    const savedInsight = await KuzuService.getUserInsight(chatId);
    console.log("저장된 인사이트:", savedInsight);

    if (savedInsight !== mockInsight) {
        throw new Error("인사이트 저장/조회 실패");
    }

    Logger.info("✅ 모든 Kuzu 테스트 통과!");
    process.exit(0);
}

test().catch(err => {
    Logger.error(`❌ 테스트 실패: ${err.message}`);
    console.error(err);
    process.exit(1);
});
