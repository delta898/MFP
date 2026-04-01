const { launchBrowser } = require('./browser-launcher');
const { persistAuthSessionState } = require('./auth-session');
const CONFIG = require('./config-loader');
const Logger = require('./logger');
const { createNaverTrendsCollector } = require('../shared/naver-trends-core');

module.exports = createNaverTrendsCollector({
    launchBrowser,
    persistAuthSessionState,
    config: CONFIG,
    logger: Logger
});
