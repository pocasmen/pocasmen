import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { DashboardService } from './dashboard.service';

export class DashboardController {
    constructor(private dashboardService: DashboardService) {}

    getStats = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const stats = await this.dashboardService.getStats({
            startDate: req.query.startDate as string | undefined,
            endDate: req.query.endDate as string | undefined,
        });
        res.json(stats);
    });

    getWeeklySchedules = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.dashboardService.getWeeklySchedules({
            startDate: req.query.startDate as string | undefined,
            endDate: req.query.endDate as string | undefined,
        });
        res.json(result);
    });

    getPendingReports = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const rows = await this.dashboardService.getPendingReports({
            startDate: req.query.startDate as string | undefined,
            endDate: req.query.endDate as string | undefined,
        });
        res.json(rows);
    });
}
