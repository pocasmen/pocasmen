import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { UnauthorizedError } from '../../utils/ApiError';
import { ClientPortalService } from './clientPortal.service';

export class ClientPortalController {
    constructor(private service: ClientPortalService) {}

    getMyCompanies = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const companies = await this.service.getMyCompanies(req.user.id);
        res.json(companies);
    });

    getMyStats = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const stats = await this.service.getMyStats(req.user.id, req.query.clientId);
        res.json(stats);
    });

    getMyEquipments = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const equipments = await this.service.getMyEquipments(req.user.id, req.query.clientId);
        res.json(equipments);
    });

    getMyTickets = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

        const { data, total } = await this.service.getMyTickets(req.user.id, req.query.clientId, page, limit);

        res.json({
            data,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    });

    getMySchedules = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

        const { data, total } = await this.service.getMySchedules(req.user.id, req.query.clientId, page, limit);

        res.json({
            data,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    });

    createMyTicket = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const result = await this.service.createMyTicket(req.body, req.user.id, req.body.clientId, req.query.clientId);
        res.status(201).json(result);
    });

    getMyReportBySchedule = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const report = await this.service.getMyReportBySchedule(Number(req.params.id), req.user.id);
        res.json(report);
    });

    getMyTicketById = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const ticket = await this.service.getMyTicketById(Number(req.params.id), req.user.id);
        res.json(ticket);
    });

    replyToMyTicket = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const result = await this.service.replyToMyTicket(Number(req.params.id), req.body.message, req.user.id);
        res.json(result);
    });

    markTicketAsRead = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        await this.service.markTicketAsRead(Number(req.params.id), req.user.id);
        res.status(200).send('Marked as read');
    });

    signMyReport = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const result = await this.service.signMyReport(Number(req.params.id), req.user.id);
        res.json(result);
    });
}
