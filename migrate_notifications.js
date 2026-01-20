
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
    console.log('Running migration to add last_notification_sent...');

    const sql = `
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_notification_sent TIMESTAMP;
      CREATE INDEX IF NOT EXISTS idx_profiles_notification_time ON profiles(notification_time) WHERE daily_notifications_enabled = true;
    `;

    // Tentativa 1: Via RPC 'exec_sql' (se existir)
    const { error: rpcError } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (!rpcError) {
        console.log('Migration successful via exec_sql!');
        return;
    }

    console.warn('RPC exec_sql failed or not found. Trying alternative method (direct SQL if enabled, otherwise manual step required).', rpcError.message);

    // Se falhar, nao temos acesso direto ao SQL via JS client sem a connection string do postgres.
    // Vamos apenas avisar.
    console.log('\n⚠️  ATENÇÃO: Não foi possível executar o SQL automaticamente via RPC.');
    console.log('Por favor execute o seguinte SQL no editor SQL do Supabase Dashboard:');
    console.log('\n' + sql + '\n');
}

runMigration();
