import { pool } from '../../config/db';
import { TicketRepository } from '../ticket/ticket.repository';
import { ScheduleRepository } from '../schedule/schedule.repository';
import { TaskRepository } from '../task/task.repository';
import { logger } from '../../utils/logger';

// NOTE: TicketRepository e ScheduleRepository serão migrados na Fase 3.
// Por agora são instanciados com pool para manter compatibilidade.
const ticketRepo = new TicketRepository();
const scheduleRepo = new ScheduleRepository(pool);

export class DashboardService {
    constructor(private taskRepo: TaskRepository) {}

    private parseDateRange(startDateParam?: string, endDateParam?: string) {
        if (startDateParam && endDateParam) {
            return { start: new Date(startDateParam), end: new Date(endDateParam) };
        }
        const today = new Date();
        const day = today.getDay() || 7;
        const start = new Date(today);
        start.setDate(today.getDate() - (day - 1));
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    }

    async getStats(query: { startDate?: string; endDate?: string }) {
        const { start, end } = this.parseDateRange(query.startDate, query.endDate);
        logger.info(`[DASHBOARD] Fetching stats for range: ${start.toISOString()} to ${end.toISOString()}`);

        const [ticketStats, sStats, tStats, backlogStats] = await Promise.all([
            ticketRepo.getStats(pool),
            scheduleRepo.getStats({ startDate: start.toISOString(), endDate: end.toISOString() }),
            this.taskRepo.getStats(start, end, pool),
            scheduleRepo.getBacklogStats(),
        ]);

        logger.debug({ ticketStats }, '[DASHBOARD] Ticket Stats');
        logger.debug({ sStats }, '[DASHBOARD] Schedule Stats');
        logger.debug({ tStats }, '[DASHBOARD] Task Stats');
        logger.debug({ backlogStats }, '[DASHBOARD] Backlog Stats');

        let trendPercent: number | null = null;
        let trendDirection: 'up' | 'down' | 'stable' = 'stable';
        
        if (backlogStats.createdPrevious7Days > 0) {
            trendPercent = ((backlogStats.createdLast7Days - backlogStats.createdPrevious7Days) / backlogStats.createdPrevious7Days) * 100;
            trendPercent = Math.round(trendPercent * 10) / 10;
            
            if (trendPercent > 5) trendDirection = 'up';
            else if (trendPercent < -5) trendDirection = 'down';
        } else if (backlogStats.createdLast7Days > 0) {
            trendPercent = 100;
            trendDirection = 'up';
        }

        let oldestAgeDays: number | null = null;
        if (backlogStats.oldestCreatedAt) {
            const oldest = new Date(backlogStats.oldestCreatedAt);
            const now = new Date();
            const diffTime = Math.abs(now.getTime() - oldest.getTime());
            oldestAgeDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        }

        return {
            tickets: ticketStats,
            weekly: {
                total: sStats.total,
                completed: sStats.completed,
                withReport: sStats.withReport,
                overdue: sStats.overdue,
                pending: sStats.total - sStats.completed - sStats.withReport - sStats.overdue,
            },
            overdue: sStats.overdue,
            pendingReports: {
                total: sStats.pendingReportsCompleted + sStats.pendingReportsOverdue,
                completed: sStats.pendingReportsCompleted,
                overdue: sStats.pendingReportsOverdue,
            },
            tasks: tStats,
            backlog: {
                ...backlogStats,
                trendPercent,
                trendDirection,
                oldestAgeDays,
            },
        };
    }

    async getWeeklySchedules(query: { startDate?: string; endDate?: string }) {
        const { start, end } = this.parseDateRange(query.startDate, query.endDate);
        return scheduleRepo.findWeeklySchedules(start.toISOString(), end.toISOString());
    }

    async getPendingReports(query: { startDate?: string; endDate?: string }) {
        let start: Date, end: Date;
        if (query.startDate && query.endDate) {
            start = new Date(query.startDate);
            end = new Date(query.endDate);
        } else {
            const today = new Date();
            start = new Date(today);
            start.setDate(today.getDate() - (today.getDay() || 7) + 1);
            start.setHours(0, 0, 0, 0);
            end = new Date(start);
            end.setDate(start.getDate() + 4);
            end.setHours(23, 59, 59, 999);
        }
        return scheduleRepo.findPendingReports(start.toISOString(), end.toISOString());
    }
}
