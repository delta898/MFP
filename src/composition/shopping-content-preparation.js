'use strict';

const { createShoppingProductGateway } = require('../adapters/commerce/shopping-product-gateway');
const { recoverOptionalProduct } = require('../adapters/commerce/shopping-product-gateway');
const { persistAuthSessionState } = require('../adapters/naver/auth-session');
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
            config: options.config || {},
            persistAuthSessionState,
            recoverShoppingProduct: recoverOptionalProduct,
            ...(typeof resolvePlatformWorkspaceDir === 'function' ? { resolvePlatformWorkspaceDir } : {}),
            ...((application.relatedPostsService || options.relatedPostsService)
                ? { relatedPostsService: application.relatedPostsService || options.relatedPostsService }
                : {})
        })
    );

    application.previewFromShortUrl = (shortUrl, runtimeOptions = {}) => (
        ShoppingContentPreparation.previewFromShortUrl.call(application, shortUrl, {
            ...runtimeOptions,
            config: options.config || {},
            shoppingProductGateway,
            persistAuthSessionState,
            recoverShoppingProduct: recoverOptionalProduct
        })
    );
    application.scrapeShoppingProduct = (shortUrl, runtimeOptions = {}) => (
        ShoppingContentPreparation.scrapeShoppingProduct.call(application, shortUrl, {
            ...runtimeOptions,
            config: options.config || {},
            shoppingProductGateway,
            persistAuthSessionState,
            recoverShoppingProduct: recoverOptionalProduct
        })
    );

    return application;
}

module.exports = { createShoppingContentPreparationRuntime };
