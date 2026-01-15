
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function checkSchema() {
    const { data, error } = await supabase.from('report_technicians').select('*').limit(1);
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Columns in report_technicians table:', Object.keys(data[0] || {}));
    }
}

checkSchema();
