# 🚀 DEPLOYMENT GUIDE - Vercel + Railway

## 1️⃣ VERCEL (Frontend) - 3 qadam

### Qadam 1: Eski project ni o'chirish
- [vercel.com/dashboard](https://vercel.com/dashboard) ga kiring
- **nTonGame** project ni toping
- **Settings** → **General** → **Delete Project**

### Qadam 2: Yangi project yaratish
- **Add New...** → **Project**
- **Import Git Repository** → `automatetosequence/nTonGames`
- **Framework Preset:** `Other`
- **Root Directory:** `./` (bo'sh qoldiring)
- **Build Command:** `echo 'No build required'`
- **Output Directory:** `.`
- **Install Command:** `npm install` (yoki bo'sh qoldiring)
- **Deploy** tugmasini bosing

### Qadam 3: Domain ni tekshirish
Deploy dan so'ng Vercel URL ni oling:
- Masalan: `https://n-ton-games-xxx.vercel.app`
- Bu URL ni saqlang (Railway da kerak bo'ladi)

---

## 2️⃣ RAILWAY (Backend + Bot) - 5 qadam

### Qadam 1: Railway ga ulash
- [railway.app](https://railway.app) ga kiring
- **New Project** → **Deploy from GitHub repo**
- `automatetosequence/nTonGames` tanlang
- **Add Variables** tugmasini bosing

### Qadam 2: Environment Variables qo'shish
Quyidagi o'zgaruvchilarni qo'shing:

```
TELEGRAM_BOT_TOKEN=8206421731:AAEgsCtnpqeZ5iI8GgA_YmTGiI2s84gKMw8
GAME_URL=https://n-ton-games-xxx.vercel.app
API_BASE_URL=https://your-railway-url.railway.app/api
TON_API_KEY=your_ton_api_key_here
PORT=3000
NODE_ENV=production
```

> **DIQQAT:** `GAME_URL` ni o'zingizning Vercel URL ingiz bilan almashtiring!

### Qadam 3: Start Command tekshirish
- **Settings** → **Deploy**
- **Start Command:** `cd server && node server-real.js`
- **Healthcheck Path:** `/api/health`

### Qadam 4: Deploy
- **Deploy** tugmasini bosing
- Logs da xatolik yo'qligini tekshiring

### Qadam 5: Domain ni olish
Deploy dan so'ng Railway URL ni oling:
- Masalan: `https://ntongames-production.up.railway.app`
- Bu URL ni saqlang

---

## 3️⃣ TELEGRAM BOT ni ulash

### Qadam 1: BotFather da WebApp sozlash
- @BotFather ga kiring
- `/mybots` → Sizning bot → **Bot Settings**
- **Menu Button** → **Configure menu button**
- **Configure Web App**:
  - **Name:** `🎮 O'ynash`
  - **URL:** `https://n-ton-games-xxx.vercel.app` (Vercel URL)

### Qadam 2: Webhook o'rnatish (ixtiyoriy)
Bot ishlamasa, webhook o'rnating:
```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-railway-url.railway.app/api/webhook
```

---

## ✅ TEKSHIRISH

1. **Frontend:** Vercel URL ochilsin → O'yin ko'rinsin
2. **Backend:** Railway URL + `/api/health` → `{"status":"ok"}`
3. **Bot:** Telegram da `/start` → Bot javob bersin
4. **Wallet:** Wallet tugmasi bosilsa → Wallet modal ochilsin

---

## 🐛 MUAMMO BO'LSA

### Rasmlar ko'rinmasa:
- Vercel **Settings** → **General** → **Build & Development Settings**
- **Output Directory:** `.` ekanligini tekshiring

### Bot javob bermasa:
- Railway **Logs** ni tekshiring
- `TELEGRAM_BOT_TOKEN` to'g'riligini tekshiring
- @BotFather da `/revoke` → yangi token oling

### API ishlamasa:
- `GAME_URL` va `API_BASE_URL` to'g'ri ekanligini tekshiring
- Railway domain ni yangilagan bo'lsangiz, `API_BASE_URL` ni ham yangilang
