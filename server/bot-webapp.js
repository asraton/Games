const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = '8206421731:AAEjI_gcmJpJwidDVip86oYQlPcKBlfTQE4';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';
const GAME_URL = process.env.GAME_URL || 'http://localhost:8080';

console.log('========================================');
console.log('🤖 nTonGame Bot - Ishga tushmoqda...');
console.log('========================================\n');
console.log('⚠️ Eslatma: Web App ishlashi uchun public URL kerak!');
console.log('   ngrok ishlating: npx ngrok http 8080\n');

const bot = new TelegramBot(TOKEN, { polling: true });

// Bot ma'lumotlari
bot.getMe().then((botInfo) => {
    console.log('✅ Bot ulangan!');
    console.log('   Username:', botInfo.username);
    console.log('   ID:', bot.id);
    console.log('\n🎮 Bot tayyor! Telegramda /start bosing\n');
}).catch((err) => {
    console.error('❌ Bot ulanmadi:', err.message);
});

// /start komandasi - Web App tugmasi bilan
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    
    console.log('✅ /start qabul qilindi!');
    console.log('   User:', user.first_name);
    console.log('   Chat ID:', chatId);
    
    const welcomeMessage = `👋 Salom, ${user.first_name}!

🎮 *TON Coin Rush* - TON Coin yig'ish o'yini!

💰 Tangalarni bosib TON yig'ing
🏆 Bonuslar va mukofotlar
💸 Haqiqiy TON yechib olish

⬇️ O'ynash uchun tugmani bosing:`;

    // Web App tugmasi - bu mini ilova sifatida ochiladi
    const keyboard = {
        reply_markup: {
            inline_keyboard: [[
                {
                    text: '🎮 O\'ynash (Web App)',
                    web_app: { 
                        url: `${GAME_URL}?userId=${user.id}&username=${user.username || ''}` 
                    }
                }
            ], [
                {
                    text: '🔗 Brauzerda ochish',
                    url: `${GAME_URL}?userId=${user.id}`
                }
            ], [
                {
                    text: '📊 Balansim',
                    callback_data: `balance_${user.id}`
                },
                {
                    text: '❓ Yordam',
                    callback_data: 'help'
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

    if (data.startsWith('balance_')) {
        try {
            const response = await axios.get(`${API_BASE_URL}/user/${userId}`);
            const userData = response.data;
            
            if (userData.success) {
                const message = `📊 *Sizning balansingiz*

💰 TON: ${userData.user.balance.toFixed(4)} TON
💎 Jetton: ${userData.user.jettonBalance.toLocaleString()} 💎

🏦 Deposit adressi:
\`${userData.user.depositAddress}\`

📌 TON yuboring va o'ynang!`;

                const keyboard = {
                    reply_markup: {
                        inline_keyboard: [[
                            {
                                text: '🎮 O\'ynash',
                                web_app: { url: `${GAME_URL}?userId=${userId}` }
                            }
                        ]]
                    },
                    parse_mode: 'Markdown'
                };

                bot.sendMessage(chatId, message, keyboard);
            } else {
                bot.sendMessage(chatId, '⚠️ Avval o\'yinga kiring va wallet ulang!');
            }
        } catch (e) {
            console.error('Balance error:', e.message);
            bot.sendMessage(chatId, '⚠️ Avval o\'yinga kiring va wallet ulang!');
        }
    }
    else if (data === 'help') {
        const helpMessage = `❓ *Yordam*

*Qanday o'ynayman?*
1️⃣ O\'yinni oching
2️⃣ Tangalarni tez bosib TON yig'ing
3️⃣ Bonuslarni qo'ldan qo'ymang
4️⃣ Jetton sotib oling

*Wallet qanday ulash?*
📱 O\'yin ichidagi Wallet tugmasini bosing
🔗 Tonkeeper/MyTonWallet tanlang
✅ Tasdiqlang

*Pul qanday yechaman?*
💸 Wallet bo'limida "Pul yechib olish" ni bosing
📋 Adres va miqdorni kiriting

🔰 *Bot*: @nTonGamebot`;

        bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
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

console.log('Bot ishlamoqda...\n');
console.log('💡 Eslatma: Web App ishlashi uchun public URL kerak.');
console.log('   Lokal test uchun ngrok ishlating:');
console.log('   npx ngrok http 8080\n');
