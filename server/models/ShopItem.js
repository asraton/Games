const mongoose = require('mongoose');

const shopItemSchema = new mongoose.Schema({
    itemId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    icon: {
        type: String,
        default: ''
    },
    effect: {
        type: String,
        required: true
    },
    effectValue: {
        type: Number,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

shopItemSchema.index({ itemId: 1 });
shopItemSchema.index({ isActive: 1 });

module.exports = mongoose.model('ShopItem', shopItemSchema);
