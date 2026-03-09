const Utils = require('../src/utils');

async function testRead() {
    try {
        console.log("Reading topics...");
        const topics = await Utils.readGoogleSheetTopics();
        console.log("Row 2 (index 0):", topics[0]);
    } catch (e) {
        console.error("Failed:", e.message);
    }
}
testRead();
