let blogActiveTab = 'quick';
let shoppingActiveTab = 'quick';
let settingsActiveTab = 'general';
let quickInputMode = ['ai', 'manuscript', 'pasted'].includes(localStorage.getItem('quick_input_mode'))
  ? localStorage.getItem('quick_input_mode')
  : 'ai';
const createLocalMarkdownPreviewState = () => ({
  folderLabel: '',
  selectedFiles: [],
  selectedFilesPayload: [],
  imageObjectUrls: {},
  data: null
});
let quickManuscriptPreviewState = createLocalMarkdownPreviewState();
let quickPastedPreviewState = createLocalMarkdownPreviewState();
let quickGeneratedPreviewState = {
  previewId: '',
  rowIndex: null,
  rowNumber: null,
  primaryTarget: '',
  targets: [],
  activeTarget: '',
  previews: {}
};
let quickTrendTopicContext = null;
let quickRecommendationTopicContext = null;
const quickTopicRecommendationState = {
  items: [],
  loaded: false,
  loading: false,
  error: '',
  query: '',
  smartUsageSessionId: ''
};
const quickKeywordDiscoveryState = {
  analysis: null,
  loaded: false,
  loading: false,
  error: '',
  selectedKeywordKeys: [],
  smartUsageSessionId: ''
};
const trendPostingState = {
  meta: null,
  items: [],
  itemsById: new Map(),
  savedIds: new Set(),
  recentTopicKeys: new Set(),
  recentTopicsLoaded: false,
  recentTopicsLoading: false,
  queryRange: null,
  loading: false
};
