# 🚀 ALTERNATIVE DEPLOYMENT - Render.com

Railway ishlamasa, **Render.com** ishlatish mumkin. Bu bexos platforma.

---

## RENDER.COM (Bepul va Oson)

### 1. Ro'yxatdan o'tish
- [render.com](https://render.com) ga kiring
- GitHub bilan ulanish (GitHub accountingiz bilan)

### 2. Yangi Web Service yaratish
- **Dashboard** → **New** → **Web Service**
- `nTonGames` repository ni tanlang
- **Connect**

### 3. Sozlamalar
Quyidagi sozlamalarni kiriting:

| Sozlama | Qiymat |
|---------|--------|
| **Name** | `ntongame-bot` |
| **Region** | `Oregon (US West)` |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `cd server && npm install` |
| **Start Command** | `cd server && node server-real.js` |
| **Plan** | `Free` |

### 4. Environment Variables
**Advanced** → **Add Environment Variable**:

```
TELEGRAM_BOT_TOKEN=8206421731:AAEgsCtnpqeZ5iI8GgA_YmTGiI2s84gKMw8
GAME_URL=https://n-ton-games-xxx.vercel.app
API_BASE_URL=https://ntongame-bot.onrender.com/api
TON_API_KEY=your_ton_api_key_here
PORT=10000
NODE_ENV=production
```

> **DIQQAT:** `PORT=10000` Render talab qiladi!

### 5. Deploy
- **Create Web Service** tugmasini bosing
- 2-3 daqiqa kuting (build va deploy)

### 6. URL ni olish
Deploy dan so'ng URL ko'rinadi:
- Masalan: `https://ntongame-bot.onrender.com`
- Bu URL ni saqlang (Vercel API_BASE_URL uchun kerak)

---

## Vercel + Render Kombinatsiyasi

```
Frontend (Vercel): https://n-ton-games-xxx.vercel.app
Backend (Render):  https://ntongame-bot.onrender.com
```

**Environment variables yangilash:**
1. Render da: `GAME_URL` = Vercel URL
2. Vercel da: `API_BASE_URL` = Render URL + `/api`

---

## YANA MUAMMO BO'LSA

### Variant 2: Fly.io
- [fly.io](https://fly.io) - yaxshi bepul variant
- `flyctl` CLI kerak

### Variant 3: Heroku
- [heroku.com](https://heroku.com)
- Uzoq vaqt ishlagan, lekin endi kredit karta talab qiladi

### Variant 4: Lokal test (tezkor)
O'z kompyuteringizda bot ishga tushirish:
```bash
cd c:\Users\Olimjon\OneDrive\Desktop\TonGame\tongame-repo\server
copy .env.example .env
# .env ni to'ldiring
npm install
node bot-final.js
```

---

## TEGISHLI MUAMMO

Agar **Render.com** da ham muammo bo'lsa, menga **xatolik matni** ni yuboring, aniq sababni topamiz.
