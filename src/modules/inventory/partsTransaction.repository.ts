import { QueryRunner } from '../../types';
import { Tables } from '../../types/supabase';

export type PartTransaction = Tables<'parts_transactions'>;

export class PartsTransactionRepository {
    async create(db: QueryRunner, data: {
        part_id: number;
        user_id?: string;
        quantity: number;
        stock_type: 'general' | 'contract';
        type: 'AD_HOC' | 'PURCHASE_ORDER' | 'SERVICE_REPORT' | 'DIRECT_SALE' | 'MANUAL_ADJUST';
        reference_id?: string;
        notes?: string;
    }): Promise<PartTransaction> {
        const { rows } = await db.query(`
            INSERT INTO parts_transactions (part_id, user_id, quantity, stock_type, type, reference_id, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            data.part_id,
            data.user_id,
            data.quantity,
            data.stock_type,
            data.type,
            data.reference_id,
            data.notes
        ]);
        return rows[0];
    }

    async getHistoryByPartId(db: QueryRunner, partId: number): Promise<any[]> {
        const { rows } = await db.query(`
            SELECT pt.*, p.first_name, p.last_name,
                   SUM(pt.quantity) OVER (PARTITION BY pt.part_id, pt.stock_type ORDER BY pt.created_at, pt.id) as running_stock
            FROM parts_transactions pt
            LEFT JOIN profiles p ON pt.user_id = p.id
            WHERE pt.part_id = $1
            ORDER BY pt.created_at DESC, pt.id DESC
        `, [partId]);
        return rows;
    }

    async getTransactions(db: QueryRunner, limit: number = 100, page: number = 1): Promise<{ data: any[], pagination: any }> {
        const offset = (page - 1) * limit;
        
        const countRes = await db.query('SELECT COUNT(*) FROM parts_transactions');
        const total = parseInt(countRes.rows[0].count, 10);

        const { rows } = await db.query(`
            SELECT pt.*, p.first_name, p.last_name, part.designation, part.reference,
                   SUM(pt.quantity) OVER (PARTITION BY pt.part_id, pt.stock_type ORDER BY pt.created_at, pt.id) as running_stock
            FROM parts_transactions pt
            LEFT JOIN profiles p ON pt.user_id = p.id
            JOIN parts part ON pt.part_id = part.id
            ORDER BY pt.created_at DESC, pt.id DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);
        
        return { 
            data: rows, 
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    }
}
