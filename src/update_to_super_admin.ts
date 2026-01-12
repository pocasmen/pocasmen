import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateUserToSuperAdmin(email: string) {
    console.log(`Updating ${email} to super_admin role...\n`);

    // First, get the user
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
        console.error('Error listing users:', listError);
        return;
    }

    const user = users.find(u => u.email === email);

    if (!user) {
        console.error(`User ${email} not found!`);
        return;
    }

    console.log(`Found user: ${user.email}`);
    console.log(`Current role: ${user.user_metadata?.role}`);
    console.log(`User ID: ${user.id}\n`);

    // Update the user's role to super_admin
    const { data, error } = await supabase.auth.admin.updateUserById(
        user.id,
        {
            user_metadata: {
                ...user.user_metadata,
                role: 'super_admin'
            }
        }
    );

    if (error) {
        console.error('Error updating user:', error);
        return;
    }

    console.log('✅ User updated successfully!');
    console.log(`New role: ${data.user.user_metadata?.role}`);

    // Also update in profiles table
    const { error: profileError } = await supabase
        .from('profiles')
        .update({ role: 'super_admin' })
        .eq('id', user.id);

    if (profileError) {
        console.error('Error updating profile:', profileError);
    } else {
        console.log('✅ Profile table updated successfully!');
    }
}

// Update pedro@microatomo.pt to super_admin
updateUserToSuperAdmin('pedro@microatomo.pt').then(() => {
    console.log('\nDone!');
    process.exit(0);
});
