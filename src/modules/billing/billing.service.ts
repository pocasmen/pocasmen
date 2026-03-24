import { pool, withTransactionAs } from '../../config/db';
import { ApiError } from '../../utils/ApiError';
import { BillingStatus } from '../../constants/enums';
import * as billingService from '../../services/billingService';
import { BillingRepository } from './billing.repository';

export class BillingService {
    constructor(private repo: BillingRepository) {}

    async getBillingTasks(startDate?: string, endDate?: string) {
        const client = await pool.connect();
        try {
            return await billingService.getBillingTasksRaw(client, startDate!, endDate!);
        } finally {
            client.release();
        }
    }

    async updateBillingTask(id: number, status: string, billing_notes: string, invoice_number: string, userId: string) {
        if (!Object.values(BillingStatus).includes(status as BillingStatus)) {
            throw new ApiError(400, 'Estado de faturação inválido.');
        }
        return withTransactionAs(userId, (db) =>
            billingService.updateBillingTaskStatus(db, id, status as BillingStatus, billing_notes, invoice_number)
        );
    }

    async deleteBillingTask(id: number, userId: string) {
        return withTransactionAs(userId, (db) => billingService.deleteBillingTask(db, id));
    }

    async getBillingStats(startDate?: string, endDate?: string) {
        const client = await pool.connect();
        try {
            return await this.repo.getStats(client, { startDate, endDate });
        } finally {
            client.release();
        }
    }
}
