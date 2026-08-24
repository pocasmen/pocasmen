import { pool } from '../../config/db';
import { QueryRunner } from '../../types';
import { Client } from '../../types/supabase';
import { CreateClientDto, UpdateClientDto } from './client.dto';

export class ClientRepository {
    async findAll(db: QueryRunner, filters: { search?: string, is_blacklisted?: boolean, equipment_category?: string } = {}): Promise<Client[]> {
        const { search, is_blacklisted, equipment_category } = filters;
        let query = 'SELECT DISTINCT c.* FROM clients c';
        const params: any[] = [];
        const whereClauses: string[] = [];

        if (equipment_category) {
            query += ' INNER JOIN equipments e ON c.id = e."clientId"';
            params.push(equipment_category);
            whereClauses.push(`e.category = $${params.length}`);
        }

        if (search) {
            params.push(`%${search}%`);
            whereClauses.push(`(c.name ILIKE $${params.length} OR c.nickname ILIKE $${params.length})`);
        }

        if (is_blacklisted !== undefined) {
            params.push(is_blacklisted);
            whereClauses.push(`c.is_blacklisted = $${params.length}`);
        }

        if (whereClauses.length > 0) {
            query += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        query += ' ORDER BY c.name ASC';
        const { rows } = await db.query(query, params);
        return rows;
    }

    async findById(id: number, db: QueryRunner): Promise<Client | null> {
        const { rows } = await db.query('SELECT * FROM clients WHERE id = $1', [id]);
        return rows[0] ?? null;
    }

    async create(data: CreateClientDto, db: QueryRunner): Promise<Client> {
        const { name, nickname, address, city, postCode, nif, is_blacklisted, blacklist_reason } = data;
        const { rows } = await db.query(
            `INSERT INTO clients (name, nickname, address, city, "postCode", nif, is_blacklisted, blacklist_reason)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [name, nickname, address, city, postCode, nif, is_blacklisted ?? false, blacklist_reason]
        );
        return rows[0];
    }

    async update(id: number, data: UpdateClientDto, db: QueryRunner): Promise<Client | null> {
        const { name, nickname, address, city, postCode, nif, is_blacklisted, blacklist_reason } = data;
        const { rows } = await db.query(
            `UPDATE clients
             SET name = $1, nickname = $2, address = $3, city = $4, "postCode" = $5, nif = $6, 
                 is_blacklisted = $7, blacklist_reason = $8
             WHERE id = $9
             RETURNING *`,
            [name, nickname, address, city, postCode, nif, is_blacklisted, blacklist_reason, id]
        );
        return rows[0] ?? null;
    }

    async delete(id: number, db: QueryRunner): Promise<boolean> {
        const { rowCount } = await db.query('DELETE FROM clients WHERE id = $1', [id]);
        return (rowCount ?? 0) > 0;
    }

    async findUsersByClientId(clientId: number, db: QueryRunner) {
        const { rows } = await db.query(
            `SELECT p.id, p.first_name, p.last_name, p.email, p.client_role,
                (p.signature IS NOT NULL AND p.signature <> '') as has_signature,
                (p.first_name IS NOT NULL AND p.first_name <> '' AND
                 p.last_name IS NOT NULL AND p.last_name <> '' AND
                 p.client_role IS NOT NULL AND p.client_role <> '' AND
                 EXISTS (SELECT 1 FROM client_users cu_chk WHERE cu_chk.user_id = p.id)
                ) as is_profile_complete,
                EXISTS (
                    SELECT 1 FROM auth.users au 
                    WHERE au.id = p.id 
                    AND au.email_confirmed_at IS NOT NULL
                    AND (au.raw_user_meta_data->>'must_set_password' IS NULL OR au.raw_user_meta_data->>'must_set_password' = 'false')
                ) as has_password,
                COALESCE(
                    (SELECT json_agg(json_build_object('client_id', cu_sub.client_id, 'name', c_sub.name))
                     FROM client_users cu_sub
                     JOIN clients c_sub ON cu_sub.client_id = c_sub.id
                     WHERE cu_sub.user_id = p.id),
                    '[]'
                ) as client_users
             FROM profiles p
             JOIN client_users cu ON cu.user_id = p.id
             WHERE cu.client_id = $1 AND p.role = 'client'
             ORDER BY p.first_name ASC`,
            [clientId]
        );
        return rows;
    }

    /** Verifica se um utilizador tem acesso a um determinado cliente. */
    async validateAccess(userId: string, clientId: number): Promise<boolean> {
        const idNum = Number(clientId);
        const { rowCount } = await pool.query(
            `SELECT 1 FROM client_users WHERE user_id = $1 AND client_id = $2`,
            [userId, idNum]
        );
        return (rowCount ?? 0) > 0;
    }

    /** Devolve as empresas (clientes) associadas a um utilizador do portal. */
    async findMyCompanies(userId: string): Promise<Client[]> {
        const { rows } = await pool.query(
            `SELECT DISTINCT c.*
             FROM clients c
             INNER JOIN client_users cu ON c.id = cu.client_id
             WHERE cu.user_id = $1
             ORDER BY c.name ASC`,
            [userId]
        );
        return rows;
    }
}
