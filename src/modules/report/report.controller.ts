import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { UnauthorizedError } from '../../utils/ApiError';
import { ReportService } from './report.service';

export class ReportController {
    constructor(private reportService: ReportService) {}

    getReports = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const page  = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
        const result = await this.reportService.getReports({
            search:      req.query.search as string,
            dateFilter:  req.query.dateFilter as string,
            serviceType: req.query.serviceType as string | string[],
            page, limit,
        });
        res.json({ data: result.data, pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) } });
    });

    getReportById = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const report = await this.reportService.getReportById(+req.params.id, req.user.id, req.user.user_metadata?.role);
        res.json(report);
    });

    getReportBySchedule = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const report = await this.reportService.getReportBySchedule(+req.params.scheduleId);
        res.json(report);
    });

    createReport = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const reportId = await this.reportService.createReport(req.body, req.user.id);
        res.status(201).json({ message: 'Relatório criado com sucesso!', reportId });
    });

    updateReport = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        await this.reportService.updateReport(+req.params.id, req.body, req.user!.id);
        res.json({ message: 'Relatório atualizado!', reportId: +req.params.id });
    });

    deleteReport = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        await this.reportService.deleteReport(+req.params.id, req.user.id, req.query.restoreParts === 'true');
        res.status(200).json({ message: 'Relatório removido com sucesso.' });
    });
}
