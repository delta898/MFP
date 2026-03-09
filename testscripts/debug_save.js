const Utils = require('../src/utils');

async function testSave() {
    try {
        console.log("Testing updateGoogleSheetTopicEditableFields...");
        // Test updating row index 0 (row 2 in sheet)
        await Utils.updateGoogleSheetTopicEditableFields(0, {
            subject: 'Test Subject ' + Date.now(),
            keywords: 'test keyword',
            status: '대기',
            category: 'Testing',
            imageGeneration: false,
            externalReference: true
        });
        console.log("Success");
    } catch (e) {
        console.error("Failed:", e.message);
        if (e.response && e.response.data) {
            console.error("API Response Data:", JSON.stringify(e.response.data, null, 2));
        }
    }
}
testSave();
