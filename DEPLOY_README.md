# Deploy qilish uchun tayyorlash

## 1. Railway.app da manual deploy

### 1.1 GitHub ga yuklash
1. GitHub da yangi repository yarating: `tongame`
2. Loyiha fayllarini yuklang
3. README qo'shing

### 1.2 Railway da deploy
1. [railway.app](https://railway.app) ga kiring
2. "New Project" → "Deploy from GitHub repo"
3. Repository ni tanlang
4. "Add Variables" tugmasini bosing:
   - `TELEGRAM_BOT_TOKEN=8206421731:AAEgsCtnpqeZ5iI8GgA_YmTGiI2s84gKMw8`
   - `TON_API_KEY=5ba7895066f2f1d949132be194057a0fa11d38763285909d8aff84f69f258c4e`
   - `PORT=3000`
5. Deploy!

### 1.3 Botni yangilash
Railway URL ni oling (`https://tongame.up.railway.app`) va bot da yangilang:
```javascript
const GAME_URL = 'https://tongame.up.railway.app';
```

## 2. Netlify da frontend deploy
1. [netlify.com](https://netlify.com) ga kiring
2. "Add new site" → "Deploy manually"
3. `colorrush.html` va `assets` papkasini yuklang
4. Domain ni sozlang

## 3. Botni yangilash
Railway URL ni olgach, `bot-final.js` da yangilang:
```javascript
const GAME_URL = 'https://your-railway-url.railway.app';
```

## Tayyor fayllar
- `railway.json` - Railway konfiguratsiyasi
- `nixpacks.toml` - Build sozlamalari
- `Procfile` - Start buyruqi

## Eslatmalar
- Railway bepul 500 soat/oy
- HTTPS avtomatik
- PostgreSQL bepul
