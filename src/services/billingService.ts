import { SupabaseClient } from '@supabase/supabase-js';
//Horas de desenvolvimento activo=8,5
import { PoolClient } from 'pg';
import { BillingStatus, UserRole } from '../constants/enums';
import { ApiError } from '../utils/ApiError';
import { Database } from '../types/db.types';
import { BillingTask } from '../types/supabase';
import { logger } from '../utils/logger';


export const createBillingTask = async (db: PoolClient, reportId: number, isPending: boolean = false): Promise<BillingTask> => {
    const status = isPending ? BillingStatus.PENDING_COMPLETION : BillingStatus.REPORT_ISSUED;
    const assignedRole = UserRole.OFFICE_STAFF;

    const result = await db.query<BillingTask>(
        'INSERT INTO billing_tasks (report_id, status, assigned_role) VALUES ($1, $2, $3) RETURNING *',
        [reportId, status, assignedRole]
    );
    return result.rows[0];
};

export const updateBillingTaskStatus = async (db: PoolClient, taskId: number, status: BillingStatus, notes?: string, invoiceNumber?: string): Promise<BillingTask | undefined> => {
    const updatedAt = new Date().toISOString();
    let billedAt: string | null = null;
    if (status === BillingStatus.BILLED) billedAt = new Date().toISOString();

    const values: any[] = [status, updatedAt, taskId];
    let querySets = ['status = $1', 'updated_at = $2'];
    let nextIdx = 4;

    if (notes !== undefined) {
        querySets.push(`billing_notes = $${nextIdx}`);
        values.push(notes);
        nextIdx++;
    }

    if (billedAt) {
        querySets.push(`billed_at = $${nextIdx}`);
        values.push(billedAt);
        nextIdx++;
    }

    if (invoiceNumber !== undefined) {
        querySets.push(`invoice_number = $${nextIdx}`);
        values.push(invoiceNumber);
        nextIdx++;
    }

    const finalQuery = `UPDATE billing_tasks SET ${querySets.join(', ')} WHERE id = $3 RETURNING *`;

    const result = await db.query<BillingTask>(finalQuery, values);
    const task = result.rows[0];

    if (task) {
        // Also update report billing status denormalized field if needed, or just let it be. 
        // Original code did this update, so we keep it.
        await db.query('UPDATE reports SET billing_status = $1 WHERE id = $2', [status, task.report_id]);
    }

    return task;
};

export const deleteBillingTask = async (db: PoolClient, taskId: number): Promise<boolean> => {
    await db.query('DELETE FROM billing_tasks WHERE id = $1', [taskId]);
    return true;
};

export const getBillingTasks = async (supabase: SupabaseClient<Database>) => {
    const { data, error } = await supabase
        .from('billing_tasks')
        .select(`
            *,
            reports (
                *,
                clients (name)
            )
        `)
        .order('created_at', { ascending: false });

    if (error) {
        throw new ApiError(500, 'Erro ao procurar tarefas de faturação.', error.message);
    }

    if (data) {
        logger.debug({ sample: data.slice(0, 3) }, 'Billing Tasks Data Sample');
    }
    return data;
};


export const getBillingTasksRaw = async (db: PoolClient, startDate?: string, endDate?: string): Promise<any[]> => {
    // Raw SQL to ensure we get the client name correctly, bypassing Supabase join issues
    // We quote "clientId" because db.types.ts suggests it is camelCase.
    // We select specific columns to avoid collisions
    let query = `
        SELECT 
            bt.*,
            r.id as r_report_id,
            r."serviceDate",
            r."report_number",
            r."clientId",
            c.name as client_name
        FROM billing_tasks bt
        LEFT JOIN reports r ON bt.report_id = r.id
        LEFT JOIN clients c ON r."clientId" = c.id
        WHERE (r.deleted_at IS NULL OR r.id IS NULL)
    `;

    const values: any[] = [];
    if (startDate && endDate) {
        query += ` AND r."serviceDate" >= $1 AND r."serviceDate" <= $2`;
        values.push(startDate, endDate);
    }

    query += ` ORDER BY bt.created_at DESC`;

    try {
        const result = await db.query(query, values);
        return result.rows.map(row => ({
            id: row.id,
            report_id: row.report_id,
            status: row.status,
            assigned_role: row.assigned_role,
            notes: row.notes,
            billing_notes: row.billing_notes,
            invoice_number: row.invoice_number,
            billed_at: row.billed_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
            reports: row.r_report_id ? {
                id: row.r_report_id,
                serviceDate: row.serviceDate,
                report_number: row.report_number,
                // Inject clientName directly for the frontend fallback to pick it up
                clientName: row.client_name || 'Cliente (Sem Nome)',
                clients: {
                    name: row.client_name
                },
                clientId: row.clientId
            } : null
        }));
    } catch (error: any) {
        // Fallback or retry if column naming is wrong?
        logger.error({ error }, 'Raw query failed');
        throw new ApiError(500, 'Error executing raw billing query: ' + error.message);
    }
};

