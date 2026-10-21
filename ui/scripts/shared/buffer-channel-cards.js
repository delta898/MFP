const BufferChannelCards = Object.freeze({
  serviceLabels: Object.freeze({
    bluesky: 'Bluesky', threads: 'Threads', twitter: 'X', instagram: 'Instagram',
    linkedin: 'LinkedIn', facebook: 'Facebook', pinterest: 'Pinterest', mastodon: 'Mastodon',
    googlebusiness: 'Google Business Profile', startpage: 'Startpage'
  }),
  serviceMarks: Object.freeze({
    bluesky: '🦋', threads: '@', twitter: '𝕏', instagram: '◎', linkedin: 'in',
    facebook: 'f', pinterest: 'P', mastodon: 'm', googlebusiness: 'G', startpage: 'S'
  }),

  create(channel = {}, options = {}) {
    const id = String(channel.id || channel.channelId || '').trim();
    const service = String(channel.service || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const serviceLabel = this.serviceLabels[service] || String(channel.service || 'SNS').trim() || 'SNS';
    const serviceMark = this.serviceMarks[service] || serviceLabel.slice(0, 1).toUpperCase();
    const accountName = String(channel.name || channel.displayName || channel.display_name || id || '계정').trim();
    const disabled = channel.disabled === true || channel.supported === false || channel.unavailable === true || channel.compatible === false;
    const selected = options.selected === true;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = id;
    input.checked = selected;
    input.disabled = disabled || options.disabled === true;
    if (options.inputName) input.name = options.inputName;
    Object.entries(options.inputData || {}).forEach(([key, value]) => { input.dataset[key] = String(value); });

    const label = document.createElement('label');
    label.className = `buffer-channel-card ui-selectable-card${disabled ? ' is-disabled' : ''}`;
    if (options.className) label.classList.add(...String(options.className).split(/\s+/u).filter(Boolean));
    if (channel.reason) label.title = String(channel.reason);

    const avatar = document.createElement('span');
    avatar.className = `buffer-channel-avatar buffer-channel-avatar-${service || 'default'}`;
    avatar.setAttribute('aria-hidden', 'true');
    const avatarUrl = String(channel.avatar || '').trim();
    if (/^https:\/\//iu.test(avatarUrl)) {
      const image = document.createElement('img');
      image.src = avatarUrl;
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      image.onerror = () => {
        image.remove();
        avatar.textContent = serviceMark;
      };
      avatar.append(image);
    } else {
      avatar.textContent = serviceMark;
    }

    const copy = document.createElement('span');
    copy.className = 'buffer-channel-card-copy ui-selectable-card-copy';
    const platform = document.createElement('strong');
    platform.className = 'buffer-channel-platform';
    platform.textContent = serviceLabel;
    const account = document.createElement('span');
    account.className = 'buffer-channel-account';
    account.textContent = accountName;
    const metadata = document.createElement('span');
    metadata.className = 'buffer-channel-metadata';
    const details = [];
    if (Number(channel.limit) > 0) details.push(`최대 ${Number(channel.limit).toLocaleString('ko-KR')}자`);
    if (Number(channel.max_assets) > 0) details.push(`이미지 최대 ${Number(channel.max_assets)}장`);
    if (channel.image_required === true) details.push('이미지 필수');
    if (channel.compatible === false) details.push(String(channel.reason || '현재 구성 발행 불가'));
    if (disabled && channel.compatible !== false && !channel.reason) details.push('발행 불가');
    metadata.textContent = details.join(' · ');
    copy.append(platform, account);
    if (details.length) copy.append(metadata);

    label.append(input, avatar, copy);
    return label;
  },

  replace(container, channels, options = {}) {
    if (!container) return [];
    const selected = options.selected instanceof Set ? options.selected : new Set(options.selected || []);
    const cards = (Array.isArray(channels) ? channels : [])
      .map((channel) => this.create(channel, {
        ...options,
        selected: selected.has(String(channel.id || channel.channelId || '').trim())
      }));
    container.replaceChildren(...cards);
    return cards;
  }
});
