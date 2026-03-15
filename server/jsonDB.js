const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Railway Volume uchun ma'lumotlar papkasi
// Lokalda ishlayotganda ./data, Railway da /app/data
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/app/data';
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SHOP_ITEMS_FILE = path.join(DATA_DIR, 'shopItems.json');
const PURCHASES_FILE = path.join(DATA_DIR, 'purchases.json');

// Encryption key from environment variable (must be 32 bytes for AES-256)
const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || '';
const IV_LENGTH = 16; // AES block size

console.log(`📁 JSON DB: Data directory = ${DATA_DIR}`);
console.log(`🔐 Encryption: ${ENCRYPTION_KEY ? '✅ Enabled' : '❌ DISABLED - Set WALLET_ENCRYPTION_KEY'}`);

// Ma'lumotlar papkasini yaratish
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`✅ Created data directory: ${DATA_DIR}`);
}

// Initialize files if they don't exist
function initFile(filePath, defaultData = {}) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf8');
    }
}

initFile(USERS_FILE, {});
initFile(SHOP_ITEMS_FILE, {});
initFile(PURCHASES_FILE, []);

// Encrypt sensitive data (mnemonics, private keys)
function encrypt(text) {
    if (!ENCRYPTION_KEY || !text) return text;
    
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
        console.error('❌ Encryption error:', error.message);
        return text;
    }
}

// Decrypt sensitive data
function decrypt(text) {
    if (!ENCRYPTION_KEY || !text || !text.includes(':')) return text;
    
    try {
        const parts = text.split(':');
        if (parts.length !== 2) return text;
        
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        console.error('❌ Decryption error:', error.message);
        return text;
    }
}

// Encrypt user sensitive data before saving
function encryptUserData(userData) {
    if (!ENCRYPTION_KEY || !userData) return userData;
    
    const encrypted = { ...userData };
    
    if (encrypted.depositWallet) {
        encrypted.depositWallet = {
            ...encrypted.depositWallet,
            mnemonic: encrypt(encrypted.depositWallet.mnemonic),
            privateKey: encrypt(encrypted.depositWallet.privateKey)
        };
    }
    
    return encrypted;
}

// Decrypt user sensitive data after reading
function decryptUserData(userData) {
    if (!ENCRYPTION_KEY || !userData) return userData;
    
    const decrypted = { ...userData };
    
    if (decrypted.depositWallet) {
        decrypted.depositWallet = {
            ...decrypted.depositWallet,
            mnemonic: decrypt(decrypted.depositWallet.mnemonic),
            privateKey: decrypt(decrypted.depositWallet.privateKey)
        };
    }
    
    return decrypted;
}

// Read data from file
function readData(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error);
        return null;
    }
}

// Write data to file
function writeData(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`✅ JSON DB: Data written to ${path.basename(filePath)}`);
        return true;
    } catch (error) {
        console.error(`❌ Error writing ${filePath}:`, error);
        return false;
    }
}

// User operations
const userDB = {
    get(userId) {
        const users = readData(USERS_FILE) || {};
        const user = users[userId] || null;
        return user ? decryptUserData(user) : null;
    },

    getAll() {
        const users = readData(USERS_FILE) || {};
        if (!ENCRYPTION_KEY) return users;
        
        const decrypted = {};
        for (const [id, user] of Object.entries(users)) {
            decrypted[id] = decryptUserData(user);
        }
        return decrypted;
    },

    set(userId, userData) {
        const users = readData(USERS_FILE) || {};
        users[userId] = encryptUserData(userData);
        return writeData(USERS_FILE, users);
    },

    delete(userId) {
        const users = readData(USERS_FILE) || {};
        delete users[userId];
        return writeData(USERS_FILE, users);
    }
};

// Shop items operations
const shopDB = {
    get(itemId) {
        const items = readData(SHOP_ITEMS_FILE) || {};
        return items[itemId] || null;
    },

    getAll() {
        return readData(SHOP_ITEMS_FILE) || {};
    },

    set(itemId, itemData) {
        const items = readData(SHOP_ITEMS_FILE) || {};
        items[itemId] = itemData;
        return writeData(SHOP_ITEMS_FILE, items);
    },

    delete(itemId) {
        const items = readData(SHOP_ITEMS_FILE) || {};
        delete items[itemId];
        return writeData(SHOP_ITEMS_FILE, items);
    }
};

// Purchases operations
const purchaseDB = {
    getAll() {
        return readData(PURCHASES_FILE) || [];
    },

    add(purchase) {
        const purchases = readData(PURCHASES_FILE) || [];
        purchases.push(purchase);
        return writeData(PURCHASES_FILE, purchases);
    },

    getByUser(userId) {
        const purchases = readData(PURCHASES_FILE) || [];
        return purchases.filter(p => p.userId === userId);
    }
};

module.exports = {
    userDB,
    shopDB,
    purchaseDB,
    DATA_DIR,
    encrypt,
    decrypt
};
