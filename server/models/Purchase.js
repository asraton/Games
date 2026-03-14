const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    itemId: {
        type: String,
        required: true,
        index: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    purchasedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

purchaseSchema.index({ userId: 1, itemId: 1 });
purchaseSchema.index({ purchasedAt: -1 });

module.exports = mongoose.model('Purchase', purchaseSchema);
