'use strict';

const { createCardNewsLedgerGateway } = require('../adapters/storage/card-news/google-sheets-ledger-gateway');
const { createCardNewsLedgerStore } = require('../adapters/storage/card-news/ledger-sheet-store');
const { createCardNewsProjectRepository } = require('../adapters/storage/card-news/project-repository');
const { createCardNewsFeedFetcher } = require('../adapters/feeds/card-news-feed-fetcher');
const { createCardNewsSourceService } = require('../applications/card-news/sources/service');
const { createCardNewsRssIntake } = require('../applications/card-news/sources/rss-intake');
const { createCardNewsRssIntakeScheduler } = require('../applications/card-news/sources/rss-intake-scheduler');
const { createGoogleDrivePublicMediaTransport } = require('../adapters/media/google-drive-public-media-transport');
const { createStyleReferenceFetcher } = require('../content/style-reference-fetcher');

function createCardNewsRuntime(options = {}) {
    const { GoogleSheets, CONFIG, httpClient, fs, path, GoogleOAuth, googleSheetsClient, logger, cheerio } = options;
    const cardNewsLedgerGateway = createCardNewsLedgerGateway({ GoogleSheets, CONFIG, googleSheetsClient });
    const cardNewsLedgerStore = createCardNewsLedgerStore({ gateway: cardNewsLedgerGateway });
    const cardNewsProjectRepository = createCardNewsProjectRepository({
        fs,
        path,
        workspaceDir: CONFIG.PATHS?.workspace
    });
    const cardNewsMediaTransport = createGoogleDrivePublicMediaTransport({
        httpClient,
        getAccessToken: (scopes) => GoogleSheets.getGoogleAccessToken(scopes),
        peekStatus: GoogleOAuth.peekStatus,
        logger
    });
    const cardNewsFeedFetcher = createCardNewsFeedFetcher({ httpClient });
    const cardNewsSourceService = createCardNewsSourceService({
        fetchFeed: cardNewsFeedFetcher,
        fetchPublicDocument: createStyleReferenceFetcher({ axios: httpClient, cheerio })
    });
    const cardNewsRssIntake = createCardNewsRssIntake({
        CONFIG,
        discoverConfiguredArticles: (config) => cardNewsSourceService.discoverConfiguredArticles(config),
        ledgerStore: cardNewsLedgerStore,
        logger
    });
    const cardNewsRssIntakeScheduler = createCardNewsRssIntakeScheduler({ intake: cardNewsRssIntake, logger });

    return Object.freeze({
        cardNewsLedgerStore,
        cardNewsProjectRepository,
        cardNewsMediaTransport,
        cardNewsSourceService,
        cardNewsRssIntake,
        cardNewsRssIntakeScheduler
    });
}

module.exports = { createCardNewsRuntime };
