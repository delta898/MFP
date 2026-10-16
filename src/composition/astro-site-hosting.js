'use strict';

const { createAstroSiteHostingAdapter } = require('../adapters/plugins/astro-site-hosting');
const { createAstroSiteRuntime } = require('../site-hosting/astro-site-runtime');
const { createCloudflareStaticAssetsDeployer, createCloudflareSdkAdapter } = require('../site-hosting/cloudflare-static-assets-deployer');

function createAstroSiteHostingSystem(options = {}) {
    const corePluginRuntime = options.corePluginRuntime || require('./core-plugin-runtime').createCorePluginRuntime();
    const astroRuntime = options.astroRuntime || createAstroSiteRuntime(options);
    const getCredentials = options.getCloudflareDeploymentCredentials || (async () => {
        const error = new Error('Cloudflare 배포 연결을 사용할 수 없습니다.');
        error.code = 'CLOUDFLARE_CONNECTION_REQUIRED';
        error.status = 409;
        throw error;
    });
    const cloudflareDeployer = options.cloudflareDeployer || createCloudflareStaticAssetsDeployer({
        fs: options.fs,
        path: options.path,
        getCredentials,
        createClient: options.createCloudflareSdkClient,
        createAdapter: options.createCloudflareSdkAdapter,
        fetchImpl: options.fetchImpl,
        logger: options.Logger
    });
    const createProviderAdapter = async ({ accessToken }) => {
        const Cloudflare = options.createCloudflareSdkClient
            ? null
            : require('cloudflare');
        const client = options.createCloudflareSdkClient
            ? options.createCloudflareSdkClient(accessToken)
            : new Cloudflare({ apiToken: accessToken, maxRetries: 1 });
        const adapterFactory = options.createCloudflareSdkAdapter || createCloudflareSdkAdapter;
        return adapterFactory({ client, fetchImpl: options.fetchImpl });
    };
    const { executeOperation } = corePluginRuntime.ensurePlugins(['astro-site-hosting'], {
        'astro-site-hosting': {
            astroRuntime,
            cloudflareDeployer,
            getCredentials,
            createCloudflareAdapter: (credentials) => {
                let adapterPromise;
                const getAdapter = () => adapterPromise ||= createProviderAdapter(credentials);
                return new Proxy({}, {
                    get(_target, property) {
                        if (property === 'then') return undefined;
                        return async (...args) => {
                            const adapter = await getAdapter();
                            return adapter[property](...args);
                        };
                    }
                });
            }
        }
    });
    const siteHosting = createAstroSiteHostingAdapter({ executeOperation });
    return Object.freeze({ corePluginRuntime, pluginHost: corePluginRuntime.host, siteHosting });
}

module.exports = { createAstroSiteHostingSystem };
