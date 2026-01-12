import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkDesync() {
    console.log('Checking for role desynchronization...\n');

    const { data: { users }, error } = await supabase.auth.admin.listUsers();

    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    console.log('Checking all users for desync between auth.users and profiles...\n');
    console.log('='.repeat(100));

    for (const user of users) {
        const authRole = user.user_metadata?.role;

        // Get profile role
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        const profileRole = profile?.role;

        if (authRole !== profileRole) {
            console.log('⚠️  DESYNC FOUND!');
            console.log(`Email: ${user.email}`);
            console.log(`auth.users role: ${authRole || 'NULL'}`);
            console.log(`profiles role: ${profileRole || 'NULL'}`);
            console.log(`User ID: ${user.id}`);
            console.log('-'.repeat(100));
        }
    }

    console.log('\n✅ Check complete!');
}

checkDesync().then(() => process.exit(0));
