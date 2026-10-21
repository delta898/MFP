const settingsNextPluginsState = {
  loading: false,
  plugins: [],
  selectedId: '',
  detailRequestId: 0
};

function settingsNextPluginStateLabel(state) {
  return ({
    not_loaded: ['Host 미등록', 'neutral'],
    enabled: ['사용 가능', 'success'],
    disabled: ['비활성', 'warning'],
    disabling: ['비활성화 중', 'warning']
  })[state] || ['상태 확인 필요', 'neutral'];
}

function settingsNextPluginSetFeedback(message = '', tone = 'neutral') {
  const feedback = document.getElementById('settings-next-plugins-feedback');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.dataset.tone = tone;
  feedback.hidden = !message;
}

function settingsNextPluginRenderList() {
  const root = document.getElementById('settings-next-plugin-list');
  if (!root) return;
  root.replaceChildren();
  if (!settingsNextPluginsState.plugins.length) {
    const empty = document.createElement('p');
    empty.className = 'ui-settings-card-detail';
    empty.textContent = '등록된 Core Plugin이 없습니다.';
    root.append(empty);
    return;
  }

  settingsNextPluginsState.plugins.forEach((plugin) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-next-plugin-choice';
    button.dataset.pluginId = plugin.id;
    button.setAttribute('aria-pressed', plugin.id === settingsNextPluginsState.selectedId ? 'true' : 'false');
    const copy = document.createElement('span');
    copy.className = 'settings-next-plugin-choice-copy';
    const name = document.createElement('strong');
    name.textContent = plugin.name;
    const version = document.createElement('small');
    version.textContent = plugin.version ? `v${plugin.version}` : '버전 정보 없음';
    copy.append(name, version);
    const [label, tone] = settingsNextPluginStateLabel(plugin.state);
    const status = document.createElement('span');
    status.className = 'ui-status-badge';
    status.dataset.state = tone;
    status.textContent = label;
    button.append(copy, status);
    button.addEventListener('click', () => void settingsNextPluginSelect(plugin.id));
    root.append(button);
  });
}

function settingsNextPluginRenderDetail(plugin) {
  const root = document.getElementById('settings-next-plugin-detail');
  if (!root) return;
  root.replaceChildren();
  if (!plugin) {
    const message = document.createElement('p');
    message.className = 'ui-settings-card-detail';
    message.textContent = '선택한 Plugin 정보를 불러오지 못했습니다.';
    root.append(message);
    return;
  }

  const heading = document.createElement('div');
  heading.className = 'ui-settings-card-heading';
  const titleGroup = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = plugin.name;
  const identity = document.createElement('p');
  identity.textContent = `${plugin.id}${plugin.version ? ` · v${plugin.version}` : ''}`;
  titleGroup.append(title, identity);
  const [stateLabel, stateTone] = settingsNextPluginStateLabel(plugin.state);
  const status = document.createElement('span');
  status.className = 'ui-status-badge';
  status.dataset.state = stateTone;
  status.textContent = stateLabel;
  heading.append(titleGroup, status);
  root.append(heading);

  const summary = document.createElement('p');
  summary.className = 'ui-settings-card-detail';
  summary.textContent = plugin.summary || '설명 정보가 등록되지 않았습니다.';
  root.append(summary);

  if (plugin.state === 'not_loaded') {
    const note = document.createElement('p');
    note.className = 'ui-settings-card-detail settings-next-plugin-runtime-note';
    note.textContent = '현재 공용 Host에 아직 등록되지 않았습니다. 새 Plugin 실행 경로에 연결되기 전 상태이며 오류를 뜻하지 않습니다.';
    root.append(note);
  }

  const operationsHeading = document.createElement('h4');
  operationsHeading.className = 'settings-next-plugin-section-title';
  operationsHeading.textContent = '제공 operation';
  root.append(operationsHeading);
  const operations = document.createElement('ul');
  operations.className = 'settings-next-plugin-operations';
  (Array.isArray(plugin.operations) ? plugin.operations : []).forEach((operation) => {
    const item = document.createElement('li');
    const operationName = document.createElement('strong');
    operationName.textContent = operation.id;
    const description = document.createElement('p');
    description.textContent = operation.description;
    item.append(operationName, description);
    operations.append(item);
  });
  if (!operations.childElementCount) {
    const item = document.createElement('li');
    item.textContent = '등록된 operation이 없습니다.';
    operations.append(item);
  }
  root.append(operations);
}

async function settingsNextPluginSelect(pluginId) {
  const id = String(pluginId || '').trim();
  if (!id) return;
  settingsNextPluginsState.selectedId = id;
  settingsNextPluginRenderList();
  const requestId = ++settingsNextPluginsState.detailRequestId;
  const detail = document.getElementById('settings-next-plugin-detail');
  detail?.setAttribute('aria-busy', 'true');
  try {
    const result = await fetchJson(`/api/v1/plugins/core/${encodeURIComponent(id)}`);
    if (requestId !== settingsNextPluginsState.detailRequestId) return;
    settingsNextPluginRenderDetail(result?.plugin || null);
  } catch (error) {
    if (requestId === settingsNextPluginsState.detailRequestId) {
      settingsNextPluginSetFeedback(error.message || 'Plugin 상세 정보를 불러오지 못했습니다.', 'danger');
    }
  } finally {
    if (requestId === settingsNextPluginsState.detailRequestId) detail?.setAttribute('aria-busy', 'false');
  }
}

async function settingsNextPluginsLoad() {
  if (settingsNextPluginsState.loading) return;
  settingsNextPluginsState.loading = true;
  const browser = document.querySelector('.settings-next-plugin-browser');
  browser?.setAttribute('aria-busy', 'true');
  settingsNextPluginSetFeedback('Core Plugin 정보를 불러오는 중…');
  try {
    const result = await fetchJson('/api/v1/plugins/core');
    const plugins = Array.isArray(result?.plugins) ? result.plugins : [];
    settingsNextPluginsState.plugins = plugins;
    settingsNextPluginSetFeedback(`${plugins.length}개 Core Plugin`, 'success');
    if (!plugins.some((plugin) => plugin.id === settingsNextPluginsState.selectedId)) {
      settingsNextPluginsState.selectedId = plugins[0]?.id || '';
    }
    settingsNextPluginRenderList();
    if (settingsNextPluginsState.selectedId) await settingsNextPluginSelect(settingsNextPluginsState.selectedId);
    else settingsNextPluginRenderDetail(null);
  } catch (error) {
    settingsNextPluginSetFeedback(error.message || 'Core Plugin 정보를 불러오지 못했습니다.', 'danger');
    if (!settingsNextPluginsState.loaded) settingsNextPluginRenderList();
  } finally {
    settingsNextPluginsState.loading = false;
    browser?.setAttribute('aria-busy', 'false');
  }
}
