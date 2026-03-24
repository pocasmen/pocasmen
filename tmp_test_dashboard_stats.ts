import { pool } from './src/config/db';
import { ScheduleRepository } from './src/repositories/schedule.repository';

async function test() {
    const repo = new ScheduleRepository(pool);
    try {
        const stats = await repo.getStats({ startDate: '2026-02-01T00:00:00.000Z', endDate: '2026-02-28T23:59:59.999Z' });
        console.log(stats);
    } catch (e) {
        console.error("ERROR IN getStats:", e);
    } finally {
        await pool.end();
    }
}
test();
