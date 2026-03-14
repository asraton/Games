const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
// GAME_URL - Vercel frontend URL
const GAME_URL = (process.env.GAME_URL || 'https://n-ton-games.vercel.app').trim();
// API_BASE_URL - Backend (Railway) URL
const API_BASE_URL = (process.env.API_BASE_URL || `${GAME_URL}/api`).trim();
// WEBHOOK_URL - Backend URL, Telegram shu yerga yuboradi
const WEBHOOK_URL = (process.env.WEBHOOK_URL || API_BASE_URL.replace(/\/api$/, '') + '/bot-webhook').trim();

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

🎮 *TON Coin o'yini xush kelibsiz!*

💰 Bu o'yinda tangalarni bosib TON yig'ing
💸 Yig'ilgan TONlarni yechib oling

⬇️ O'ynash uchun tugmani bosing:`;

    const keyboard = {
        reply_markup: {
            inline_keyboard: [[
                {
                    text: '🎮 O\'ynash',
                    web_app: { url: `${GAME_URL}?userId=${user.id}` }
                }
            ], [
                {
                    text: '💰 Wallet ulash',
                    web_app: { url: `${GAME_URL}?userId=${user.id}` }
                },
                {
                    text: '📊 Balans',
                    callback_data: 'balance'
                },
                {
                    text: '💸 TON yechish',
                    callback_data: 'withdraw'
                }
            ]]
        },
        parse_mode: 'Markdown'
    };

    bot.sendMessage(chatId, welcomeMessage, keyboard);
});

// Callback queries
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const userId = query.from.id;

    console.log('Callback:', data);

    // Wallet now uses direct URL button - no callback needed
    if (data === 'back_to_main') {
        // Re-send main menu
        const mainKeyboard = {
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: '🎮 O\'ynash',
                        web_app: { url: `${GAME_URL}?userId=${userId}` }
                    }
                ], [
                    {
                        text: '💰 Wallet ulash',
                        web_app: { url: `${GAME_URL}?userId=${userId}` }
                    },
                    {
                        text: '📊 Balans',
                        callback_data: 'balance'
                    },
                    {
                        text: '💸 TON yechish',
                        callback_data: 'withdraw'
                    }
                ]]
            },
            parse_mode: 'Markdown'
        };
        bot.sendMessage(chatId, `👋 *Asosiy menyu*`, mainKeyboard);
    }
    else if (data === 'balance') {
        try {
            const response = await axios.get(`${API_BASE_URL}/user/${userId}`);
            const userData = response.data;
            
            if (userData.success) {
                const message = `📊 *Balans*

💰 TON: ${userData.user.balance.toFixed(4)} TON
💎 Jetton: ${userData.user.jettonBalance.toLocaleString()} 💎`;
                bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            } else {
                bot.sendMessage(chatId, '⚠️ Avval wallet ulang!');
            }
        } catch (e) {
            bot.sendMessage(chatId, '⚠️ Avval wallet ulang!');
        }
    }
    else if (data === 'withdraw') {
        bot.sendMessage(chatId, `💸 TON yechish uchun o'yinga kiring.`);
    }
    
    bot.answerCallbackQuery(query.id);
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
