
import { Pool } from 'pg';
import { pool as defaultPool } from '../../config/db';

export interface AuthAuditLog {
    email: string;
    status: 'success' | 'failure';
    ip?: string;
    userAgent?: string;
    reason?: string;
    userId?: string;
}

export class AuthAuditRepository {
    constructor(private pool: Pool = defaultPool) {}

    async create(log: AuthAuditLog): Promise<void> {
        const query = `
            INSERT INTO auth_audit_logs (email, status, ip, user_agent, reason, user_id)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        const values = [
            log.email,
            log.status,
            log.ip,
            log.userAgent,
            log.reason,
            log.userId
        ];

        await this.pool.query(query, values);
    }

    async findAll(limit: number = 100, offset: number = 0): Promise<any[]> {
        const query = `
            SELECT 
                l.*,
                p.first_name,
                p.last_name
            FROM auth_audit_logs l
            LEFT JOIN profiles p ON l.user_id = p.id
            ORDER BY l.timestamp DESC
            LIMIT $1 OFFSET $2
        `;
        const { rows } = await this.pool.query(query, [limit, offset]);
        return rows;
    }

    async count(): Promise<number> {
        const { rows } = await this.pool.query('SELECT COUNT(*) FROM auth_audit_logs');
        return parseInt(rows[0].count);
    }
}
