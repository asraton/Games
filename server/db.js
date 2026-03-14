const mongoose = require('mongoose');

// MongoDB Atlas connection
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tongame';
        
        await mongoose.connect(mongoURI, {
            // These options are no longer needed in Mongoose 6+, but kept for compatibility
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        
        console.log('✅ MongoDB Atlas ulanishi muvaffaqiyatli!');
        console.log('   Database:', mongoose.connection.name);
        console.log('   Host:', mongoose.connection.host);
        
    } catch (error) {
        console.error('❌ MongoDB ulanish xatosi:', error.message);
        console.log('   In-memory mode ishlatilmoqda...');
        // Don't exit - fall back to in-memory mode
    }
};

module.exports = connectDB;
