import { pool, withTransactionAs } from '../../config/db';
import { supabase } from '../../config/supabase';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../utils/ApiError';
import { UserRole } from '../../types';
import * as reportService from '../../services/reportService';
import { broadcastCalendarUpdate } from '../../services/realtimeService';
import { logger } from '../../utils/logger';
import { ReportRepository } from './report.repository';

export class ReportService {
    constructor(private repo: ReportRepository) {}

    async getReports(filters: {
        search?: string; dateFilter?: string; serviceType?: string | string[];
        page?: number; limit?: number;
    }) {
        const { dateFilter, serviceType, page, limit } = filters;
        let search = filters.search;
        let startDate: string | undefined;
        let endDate: string | undefined;

        if (dateFilter) {
            const today = new Date();
            if (dateFilter === 'today') {
                startDate = new Date(today.setHours(0,0,0,0)).toISOString();
                endDate   = new Date(today.setHours(23,59,59,999)).toISOString();
            } else if (dateFilter === 'week') {
                const day = today.getDay();
                const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                const start = new Date(today.setDate(diff));
                start.setHours(0,0,0,0);
                startDate = start.toISOString();
                const end = new Date(start);
                end.setDate(start.getDate() + 6);
                end.setHours(23,59,59,999);
                endDate = end.toISOString();
            } else if (dateFilter === 'month') {
                startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
                endDate   = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
            }
        }

        const serviceTypes = serviceType
            ? (Array.isArray(serviceType) ? serviceType as string[] : [serviceType as string])
            : undefined;

        return this.repo.findAll(pool, { search, startDate, endDate, serviceTypes, page, limit });
    }

    async getReportById(id: number, userId: string, userRole: string) {
        const report = await this.repo.findById(id, pool);
        if (!report) throw new NotFoundError('Relatório não encontrado');

        if (userRole === UserRole.CLIENT) {
            const [profileRes, assocRes] = await Promise.all([
                pool.query('SELECT client_id FROM profiles WHERE id = $1', [userId]),
                pool.query('SELECT client_id FROM client_users WHERE user_id = $1', [userId]),
            ]);
            const associatedIds = [
                ...(profileRes.rows[0]?.client_id ? [profileRes.rows[0].client_id] : []),
                ...assocRes.rows.map((r: any) => r.client_id),
            ];
            if (!associatedIds.includes(report.clientId as number)) {
                logger.warn({ id, userId, associatedIds, reportClientId: report.clientId }, 'Permission denied');
                throw new ForbiddenError('Permission denied. This report does not belong to your associated clients.');
            }
        }

        return report;
    }

    async getReportBySchedule(scheduleId: number) {
        const report = await this.repo.findByScheduleId(scheduleId);
        if (!report) throw new NotFoundError('Report not found');
        return report;
    }

    async createReport(data: any, userId: string) {
        const reportId = await withTransactionAs(userId, (db) => reportService.createFullReport(db, data, userId));
        broadcastCalendarUpdate(supabase);
        return reportId;
    }

    async updateReport(reportId: number, data: any, userId: string) {
        await withTransactionAs(userId, (db) => reportService.updateFullReport(db, reportId, data));
        broadcastCalendarUpdate(supabase);
    }

    async deleteReport(reportId: number, userId: string, restoreParts: boolean) {
        await withTransactionAs(userId, (db) => reportService.deleteFullReport(db, reportId, userId, restoreParts));
        broadcastCalendarUpdate(supabase);
    }
}
