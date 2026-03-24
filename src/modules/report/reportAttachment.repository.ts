import { QueryRunner } from '../../types/db.types';

export class ReportAttachmentRepository {
    async findByReportId(reportId: number, db: QueryRunner) {
        const query = 'SELECT * FROM report_attachments WHERE report_id = $1 ORDER BY created_at DESC';
        const { rows } = await db.query(query, [reportId]);
        return rows;
    }

    async findById(id: string, db: QueryRunner) {
        const query = 'SELECT * FROM report_attachments WHERE id = $1';
        const { rows } = await db.query(query, [id]);
        return rows[0] || null;
    }
}
