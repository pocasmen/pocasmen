import { pool } from '../../config/db';
import { QueryRunner } from '../../types/db.types';
import { Client } from '../../types/supabase';
import { CreateClientDto, UpdateClientDto } from './client.dto';

export class ClientRepository {
    async findAll(db: QueryRunner, filters: { search?: string } = {}): Promise<Client[]> {
        const { search } = filters;
        let query = 'SELECT * FROM clients';
        const params: any[] = [];

        if (search) {
            query += ' WHERE name ILIKE $1 OR nickname ILIKE $1';
            params.push(`%${search}%`);
        }

        query += ' ORDER BY name ASC';
        const { rows } = await db.query(query, params);
        return rows;
    }

    async findById(id: number, db: QueryRunner): Promise<Client | null> {
        const { rows } = await db.query('SELECT * FROM clients WHERE id = $1', [id]);
        return rows[0] ?? null;
    }

    async create(data: CreateClientDto, db: QueryRunner): Promise<Client> {
        const { name, nickname, address, city, postCode, nif } = data;
        const { rows } = await db.query(
            `INSERT INTO clients (name, nickname, address, city, "postCode", nif)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [name, nickname, address, city, postCode, nif]
        );
        return rows[0];
    }

    async update(id: number, data: UpdateClientDto, db: QueryRunner): Promise<Client | null> {
        const { name, nickname, address, city, postCode, nif } = data;
        const { rows } = await db.query(
            `UPDATE clients
             SET name = $1, nickname = $2, address = $3, city = $4, "postCode" = $5, nif = $6
             WHERE id = $7
             RETURNING *`,
            [name, nickname, address, city, postCode, nif, id]
        );
        return rows[0] ?? null;
    }

    async delete(id: number, db: QueryRunner): Promise<boolean> {
        const { rowCount } = await db.query('DELETE FROM clients WHERE id = $1', [id]);
        return (rowCount ?? 0) > 0;
    }

    async findUsersByClientId(clientId: number, db: QueryRunner) {
        const { rows } = await db.query(
            `SELECT id, first_name, last_name, email
             FROM profiles
             WHERE client_id = $1
             ORDER BY first_name ASC`,
            [clientId]
        );
        return rows;
    }

    /** Verifica se um utilizador tem acesso a um determinado cliente. */
    async validateAccess(userId: string, clientId: number): Promise<boolean> {
        const idNum = Number(clientId);
        const { rowCount } = await pool.query(
            `SELECT 1 FROM client_users WHERE user_id = $1 AND client_id = $2
             UNION
             SELECT 1 FROM profiles WHERE id = $1 AND client_id = $2`,
            [userId, idNum]
        );
        return (rowCount ?? 0) > 0;
    }

    /** Devolve as empresas (clientes) associadas a um utilizador do portal. */
    async findMyCompanies(userId: string): Promise<Client[]> {
        const { rows } = await pool.query(
            `SELECT DISTINCT c.*
             FROM clients c
             LEFT JOIN client_users cu ON c.id = cu.client_id
             LEFT JOIN profiles p ON c.id = p.client_id
             WHERE cu.user_id = $1 OR p.id = $1
             ORDER BY c.name ASC`,
            [userId]
        );
        return rows;
    }
}
