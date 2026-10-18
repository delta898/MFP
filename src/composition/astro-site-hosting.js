'use strict';

const { createAstroSiteHostingAdapter } = require('../adapters/plugins/astro-site-hosting');
const { normalizeMenuDestination } = require('../applications/site-hosting/domain/navigation-contract');
const { captureSiteScreenshot } = require('../host/electron/site-screenshot');
const { createKnowledgeCollectionBuilder } = require('../applications/site-hosting/domain/knowledge-collection-builder');

function createAstroSiteHostingSystem(options = {}) {
    const corePluginRuntime = options.corePluginRuntime || require('./core-plugin-runtime').createCorePluginRuntime();
    const getCredentials = options.getCloudflareDeploymentCredentials || (async () => {
        const error = new Error('Cloudflare 배포 연결을 사용할 수 없습니다.');
        error.code = 'CLOUDFLARE_CONNECTION_REQUIRED';
        error.status = 409;
        throw error;
    });
    const { executeOperation } = corePluginRuntime.ensurePlugins(['astro-site-hosting'], {
        'astro-site-hosting': {
            ...options,
            getCredentials,
            normalizeMenuDestination,
            captureScreenshot: options.captureScreenshot || captureSiteScreenshot,
            knowledgeCollectionBuilder: options.knowledgeCollectionBuilder || createKnowledgeCollectionBuilder({ fs: options.fs, path: options.path }),
            logger: options.Logger
        }
    });
    const siteHosting = createAstroSiteHostingAdapter({ executeOperation });
    return Object.freeze({ corePluginRuntime, pluginHost: corePluginRuntime.host, siteHosting });
}

module.exports = { createAstroSiteHostingSystem };
