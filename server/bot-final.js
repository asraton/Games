const TelegramBot = require('node-telegram-bot-api');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
// GAME_URL - Railway URL (backend + frontend birga)
const GAME_URL = (process.env.GAME_URL || 'https://asra-production.up.railway.app').trim();
// API_BASE_URL - Backend API URL
const API_BASE_URL = (process.env.API_BASE_URL || 'https://asra-production.up.railway.app/api').trim();
// WEBHOOK_URL - Backend URL, Telegram shu yerga yuboradi
const WEBHOOK_URL = (process.env.WEBHOOK_URL || 'https://asra-production.up.railway.app/bot-webhook').trim();

const useWebhook = process.env.USE_WEBHOOK === 'true';

function initBot(app) {
    if (!TOKEN) {
        console.error('❌ TELEGRAM_BOT_TOKEN topilmadi!');
        return null;
    }

    let bot;
    if (useWebhook && app) {
        console.log('🔗 Webhook rejimi');
        bot = new TelegramBot(TOKEN);
        app.post('/bot-webhook', (req, res) => {
            bot.processUpdate(req.body);
            res.sendStatus(200);
        });
    } else {
        console.log('📡 Polling rejimi');
        bot = new TelegramBot(TOKEN, { polling: true });
    }

    if (useWebhook && WEBHOOK_URL) {
        bot.setWebHook(WEBHOOK_URL).catch(err => console.error('Webhook xato:', err.message));
    }

    console.log('🔗 GAME_URL:', GAME_URL);
    console.log('🔗 API_BASE_URL:', API_BASE_URL);

    bot.getMe().then((botInfo) => {
        console.log('✅ Bot ulangan:', botInfo.username);
    }).catch((err) => console.error('❌ Bot ulanmadi:', err.message));

    bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    
    console.log('✅ /start qabul qilindi!');
    console.log('   User:', user.first_name);
    console.log('   Chat ID:', chatId);
    
    const welcomeMessage = `👋 Salom, ${user.first_name}!

🎮 *ASRA Coin o'yini xush kelibsiz!*

💰 Bu o'yinda tangalarni bosib ASRA yig'ing
💸 Yig'ilgan TONlarni yechib oling

⬇️ O'ynash uchun tugmani bosing:`;

    // Foydalanuvchi ismi va familiyasini URL ga qo'shish
    const firstName = encodeURIComponent(user.first_name || '');
    const lastName = encodeURIComponent(user.last_name || '');
    const gameUrl = `${GAME_URL}?userId=${user.id}&firstName=${firstName}&lastName=${lastName}`;

    const keyboard = {
        reply_markup: {
            inline_keyboard: [[
                {
                    text: '🎮 O\'ynash',
                    web_app: { url: gameUrl }
                }
            ]]
        },
        parse_mode: 'Markdown'
    };

    bot.sendMessage(chatId, welcomeMessage, keyboard);
});

// Error handling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
});

bot.on('error', (error) => {
    console.error('Bot error:', error.message);
});

console.log('🤖 Bot ishga tushdi');
return bot;
}

module.exports = { initBot };
