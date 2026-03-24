import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { EmailTemplateService } from './emailTemplate.service';

export class EmailTemplateController {
    constructor(private emailTemplateService: EmailTemplateService) {}

    getTemplates = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const templates = await this.emailTemplateService.getTemplates();
        res.json(templates);
    });

    updateTemplates = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.emailTemplateService.updateTemplates(req.body, req.user!.id);
        res.json(result);
    });
}
