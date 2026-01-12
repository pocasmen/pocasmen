import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUserRoles() {
    console.log('Checking user roles in auth.users...\n');

    const { data: { users }, error } = await supabase.auth.admin.listUsers();

    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    console.log('Admin and Super Admin users:');
    console.log('='.repeat(80));

    users
        .filter(u => {
            const role = u.user_metadata?.role;
            return role === 'admin' || role === 'super_admin';
        })
        .forEach(u => {
            console.log(`Email: ${u.email}`);
            console.log(`Role: ${u.user_metadata?.role}`);
            console.log(`First Name: ${u.user_metadata?.first_name || 'N/A'}`);
            console.log(`Last Name: ${u.user_metadata?.last_name || 'N/A'}`);
            console.log(`User ID: ${u.id}`);
            console.log('-'.repeat(80));
        });

    console.log('\nAll users with roles:');
    console.log('='.repeat(80));
    users.forEach(u => {
        console.log(`${u.email} -> ${u.user_metadata?.role || 'NO ROLE'}`);
    });
}

checkUserRoles().then(() => process.exit(0));
