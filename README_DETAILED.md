# ASRA Coin Game - Complete Documentation

**Telegram Mini App Game with TON Blockchain Integration**

> O'ziz uchun tuzilgan to'liq loyiha hujjatlari. Keyinchalik boshqa odamlar uchun ham README yozish mumkin.

---

## 📁 Loyiha Tuzilishi (Project Structure)

```
tongame-repo/
├── .git/                      # Git repository
├── .gitignore                 # Git ignore rules
├── Procfile                   # Railway deployment config
├── nixpacks.toml             # Nixpacks build config
├── package.json              # Root package.json
├── railway.json              # Railway platform config
├── tonconnect-manifest.json  # TON Connect manifest
├── colorrush.html            # Main frontend game (HTML/CSS/JS)
├── assets/                   # Game images
│   ├── ASRA.png             # ASRA token icon
│   ├── ASRAPRO.png          # ASRA PRO coin image
│   ├── Blue.png             # Blue coin image
│   ├── Button.png           # UI button background
│   ├── Green.png            # Green coin image
│   ├── Gunmetal.png         # Default coin image
│   ├── Pink.png             # Pink coin image
│   ├── Red.png              # Red coin image
│   └── Yellow.png           # Yellow coin image
└── server/                   # Backend server
    ├── .env                  # Environment variables (gitignored)
    ├── bot-final.js          # Telegram bot implementation
    ├── jsonDB.js             # JSON file database with encryption
    ├── package.json          # Server dependencies
    ├── package-lock.json     # Lock file
    ├── server-real.js        # Main server (2643 lines)
    ├── models/               # Database models (empty)
    └── node_modules/         # Dependencies
```

---

## 🎮 O'yin Tavsifi (Game Description)

ASRA Coin - bu Telegram Mini App orqali ishlaydigi clicker-o'yin. Foydalanuvchilar ekranda paydo bo'ladigan tangalarni bosib ASRA tokenlari yig'adilar.

### Asosiy Xususiyatlar:
- **Telegram WebApp**: Faqat Telegram orqali ochiladi
- **TON Blockchain**: Haqiqiy TON tranzaksiyalari
- **ASRA Jetton**: O'yin ichidagi token haqiqiy ASRA tokeniga aylanadi
- **Shop System**: TON to'lab turli xil tangalar sotib olish
- **Wallet Integration**: TON Connect orqali wallet ulanish
- **Monthly Reset**: Har oyning 1-sanasida yangilanadi

---

## 🔧 Root Level Fayllar

### 1. `colorrush.html` (159,939 bytes)
**Loyiha eng muhim fayli - frontend + game logic**

#### HTML Strukturasi:
```html
<!DOCTYPE html>
<html lang="uz">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <meta name="api-base" content="https://asratongames.up.railway.app/api">
    <title>Ton Game</title>
    <!-- TON Connect UI -->
    <script src="https://unpkg.com/@tonconnect/ui@latest/dist/tonconnect-ui.min.js"></script>
    <!-- SweetAlert2 -->
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
```

#### CSS Tuzilishi (lines 11-903):
- **User Selection Disable**: `-webkit-user-select: none` va boshqalar
- **Game Container**: `#game-container` - asosiy o'yin maydoni
- **Score Display**: `#score-display` - ASRA balansi ko'rsatuvchi
- **Game Controls**: `#stop-btn` - START/STOP tugmasi
- **Coin Animation**: `.coin-pop`, `.coin-shrink`, pulse animations
- **Wallet Section**: `#w-btn`, `#wallet-panel` - wallet boshqaruvi
- **User Badge**: `#user-badge`, `#user-badge-panel` - foydalanuvchi menyu
- **Shop Section**: `#shop-btn`, `#shop-modal` - do'kon
- **Help Section**: `#help-btn`, `#help-modal` - yordam oynasi
- **Modals**: Referral, Leaderboard, Wallet modallari

#### JavaScript Tuzilishi (lines 1239-3523):

**Asosiy O'zgaruvchilar:**
```javascript
const API_BASE = metaApi || 'http://localhost:3000/api';
const userId = urlUserId || tgUserId || storedUserId || '';
let asraScore = 0;
let gameActive = false;
let connectedWalletAddress = null;
```

**Asosiy Funksiyalar:**

1. **`loadGameState()`** (lines 1339-1375)
   - Serverdan o'yin holatini yuklaydi
   - `/api/game/state/${userId}` endpointiga murojaat
   - Cache control headers bilan

2. **`initGameData()`** (lines 1415-1435)
   - O'yinni ishga tushirish
   - Loading overlay ko'rsatadi
   - Monthly bonus tekshiruvi

3. **`catchCoin(e)`** (lines 1598-1662)
   - Tangani bosish event handler
   - Serverga `/api/game/catch/${userId}` POST request
   - Visual effektlar

4. **`startNewGame()`** (lines 1664-1743)
   - `/api/game/start/${userId}` chaqiradi
   - Game session boshlaydi
   - UI yangilaydi

5. **`stopGame()`** (lines 1745-1767)
   - `/api/game/stop/${userId}` chaqiradi
   - Game session to'xtatadi

6. **`calculateSpeed()`** (lines 1527-1531)
   - Tanganing tezligini hisoblaydi
   - Formula: `Math.max(200, 1500 - (userLevel + 1) * 200)`
   - Har 10,000 ASRA = 1 daraja (level)

7. **Shop Funksiyalari** (lines 2757-3386)
   - `loadShopDataFromBackend()` - Backenddan shop ma'lumotlari
   - `saveShopDataBackend()` - Shop ma'lumotlarini saqlash
   - `updateShopUI()` - UI yangilash
   - `startAsraAutoPlay()` - ASRA PRO auto-play
   - `cancelAsraProImmediately()` - ASRA PRO bekor qilish

8. **Wallet Funksiyalari** (lines 1967-2755)
   - `getUserFriendlyAddress()` - Wallet address formatlash
   - `updateWalletUI()` - Wallet UI yangilash
   - TON Connect integratsiyasi
   - Withdraw ASRA funksionali

9. **Leaderboard** (lines 3410-3493)
   - `loadLeaderboard()` - Top 50 foydalanuvchini yuklash
   - `/api/leaderboard` endpoint

10. **Referral** (lines 3387-3409)
    - `loadReferralData()` - Referral link generatsiyasi

### 2. `Procfile`
```
web: cd server && node server-real.js
```
Railway deployment uchun start command.

### 3. `nixpacks.toml`
```toml
[phases.build]
cmds = ["cd server && npm install"]

[phases.setup]
nixPkgs = ["nodejs_20"]

[start]
cmd = "cd server && node server-real.js"
```
Nixpacks build configuration - Railway da Node.js 20 ishlatadi.

### 4. `package.json` (Root)
```json
{
  "name": "asra-coin",
  "version": "1.0.0",
  "description": "ASRA Coin Game with Real TON Blockchain",
  "main": "server/server-real.js",
  "scripts": {
    "start": "node server/server-real.js",
    "build": "echo 'No build step required'",
    "dev": "nodemon server/server-real.js"
  },
  "engines": {
    "node": "20.x"
  },
  "dependencies": {
    "@ton/crypto": "^3.2.0",
    "@ton/ton": "^16.2.0",
    "axios": "^1.13.6",
    "cors": "^2.8.5",
    "dotenv": "^16.3.0",
    "express": "^4.18.2",
    "mongoose": "^8.0.0",
    "node-schedule": "^2.1.1",
    "node-telegram-bot-api": "^0.67.0"
  }
}
```

### 5. `railway.json`
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "cd server && node server-real.js",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 3000,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "volumes": [
      {
        "name": "asra-data",
        "mountPath": "/app/data"
      }
    ]
  }
}
```

### 6. `tonconnect-manifest.json`
```json
{
  "url": "https://asratongames.up.railway.app",
  "name": "ASRA Coin",
  "iconUrl": "https://asratongames.up.railway.app/assets/ASRA.png"
}
```
TON Connect uchun manifest fayl.

---

## 📂 Server Papkasi

### 1. `server-real.js` (95,937 bytes, 2643 lines)
**Backend server - asosiy logika**

#### Imports va Sozlamalar (lines 1-153):
```javascript
const express = require('express');
const cors = require('cors');
const { TonClient, WalletContractV5R1, internal, toNano, Address, beginCell } = require('@ton/ton');
const { mnemonicNew, mnemonicToWalletKey } = require('@ton/crypto');
const axios = require('axios');
const { userDB } = require('./jsonDB');
```

#### Xavfsizlik Sozlamalari (lines 14-101):
- **CORS**: Faqat specific origins ruxsat:
  - `https://web.telegram.org`
  - `https://*.telegram.org`
  - `https://asratongames.up.railway.app`
  - `localhost:3000`, `localhost:8080`

- **Rate Limiting**:
```javascript
const RATE_LIMIT = 100; // requests per 15 minutes
const RATE_WINDOW = 15 * 60 * 1000;
```

- **Input Validation**:
```javascript
function isValidUserId(userId) {
    return userId && typeof userId === 'string' && userId.length >= 3 && userId.length <= 50 && /^[a-zA-Z0-9_-]+$/.test(userId);
}
function isValidTonAddress(address) {
    return address && typeof address === 'string' && (address.startsWith('EQ') || address.startsWith('UQ')) && address.length === 48;
}
```

#### Asosiy O'zgaruvchilar (lines 103-153):
```javascript
const SPECIAL_WALLET = 'UQAcF2QrGcjMKh9Bs3vfZA5-b-TrztYn8Uuve8KwGXlrBUNq';
const ALL_COINS = ['blue', 'green', 'pink', 'red', 'yellow', 'asra'];
const PAYMENT_ADDRESS = process.env.PAYMENT_ADDRESS || 'UQCtlk8bgwbSOt8OFnVe4KuFdQDo7kCbrZEhAOW1UUgUtIVM';
const ASRA_CONTRACT_ADDRESS = process.env.ASRA_CONTRACT_ADDRESS || 'EQA8Mx1E9_RXEroXSW7PI5EHwEAMxAMhwKLXTlKX-3uQOJWy';
const MASTER_WALLET_MNEMONIC = process.env.MASTER_WALLET_MNEMONIC || '';
```

#### API Endpoints:

**Health & Config:**
- `GET /api/health` - Railway health check
- `GET /api/config` - Public config (paymentAddress, paymentAmount)

**User Management:**
- `POST /api/user/register` - Foydalanuvchi ro'yxatdan o'tkazish
- `GET /api/user/:userId` - Foydalanuvchi ma'lumotlari
- `GET /api/user/:userId/balance` - Balans tekshirish
- `POST /api/user/:userId/stats` - Statistikani saqlash
- `GET /api/user/:userId/stats` - Statistikani olish

**Game Logic:**
- `POST /api/game/start/:userId` - O'yinni boshlash
- `POST /api/game/stop/:userId` - O'yinni to'xtatish
- `POST /api/game/catch/:userId` - Tangani ushlash
- `GET /api/game/state/:userId` - O'yin holatini olish
- `POST /api/save-game/:userId` - O'yinni saqlash (legacy)
- `GET /api/load-game/:userId` - O'yinni yuklash (legacy)

**Shop:**
- `GET /api/shop/:userId` - Shop ma'lumotlari
- `POST /api/shop/:userId` - Shop saqlash (legacy)
- `POST /api/shop/buy/:userId` - Tangani sotib olish
- `POST /api/shop/select/:userId` - Tangani tanlash

**Payment & Withdraw:**
- `GET /api/check-payment/:userId` - To'lovni tekshirish
- `POST /api/confirm-payment/:userId` - To'lovni tasdiqlash
- `POST /api/withdraw` - ASRA yechib olish
- `POST /api/check-deposit/:userId` - Depozit tekshirish
- `POST /api/check-all-deposits` - Barcha depozitlarni tekshirish

**Leaderboard:**
- `GET /api/leaderboard` - Top 50 foydalanuvchi
- `GET /api/leaderboard/rank/:userId` - Foydalanuvchi reytingi

**Admin:**
- `POST /api/admin/monthly-reset` - Oylik reset (admin only)
- `POST /api/notify/:userId` - Telegram notification

**Debug (Development only):**
- `GET /api/debug/wallet/:userId` - Wallet debug info
- `GET /api/debug/toncenter` - TON Center transactions
- `POST /api/setup-webhook` - Webhook sozlash
- `GET /api/webhook-info` - Webhook info

**Restart:**
- `POST /api/restart-game/:userId` - O'yinni noldan boshlash

#### Game Constants (lines 1565-1584):
```javascript
const GAME_CONSTANTS = {
    RED_PENALTY: 100,              // Red coin jarima
    MIN_REWARD: 1,                 // Min sovrin
    MAX_REWARD: 100,               // Max sovrin
    ASRA_PRO_LIMIT: 2000000,      // ASRA PRO limit
    BASE_SPEED_MS: 1500,           // Asosiy tezlik
    SPEED_PER_TON_MS: 200,         // TON ga tezlik
    MIN_SPEED_MS: 200             // Min tezlik
};

const COIN_CONFIG = {
    gunmetal: { price: 0 },
    blue: { price: 2 },
    green: { price: 5 },
    pink: { price: 10 },
    red: { price: 20 },
    yellow: { price: 30 },
    asra: { price: 99, noPenalty: true, autoPlay: true }
};
```

#### Asosiy Funksiyalar:

**`createDepositWallet()`** (lines 194-209)
- Yangi TON wallet yaratadi
- 24 ta mnemonic so'z
- Public/Private key pair

**`getRealTonBalance(address)`** (lines 212-228)
- TON Center API orqali haqiqiy balans tekshiradi
- Nanoton dan TON ga konvertatsiya

**`sendAsraJetton(toAddress, amount)`** (lines 252-313)
- ASRA jetton transfer qiladi
- Master wallet mnemonic dan foydalanadi
- TON blockchainga transaction yuboradi

**`calculateReward(coinColor, shopData)`** (lines 1634-1668)
- Tangani bosishdan sovrin hisoblaydi
- Server-side hisoblash (anti-cheat)
- Red coin = -100 ASRA jarima

**`applyReward(user, rewardResult)`** (lines 1671-1689)
- Sovrinni foydalanuvchi balansiga qo'shadi
- 0 dan pastga tushmaslikni tekshiradi

**`performMonthlyReset()`** (lines 2552-2616)
- Har oyning 1-sanasida ishga tushadi
- VIP wallet dan tashqari barcha userlarni o'chiradi
- VIP userlar ASRA va stats resetlanadi

### 2. `jsonDB.js` (169 lines)
**JSON file-based database with encryption**

```javascript
const DATA_DIR = process.env.DATA_PATH || '/app/data-on';
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || '';

// AES-256-CBC encryption
function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    return iv.toString('hex') + ':' + encrypted;
}

// User operations
const userDB = {
    get(userId) { /* ... */ },
    getAll() { /* ... */ },
    set(userId, userData) { /* ... */ },
    delete(userId) { /* ... */ }
};
```

**Xususiyatlar:**
- AES-256-CBC shifrlash
- Mnemonic va private key shifrlanadi
- Railway Volume da saqlanadi

### 3. `bot-final.js` (115 lines)
**Telegram Bot implementation**

```javascript
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const GAME_URL = process.env.GAME_URL || 'https://asratongames.up.railway.app';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://asratongames.up.railway.app/bot-webhook';

function initBot(app) {
    // Webhook yoki Polling rejimi
    // /start command handler
    // Game URL with userId, firstName, lastName
}
```

**Bot Xususiyatlari:**
- Webhook yoki Polling rejimi
- /start komandasi - game URL yuboradi
- User chatId saqlaydi

### 4. `package.json` (Server)
```json
{
  "name": "tongame-server",
  "dependencies": {
    "@ton/crypto": "^3.2.0",
    "@ton/ton": "^16.2.0",
    "axios": "^1.13.6",
    "cors": "^2.8.5",
    "dotenv": "^16.3.0",
    "express": "^4.18.2",
    "mongoose": "^8.0.0",
    "node-telegram-bot-api": "^0.67.0"
  }
}
```

---

## 🎨 Assets Papkasi

| Fayl | Hajmi | Tavsif |
|------|-------|--------|
| ASRA.png | 216,858 bytes | ASRA token logotipi |
| ASRAPRO.png | 216,858 bytes | ASRA PRO coin rasmi |
| Blue.png | 213,793 bytes | Blue coin rasmi |
| Button.png | 47,162 bytes | UI button foni |
| Green.png | 208,512 bytes | Green coin rasmi |
| Gunmetal.png | 215,220 bytes | Default coin rasmi |
| Pink.png | 219,212 bytes | Pink coin rasmi |
| Red.png | 213,962 bytes | Red coin rasmi |
| Yellow.png | 213,299 bytes | Yellow coin rasmi |

---

## 🔐 Environment Variables (.env)

```env
# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_BOT_USERNAME=asratonbot

# TON
TON_API_KEY=your_toncenter_api_key
MASTER_WALLET_MNEMONIC=word1 word2 ... word24
MASTER_WALLET_ADDRESS=UQCtlk8bgwbSOt8OFnVe4KuFdQDo7kCbrZEhAOW1UUgUtIVM
PAYMENT_ADDRESS=UQCtlk8bgwbSOt8OFnVe4KuFdQDo7kCbrZEhAOW1UUgUtIVM
ASRA_CONTRACT_ADDRESS=EQA8Mx1E9_RXEroXSW7PI5EHwEAMxAMhwKLXTlKX-3uQOJWy

# Security
WALLET_ENCRYPTION_KEY=your_32_byte_encryption_key
ADMIN_KEY=your_admin_key

# URLs
GAME_URL=https://asratongames.up.railway.app
WEBHOOK_URL=https://asratongames.up.railway.app/bot-webhook

# Data
DATA_PATH=/app/data-on
RAILWAY_VOLUME_MOUNT_PATH=/app/data

# Mode
NODE_ENV=production
USE_WEBHOOK=true
```

---

## 📊 User Data Strukturasi

```javascript
{
    userId: "123456789",
    connectedWallet: "UQ...",           // TON wallet address
    firstName: "John",                  // Telegram first name
    lastName: "Doe",                    // Telegram last name
    chatId: 123456789,                  // Telegram chat ID
    
    // Deposit System
    depositWallet: {
        address: "UQ...",
        publicKey: "...",
        privateKey: "encrypted...",
        mnemonic: "encrypted..."
    },
    balance: 0,                         // Available TON
    totalDeposited: 0,                  // Total deposits
    totalConverted: 0,                  // Total spent in shop
    
    // Payment Status
    hasPaid: false,                     // 1 TON payment made
    paidAt: "2024-01-01T00:00:00Z",
    paidAmount: 1,
    paymentTxHash: "...",
    paidFromAddress: "UQ...",
    paymentResetAt: null,
    
    // Game Data
    gameData: {
        asraScore: 0,                   // ASRA balance
        lastSaved: "2024-01-01T00:00:00Z"
    },
    
    // Shop Data
    shopData: {
        purchased: ['gunmetal', 'blue'], // Purchased coins
        selected: 'blue',                // Currently selected
        purchaseTime: { blue: 1234567890 },
        asraProUsed: 0                   // ASRA PRO usage counter
    },
    
    // Statistics
    globalStats: {
        totalClicksAllTime: 100,
        totalCoinsCollected: 95,
        totalTonEarned: 0,
        gamesPlayed: 10,
        firstPlayed: "2024-01-01T00:00:00Z",
        lastPlayed: "2024-01-15T00:00:00Z"
    },
    
    // Timestamps
    createdAt: "2024-01-01T00:00:00Z",
    lastDepositAt: null,
    lastBalanceCheck: null
}
```

---

## 🎮 O'yin Mexanikasi

### 1. Tangalar va Sovrinlar

| Tanga | Narx (TON) | Sovrin (ASRA) | Xususiyat |
|-------|-----------|---------------|-----------|
| Gunmetal | 0 | +1 | Default, normal tezlik |
| Blue | 2 | +2 | Tezlik sekinlashadi |
| Green | 5 | +5 | Tezlik ko'proq sekinlashadi |
| Pink | 10 | +10 | Ko'proq vaqt |
| Red | 20 | +20 | Tezlik o'zgarmaydi |
| Yellow | 30 | +30 | Juda sekin tezlik |
| ASRA PRO | 99 | +99 | Auto-play, no penalty, 2M limit |

### 2. Red Coin Jarimasi
- **Har qanday tangada** red glow bo'lsa = -100 ASRA
- Faqat **visual effekt** - tangani tanlashidan qat'i nazar

### 3. ASRA PRO "All or Nothing"
- **Auto-play**: Har 1 soniyada +99 ASRA
- **Limit**: Maksimum 2,000,000 ASRA
- **Eslatma**: 
  - STOP bosilganda = ASRA 0 ga tushadi
  - Ekran o'chsa = ASRA 0 ga tushadi
  - App background ga otsa = ASRA 0 ga tushadi
- **Saqash**: Faqat 2,000,000 ASRA to'plangandagina saqlanadi

### 4. Tezlik Formulasi
```javascript
userLevel = Math.floor(asraScore / 10000);
baseSpeed = Math.max(200, 1500 - (userLevel + 1) * 200);
// + coin based slowdown
```

### 5. Monthly Reset
- **Sana**: Har oyning 1-sanasi 00:00
- **Resetlanadi**: Barcha foydalanuvchilar (VIP dan tashqari)
- **VIP Saqlanadi**: Maxsus wallet (`SPECIAL_WALLET`)
- **Bonus**: 1,000 ASRA (wallet ulangan bo'lsa)

---

## 💰 Withdrawal Tizimi

### Shartlar:
1. **Minimum**: 10,000 ASRA balans
2. **Komissiya**: 10,000 ASRA doim qoladi
3. **Max**: `balance - 10,000`
4. **Wallet**: TON Connect orqali ulangan wallet

### Jarayon:
1. Foydalanuvchi "Withdraw ASRA" bosadi
2. Server `/api/withdraw` ga so'rov yuboradi
3. Master wallet dan ASRA jetton yuboriladi
4. Game balance dan ayiriladi
5. Transaction TON blockchain da

---

## 🔗 API Request/Response Namunalari

### 1. Game Start
```http
POST /api/game/start/123456789
Content-Type: application/json

Response:
{
    "success": true,
    "coinSpeed": 1300,
    "selectedCoin": "blue",
    "gameState": {
        "asraScore": 5000
    }
}
```

### 2. Catch Coin
```http
POST /api/game/catch/123456789
Content-Type: application/json

Body:
{
    "coinColor": "pulse-yellow",
    "timestamp": 1704067200000
}

Response:
{
    "success": true,
    "reward": 2,
    "type": "normal",
    "gameState": {
        "asraScore": 5002
    }
}
```

### 3. Withdraw ASRA
```http
POST /api/withdraw
Content-Type: application/json

Body:
{
    "userId": "123456789",
    "amount": 15000,
    "toAddress": "UQ...",
    "testMode": false
}

Response:
{
    "success": true,
    "message": "15000 ASRA withdrawn successfully",
    "withdrawn": 15000,
    "remaining": 10000,
    "asraScore": 10000,
    "toAddress": "UQ...",
    "isReal": true,
    "jettonTransfer": true
}
```

---

## 🚀 Deployment

### Railway da Deploy qilish:
1. GitHub repo ni Railway ga ulash
2. Environment variables sozlash
3. Volume qo'shish (`/app/data`)
4. Avtomatik deploy

### Local Development:
```bash
cd server
npm install
node server-real.js
```

---

## 📝 Kod Tuzilishi Xulosalari

### Frontend (`colorrush.html`):
- **3526 lines** - bitta faylda barcha frontend
- HTML + CSS + JavaScript birgalikda
- Telegram WebApp API integratsiyasi
- TON Connect UI integratsiyasi
- SweetAlert2 modallar uchun

### Backend (`server-real.js`):
- **2643 lines** - Express.js server
- **40+ API endpoints**
- TON blockchain integratsiyasi
- JSON file database
- Telegram bot integratsiyasi
- Anti-cheat mexanizmlari

### Database (`jsonDB.js`):
- **169 lines** - JSON file-based
- AES-256-CBC encryption
- Railway Volume integratsiyasi

---

## ⚠️ Muhim Eslatmalar

1. **Security**: Mnemonics va private keys shifrlangan
2. **Backup**: Railway Volume da data saqlanadi
3. **Rate Limiting**: IP based 100 requests/15 min
4. **Input Validation**: Barcha inputlar tekshiriladi
5. **CORS**: Faqat ruxsat berilgan originlar
6. **Monthly Reset**: Avtomatik har oyning 1-sanasida
7. **ASRA PRO Risk**: "All or Nothing" - ehtiyot bo'ling!

---

## 📞 Bog'lanish

- **Telegram Bot**: [@asratonbot](https://t.me/asratonbot)
- **Game URL**: https://asratongames.up.railway.app
- **ASRA Token**: [dyor.io](https://dyor.io/ru/token/EQA8Mx1E9_RXEroXSW7PI5EHwEAMxAMhwKLXTlKX-3uQOJWy)

---

**Yaratildi**: 2024
**Muallif**: ASRA Ton Jamoasi
**Loyiha**: ASRA Coin Telegram Game
