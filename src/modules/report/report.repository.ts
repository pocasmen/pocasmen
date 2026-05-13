import { pool } from '../../config/db';
import { QueryRunner } from '../../types';
import { StockType } from '../../types';

export class ReportRepository {
    async findAll(db: QueryRunner, filters: {
        search?: string; startDate?: string; endDate?: string;
        serviceTypes?: string[]; page?: number; limit?: number;
    }) {
        const { search, startDate, endDate, serviceTypes, page = 1, limit = 100 } = filters;
        const offset = (page - 1) * limit;

        const whereClauses = ['r.deleted_at IS NULL'];
        const params: any[] = [];

        if (startDate) { params.push(startDate); whereClauses.push(`r."serviceDate" >= $${params.length}`); }
        if (endDate)   { params.push(endDate);   whereClauses.push(`r."serviceDate" <= $${params.length}`); }
        if (serviceTypes?.length) {
            params.push(serviceTypes);
            whereClauses.push(`r."serviceType"::jsonb ?| $${params.length}::text[]`);
        }
        if (search) {
            params.push(`%${search}%`);
            whereClauses.push(`(c.name ILIKE $${params.length} OR e.brand ILIKE $${params.length} OR e.model ILIKE $${params.length} OR e."serialNumber" ILIKE $${params.length} OR r.report_number::text ILIKE $${params.length})`);
        }

        const joinSql = `FROM reports r LEFT JOIN clients c ON r."clientId" = c.id LEFT JOIN equipments e ON r."equipmentId" = e.id`;
        const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

        const countRes = await db.query(`SELECT COUNT(*) ${joinSql} ${whereSql}`, params);
        const total = parseInt(countRes.rows[0].count, 10);

        const { rows } = await db.query(`
            SELECT r.*, r.internal_notes as "internalNotes", r.time_blocks as "timeBlocks", c.name as "clientName", e.brand as "equipmentBrand", e.model as "equipmentModel", e.nickname as "equipmentNickname",
                CONCAT(p_creator.first_name, ' ', p_creator.last_name) as "creator_name",
                CONCAT(p_updater.first_name, ' ', p_updater.last_name) as "updater_name",
                COALESCE(bt.status, r.billing_status) as billing_status,
                COALESCE((SELECT json_agg(json_build_object('id',p.id,'name',CONCAT(p.first_name,' ',p.last_name),'color',p.color,'signature',rt.signature))
                    FROM report_technicians rt JOIN profiles p ON rt."technicianId"=p.id WHERE rt."reportId"=r.id),'[]') as technicians,
                COALESCE((SELECT json_agg(json_build_object('id',pr.id,'reference',pr.reference,'designation',COALESCE(NULLIF(rp.designation, ''), pr.designation),'quantity',rp.quantity,'stockType',COALESCE(rp.stock_type,'general'),'image_path',pr.image_path,'track_stock',pr.track_stock))
                    FROM report_parts rp JOIN parts pr ON rp."partId"=pr.id WHERE rp."reportId"=r.id),'[]') as parts
            FROM reports r 
            LEFT JOIN clients c ON r."clientId" = c.id 
            LEFT JOIN equipments e ON r."equipmentId" = e.id
            LEFT JOIN profiles p_creator ON r.created_by = p_creator.id
            LEFT JOIN profiles p_updater ON r.updated_by = p_updater.id
            LEFT JOIN billing_tasks bt ON bt.report_id = r.id
            ${whereSql}
            ORDER BY r."serviceDate" DESC, r.id DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `, [...params, limit, offset]);

        return { data: rows, total };
    }

    async findById(id: number, db: QueryRunner): Promise<any | null> {
        const { rows } = await db.query(`
            SELECT r.*, r.internal_notes as "internalNotes", r.time_blocks as "timeBlocks", c.name as "clientName", c.address as "clientAddress", c.nif as "clientNif",
                e.brand as "equipmentBrand", e.model as "equipmentModel", e."serialNumber" as "equipmentSerialNumber", e.nickname as "equipmentNickname",
                CONCAT(p_creator.first_name, ' ', p_creator.last_name) as "creator_name",
                CONCAT(p_updater.first_name, ' ', p_updater.last_name) as "updater_name",
                COALESCE(bt.status, r.billing_status) as billing_status,
                COALESCE((SELECT json_agg(json_build_object('id',p.id,'name',CONCAT(p.first_name,' ',p.last_name),'color',p.color,'signature',rt.signature))
                    FROM report_technicians rt JOIN profiles p ON rt."technicianId"=p.id WHERE rt."reportId"=r.id),'[]') as technicians,
                COALESCE((SELECT json_agg(json_build_object('id',pr.id,'reference',pr.reference,'designation',COALESCE(NULLIF(rp.designation, ''), pr.designation),'quantity',rp.quantity,'stockType',COALESCE(rp.stock_type,'general'),'stock_quantity',pr.stock_quantity,'reserved_quantity',pr.reserved_quantity,'stock_quantity_foss',pr.stock_quantity_foss,'reserved_quantity_foss',pr.reserved_quantity_foss,'image_path',pr.image_path,'track_stock',pr.track_stock))
                    FROM report_parts rp JOIN parts pr ON rp."partId"=pr.id WHERE rp."reportId"=r.id),'[]') as parts
            FROM reports r
            LEFT JOIN clients c ON r."clientId"=c.id
            LEFT JOIN equipments e ON r."equipmentId"=e.id
            LEFT JOIN profiles p_creator ON r.created_by = p_creator.id
            LEFT JOIN profiles p_updater ON r.updated_by = p_updater.id
            LEFT JOIN billing_tasks bt ON bt.report_id = r.id
            WHERE r.id=$1 AND r.deleted_at IS NULL
        `, [id]);
        return rows[0] ?? null;
    }

    async findByScheduleId(scheduleId: number): Promise<any | null> {
        const { rows } = await pool.query('SELECT id FROM reports WHERE "scheduleId"=$1 AND deleted_at IS NULL', [scheduleId]);
        if (rows.length === 0) return null;
        return this.findById(rows[0].id, pool);
    }

    async findByClientId(clientId: number): Promise<any[]> {
        const { rows } = await pool.query(`
            SELECT r.id, r.report_number as "reportNumber", r."serviceDate", r."scheduleId", r."serviceType",
                   (r.signature IS NOT NULL AND r.signature != '') as "isSigned",
                   CONCAT(e.brand, ' ', e.model) as "equipmentInfo",
                   COALESCE((SELECT json_agg(json_build_object('id',p.id,'name',CONCAT(p.first_name,' ',p.last_name),'color',p.color))
                    FROM report_technicians rt JOIN profiles p ON rt."technicianId"=p.id WHERE rt."reportId"=r.id),'[]') as technicians
            FROM reports r
            LEFT JOIN equipments e ON r."equipmentId" = e.id
            WHERE r."clientId" = $1 AND r.deleted_at IS NULL
            ORDER BY r."serviceDate" DESC
        `, [clientId]);
        return rows;
    }

    async countByClientId(clientId: number): Promise<number> {
        const { rows } = await pool.query('SELECT COUNT(*) FROM reports WHERE "clientId"=$1 AND deleted_at IS NULL', [clientId]);
        return parseInt(rows[0].count, 10);
    }
}
