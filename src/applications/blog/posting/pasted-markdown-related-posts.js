function appendRelatedPostsToPastedMarkdown(markdown = '', relatedSection = '', stripExistingSection = null) {
    const source = String(markdown || '');
    const section = String(relatedSection || '').trim();
    if (!section) return source;

    const cleaned = typeof stripExistingSection === 'function'
        ? stripExistingSection(source)
        : source.trim();

    return `${String(cleaned || '').trim()}\n\n${section}\n`;
}

module.exports = {
    appendRelatedPostsToPastedMarkdown
};
