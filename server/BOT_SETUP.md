# Telegram Botni Ishga Tushirish Qo'llanmasi

## 1. Bot Token Olish

1. Telegramda @BotFather botiga kiring
2. `/newbot` komandasini yuboring
3. Bot nomini kiriting (masalan: TON Coin Rush)
4. Bot username kiriting (masalan: tncoinrush_bot) - _bot bilan tugashi kerak
5. BotFather sizga token beradi, uni nusxa oling

## 2. Token Sozlash

### Variant A: Environment Variable (Tavsiya etiladi)

Windows (PowerShell):
```powershell
$env:TELEGRAM_BOT_TOKEN = "YOUR_BOT_TOKEN_HERE"
```

Windows (CMD):
```cmd
set TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE
```

### Variant B: .env Fayl

`.env` faylini yarating va tokenni yozing:
```
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE
GAME_URL=http://localhost:8080
API_BASE_URL=http://localhost:3000/api
```

## 3. Serverlarni Ishga Tushirish

### Backend Server:
```bash
cd server
npm run server:simple
```

### Frontend:
```bash
cd tanga-game
npx serve . -p 8080
```

### Telegram Bot (Yangi terminal):
```bash
cd server
npm run bot
```

Yoki barchasini birdaniga:
```bash
cd server
npm run start:all
```

## 4. Botni Test Qilish

1. Telegramda bot username orqali toping (masalan: @tncoinrush_bot)
2. `/start` komandasini yuboring
3. Tugmalarni bosing:
   - 🎮 O'ynash - O'yinni ochadi
   - 💰 Wallet ulash - Wallet ulanish yo'riqnomasi
   - 📊 Balans - Real balans ko'rsatadi (backenddan)
   - 🛒 Do'kon - Itemlar sotib olish
   - 💸 Pul yechish - Withdraw yo'riqnomasi

## 5. Xususiyatlar

- ✅ Real backend API integratsiyasi
- ✅ Balans tekshirish (haqiqiy ma'lumotlar)
- ✅ Do'kon itemlarini ko'rish
- ✅ Item sotib olish
- ✅ Web App orqali o'yinga o'tish
- ✅ Inline keyboard tugmalari

## 6. Muammolar

Agar bot ishlamasa:
1. Token to'g'ri ekanini tekshiring
2. Backend server ishlayotganini tekshiring (port 3000)
3. Frontend ishlayotganini tekshiring (port 8080)
4. Konsolda xatoliklarni qidiring

## 7. Production Uchun

Productionga o'tishda:
1. `GAME_URL` ni haqiqiy domenga o'zgartiring
2. `API_BASE_URL` ni production serverga o'zgartiring
3. MongoDB ulang (hozir in-memory)
4. Webhook sozlang (polling o'rniga)

## Fayllar

- `bot-full.js` - To'liq bot kodlari
- `server-simple.js` - Backend server (in-memory)
- `.env.example` - Config namuna
