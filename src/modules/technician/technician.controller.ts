import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { UnauthorizedError } from '../../utils/ApiError';
import { TechnicianService } from './technician.service';

export class TechnicianController {
    constructor(private technicianService: TechnicianService) {}

    getTechnicians = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const technicians = await this.technicianService.getTechnicians();
        res.json(technicians);
    });

    getExternalUsers = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const filters = { 
            search: req.query.search as string | undefined,
            category: req.query.category as string | undefined
        };
        const users = await this.technicianService.getExternalUsers(filters);
        res.json(users);
    });

    getMe = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const profile = await this.technicianService.getMe(req.user.id);
        res.json(profile);
    });

    updateTechnician = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const result = await this.technicianService.updateTechnician(
            req.params.id,
            req.body,
            req.user.id,
            req.user.user_metadata?.role
        );
        res.json(result);
    });

    deleteTechnician = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        await this.technicianService.deleteTechnician(
            req.params.id,
            req.user?.user_metadata?.role
        );
        res.sendStatus(204);
    });

    hardDeleteUser = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.technicianService.hardDeleteUser(
            req.params.id,
            req.user?.user_metadata?.role
        );
        res.json(result);
    });

    reactivateUser = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.technicianService.reactivateUser(
            req.params.id,
            req.user?.user_metadata?.role
        );
        res.json(result);
    });
}
