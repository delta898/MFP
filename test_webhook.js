const axios = require('axios');
const CONFIG = require('./src/config-loader');
const token = CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN;
axios.get(`https://api.telegram.org/bot${token}/getWebhookInfo`)
  .then(res => console.log('Webhook Info:', JSON.stringify(res.data.result, null, 2)))
  .catch(err => console.error('Error:', err.message));
