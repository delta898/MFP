const KuzuService = require('../src/kuzu-service');
const TelegramBotService = require('../src/telegram-bot.service');
const Utils = require('../src/utils');
const Logger = require('../src/logger');
const fs = require('fs');
const path = require('path');

async function testMemoryQuery() {
    Logger.info("🧪 [Test] Intelligent Memory Query 시스템 검증 시작");

    const dbPath = path.join(process.cwd(), 'data', 'kuzu');
    // 1. 깨끗한 상태에서 시작
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });
    await KuzuService.initialize();

    const chatId = 87654321; // Numeric ID (Telegram Style)

    // 2. 데이터 시딩 (Mock Data)
    Logger.info("💾 데이터 시딩 중...");

    // (A) 토픽들
    await KuzuService.recordTopic(chatId, { subject: "AI 최신 트렌드", category: "기술", source: "web-ui" });
    await KuzuService.recordTopic(chatId, { subject: "그래프 DB 활용법", category: "기술", source: "automation" });

    // (A-2) 시트 연동을 통한 등록 시뮬레이션 (options.instruction 테스트)
    await Utils.appendGoogleSheetTopics([{
        subject: "아이폰 17e 출시 정보",
        options: {
            category: "테크",
            instruction: "가성비 위주로 분석해줘"
        }
    }], { chatId, source: 'telegram' });

    // (B) 쇼핑 아이템
    await KuzuService.recordShoppingItem(chatId, { name: "아이폰 16 프로", price: "1,550,000", mall: "애플스토어", source: "automation" });

    // (C) 인사이트
    await KuzuService.updateUserInsight(chatId, "기술 관련 최신 정보에 민감하며 쇼핑 자동화 기능을 자주 사용하는 사용자임.");

    // 3. TelegramBotService 모킹
    // 실제로 메시지를 보내는 대신 로그를 남기도록 수정
    TelegramBotService.bot = {
        sendMessage: async (id, text, options) => {
            console.log(`\n[BOT SEND to ${id}]`);
            console.log(text);
            console.log("----------------------------------\n");
            return { message_id: 12345 };
        }
    };

    // 4. 인텐트별 쿼리 테스트
    Logger.info("🔍 Case 1: 전체 통계 (stats)");
    await TelegramBotService.handleQueryIntent(chatId, { query_type: 'stats' });

    Logger.info("🔍 Case 2: 토픽 목록 (topics)");
    await TelegramBotService.handleQueryIntent(chatId, { query_type: 'topics' });

    Logger.info("🔍 Case 3: 특정 카테고리 토픽 (topics + category)");
    await TelegramBotService.handleQueryIntent(chatId, {
        query_type: 'topics',
        query_params: { category: '기술' }
    });

    Logger.info("🔍 Case 4: 쇼핑 목록 (shopping)");
    await TelegramBotService.handleQueryIntent(chatId, { query_type: 'shopping' });

    Logger.info("🔍 Case 5: 사용자 인사이트 (insight)");
    await TelegramBotService.handleQueryIntent(chatId, { query_type: 'insight' });

    Logger.info("✅ 모든 Memory Query 테스트 케이스 실행 완료!");
    await KuzuService.close();
}

testMemoryQuery().catch(err => {
    Logger.error(`❌ 테스트 실패: ${err.stack || err.message}`);
    process.exit(1);
});
