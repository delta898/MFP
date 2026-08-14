const ARTIFACT_FEEDBACK_DOMAIN = Object.freeze({
    content_idea: 'blog',
    topic: 'blog',
    shopping_item: 'shopping'
});

function resolveArtifactFeedbackTarget(artifact = {}) {
    const artifactType = String(artifact.artifact_type || artifact.artifactType || '').trim().toLowerCase();
    const domain = ARTIFACT_FEEDBACK_DOMAIN[artifactType] || '';
    if (!domain) return null;
    return {
        domain,
        entity_ref: String(artifact.id || '').trim(),
        subject: String(artifact.title || artifact.summary || '').trim(),
        artifact_type: artifactType
    };
}

module.exports = {
    ARTIFACT_FEEDBACK_DOMAIN,
    resolveArtifactFeedbackTarget
};
