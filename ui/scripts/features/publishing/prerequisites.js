async function checkPublishPrerequisites(targets) {
  const selectedTargets = Array.isArray(targets) ? targets : [];
  if (selectedTargets.length === 0) {
    return { ok: false, message: '발행 대상을 1개 이상 선택해 주세요.' };
  }

  let fields;
  try {
    const settings = await fetchJson('/api/v1/settings/core-connections');
    fields = settings?.fields || {};
  } catch (error) {
    return { ok: false, message: `발행 설정을 확인하지 못했습니다: ${error.message}` };
  }

  if (selectedTargets.includes('naver') && !String(fields.NAVER_ID || '').trim()) {
    return { ok: false, message: '네이버 블로그 아이디를 설정에서 입력해 주세요.' };
  }
  if (selectedTargets.includes('wordpress') && (
    !String(fields.WORDPRESS_URL || '').trim()
    || !String(fields.WORDPRESS_USER_ID || '').trim()
    || fields.WORDPRESS_APP_PASSWORD_CONFIGURED !== true
  )) {
    return { ok: false, message: '워드프레스 주소, 사용자 이름, 애플리케이션 비밀번호를 설정에서 확인해 주세요.' };
  }
  return { ok: true };
}
