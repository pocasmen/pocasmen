import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { GoogleService } from './google.service';

export class GoogleController {
    constructor(private service: GoogleService) {}

    syncGoogleCalendar = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.service.syncGoogleCalendar();
        res.json(result);
    });

    clearGoogleCalendar = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.service.clearGoogleCalendar();
        res.json(result);
    });
}
