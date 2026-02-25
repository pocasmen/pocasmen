
const { Client } = require('pg');
const client = new Client({
    connectionString: "postgresql://postgres.uygvqanyuigpvsoekxpw:ysV4LzOu3CnlJNGF@aws-1-eu-north-1.pooler.supabase.com:6543/postgres"
});

async function checkTickets() {
    try {
        await client.connect();
        const res = await client.query('SELECT id, status, "scheduleId" FROM tickets WHERE "scheduleId" IS NOT NULL');
        console.log('Tickets with scheduleId:');
        console.log(JSON.stringify(res.rows, null, 2));

        const res2 = await client.query('SELECT id, status, "scheduleId" FROM tickets WHERE status = \'open\' OR status = \'acknowledged\'');
        console.log('\nTickets with status open or acknowledged:');
        console.log(JSON.stringify(res2.rows, null, 2));

        await client.end();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkTickets();
