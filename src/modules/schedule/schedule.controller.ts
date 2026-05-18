import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { ApiError, NotFoundError, UnauthorizedError } from '../../utils/ApiError';
import { ScheduleService } from './schedule.service';

export class ScheduleController {
    constructor(private scheduleService: ScheduleService) {}

    getSchedules = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const page  = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 200));
        const includeCompleted = req.query.includeCompleted === 'true' || req.query.isCompleted === 'true'; // Permitir isCompleted=true também
        const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
        const equipmentId = req.query.equipmentId ? Number(req.query.equipmentId) : undefined;
        const isTask = req.query.isTask === 'true' ? true : (req.query.isTask === 'false' ? false : undefined);
        const startDate = req.query.startDate as string | undefined;
        const endDate = req.query.endDate as string | undefined;
        
        // Se isCompleted=false for passado explicitamente (como no LinkModal)
        const finalIncludeCompleted = req.query.isCompleted === 'false' ? false : includeCompleted;

        const { data, total } = await this.scheduleService.getSchedules(page, limit, finalIncludeCompleted, clientId, equipmentId, isTask, startDate, endDate);
        res.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    });

    getScheduleById = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const schedule = await this.scheduleService.getScheduleById(Number(req.params.id));
        res.json(schedule);
    });

    createSchedule = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const result = await this.scheduleService.createSchedule(req.body, req.user.id);
        res.status(201).json(result);
    });

    updateSchedule = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const result = await this.scheduleService.updateSchedule(Number(req.params.id), req.body, req.user.id);
        res.json(result);
    });

    completeSchedule = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        const result = await this.scheduleService.completeSchedule(Number(req.params.id), req.body, req.user.id);
        res.json(result);
    });

    deleteSchedule = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        if (!req.user) throw new UnauthorizedError();
        await this.scheduleService.deleteSchedule(Number(req.params.id), req.user.id);
        res.status(204).send();
    });

    fixScheduleTitles = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.scheduleService.fixScheduleTitles();
        res.json(result);
    });
}
