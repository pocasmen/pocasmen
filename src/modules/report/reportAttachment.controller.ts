import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { BadRequestError, UnauthorizedError } from '../../utils/ApiError';
import { ReportAttachmentService } from './reportAttachment.service';

export class ReportAttachmentController {
    constructor(private service: ReportAttachmentService) {}

    getReportAttachments = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const reportId = Number(req.params.id);
        const result = await this.service.getReportAttachments(reportId);
        res.json(result);
    });

    uploadReportAttachment = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const reportId = Number(req.params.id);
        
        if (!req.file) throw new BadRequestError('No file uploaded.');

        const result = await this.service.uploadReportAttachment(reportId, req.file, req.user.id);
        res.status(201).json(result);
    });

    deleteReportAttachment = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const attachmentId = req.params.attachmentId;
        
        await this.service.deleteReportAttachment(attachmentId, req.user.id);
        res.sendStatus(204);
    });
}
