import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { TaskService } from './task.service';

export class TaskController {
    constructor(private taskService: TaskService) {}

    getTasks = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const { id: userId, user_metadata: { role } } = req.user!;
        const tasks = await this.taskService.getTasks(userId, role);
        res.json(tasks);
    });

    getTaskById = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const { id: userId, user_metadata: { role } } = req.user!;
        const task = await this.taskService.getTaskById(+req.params.id, userId, role);
        res.json(task);
    });

    createTask = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const task = await this.taskService.createTask(req.body, req.user!.id);
        res.status(201).json(task);
    });

    updateTask = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const { id: userId, user_metadata: { role } } = req.user!;
        const task = await this.taskService.updateTask(+req.params.id, req.body, userId, role);
        res.json(task);
    });

    deleteTask = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const { id: userId, user_metadata: { role } } = req.user!;
        await this.taskService.deleteTask(+req.params.id, userId, role);
        res.sendStatus(204);
    });
}
