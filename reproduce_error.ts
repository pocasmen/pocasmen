
import { ClientRepository } from './src/modules/client/client.repository';
import { pool } from './src/config/db';

async function testCreate() {
    const repo = new ClientRepository();
    const data = {
        name: 'Test Client ' + Date.now(),
        address: 'Test Address',
        city: 'Test City',
        postCode: '1234-567',
        nif: '999999999',
        email: 'test@example.com',
        phone: '123456789',
        hasContract: false
    } as any;

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
