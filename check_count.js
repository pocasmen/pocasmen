
const { Client } = require('pg');
const client = new Client({
    connectionString: "postgresql://postgres.uygvqanyuigpvsoekxpw:ysV4LzOu3CnlJNGF@aws-1-eu-north-1.pooler.supabase.com:6543/postgres"
});

async function checkTickets() {
    try {
        await client.connect();
        const res = await client.query('SELECT count(*) FROM tickets');
        console.log('Total tickets:', res.rows[0].count);

        const res2 = await client.query('SELECT status, count(*) FROM tickets GROUP BY status');
        console.log('Tickets by status:');
        console.log(JSON.stringify(res2.rows, null, 2));

        await client.end();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkTickets();
