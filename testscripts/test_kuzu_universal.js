const KuzuService = require('../src/kuzu-service');
const Utils = require('../src/utils');
const Logger = require('../src/logger');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Utils 구글 시트 호출 Mocking
Utils.getGoogleAccessToken = async () => "mock-token";
Utils.callWithRetry = async (fn) => {
    try { return await fn(); } catch (e) { return null; }
};

// Shopping Mock
Utils.readGoogleSheetShoppingAll = async () => [
    { name: 'Header' },
    { name: 'Row1' }
];

axios.get = async (url) => {
    return { data: { values: [['Col1', 'Col2', 'Col3', 'Col4', 'Col5', 'Col6', 'Col7', 'Col8', 'Col9', 'Col10', 'Col11']] } };
};

axios.post = async () => ({ data: { updates: { updatedRange: "A1:Z1" } } });

async function testUniversal() {
    Logger.info("🧪 [Test] Universal Agent Memory (Kuzu) 검증 시작 (Step 5)");

    const dbPath = path.join(process.cwd(), 'data', 'kuzu');
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    await KuzuService.initialize();

    // 1. Telegram
    Logger.info("� Step 1: Telegram Recording");
    const chatId = "FINAL_TEST_USER";
    await KuzuService.recordMessage(chatId, "Hello", "GREETING", "USER");
    await KuzuService.recordMessage(chatId, "Hi Agent", "REPLY", "AGENT");

    // 2. Topic
    Logger.info("📝 Step 2: Topic Recording");
    await KuzuService.recordTopic(chatId, {
        subject: "Kuzu Expansion",
        keywords: "kuzu, graph",
        category: "Tech",
        source: "agent-test",
        instruction: "Be precise"
    });

    // 3. Shopping
    Logger.info("🛍️ Step 3: Shopping Recording");
    await KuzuService.recordShoppingItem(chatId, {
        name: "Test Unit",
        price: "100",
        mall: "Lab",
        source: "test-rig"
    });

    // 4. Validation
    Logger.info("🔍 Step 4: Verification");

    // History
    const history = await KuzuService.getHistory(chatId);
    console.log("History Length:", history.length);
    if (history.length < 2) throw new Error("History failed");
    console.log("Last Message Sender:", history[0].sender);

    // Topics
    const topicRes = await KuzuService._runQuery("MATCH (t:TopicNode) RETURN count(*)");
    const topicRow = await topicRes.getNext();
    // Kuzu node row extraction
    const topicCount = topicRow[0] !== undefined ? topicRow[0] : topicRow['count(*)'];
    console.log("Topic Count:", topicCount);

    // Shops
    const shopRes = await KuzuService._runQuery("MATCH (s:ShoppingNode) RETURN count(*)");
    const shopRow = await shopRes.getNext();
    const shopCount = shopRow[0] !== undefined ? shopRow[0] : shopRow['count(*)'];
    console.log("Shop Count:", shopCount);

    if (history.length >= 2 && topicCount > 0 && shopCount > 0) {
        Logger.info("✅ ALL TESTS PASSED!");
    } else {
        throw new Error("Final check failed");
    }

    await KuzuService.close();
}

testUniversal().catch(err => {
    Logger.error(`❌ Test Failed: ${err.stack || err.message}`);
    process.exit(1);
});
