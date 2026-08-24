import { pool } from '../../config/db';
import { QueryRunner } from '../../types';
import { Equipment } from '../../types/supabase';
import { CreateEquipmentDto, UpdateEquipmentDto } from './equipment.dto';

export class EquipmentRepository {
    private readonly SELECT_WITH_CLIENT = `
        SELECT e.id, e.brand, e.model, e."serialNumber", e.nickname, e."additionalInfo", e."clientId", e.status, e.category, c.name as "clientName"
        FROM equipments e
        LEFT JOIN clients c ON e."clientId" = c.id
    `;

    async findAll(db: QueryRunner, filters: { search?: string, category?: string } = {}): Promise<any[]> {
        const { search, category } = filters;
        let query = this.SELECT_WITH_CLIENT;
        const params: any[] = [];
        const whereClauses: string[] = [];

        if (search) {
            params.push(`%${search}%`);
            whereClauses.push(`(e.brand ILIKE $${params.length} OR e.model ILIKE $${params.length} OR e."serialNumber" ILIKE $${params.length} OR e.nickname ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
        }

        if (category) {
            params.push(category);
            whereClauses.push(`e.category = $${params.length}`);
        }

        if (whereClauses.length > 0) {
            query += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        query += ' ORDER BY e.id ASC';

        const { rows } = await db.query(query, params);
        return rows;
    }

    async findByClientId(clientId: number, db: QueryRunner): Promise<any[]> {
        const query = `${this.SELECT_WITH_CLIENT} WHERE e."clientId" = $1 ORDER BY e.id ASC`;
        const { rows } = await db.query(query, [clientId]);
        return rows;
    }

    async findById(id: number, db: QueryRunner): Promise<any | null> {
        const query = `${this.SELECT_WITH_CLIENT} WHERE e.id = $1`;
        const { rows } = await db.query(query, [id]);
        return rows[0] ?? null;
    }

    async findBySerialNumber(serialNumber: string, idToExclude: number | undefined, db: QueryRunner): Promise<Equipment | null> {
        let query = 'SELECT * FROM equipments WHERE "serialNumber" = $1';
        const params: any[] = [serialNumber];

        if (idToExclude) {
            query += ' AND id != $2';
            params.push(idToExclude);
        }

        const { rows } = await db.query(query, params);
        return rows[0] ?? null;
    }

    async create(data: CreateEquipmentDto, db: QueryRunner): Promise<Equipment> {
        const { brand, model, serialNumber, clientId, nickname, additionalInfo, status, category } = data;
        const { rows } = await db.query(
            'INSERT INTO equipments (brand, model, "serialNumber", nickname, "clientId", "additionalInfo", status, category) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [brand, model, serialNumber, nickname, clientId, additionalInfo, status || 'active', category]
        );
        return rows[0];
    }

    async update(id: number, data: UpdateEquipmentDto, db: QueryRunner): Promise<Equipment | null> {
        const fields: string[] = [];
        const params: any[] = [];
        let index = 1;

        // Map DTO keys to DB column names
        const fieldMap: Record<string, string> = {
            brand: 'brand',
            model: 'model',
            serialNumber: '"serialNumber"',
            nickname: 'nickname',
            clientId: '"clientId"',
            additionalInfo: '"additionalInfo"',
            status: 'status',
            category: 'category'
        };

        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined && fieldMap[key]) {
                fields.push(`${fieldMap[key]} = $${index}`);
                params.push(value);
                index++;
            }
        }

        if (fields.length === 0) return this.findById(id, db);

        const query = `UPDATE equipments SET ${fields.join(', ')} WHERE id = $${index} RETURNING *`;
        params.push(id);

        const { rows } = await db.query(query, params);
        return rows[0] ?? null;
    }

    async delete(id: number, db: QueryRunner): Promise<boolean> {
        const { rowCount } = await db.query('DELETE FROM equipments WHERE id = $1', [id]);
        return (rowCount ?? 0) > 0;
    }

    async getHistory(id: number, db: QueryRunner, requestingClientId?: number) {
        // Se houver requestingClientId (portal de cliente), filtra pelos períodos de posse do equipamento
        
        const ticketsQuery = `
            SELECT * FROM tickets 
            WHERE "equipmentId" = $1
            ${requestingClientId ? `AND EXISTS (SELECT 1 FROM equipment_ownership eo WHERE eo.equipment_id = $1 AND eo.client_id = $2 AND tickets."createdAt" >= eo.start_date AND (eo.end_date IS NULL OR tickets."createdAt" <= eo.end_date))` : ''}
            ORDER BY "createdAt" DESC
        `;

        const schedulesQuery = `
            SELECT s.id, s.title, s."startDate", s."isCompleted",
                COALESCE(
                    (SELECT json_agg(CONCAT(p.first_name, ' ', p.last_name))
                     FROM schedule_technicians st
                     JOIN profiles p ON st."technicianId" = p.id
                     WHERE st."scheduleId" = s.id),
                    '[]'::json
                ) as technicians
            FROM schedules s
            WHERE s."equipmentId" = $1
            ${requestingClientId ? `AND EXISTS (SELECT 1 FROM equipment_ownership eo WHERE eo.equipment_id = $1 AND eo.client_id = $2 AND s."startDate" >= eo.start_date AND (eo.end_date IS NULL OR s."startDate" <= eo.end_date))` : ''}
            ORDER BY s."startDate" DESC
        `;

        const reportsQuery = `
            SELECT * FROM reports 
            WHERE "equipmentId" = $1 AND deleted_at IS NULL
            ${requestingClientId ? `AND EXISTS (SELECT 1 FROM equipment_ownership eo WHERE eo.equipment_id = $1 AND eo.client_id = $2 AND reports."serviceDate" >= eo.start_date AND (eo.end_date IS NULL OR reports."serviceDate" <= eo.end_date))` : ''}
            ORDER BY "serviceDate" DESC
        `;

        const commonParams = requestingClientId ? [id, requestingClientId] : [id];

        const [ticketsRes, schedulesRes, reportsRes] = await Promise.all([
            db.query(ticketsQuery, commonParams),
            db.query(schedulesQuery, commonParams),
            db.query(reportsQuery, commonParams),
        ]);

        return {
            tickets: ticketsRes.rows,
            schedules: schedulesRes.rows,
            reports: reportsRes.rows,
        };
    }

    async getOwnershipHistory(id: number, db: QueryRunner) {
        const query = `
            SELECT eo.*, c.name as "clientName"
            FROM equipment_ownership eo
            JOIN clients c ON eo.client_id = c.id
            WHERE eo.equipment_id = $1
            ORDER BY eo.start_date DESC
        `;
        const { rows } = await db.query(query, [id]);
        return rows;
    }

    async transferOwnership(id: number, newClientId: number, transferDate: string, db: QueryRunner) {
        // 0. Se não existia registo de posse na tabela para este equipamento, criar o registo anterior
        const { rows: currentOwnership } = await db.query(
            'SELECT id FROM equipment_ownership WHERE equipment_id = $1',
            [id]
        );

        if (currentOwnership.length === 0) {
            const { rows: eqRows } = await db.query('SELECT "clientId" FROM equipments WHERE id = $1', [id]);
            if (eqRows.length > 0 && eqRows[0].clientId && eqRows[0].clientId !== newClientId) {
                await db.query(
                    'INSERT INTO equipment_ownership (equipment_id, client_id, start_date, end_date) VALUES ($1, $2, $3, $3)',
                    [id, eqRows[0].clientId, transferDate]
                );
            }
        } else {
            // 1. Fechar o período atual
            await db.query(
                'UPDATE equipment_ownership SET end_date = $1 WHERE equipment_id = $2 AND end_date IS NULL',
                [transferDate, id]
            );
        }

        // 2. Abrir o novo período
        await db.query(
            'INSERT INTO equipment_ownership (equipment_id, client_id, start_date) VALUES ($1, $2, $3)',
            [id, newClientId, transferDate]
        );

        // 3. Atualizar o clientId no equipamento (atalho para compatibilidade)
        await db.query(
            'UPDATE equipments SET "clientId" = $1 WHERE id = $2',
            [newClientId, id]
        );
    }

    async updateOwnershipPeriod(periodId: number, data: { start_date?: string, end_date?: string }, db: QueryRunner) {
        const { start_date, end_date } = data;
        await db.query(
            'UPDATE equipment_ownership SET start_date = COALESCE($1, start_date), end_date = $2 WHERE id = $3',
            [start_date, end_date, periodId]
        );
    }

    /** Leitura simples — usa pool diretamente (sem transação). */
    async countByClientId(clientId: number): Promise<number> {
        const { rows } = await pool.query('SELECT COUNT(*) FROM equipments WHERE "clientId" = $1', [clientId]);
        return parseInt(rows[0].count, 10);
    }

    async getDistinctCategories(): Promise<string[]> {
        const { rows } = await pool.query('SELECT DISTINCT category FROM equipments WHERE category IS NOT NULL ORDER BY category ASC');
        return rows.map(r => r.category);
    }
}
