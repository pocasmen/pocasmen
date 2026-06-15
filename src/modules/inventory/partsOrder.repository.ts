import { QueryRunner } from '../../types';
import { Tables } from '../../types/supabase';

export type PartsOrder = Tables<'parts_orders'>;
export type PartsOrderItem = Tables<'parts_order_items'>;

export class PartsOrderRepository {
    async createOrder(db: QueryRunner, data: {
        document_number: string;
        user_id: string;
        notes?: string;
    }): Promise<PartsOrder> {
        const { rows } = await db.query(`
            INSERT INTO parts_orders (document_number, user_id, notes)
            VALUES ($1, $2, $3)
            RETURNING *
        `, [data.document_number, data.user_id, data.notes]);
        return rows[0];
    }

    async addOrderItem(db: QueryRunner, data: {
        order_id: number;
        part_id: number;
        designation?: string;
        quantity_ordered: number;
        stock_type: string;
        note?: string;
    }): Promise<PartsOrderItem> {
        const { rows } = await db.query(`
            INSERT INTO parts_order_items (order_id, part_id, designation, quantity_ordered, stock_type, note)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [data.order_id, data.part_id, data.designation, data.quantity_ordered, data.stock_type, data.note || null]);
        return rows[0];
    }

    async getOrders(db: QueryRunner, filters: { status?: string } = {}): Promise<any[]> {
        let query = `
            SELECT po.*, pr.first_name, pr.last_name,
                   (SELECT count(*) FROM parts_order_items WHERE order_id = po.id) as item_count
            FROM parts_orders po
            LEFT JOIN profiles pr ON po.user_id = pr.id
            WHERE 1=1
        `;
        const params: any[] = [];
        if (filters.status) {
            params.push(filters.status);
            query += ` AND po.status = $${params.length}`;
        }
        query += ` ORDER BY po.created_at DESC`;
        const { rows } = await db.query(query, params);
        return rows;
    }

    async getOrderById(db: QueryRunner, id: number): Promise<any> {
        const { rows } = await db.query(`
            SELECT po.*, pr.first_name, pr.last_name
            FROM parts_orders po
            LEFT JOIN profiles pr ON po.user_id = pr.id
            WHERE po.id = $1
        `, [id]);
        if (rows.length === 0) return null;
        
        const { rows: items } = await db.query(`
            SELECT poi.*, p.reference, p.designation as original_designation
            FROM parts_order_items poi
            JOIN parts p ON poi.part_id = p.id
            WHERE poi.order_id = $1
        `, [id]);
        
        return { ...rows[0], items };
    }

    async updateOrderItemReceived(db: QueryRunner, itemId: number, quantity: number): Promise<void> {
        await db.query(`
            UPDATE parts_order_items
            SET quantity_received = quantity_received + $1
            WHERE id = $2
        `, [quantity, itemId]);
    }

    async updateOrderStatus(db: QueryRunner, orderId: number, status: string): Promise<void> {
        await db.query(`
            UPDATE parts_orders
            SET status = $1, updated_at = NOW()
            WHERE id = $2
        `, [status, orderId]);
    }

    async deleteOrderItem(db: QueryRunner, orderId: number, itemId: number): Promise<void> {
        await db.query(`
            DELETE FROM parts_order_items
            WHERE id = $1 AND order_id = $2
        `, [itemId, orderId]);
    }

    async deleteOrder(db: QueryRunner, orderId: number): Promise<void> {
        await db.query(`
            DELETE FROM parts_orders
            WHERE id = $1
        `, [orderId]);
    }
}
