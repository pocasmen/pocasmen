import { QueryRunner } from '../../types';

export class PartsSaleRepository {
    async createSale(db: QueryRunner, data: {
        document_number: string;
        user_id: string;
        sale_type: string;
        stock_type: string;
        notes?: string;
    }): Promise<any> {
        const { rows } = await db.query(`
            INSERT INTO parts_sales (document_number, user_id, sale_type, stock_type, notes)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [data.document_number, data.user_id, data.sale_type, data.stock_type, data.notes]);
        return rows[0];
    }

    async addSaleItem(db: QueryRunner, data: {
        sale_id: number;
        part_id: number;
        designation?: string;
        quantity: number;
    }): Promise<any> {
        const { rows } = await db.query(`
            INSERT INTO parts_sale_items (sale_id, part_id, designation, quantity)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [data.sale_id, data.part_id, data.designation, data.quantity]);
        return rows[0];
    }

    async getSales(db: QueryRunner, filters: { sale_type?: string } = {}): Promise<any[]> {
        let query = `
            SELECT ps.*, pr.first_name, pr.last_name,
                   (SELECT count(*) FROM parts_sale_items WHERE sale_id = ps.id) as item_count,
                   (SELECT array_agg(p.reference) 
                    FROM parts_sale_items psi 
                    JOIN parts p ON psi.part_id = p.id 
                    WHERE psi.sale_id = ps.id) as item_references
            FROM parts_sales ps
            LEFT JOIN profiles pr ON ps.user_id = pr.id
            WHERE 1=1
        `;
        const params: any[] = [];
        if (filters.sale_type) {
            params.push(filters.sale_type);
            query += ` AND ps.sale_type = $${params.length}`;
        }
        query += ` ORDER BY ps.created_at DESC`;
        const { rows } = await db.query(query, params);
        return rows;
    }

    async getSaleById(db: QueryRunner, id: number): Promise<any> {
        const { rows } = await db.query(`
            SELECT ps.*, pr.first_name, pr.last_name
            FROM parts_sales ps
            LEFT JOIN profiles pr ON ps.user_id = pr.id
            WHERE ps.id = $1
        `, [id]);
        if (rows.length === 0) return null;
        
        const { rows: items } = await db.query(`
            SELECT psi.*, p.reference, p.designation as original_designation
            FROM parts_sale_items psi
            JOIN parts p ON psi.part_id = p.id
            WHERE psi.sale_id = $1
        `, [id]);
        
        return { ...rows[0], items };
    }

    async deleteSale(db: QueryRunner, id: number): Promise<void> {
        await db.query(`DELETE FROM parts_sales WHERE id = $1`, [id]);
    }
}
