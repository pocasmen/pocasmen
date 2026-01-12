import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixDesync() {
    console.log('Fixing role desynchronization...\n');

    const { data: { users }, error } = await supabase.auth.admin.listUsers();

    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    let fixedCount = 0;

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
            console.log(`⚠️  Fixing desync for ${user.email}`);
            console.log(`   auth.users role: ${authRole || 'NULL'}`);
            console.log(`   profiles role: ${profileRole || 'NULL'}`);
            console.log(`   → Updating profiles.role to: ${authRole}`);

            // Update profiles to match auth.users (source of truth)
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ role: authRole })
                .eq('id', user.id);

            if (updateError) {
                console.error(`   ❌ Error updating: ${updateError.message}`);
            } else {
                console.log(`   ✅ Fixed!`);
                fixedCount++;
            }
            console.log('');
        }
    }

    console.log(`\n✅ Fixed ${fixedCount} desynchronized user(s)!`);
}

fixDesync().then(() => process.exit(0));
