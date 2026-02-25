import { PoolClient } from 'pg';

/**
 * Define o ID do utilizador na sessão do PostgreSQL para efeitos de auditoria.
 * Esta variável 'app.current_user_id' é lida pelo trigger de auditoria.
 */
export const setAuditUser = async (client: PoolClient, userId: string | undefined): Promise<void> => {
    if (!userId) return;
    // Define uma variável de sessão temporária (LOCAL) que o Trigger vai ler
    await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
};
