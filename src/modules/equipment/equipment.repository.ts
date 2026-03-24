import { pool } from '../../config/db';
import { QueryRunner } from '../../types/db.types';
import { Equipment } from '../../types/supabase';
import { CreateEquipmentDto, UpdateEquipmentDto } from './equipment.dto';

export class EquipmentRepository {
    private readonly SELECT_WITH_CLIENT = `
        SELECT e.id, e.brand, e.model, e."serialNumber", e."additionalInfo", e."clientId", c.name as "clientName"
        FROM equipments e
        LEFT JOIN clients c ON e."clientId" = c.id
    `;

    async findAll(db: QueryRunner, filters: { search?: string } = {}): Promise<any[]> {
        const { search } = filters;
        let query = this.SELECT_WITH_CLIENT;
        const params: any[] = [];

        if (search) {
            query += ` WHERE e.brand ILIKE $1 OR e.model ILIKE $1 OR e."serialNumber" ILIKE $1 OR c.name ILIKE $1`;
            params.push(`%${search}%`);
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
        const { brand, model, serialNumber, clientId, additionalInfo } = data;
        const { rows } = await db.query(
            'INSERT INTO equipments (brand, model, "serialNumber", "clientId", "additionalInfo") VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [brand, model, serialNumber, clientId, additionalInfo]
        );
        return rows[0];
    }

    async update(id: number, data: UpdateEquipmentDto, db: QueryRunner): Promise<Equipment | null> {
        const { brand, model, serialNumber, clientId, additionalInfo } = data;
        const { rows } = await db.query(
            'UPDATE equipments SET brand=$1, model=$2, "serialNumber"=$3, "clientId"=$4, "additionalInfo"=$5 WHERE id=$6 RETURNING *',
            [brand, model, serialNumber, clientId, additionalInfo, id]
        );
        return rows[0] ?? null;
    }

    async delete(id: number, db: QueryRunner): Promise<boolean> {
        const { rowCount } = await db.query('DELETE FROM equipments WHERE id = $1', [id]);
        return (rowCount ?? 0) > 0;
    }

    async getHistory(id: number, db: QueryRunner) {
        const [ticketsRes, schedulesRes, reportsRes] = await Promise.all([
            db.query('SELECT * FROM tickets WHERE "equipmentId" = $1 ORDER BY "createdAt" DESC', [id]),
            db.query(`
                SELECT s.id, s.title, s."startDate", s."isCompleted",
                    json_agg(CONCAT(p.first_name, ' ', p.last_name)) as technicians
                FROM schedules s
                LEFT JOIN schedule_technicians st ON s.id = st."scheduleId"
                LEFT JOIN profiles p ON st."technicianId" = p.id
                WHERE s."equipmentId" = $1
                GROUP BY s.id
                ORDER BY s."startDate" DESC
            `, [id]),
            db.query('SELECT * FROM reports WHERE "equipmentId" = $1 AND deleted_at IS NULL ORDER BY "serviceDate" DESC', [id]),
        ]);

        return {
            tickets: ticketsRes.rows,
            schedules: schedulesRes.rows,
            reports: reportsRes.rows,
        };
    }

    /** Leitura simples — usa pool diretamente (sem transação). */
    async countByClientId(clientId: number): Promise<number> {
        const { rows } = await pool.query('SELECT COUNT(*) FROM equipments WHERE "clientId" = $1', [clientId]);
        return parseInt(rows[0].count, 10);
    }
}
