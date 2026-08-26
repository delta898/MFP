async function fetchJson(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const body = await readJsonResponseSafely(res);
    if (!res.ok || !body.success) {
      console.error(`❌ API Fetch Error (${url}):`, body);
      const err = new Error(body?.error?.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.code = body?.error?.code || '';
      err.method = 'GET';
      err.url = url;
      notifyUiIssueFromError(err, { method: 'GET', url });
      throw err;
    }
    return body.data;
  } catch (e) {
    console.error(`❌ Network or Parse Error (${url}):`, e);
    throw e;
  }
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  const body = await readJsonResponseSafely(res);
  if (!res.ok || !body.success) {
    const err = new Error(body?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = body?.error?.code || '';
    err.method = 'POST';
    err.url = url;
    notifyUiIssueFromError(err, { method: 'POST', url });
    throw err;
  }
  return body.data;
}

async function putJson(url, payload) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  const body = await readJsonResponseSafely(res);
  if (!res.ok || !body.success) {
    const err = new Error(body?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = body?.error?.code || '';
    err.method = 'PUT';
    err.url = url;
    notifyUiIssueFromError(err, { method: 'PUT', url });
    throw err;
  }
  return body.data;
}

async function readJsonResponseSafely(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    console.warn('Failed to parse JSON response:', e.message);
    return {};
  }
}
