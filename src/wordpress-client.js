const axios = require('axios');
const Logger = require('./logger');

/**
 * WordPress REST API Client
 */
class WordPressClient {
    constructor(config = {}) {
        this.axios = config.axios || axios;
        this.url = String(config.url || '').replace(/\/$/, '');
        this.userId = config.userId;
        this.appPassword = config.appPassword;
        this.apiBase = `${this.url}/wp-json/wp/v2`;

        // Basic Auth Header (Base64 encoded)
        if (this.userId && this.appPassword) {
            const token = Buffer.from(`${this.userId}:${this.appPassword}`).toString('base64');
            this.authHeader = { 'Authorization': `Basic ${token}` };
        } else {
            this.authHeader = {};
        }
    }

    /**
     * Check if the client is properly configured
     */
    isConfigured() {
        return Boolean(this.url && this.userId && this.appPassword);
    }

    /**
     * Upload an image to WordPress Media Library
     * @param {Buffer} buffer Image buffer
     * @param {string} fileName Desired file name
     * @param {string} altText Alt text for the image
     * @param {string} mimeType Image MIME type
     * @returns {Promise<Object|null>} { id, url, link }
     */
    async uploadMedia(buffer, fileName, altText = '', mimeType = 'image/jpeg') {
        if (!this.isConfigured()) return null;
        try {
            const url = `${this.apiBase}/media`;
            // 1. Upload using multipart/form-data (Node 18+ built-in)
            // This bypasses header encoding issues by putting the filename in the form-data part.
            const formData = new FormData();
            const blob = new Blob([buffer], { type: String(mimeType || 'image/jpeg') });
            formData.append('file', blob, fileName);

            const response = await this.axios.post(url, formData, {
                headers: {
                    ...this.authHeader,
                },
                timeout: 15000 // 🛡️ [Added] 타임아웃 15초
            });
            const mediaId = response.data.id;
            const mediaUrl = response.data.source_url;

            // 2. Set metadata (alt text, title, caption)
            if (altText || fileName) {
                try {
                    await this.axios.post(`${url}/${mediaId}`, {
                        alt_text: altText,
                        title: altText || fileName.split('.')[0],
                        caption: altText
                    }, {
                        headers: this.authHeader,
                        timeout: 10000 // 🛡️ [Added] 타임아웃 10초
                    });
                } catch (altErr) {
                    Logger.warn(`⚠️ WordPress 미디어 메타데이터 설정 실패: ${altErr.message}`);
                }
            }

            Logger.info(`✅ WordPress 미디어 업로드 성공: ID=${mediaId}, URL=${mediaUrl}`);
            return { id: mediaId, url: mediaUrl, link: response.data.link };
        } catch (e) {
            Logger.error(`❌ WordPress 미디어 업로드 실패: ${e.response?.data?.message || e.message}`);
            return null;
        }
    }

    /**
     * Permanently delete an uploaded media item.
     * Cleanup is best effort so callers can keep the publish result even when
     * WordPress cannot remove the temporary asset.
     * @param {number|string} mediaId WordPress media ID
     * @returns {Promise<boolean>}
     */
    async deleteMedia(mediaId) {
        const normalizedMediaId = Number.parseInt(mediaId, 10);
        if (!this.isConfigured() || !Number.isInteger(normalizedMediaId) || normalizedMediaId <= 0) {
            return false;
        }
        try {
            await this.axios.delete(`${this.apiBase}/media/${normalizedMediaId}`, {
                headers: this.authHeader,
                params: { force: true },
                timeout: 15000
            });
            Logger.info(`🧹 WordPress 임시 미디어 삭제 완료: ID=${normalizedMediaId}`);
            return true;
        } catch (e) {
            Logger.warn(`⚠️ WordPress 임시 미디어 삭제 실패 (ID=${normalizedMediaId}): ${e.response?.data?.message || e.message}`);
            return false;
        }
    }

    /**
     * Get or create a category by name
     * @param {string} categoryName 
     * @returns {Promise<number|null>} Category ID
     */
    async getOrCreateCategory(categoryName) {
        if (!this.isConfigured() || !categoryName) return null;
        const name = categoryName.trim();
        try {
            // Find existing
            const searchUrl = `${this.apiBase}/categories?search=${encodeURIComponent(name)}`;
            const searchRes = await axios.get(searchUrl, {
                headers: this.authHeader,
                timeout: 15000 // 🛡️ [Added] 타임아웃 15초
            });
            const existing = searchRes.data.find(c => c.name.toLowerCase() === name.toLowerCase());
            if (existing) return existing.id;

            // Create new
            const createUrl = `${this.apiBase}/categories`;
            const createRes = await axios.post(createUrl, { name }, {
                headers: this.authHeader,
                timeout: 15000 // 🛡️ [Added] 타임아웃 15초
            });
            Logger.info(`✅ WordPress 새 카테고리 생성: ${name} (ID=${createRes.data.id})`);
            return createRes.data.id;
        } catch (e) {
            Logger.error(`❌ WordPress 카테고리 처리 실패 (${name}): ${e.response?.data?.message || e.message}`);
            return null;
        }
    }

    /**
     * Create a new post
     * @param {Object} postData { title, content, status, categories, featured_media }
     * @returns {Promise<Object|null>} Created post object
     */
    async createPost(postData) {
        if (!this.isConfigured()) return null;
        try {
            const url = `${this.apiBase}/posts`;
            const response = await axios.post(url, postData, {
                headers: this.authHeader,
                timeout: 20000 // 🛡️ [Added] 타임아웃 20초 (포스팅은 조금 더 길게)
            });
            Logger.info(`✅ WordPress 포스팅 성공: ID=${response.data.id}, Link=${response.data.link}`);
            return response.data;
        } catch (e) {
            Logger.error(`❌ WordPress 포스팅 실패: ${e.response?.data?.message || e.message}`);
            return null;
        }
    }

    /**
     * Verify authentication and permissions
     * @returns {Promise<{success: boolean, message: string, user?: Object}>}
     */
    async verifyAuth(options = {}) {
        if (!this.isConfigured()) {
            return {
                success: false,
                configured: false,
                connected: false,
                canEdit: false,
                canPublish: false,
                message: '워드프레스 설정(URL, App ID, Password)이 누락되었습니다.'
            };
        }
        try {
            // Get current user info to verify credentials
            const url = `${this.apiBase}/users/me?context=edit`;
            const response = await this.axios.get(url, {
                headers: this.authHeader,
                timeout: 15000 // 🛡️ [Added] 타임아웃 15초
            });

            // Check if user has capability to create/publish posts
            const user = response.data;
            const capabilities = user.capabilities || {};
            const roles = Array.isArray(user.roles)
                ? user.roles.map((role) => String(role || '').trim().toLowerCase())
                : [];
            const canEdit = capabilities.edit_posts === true
                || capabilities.publish_posts === true
                || roles.some((role) => ['administrator', 'editor', 'author', 'contributor'].includes(role));
            const canPublish = capabilities.publish_posts === true
                || roles.some((role) => ['administrator', 'editor', 'author'].includes(role));
            const permissionRequired = options.requirePublish === true || options.requireEdit === true;
            const hasRequiredPermission = options.requirePublish === true
                ? canPublish
                : (options.requireEdit === true ? canEdit : true);

            if (hasRequiredPermission) {
                return {
                    success: true,
                    configured: true,
                    connected: true,
                    canEdit,
                    canPublish,
                    message: permissionRequired
                        ? `연동 및 글쓰기 권한 확인! 사용자: ${user.name || user.slug}`
                        : `연동 성공! 사용자: ${user.name || user.slug}`,
                    user: { id: user.id, name: user.name, roles: user.roles }
                };
            } else {
                return {
                    success: false,
                    configured: true,
                    connected: true,
                    canEdit,
                    canPublish,
                    message: options.requirePublish === true
                        ? `워드프레스에 연결했지만 글 게시 권한이 없습니다. (사용자: ${user.name})`
                        : `워드프레스에 연결했지만 글쓰기 권한이 없습니다. (사용자: ${user.name})`,
                    user: { id: user.id, name: user.name, roles: user.roles }
                };
            }
        } catch (e) {
            let errorMsg = e.response?.data?.message || e.message;
            // Strip HTML tags if any (WordPress sometimes returns <strong> tags)
            errorMsg = errorMsg.replace(/<[^>]*>?/gm, '');
            Logger.error(`❌ WordPress 연동 확인 실패: ${errorMsg}`);
            return {
                success: false,
                configured: true,
                connected: false,
                canEdit: false,
                canPublish: false,
                message: `연동 실패: ${errorMsg}`
            };
        }
    }

    /**
     * Get all categories from WordPress
     * @returns {Promise<Array|null>} Array of category objects
     */
    async listCategories() {
        if (!this.isConfigured()) return null;
        try {
            const url = `${this.apiBase}/categories?per_page=100&_fields=id,name,slug,count`;
            const response = await axios.get(url, {
                headers: this.authHeader,
                timeout: 15000 // 🛡️ [Added] 타임아웃 15초
            });
            return Array.isArray(response.data) ? response.data : [];
        } catch (e) {
            Logger.error(`❌ WordPress 카테고리 목록 가져오기 실패: ${e.response?.data?.message || e.message}`);
            return null;
        }
    }
}

module.exports = WordPressClient;
