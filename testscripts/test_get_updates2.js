const axios = require('axios');
const CONFIG = require('../src/host/configuration/runtime-config');
const token = CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN;
axios.get(`https://api.telegram.org/bot${token}/getUpdates`)
  .then(res => console.log('Updates:', JSON.stringify(res.data.result, null, 2)))
  .catch(err => console.error('Error:', err.message));
