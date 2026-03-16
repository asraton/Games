const TelegramBot = require('node-telegram-bot-api');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
// GAME_URL - Railway URL (backend + frontend together)
const GAME_URL = (process.env.GAME_URL || 'https://asracoin.up.railway.app').trim();
// WEBHOOK_URL - Backend URL, Telegram sends updates here
const WEBHOOK_URL = (process.env.WEBHOOK_URL || 'https://asracoin.up.railway.app/bot-webhook').trim();

const useWebhook = process.env.USE_WEBHOOK === 'true';

function initBot(app) {
    if (!TOKEN) {
        console.error('❌ TELEGRAM_BOT_TOKEN not found!');
        return null;
    }

    let bot;
    if (useWebhook && app) {
        console.log('🔗 Webhook mode');
        bot = new TelegramBot(TOKEN);
        app.post('/bot-webhook', (req, res) => {
            bot.processUpdate(req.body);
            res.sendStatus(200);
        });
    } else {
        console.log('📡 Polling mode');
        bot = new TelegramBot(TOKEN, { polling: true });
    }

    if (useWebhook && WEBHOOK_URL) {
        bot.setWebHook(WEBHOOK_URL).catch(err => console.error('Webhook error:', err.message));
    }

    console.log('🔗 GAME_URL:', GAME_URL);

    bot.getMe().then((botInfo) => {
        console.log('✅ Bot connected:', botInfo.username);
    }).catch((err) => console.error('❌ Bot connection failed:', err.message));

    bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    
    console.log('✅ /start received!');
    console.log('   User:', user.first_name);
    console.log('   Chat ID:', chatId);
    
    const welcomeMessage = `👋 Hello, ${user.first_name}!

🎮 *Welcome to ASRA Coin game!*

💰 Click coins to collect ASRA in this game
💸 Withdraw collected TON

⬇️ Click the button to play:`;

    // Add user first and last name to URL
    const firstName = encodeURIComponent(user.first_name || '');
    const lastName = encodeURIComponent(user.last_name || '');
    const gameUrl = `${GAME_URL}?userId=${user.id}&firstName=${firstName}&lastName=${lastName}`;

    const keyboard = {
        reply_markup: {
            inline_keyboard: [[
                {
                    text: '🎮 Play',
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

console.log('🤖 Bot started');
return bot;
}

module.exports = { initBot };
