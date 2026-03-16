const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { TonClient, WalletContractV5R1, internal, toNano, Address } = require('@ton/ton');
const { mnemonicNew, mnemonicToWalletKey } = require('@ton/crypto');
const axios = require('axios');

// JSON file database
const { userDB } = require('./jsonDB');

const app = express();
app.use(cors());
app.use(express.json());

// TON Center API config
const TON_API_KEY = process.env.TON_API_KEY || '';
const TON_CENTER_ENDPOINT = 'https://toncenter.com/api/v2';
const PAYMENT_ADDRESS = process.env.PAYMENT_ADDRESS || 'UQCtlk8bgwbSOt8OFnVe4KuFdQDo7kCbrZEhAOW1UUgUtIVM';  // Master Wallet - receives 1 TON payments

// Master Wallet config - all withdrawals are made from this wallet
const MASTER_WALLET_MNEMONIC = process.env.MASTER_WALLET_MNEMONIC || '';
const MASTER_WALLET_ADDRESS = process.env.MASTER_WALLET_ADDRESS || PAYMENT_ADDRESS;

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
        const { userId, connectedWallet } = req.body;
        
        if (!userId || !connectedWallet) {
            return res.status(400).json({ error: 'userId and connectedWallet required' });
        }
        
        let user = userDB.get(userId);
        
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
        
        // Create new deposit wallet
        const depositWallet = await createDepositWallet();
        
        // Create new user
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
            hasPaid: false, // Demo mode - until 1 TON is paid
            demoAsraBalance: 0, // Asra collected in demo mode
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
                newDeposit: 0
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
        const user = userDB.get(req.params.userId);
        
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
                    tonCount: 0,
                    lastSaved: null
                }
            };
        } else {
            console.log(`✅ User found: ${userId}`);
            console.log(`   Old state: tonCount=${user.gameData?.tonCount || 0}, asraScore=${user.gameData?.asraScore || 0}`);
            
            // Create new deposit wallet
            const newDepositWallet = await createDepositWallet();
            
            // Fully reset user data
            user.connectedWallet = null;
            user.depositWallet = newDepositWallet;
            user.balance = 0;
            user.jettonBalance = 0;
            user.totalDeposited = 0;
            user.totalConverted = 0;
            user.purchasedItems = [];
            user.hasPaid = false;
            user.paidAt = null;
            user.paidAmount = 0;
            user.paymentTxHash = null;
            user.paidFromAddress = null;
            user.demoAsraBalance = 0;
            user.gameData = {
                asraScore: 0,
                tonCount: 0,
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
        }
        
        userDB.set(userId, user);
        
        console.log(`✅ User restarted successfully: ${userId}`);
        console.log(`   New deposit address: ${user.depositWallet.address}`);
        
        res.json({
            success: true,
            message: 'Game restarted',
            newDepositAddress: user.depositWallet.address,
            resetData: {
                tonCount: 0,
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

// REAL Withdraw - user withdraws to their own wallet
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
                error: 'userId, amount and toAddress required' 
            });
        }
        
        const user = userDB.get(userId);
        
        if (!user) {
            console.log(`❌ USER NOT FOUND: ${userId}`);
            return res.status(404).json({ error: 'User not found' });
        }
        
        console.log(`✅ User found: ${userId}`);
        console.log(`   hasPaid: ${user.hasPaid}`);
        console.log(`   gameData:`, user.gameData);
        
        // Check if testMode is allowed (only in development)
        const isDevEnvironment = process.env.NODE_ENV !== 'production';
        const isTestMode = testMode === true && isDevEnvironment;
        
        // Check if payment was made (only if not test mode)
        if (!isTestMode && !user.hasPaid) {
            console.log(`❌ PAYMENT REQUIRED (real mode)`);
            return res.status(403).json({ 
                error: 'Demo version',
                message: 'You need to pay 1 TON first to withdraw TON',
                requiredPayment: 1,
                paymentAddress: PAYMENT_ADDRESS || '',
                demoMode: true
            });
        }
        
        // TEST MODE: withdraw from gameData.tonCount (ONLY in development mode!)
        if (isTestMode) {
            console.log(`🧪 TEST MODE withdraw (Development only)`);
            const gameTon = user.gameData?.tonCount || 0;
            console.log(`   gameTon available: ${gameTon}`);
            
            if (gameTon < amount) {
                console.log(`❌ Not enough TON: need ${amount}, have ${gameTon}`);
                return res.status(400).json({
                    error: 'Not enough TON',
                    required: amount,
                    available: gameTon,
                    message: 'Not enough TON in game'
                });
            }
            
            // Must keep 1 TON
            if (gameTon - amount < 1) {
                console.log(`❌ Must keep 1 TON: have ${gameTon}, withdraw ${amount}`);
                return res.status(400).json({
                    error: 'Must keep 1 TON',
                    maxWithdraw: Math.max(0, gameTon - 1)
                });
            }
            
            // Reduce TON from GameData
            user.gameData.tonCount -= amount;
            userDB.set(userId, user);
            
            console.log(`✅ TEST WITHDRAW SUCCESS: ${amount} TON`);
            console.log(`   Remaining: ${user.gameData.tonCount} TON`);
            
            return res.json({
                success: true,
                message: `${amount} TON withdrawn (Test mode)`,
                tonCount: user.gameData.tonCount,
                testMode: true
            });
        }
        
        // REAL MODE: withdraw from Master Wallet
        // Minimum amount check
        if (amount < 0.1) {
            return res.status(400).json({ 
                error: 'Minimum withdrawal amount is 0.1 TON' 
            });
        }
        
        const gameTon = user.gameData?.tonCount || 0;
        
        // Check game TON
        if (gameTon < amount) {
            return res.status(400).json({
                error: 'Not enough TON',
                required: amount,
                available: gameTon,
                message: 'Not enough TON in game'
            });
        }
        
        // Must keep 1 TON in game balance
        if (gameTon - amount < 1) {
            return res.status(400).json({
                error: 'Must keep 1 TON',
                maxWithdraw: Math.max(0, gameTon - 1)
            });
        }
        
        // Check Master Wallet balance
        const masterBalance = await getRealTonBalance(MASTER_WALLET_ADDRESS);
        console.log(`💰 Master Wallet balance: ${masterBalance.toFixed(4)} TON`);
        console.log(`💰 User game TON: ${gameTon} TON`);
        console.log(`💰 Withdraw amount: ${amount} TON`);
        
        if (masterBalance < amount) {
            return res.status(400).json({
                error: 'Not enough TON in Master wallet',
                required: amount,
                available: masterBalance,
                message: 'Please try again later.',
                isReal: true
            });
        }
        
        // Send REAL TON transfer from MASTER WALLET
        try {
            console.log(`🔄 MASTER WALLET WITHDRAW: ${amount} TON`);
            console.log(`   From Master: ${MASTER_WALLET_ADDRESS}`);
            console.log(`   To User: ${toAddress}`);
            
            // Get Master wallet keyPair
            if (!MASTER_WALLET_MNEMONIC) {
                throw new Error('MASTER_WALLET_MNEMONIC not set!');
            }
            
            const keyPair = await mnemonicToWalletKey(MASTER_WALLET_MNEMONIC.split(' '));
            const wallet = WalletContractV5R1.create({
                workchain: 0,
                publicKey: keyPair.publicKey
            });
            
            const contract = client.open(wallet);
            
            // Get current seqno
            let seqno = await contract.getSeqno();
            console.log(`   Seqno (before): ${seqno}`);
            
            // Transfer
            const transferAmount = toNano(amount.toString());
            
            await contract.sendTransfer({
                seqno,
                secretKey: keyPair.secretKey,
                messages: [
                    internal({
                        to: toAddress,
                        value: transferAmount,
                        body: 'ASRA Coin Game TON Withdraw',
                        bounce: false
                    })
                ]
            });
            
            // Wait for seqno update
            console.log(`   Waiting for seqno update...`);
            let currentSeqno = seqno;
            let retry = 0;
            while (currentSeqno === seqno && retry < 10) {
                await new Promise(r => setTimeout(r, 1500));
                currentSeqno = await contract.getSeqno();
                retry++;
            }
            console.log(`   Seqno (after): ${currentSeqno} (retries: ${retry})`);
            
            // Reduce game TON from database
            user.gameData.tonCount -= amount;
            userDB.set(userId, user);
            
            console.log(`✅ MASTER WALLET WITHDRAW SUCCESS: ${amount} TON`);
            console.log(`   Remaining game TON: ${user.gameData.tonCount}`);
            
            return res.json({
                success: true,
                message: `${amount} TON sent successfully`,
                tonCount: user.gameData.tonCount,
                toAddress: toAddress,
                fromMaster: MASTER_WALLET_ADDRESS,
                isReal: true
            });
            
        } catch (txError) {
            console.error('❌ Master Wallet Blockchain error:', txError);
            return res.status(500).json({
                error: 'Blockchain error. TON was not sent.',
                details: txError.message,
                isReal: true
            });
        }
        
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
        
        const REQUIRED_AMOUNT = 1; // 1 TON
        
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
                if (!toAddress || !value) {
                    console.log(`   ❌ Skipping tx: missing toAddress=${!!toAddress} or value=${!!value}`);
                    return false;
                }
                const tonAmount = Number(BigInt(value)) / 1e9;
                // Use Address library for proper comparison
                const isAddressMatch = areAddressesEqual(toAddress, PAYMENT_ADDRESS);
                const isMatch = isAddressMatch && tonAmount >= REQUIRED_AMOUNT;
                console.log(`   🔍 Checking: to=${toAddress?.slice(0, 20)}... amount=${tonAmount} TON, addressMatch=${isAddressMatch}, match=${isMatch}`);
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
            user.paidAmount = REQUIRED_AMOUNT;
            user.paymentTxHash = paymentTx.id || paymentTx.hash || null;
            user.paidFromAddress = paymentTx.from?.address || null;
            
            // Transfer demo asra to real balance (or reset to 0)
            user.demoAsraBalance = 0;
            
            userDB.set(userId, user);
            
            console.log(`✅ Payment made: ${userId}`);
            console.log(`   Amount: ${paymentTx.amount} TON`);
            console.log(`   Tx: ${paymentTx.id}`);
            console.log(`   From: ${paymentTx.from?.address}`);
            
            return res.json({
                success: true,
                hasPaid: true,
                message: 'Payment made! You can now start the real game.',
                resetRequired: true,
                txHash: paymentTx.id
            });
        }
        
        // Payment not made
        res.json({
            success: true,
            hasPaid: false,
            message: 'Payment pending',
            requiredAmount: REQUIRED_AMOUNT,
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
                if (!toAddress || !value) return false;
                
                const tonAmount = Number(BigInt(value)) / 1e9;
                const isAddressMatch = areAddressesEqual(toAddress, PAYMENT_ADDRESS);
                
                console.log(`   Tx check: amount=${tonAmount}, addressMatch=${isAddressMatch}`);
                
                return isAddressMatch && tonAmount >= REQUIRED_AMOUNT;
            });
        } catch (error) {
            console.log('⚠️ TON Center check error:', error.message);
        }
        
        if (paymentTx) {
            const txFromAddress = paymentTx.from || paymentTx.in_msg?.source || null;
            const now = new Date().toISOString();
            const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
            
            // Check if user already paid
            if (user.hasPaid && user.paidAt) {
                const paidAtTime = new Date(user.paidAt).getTime();
                const currentTime = new Date(now).getTime();
                const timeDiff = currentTime - paidAtTime;
                const isSameWallet = user.paidFromAddress && txFromAddress && 
                                     areAddressesEqual(user.paidFromAddress, txFromAddress);
                
                // If same wallet and less than 30 days passed - just extend payment
                if (isSameWallet && timeDiff < thirtyDaysMs) {
                    user.paidAt = now; // Extend payment date
                    user.paymentTxHash = paymentTx.transaction_id?.hash || null;
                    userDB.set(userId, user);
                    
                    console.log(`✅ Payment extended: ${userId}`);
                    console.log(`   Same wallet, ${Math.floor((thirtyDaysMs - timeDiff) / (24 * 60 * 60 * 1000))} days remaining`);
                    
                    return res.json({
                        success: true,
                        hasPaid: true,
                        message: 'Payment extended! Your game data is preserved.',
                        reset: false,
                        extended: true,
                        daysRemaining: Math.floor((thirtyDaysMs - timeDiff) / (24 * 60 * 60 * 1000)),
                        txHash: paymentTx.transaction_id?.hash
                    });
                }
                
                // If different wallet OR 30+ days passed - new payment required
                if (!isSameWallet) {
                    console.log(`🆕 New wallet connected: ${userId}`);
                } else {
                    console.log(`📅 30 days passed, payment renewal: ${userId}`);
                }
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
            
            // Reset game data (asraScore, tonCount) - DEMO to REAL transition
            user.gameData = {
                asraScore: 0,
                tonCount: 0,
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
                message: 'Payment confirmed! Real game started. You can now withdraw TON when you earn enough.',
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
        console.error('Confirm payment error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
app.post('/api/user/:userId/stats', async (req, res) => {
    try {
        const { userId } = req.params;
        const { totalClicksAllTime, totalCoinsCollected, totalTonEarned, gamesPlayed } = req.body;
        
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
    ASRA_PER_TON: 10000,           // 10000 ASRA = 1 TON
    RED_PENALTY: 100,              // Red coin penalty
    MIN_REWARD: 1,                 // Min reward per coin
    MAX_REWARD: 100,               // Max reward per coin
    ASRA_PRO_LIMIT: 200,           // Max TON with ASRA PRO
    BASE_SPEED_MS: 1500,           // Base coin speed
    SPEED_PER_TON_MS: 200,         // Speed increase per TON
    MIN_SPEED_MS: 200              // Minimum visible time
};

// Coin configuration (server authoritative)
const COIN_CONFIG = {
    gunmetal: { speedBonus: 0, timeBonus: 1, price: 0 },
    blue: { speedBonus: 200, timeBonus: 1.2, price: 1 },
    green: { speedBonus: 400, timeBonus: 1.3, price: 5 },
    pink: { speedBonus: 600, timeBonus: 1.5, price: 10 },
    red: { speedBonus: 800, timeBonus: 3, price: 20 },
    yellow: { speedBonus: 1000, timeBonus: 4, price: 30 },
    asra: { speedBonus: 1200, timeBonus: 5, price: 99, noPenalty: true, autoPlay: true }
};

// Active games session storage (in-memory, per user)
const activeGames = new Map();

// Calculate coin visible time based on user's TON count and selected coin
function calculateCoinSpeed(tonCount, selectedCoin) {
    const coin = COIN_CONFIG[selectedCoin] || COIN_CONFIG.gunmetal;
    const baseSpeed = Math.max(
        GAME_CONSTANTS.MIN_SPEED_MS,
        GAME_CONSTANTS.BASE_SPEED_MS - (tonCount * GAME_CONSTANTS.SPEED_PER_TON_MS)
    );
    return baseSpeed + (coin.speedBonus || 0);
}

// Calculate reward for catching a coin (SERVER-SIDE - anti-cheat)
function calculateReward(coinColor, shopData) {
    const isRed = coinColor === 'pulse-red';
    const isAsraPro = shopData.selected === 'asra' && shopData.purchased.includes('asra');
    
    // ASRA PRO has no penalty and auto-rewards
    if (isAsraPro && COIN_CONFIG.asra.noPenalty) {
        if ((shopData.asraProUsed || 0) >= GAME_CONSTANTS.ASRA_PRO_LIMIT) {
            return { type: 'limit_reached', reward: 0 };
        }
        const reward = Math.floor(Math.random() * GAME_CONSTANTS.MAX_REWARD) + GAME_CONSTANTS.MIN_REWARD;
        return { type: 'asra_pro', reward, trackTon: true };
    }
    
    // Red coin penalty
    if (isRed) {
        return { type: 'penalty', reward: -GAME_CONSTANTS.RED_PENALTY };
    }
    
    // Normal reward
    const reward = Math.floor(Math.random() * GAME_CONSTANTS.MAX_REWARD) + GAME_CONSTANTS.MIN_REWARD;
    return { type: 'normal', reward };
}

// Apply reward to user's balance (SERVER-SIDE calculation)
function applyReward(user, rewardResult) {
    let asraScore = user.gameData?.asraScore || 0;
    let tonCount = user.gameData?.tonCount || 0;
    
    if (rewardResult.type === 'limit_reached') {
        return { asraScore, tonCount, limitReached: true, reward: 0 };
    }
    
    const reward = rewardResult.reward;
    
    if (reward < 0) {
        // Penalty
        asraScore += reward; // reward is negative
        if (asraScore < 0) {
            if (tonCount > 0) {
                tonCount--;
                asraScore = GAME_CONSTANTS.ASRA_PER_TON + asraScore;
            } else {
                asraScore = 0;
            }
        }
    } else {
        // Positive reward
        asraScore += reward;
        while (asraScore >= GAME_CONSTANTS.ASRA_PER_TON) {
            tonCount++;
            asraScore -= GAME_CONSTANTS.ASRA_PER_TON;
        }
    }
    
    return { asraScore, tonCount, reward, type: rewardResult.type };
}

// Start game session
app.post('/api/game/start/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }
        
        const user = userDB.get(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get user's shop settings
        const shopData = user.shopData || { selected: 'gunmetal', purchased: [], asraProUsed: 0 };
        const tonCount = user.gameData?.tonCount || 0;
        
        // Calculate coin speed based on user's progress
        const coinSpeed = calculateCoinSpeed(tonCount, shopData.selected);
        
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
                asraScore: user.gameData?.asraScore || 0,
                tonCount: user.gameData?.tonCount || 0
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
                message: 'ASRA PRO limit reached (200 TON)',
                gameState: {
                    asraScore: user.gameData?.asraScore || 0,
                    tonCount: user.gameData?.tonCount || 0
                }
            });
        }
        
        // Apply reward to user's balance (server-side)
        const newBalance = applyReward(user, rewardResult);
        
        // Update ASRA PRO usage if applicable
        if (rewardResult.trackTon && newBalance.type === 'asra_pro') {
            if (newBalance.asraScore < (user.gameData?.asraScore || 0)) {
                // User earned a TON with ASRA PRO
                gameSession.shopData.asraProUsed = (gameSession.shopData.asraProUsed || 0) + 1;
                user.shopData.asraProUsed = gameSession.shopData.asraProUsed;
            }
        }
        
        // Update global stats
        if (user.globalStats) {
            user.globalStats.totalClicksAllTime++;
            user.globalStats.totalCoinsCollected++;
            if (newBalance.type !== 'penalty') {
                const tonEarned = newBalance.tonCount - (user.gameData?.tonCount || 0);
                if (tonEarned > 0) {
                    user.globalStats.totalTonEarned += tonEarned;
                }
            }
        }
        
        // Save new balance
        user.gameData = {
            asraScore: newBalance.asraScore,
            tonCount: newBalance.tonCount,
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
                asraScore: newBalance.asraScore,
                tonCount: newBalance.tonCount
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
        
        res.json({
            success: true,
            gameState: {
                asraScore: user.gameData?.asraScore || 0,
                tonCount: user.gameData?.tonCount || 0,
                lastSaved: user.gameData?.lastSaved
            },
            shopData: user.shopData || { purchased: [], selected: 'gunmetal' },
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
        const { asraScore, tonCount } = req.body;
        
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
            tonCount: parseFloat(tonCount) || user.gameData?.tonCount || 0,
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
            tonCount: user.gameData?.tonCount || 0,
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
        
        // Return shop data (purchased items with expiration)
        const shopData = user.shopData || {
            purchased: [],
            selected: 'gunmetal',
            purchaseTime: {},
            asraProUsed: 0  // Track how much TON was earned with ASRA PRO
        };
        
        // Filter out expired items (30 days)
        const now = new Date().getTime();
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        
        if (shopData.purchased && shopData.purchaseTime) {
            shopData.purchased = shopData.purchased.filter(coin => {
                const purchaseTime = shopData.purchaseTime[coin];
                return purchaseTime && (now - purchaseTime < thirtyDays);
            });
        }
        
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

// INDUSTRY STANDARD: Buy coin from shop (server-side deduction)
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
        
        // Check if user has enough TON
        const tonCount = user.gameData?.tonCount || 0;
        if (tonCount < coinData.price) {
            return res.status(400).json({ 
                error: 'Insufficient TON', 
                required: coinData.price, 
                available: tonCount 
            });
        }
        
        // Deduct TON (server-side)
        user.gameData.tonCount -= coinData.price;
        
        // Add to purchased
        shopData.purchased.push(coin);
        shopData.selected = coin;
        shopData.purchaseTime[coin] = Date.now();
        
        // Reset ASRA PRO usage if buying again
        if (coin === 'asra') {
            shopData.asraProUsed = 0;
        }
        
        user.shopData = shopData;
        userDB.set(userId, user);
        
        console.log(`✅ Coin purchased: ${userId} bought ${coin} for ${coinData.price} TON`);
        
        res.json({
            success: true,
            message: 'Coin purchased',
            coin: coin,
            price: coinData.price,
            gameState: {
                asraScore: user.gameData.asraScore,
                tonCount: user.gameData.tonCount
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

// INDUSTRY STANDARD: Restart game - reset all data (userId stays)
app.post('/restart-game/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }
        
        let user = userDB.get(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Reset all game data
        user.gameData = {
            asraScore: 0,
            tonCount: 0,
            lastSaved: new Date().toISOString()
        };
        
        // Reset shop data
        user.shopData = {
            purchased: [],
            selected: 'gunmetal',
            purchaseTime: {},
            asraProUsed: 0
        };
        
        // Reset payment status
        user.hasPaid = false;
        user.totalDeposited = 0;
        user.totalConverted = 0;
        user.balance = 0;
        user.jettonBalance = 0;
        
        // Keep deposit wallet but reset transactions
        user.transactions = [];
        user.purchasedItems = []; // legacy
        
        userDB.set(userId, user);
        
        console.log(`🔄 Game restarted for user: ${userId}`);
        console.log(`   All data reset to 0`);
        
        res.json({
            success: true,
            message: 'Game restarted successfully',
            gameState: user.gameState,
            hasPaid: false
        });
        
    } catch (error) {
        console.error('Restart game error:', error);
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
                    tonCount: 0,
                    lastSaved: null
                };
                userDB.set(userId, user);
                migratedCount++;
                console.log(`   ✅ ${userId} - gameData created`);
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
        }
        
        console.log(`✅ Migration completed: ${migratedCount} users updated`);
    } catch (error) {
        console.error('❌ Migration error:', error);
    }
}

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
});

module.exports = app;
