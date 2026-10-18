const { createAccessTokenCache } = require('../adapters/trends/access-token-cache');
const { createTrendPostingRemoteClient } = require('../adapters/trends/remote-client');
const { createBlogTrendPostingApplication } = require('../applications/blog/trend-posting/application');

function createBlogTrendPosting(deps = {}) {
    const License = deps.License;
    const Utils = deps.Utils;
    if (!License || typeof License.issueTrendsAccessToken !== 'function') throw new Error('License.issueTrendsAccessToken is required');
    const tokenCache = deps.tokenCache || createAccessTokenCache({ issueToken: () => License.issueTrendsAccessToken() });
    let remoteClient = deps.remoteClient || null;
    function getRemoteClient() {
        if (!remoteClient) remoteClient = createTrendPostingRemoteClient({
            axios: deps.axios,
            tokenCache,
            baseUrl: deps.baseUrl
        });
        return remoteClient;
    }
    const topicStore = deps.topicStore || {};
    if (!deps.topicStore && typeof Utils?.readGoogleSheetTopicsAll === 'function') {
        topicStore.listAll = (options) => Utils.readGoogleSheetTopicsAll(options);
    }
    if (!deps.topicStore && typeof Utils?.appendGoogleSheetTopics === 'function') {
        topicStore.append = (rows, options) => Utils.appendGoogleSheetTopics(rows, options);
    }
    return {
        application: createBlogTrendPostingApplication({
            remoteClient: {
                getMeta: (...args) => getRemoteClient().getMeta(...args),
                getRows: (...args) => getRemoteClient().getRows(...args)
            },
            topicStore,
            license: { checkStatus: () => License.checkLicenseStatus() },
            logger: deps.Logger,
            now: deps.now
        }),
        clearAccessToken: () => tokenCache.clear()
    };
}

module.exports = { createBlogTrendPosting };
