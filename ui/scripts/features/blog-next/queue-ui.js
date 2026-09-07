let blogNextQueueHasLoaded = false;

function activateBlogNextManagementTab(tabName) {
  const target = tabName === 'saved' ? 'saved' : 'ready';
  blogNextActiveManagementTab = target;
  document.querySelectorAll('[data-blog-next-management-tab]').forEach((button) => {
    const active = button.dataset.blogNextManagementTab === target;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('[data-blog-next-management-panel]').forEach((panel) => {
    const active = panel.dataset.blogNextManagementPanel === target;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

function handleBlogNextManagementTabKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const buttons = Array.from(document.querySelectorAll('[data-blog-next-management-tab]'));
  const currentIndex = buttons.indexOf(event.currentTarget);
  if (currentIndex < 0 || buttons.length === 0) return;
  event.preventDefault();
  let targetIndex = currentIndex;
  if (event.key === 'Home') targetIndex = 0;
  if (event.key === 'End') targetIndex = buttons.length - 1;
  if (event.key === 'ArrowLeft') targetIndex = (currentIndex - 1 + buttons.length) % buttons.length;
  if (event.key === 'ArrowRight') targetIndex = (currentIndex + 1) % buttons.length;
  const targetButton = buttons[targetIndex];
  activateBlogNextManagementTab(targetButton.dataset.blogNextManagementTab);
  targetButton.focus();
}

function renderBlogNextEmptyState(list, title, message, state = 'empty') {
  const empty = document.createElement('div');
  empty.className = `blog-next-empty-state${state === 'error' ? ' has-error' : ''}`;
  const strong = document.createElement('strong');
  strong.textContent = title;
  empty.appendChild(strong);
  if (message) {
    const copy = document.createElement('p');
    copy.textContent = message;
    empty.appendChild(copy);
  }
  list.appendChild(empty);
}

function setBlogNextManagementStatus(state, message = '') {
  const status = document.getElementById('blog-next-management-status');
  if (!status) return;
  status.dataset.state = state;
  status.textContent = message;
  status.hidden = !message;
}

function setBlogNextQueueListsBusy(busy) {
  ['blog-next-queue-list', 'blog-next-saved-list'].forEach((id) => {
    document.getElementById(id)?.setAttribute('aria-busy', busy ? 'true' : 'false');
  });
}

function renderBlogNextQueueInitialError(message) {
  if (blogNextQueueHasLoaded) return;
  ['blog-next-queue-list', 'blog-next-saved-list'].forEach((id) => {
    const list = document.getElementById(id);
    if (!list) return;
    list.dataset.state = 'error';
    list.replaceChildren();
    renderBlogNextEmptyState(list, '글감 목록을 불러오지 못했습니다.', message || '새로고침으로 다시 시도해 주세요.', 'error');
  });
}
