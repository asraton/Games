const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { TonClient, WalletContractV4, internal, fromNano, toNano } = require('@ton/ton');
const { mnemonicNew, mnemonicToWalletKey } = require('@ton/crypto');
const axios = require('axios');

// JSON file database
const { userDB, shopDB, purchaseDB } = require('./jsonDB');

const app = express();
app.use(cors());
app.use(express.json());

// TON Center API config
const TON_API_KEY = process.env.TON_API_KEY || '';
const TON_CENTER_ENDPOINT = 'https://toncenter.com/api/v2';
const PAYMENT_ADDRESS = process.env.PAYMENT_ADDRESS || 'UQAYFg8VczIFRtX7QRcredLeBFydLgbUfwasup35C8-_Nlnu';  // xRocket Wallet

// xRocket API config
const XROCKET_API_TOKEN = process.env.XROCKET_API_TOKEN;
const XROCKET_ENDPOINT = 'https://pay.xrocket.tg';

// Address normalization - EQ va UQ formatlarni bir xil qilish
function normalizeAddress(address) {
    if (!address) return null;
    // Barcha addressni lowercase va UQ formatga o'tkazish
    let normalized = address.toLowerCase();
    // EQ -> UQ almashtirish (bounceable -> non-bounceable)
    if (normalized.startsWith('eq')) {
        normalized = 'uq' + normalized.slice(2);
    }
    return normalized;
}

// TON client with API key
const client = new TonClient({
    endpoint: TON_CENTER_ENDPOINT + '/jsonRPC',
    apiKey: TON_API_KEY
});

// TON Center API helper - missing function definition added
async function toncenterRequest(method, params) {
    try {
        const url = `${TON_CENTER_ENDPOINT}/${method}`;
        const queryParams = new URLSearchParams();
        
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) {
                queryParams.append(key, value);
            }
        }
        
        const headers = {};
        if (TON_API_KEY) {
            headers['X-Api-Key'] = TON_API_KEY;
        }
        
        const response = await axios.get(`${url}?${queryParams.toString()}`, { 
            headers, 
            timeout: 30000 
        });
        
        return response.data;
    } catch (error) {
        console.error('TON Center API error:', error.message);
        return null;
    }
}

// xRocket API helper - to'lovlarni tekshirish
async function xRocketRequest(method, endpoint, data = null) {
    try {
        const url = `${XROCKET_ENDPOINT}${endpoint}`;
        const headers = {
            'Authorization': `Bearer ${XROCKET_API_TOKEN}`,
            'Content-Type': 'application/json'
        };
        
        let response;
        if (data) {
            response = await axios.post(url, data, { headers, timeout: 30000 });
        } else {
            response = await axios.get(url, { headers, timeout: 30000 });
        }
        
        return response.data;
    } catch (error) {
        console.error('xRocket API error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
        return null;
    }
}

// xRocket orqali balansni tekshirish
async function getXRocketBalance() {
    try {
        const result = await xRocketRequest('GET', '/app/stats');
        if (result && result.success) {
            return result.data?.balances || {};
        }
        return {};
    } catch (error) {
        console.error('xRocket balance check error:', error);
        return {};
    }
}

// xRocket orqali transactionlarni olish
async function getXRocketTransactions(limit = 20) {
    try {
        console.log(`🚀 xRocket API so'rov: /app/deposits?limit=${limit}`);
        console.log(`   Token: ${XROCKET_API_TOKEN?.slice(0, 10)}...`);
        
        // xRocket deposits ni olish
        const result = await xRocketRequest('GET', `/app/deposits?limit=${limit}`);
        
        console.log(`📦 xRocket API javob:`, JSON.stringify(result, null, 2).slice(0, 500));
        
        if (result && result.success) {
            const deposits = result.data?.deposits || [];
            console.log(`✅ xRocket deposits topildi: ${deposits.length} ta`);
            return deposits;
        } else {
            console.log(`⚠️ xRocket API javob muvaffaqiyatsiz:`, result);
        }
        return [];
    } catch (error) {
        console.error('❌ xRocket transactions fetch error:', error.message);
        return [];
    }
}

// Static files - parent directory (root) dan serve qilish
const path = require('path');
app.use(express.static(path.join(__dirname, '..')));

// Root route - colorrush.html serve qilish
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'colorrush.html'));
});

// Yangi deposit wallet yaratish
async function createDepositWallet() {
    const mnemonic = await mnemonicNew(24);
    const keyPair = await mnemonicToWalletKey(mnemonic);
    
    const wallet = WalletContractV4.create({
        workchain: 0,
        publicKey: keyPair.publicKey
    });
    
    return {
        address: wallet.address.toString({ bounceable: false }),
        publicKey: keyPair.publicKey.toString('hex'),
        privateKey: keyPair.secretKey.toString('hex'),
        mnemonic: mnemonic.join(' ')
    };
}

// REAL TON balansini tekshirish
async function getRealTonBalance(address) {
    try {
        const result = await toncenterRequest('getAddressInformation', { address });
        if (result && result.ok && result.result) {
            // result.result.balance - nanoton da keladi
            const nanoton = BigInt(result.result.balance || 0);
            const ton = Number(nanoton) / 1e9;
            console.log(`💰 Balance check: ${address.slice(0, 15)}... = ${ton.toFixed(4)} TON`);
            return ton;
        }
        console.log(`⚠️ Balance check failed for ${address.slice(0, 15)}...`);
        return 0;
    } catch (error) {
        console.error('Balance check error:', error.message);
        return 0;
    }
}

// REAL TON transactionlarini olish
async function getTransactions(address, limit = 10) {
    try {
        console.log(`🔍 TON Center: Getting transactions for ${address.slice(0, 15)}...`);
        const result = await toncenterRequest('getTransactions', { 
            address, 
            limit,
            archival: true 
        });
        if (result && result.ok) {
            console.log(`✅ TON Center: ${result.result?.length || 0} transactions found`);
            return result.result || [];
        }
        console.log(`⚠️ TON Center: No transactions or error`);
        return [];
    } catch (error) {
        console.error('Transactions fetch error:', error.message);
        return [];
    }
}

// Health check endpoint for Railway
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Foydalanuvchi ro'yxatdan o'tkazish
app.post('/api/user/register', async (req, res) => {
    try {
        const { userId, connectedWallet } = req.body;
        
        if (!userId || !connectedWallet) {
            return res.status(400).json({ error: 'userId va connectedWallet kerak' });
        }
        
        let user = userDB.get(userId);
        
        if (user) {
            // Yangilangan balansni olish
            const realBalance = await getRealTonBalance(user.depositWallet.address);
            
            // Agar real balance ko'p bo'lsa, yangi deposit bor
            if (realBalance > user.totalDeposited) {
                const newDeposit = realBalance - user.totalDeposited;
                user.totalDeposited = realBalance;
                user.balance = user.totalDeposited - user.totalConverted;
                user.lastDepositAt = new Date().toISOString();
                userDB.set(userId, user);
                
                console.log(`✅ Yangi deposit: ${newDeposit.toFixed(4)} TON (User: ${userId})`);
            }
            
            return res.json({
                success: true,
                user: {
                    userId: user.userId,
                    connectedWallet: user.connectedWallet,
                    depositAddress: user.depositWallet.address,
                    realBalance: realBalance,
                    totalDeposited: user.totalDeposited,
                    totalConverted: user.totalConverted,
                    tonAvailable: user.balance,
                    jettonBalance: user.jettonBalance,
                    hasPaid: user.hasPaid || false,
                    paymentAddress: PAYMENT_ADDRESS || '',
                    newDeposit: realBalance > user.totalDeposited ? realBalance - user.totalDeposited : 0
                }
            });
        }
        
        // Yangi deposit wallet yaratish
        const depositWallet = await createDepositWallet();
        
        // Yangi foydalanuvchi yaratish
        user = {
            userId,
            connectedWallet,
            depositWallet,
            balance: 0,
            jettonBalance: 0,
            totalDeposited: 0,
            totalConverted: 0,
            purchasedItems: [],
            createdAt: new Date().toISOString(),
            lastDepositAt: null,
            lastBalanceCheck: null,
            hasPaid: false, // Demo mode - 1 TON to'lanmaguncha
            demoAsraBalance: 0, // Demo rejimda yig'ilgan asra
            paymentAddress: PAYMENT_ADDRESS || '',
            globalStats: {
                totalClicksAllTime: 0,
                totalCoinsCollected: 0,
                totalTonEarned: 0,
                gamesPlayed: 0,
                firstPlayed: new Date().toISOString(),
                lastPlayed: null
            }
        };
        
        userDB.set(userId, user);
        
        console.log(`✅ Yangi user yaratildi: ${userId}`);
        console.log(`🏦 Deposit address: ${depositWallet.address}`);
        
        res.json({
            success: true,
            user: {
                userId: user.userId,
                connectedWallet: user.connectedWallet,
                depositAddress: user.depositWallet.address,
                realBalance: 0,
                totalDeposited: 0,
                totalConverted: 0,
                tonAvailable: 0,
                jettonBalance: 0,
                hasPaid: false,
                paymentAddress: PAYMENT_ADDRESS || '',
                newDeposit: 0
            }
        });
        
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Server xatoligi' });
    }
});

// Foydalanuvchi balansini olish (yechish uchun)
app.get('/api/user/:userId/balance', async (req, res) => {
    try {
        const user = userDB.get(req.params.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
        }
        
        // REAL balansni tekshirish
        const realBalance = await getRealTonBalance(user.depositWallet.address);
        const availableTon = user.totalDeposited - user.totalConverted;
        
        // Agar real balance kamaygan bo'lsa, yangilash
        if (realBalance < availableTon) {
            user.totalDeposited = realBalance;
            user.balance = realBalance - user.totalConverted;
            userDB.set(req.params.userId, user);
        }
        
        res.json({
            success: true,
            maxWithdraw: Math.max(0, user.totalDeposited - user.totalConverted),
            totalDeposited: user.totalDeposited,
            totalConverted: user.totalConverted,
            jettonBalance: user.jettonBalance,
            realBalance: realBalance
        });
        
    } catch (error) {
        console.error('Get balance error:', error);
        res.status(500).json({ error: 'Server xatoligi' });
    }
});

// Foydalanuvchi ma'lumotlarini olish
app.get('/api/user/:userId', async (req, res) => {
    try {
        const user = userDB.get(req.params.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
        }
        
        // REAL balansni tekshirish (blockchain da)
        const realBalance = await getRealTonBalance(user.depositWallet.address);
        
        res.json({
            success: true,
            user: {
                userId: user.userId,
                connectedWallet: user.connectedWallet,
                depositAddress: user.depositWallet.address,
                realBalance: realBalance,
                totalDeposited: user.totalDeposited,
                totalConverted: user.totalConverted,
                tonAvailable: user.totalDeposited - user.totalConverted,
                jettonBalance: user.jettonBalance,
                createdAt: user.createdAt,
                lastDepositAt: user.lastDepositAt
            }
        });
        
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Server xatoligi' });
    }
});

// REAL Deposit tekshirish
app.post('/api/check-deposit/:userId', async (req, res) => {
    try {
        const user = userDB.get(req.params.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
        }
        
        // REAL TON balansini olish
        const realBalance = await getRealTonBalance(user.depositWallet.address);
        
        // Avvalgi deposit bilan solishtirish
        const previousDeposited = user.totalDeposited;
        
        // Agar real balance avvalgidan ko'p bo'lsa, yangi deposit bor
        if (realBalance > previousDeposited) {
            const newDeposit = realBalance - previousDeposited;
            
            // totalDeposited ni yangilash
            user.totalDeposited = realBalance;
            user.balance = user.totalDeposited - user.totalConverted;
            user.lastDepositAt = new Date().toISOString();
            userDB.set(req.params.userId, user);
            
            console.log(`✅ DEPOSIT: ${newDeposit.toFixed(4)} TON`);
            console.log(`   User: ${req.params.userId}`);
            console.log(`   Address: ${user.depositWallet.address}`);
            
            return res.json({
                success: true,
                newDeposit: newDeposit,
                totalDeposited: user.totalDeposited,
                totalConverted: user.totalConverted,
                tonAvailable: user.balance,
                jettonBalance: user.jettonBalance,
                message: `Yangi deposit: ${newDeposit.toFixed(4)} TON`,
                isReal: true
            });
        }
        
        res.json({
            success: true,
            newDeposit: 0,
            totalDeposited: user.totalDeposited,
            totalConverted: user.totalConverted,
            tonAvailable: user.balance,
            jettonBalance: user.jettonBalance,
            message: 'Yangi deposit yo\'q',
            isReal: true
        });
        
    } catch (error) {
        console.error('Check deposit error:', error);
        res.status(500).json({ error: 'Server xatoligi' });
    }
});

// Barcha userlarni tekshirish (cron job uchun)
app.post('/api/check-all-deposits', async (req, res) => {
    try {
        const results = [];
        const users = userDB.getAll();
        
        for (const [userId, user] of Object.entries(users)) {
            try {
                const realBalance = await getRealTonBalance(user.depositWallet.address);
                const previousDeposited = user.totalDeposited;
                
                // Yangi deposit tekshirish
                if (realBalance > previousDeposited) {
                    const newDeposit = realBalance - previousDeposited;
                    
                    user.totalDeposited = realBalance;
                    user.balance = user.totalDeposited - user.totalConverted;
                    user.lastDepositAt = new Date().toISOString();
                    userDB.set(userId, user);
                    
                    results.push({
                        userId: userId,
                        newDeposit: newDeposit,
                        totalDeposited: user.totalDeposited,
                        tonAvailable: user.balance
                    });
                    
                    console.log(`✅ Auto deposit: ${newDeposit.toFixed(4)} TON (${userId})`);
                }
            } catch (err) {
                console.error(`User ${userId} tekshirishda xatolik:`, err.message);
            }
        }
        
        res.json({
            success: true,
            updatedUsers: results.length,
            deposits: results,
            isReal: true
        });
        
    } catch (error) {
        console.error('Check all deposits error:', error);
        res.status(500).json({ error: 'Server xatoligi' });
    }
});

// Do'kon itemlarini olish
app.get('/api/shop/items', async (req, res) => {
    try {
        const items = Object.values(shopDB.getAll()).filter(item => item.isActive);
        
        res.json({
            success: true,
            items: items
        });
    } catch (error) {
        console.error('Get shop items error:', error);
        res.status(500).json({ error: 'Server xatoligi' });
    }
});

// Item sotib olish
app.post('/api/shop/purchase', async (req, res) => {
    try {
        const { userId, itemId } = req.body;
        
        if (!userId || !itemId) {
            return res.status(400).json({ error: 'userId va itemId kerak' });
        }
        
        const user = userDB.get(userId);
        const item = shopDB.get(itemId);
        
        if (!user) {
            return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
        }
        
        if (!item || !item.isActive) {
            return res.status(404).json({ error: 'Item topilmadi' });
        }
        
        if (user.purchasedItems.includes(itemId)) {
            return res.status(400).json({ error: 'Bu item allaqachon sotib olingan' });
        }
        
        if (user.jettonBalance < item.price) {
            return res.status(400).json({ 
                error: 'Yetarli jetton yo\'q',
                required: item.price,
                current: user.jettonBalance
            });
        }
        
        user.jettonBalance -= item.price;
        user.purchasedItems.push(itemId);
        userDB.set(userId, user);
        
        purchaseDB.add({
            userId,
            itemId,
            price: item.price,
            purchasedAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: `${item.name} sotib olindi!`,
            remainingBalance: user.jettonBalance,
            item: {
                itemId: item.itemId,
                name: item.name,
                effect: item.effect,
                effectValue: item.effectValue
            }
        });
        
    } catch (error) {
        console.error('Purchase error:', error);
        res.status(500).json({ error: 'Server xatoligi' });
    }
});

// TON -> Jetton konvertatsiya
app.post('/api/convert-ton', async (req, res) => {
    try {
        const { userId, tonAmount } = req.body;
        
        if (!userId || !tonAmount || tonAmount <= 0) {
            return res.status(400).json({ error: 'userId va tonAmount kerak' });
        }
        
        const user = userDB.get(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
        }
        
        // REAL balansni tekshirish
        const realBalance = await getRealTonBalance(user.depositWallet.address);
        
        // Mavjud TON miqdori (deposited - converted)
        const availableTon = user.totalDeposited - user.totalConverted;
        
        // Agar real balance kamaygan bo'lsa (withdraw qilingan), yangilash kerak
        if (realBalance < availableTon) {
            const withdrawnAmount = availableTon - realBalance;
            user.totalDeposited = Math.max(0, user.totalDeposited - withdrawnAmount);
        }
        
        // Yangilangan available TON
        const updatedAvailableTon = user.totalDeposited - user.totalConverted;
        
        if (tonAmount > updatedAvailableTon) {
            return res.status(400).json({ 
                error: 'Yetarli TON yo\'q',
                required: tonAmount,
                available: updatedAvailableTon,
                realBalance: realBalance,
                isReal: true
            });
        }
        
        const jettonAmount = Math.floor(tonAmount * 1000);
        
        // totalConverted ni yangilash
        user.totalConverted += tonAmount;
        user.jettonBalance += jettonAmount;
        user.balance = user.totalDeposited - user.totalConverted;
        userDB.set(userId, user);
        
        res.json({
            success: true,
            message: `${tonAmount} TON -> ${jettonAmount} Jetton konvertatsiya qilindi`,
            tonDeposited: user.totalDeposited,
            tonConverted: user.totalConverted,
            tonAvailable: user.balance,
            jettonBalance: user.jettonBalance,
            isReal: true
        });
        
    } catch (error) {
        console.error('Convert TON error:', error);
        res.status(500).json({ error: 'Server xatoligi' });
    }
});

// User ning sotib olingan itemlarini olish
app.get('/api/user/:userId/items', async (req, res) => {
    try {
        const user = userDB.get(req.params.userId);
        if (!user) {
            return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
        }
        
        const items = Object.values(shopDB.getAll()).filter(item => 
            user.purchasedItems.includes(item.itemId)
        );
        
        res.json({
            success: true,
            items: items
        });
        
    } catch (error) {
        console.error('Get user items error:', error);
        res.status(500).json({ error: 'Server xatoligi' });
    }
});

// REAL Withdraw - foydalanuvchi o'z walletiga pul yechib olish
app.post('/api/withdraw', async (req, res) => {
    try {
        const { userId, amount, toAddress, testMode } = req.body;
        
        console.log(`📝 WITHDRAW REQUEST:`);
        console.log(`   userId: ${userId}`);
        console.log(`   amount: ${amount}`);
        console.log(`   testMode: ${testMode}`);
        console.log(`   toAddress: ${toAddress?.slice(0, 20)}...`);
        
        if (!userId || !amount || amount <= 0 || !toAddress) {
            console.log(`❌ VALIDATION ERROR: missing fields`);
            return res.status(400).json({ 
                error: 'userId, amount va toAddress kerak' 
            });
        }
        
        const user = userDB.get(userId);
        
        if (!user) {
            console.log(`❌ USER NOT FOUND: ${userId}`);
            return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
        }
        
        console.log(`✅ User found: ${userId}`);
        console.log(`   hasPaid: ${user.hasPaid}`);
        console.log(`   gameData:`, user.gameData);
        
        // Check if testMode is allowed (only in development)
        const isDevEnvironment = process.env.NODE_ENV !== 'production';
        const isTestMode = testMode === true && isDevEnvironment;
        
        // To'lov qilinganmi tekshirish (faqat test mode emasligida)
        if (!isTestMode && !user.hasPaid) {
            console.log(`❌ PAYMENT REQUIRED (real mode)`);
            return res.status(403).json({ 
                error: 'Demo versiya',
                message: 'TON yechib olish uchun avval 1 TON to\'lashingiz kerak',
                requiredPayment: 1,
                paymentAddress: PAYMENT_ADDRESS || '',
                demoMode: true
            });
        }
        
        // TEST MODE: gameData.tonCount dan yechish (FAQAT development rejimida!)
        if (isTestMode) {
            console.log(`🧪 TEST MODE withdraw (Development only)`);
            const gameTon = user.gameData?.tonCount || 0;
            console.log(`   gameTon available: ${gameTon}`);
            
            if (gameTon < amount) {
                console.log(`❌ Not enough TON: need ${amount}, have ${gameTon}`);
                return res.status(400).json({
                    error: 'Yetarli TON yo\'q',
                    required: amount,
                    available: gameTon,
                    message: 'O\'yinda yetarli TON yo\'q'
                });
            }
            
            // 1 TON qoldirish sharti
            if (gameTon - amount < 1) {
                console.log(`❌ Must keep 1 TON: have ${gameTon}, withdraw ${amount}`);
                return res.status(400).json({
                    error: '1 TON qoldirish sharti',
                    maxWithdraw: Math.max(0, gameTon - 1)
                });
            }
            
            // GameData dan TON ni kamaytirish
            user.gameData.tonCount -= amount;
            userDB.set(userId, user);
            
            console.log(`✅ TEST WITHDRAW SUCCESS: ${amount} TON`);
            console.log(`   Remaining: ${user.gameData.tonCount} TON`);
            
            return res.json({
                success: true,
                message: `${amount} TON yechib olindi (Test mode)`,
                tonCount: user.gameData.tonCount,
                testMode: true
            });
        }
        
        // REAL MODE: deposited TON dan yechish (asliy o'yin)
        const availableTon = user.totalDeposited - user.totalConverted;
        
        if (availableTon < amount) {
            return res.status(400).json({ 
                error: 'Yetarli TON yo\'q',
                required: amount,
                available: availableTon,
                message: 'Convert qilingan TONlarni withdraw qila olmaysiz',
                isReal: true
            });
        }
        
        if (amount < 0.1) {
            return res.status(400).json({ 
                error: 'Minimum withdraw miqdori 0.1 TON' 
            });
        }
        
        // Hamyonni "tirik" saqlash uchun 0.05 TON qoldirish
        const minKeepForFees = 0.05;
        if (availableTon - amount < minKeepForFees) {
            return res.status(400).json({
                error: 'Komissiya uchun TON qoldirish kerak',
                message: `Hamyonni aktiv saqlash uchun ${minKeepForFees} TON qolishi kerak`,
                maxWithdraw: Math.max(0, availableTon - minKeepForFees),
                available: availableTon
            });
        }
        
        // REAL TON transfer qilish - Seqno kutish bilan
        try {
            console.log(`🔄 WITHDRAW: ${amount} TON`);
            console.log(`   From: ${user.depositWallet.address}`);
            console.log(`   To: ${toAddress}`);
            
            const keyPair = await mnemonicToWalletKey(user.depositWallet.mnemonic.split(' '));
            const wallet = WalletContractV4.create({
                workchain: 0,
                publicKey: keyPair.publicKey
            });
            
            const contract = client.open(wallet);
            
            // 1. Joriy seqno ni olish
            let seqno = await contract.getSeqno();
            console.log(`   Seqno (before): ${seqno}`);
            
            // 2. Transfer miqdori (toNano string qabul qiladi)
            const transferAmount = toNano(amount.toString());
            
            // 3. Tranzaksiya yuborish
            await contract.sendTransfer({
                seqno,
                secretKey: keyPair.secretKey,
                messages: [
                    internal({
                        to: toAddress,
                        value: transferAmount,
                        body: 'Withdraw from ASRA Coin',
                        bounce: false
                    })
                ]
            });
            
            // 4. Seqno o'zgarishini kutish (Blockchain tasdig'i)
            console.log(`   Waiting for seqno update...`);
            let currentSeqno = seqno;
            let retry = 0;
            while (currentSeqno === seqno && retry < 10) {
                await new Promise(r => setTimeout(r, 1500)); // 1.5 soniya kutish
                currentSeqno = await contract.getSeqno();
                retry++;
            }
            console.log(`   Seqno (after): ${currentSeqno} (retries: ${retry})`);
            
            // 5. Bazani yangilash
            user.totalDeposited -= amount;
            user.balance = user.totalDeposited - user.totalConverted;
            userDB.set(userId, user);
            
            console.log(`✅ WITHDRAW SUCCESS: ${amount} TON`);
            
            res.json({
                success: true,
                message: `${amount} TON muvaffaqiyatli yuborildi`,
                toAddress: toAddress,
                tonDeposited: user.totalDeposited,
                tonConverted: user.totalConverted,
                tonAvailable: user.balance,
                isReal: true
            });
            
        } catch (txError) {
            console.error('Blockchain xatosi:', txError);
            return res.status(500).json({ 
                error: 'Blockchain-da xatolik yuz berdi. Qayta urinib ko\'ring.',
                isReal: true
            });
        }
        
    } catch (error) {
        console.error('Withdraw error:', error);
        res.status(500).json({ error: 'Server xatoligi' });
    }
});

// Wallet ma'lumotlarini ko'rish (debug) - FAQAT development rejimida
if (process.env.NODE_ENV !== 'production') {
    app.get('/api/debug/wallet/:userId', async (req, res) => {
        try {
            const user = userDB.get(req.params.userId);
            
            if (!user) {
                return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
            }
            
            // REAL balansni tekshirish
            const realBalance = await getRealTonBalance(user.depositWallet.address);
            
            // Transactionlar
            const transactions = await getTransactions(user.depositWallet.address, 5);
            
            res.json({
                success: true,
                debug: true,
                depositAddress: user.depositWallet.address,
                realBalance: realBalance,
                totalDeposited: user.totalDeposited,
                totalConverted: user.totalConverted,
                tonAvailable: user.totalDeposited - user.totalConverted,
                jettonBalance: user.jettonBalance,
                globalStats: user.globalStats || null,
                recentTransactions: transactions.map(tx => ({
                    hash: tx.transaction_id?.hash,
                    lt: tx.transaction_id?.lt,
                    value: tx.in_msg?.value,
                    from: tx.in_msg?.source,
                    to: tx.in_msg?.destination,
                    time: tx.utime
                }))
            });
            
        } catch (error) {
            console.error('Debug error:', error);
            res.status(500).json({ error: 'Server xatoligi' });
        }
    });
}

// Debug endpoint - xRocket transactionlarni ko'rish (FAQAT development rejimida)
if (process.env.NODE_ENV !== 'production') {
    app.get('/api/debug/xrocket', async (req, res) => {
        try {
            const transactions = await getXRocketTransactions(20);
            
            res.json({
                success: true,
                count: transactions.length,
                paymentAddress: PAYMENT_ADDRESS,
                xrocketToken: XROCKET_API_TOKEN ? '✅ Mavjud' : '❌ Yo\'q',
                transactions: transactions.map(tx => ({
                    id: tx.id,
                    amount: tx.amount,
                    status: tx.status,
                    from: tx.from?.address,
                    to: tx.to?.address,
                    createdAt: tx.createdAt
                }))
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                paymentAddress: PAYMENT_ADDRESS
            });
        }
    });
}

// Debug endpoint - TON Center transactionlarni ko'rish (FAQAT development rejimida)
if (process.env.NODE_ENV !== 'production') {
    app.get('/api/debug/toncenter', async (req, res) => {
        try {
            const transactions = await getTransactions(PAYMENT_ADDRESS, 20);
            
            res.json({
                success: true,
                count: transactions.length,
                paymentAddress: PAYMENT_ADDRESS,
                tonApiKey: TON_API_KEY ? '✅ Mavjud' : '❌ Yo\'q',
                transactions: transactions.map(tx => ({
                    hash: tx.transaction_id?.hash,
                    lt: tx.transaction_id?.lt,
                    value: tx.in_msg?.value,
                    from: tx.in_msg?.source,
                    to: tx.in_msg?.destination,
                    time: tx.utime,
                    type: tx.in_msg ? 'incoming' : 'outgoing'
                }))
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                paymentAddress: PAYMENT_ADDRESS
            });
        }
    });
}

// To'lov holatini tekshirish
app.get('/api/check-payment/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId kerak' });
        }
        
        let user = userDB.get(userId);
        
        // Agar user yo'q bo'lsa, avtomatik yaratish
        if (!user) {
            console.log(`🆕 Auto-creating user for payment check: ${userId}`);
            
            // Yangi deposit wallet yaratish
            const depositWallet = await createDepositWallet();
            
            user = {
                userId,
                connectedWallet: null,
                depositWallet,
                balance: 0,
                jettonBalance: 0,
                totalDeposited: 0,
                totalConverted: 0,
                purchasedItems: [],
                createdAt: new Date().toISOString(),
                lastDepositAt: null,
                lastBalanceCheck: null,
                hasPaid: false,
                demoAsraBalance: 0,
                paymentAddress: PAYMENT_ADDRESS || '',
                globalStats: {
                    totalClicksAllTime: 0,
                    totalCoinsCollected: 0,
                    totalTonEarned: 0,
                    gamesPlayed: 0,
                    firstPlayed: new Date().toISOString(),
                    lastPlayed: null
                }
            };
            
            userDB.set(userId, user);
            console.log(`✅ User yaratildi: ${userId}`);
        }
        
        const REQUIRED_AMOUNT = 1; // 1 TON
        
        // Agar allaqachon to'lagan bo'lsa
        if (user.hasPaid) {
            return res.json({
                success: true,
                hasPaid: true,
                message: 'To\'lov qilingan'
            });
        }
        
        // Transactionlarni tekshirish (Avval xRocket, keyin TON Center)
        let paymentTx = null;
        
        // 1. xRocket API dan tekshirish
        try {
            const xrTransactions = await getXRocketTransactions(20);
            console.log(`🔍 xRocket transactions: ${xrTransactions.length} ta`);
            
            paymentTx = xrTransactions.find(tx => {
                const amount = parseFloat(tx.amount) || 0;
                const status = tx.status?.toLowerCase();
                // Multiple success statuses
                const isSuccessStatus = ['completed', 'success', 'done', 'confirmed'].includes(status);
                console.log(`   Tx check: amount=${amount}, status=${status}, isSuccess=${isSuccessStatus}`);
                return amount >= REQUIRED_AMOUNT && isSuccessStatus;
            });
            
            if (paymentTx) {
                console.log(`✅ xRocket da to'lov topildi: ${paymentTx.id}`);
            }
        } catch (xrError) {
            console.log('⚠️ xRocket tekshiruvda xato:', xrError.message);
        }
        
        // 2. Agar xRocket da topilmasa, TON Center dan tekshirish
        if (!paymentTx) {
            try {
                console.log(`🔍 TON Center: ${PAYMENT_ADDRESS} uchun transactionlar olinmoqda...`);
                const tonTransactions = await getTransactions(PAYMENT_ADDRESS, 20);
                console.log(`🔍 TON Center transactions: ${tonTransactions.length} ta`);
                
                // Barcha transactionlarni log qilish
                tonTransactions.forEach((tx, i) => {
                    const toAddress = tx.to || tx.in_msg?.destination;
                    const fromAddress = tx.from || tx.in_msg?.source;
                    const value = tx.value || tx.in_msg?.value;
                    console.log(`   [${i}] From: ${fromAddress?.slice(0, 20)}... To: ${toAddress?.slice(0, 20)}... Value: ${value}`);
                });
                
                paymentTx = tonTransactions.find(tx => {
                    const toAddress = tx.to || tx.in_msg?.destination;
                    const value = tx.value || tx.in_msg?.value;
                    if (!toAddress || !value) return false;
                    const tonAmount = Number(BigInt(value)) / 1e9;
                    // Normalize addresses for comparison
                    const normalizedTo = normalizeAddress(toAddress);
                    const normalizedPayment = normalizeAddress(PAYMENT_ADDRESS);
                    const isMatch = normalizedTo === normalizedPayment && tonAmount >= REQUIRED_AMOUNT;
                    console.log(`   Tekshirilmoqda: to=${toAddress?.slice(0, 30)}..., normalized=${normalizedTo?.slice(0, 30)}..., amount=${tonAmount} TON, match=${isMatch}`);
                    return isMatch;
                });
                
                if (paymentTx) {
                    console.log(`✅ TON Center da to'lov topildi: ${paymentTx.transaction_id?.hash}`);
                } else {
                    console.log(`❌ TON Center da to'lov topilmadi`);
                }
            } catch (tonError) {
                console.log('⚠️ TON Center tekshiruvda xato:', tonError.message);
            }
        }
        
        // Tekshirish natijalarini qayta ishlash
        if (paymentTx) {
            // To'lov qilingan!
            user.hasPaid = true;
            user.paidAt = new Date().toISOString();
            user.paidAmount = REQUIRED_AMOUNT;
            user.paymentTxHash = paymentTx.id || paymentTx.hash || null;
            user.paidFromAddress = paymentTx.from?.address || null;
            
            // Demo asralarni real balansga o'tkazish (yoki 0 ga tushirish)
            user.demoAsraBalance = 0;
            
            userDB.set(userId, user);
            
            console.log(`✅ To'lov qilindi: ${userId}`);
            console.log(`   Amount: ${paymentTx.amount} TON`);
            console.log(`   Tx: ${paymentTx.id}`);
            console.log(`   From: ${paymentTx.from?.address}`);
            
            return res.json({
                success: true,
                hasPaid: true,
                message: 'To\'lov qilindi! Endi haqiqiy o\'yni boshlashingiz mumkin.',
                resetRequired: true,
                txHash: paymentTx.id
            });
        }
        
        // To'lov qilinmagan
        res.json({
            success: true,
            hasPaid: false,
            message: 'To\'lov kutilmoqda',
            requiredAmount: REQUIRED_AMOUNT,
            paymentAddress: PAYMENT_ADDRESS || '',
            demoAsraBalance: user.demoAsraBalance || 0
        });
        
    } catch (error) {
        console.error('Check payment error:', error);
        res.status(500).json({ error: 'Server xatoligi' });
    }
});

// To'lov qilinishi kerakligini belgilash (user o'zi to'lov qilganini tasdiqlash)
app.post('/api/confirm-payment/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        let user = userDB.get(userId);
        
        // Agar user yo'q bo'lsa, avtomatik yaratish
        if (!user) {
            console.log(`🆕 Auto-creating user for confirm-payment: ${userId}`);
            const depositWallet = await createDepositWallet();
            
            user = {
                userId,
                connectedWallet: null,
                depositWallet,
                balance: 0,
                jettonBalance: 0,
                totalDeposited: 0,
                totalConverted: 0,
                purchasedItems: [],
                createdAt: new Date().toISOString(),
                lastDepositAt: null,
                lastBalanceCheck: null,
                hasPaid: false,
                demoAsraBalance: 0,
                paymentAddress: PAYMENT_ADDRESS || '',
                globalStats: {
                    totalClicksAllTime: 0,
                    totalCoinsCollected: 0,
                    totalTonEarned: 0,
                    gamesPlayed: 0,
                    firstPlayed: new Date().toISOString(),
                    lastPlayed: null
                }
            };
            
            userDB.set(userId, user);
        }
        
        const REQUIRED_AMOUNT = 1;
        
        // xRocket API bilan transactionlarni tekshirish
        const transactions = await getXRocketTransactions(30);
        
        console.log(`🔍 xRocket confirm-payment: ${transactions.length} ta transaction`);
        
        const paymentTx = transactions.find(tx => {
            const amount = parseFloat(tx.amount) || 0;
            const status = tx.status?.toLowerCase();
            const isSuccessStatus = ['completed', 'success', 'done', 'confirmed'].includes(status);
            
            console.log(`   Tx: ${tx.id}, Amount: ${amount}, Status: ${status}, isSuccess=${isSuccessStatus}`);
            
            return amount >= REQUIRED_AMOUNT && isSuccessStatus;
        });
        
        if (paymentTx) {
            // Yangi o'yin uchun statistikani reset qilish
            user.hasPaid = true;
            user.paidAt = new Date().toISOString();
            user.paidAmount = REQUIRED_AMOUNT;
            user.paymentTxHash = paymentTx.id || null;
            user.paidFromAddress = paymentTx.from?.address || null;
            
            // Barcha statistikani 0 ga tushirish (yangi o'yin)
            user.totalDeposited = 0;
            user.totalConverted = 0;
            user.balance = 0;
            user.jettonBalance = 0;
            user.demoAsraBalance = 0;
            user.purchasedItems = [];
            
            user.globalStats = {
                totalClicksAllTime: 0,
                totalCoinsCollected: 0,
                totalTonEarned: 0,
                gamesPlayed: 0,
                firstPlayed: new Date().toISOString(),
                lastPlayed: null
            };
            
            userDB.set(userId, user);
            
            console.log(`✅ To'lov tasdiqlandi va o'yin reset qilindi: ${userId}`);
            console.log(`   Tx: ${paymentTx.id}, Amount: ${paymentTx.amount} TON`);
            
            res.json({
                success: true,
                hasPaid: true,
                message: 'To\'lov tasdiqlandi! Yangi o\'yin boshlandi.',
                reset: true,
                txHash: paymentTx.id
            });
        } else {
            res.json({
                success: false,
                hasPaid: false,
                message: 'To\'lov topilmadi. Iltimos, 1 TON yuboring va qayta urinib ko\'ring.',
                paymentAddress: PAYMENT_ADDRESS || '',
                requiredAmount: REQUIRED_AMOUNT
            });
        }
        
    } catch (error) {
        console.error('Confirm payment error:', error);
        res.status(500).json({ error: 'Server xatoligi' });
    }
});
app.post('/api/user/:userId/stats', async (req, res) => {
    try {
        const { userId } = req.params;
        const { totalClicksAllTime, totalCoinsCollected, totalTonEarned, gamesPlayed } = req.body;
        
        const user = userDB.get(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
        }
        
        // Global stats ni yangilash
        if (!user.globalStats) {
            user.globalStats = {
                totalClicksAllTime: 0,
                totalCoinsCollected: 0,
                totalTonEarned: 0,
                gamesPlayed: 0,
                firstPlayed: new Date().toISOString(),
                lastPlayed: null
            };
        }
        
        if (totalClicksAllTime !== undefined) {
            user.globalStats.totalClicksAllTime = totalClicksAllTime;
        }
        if (totalCoinsCollected !== undefined) {
            user.globalStats.totalCoinsCollected = totalCoinsCollected;
        }
        if (totalTonEarned !== undefined) {
            user.globalStats.totalTonEarned = totalTonEarned;
        }
        if (gamesPlayed !== undefined) {
            user.globalStats.gamesPlayed = gamesPlayed;
        }
        
        user.globalStats.lastPlayed = new Date().toISOString();
        userDB.set(userId, user);
        
        console.log(`📊 Global stats yangilandi: ${userId}`);
        console.log(`   Bosishlar: ${user.globalStats.totalClicksAllTime}`);
        console.log(`   Tangalar: ${user.globalStats.totalCoinsCollected}`);
        console.log(`   TON: ${user.globalStats.totalTonEarned}`);
        console.log(`   O'yinlar: ${user.globalStats.gamesPlayed}`);
        
        res.json({
            success: true,
            globalStats: user.globalStats
        });
        
    } catch (error) {
        console.error('Save global stats error:', error);
        res.status(500).json({ error: 'Server xatoligi' });
    }
});

// Global stats olish
app.get('/api/user/:userId/stats', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = userDB.get(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
        }
        
        res.json({
            success: true,
            globalStats: user.globalStats || {
                totalClicksAllTime: 0,
                totalCoinsCollected: 0,
                totalTonEarned: 0,
                gamesPlayed: 0,
                firstPlayed: null,
                lastPlayed: null
            }
        });
        
    } catch (error) {
        console.error('Get global stats error:', error);
        res.status(500).json({ error: 'Server xatoligi' });
    }
});

// Default shop items yaratish
async function createDefaultShopItems() {
    const defaultItems = [
        {
            itemId: 'speed_boost',
            name: '⚡ Tezlik +20%',
            description: 'Tanga tezligi 20% oshadi',
            price: 500,
            icon: 'assets/speed.png',
            effect: 'speed_boost',
            effectValue: 20,
            isActive: true
        },
        {
            itemId: 'double_reward',
            name: '💰 2x mukofot',
            description: 'Har bir tanga uchun 2x asra',
            price: 2000,
            icon: 'assets/double.png',
            effect: 'double_reward',
            effectValue: 2,
            isActive: true
        },
        {
            itemId: 'bonus_magnet',
            name: '🧲 Bonus magnit',
            description: 'Bonuslar yaqinlashganda avtomatik yig\'iladi',
            price: 3000,
            icon: 'assets/magnet.png',
            effect: 'bonus_magnet',
            effectValue: 1,
            isActive: true
        }
    ];
    
    for (const item of defaultItems) {
        const existingItem = shopDB.get(item.itemId);
        if (!existingItem) {
            shopDB.set(item.itemId, item);
            console.log(`Shop item yaratildi: ${item.name}`);
        }
    }
}

// O'yin ma'lumotlarini saqlash (asraScore, tonCount)
app.post('/api/save-game/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { asraScore, tonCount } = req.body;
        
        if (!userId || asraScore === undefined || tonCount === undefined) {
            return res.status(400).json({ error: 'userId, asraScore va tonCount kerak' });
        }
        
        const user = userDB.get(userId);
        if (!user) {
            return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
        }
        
        // O'yin ma'lumotlarini saqlash
        user.gameData = {
            asraScore: parseInt(asraScore) || 0,
            tonCount: parseFloat(tonCount) || 0,
            lastSaved: new Date().toISOString()
        };
        
        userDB.set(userId, user);
        
        res.json({
            success: true,
            message: 'O\'yin ma\'lumotlari saqlandi'
        });
        
    } catch (error) {
        console.error('Save game error:', error);
        res.status(500).json({ error: 'Server xatoligi' });
    }
});

// O'yin ma'lumotlarini olish
app.get('/api/load-game/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId kerak' });
        }
        
        const user = userDB.get(userId);
        if (!user) {
            return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
        }
        
        // O'yin ma'lumotlarini qaytarish
        const gameData = user.gameData || {
            asraScore: 0,
            tonCount: 0,
            lastSaved: null
        };
        
        res.json({
            success: true,
            asraScore: gameData.asraScore || 0,
            tonCount: gameData.tonCount || 0,
            hasPaid: user.hasPaid || false
        });
        
    } catch (error) {
        console.error('Load game error:', error);
        res.status(500).json({ error: 'Server xatoligi' });
    }
});

// Database migration - eski userlarni yangi formatga o'tkazish
async function migrateDatabase() {
    try {
        console.log('🔄 Database migration boshlandi...');
        const users = userDB.getAll();
        let migratedCount = 0;
        
        for (const [userId, user] of Object.entries(users)) {
            // Agar user da gameData yo'q bo'lsa, yaratish
            if (!user.gameData) {
                user.gameData = {
                    asraScore: 0,
                    tonCount: 0,
                    lastSaved: null
                };
                userDB.set(userId, user);
                migratedCount++;
                console.log(`   ✅ ${userId} - gameData yaratildi`);
            }
        }
        
        console.log(`✅ Migration tugadi: ${migratedCount} user yangilandi`);
    } catch (error) {
        console.error('❌ Migration xato:', error);
    }
}

// Serverni ishga tushirish
const PORT = process.env.PORT || 3000;

// Telegram bot - listen dan oldin route qo'shilishi kerak
if (process.env.TELEGRAM_BOT_TOKEN) {
    const { initBot } = require('./bot-final.js');
    initBot(app);
} else {
    console.log('⚠️ TELEGRAM_BOT_TOKEN yo\'q - bot ishlamaydi');
}

app.listen(PORT, async () => {
    console.log('🔥 ASRA COIN SERVER 🔥');
    console.log(`✅ Server ${PORT} portda ishga tushdi`);
    console.log('');
    console.log('🔗 TON Center API:');
    console.log(`   Endpoint: ${TON_CENTER_ENDPOINT}`);
    console.log(`   API Key: ${TON_API_KEY ? '✅ Mavjud' : '❌ Yo\'q (1 req/s limit)'}`);
    console.log('');
    console.log('💎 Features:');
    console.log('   ✅ Real TON blockchain balans tekshirish');
    console.log('   ✅ Real deposit monitoring');
    console.log('   ✅ Real TON transfer (withdraw)');
    console.log('   ✅ Transaction history');
    console.log('   ✅ JSON file database (persistent storage)');
    console.log('   ✅ Cross-device game data sync');
    console.log('');
    console.log('📱 URLs:');
    console.log(`   Game: http://localhost:8080`);
    console.log(`   API: http://localhost:${PORT}/api`);
    if (process.env.NODE_ENV !== 'production') {
        console.log(`   Debug: http://localhost:${PORT}/api/debug/wallet/:userId`);
    }
    console.log('');
    
    // Database migration
    await migrateDatabase();
    
    // Initialize default shop items
    await createDefaultShopItems();
});

module.exports = app;
