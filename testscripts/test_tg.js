const TelegramBot = require('node-telegram-bot-api');
const CONFIG = require('../src/config-loader');
const bot = new TelegramBot(CONFIG.NOTIFY_TELEGRAM_BOT_TOKEN, { polling: true });
bot.on('message', (msg) => {
    console.log('Received message:', msg);
});
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
});
console.log('Bot started polling...');
