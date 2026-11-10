const { createSnsSheetStore } = require('../applications/sns/distribution/sns-sheet-store');
const { createGoogleSheetsSnsGateway } = require('../adapters/storage/google-sheets-sns-gateway');

function createSnsSheetStoreComposition({ GoogleSheets, googleSheetsClient, CONFIG }) {
    const gateway = createGoogleSheetsSnsGateway({ GoogleSheets, googleSheetsClient, CONFIG });
    return createSnsSheetStore({ gateway });
}

module.exports = { createSnsSheetStoreComposition };
