# ASRA Coin - TON Blockchain O'yini

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app)

Telegram Mini App o'yini haqiqiy TON blockchain integratsiyasi bilan. Foydalanuvchilar tangalarni bosib ASRA ballarini yig'ishadi, ularni TON ga aylantirib hamyonlariga yechib olishlari mumkin.

## Loyiha haqida

ASRA Coin - bu clicker uslubidagi o'yin bo'lib, unda foydalanuvchilar:
- Ekranda paydo bo'ladigan tangalarni bosib 1-100 ASRA yig'ishadi
- 10,000 ASRA = 1 TON ga almashadi
- Do'kondan premium tangalarni sotib olishadi
- Yig'ilgan TON larni shaxsiy hamyonlariga yechib olishadi
- TON Connect orqali TON hamyonlarini ulaydi

## Loyiha strukturasi

```
tongame-repo/
├── .git/                       # Git repository
├── .gitignore                  # Git ignore qoidalari
├── Procfile                    # Heroku/Railway process fayli
├── nixpacks.toml               # Nixpacks build konfiguratsiyasi
├── railway.json                # Railway deploy konfiguratsiyasi
├── package.json                # Asosiy loyiha konfiguratsiyasi
├── colorrush.html              # Asosiy o'yin frontend (bir sahifali ilova)
├── shop-styles.css             # Do'kon modal uslublari
├── tonconnect-manifest.json    # TON Connect manifest
├── assets/                     # O'yin grafikalari
│   ├── ASRA.png               # Asosiy tanga/token logotipi
│   ├── Blue.png               # Ko'k tanga
│   ├── Button.png             # UI tugma foni
│   ├── Green.png              # Yashil tanga
│   ├── Gunmetal.png           # Gunmetal tanga
│   ├── Pink.png               # Pushti tanga
│   ├── Red.png                # Qizil tanga
│   └── Yellow.png             # Sariq tanga
└── server/                     # Backend server
    ├── .env                   # Muhit o'zgaruvchilari (git da yo'q)
    ├── package.json           # Server bog'liqliklari
    ├── package-lock.json      # Kutilgan bog'liqlik versiyalari
    ├── server-real.js         # Asosiy Express server (1479 qator)
    ├── jsonDB.js              # AES-256 shifrlangan JSON ma'lumotlar bazasi
    ├── bot-final.js           # Telegram bot integratsiyasi
    ├── models/                # Ma'lumotlar bazasi modellari (bo'sh)
    └── node_modules/          # Server bog'liqliklari (git da yo'q)
```

## Funksiyalar

### O'yin mexanikasi
- **Tanga bosish**: Paydo bo'lgan tangalarni bosib ASRA yig'ing
- **Tezlik chaqqonligi**: Tangalar tez kichiklanib yo'qoladi
- **Jarima tizimi**: Qizil nurlanadigan tangalar 100 ASRA ayiradi
- **Auto-Play**: ASRA PRO avtomatik o'yin funksiyasi

### Do'kon tizimi
| Tanga | Narx | Foyda |
|-------|------|-------|
| Blue | 1 TON | Tanga tezligi sekinlashadi |
| Green | 5 TON | Tanga tezligi ko'proq sekinlashadi |
| Pink | 10 TON | Tanga tezligi sekinlashadi, ko'proq vaqt |
| Red | 20 TON | Tanga tezligi sekinlashadi, +3x vaqt bonusi |
| Yellow | 30 TON | Tanga tezligi sekinlashadi, +4x vaqt bonusi |
| ASRA PRO | 99 TON | Auto-play, -100 jarimasiz, 200 TON gacha |

### Hamyon integratsiyasi
- TON Connect orqali hamyon ulash
- Unique deposit address orqali haqiqiy TON o'tkazmalar
- Ulangan hamyonlarga xavfsiz yechib olish
- TON Center API orqali balans kuzatuvi

## Texnologiya to'plami

### Frontend
- Oddiy HTML/CSS/JavaScript (frameworksiz)
- TON Connect UI hamyon integratsiyasi uchun
- SweetAlert2 bildirishnomalar uchun
- Mobil qurilmalar uchun responsive dizayn

### Backend
- **Runtime**: Node.js 20.x
- **Framework**: Express.js 4.18.2
- **Ma'lumotlar bazasi**: JSON fayl-asosida (AES-256 shifrlash bilan)
- **TON integratsiyasi**: @ton/ton, @ton/crypto
- **Telegram**: node-telegram-bot-api
- **API**: TON Center API v2

### Deploy
- **Platforma**: Railway (asosiy)
- **Build**: Nixpacks
- **Jarayon**: Procfile-asosida

## Muhit o'zgaruvchilari

### Majburiy (.env server/ ichida)
```env
# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token_here

# TON Blockchain
TON_API_KEY=your_toncenter_api_key
MASTER_WALLET_MNEMONIC=your_wallet_mnemonic_words
MASTER_WALLET_ADDRESS=your_master_wallet_address
PAYMENT_ADDRESS=payment_receiving_address

# Xavfsizlik
WALLET_ENCRYPTION_KEY=32_character_encryption_key

# URL lar (Railway deploy uchun)
GAME_URL=https://your-app.railway.app
WEBHOOK_URL=https://your-app.railway.app/bot-webhook
USE_WEBHOOK=true
RAILWAY_VOLUME_MOUNT_PATH=/app/data
```

### Ixtiyoriy
```env
PORT=3000
```

## API Endpointlar

| Metod | Endpoint | Tavsif |
|--------|----------|-------------|
| GET | `/` | Asosiy o'yin HTML ni yetkazish |
| GET | `/api/health` | Health check |
| GET | `/api/config` | Ommaviy konfiguratsiyani olish |
| POST | `/api/user/register` | Foydalanuvchini ro'yxatdan o'tkazish/kirish |
| POST | `/api/user/balance` | Foydalanuvchi balansini olish |
| POST | `/api/user/update-score` | ASRA ballini yangilash |
| POST | `/api/withdraw` | TON yechib olish so'rovi |
| POST | `/api/payment/verify` | TON to'lovini tekshirish |
| POST | `/bot-webhook` | Telegram webhook (agar yoqilgan bo'lsa) |

## O'rnatish va rivojlantirish

### Mahalliy sozlash

1. **Repository ni klonlash**
   ```bash
   git clone <repo-url>
   cd tongame-repo
   ```

2. **Server bog'liqliklarini o'rnatish**
   ```bash
   cd server
   npm install
   ```

3. **Muhitni sozlash**
   ```bash
   cp .env.example .env
   # .env ni kalitlaringiz bilan tahrirlang
   ```

4. **Rivojlanish serverini ishga tushirish**
   ```bash
   npm run dev
   # yoki
   node server-real.js
   ```

5. **O'yinga kirish**
   Brauzerda `http://localhost:3000` ni oching

### Ishlab chiqarish deploy (Railway)

1. GitHub repo ni Railway ga ulang
2. Railway dashboard da muhit o'zgaruvchilarini qo'shing
3. `railway.json` orqali avtomatik deploy

## Xavfsizlik funksiyalari

- **AES-256 Shifrlash**: Hamyon mnemonic va private keylari shifrlangan
- **Manzil tekshiruvi**: Yechib olish faqat ulangan hamyon manzillariga
- **TON Manzil Parsing**: @ton/ton kutubxonasi orqali to'g'ri manzil solishtirish
- **Deposit Hamyonlar**: Har bir foydalanuvchiga unique deposit manzil
- **Tezlik cheklash**: Railway/nginx orqali o'rnatilgan

## Ma'lumotlar bazasi sxemasi

Foydalanuvchilar `users.json` da saqlanadi:
```json
{
  "userId": {
    "userId": "telegram_user_id",
    "connectedWallet": "user_ton_address",
    "depositWallet": {
      "address": "unique_deposit_address",
      "mnemonic": "encrypted_mnemonic",
      "privateKey": "encrypted_key",
      "publicKey": "public_key"
    },
    "balance": 0.0,
    "totalDeposited": 0.0,
    "totalConverted": 0.0,
    "jettonBalance": 0,
    "hasPaid": false,
    "purchasedCoins": [],
    "selectedCoin": "default"
  }
}
```

## O'yin jarayoni

1. Foydalanuvchi Telegram bot `/start` komandasi orqali o'yinni ochadi
2. URL da foydalanuvchi Telegram ID si bilan o'yin yuklanadi
3. Foydalanuvchi START ni bosib o'yinni boshlaydi
4. Tangalar tasodifiy paydo bo'ladi - foydalanuvchi bosib ASRA yig'adi
5. Foydalanuvchi quyidagilarni qilishi mumkin:
   - TON Connect orqali hamyon ulash
   - Yechib olishni yoqish uchun 1 TON to'lash
   - Yig'ilgan TON bilan do'kondan tangalar sotib olish
   - Ulangan hamyonga TON yechib olish (min 10 TON, 1 TON komissiya)

## Muhim eslatmalar

- **Yechib olish komissiyasi**: Har bir yechib olish uchun 1 TON blockchain komissiya
- **Minimal yechib olish**: 10 TON (komissiyadan keyin 9 TON)
- **To'lov talab qilinadi**: Foydalanuvchilar yechib olishni yoqish uchun 1 TON to'lashi kerak
- **Auto-Play limit**: ASRA PRO funksiyasi 200 TON gacha cheklangan

## Hissa qo'shish

1. Repository ni fork qiling
2. Feature branch yaratish
3. O'zgarishlarni commit qilish
4. Branch ga push qilish
5. Pull Request yaratish

## Litsenziya

MIT License - Batafsil ma'lumot uchun LICENSE fayliga qarang

## Aloqa

- **Telegram Bot**: ASRA Coin bot ni qidiring
- **Qo'llab-quvvatlash**: Telegram bot orqali /help komandasi

---

**ASRA Coin Jamoasi** - TON Ekosistemasiga eshik
