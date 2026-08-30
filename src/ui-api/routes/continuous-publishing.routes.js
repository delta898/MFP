function createContinuousPublishingRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleContinuousPublishingRoute(ctx = {}) {
        if (ctx.pathname === '/api/v1/continuous-publishing/automation/settings') return controller.automationSettings(ctx);
        if (ctx.pathname === '/api/v1/continuous-publishing/topics') return controller.topics(ctx);
        if (ctx.pathname === '/api/v1/continuous-publishing/topics/update') return controller.updateTopic(ctx);
        if (ctx.pathname === '/api/v1/continuous-publishing/queue') return controller.queue(ctx);
        if (ctx.pathname === '/api/v1/continuous-publishing/queue/remove') return controller.removeFromQueue(ctx);
        if (ctx.pathname === '/api/v1/continuous-publishing/runner/start') return controller.startRunner(ctx);
        if (ctx.pathname === '/api/v1/continuous-publishing/runner/status') return controller.runnerStatus(ctx);
        return false;
    };
}

module.exports = {
    createContinuousPublishingRouteHandler
};
