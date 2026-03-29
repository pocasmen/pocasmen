import { pool } from './src/config/db';
import fs from 'fs';
import path from 'path';

async function runMigration() {
    const migrationPath = path.join(__dirname, 'migrations', '20260324_create_parts_transactions.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    try {
        console.log('Applying migration...');
        await pool.query(sql);
        console.log('Migration applied successfully!');
    } catch (err) {
        console.error('Error applying migration:', err);
    } finally {
        await pool.end();
    }
}

runMigration();
