const fs = require('fs');
const path = require('path');

// Use environment variable for data path (Railway volume) or fallback to local
const DATA_DIR = process.env.DATA_PATH || path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SHOP_ITEMS_FILE = path.join(DATA_DIR, 'shopItems.json');
const PURCHASES_FILE = path.join(DATA_DIR, 'purchases.json');

console.log(`📁 JSON DB: Data directory = ${DATA_DIR}`);

// Ensure data directory exists
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
        return users[userId] || null;
    },

    getAll() {
        return readData(USERS_FILE) || {};
    },

    set(userId, userData) {
        const users = readData(USERS_FILE) || {};
        users[userId] = userData;
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
    DATA_DIR
};
