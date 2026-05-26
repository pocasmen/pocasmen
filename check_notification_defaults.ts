import { pool } from './src/config/db';

async function check() {
    try {
        const { rows } = await pool.query(`
            SELECT column_default 
            FROM information_schema.columns 
            WHERE table_name='profiles' AND column_name='notification_prefs'
        `);
        console.log('Current DEFAULT:', rows[0].column_default);

        const { rows: sample } = await pool.query(`
            SELECT notification_prefs 
            FROM profiles 
            LIMIT 1
        `);
        console.log('Sample record prefs:', JSON.stringify(sample[0].notification_prefs, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

check();
