# GitHub ga Yuklash Qo'llanmasi

## 1. GitHub Desktop o'rnatish

1. [desktop.github.com](https://desktop.github.com) dan yuklab oling
2. O'rnatib, GitHub akkauntga kiring

## 2. Yangi Repository yaratish

GitHub Desktop da:
1. **File** → **New Repository**
2. Name: `tongame`
3. Local path: `C:\Users\Olimjon\OneDrive\Desktop\TonGame\tanga-game`
4. **Create Repository**

## 3. Fayllarni qo'shish

GitHub Desktop da:
1. **Changes** tab da barcha fayllarni ko'rasiz
2. Summary ga yozing: `Initial commit`
3. **Commit to main** tugmasini bosing
4. **Publish repository** → **Publish**

## 4. Railway.app ga deploy

1. [railway.app](https://railway.app) ga kiring
2. **New Project** → **Deploy from GitHub repo**
3. `tongame` repository ni tanlang
4. **Add Variables**:
   ```
   TELEGRAM_BOT_TOKEN=8206421731:AAEgsCtnpqeZ5iI8GgA_YmTGiI2s84gKMw8
   TON_API_KEY=5ba7895066f2f1d949132be194057a0fa11d38763285909d8aff84f69f258c4e
   PORT=3000
   ```
5. **Deploy!**

## 5. Botni yangilash

Railway URL ni olgach (`https://tongame.up.railway.app`), menga ayting. Botni yangilab qo'yaman!

## Tayyor fayllar
- ✅ `railway.json`
- ✅ `nixpacks.toml`
- ✅ `Procfile`
