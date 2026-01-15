
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function checkProfiles() {
    const { data: profiles, error } = await supabase.from('profiles').select('id, role').limit(1);
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Profile 1:', profiles[0]);
    }
}

checkProfiles();
