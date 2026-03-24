import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';
import { setAuditUser } from '../utils/dbHelper';

import { parse } from 'pg-connection-string';

dotenv.config();

// Initializing PostgreSQL Pool
const connectionString = process.env.DATABASE_URL || '';
const parsedConfig = parse(connectionString);

const maskedUrl = connectionString.replace(/:([^@]+)@/, ':****@');
logger.info({ url: maskedUrl }, '[DB] Initializing PostgreSQL Pool');

const pool = new Pool({
    user: parsedConfig.user || undefined,
    password: parsedConfig.password || undefined,
    host: parsedConfig.host || undefined,
    database: parsedConfig.database || undefined,
    port: parsedConfig.port ? parseInt(parsedConfig.port, 10) : undefined,
    ssl: process.env.NODE_ENV === 'production'
        ? {
            rejectUnauthorized: true,
            ca: process.env.DB_CA_CERT, // Opcional: Para validar contra um certificado específico
        }
        : {
            rejectUnauthorized: false // Em desenvolvimento permitimos bypass para facilitar
        },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

pool.on('connect', () => {
    logger.debug('[DB] Client connected to pool');
});

pool.on('error', (err) => {
    logger.error(err, '[DB] Unexpected error on idle client');
});

/**
 * Utilitário para executar operações numa transação atómica.
 * Injeta automaticamente o ID do utilizador na sessão SQL para auditoria.
 */
export const withTransaction = async <T>(
    req: any,
    callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Injeta o ID do utilizador autenticado para o Trigger de auditoria
        if (req?.user?.id) {
            await setAuditUser(client, req.user.id);
        }

        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error(error, 'Transaction rolled back due to error');
        throw error;
    } finally {
        client.release();
    }
};


/**
 * Versão da transação para uso na camada Service.
 * Recebe userId diretamente (sem req), para que o Service não conheça HTTP.
 */
export const withTransactionAs = async <T>(
    userId: string | null,
    callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if (userId) {
            await setAuditUser(client, userId);
        }

        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error(error, 'Transaction rolled back due to error');
        throw error;
    } finally {
        client.release();
    }
};

export { pool };
