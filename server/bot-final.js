const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = '8206421731:AAEgsCtnpqeZ5iI8GgA_YmTGiI2s84gKMw8';
const GAME_URL = process.env.GAME_URL || 'http://localhost:8080';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

console.log('========================================');
console.log('🤖 nTonGame Bot - Ishga tushmoqda...');
console.log('========================================\n');

const bot = new TelegramBot(TOKEN, { polling: true });

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

🎮 *TON Coin Rush* o'yini xush kelibsiz!

💰 Bu o'yinda tangalarni bosib TON yig'ing
🏆 Ballar va bonuslarni oling
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
                }
            ], [
                {
                    text: '💸 Pul yechish',
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

    if (data === 'balance') {
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
    else if (data === 'wallet') {
        bot.sendMessage(chatId, `💳 Wallet ulash uchun o'yinga kiring va wallet tugmasini bosing.`);
    }
    else if (data === 'withdraw') {
        bot.sendMessage(chatId, `💸 Pul yechish uchun o'yinga kiring.`);
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
