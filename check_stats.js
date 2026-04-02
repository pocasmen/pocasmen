const { Pool } = require('pg');
require('dotenv').config({ path: '.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    console.log('--- CRUZA DE AGENDAMENTOS E RELATORIOS (ESTA SEMANA) ---');
    const res = await pool.query(`
      SELECT s.id as schedule_id, s."startDate", s."hasReport",
             (SELECT r.id FROM reports r WHERE r."scheduleId" = s.id AND r.deleted_at IS NULL) as active_report_id,
             (SELECT r.report_number FROM reports r WHERE r."scheduleId" = s.id AND r.deleted_at IS NULL) as report_num,
             c.name as client_name
      FROM schedules s
      LEFT JOIN clients c ON s."clientId" = c.id
      WHERE s."startDate" >= '2026-03-30' AND s."startDate" <= '2026-04-05'
      ORDER BY s."startDate" ASC
    `);
    
    console.table(res.rows);

  } catch (err) {
    console.error('Erro:', err);
  } finally {
    await pool.end();
  }
}

check();
