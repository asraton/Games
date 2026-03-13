# Railway.app Deploy Qo'llanmasi

## 1. Railway CLI o'rnatish

```bash
npm install -g @railway/cli
```

## 2. Railway ga login

```bash
railway login
```

## 3. Loyihani yaratish

```bash
cd c:\Users\Olimjon\OneDrive\Desktop\TonGame\tanga-game
railway init
```

## 4. Environment Variables sozlash

Railway dashboard ga kiring va quyidagi o'zgaruvchilarni qo'shing:

```
TELEGRAM_BOT_TOKEN=8206421731:AAEgsCtnpqeZ5iI8GgA_YmTGiI2s84gKMw8
TON_API_KEY=5ba7895066f2f1d949132be194057a0fa11d38763285909d8aff84f69f258c4e
PORT=3000
```

## 5. Deploy qilish

```bash
railway up
```

## 6. URL ni olish

```bash
railway domain
```

## 7. Botni yangilash

Railway dan olingan URL ni bot ga qo'llash:

```javascript
const GAME_URL = 'https://your-app.railway.app';
```

## ALTERNATIVA: Netlify (Oddiyroq)

### 1. Netlify CLI o'rnatish

```bash
npm install -g netlify-cli
```

### 2. Login

```bash
netlify login
```

### 3. Deploy

```bash
cd c:\Users\Olimjon\OneDrive\Desktop\TonGame\tanga-game
netlify deploy --prod --dir=.
```

## Eslatmalar

- Railway bepul 500 soat/oy beradi
- Backend server uchun Railway yaxshiroq
- Frontend uchun Netlify yaxshiroq
- Telegram Web App HTTPS talab qiladi

## Xavfsizlik

⚠️ TOKEN va API_KEY larni hech qachon GitHub ga yuklamang!
Railway/Netlify environment variables dan foydalaning.
