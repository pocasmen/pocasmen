
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function checkReports() {
    const { data: reports, error } = await supabase.from('reports').select('id, report_number').order('id', { ascending: false }).limit(5);
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Last reports:', reports);
    }
}

checkReports();
