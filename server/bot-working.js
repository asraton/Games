const TelegramBot = require('node-telegram-bot-api');

const TOKEN = '8206421731:AAEjI_gcmJpJwidDVip86oYQlPcKBlfTQE4';
const GAME_URL = process.env.GAME_URL || 'http://localhost:8080';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

// Store pending wallet connections
const pendingConnections = new Map();

console.log('========================================');
console.log('🤖 nTonGame Bot - Real TON Version');
console.log('========================================');
console.log('Token:', TOKEN.substring(0, 15) + '...');
console.log('Game URL:', GAME_URL);
console.log('API URL:', API_BASE_URL);
console.log('========================================\n');

try {
    const bot = new TelegramBot(TOKEN, { 
        polling: { 
            interval: 3000,
            autoStart: true,
            params: { timeout: 10 }
        }
    });

    // Bot ma'lumotlarini olish
    bot.getMe().then((botInfo) => {
        console.log('✅ Bot ulangan!');
        console.log('   Username:', botInfo.username);
        console.log('   ID:', botInfo.id);
        console.log('   Is Bot:', botInfo.is_bot);
        console.log('\n🎮 Bot tayyor! Telegramda /start bosing\n');
    }).catch((err) => {
        console.error('❌ Bot ulanmadi:', err.message);
    });

    // /start komandasi
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const user = msg.from;
        
        console.log('✅ /start qabul qilindi!');
        console.log('   User:', user.first_name, user.last_name || '');
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
                        callback_data: `wallet_${user.id}`
                    },
                    {
                        text: '📊 Balans',
                        callback_data: `balance_${user.id}`
                    }
                ], [
                    {
                        text: '💸 TON yechish',
                        callback_data: `withdraw_${user.id}`
                    },

                ]]
            },
            parse_mode: 'Markdown'
        };

        bot.sendMessage(chatId, welcomeMessage, keyboard);
    });

    // Callback queries
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const data = query.data;

        console.log('Callback:', data);

        if (data.startsWith('wallet_')) {
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
                            text: ' Telegram Wallet',
                            url: `https://t.me/wallet?startattach=tonconnect_${userId}`
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
            
            bot.sendMessage(chatId, `💳 *Wallet ulash*\n\nTelegram Walletni tanlang va hamyonni ulang:`, walletKeyboard);
            
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
                            callback_data: `wallet_${userId}`
                        },
                        {
                            text: '📊 Balans',
                            callback_data: `balance_${userId}`
                        }
                    ], [
                        {
                            text: '💸 TON yechish',
                            callback_data: `withdraw_${userId}`
                        }
                    ]]
                },
                parse_mode: 'Markdown'
            };
            bot.sendMessage(chatId, `👋 *Asosiy menyu*`, mainKeyboard);
        }
        else if (data.startsWith('balance_')) {
            try {
                const response = await fetch(`${API_BASE_URL}/user/${userId}`);
                const userData = await response.json();
                
                if (userData.success) {
                    const message = `📊 *Balans*

💰 TON: ${userData.user.balance.toFixed(4)} TON
💎 Jetton: ${userData.user.jettonBalance.toLocaleString()} 💎`;
                    
                    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
                } else {
                    bot.sendMessage(chatId, '⚠️ Avval wallet ulang!');
                }
            } catch (e) {
                bot.sendMessage(chatId, '❌ Xatolik yuz berdi');
            }
        }
        else if (data.startsWith('withdraw_')) {
            bot.sendMessage(chatId, `💸 *TON yechish*\n\nTON yechish uchun o'yinga kiring va "Wallet" bo'limidan "TON yechish" ni tanlang.`, { parse_mode: 'Markdown' });
        }
        
        bot.answerCallbackQuery(query.id);
    });

    // Error handling
    bot.on('polling_error', (error) => {
        console.error('❌ Polling error:', error.message);
    });

    bot.on('error', (error) => {
        console.error('❌ Bot error:', error.message);
    });

} catch (error) {
    console.error('❌ Fatal error:', error.message);
}

// Keep alive
console.log('Bot ishlamoqda... Ctrl+C to stop');
