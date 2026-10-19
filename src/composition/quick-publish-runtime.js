'use strict';

const { createQuickPublishRuntime: createQuickPublishRuntimeState } = require('../applications/blog/publishing/quick-publish-state');
const { createTransientPreviewWorkspaceManager } = require('../adapters/storage/manuscript-drafts/transient-preview-workspace');

function createQuickPublishRuntime(options = {}) {
    const workspaceManager = options.workspaceManager || (
        options.fs && options.path && options.workspaceDir
            ? createTransientPreviewWorkspaceManager(options)
            : null
    );
    workspaceManager?.cleanupExpired();
    return createQuickPublishRuntimeState({ ...options, workspaceManager });
}

module.exports = { createQuickPublishRuntime };
