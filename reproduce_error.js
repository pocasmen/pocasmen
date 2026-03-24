
const { ClientRepository } = require('./src/modules/client/client.repository');
const { pool } = require('./src/config/db');

async function testCreate() {
    const repo = new ClientRepository();
    const data = {
        name: 'Test Client',
        address: 'Test Address',
        city: 'Test City',
        postCode: '1234-567',
        nif: '123456789',
        email: 'test@example.com',
        phone: '123456789',
        hasContract: false
    };

    try {
        console.log('Tentando criar cliente...');
        const client = await repo.create(data, pool);
        console.log('Cliente criado:', client);
    } catch (err) {
        console.error('ERRO AO CRIAR CLIENTE:', err);
    } finally {
        await pool.end();
    }
}

testCreate();
