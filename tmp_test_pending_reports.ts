import { pool } from './src/config/db';
import { ScheduleRepository } from './src/repositories/schedule.repository';

async function test() {
    const repo = new ScheduleRepository(pool);
    try {
        const rows = await repo.findPendingReports('2026-02-01T00:00:00.000Z', '2026-02-28T23:59:59.999Z');
        console.log(rows.length);
    } catch (e) {
        console.error("ERROR IN findPendingReports:", e);
    } finally {
        await pool.end();
    }
}
test();
