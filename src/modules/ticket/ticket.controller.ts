import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { BadRequestError, UnauthorizedError } from '../../utils/ApiError';
import { TicketService } from './ticket.service';

export class TicketController {
    constructor(private ticketService: TicketService) {}

    getTickets = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const status = (req.query.status as string) || 'open';
        const page  = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 100));

        const { data: tickets, total } = await this.ticketService.getTickets({ status, page, limit });
        const result = tickets.map((t: any) => ({ ...t, faultDescription: t.faultDescription || t.fault_description }));

        res.json({ data: result, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    });

    getTicketById = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const ticketId = Number(req.params.id);
        if (!ticketId || Number.isNaN(ticketId)) throw new BadRequestError('Invalid ticket id');
        const ticket = await this.ticketService.getTicketById(ticketId);
        res.json(ticket);
    });

    createTicket = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const result = await this.ticketService.createTicket(req.body, req.user.id);
        res.status(201).json(result);
    });

    replyToTicket = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const result = await this.ticketService.replyToTicket(+req.params.id, req.body.message, req.user.id);
        res.json(result);
    });

    deleteTicket = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const ticketId = Number(req.params.id);
        if (!ticketId || Number.isNaN(ticketId)) throw new BadRequestError('Invalid ticket id');
        const result = await this.ticketService.deleteTicket(ticketId, req.user!.id);
        res.json(result);
    });


    markTicketAsRead = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        await this.ticketService.markTicketAsRead(+req.params.id, req.user.id);
        res.status(200).send('Marked as read');
    });

    linkTicketToSchedule = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const ticketId = Number(req.params.id);
        const scheduleId = Number(req.params.scheduleId);
        if (!ticketId || !scheduleId) throw new BadRequestError('Invalid IDs');
        
        const result = await this.ticketService.linkTicketToSchedule(ticketId, scheduleId, req.user.id);
        res.json(result);
    });
}
