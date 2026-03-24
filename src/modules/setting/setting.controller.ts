import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { SettingService } from './setting.service';

export class SettingController {
    constructor(private settingService: SettingService) {}

    getSettings = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const settings = await this.settingService.getSettings();
        res.json(settings);
    });

    updateSettings = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.settingService.updateSettings(req.body, req.user!.id);
        res.json(result);
    });
}
