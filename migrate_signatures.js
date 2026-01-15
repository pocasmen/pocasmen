
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
    console.log('Running migration...');

    // Adicionar coluna signature à tabela profiles
    const { error: profileError } = await supabase.rpc('exec_sql', {
        sql_query: 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signature TEXT;'
    });

    if (profileError) {
        console.error('Error adding signature to profiles:', profileError);
        // Se rpc não existir, tentamos de outra forma ou apenas avisamos.
        // Nem todos os projetos Supabase têm uma função 'exec_sql' definida.
    } else {
        console.log('Signature column added to profiles (if it didn\'t exist).');
    }

    // Adicionar coluna technician_signature à tabela reports
    const { error: reportError } = await supabase.rpc('exec_sql', {
        sql_query: 'ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS technician_signature TEXT;'
    });

    if (reportError) {
        console.error('Error adding technician_signature to reports:', reportError);
    } else {
        console.log('technician_signature column added to reports (if it didn\'t exist).');
    }
}

// Nota: A função 'exec_sql' geralmente precisa ser criada manualmente no Supabase.
// Se falhar, pedirei ao usuário para rodar o SQL manualmente.

runMigration();
