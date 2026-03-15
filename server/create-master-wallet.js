const { mnemonicNew, mnemonicToWalletKey } = require('@ton/crypto');
const { WalletContractV4 } = require('@ton/ton');

async function createMasterWallet() {
    console.log('🔐 Master Wallet yaratilmoqda...\n');
    
    // 24 ta so'zli mnemonic yaratish
    const mnemonic = await mnemonicNew(24);
    const keyPair = await mnemonicToWalletKey(mnemonic);
    
    const wallet = WalletContractV4.create({
        workchain: 0,
        publicKey: keyPair.publicKey
    });
    
    const address = wallet.address.toString({ bounceable: false });
    
    console.log('✅ Master Wallet yaratildi!\n');
    console.log('═══════════════════════════════════════════════════');
    console.log('📋 RAILWAY GA QO\'SHISH UCHUN:');
    console.log('═══════════════════════════════════════════════════');
    console.log('\n🔑 MASTER_WALLET_MNEMONIC:');
    console.log(mnemonic.join(' '));
    console.log('\n📍 MASTER_WALLET_ADDRESS:');
    console.log(address);
    console.log('\n📍 PAYMENT_ADDRESS:');
    console.log(address);
    console.log('═══════════════════════════════════════════════════\n');
    
    console.log('⚠️  Muhim eslatmalar:');
    console.log('   1. Mnemonic 24 so\'zni xavfsiz saqlang!');
    console.log('   2. Hech kimga bermang!');
    console.log('   3. Bu hamyon serverdan TON yuboradi');
    console.log('   4. Bu hamyonga TON yuklash kerak (komissiya uchun)');
}

createMasterWallet().catch(console.error);
