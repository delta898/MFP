'use strict';

const { createShoppingProductGateway } = require('../adapters/commerce/shopping-product-gateway');
const ShoppingContentPreparation = require('../applications/shopping/content-preparation/application');

function createShoppingContentPreparationRuntime(options = {}) {
    const resolvePlatformWorkspaceDir = options.resolvePlatformWorkspaceDir;
    const shoppingProductGateway = createShoppingProductGateway({
        config: options.config,
        License: options.License,
        ...(options.createClient ? { createClient: options.createClient } : {}),
        ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {})
    });
    const application = Object.create(ShoppingContentPreparation);

    application.buildPostFromShortUrl = (shortUrl, runtimeOptions = {}) => (
        ShoppingContentPreparation.buildPostFromShortUrl.call(application, shortUrl, {
            ...runtimeOptions,
            ...(typeof resolvePlatformWorkspaceDir === 'function' ? { resolvePlatformWorkspaceDir } : {}),
            ...((application.relatedPostsService || options.relatedPostsService)
                ? { relatedPostsService: application.relatedPostsService || options.relatedPostsService }
                : {})
        })
    );

    application.previewFromShortUrl = (shortUrl, runtimeOptions = {}) => (
        ShoppingContentPreparation.previewFromShortUrl.call(application, shortUrl, {
            ...runtimeOptions,
            shoppingProductGateway
        })
    );
    application.scrapeShoppingProduct = (shortUrl, runtimeOptions = {}) => (
        ShoppingContentPreparation.scrapeShoppingProduct.call(application, shortUrl, {
            ...runtimeOptions,
            shoppingProductGateway
        })
    );

    return application;
}

module.exports = { createShoppingContentPreparationRuntime };
