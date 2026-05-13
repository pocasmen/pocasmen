import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { UnauthorizedError } from '../../utils/ApiError';
import { AuthService } from './auth.service';

export class AuthController {
    constructor(private authService: AuthService) {}

    login = catchAsync(async (req: Request, res: Response) => {
        const metadata = {
            ip: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent']
        };
        const data = await this.authService.login(req.body, metadata);
        res.json(data);
    });

    getAuditLogs = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const result = await this.authService.getAuditLogs(page, limit);
        res.json(result);
    });

    getImpersonatedUser = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const user = await this.authService.getImpersonatedUser(req.params.id);
        res.json(user);
    });

    selfRegister = catchAsync(async (req: Request, res: Response) => {
        const result = await this.authService.selfRegister(req.body);
        res.status(200).json(result);
    });

    inviteUser = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const requestingUserRole = req.user.user_metadata?.role;
        const result = await this.authService.inviteUser(req.body, requestingUserRole);
        res.status(200).json(result);
    });

    getPendingUsers = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const users = await this.authService.getPendingUsers();
        res.json(users);
    });

    approveUser = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const updatedUser = await this.authService.approveUser(req.body, req.user.id);
        res.status(200).json({ message: 'User approved and associated successfully.', user: updatedUser });
    });

    resendInvite = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.authService.resendInvite(req.params.userId);
        res.status(200).json(result);
    });
}
