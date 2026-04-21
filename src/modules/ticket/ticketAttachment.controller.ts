import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { BadRequestError, UnauthorizedError } from '../../utils/ApiError';
import { TicketAttachmentService } from './ticketAttachment.service';

export class TicketAttachmentController {
    constructor(private service: TicketAttachmentService) {}

    getAttachments = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const ticketId = Number(req.params.id);
        const result = await this.service.getAttachments(ticketId);
        res.json(result);
    });

    uploadAttachment = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const ticketId = Number(req.params.id);
        
        if (!req.file) throw new BadRequestError('No file uploaded.');

        const result = await this.service.uploadAttachment(ticketId, req.file, req.user.id);
        res.status(201).json(result);
    });

    deleteAttachment = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const attachmentId = req.params.attachmentId;
        
        await this.service.deleteAttachment(attachmentId, req.user.id);
        res.sendStatus(204);
    });
}
