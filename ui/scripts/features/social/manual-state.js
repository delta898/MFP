let manualSnsConfig = { configured: false, local_media_available: null, channels: [], ai: { available: false, model_name: '' } };
let manualSnsConfigLoading = false;
let manualSnsOptimizationSnapshot = null;
let manualSnsOptimizationInFlight = false;
let manualSnsLocalImages = [];
const MANUAL_SNS_SELECTED_CHANNELS_STORAGE_KEY = 'manual_sns_selected_channel_ids_v1';
const DEFAULT_BUFFER_HELP_URL = 'https://m.blog.naver.com/amadejjs/223940980574';
