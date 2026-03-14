const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    connectedWallet: {
        type: String,
        default: ''
    },
    depositWallet: {
        address: { type: String, required: true },
        publicKey: { type: String, required: true },
        privateKey: { type: String, required: true },
        mnemonic: { type: String, required: true }
    },
    balance: {
        type: Number,
        default: 0
    },
    jettonBalance: {
        type: Number,
        default: 0
    },
    totalDeposited: {
        type: Number,
        default: 0
    },
    totalConverted: {
        type: Number,
        default: 0
    },
    purchasedItems: [{
        type: String
    }],
    globalStats: {
        totalClicksAllTime: { type: Number, default: 0 },
        totalCoinsCollected: { type: Number, default: 0 },
        totalTonEarned: { type: Number, default: 0 },
        gamesPlayed: { type: Number, default: 0 },
        firstPlayed: { type: String, default: () => new Date().toISOString() },
        lastPlayed: { type: String, default: null }
    },
    lastDepositAt: {
        type: Date,
        default: null
    },
    lastBalanceCheck: {
        type: Date,
        default: null
    }
}, {
    timestamps: true // createdAt, updatedAt
});

// Index for faster queries
userSchema.index({ userId: 1 });
userSchema.index({ connectedWallet: 1 });

module.exports = mongoose.model('User', userSchema);
