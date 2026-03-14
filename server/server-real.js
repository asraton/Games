const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { TonClient, WalletContractV4, internal, fromNano, toNano } = require('@ton/ton');
const { mnemonicNew, mnemonicToWalletKey } = require('@ton/crypto');
const axios = require('axios');

// MongoDB connection and models
const connectDB = require('./db');
const User = require('./models/User');
const ShopItem = require('./models/ShopItem');
const Purchase = require('./models/Purchase');

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB Atlas
connectDB();

// Helper function to check if MongoDB is connected
function isMongoConnected() {
    const mongoose = require('mongoose');
    return mongoose.connection.readyState === 1;
}

// In-memory storage fallback (if MongoDB fails)
const usersMemory = new Map();
const shopItemsMemory = new Map();
const purchasesMemory = [];

// TON Center API config
const TON_API_KEY = process.env.TON_API_KEY || '';
const TON_CENTER_ENDPOINT = 'https://toncenter.com/api/v2';

// TON client with API key
const client = new TonClient({
    endpoint: TON_CENTER_ENDPOINT + '/jsonRPC',
    apiKey: TON_API_KEY
});

// TON Center HTTP API helper
async function toncenterRequest(method, params = {}) {
    try {
        const url = `${TON_CENTER_ENDPOINT}/${method}`;
        const response = await axios.get(url, {
            params: {
                ...params,
                api_key: TON_API_KEY
            },
            timeout: 10000
        });
        return response.data;
    } catch (error) {
        console.error('TON Center API error:', error.message);
        throw error;
    }
}

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
        const result = await toncenterRequest('getAddressBalance', { address });
        if (result && result.ok) {
            // result.result - nanoton da keladi
            const nanoton = BigInt(result.result);
            const ton = Number(nanoton) / 1e9;
            return ton;
        }
        return 0;
    } catch (error) {
        console.error('Balance check error:', error);
        return 0;
    }
}

// REAL TON transactionlarini olish
async function getTransactions(address, limit = 10) {
    try {
        const result = await toncenterRequest('getTransactions', { 
            address, 
            limit,
            archival: true 
        });
        if (result && result.ok) {
            return result.result;
        }
        return [];
    } catch (error) {
        console.error('Transactions fetch error:', error);
        return [];
    }
}

// Foydalanuvchi ro'yxatdan o'tkazish
app.post('/api/user/register', async (req, res) => {
    try {
        const { userId, connectedWallet } = req.body;
        
        if (!userId || !connectedWallet) {
            return res.status(400).json({ error: 'userId va connectedWallet kerak' });
        }
        
        let user;
        
        if (isMongoConnected()) {
            // Use MongoDB
            user = await User.findOne({ userId });
            
            if (user) {
                // Yangilangan balansni olish
                const realBalance = await getRealTonBalance(user.depositWallet.address);
                
                // Agar real balance ko'p bo'lsa, yangi deposit bor
                if (realBalance > user.totalDeposited) {
                    const newDeposit = realBalance - user.totalDeposited;
                    user.totalDeposited = realBalance;
                    user.balance = user.totalDeposited - user.totalConverted;
                    user.lastDepositAt = new Date();
                    await user.save();
                    
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
                        newDeposit: realBalance > user.totalDeposited ? realBalance - user.totalDeposited : 0
                    }
                });
            }
            
            // Yangi deposit wallet yaratish
            const depositWallet = await createDepositWallet();
            
            // Yangi foydalanuvchi yaratish
            user = new User({
                userId,
                connectedWallet,
                depositWallet,
                balance: 0,
                jettonBalance: 0,
                totalDeposited: 0,
                totalConverted: 0,
                purchasedItems: [],
                lastDepositAt: null,
                lastBalanceCheck: null,
                globalStats: {
                    totalClicksAllTime: 0,
                    totalCoinsCollected: 0,
                    totalTonEarned: 0,
                    gamesPlayed: 0,
                    firstPlayed: new Date().toISOString(),
                    lastPlayed: null
                }
            });
            
            await user.save();
            
        } else {
            // Fallback to in-memory
            user = usersMemory.get(userId);
            
            if (user) {
                const realBalance = await getRealTonBalance(user.depositWallet.address);
                
                if (realBalance > user.totalDeposited) {
                    const newDeposit = realBalance - user.totalDeposited;
                    user.totalDeposited = realBalance;
                    user.balance = user.totalDeposited - user.totalConverted;
                    user.lastDepositAt = new Date();
                    
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
                        newDeposit: realBalance > user.totalDeposited ? realBalance - user.totalDeposited : 0
                    }
                });
            }
            
            const depositWallet = await createDepositWallet();
            
            user = {
                userId,
                connectedWallet,
                depositWallet,
                balance: 0,
                jettonBalance: 0,
                totalDeposited: 0,
                totalConverted: 0,
                purchasedItems: [],
                createdAt: new Date(),
                lastDepositAt: null,
                lastBalanceCheck: null,
                globalStats: {
                    totalClicksAllTime: 0,
                    totalCoinsCollected: 0,
                    totalTonEarned: 0,
                    gamesPlayed: 0,
                    firstPlayed: new Date().toISOString(),
                    lastPlayed: null
                }
            };
            
            usersMemory.set(userId, user);
        }
        
        console.log(`✅ Yangi user yaratildi: ${userId}`);
        console.log(`🏦 Deposit address: ${user.depositWallet.address}`);
        
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
                newDeposit: 0
            }
        });
        
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Server xatoligi' });
    }
});

// Foydalanuvchi ma'lumotlarini olish
app.get('/api/user/:userId', async (req, res) => {
    try {
        let user;
        
        if (isMongoConnected()) {
            user = await User.findOne({ userId: req.params.userId });
        } else {
            user = usersMemory.get(req.params.userId);
        }
        
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
        let user;
        
        if (isMongoConnected()) {
            user = await User.findOne({ userId: req.params.userId });
        } else {
            user = usersMemory.get(req.params.userId);
        }
        
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
            user.lastDepositAt = new Date();
            
            if (isMongoConnected()) {
                await user.save();
            }
            
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
        
        for (const [userId, user] of users) {
            try {
                const realBalance = await getRealTonBalance(user.depositWallet.address);
                const previousDeposited = user.totalDeposited;
                
                // Yangi deposit tekshirish
                if (realBalance > previousDeposited) {
                    const newDeposit = realBalance - previousDeposited;
                    
                    user.totalDeposited = realBalance;
                    user.balance = user.totalDeposited - user.totalConverted;
                    user.lastDepositAt = new Date();
                    
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
        let items;
        
        if (isMongoConnected()) {
            items = await ShopItem.find({ isActive: true });
        } else {
            items = Array.from(shopItemsMemory.values()).filter(item => item.isActive);
        }
        
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
        
        let user, item;
        
        if (isMongoConnected()) {
            user = await User.findOne({ userId });
            item = await ShopItem.findOne({ itemId, isActive: true });
        } else {
            user = usersMemory.get(userId);
            item = shopItemsMemory.get(itemId);
        }
        
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
        
        if (isMongoConnected()) {
            await user.save();
            await Purchase.create({
                userId,
                itemId,
                price: item.price,
                purchasedAt: new Date()
            });
        } else {
            purchasesMemory.push({
                userId,
                itemId,
                price: item.price,
                purchasedAt: new Date()
            });
        }
        
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
        
        let user;
        
        if (isMongoConnected()) {
            user = await User.findOne({ userId });
        } else {
            user = usersMemory.get(userId);
        }
        
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
        
        if (isMongoConnected()) {
            await user.save();
        }
        
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
        const user = users.get(req.params.userId);
        if (!user) {
            return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
        }
        
        const items = Array.from(shopItems.values()).filter(item => 
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
        const { userId, amount, toAddress } = req.body;
        
        if (!userId || !amount || amount <= 0 || !toAddress) {
            return res.status(400).json({ 
                error: 'userId, amount va toAddress kerak' 
            });
        }
        
        let user;
        
        if (isMongoConnected()) {
            user = await User.findOne({ userId });
        } else {
            user = usersMemory.get(userId);
        }
        
        if (!user) {
            return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
        }
        
        // Mavjud TON miqdorini hisoblash (deposited - converted)
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
        
        // REAL TON transfer qilish
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
            
            // Get seqno
            const seqno = await contract.getSeqno();
            
            // Transfer amount (minus fee)
            const transferAmount = toNano(amount - 0.005); // 0.005 TON fee
            
            // Send transfer
            await contract.sendTransfer({
                seqno,
                secretKey: keyPair.secretKey,
                messages: [
                    internal({
                        to: toAddress,
                        value: transferAmount,
                        body: 'Withdraw from TON Coin Rush Game',
                        bounce: false
                    })
                ]
            });
            
            // totalDeposited ni kamaytirish (withdraw qilingan TON)
            user.totalDeposited -= amount;
            user.balance = user.totalDeposited - user.totalConverted;
            
            if (isMongoConnected()) {
                await user.save();
            }
            
            console.log(`✅ WITHDRAW SUCCESS: ${amount} TON`);
            
            res.json({
                success: true,
                message: `${amount} TON yechib olindi`,
                toAddress: toAddress,
                tonDeposited: user.totalDeposited,
                tonConverted: user.totalConverted,
                tonAvailable: user.balance,
                isReal: true,
                txHash: null
            });
            
        } catch (txError) {
            console.error('Transfer error:', txError);
            return res.status(500).json({ 
                error: 'Transfer qilishda xatolik',
                details: txError.message,
                isReal: true
            });
        }
        
    } catch (error) {
        console.error('Withdraw error:', error);
        res.status(500).json({ error: 'Server xatoligi' });
    }
});

// Wallet ma'lumotlarini ko'rish (debug)
app.get('/api/debug/wallet/:userId', async (req, res) => {
    try {
        let user;
        
        if (isMongoConnected()) {
            user = await User.findOne({ userId: req.params.userId });
        } else {
            user = usersMemory.get(req.params.userId);
        }
        
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

// Global stats saqlash
app.post('/api/user/:userId/stats', async (req, res) => {
    try {
        const { userId } = req.params;
        const { totalClicksAllTime, totalCoinsCollected, totalTonEarned, gamesPlayed } = req.body;
        
        let user;
        
        if (isMongoConnected()) {
            user = await User.findOne({ userId });
        } else {
            user = usersMemory.get(userId);
        }
        
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
        
        if (isMongoConnected()) {
            await user.save();
        }
        
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
        
        let user;
        
        if (isMongoConnected()) {
            user = await User.findOne({ userId });
        } else {
            user = usersMemory.get(userId);
        }
        
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
            description: 'Har bir tanga uchun 2x nTON',
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
        if (isMongoConnected()) {
            // Check if item exists in MongoDB
            const existingItem = await ShopItem.findOne({ itemId: item.itemId });
            if (!existingItem) {
                await ShopItem.create(item);
                console.log(`Shop item yaratildi: ${item.name}`);
            }
        } else {
            // Fallback to in-memory
            if (!shopItemsMemory.has(item.itemId)) {
                shopItemsMemory.set(item.itemId, item);
                console.log(`Shop item yaratildi: ${item.name}`);
            }
        }
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
    console.log('🔥 REAL TON COIN SERVER 🔥');
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
    console.log('   ✅ MongoDB database (persistent storage)');
    console.log('');
    console.log('📱 URLs:');
    console.log(`   Game: http://localhost:8080`);
    console.log(`   API: http://localhost:${PORT}/api`);
    console.log(`   Debug: http://localhost:${PORT}/api/debug/wallet/:userId`);
    console.log('');
    
    // Initialize default shop items
    await createDefaultShopItems();
});

module.exports = app;
