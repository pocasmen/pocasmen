import { pool } from '../../config/db';
import { QueryRunner } from '../../types';

export class BillingRepository {
    async getStats(db: QueryRunner, options: { startDate?: string; endDate?: string }) {
        const { startDate, endDate } = options;
        const whereClauses = ['r.deleted_at IS NULL'];
        const params: any[] = [];

        if (startDate) { params.push(startDate); whereClauses.push(`r."serviceDate" >= $${params.length}`); }
        if (endDate)   { params.push(endDate);   whereClauses.push(`r."serviceDate" <= $${params.length}`); }

        const whereSql = `WHERE ${whereClauses.join(' AND ')}`;
        const { rows } = await db.query(`
            SELECT bt.status, COUNT(*) as count
            FROM billing_tasks bt JOIN reports r ON bt.report_id = r.id
            ${whereSql} GROUP BY bt.status
        `, params);

        const stats = { total: 0, report_issued: 0, pending_completion: 0, ready_for_billing: 0, billed: 0, needs_review: 0 };
        rows.forEach((row: any) => {
            const count = parseInt(row.count, 10);
            stats.total += count;
            if (row.status === 'report_issued') stats.report_issued = count;
            else if (row.status === 'pending_completion') stats.pending_completion = count;
            else if (row.status === 'ready_for_billing') stats.ready_for_billing = count;
            else if (row.status === 'billed') stats.billed = count;
            else if (row.status === 'needs_review') stats.needs_review = count;
        });
        return stats;
    }
}
