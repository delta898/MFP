function createSettingsRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleSettingsRoute(ctx = {}) {
        const { pathname } = ctx;

        if (pathname === '/api/v1/settings/writing-profile') {
            await controller.handleWritingProfile(ctx);
            return true;
        }

        if (pathname === '/api/v1/settings/writing-profile/use-default') {
            await controller.handleUseDefaultWritingProfile(ctx);
            return true;
        }

        if (pathname === '/api/v1/settings/writing-profile/references/analyze') {
            await controller.handleWritingProfileReferenceAnalysis(ctx);
            return true;
        }

        if (pathname === '/api/v1/settings/writing-profile/references') {
            await controller.handleWritingProfileReferenceDelete(ctx);
            return true;
        }

        if (pathname === '/api/v1/settings/writing-profile/preview') {
            await controller.handleWritingProfilePreview(ctx);
            return true;
        }

        if (pathname === '/api/v1/settings/major') {
            await controller.handleMajor(ctx);
            return true;
        }

        if (pathname === '/api/v1/settings/core-connections') {
            await controller.handleCoreConnections(ctx);
            return true;
        }

        if (pathname === '/api/v1/settings/ai-roles') {
            await controller.handleAiRoles(ctx);
            return true;
        }

        if (pathname === '/api/v1/settings/ai-roles/test') {
            await controller.handleTestAiRole(ctx);
            return true;
        }

        if (pathname === '/api/v1/settings/advanced') {
            await controller.handleAdvanced(ctx);
            return true;
        }

        if (pathname === '/api/v1/settings/test-telegram') {
            await controller.handleTestTelegram(ctx);
            return true;
        }

        if (pathname === '/api/v1/settings/test-slack') {
            await controller.handleTestSlack(ctx);
            return true;
        }

        if (pathname === '/api/v1/settings/test-ai-model') {
            await controller.handleTestAiModel(ctx);
            return true;
        }

        if (pathname === '/api/v1/settings/buffer-connection') {
            await controller.handleBufferConnection(ctx);
            return true;
        }

        if (pathname === '/api/v1/settings/mcp-token') {
            await controller.handleRegenerateMcpToken(ctx);
            return true;
        }

        return false;
    };
}

module.exports = {
    createSettingsRouteHandler
};
