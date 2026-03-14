const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
// GAME_URL - Vercel frontend URL bo'lishi kerak (Railway emas!)
const GAME_URL = (process.env.GAME_URL || 'https://n-ton-games.vercel.app').trim();
const API_BASE_URL = (process.env.API_BASE_URL || `${GAME_URL}/api`).trim();
const WEBHOOK_URL = (process.env.WEBHOOK_URL || `${GAME_URL}/bot-webhook`).trim();

// Store pending wallet connections
const pendingConnections = new Map();

console.log('🔗 GAME_URL:', GAME_URL);
console.log('🔗 API_BASE_URL:', API_BASE_URL);

if (!TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN topilmadi! Railway variables ga qo\'shing');
    process.exit(1);
}

console.log('========================================');
console.log('🤖 nTonGame Bot - Ishga tushmoqda...');
console.log('========================================\n');

// Webhook uchun sozlash (Railway'da polling o'rniga webhook ishlatiladi)
const useWebhook = process.env.USE_WEBHOOK === 'true';

let bot;
if (useWebhook && WEBHOOK_URL) {
    console.log('🔗 Webhook rejimi');
    bot = new TelegramBot(TOKEN, { webHook: { port: process.env.BOT_PORT || 8081 } });
    bot.setWebHook(WEBHOOK_URL);
} else {
    console.log('📡 Polling rejimi');
    bot = new TelegramBot(TOKEN, { polling: true });
}

// Bot ma'lumotlari
bot.getMe().then((botInfo) => {
    console.log('✅ Bot ulangan!');
    console.log('   Username:', botInfo.username);
    console.log('   ID:', botInfo.id);
    console.log('\n🎮 Bot tayyor! Telegramda /start bosing\n');
}).catch((err) => {
    console.error('❌ Bot ulanmadi:', err.message);
});

// /start komandasi
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
                    callback_data: 'wallet'
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

    if (data === 'wallet') {
        // Generate unique connection ID
        const connectId = `tonconnect_${userId}_${Date.now()}`;
        
        // Store connection pending in temporary storage
        pendingConnections.set(connectId, {
            userId: userId,
            chatId: chatId,
            timestamp: Date.now()
        });
        
        const walletKeyboard = {
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: '💰 Tonkeeper',
                        url: `https://app.tonkeeper.com/ton-connect?clientId=${connectId}&manifestUrl=${encodeURIComponent(GAME_URL + '/tonconnect-manifest.json')}`
                    }
                ], [
                    {
                        text: '💎 Telegram Wallet',
                        url: `https://t.me/wallet?startattach=tonconnect_${userId}`
                    },
                    {
                        text: '🌐 MyTonWallet',
                        url: `https://connect.mytonwallet.org/?clientId=${connectId}&manifestUrl=${encodeURIComponent(GAME_URL + '/tonconnect-manifest.json')}`
                    }
                ], [
                    {
                        text: '⬅️ Orqaga',
                        callback_data: 'back_to_main'
                    }
                ]]
            },
            parse_mode: 'Markdown'
        };
        
        bot.sendMessage(chatId, `💳 *Wallet ulash*\n\nWalletni tanlang va o'yinga ulang:\n\n✅ Wallet ochiladi\n✅ "Connect" tugmasini bosing\n✅ Wallet o'yinga ulanadi`, walletKeyboard);
        
        // Clean up old pending connections after 5 minutes
        setTimeout(() => {
            pendingConnections.delete(connectId);
        }, 300000);
    }
    else if (data === 'back_to_main') {
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
                        callback_data: 'wallet'
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

console.log('Bot ishlamoqda...');
