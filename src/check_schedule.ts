
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function checkSchedule() {
    const { data: schedule, error } = await supabase.from('schedules').select('*').eq('id', 85).single();
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Schedule 85:', schedule);
    }
}

checkSchedule();
