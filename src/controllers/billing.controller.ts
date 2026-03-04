//Horas de desenvolvimento activo=5,0
import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import * as billingService from '../services/billingService';
import { catchAsync } from '../utils/catchAsync';
import { ApiError } from '../utils/ApiError';
import { BillingStatus } from '../constants/enums';

import { withTransaction, pool } from '../config/db';

export const getBillingTasks = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { startDate, endDate } = req.query;
    // We use raw SQL to ensure client name is correct
    const client = await pool.connect();
    try {
        const tasks = await billingService.getBillingTasksRaw(client, startDate as string, endDate as string);
        res.json(tasks);
    } finally {
        client.release();
    }
});

export const updateBillingTask = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { status, billing_notes, invoice_number } = req.body;

    if (!Object.values(BillingStatus).includes(status)) {
        throw new ApiError(400, 'Estado de faturação inválido.');
    }

    const task = await withTransaction(req, async (db) => {
        return await billingService.updateBillingTaskStatus(db, Number(id), status, billing_notes, invoice_number);
    });

    res.json(task);
});

export const deleteBillingTask = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    await withTransaction(req, async (db) => {
        await billingService.deleteBillingTask(db, Number(id));
    });
    res.status(204).send();
});

export const getBillingStats = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { startDate, endDate } = req.query;

    let query = supabase
        .from('billing_tasks')
        .select('status, reports!inner(serviceDate, deleted_at)')
        .is('reports.deleted_at', null);

    if (startDate && endDate) {
        query = query
            .gte('reports.serviceDate', startDate as string)
            .lte('reports.serviceDate', endDate as string);
    }

    const { data: tasks, error } = await query;

    if (error) throw new ApiError(500, 'Erro ao obter estatísticas.');

    const stats = {
        total: (tasks || []).filter(t => t.status !== BillingStatus.BILLED).length,
        report_issued: (tasks || []).filter(t => t.status === BillingStatus.REPORT_ISSUED).length,
        pending_completion: (tasks || []).filter(t => t.status === BillingStatus.PENDING_COMPLETION).length,
        ready_for_billing: (tasks || []).filter(t => t.status === BillingStatus.READY_FOR_BILLING).length,
        billed: (tasks || []).filter(t => t.status === BillingStatus.BILLED).length
    };

    res.json(stats);
});
