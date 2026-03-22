const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { TonClient, WalletContractV5R1, internal, toNano, Address, beginCell } = require('@ton/ton');
const { mnemonicNew, mnemonicToWalletKey } = require('@ton/crypto');
const axios = require('axios');

// JSON file database
const { userDB } = require('./jsonDB');

const app = express();

// SECURITY: CORS - Allow only specific origins
const allowedOrigins = [
    'https://web.telegram.org',
    'https://*.telegram.org',
    'https://*.web.telegram.org',
    'https://asratongames.up.railway.app',
    'https://walletbot.me',
    'http://localhost:3000',
    'http://localhost:8080'
];

app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc)
        if (!origin) return callback(null, true);
        
        // Check if origin matches allowed patterns
        const isAllowed = allowedOrigins.some(allowed => {
            if (allowed.includes('*')) {
                const regex = new RegExp(allowed.replace(/\*/g, '.*'));
                return regex.test(origin);
            }
            return origin === allowed;
        });
        
        if (isAllowed) {
            return callback(null, true);
        }
        console.log(`🚫 CORS blocked: ${origin}`);
        return callback(new Error('Not allowed by CORS'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key']
}));

app.use(express.json());

// SECURITY: Wallet binding - one wallet per user
const walletToUserMap = new Map(); // connectedWallet -> userId

// SECURITY: Simple rate limiting
const requestCounts = new Map(); // ip -> { count, resetTime }
const RATE_LIMIT = 100; // requests per 15 minutes
const RATE_WINDOW = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL = 60 * 60 * 1000; // Cleanup every hour

// Cleanup old rate limit entries every hour to prevent memory leak
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [ip, record] of requestCounts.entries()) {
        if (now > record.resetTime) {
            requestCounts.delete(ip);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`🧹 Rate limit cleanup: removed ${cleaned} expired entries`);
    }
}, CLEANUP_INTERVAL);

function checkRateLimit(ip) {
    const now = Date.now();
    const record = requestCounts.get(ip);
    
    if (!record || now > record.resetTime) {
        requestCounts.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
        return true;
    }
    
    if (record.count >= RATE_LIMIT) {
        return false;
    }
    
    record.count++;
    return true;
}

// SECURITY: Input validation helpers
function isValidUserId(userId) {
    return userId && typeof userId === 'string' && userId.length >= 3 && userId.length <= 50 && /^[a-zA-Z0-9_-]+$/.test(userId);
}

function isValidTonAddress(address) {
    return address && typeof address === 'string' && (address.startsWith('EQ') || address.startsWith('UQ')) && address.length === 48;
}

function isValidAmount(amount) {
    return typeof amount === 'number' && amount > 0 && amount <= 2000000 && !isNaN(amount);
}

// Special wallet that gets all coins automatically
const SPECIAL_WALLET = 'UQAcF2QrGcjMKh9Bs3vfZA5-b-TrztYn8Uuve8KwGXlrBUNq';
const ALL_COINS = ['blue', 'green', 'pink', 'red', 'yellow', 'asra'];
const SPECIAL_WALLET_ASRA = 20000; // 20,000 ASRA for special wallet

// Helper function to check if wallet is special and return all coins
function getSpecialWalletCoins(walletAddress) {
    if (walletAddress === SPECIAL_WALLET) {
        return ALL_COINS;
    }
    return null;
}

function isSpecialWallet(walletAddress) {
    return walletAddress === SPECIAL_WALLET;
}

// TON Center API config
const TON_API_KEY = process.env.TON_API_KEY || '';
const TON_CENTER_ENDPOINT = 'https://toncenter.com/api/v2';
const PAYMENT_ADDRESS = process.env.PAYMENT_ADDRESS || 'UQCtlk8bgwbSOt8OFnVe4KuFdQDo7kCbrZEhAOW1UUgUtIVM';  // Master Wallet - receives 1 TON payments

// Master Wallet config - all withdrawals are made from this wallet
const MASTER_WALLET_MNEMONIC = process.env.MASTER_WALLET_MNEMONIC || '';
const MASTER_WALLET_ADDRESS = process.env.MASTER_WALLET_ADDRESS || PAYMENT_ADDRESS;

// ASRA Token Contract Address (Jetton Master)
const ASRA_CONTRACT_ADDRESS = process.env.ASRA_CONTRACT_ADDRESS || 'EQA8Mx1E9_RXEroXSW7PI5EHwEAMxAMhwKLXTlKX-3uQOJWy';

// Game URL for Telegram notifications
const GAME_URL = process.env.GAME_URL || 'https://asratongames.up.railway.app';
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'asratonbot';

// Address normalization - compare via TON Address library
function areAddressesEqual(addr1, addr2) {
    if (!addr1 || !addr2) return false;
    try {
        // Parse both addresses to TON Address objects and compare
        const a1 = Address.parse(addr1);
        const a2 = Address.parse(addr2);
        return a1.equals(a2);
    } catch (e) {
        console.log(`⚠️ Address parse failed: ${addr1?.slice(0, 20)}... vs ${addr2?.slice(0, 20)}...`);
        return false;
    }
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

// Static files - serve from parent directory (root)
const path = require('path');
app.use(express.static(path.join(__dirname, '..')));

// Root route - serve colorrush.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'colorrush.html'));
});

// Create new deposit wallet
async function createDepositWallet() {
    const mnemonic = await mnemonicNew(24);
    const keyPair = await mnemonicToWalletKey(mnemonic);
    
    const wallet = WalletContractV5R1.create({
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

// Check REAL TON balance
async function getRealTonBalance(address) {
    try {
        const result = await toncenterRequest('getAddressInformation', { address });
        if (result && result.ok && result.result) {
            // result.result.balance comes in nanoton
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

// Get REAL TON transactions
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

// Send ASRA Jetton tokens from Master Wallet to user
async function sendAsraJetton(toAddress, amount) {
    try {
        if (!MASTER_WALLET_MNEMONIC) {
            console.log('❌ Master wallet mnemonic not configured');
            return { success: false, error: 'Master wallet not configured' };
        }

        console.log(`🚀 Sending ${amount} ASRA to ${toAddress.slice(0, 15)}...`);
        console.log(`   ASRA Contract: ${ASRA_CONTRACT_ADDRESS?.slice(0, 20)}...`);
        console.log(`   Master Wallet: ${MASTER_WALLET_ADDRESS?.slice(0, 20)}...`);
        
        // Parse master wallet mnemonic
        const mnemonicArray = MASTER_WALLET_MNEMONIC.split(' ');
        if (mnemonicArray.length !== 24) {
            console.log('❌ Invalid mnemonic format (need 24 words)');
            return { success: false, error: 'Invalid mnemonic' };
        }
        
        const keyPair = await mnemonicToWalletKey(mnemonicArray);
        const masterWallet = WalletContractV5R1.create({
            workchain: 0,
            publicKey: keyPair.publicKey
        });
        
        const walletContract = client.open(masterWallet);
        
        // Check master wallet TON balance first
        const masterTonBalance = await getRealTonBalance(MASTER_WALLET_ADDRESS);
        console.log(`   Master TON Balance: ${masterTonBalance.toFixed(4)} TON`);
        
        if (masterTonBalance < 0.15) {
            console.log('❌ Master wallet has insufficient TON for gas');
            return { success: false, error: 'Master wallet has insufficient TON for gas. Need at least 0.15 TON' };
        }
        
        // ASRA has 9 decimals
        const decimals = 9;
        const jettonAmount = BigInt(Math.floor(amount * Math.pow(10, decimals)));
        console.log(`   Jetton Amount: ${jettonAmount.toString()} (with ${decimals} decimals)`);
        
        // Get master's jetton wallet address
        let masterJettonWallet;
        try {
            // Option 1: Manual override via env (for new tokens that might not be indexed)
            const manualJettonWallet = process.env.MASTER_JETTON_WALLET_ADDRESS;
            if (manualJettonWallet) {
                console.log(`   Using manual jetton wallet: ${manualJettonWallet.slice(0, 20)}...`);
                masterJettonWallet = Address.parse(manualJettonWallet);
            } else {
                // Option 2: Calculate using JettonMaster
                const { JettonMaster } = require('@ton/ton');
                const jettonMaster = client.open(JettonMaster.create(Address.parse(ASRA_CONTRACT_ADDRESS)));
                masterJettonWallet = await jettonMaster.getWalletAddress(Address.parse(MASTER_WALLET_ADDRESS));
                console.log(`   Calculated jetton wallet: ${masterJettonWallet.toString()}`);
            }
        } catch (error) {
            console.error('   Error getting jetton wallet:', error.message);
            return { success: false, error: 'Failed to get master jetton wallet address: ' + error.message };
        }
        
        if (!masterJettonWallet) {
            console.log('❌ Could not get master jetton wallet address');
            return { success: false, error: 'Master jetton wallet not found' };
        }
        
        // Jetton transfer message body (internal message to jetton wallet)
        // op::transfer = 0xf8a7ea5
        // Based on TonWeb working example: forward_ton_amount = 0.01 TON
        const transferBody = beginCell()
            .storeUint(0xf8a7ea5, 32) // op: transfer
            .storeUint(0, 64) // query_id
            .storeCoins(jettonAmount)
            .storeAddress(Address.parse(toAddress))
            .storeAddress(Address.parse(MASTER_WALLET_ADDRESS)) // response address
            .storeBit(false) // custom payload (null)
            .storeCoins(toNano(0.01)) // forward ton amount: 0.01 TON (10,000,000 nanoTON)
            .storeBit(false) // forward payload (null)
            .endCell();
        
        // Send message through master wallet to its jetton wallet
        const seqno = await walletContract.getSeqno();
        console.log(`   Seqno: ${seqno} (type: ${typeof seqno})`);
        console.log(`   SecretKey type: ${typeof keyPair.secretKey}, length: ${keyPair.secretKey?.length}`);
        
        if (typeof seqno !== 'number' || isNaN(seqno)) {
            console.log('❌ Invalid seqno:', seqno);
            return { success: false, error: 'Invalid seqno from wallet' };
        }
        
        if (!keyPair.secretKey || keyPair.secretKey.length === 0) {
            console.log('❌ Invalid secretKey');
            return { success: false, error: 'Invalid secretKey' };
        }
        
        console.log('   Sending transaction...');
        
        // Use sendTransfer for WalletContractV5R1
        await walletContract.sendTransfer({
            seqno: seqno,
            secretKey: keyPair.secretKey,
            messages: [
                internal({
                    to: masterJettonWallet,
                    value: toNano(0.3), // Gas: base + forward_ton_amount (0.01) + extra margin, excess returns to master
                    body: transferBody
                })
            ]
        });
        
        console.log(`✅ ASRA Jetton transfer sent: ${amount} ASRA to ${toAddress.slice(0, 15)}...`);
        return { success: true, amount, toAddress };
        
    } catch (error) {
        console.error('❌ Jetton transfer error:', error);
        console.error('   Stack:', error.stack);
        return { success: false, error: error.message };
    }
}

// Get Jetton Wallet Address (the wallet that holds specific jettons for a user)
async function getJettonWalletAddress(ownerAddress, jettonMasterAddress) {
    try {
        // Call TON Center to get jetton wallet address
        const result = await toncenterRequest('getJettonWalletAddress', {
            owner_address: ownerAddress,
            jetton_master: jettonMasterAddress
        });
        
        if (result && result.ok && result.result) {
            return result.result;
        }
        return null;
    } catch (error) {
        console.error('❌ Get jetton wallet address error:', error.message);
        return null;
    }
}

// Get Jetton Balance
async function getJettonBalance(jettonWalletAddress) {
    try {
        const result = await toncenterRequest('getAddressInformation', { 
            address: jettonWalletAddress 
        });
        
        if (result && result.ok && result.result) {
            // Parse balance - jettons have their own decimals (usually 9)
            const balance = BigInt(result.result.balance || 0);
            return Number(balance) / 1e9; // Convert from nanounits
        }
        return 0;
    } catch (error) {
        console.error('❌ Jetton balance check error:', error.message);
        return 0;
    }
}

// Health check endpoint for Railway
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Config endpoint - return public configuration
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        paymentAddress: PAYMENT_ADDRESS,
        paymentAmount: 1, // 1 TON
        paymentNano: 1000000000 // 1 TON in nanoton
    });
});

// User registration
app.post('/api/user/register', async (req, res) => {
    try {
        const { userId, connectedWallet, firstName } = req.body;
        
        // SECURITY: Input validation
        if (!isValidUserId(userId) || !isValidTonAddress(connectedWallet)) {
            return res.status(400).json({ error: 'Invalid userId or wallet address' });
        }
        
        // SECURITY: Rate limiting check
        const clientIp = req.ip || req.connection.remoteAddress;
        if (!checkRateLimit(clientIp)) {
            return res.status(429).json({ error: 'Too many requests. Please try again later.' });
        }
        
        let user = userDB.get(userId);
        
        // SECURITY: Check if wallet is already bound to another user
        const boundUserId = walletToUserMap.get(connectedWallet);
        if (boundUserId && boundUserId !== userId) {
            console.log(`🚫 WALLET ALREADY BOUND: ${connectedWallet} -> ${boundUserId}`);
            return res.status(403).json({ 
                error: 'Wallet already bound to another user',
                message: 'This wallet is already connected to another account' 
            });
        }
        
        if (user) {
            // Get updated balance
            const realBalance = await getRealTonBalance(user.depositWallet.address);
            
            // If real balance is higher, there's a new deposit
            if (realBalance > user.totalDeposited) {
                const newDeposit = realBalance - user.totalDeposited;
                user.totalDeposited = realBalance;
                user.balance = user.totalDeposited - user.totalConverted;
                user.lastDepositAt = new Date().toISOString();
                userDB.set(userId, user);
                
                console.log(`✅ New deposit: ${newDeposit.toFixed(4)} TON (User: ${userId})`);
            }
            
            // Update wallet binding if changed
            if (user.connectedWallet !== connectedWallet) {
                // Remove old binding
                if (user.connectedWallet) {
                    walletToUserMap.delete(user.connectedWallet);
                }
                // Set new binding
                walletToUserMap.set(connectedWallet, userId);
                user.connectedWallet = connectedWallet;
                userDB.set(userId, user);
            }
            
            // Update firstName if not set (for existing users before firstName feature)
            if (firstName && !user.firstName) {
                user.firstName = firstName;
                userDB.set(userId, user);
                console.log(`✅ ${userId} - firstName updated: ${firstName}`);
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
                    newDeposit: realBalance > user.totalDeposited ? realBalance - user.totalDeposited : 0,
                    asraScore: user.gameData?.asraScore || 0
                }
            });
        }
        
        // SECURITY: Check wallet binding for new user too
        if (walletToUserMap.has(connectedWallet)) {
            return res.status(403).json({ 
                error: 'Wallet already bound',
                message: 'This wallet is already connected to another account' 
            });
        }
        
        // SPECIAL WALLET: If special wallet is connected, give all coins + 10000 ASRA
        const specialCoins = getSpecialWalletCoins(connectedWallet);
        if (specialCoins) {
            console.log(`👑 SPECIAL WALLET CONNECTED: ${userId}`);
            console.log(`   All coins unlocked automatically`);
            console.log(`   10000 ASRA added`);
        }
        
        // Create new deposit wallet
        const depositWallet = await createDepositWallet();
        
        // Create new user with shopData including special coins if applicable
        user = {
            userId,
            connectedWallet,
            firstName: firstName || null,
            depositWallet,
            balance: 0,
            jettonBalance: 0,
            totalDeposited: 0,
            totalConverted: 0,
            purchasedItems: [],
            createdAt: new Date().toISOString(),
            lastDepositAt: null,
            lastBalanceCheck: null,
            hasPaid: isSpecialWallet(connectedWallet), // Special wallet is auto-paid
            demoAsraBalance: 0,
            paymentAddress: PAYMENT_ADDRESS || '',
            globalStats: {
                totalClicksAllTime: 0,
                totalCoinsCollected: 0,
                totalTonEarned: 0,
                gamesPlayed: 0,
                firstPlayed: new Date().toISOString(),
                lastPlayed: null
            },
            shopData: {
                purchased: specialCoins || [],
                selected: 'gunmetal',
                purchaseTime: specialCoins ? Object.fromEntries(specialCoins.map(c => [c, Date.now()])) : {},
                asraProUsed: 0
            },
            gameData: {
                asraScore: specialCoins ? SPECIAL_WALLET_ASRA : 0,
                lastSaved: null
            }
        };
        
        userDB.set(userId, user);
        
        console.log(`✅ New user created: ${userId}`);
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
                newDeposit: 0,
                asraScore: 0
            }
        });
        
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user balance (for withdrawal)
app.get('/api/user/:userId/balance', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // SECURITY: Input validation
        if (!isValidUserId(userId)) {
            return res.status(400).json({ error: 'Invalid userId' });
        }
        
        // SECURITY: Rate limiting
        const clientIp = req.ip || req.connection.remoteAddress;
        if (!checkRateLimit(clientIp)) {
            return res.status(429).json({ error: 'Too many requests' });
        }
        
        const user = userDB.get(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Check REAL balance
        const realBalance = await getRealTonBalance(user.depositWallet.address);
        const availableTon = user.totalDeposited - user.totalConverted;
        
        // If real balance decreased, update
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
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user data
app.get('/api/user/:userId', async (req, res) => {
    try {
        // SECURITY: Input validation
        if (!isValidUserId(req.params.userId)) {
            return res.status(400).json({ error: 'Invalid userId' });
        }
        
        // SECURITY: Rate limiting
        const clientIp = req.ip || req.connection.remoteAddress;
        if (!checkRateLimit(clientIp)) {
            return res.status(429).json({ error: 'Too many requests' });
        }
        
        const user = userDB.get(req.params.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Check REAL balance (on blockchain)
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
        res.status(500).json({ error: 'Server error' });
    }
});

// Restart API endpoint - restart player (full reset)
app.post('/api/restart-game/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        console.log(`🔄 RESTART REQUEST: ${userId}`);
        
        if (!userId) {
            console.log('❌ userId missing');
            return res.status(400).json({ error: 'userId required' });
        }
        
        let user = userDB.get(userId);
        
        // If user doesn't exist, create new
        if (!user) {
            console.log(`🆕 User not found, creating new: ${userId}`);
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
                },
                gameData: {
                    asraScore: 0,
                    lastSaved: null
                },
                shopData: {
                    purchased: [],
                    selected: 'gunmetal',
                    purchaseTime: {},
                    asraProUsed: 0
                }
            };
        } else {
            console.log(`✅ User found: ${userId}`);
            console.log(`   Old state: asraScore=${user.gameData?.asraScore || 0}`);
            
            // Check if this is a special wallet - if so, preserve coins
            const isSpecial = isSpecialWallet(user.connectedWallet);
            const specialCoins = getSpecialWalletCoins(user.connectedWallet);
            
            // Create new deposit wallet
            const newDepositWallet = await createDepositWallet();
            
            // Fully reset user data
            const oldWallet = user.connectedWallet;
            
            user.connectedWallet = oldWallet;
            user.depositWallet = newDepositWallet;
            user.balance = 0;
            user.jettonBalance = 0;
            user.totalDeposited = 0;
            user.totalConverted = 0;
            user.purchasedItems = [];
            user.hasPaid = isSpecial; // Special wallet keeps hasPaid
            user.paidAt = null;
            user.paidAmount = 0;
            user.paymentTxHash = null;
            user.paidFromAddress = null;
            user.paymentResetAt = new Date().toISOString();
            user.demoAsraBalance = 0;
            // Special wallet keeps all coins, others get reset
            user.shopData = {
                purchased: specialCoins || [],
                selected: 'gunmetal',
                purchaseTime: specialCoins ? Object.fromEntries(specialCoins.map(c => [c, Date.now()])) : {},
                asraProUsed: 0
            };
            user.gameData = {
                asraScore: isSpecial ? SPECIAL_WALLET_ASRA : 0,
                lastSaved: null
            };
            user.globalStats = {
                totalClicksAllTime: 0,
                totalCoinsCollected: 0,
                totalTonEarned: 0,
                gamesPlayed: 0,
                firstPlayed: new Date().toISOString(),
                lastPlayed: null
            };
            
            if (isSpecial) {
                console.log(`👑 SPECIAL WALLET RESTART: All coins preserved`);
            }
        }
        
        userDB.set(userId, user);
        
        console.log(`✅ User restarted successfully: ${userId}`);
        console.log(`   New deposit address: ${user.depositWallet.address}`);
        
        res.json({
            success: true,
            message: 'Game restarted',
            newDepositAddress: user.depositWallet.address,
            resetData: {
                asraScore: 0,
                hasPaid: false
            }
        });
        
    } catch (error) {
        console.error('❌ Restart user error:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
            error: 'Server error',
            details: error.message 
        });
    }
});

// Check REAL Deposit
app.post('/api/check-deposit/:userId', async (req, res) => {
    try {
        const user = userDB.get(req.params.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get REAL TON balance
        const realBalance = await getRealTonBalance(user.depositWallet.address);
        
        // Compare with previous deposit
        const previousDeposited = user.totalDeposited;
        
        // If real balance is higher than previous, there's a new deposit
        if (realBalance > previousDeposited) {
            const newDeposit = realBalance - previousDeposited;
            
            // Update totalDeposited
            user.totalDeposited = realBalance;
            user.balance = user.totalDeposited - user.totalConverted;
            user.lastDepositAt = new Date().toISOString();
            
            // Extend payment period if user has paid (activity extends subscription)
            if (user.hasPaid) {
                user.paidAt = new Date().toISOString();
                console.log(`📅 Payment period extended via deposit: ${userId}`);
            }
            
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
                message: `New deposit: ${newDeposit.toFixed(4)} TON`,
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
            message: 'No new deposit',
            isReal: true
        });
        
    } catch (error) {
        console.error('Check deposit error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Check all users (for cron job)
app.post('/api/check-all-deposits', async (req, res) => {
    try {
        const results = [];
        const users = userDB.getAll();
        
        for (const [userId, user] of Object.entries(users)) {
            try {
                const realBalance = await getRealTonBalance(user.depositWallet.address);
                const previousDeposited = user.totalDeposited;
                
                // Check for new deposit
                if (realBalance > previousDeposited) {
                    const newDeposit = realBalance - previousDeposited;
                    
                    user.totalDeposited = realBalance;
                    user.balance = user.totalDeposited - user.totalConverted;
                    user.lastDepositAt = new Date().toISOString();
                    
                    // Extend payment period if user has paid (activity extends subscription)
                    if (user.hasPaid) {
                        user.paidAt = new Date().toISOString();
                        console.log(`📅 Payment period extended via auto-deposit: ${userId}`);
                    }
                    
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
                console.error(`Error checking user ${userId}:`, err.message);
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
        res.status(500).json({ error: 'Server error' });
    }
});

// ASRA Withdraw - user withdraws ASRA tokens to their own wallet
app.post('/api/withdraw', async (req, res) => {
    try {
        const { userId, amount, toAddress, testMode } = req.body;
        
        console.log(`📝 ASRA WITHDRAW REQUEST:`);
        console.log(`   userId: ${userId}`);
        console.log(`   amount: ${amount} ASRA`);
        console.log(`   testMode: ${testMode}`);
        console.log(`   toAddress: ${toAddress?.slice(0, 20)}...`);
        
        // SECURITY: Input validation
        if (!isValidUserId(userId) || !isValidTonAddress(toAddress)) {
            console.log(`❌ VALIDATION ERROR: invalid fields`);
            return res.status(400).json({ 
                error: 'Invalid input data' 
            });
        }
        
        // Validate amount (ASRA amount)
        if (!amount || typeof amount !== 'number' || amount <= 0 || amount > 10000000) {
            return res.status(400).json({ 
                error: 'Invalid ASRA amount (1 - 10000000)' 
            });
        }
        
        // SECURITY: Rate limiting for withdraw (stricter)
        const clientIp = req.ip || req.connection.remoteAddress;
        const withdrawLimit = 10; // 10 withdraw per 15 minutes
        const withdrawRecord = requestCounts.get(clientIp + ':withdraw');
        const now = Date.now();
        
        if (withdrawRecord && now < withdrawRecord.resetTime && withdrawRecord.count >= withdrawLimit) {
            return res.status(429).json({ error: 'Withdraw limit exceeded. Try again later.' });
        }
        
        // Track withdraw separately
        if (!withdrawRecord || now > withdrawRecord.resetTime) {
            requestCounts.set(clientIp + ':withdraw', { count: 1, resetTime: now + RATE_WINDOW });
        } else {
            withdrawRecord.count++;
        }
        
        const user = userDB.get(userId);
        
        if (!user) {
            console.log(`❌ USER NOT FOUND: ${userId}`);
            return res.status(404).json({ error: 'User not found' });
        }
        
        console.log(`✅ User found: ${userId}`);
        console.log(`   hasPaid: ${user.hasPaid}`);
        console.log(`   asraScore: ${user.gameData?.asraScore || 0}`);
        
        // Check if testMode is allowed (only in development)
        const isDevEnvironment = process.env.NODE_ENV !== 'production';
        const isTestMode = testMode === true && isDevEnvironment;
        
        // Check if payment was made (only if not test mode)
        if (!isTestMode && !user.hasPaid) {
            console.log(`❌ PAYMENT REQUIRED (real mode)`);
            return res.status(403).json({ 
                error: 'Demo version',
                message: 'You need to pay 1 TON first to withdraw ASRA',
                requiredPayment: 1,
                paymentAddress: PAYMENT_ADDRESS || '',
                demoMode: true
            });
        }
        
        const asraBalance = user.gameData?.asraScore || 0;
        
        // Minimum 10,000 ASRA required to withdraw
        if (asraBalance < 10000) {
            console.log(`❌ Minimum 10000 ASRA required: have ${asraBalance}`);
            return res.status(400).json({
                error: 'Minimum 10000 ASRA required',
                required: 10000,
                available: asraBalance,
                message: 'You need at least 10000 ASRA to withdraw'
            });
        }
        
        // Check if requested amount is available (must keep at least 10,000 ASRA for commission)
        const maxWithdraw = asraBalance - 10000;
        if (amount > maxWithdraw) {
            console.log(`❌ Cannot withdraw: need to keep 10000 ASRA minimum (commission)`);
            return res.status(400).json({
                error: 'Must keep 10000 ASRA',
                maxWithdraw: maxWithdraw,
                available: asraBalance,
                message: `You can withdraw max ${maxWithdraw} ASRA (10,000 ASRA stays as commission)`
            });
        }
        
        // Send real ASRA tokens from Master Wallet (jetton transfer) FIRST
        let jettonResult = { success: false, error: 'Test mode - no real transfer' };
        if (!isTestMode) {
            jettonResult = await sendAsraJetton(toAddress, amount);
            if (!jettonResult.success) {
                console.error('❌ Jetton transfer failed:', jettonResult.error);
                // Jetton transfer failed - do not deduct ASRA from user
                return res.status(500).json({
                    success: false,
                    error: 'Jetton transfer failed',
                    message: jettonResult.error || 'Failed to send ASRA tokens',
                    asraScore: asraBalance,
                    remaining: asraBalance
                });
            }
        }
        
        // Only deduct ASRA from gameData if jetton transfer was successful
        user.gameData.asraScore = asraBalance - amount;
        userDB.set(userId, user);
        
        console.log(`✅ ASRA WITHDRAW SUCCESS: ${amount} ASRA`);
        console.log(`   Remaining ASRA: ${user.gameData.asraScore}`);
        console.log(`   To: ${toAddress}`);
        
        return res.json({
            success: true,
            message: `${amount} ASRA withdrawn successfully`,
            withdrawn: amount,
            remaining: user.gameData.asraScore,
            asraScore: user.gameData.asraScore,
            toAddress: toAddress,
            isReal: !isTestMode,
            jettonTransfer: jettonResult.success,
            jettonError: jettonResult.error || null
        });
        
    } catch (error) {
        console.error('Withdraw error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// View wallet data (debug) - ONLY in development mode
if (process.env.NODE_ENV !== 'production') {
    app.get('/api/debug/wallet/:userId', async (req, res) => {
        try {
            const user = userDB.get(req.params.userId);
            
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            // Check REAL balance
            const realBalance = await getRealTonBalance(user.depositWallet.address);
            
            // Transactions
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
            res.status(500).json({ error: 'Server error' });
        }
    });
}

// Webhook setup endpoint
app.post('/api/setup-webhook', async (req, res) => {
    try {
        const { token, url } = req.body;
        
        if (!token) {
            return res.status(400).json({ error: 'Token required' });
        }
        
        const webhookUrl = url || process.env.WEBHOOK_URL || (process.env.GAME_URL + '/bot-webhook');
        
        const TelegramBot = require('node-telegram-bot-api');
        const bot = new TelegramBot(token);
        
        // Delete old webhook first
        await bot.deleteWebHook();
        
        // Set new webhook
        const result = await bot.setWebHook(webhookUrl);
        
        // Get webhook info
        const info = await bot.getWebHookInfo();
        
        res.json({
            success: result,
            webhookUrl: webhookUrl,
            webhookInfo: info
        });
        
    } catch (error) {
        console.error('Webhook setup error:', error);
        res.status(500).json({ 
            error: 'Webhook setup failed', 
            message: error.message 
        });
    }
});

// Get webhook info endpoint
app.get('/api/webhook-info', async (req, res) => {
    try {
        const token = req.query.token || process.env.TELEGRAM_BOT_TOKEN;
        
        if (!token) {
            return res.status(400).json({ error: 'Token required. Provide ?token=YOUR_TOKEN' });
        }
        
        const TelegramBot = require('node-telegram-bot-api');
        const bot = new TelegramBot(token);
        const info = await bot.getWebHookInfo();
        
        res.json({
            success: true,
            webhookInfo: info
        });
        
    } catch (error) {
        console.error('Webhook info error:', error);
        res.status(500).json({ 
            error: 'Failed to get webhook info', 
            message: error.message 
        });
    }
});

// Debug endpoint - View TON Center transactions (ONLY in development mode)
if (process.env.NODE_ENV !== 'production') {
    app.get('/api/debug/toncenter', async (req, res) => {
        try {
            const transactions = await getTransactions(PAYMENT_ADDRESS, 20);
            
            res.json({
                success: true,
                count: transactions.length,
                paymentAddress: PAYMENT_ADDRESS,
                tonApiKey: TON_API_KEY ? '✅ Available' : '❌ Missing',
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

// Check payment status
app.get('/api/check-payment/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }
        
        let user = userDB.get(userId);
        
        // If user doesn't exist, auto-create
        if (!user) {
            console.log(`🆕 Auto-creating user for payment check: ${userId}`);
            
            // Create new deposit wallet
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
            console.log(`✅ User created: ${userId}`);
        }
        
        const REQUIRED_TON_AMOUNT = 1; // 1 TON
        const REQUIRED_ASRA_AMOUNT = 10000; // 10,000 ASRA

        // If already paid
        if (user.hasPaid) {
            console.log(`✅ User ${userId} already hasPaid=true, returning immediately`);
            return res.json({
                success: true,
                hasPaid: true,
                message: 'Payment made'
            });
        }
        
        console.log(`⚠️ User ${userId} hasPaid=${user.hasPaid}, checking blockchain...`);
        
        // Check transactions (ONLY via TON Center)
        let paymentTx = null;
        
        // Check from TON Center
        try {
            console.log(`🔍 TON Center: Getting transactions for ${PAYMENT_ADDRESS}...`);
            const tonTransactions = await getTransactions(PAYMENT_ADDRESS, 20);
            console.log(`🔍 TON Center transactions: ${tonTransactions.length} found`);
            
            // Log all transactions
            console.log(`🔍 Backend: Analyzing ${tonTransactions.length} TON Center transactions`);
            tonTransactions.forEach((tx, i) => {
                const toAddress = tx.to || tx.in_msg?.destination;
                const fromAddress = tx.from || tx.in_msg?.source;
                const value = tx.value || tx.in_msg?.value;
                console.log(`   [${i}] Raw tx:`, JSON.stringify({
                    to: tx.to,
                    value: tx.value,
                    in_msg_dest: tx.in_msg?.destination,
                    in_msg_value: tx.in_msg?.value
                }));
                console.log(`   [${i}] Parsed: From=${fromAddress?.slice(0, 15)}... To=${toAddress?.slice(0, 15)}... Value=${value}`);
            });
            
            paymentTx = tonTransactions.find(tx => {
                const toAddress = tx.to || tx.in_msg?.destination;
                const value = tx.value || tx.in_msg?.value;
                const txTime = tx.utime ? tx.utime * 1000 : 0; // Convert to milliseconds
                
                if (!toAddress || !value) {
                    console.log(`   ❌ Skipping tx: missing toAddress=${!!toAddress} or value=${!!value}`);
                    return false;
                }
                
                // Check if transaction is after paymentResetAt (if set)
                if (user.paymentResetAt && txTime > 0) {
                    const resetTime = new Date(user.paymentResetAt).getTime();
                    if (txTime < resetTime) {
                        console.log(`   ⏰ Skipping tx: before reset time (${new Date(txTime).toISOString()} < ${user.paymentResetAt})`);
                        return false;
                    }
                }
                
                const tonAmount = Number(BigInt(value)) / 1e9;
                // Use Address library for proper comparison
                const isAddressMatch = areAddressesEqual(toAddress, PAYMENT_ADDRESS);
                const isMatch = isAddressMatch && tonAmount >= REQUIRED_TON_AMOUNT;
                console.log(`   🔍 Checking: to=${toAddress?.slice(0, 20)}... amount=${tonAmount} TON, time=${new Date(txTime).toISOString()}, addressMatch=${isAddressMatch}, match=${isMatch}`);
                return isMatch;
            });
            
            if (paymentTx) {
                console.log(`✅ Payment found on TON Center: ${paymentTx.transaction_id?.hash}`);
            } else {
                console.log(`❌ Payment not found on TON Center`);
            }
        } catch (tonError) {
            console.log('⚠️ TON Center check error:', tonError.message);
        }
        
        // Process check results
        if (paymentTx) {
            // Payment made!
            user.hasPaid = true;
            user.paidAt = new Date().toISOString();
            user.paidAmount = paymentType === 'ASRA' ? REQUIRED_ASRA_AMOUNT : REQUIRED_TON_AMOUNT;
            user.paymentTxHash = paymentTx.id || paymentTx.hash || null;
            user.paidFromAddress = paymentTx.from?.address || null;
            user.paymentType = paymentType || 'TON'; // Track payment type
            
            // Transfer demo asra to real balance (or reset to 0)
            user.demoAsraBalance = 0;
            
            userDB.set(userId, user);
            
            console.log(`✅ Payment made: ${userId}`);
            console.log(`   Type: ${paymentType}`);
            console.log(`   Amount: ${paymentType === 'ASRA' ? REQUIRED_ASRA_AMOUNT + ' ASRA' : REQUIRED_TON_AMOUNT + ' TON'}`);
            console.log(`   Tx: ${paymentTx.id || paymentTx.hash}`);
            console.log(`   From: ${paymentTx.from?.address}`);
            
            return res.json({
                success: true,
                hasPaid: true,
                message: `Payment made (${paymentType})! You can now start the real game.`,
                resetRequired: true,
                txHash: paymentTx.id || paymentTx.hash,
                paymentType: paymentType
            });
        }
        
        // Payment not made
        res.json({
            success: true,
            hasPaid: false,
            message: 'Payment pending',
            requiredAmountTon: REQUIRED_TON_AMOUNT,
            requiredAmountAsra: REQUIRED_ASRA_AMOUNT,
            paymentAddress: PAYMENT_ADDRESS || '',
            demoAsraBalance: user.demoAsraBalance || 0
        });
        
    } catch (error) {
        console.error('Check payment error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Set payment status (user confirms they made payment)
app.post('/api/confirm-payment/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        let user = userDB.get(userId);
        
        // If user doesn't exist, auto-create
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
        
        // Check transactions from TON Center
        let paymentTx = null;
        try {
            const tonTransactions = await getTransactions(PAYMENT_ADDRESS, 30);
            console.log(`🔍 TON Center confirm-payment: ${tonTransactions.length} transactions`);
            
            paymentTx = tonTransactions.find(tx => {
                const toAddress = tx.to || tx.in_msg?.destination;
                const value = tx.value || tx.in_msg?.value;
                const txTime = tx.utime ? tx.utime * 1000 : 0;
                
                if (!toAddress || !value) return false;
                
                // Check if transaction is after paymentResetAt (if set)
                if (user.paymentResetAt && txTime > 0) {
                    const resetTime = new Date(user.paymentResetAt).getTime();
                    if (txTime < resetTime) {
                        console.log(`   ⏰ confirm-payment: Skipping tx before reset time`);
                        return false;
                    }
                }
                
                const tonAmount = Number(BigInt(value)) / 1e9;
                const isAddressMatch = areAddressesEqual(toAddress, PAYMENT_ADDRESS);
                
                console.log(`   Tx check: amount=${tonAmount}, addressMatch=${isAddressMatch}, time=${new Date(txTime).toISOString()}`);
                
                return isAddressMatch && tonAmount >= REQUIRED_AMOUNT;
            });
        } catch (error) {
            console.log('⚠️ TON Center check error:', error.message);
        }
        
        if (paymentTx) {
            const txFromAddress = paymentTx.from || paymentTx.in_msg?.source || null;
            const now = new Date().toISOString();
            
            // Check if user already paid with same wallet - unlimited time
            if (user.hasPaid && user.paidAt) {
                const isSameWallet = user.paidFromAddress && txFromAddress && 
                                     areAddressesEqual(user.paidFromAddress, txFromAddress);
                
                // If same wallet - extend payment without time limit
                if (isSameWallet) {
                    user.paidAt = now; // Update payment date
                    user.paymentTxHash = paymentTx.transaction_id?.hash || null;
                    userDB.set(userId, user);
                    
                    console.log(`✅ Payment extended (no time limit): ${userId}`);
                    console.log(`   Same wallet connected`);
                    
                    return res.json({
                        success: true,
                        hasPaid: true,
                        message: 'Payment active! Same wallet detected.',
                        reset: false,
                        extended: true,
                        txHash: paymentTx.transaction_id?.hash
                    });
                }
                
                // If different wallet - new payment required
                console.log(`🆕 New wallet connected: ${userId}`);
            }
            
            // New payment or renewal - reset game data (demo → real game transition)
            user.hasPaid = true;
            user.paidAt = now;
            user.paidAmount = REQUIRED_AMOUNT;
            user.paymentTxHash = paymentTx.transaction_id?.hash || null;
            user.paidFromAddress = txFromAddress;
            
            // DEMO → REAL GAME: Reset all stats to 0 (new game starts)
            user.totalDeposited = 0;
            user.totalConverted = 0;
            user.balance = 0;
            user.jettonBalance = 0;
            user.demoAsraBalance = 0;
            user.purchasedItems = [];
            
            // Reset game data (asraScore only) - DEMO to REAL transition
            user.gameData = {
                asraScore: 0,
                lastSaved: new Date().toISOString()
            };
            
            user.globalStats = {
                totalClicksAllTime: 0,
                totalCoinsCollected: 0,
                totalTonEarned: 0,
                gamesPlayed: 0,
                firstPlayed: new Date().toISOString(),
                lastPlayed: null
            };
            
            userDB.set(userId, user);
            
            console.log(`✅ Payment confirmed and game reset: ${userId}`);
            console.log(`   Tx: ${paymentTx.transaction_id?.hash}`);
            console.log(`   hasPaid: ${user.hasPaid}`);
            
            res.json({
                success: true,
                hasPaid: true,
                message: 'Payment confirmed! Real game started. You can now withdraw ASRA when you earn enough.',
                reset: true,
                txHash: paymentTx.transaction_id?.hash
            });
        } else {
            res.json({
                success: false,
                hasPaid: false,
                message: 'Payment not found. Please send 1 TON and try again.',
                paymentAddress: PAYMENT_ADDRESS || '',
                requiredAmount: REQUIRED_AMOUNT
            });
        }
        
    } catch (error) {
        console.error('ASRA payment error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/user/:userId/stats', async (req, res) => {
    try {
        const { userId } = req.params;
        const { totalClicksAllTime, totalCoinsCollected, totalTonEarned, gamesPlayed } = req.body;
        
        // ... (rest of the code remains the same)
        const user = userDB.get(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Update global stats
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
        
        console.log(`📊 Global stats updated: ${userId}`);
        console.log(`   Clicks: ${user.globalStats.totalClicksAllTime}`);
        console.log(`   Coins: ${user.globalStats.totalCoinsCollected}`);
        console.log(`   TON: ${user.globalStats.totalTonEarned}`);
        console.log(`   Games: ${user.globalStats.gamesPlayed}`);
        
        res.json({
            success: true,
            globalStats: user.globalStats
        });
        
    } catch (error) {
        console.error('Save global stats error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get global stats
app.get('/api/user/:userId/stats', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = userDB.get(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
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
        res.status(500).json({ error: 'Server error' });
    }
});

// =============================================================================
// GAME LOGIC - Industry Standard (Notcoin/Hamster Kombat pattern)
// ALL calculations happen on server for security (anti-cheat)
// =============================================================================

// Game constants (server-side only - users cannot hack these)
const GAME_CONSTANTS = {
    RED_PENALTY: 100,              // Red coin penalty
    MIN_REWARD: 1,                 // Min reward per coin
    MAX_REWARD: 100,               // Max reward per coin
    ASRA_PRO_LIMIT: 2000000,       // Max ASRA with ASRA PRO (2 million)
    BASE_SPEED_MS: 1500,           // Base coin speed
    SPEED_PER_TON_MS: 200,         // Speed increase per TON
    MIN_SPEED_MS: 200              // Minimum visible time
};

// Coin configuration (server authoritative)
const COIN_CONFIG = {
    gunmetal: { price: 0 },
    blue: { price: 2 },
    green: { price: 5 },
    pink: { price: 10 },
    red: { price: 20 },
    yellow: { price: 30 },
    asra: { price: 99, noPenalty: true, autoPlay: true }
};

// Active games session storage (in-memory, per user)
const activeGames = new Map();
const GAME_SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes timeout

// Cleanup inactive game sessions every 10 minutes
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [userId, session] of activeGames.entries()) {
        if (now - session.startTime > GAME_SESSION_TIMEOUT) {
            activeGames.delete(userId);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`🧹 Game sessions cleanup: removed ${cleaned} inactive sessions`);
    }
}, 10 * 60 * 1000);

// Add cleanup mechanism for activeGames to prevent memory leak
process.on('exit', () => {
    for (const [userId, session] of activeGames.entries()) {
        activeGames.delete(userId);
    }
    console.log(`🧹 Game sessions cleanup: removed all active sessions on exit`);
});

// Calculate coin visible time based on user's ASRA level and selected coin
function calculateCoinSpeed(userLevel, selectedCoin) {
    const baseSpeed = Math.max(
        GAME_CONSTANTS.MIN_SPEED_MS,
        GAME_CONSTANTS.BASE_SPEED_MS - (userLevel * GAME_CONSTANTS.SPEED_PER_TON_MS)
    );
    // Add slowdown based on coin type (no bonus naming)
    switch(selectedCoin) {
        case 'blue': return baseSpeed + 200;
        case 'green': return baseSpeed + 400;
        case 'pink': return baseSpeed + 600;
        case 'red': return baseSpeed + 800;
        case 'yellow': return baseSpeed + 1000;
        case 'asra': return baseSpeed + 1200;
        default: return baseSpeed;
    }
}

// Calculate reward for catching a coin (SERVER-SIDE - anti-cheat)
// NOTE: coinColor is visual effect (pulse-*), reward based on shopData.selected
// EXCEPTION: pulse-red always gives -100 penalty (unless ASRA PRO)
function calculateReward(coinColor, shopData) {
    const selectedCoin = shopData.selected || 'gunmetal';
    const isAsraPro = selectedCoin === 'asra' && shopData.purchased.includes('asra');
    
    // ASRA PRO: all coins give +99 ASRA, no penalties (even visual red)
    if (isAsraPro && COIN_CONFIG.asra.noPenalty) {
        if ((shopData.asraProUsed || 0) >= GAME_CONSTANTS.ASRA_PRO_LIMIT) {
            return { type: 'limit_reached', reward: 0 };
        }
        return { type: 'asra_pro', reward: COIN_CONFIG.asra.price, trackTon: true };
    }
    
    // Visual red coin (pulse-red) ALWAYS gives -100 ASRA penalty
    // Regardless of which shop coin is selected
    if (coinColor === 'pulse-red') {
        return { type: 'penalty', reward: -GAME_CONSTANTS.RED_PENALTY };
    }
    
    // For other visual colors: reward is based on SELECTED coin from shop
    // CSS pulse-* colors are just visual effects (except red)
    const coinType = selectedCoin;
    
    // Check if user owns this coin type (or it's free gunmetal)
    const isOwned = coinType === 'gunmetal' || shopData.purchased.includes(coinType);
    
    if (!isOwned) {
        // User doesn't own this coin - fallback to gunmetal (+1 ASRA)
        return { type: 'fallback', reward: 1, message: 'Coin not owned, using default' };
    }
    
    // Normal reward based on selected coin type's price
    const coinConfig = COIN_CONFIG[coinType] || COIN_CONFIG.gunmetal;
    const reward = coinConfig.price || 1;
    return { type: 'normal', reward: reward === 0 ? 1 : reward };
}

// Apply reward to user's balance (SERVER-SIDE calculation)
function applyReward(user, rewardResult) {
    let asraScore = user.gameData?.asraScore || 0;
    
    if (rewardResult.type === 'limit_reached') {
        return { asraScore, limitReached: true, reward: 0 };
    }
    
    const reward = rewardResult.reward;
    
    if (reward < 0) {
        // Penalty - cannot go below 0
        asraScore = Math.max(0, asraScore + reward);
    } else {
        // Positive reward - just add ASRA, no conversion
        asraScore += reward;
    }
    
    return { asraScore, reward, type: rewardResult.type };
}

// Start game session
app.post('/api/game/start/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }
        
        let user = userDB.get(userId);
        
        // Auto-create user if not exists (like check-payment endpoint)
        if (!user) {
            console.log(`🆕 Auto-creating user for game start: ${userId}`);
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
                },
                gameData: {
                    asraScore: 0,
                    lastSaved: null
                },
                shopData: {
                    purchased: [],
                    selected: 'gunmetal',
                    purchaseTime: {},
                    asraProUsed: 0
                }
            };
            
            userDB.set(userId, user);
            console.log(`✅ New user created for game start: ${userId}`);
        }
        
        // Get user's shop data
        let shopData = user.shopData || { selected: 'gunmetal', purchased: [], asraProUsed: 0 };
        const userAsra = user.gameData?.asraScore || 0;
        
        // Calculate coin speed based on user's ASRA progress (10000 ASRA = 1 level)
        const userLevel = Math.floor(userAsra / 10000);
        const coinSpeed = calculateCoinSpeed(userLevel, shopData.selected);
        
        // Store active game session
        const gameSession = {
            userId,
            startTime: Date.now(),
            coinSpeed,
            selectedCoin: shopData.selected,
            shopData,
            lastCoinTime: 0,
            isActive: true
        };
        activeGames.set(userId, gameSession);
        
        // Update global stats
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
        user.globalStats.gamesPlayed++;
        user.globalStats.lastPlayed = new Date().toISOString();
        userDB.set(userId, user);
        
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        res.json({
            success: true,
            coinSpeed,
            selectedCoin: shopData.selected,
            gameState: {
                asraScore: user.gameData?.asraScore || 0
            }
        });
        
    } catch (error) {
        console.error('Start game error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Stop game session
app.post('/api/game/stop/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        activeGames.delete(userId);
        res.json({ success: true });
    } catch (error) {
        console.error('Stop game error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// INDUSTRY STANDARD: Catch coin - SERVER CALCULATES REWARD (anti-cheat)
app.post('/api/game/catch/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { coinColor, timestamp } = req.body;
        
        if (!userId || !coinColor) {
            return res.status(400).json({ error: 'userId and coinColor required' });
        }
        
        const user = userDB.get(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Check if game is active
        const gameSession = activeGames.get(userId);
        if (!gameSession || !gameSession.isActive) {
            return res.status(400).json({ error: 'Game not active' });
        }
        
        // Validate coin color
        const validColors = ['pulse-yellow', 'pulse-red', 'pulse-green', 'pulse-blue', 
                            'pulse-cyan', 'pulse-purple', 'pulse-orange'];
        if (!validColors.includes(coinColor)) {
            return res.status(400).json({ error: 'Invalid coin color' });
        }
        
        // Anti-cheat: Check timing
        const now = Date.now();
        gameSession.lastCoinTime = now;
        activeGames.set(userId, gameSession);
        
        // SERVER-SIDE reward calculation (Industry Standard)
        const rewardResult = calculateReward(coinColor, gameSession.shopData);
        
        // Check ASRA PRO limit
        if (rewardResult.type === 'limit_reached') {
            return res.json({
                success: true,
                limitReached: true,
                message: 'ASRA PRO limit reached (200 ASRA earned)',
                gameState: {
                    asraScore: user.gameData?.asraScore || 0
                }
            });
        }
        
        // Apply reward to user's balance (server-side)
        const newBalance = applyReward(user, rewardResult);
        
        // Update ASRA PRO usage if applicable
        if (rewardResult.trackTon && newBalance.type === 'asra_pro') {
            // Track ASRA PRO usage
            gameSession.shopData.asraProUsed = (gameSession.shopData.asraProUsed || 0) + 1;
            user.shopData.asraProUsed = gameSession.shopData.asraProUsed;
        }
        
        // Update global stats
        if (user.globalStats) {
            user.globalStats.totalClicksAllTime++;
            user.globalStats.totalCoinsCollected++;
        }
        
        // Save new balance - only ASRA, no TON conversion
        user.gameData = {
            asraScore: newBalance.asraScore,
            lastSaved: new Date().toISOString()
        };
        
        userDB.set(userId, user);
        
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        res.json({
            success: true,
            reward: newBalance.reward,
            type: newBalance.type,
            gameState: {
                asraScore: newBalance.asraScore
            }
        });
        
    } catch (error) {
        console.error('Catch coin error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get current game state
app.get('/api/game/state/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }
        
        const user = userDB.get(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const shopData = user.shopData || { purchased: [], selected: 'gunmetal' };

        res.json({
            success: true,
            gameState: {
                asraScore: user.gameData?.asraScore || 0,
                lastSaved: user.gameData?.lastSaved
            },
            shopData,
            hasPaid: user.hasPaid || false
        });

    } catch (error) {
        console.error('Get game state error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// =============================================================================
// LEGACY ENDPOINTS (Backward compatibility)
// =============================================================================

// Save game data (legacy - now handled by /api/game/catch)
app.post('/api/save-game/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { asraScore } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }
        
        const user = userDB.get(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // In industry standard, this is a fallback only
        // Main updates go through /api/game/catch
        user.gameData = {
            asraScore: parseInt(asraScore) || user.gameData?.asraScore || 0,
            lastSaved: new Date().toISOString()
        };
        
        userDB.set(userId, user);
        
        res.json({
            success: true,
            message: 'Game data saved',
            note: 'Use /api/game/catch for real-time updates'
        });
        
    } catch (error) {
        console.error('Save game error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Load game data (legacy - redirects to /api/game/state)
app.get('/api/load-game/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }
        
        const user = userDB.get(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        res.json({
            success: true,
            asraScore: user.gameData?.asraScore || 0,
            hasPaid: user.hasPaid || false,
            note: 'Use /api/game/state for new clients'
        });
        
    } catch (error) {
        console.error('Load game error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get shop data
app.get('/api/shop/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }
        
        const user = userDB.get(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get user's shop data
        let shopData = user.shopData || {
            purchased: [],
            selected: 'gunmetal',
            purchaseTime: {},
            asraProUsed: 0
        };
        
        // DISABLED: 30-day expiration filter - now all coins are valid until monthly reset
        // VIP wallet coins are always preserved
        
        res.json({
            success: true,
            shopData: shopData
        });
        
    } catch (error) {
        console.error('Get shop data error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Save shop data (legacy - now use /api/shop/buy and /api/shop/select)
app.post('/api/shop/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { purchased, selected, purchaseTime, asraProUsed } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }
        
        const user = userDB.get(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Update shop data
        user.shopData = {
            purchased: purchased || [],
            selected: selected || 'gunmetal',
            purchaseTime: purchaseTime || {},
            asraProUsed: asraProUsed || 0
        };
        
        userDB.set(userId, user);
        
        console.log(`🛒 Shop data saved: ${userId}`);
        console.log(`   Purchased: ${user.shopData.purchased.join(', ') || 'none'}`);
        console.log(`   Selected: ${user.shopData.selected}`);
        
        res.json({
            success: true,
            message: 'Shop data saved'
        });
        
    } catch (error) {
        console.error('Save shop data error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// INDUSTRY STANDARD: Buy coin from shop (server-side deduction from REAL TON deposits)
app.post('/api/shop/buy/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { coin } = req.body;
        
        if (!userId || !coin) {
            return res.status(400).json({ error: 'userId and coin required' });
        }
        
        const user = userDB.get(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Check if coin exists
        const coinData = COIN_CONFIG[coin];
        if (!coinData) {
            return res.status(400).json({ error: 'Invalid coin' });
        }
        
        // Check if already purchased
        const shopData = user.shopData || { purchased: [], selected: 'gunmetal', purchaseTime: {} };
        if (shopData.purchased.includes(coin)) {
            // Just select it
            shopData.selected = coin;
            user.shopData = shopData;
            userDB.set(userId, user);
            return res.json({ success: true, message: 'Coin selected', action: 'selected' });
        }
        
        // Check if user has enough REAL TON deposited
        const realTonBalance = user.totalDeposited - user.totalConverted;
        if (realTonBalance < coinData.price) {
            return res.status(400).json({ 
                error: 'Insufficient TON', 
                required: coinData.price, 
                available: realTonBalance,
                message: 'Please deposit TON first'
            });
        }
        
        // Deduct from real TON deposits (server-side)
        user.totalConverted += coinData.price;
        user.balance = user.totalDeposited - user.totalConverted;
        
        // Add to purchased
        shopData.purchased.push(coin);
        shopData.selected = coin;
        shopData.purchaseTime[coin] = Date.now();
        
        // Reset ASRA PRO usage if buying again
        if (coin === 'asra') {
            shopData.asraProUsed = 0;
        }
        
        // UNLOCK REAL GAME: Buying any coin unlocks full game (same as 1 TON payment)
        let unlockedRealGame = false;
        if (!user.hasPaid) {
            user.hasPaid = true;
            user.paidAt = new Date().toISOString();
            user.paidAmount = 1; // Treat as 1 TON payment equivalent
            unlockedRealGame = true; // Signal to frontend this is first unlock
            console.log(`🔓 Real game unlocked via shop purchase: ${userId}`);
            
            // Reset game data (DEMO → REAL transition)
            user.gameData = {
                asraScore: 0,
                lastSaved: new Date().toISOString()
            };
            console.log(`🔄 Game data reset to 0 for first shop unlock: ${userId}`);
        }
        
        user.shopData = shopData;
        userDB.set(userId, user);
        
        console.log(`✅ Coin purchased: ${userId} bought ${coin} for ${coinData.price} TON (from deposits)`);
        
        res.json({
            success: true,
            message: 'Coin purchased',
            coin: coin,
            price: coinData.price,
            unlockedRealGame: unlockedRealGame, // Tell frontend if this unlocked real game
            gameState: {
                asraScore: user.gameData.asraScore
            }
        });
        
    } catch (error) {
        console.error('Buy coin error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// INDUSTRY STANDARD: Select coin (no purchase)
app.post('/api/shop/select/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { coin } = req.body;
        
        if (!userId || !coin) {
            return res.status(400).json({ error: 'userId and coin required' });
        }
        
        const user = userDB.get(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const shopData = user.shopData || { purchased: [], selected: 'gunmetal' };
        
        // Check if owned or is default
        if (!shopData.purchased.includes(coin) && coin !== 'gunmetal') {
            return res.status(400).json({ error: 'Coin not owned' });
        }
        
        shopData.selected = coin;
        user.shopData = shopData;
        userDB.set(userId, user);
        
        res.json({ success: true, selected: coin });
        
    } catch (error) {
        console.error('Select coin error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Database migration - migrate old users to new format
async function migrateDatabase() {
    try {
        console.log('🔄 Database migration started...');
        const users = userDB.getAll();
        let migratedCount = 0;
        
        for (const [userId, user] of Object.entries(users)) {
            // If user doesn't have gameData, create it
            if (!user.gameData) {
                user.gameData = {
                    asraScore: 0,
                    lastSaved: null
                };
                userDB.set(userId, user);
                migratedCount++;
                console.log(`   ✅ ${userId} - gameData created`);
            }
            
            // Migrate old tonCount to ASRA if exists (backward compatibility)
            if (user.gameData.tonCount !== undefined) {
                // Convert old tonCount to ASRA and remove tonCount
                const oldTonCount = user.gameData.tonCount || 0;
                const oldAsraScore = user.gameData.asraScore || 0;
                // tonCount was just a game mechanic, not real TON - remove it
                // ASRA stays as is
                delete user.gameData.tonCount;
                userDB.set(userId, user);
                console.log(`   ✅ ${userId} - removed tonCount (old: ${oldTonCount})`);
            }
            
            // If user doesn't have shopData, create it
            if (!user.shopData) {
                user.shopData = {
                    purchased: user.purchasedItems || [],
                    selected: 'gunmetal',
                    purchaseTime: {},
                    asraProUsed: 0
                };
                // Migrate old purchasedItems to new format
                if (user.purchasedItems && user.purchasedItems.length > 0) {
                    const now = new Date().getTime();
                    user.purchasedItems.forEach(coin => {
                        user.shopData.purchaseTime[coin] = now;
                    });
                }
                userDB.set(userId, user);
                migratedCount++;
                console.log(`   ✅ ${userId} - shopData created`);
            }
            
            // Migrate firstName if not exists (for leaderboard display)
            if (!user.hasOwnProperty('firstName')) {
                user.firstName = null; // Initialize as null, will be set on next registration/update
                userDB.set(userId, user);
                migratedCount++;
                console.log(`   ✅ ${userId} - firstName field added`);
            }
            
            // Migrate chatId if not exists (for Telegram notifications)
            if (!user.hasOwnProperty('chatId')) {
                user.chatId = null; // Initialize as null, will be set when user starts bot
                userDB.set(userId, user);
                migratedCount++;
                console.log(`   ✅ ${userId} - chatId field added`);
            }
            
            // Migrate totalAsraSpent if not exists (for ASRA payment tracking)
            if (!user.hasOwnProperty('totalAsraSpent')) {
                user.totalAsraSpent = 0;
                userDB.set(userId, user);
                console.log(`   ✅ ${userId} - totalAsraSpent field added`);
            }
        }
        
        console.log(`✅ Migration completed: ${migratedCount} users updated`);
    } catch (error) {
        console.error('❌ Migration error:', error);
    }
}

// =============================================================================
// LEADERBOARD SYSTEM
// =============================================================================

// Get leaderboard (top users by ASRA)
app.get('/api/leaderboard', async (req, res) => {
    try {
        const users = userDB.getAll();
        const userList = [];
        
        for (const [userId, user] of Object.entries(users)) {
            const asraScore = user.gameData?.asraScore || 0;
            
            if (asraScore > 0) {
                // Get purchased coins from shopData
                const shopData = user.shopData || { purchased: [], selected: 'gunmetal' };
                const purchasedCoins = shopData.purchased || [];
                
                userList.push({
                    userId: userId.slice(0, 8) + '...', // Privacy - hide full ID
                    firstName: user.firstName || null, // User's display name
                    asraScore,
                    hasPaid: user.hasPaid || false,
                    purchasedCoins, // Array of purchased coin types
                    selectedCoin: shopData.selected || 'gunmetal'
                });
            }
        }
        
        // Sort by ASRA (descending)
        userList.sort((a, b) => b.asraScore - a.asraScore);
        
        // Get top 50
        const topUsers = userList.slice(0, 50);
        
        res.json({
            success: true,
            leaderboard: topUsers,
            totalPlayers: Object.keys(users).length,
            activePlayers: userList.length
        });
        
    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user's rank
app.get('/api/leaderboard/rank/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = userDB.get(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const users = userDB.getAll();
        const userList = [];
        
        for (const [id, u] of Object.entries(users)) {
            const asraScore = u.gameData?.asraScore || 0;
            
            if (asraScore > 0) {
                userList.push({ userId: id, asraScore });
            }
        }
        
        // Sort by ASRA
        userList.sort((a, b) => b.asraScore - a.asraScore);
        
        // Find user rank
        const userRank = userList.findIndex(u => u.userId === userId) + 1;
        const userTotalAsra = user.gameData?.asraScore || 0;
        
        // Get nearby players (3 above, 3 below)
        const nearbyPlayers = [];
        if (userRank > 0) {
            const start = Math.max(0, userRank - 4);
            const end = Math.min(userList.length, userRank + 3);
            for (let i = start; i < end; i++) {
                const u = userList[i];
                const userData = users[u.userId];
                nearbyPlayers.push({
                    rank: i + 1,
                    userId: u.userId.slice(0, 8) + '...',
                    firstName: userData?.firstName || null,
                    asraScore: u.asraScore,
                    isCurrentUser: u.userId === userId
                });
            }
        }
        
        res.json({
            success: true,
            rank: userRank > 0 ? userRank : null,
            totalPlayers: userList.length,
            userTotalAsra,
            nearbyPlayers
        });
        
    } catch (error) {
        console.error('Get user rank error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// =============================================================================
// TELEGRAM NOTIFICATION SYSTEM
// =============================================================================

let telegramBot = null;

// Initialize bot instance for notifications
function initNotificationBot() {
    if (process.env.TELEGRAM_BOT_TOKEN && !telegramBot) {
        const TelegramBot = require('node-telegram-bot-api');
        
        // Check if webhook mode is enabled
        const useWebhook = process.env.USE_WEBHOOK === 'true';
        
        if (useWebhook) {
            // Webhook mode: bot is managed by bot-final.js, just return it for sending
            // Don't create polling bot to avoid 409 Conflict
            telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
                webHook: false,  // No webhook server, just for sending
                polling: false     // NO POLLING - webhook handles receiving
            });
            console.log('✅ Notification bot initialized (webhook mode - no polling)');
        } else {
            // Polling mode (default)
            telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
                polling: true
            });
            console.log('✅ Notification bot initialized (polling mode)');
        }
    }
    return telegramBot;
}

// Send notification to specific user
async function sendNotificationToUser(userId, message, options = {}) {
    try {
        const bot = initNotificationBot();
        if (!bot) {
            console.log('❌ Bot not initialized - TELEGRAM_BOT_TOKEN missing');
            return false;
        }
        
        const user = userDB.get(userId);
        if (!user || !user.chatId) {
            console.log(`❌ User ${userId} has no chatId`);
            return false;
        }
        
        await bot.sendMessage(user.chatId, message, {
            parse_mode: 'Markdown',
            ...options
        });
        
        console.log(`✅ Notification sent to ${userId} (chatId: ${user.chatId})`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to send notification to ${userId}:`, error.message);
        return false;
    }
}

// API: Send notification to specific user
app.post('/api/notify/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { message, includeButton } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message required' });
        }
        
        const options = {};
        if (includeButton) {
            options.reply_markup = {
                inline_keyboard: [[
                    {
                        text: '🎮 Play Now',
                        web_app: { 
                            url: `${GAME_URL || process.env.GAME_URL || 'https://asracoin.up.railway.app'}?userId=${userId}` 
                        }
                    }
                ]]
            };
        }
        
        const sent = await sendNotificationToUser(userId, message, options);
        
        if (sent) {
            res.json({ success: true, message: 'Notification sent' });
        } else {
            res.status(400).json({ 
                success: false, 
                error: 'Failed to send notification - user may not have chatId' 
            });
        }
    } catch (error) {
        console.error('Jetton wallet endpoint error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Start server
const PORT = process.env.PORT || 3000;

// Telegram bot - routes must be added before listen
if (process.env.TELEGRAM_BOT_TOKEN) {
    const { initBot } = require('./bot-final.js');
    initBot(app);
} else {
    console.log('⚠️ TELEGRAM_BOT_TOKEN missing - bot will not run');
}

app.listen(PORT, async () => {
    console.log('🔥 ASRA COIN SERVER 🔥');
    console.log(`✅ Server started on port ${PORT}`);
    console.log('');
    console.log('🔗 TON Center API:');
    console.log(`   Endpoint: ${TON_CENTER_ENDPOINT}`);
    console.log(`   API Key: ${TON_API_KEY ? '✅ Available' : '❌ Missing (1 req/s limit)'}`);
    console.log('');
    console.log('💎 Features:');
    console.log('   ✅ Real TON blockchain balance check');
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
    
    // Initialize notification bot
    if (process.env.TELEGRAM_BOT_TOKEN) {
        initNotificationBot();
    }
    
    // MONTHLY RESET: Schedule full database reset on 1st day of every month at 00:00
    const scheduleMonthlyReset = () => {
        const now = new Date();
        const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
        const timeUntilReset = nextReset - now;
        
        console.log(`📅 Monthly reset scheduled for: ${nextReset.toISOString()}`);
        console.log(`   Time until reset: ${Math.floor(timeUntilReset / 1000 / 60 / 60)} hours`);
        
        setTimeout(() => {
            performMonthlyReset();
            // Schedule next month's reset
            scheduleMonthlyReset();
        }, timeUntilReset);
    };
    
    // Start monthly reset scheduler
    scheduleMonthlyReset();
});

// MONTHLY RESET FUNCTION: Clear all users except VIP wallet, reset everything
async function performMonthlyReset() {
    console.log('🔄 MONTHLY RESET STARTED - 1st day of month');
    console.log('   Clearing all data except VIP wallet...');
    
    try {
        const users = userDB.getAll();
        const vipUsers = [];
        let clearedCount = 0;
        
        for (const [userId, user] of Object.entries(users)) {
            // Check if this is VIP wallet
            if (isSpecialWallet(user.connectedWallet)) {
                // VIP user - preserve but reset game data
                console.log(`👑 VIP user preserved: ${userId}`);
                vipUsers.push(userId);
                
                // Reset game data for VIP too (ASRA, stats)
                user.gameData = {
                    asraScore: SPECIAL_WALLET_ASRA,
                    lastSaved: new Date().toISOString()
                };
                user.globalStats = {
                    totalClicksAllTime: 0,
                    totalCoinsCollected: 0,
                    totalTonEarned: 0,
                    gamesPlayed: 0,
                    firstPlayed: new Date().toISOString(),
                    lastPlayed: null
                };
                // VIP keeps shopData with all coins
                user.shopData = {
                    purchased: ALL_COINS,
                    selected: 'gunmetal',
                    purchaseTime: Object.fromEntries(ALL_COINS.map(c => [c, Date.now()])),
                    asraProUsed: 0
                };
                userDB.set(userId, user);
            } else {
                // Regular user - completely delete
                userDB.delete(userId);
                clearedCount++;
            }
        }
        
        console.log(`✅ Monthly reset completed:`);
        console.log(`   Cleared users: ${clearedCount}`);
        console.log(`   VIP users preserved: ${vipUsers.length}`);
        console.log(`   Total users after reset: ${vipUsers.length}`);
        
        // Send notification to admin/VIP if needed
        const adminMessage = `🔄 Monthly Reset Completed\n\n📊 Statistics:\n• Cleared users: ${clearedCount}\n• VIP preserved: ${vipUsers.length}\n• Date: ${new Date().toISOString()}`;
        
        // Notify if there's a Telegram bot
        if (telegramBot && process.env.ADMIN_CHAT_ID) {
            try {
                await telegramBot.sendMessage(process.env.ADMIN_CHAT_ID, adminMessage);
            } catch (e) {
                console.log('Could not send admin notification');
            }
        }
        
    } catch (error) {
        console.error('❌ Monthly reset error:', error);
    }
}

// API endpoint to manually trigger monthly reset (admin only)
app.post('/api/admin/monthly-reset', async (req, res) => {
    try {
        const { adminKey } = req.body;
        
        // Simple admin authentication
        if (adminKey !== process.env.ADMIN_KEY) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        await performMonthlyReset();
        
        res.json({
            success: true,
            message: 'Monthly reset completed',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Manual reset error:', error);
        res.status(500).json({ error: 'Reset failed' });
    }
});

module.exports = app;
