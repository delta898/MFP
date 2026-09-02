function createBlogNextPublishPreflightError(message, code = '') {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function preflightBlogNextPublishTargets(options = {}) {
  const selected = Array.isArray(options.platforms) ? options.platforms : [];
  if (selected.includes('naver')) {
    if (typeof uiNaverReady !== 'undefined' && uiNaverReady !== true) {
      throw createBlogNextPublishPreflightError('네이버 설정 후 다시 시도해 주세요.', 'NAVER_NOT_CONFIGURED');
    }
    let session;
    try {
      session = await fetchJson('/api/v1/session/naver?force=true');
    } catch (_error) {
      throw createBlogNextPublishPreflightError('네이버 로그인 후 다시 시도해 주세요.', 'NAVER_SESSION_CHECK_FAILED');
    }
    if (session?.valid !== true) {
      throw createBlogNextPublishPreflightError('네이버 로그인 후 다시 시도해 주세요.', 'NAVER_SESSION_INVALID');
    }
  }

  if (selected.includes('wordpress')) {
    if (typeof uiWpReady !== 'undefined' && uiWpReady !== true) {
      throw createBlogNextPublishPreflightError('워드프레스 설정 후 다시 시도해 주세요.', 'WORDPRESS_NOT_CONFIGURED');
    }
    let verification;
    try {
      verification = await postJson('/api/v1/session/wordpress-verify', {
        postStatus: String(options.postStatus || 'publish')
      });
    } catch (_error) {
      throw createBlogNextPublishPreflightError('워드프레스 연결을 확인한 후 다시 시도해 주세요.', 'WORDPRESS_VERIFY_FAILED');
    }
    if (verification?.success !== true) {
      throw createBlogNextPublishPreflightError('워드프레스 연결을 확인한 후 다시 시도해 주세요.', 'WORDPRESS_CONNECTION_INVALID');
    }
  }

  return { ok: true, platforms: selected.slice() };
}
