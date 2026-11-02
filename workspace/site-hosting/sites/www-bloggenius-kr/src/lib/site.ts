import rawSite from '../../site-data/site.json';

const defaults = {
  displayName: 'BlogGenius',
  seoDescription: '아이디어를 콘텐츠로 발전시키는 데스크톱 앱, BlogGenius.',
  searchEngineIndexing: true,
  navigation: [{ id: 'home', label: '홈', path: '/' }],
  logo: '',
  shareImage: '',
  favicon: '',
  project: { tagline: '', introduction: '' },
};

export const siteData = {
  ...defaults,
  ...rawSite,
  navigation: Array.isArray(rawSite.navigation) ? rawSite.navigation : defaults.navigation,
  project: { ...defaults.project, ...(rawSite.project || {}) },
};

export const navigationItems = siteData.navigation;
export const legalNavigation = [
  { label: '개인정보 처리방침', path: '/privacy-policy/' },
  { label: '이용약관', path: '/terms/' },
];
export const publicOrigin = 'https://www.bloggenius.kr';

export function pageTitle(id) {
  return ({
    features: '기능', download: '다운로드', guides: '가이드',
    trends: '네이버 트렌드 조회', 'trends-subscribe': '네이버 트렌드 구독',
    changelog: '변경내역', support: '지원',
    'privacy-policy': '개인정보 처리방침', terms: '이용약관',
  })[id] || siteData.displayName;
}
