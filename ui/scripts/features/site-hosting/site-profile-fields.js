const SITE_PROFILE_IMAGE_LABELS = Object.freeze({
  logo: '로고',
  'share-image': '사이트 대표 이미지',
  favicon: 'Favicon'
});
const SITE_PROFILE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

function siteHostingReadProfileImage(file, label = '이미지') {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > SITE_PROFILE_IMAGE_MAX_BYTES) {
      return reject(new Error(`PNG, JPG 또는 WebP ${label}를 3MB 이하로 선택해 주세요.`));
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`${label} 이미지를 읽지 못했습니다.`));
    reader.readAsDataURL(file);
  });
}

function siteHostingSetProfileImagePreview(options = {}) {
  const { imageId, emptyId, chooseButton, removeButton, dataUrl = '' } = options;
  const image = document.getElementById(imageId);
  const empty = document.getElementById(emptyId);
  const choose = document.querySelector(chooseButton);
  const remove = document.querySelector(removeButton);
  if (image) {
    if (dataUrl) image.src = dataUrl;
    else image.removeAttribute('src');
    image.hidden = !dataUrl;
  }
  if (empty) empty.hidden = Boolean(dataUrl);
  if (choose) choose.textContent = dataUrl ? '이미지 변경' : '이미지 선택';
  if (remove) remove.hidden = !dataUrl;
}
