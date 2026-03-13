# 🐍 PYTHON SERVER DEPLOYMENT OPTIONS

Node.js o'rniga **Python + Flask/FastAPI** ishlatish mumkin.

---

## Variant 1: PythonAnywhere (Eng Oson)

**Bepul, tezkor, browser da ishlaydi**

### 1. Ro'yxatdan o'tish
- [pythonanywhere.com](https://www.pythonanywhere.com) ga kiring
- Free account yaratish

### 2. Web App yaratish
- **Dashboard** → **Web** → **Add a new web app**
- **Flask** tanlang
- **Python 3.10**
- **Next**

### 3. Kodlarni yuklash
**Files** bo'limida:
```bash
# Terminal oching:
$ git clone https://github.com/automatetosequence/nTonGames.git
$ cd nTonGames
```

### 4. Flask app yaratish
`app.py` fayl:
```python
from flask import Flask, jsonify, request
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)

@app.route('/api/health')
def health():
    return jsonify({"status": "ok"})

@app.route('/api/user/register', methods=['POST'])
def register():
    data = request.json
    user_id = data.get('userId')
    return jsonify({
        "success": True,
        "user": {
            "userId": user_id,
            "balance": 0,
            "depositAddress": "EQ..."
        }
    })

if __name__ == '__main__':
    app.run(debug=True)
```

### 5. WSGI sozlash
**Web** → **WSGI configuration file**:
```python
import sys
path = '/home/username/nTonGames'
if path not in sys.path:
    sys.path.append(path)

from app import app as application
```

### 6. Reload
**Web** → **Reload** tugmasi

---

## Variant 2: Replit + UptimeRobot

**Tezkor test uchun**

### 1. Replit
- [replit.com](https://replit.com) ga kiring
- **Node.js** template tanlang
- `nTonGames` kodlarini yuklang

### 2. UptimeRobot (24/7 ishlash uchun)
- [uptimerobot.com](https://uptimerobot.com)
- Replit URL ni monitoring qilish
- Har 5 daqiqada ping

---

## Variant 3: Glitch.com

**Oddiy va bepul**

- [glitch.com](https://glitch.com)
- **New Project** → **Import from GitHub**
- `nTonGames` repo
- Avtomatik deploy

---

## Variant 4: Koyeb.com

**Zamonaviy, bepul tier bor**

- [koyeb.com](https://koyeb.com)
- GitHub bilan ulanish
- **Create Service** → `nTonGames`
- **Instance Type:** Free
- Deploy

---

## Variant 5: Cyclic.sh

**Bepul, cheksiz**

- [cyclic.sh](https://cyclic.sh)
- GitHub bilan ulanish
- Repository tanlash
- Avtomatik deploy

---

## ENG YAXSHI VARIANT: Render.com (Tekror)

Agar yuqoridagilarni sinab ko'rishni xohlasangiz:

| Platform | Bepul? | Murakkablik |
|----------|--------|-------------|
| **Render.com** | ✅ Ha | Oddiy |
| PythonAnywhere | ✅ Ha | O'rta |
| Replit | ✅ Ha | Oddiy |
| Glitch | ✅ Ha | Oddiy |
| Koyeb | ✅ Ha | O'rta |
| Cyclic | ✅ Ha | Oddiy |

---

## TAVSIYA:

**Agar Render.com ishlamasa:**
1. **Cyclic.sh** - eng oddiy
2. **Glitch.com** - browser da edit
3. **PythonAnywhere** - agar Python bilgan bo'lsangiz

**Qaysi birini sinab ko'rmoqchisiz?**
