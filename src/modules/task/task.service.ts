import { pool, withTransactionAs } from '../../config/db';
import { NotFoundError, ForbiddenError } from '../../utils/ApiError';
import { TaskRepository } from './task.repository';
import * as taskService from '../../services/taskService';
import { UserRole } from '../../constants/enums';

export class TaskService {
    constructor(private repo: TaskRepository) {}

    async getTasks(userId: string, role: string) {
        return this.repo.findAll(pool, { userId, role });
    }

    async getTaskById(id: number, userId: string, role: string) {
        const task = await this.repo.findById(id, pool);
        if (!task) throw new NotFoundError('Task not found');

        if (role !== UserRole.SUPER_ADMIN && task.user_id !== userId && task.created_by !== userId && task.is_private) {
            throw new NotFoundError('Task not found');
        }
        return task;
    }

    async createTask(data: any, userId: string) {
        return withTransactionAs(userId, (db) => taskService.createFullTask(db, userId, data));
    }

    async updateTask(taskId: number, data: any, userId: string, role: string) {
        const task = await this.repo.findById(taskId, pool);
        if (!task) throw new NotFoundError('Task not found');

        if (role !== UserRole.SUPER_ADMIN && task.user_id !== userId && task.created_by !== userId) {
            throw new NotFoundError('Task not found');
        }

        return withTransactionAs(userId, (db) => taskService.updateFullTask(db, taskId, data));
    }

    async deleteTask(taskId: number, userId: string, role: string) {
        const task = await this.repo.findById(taskId, pool);
        if (!task) throw new NotFoundError('Task not found');

        if (role !== UserRole.SUPER_ADMIN && task.user_id !== userId) {
            throw new NotFoundError('Task not found');
        }

        return withTransactionAs(userId, (db) =>
            db.query('DELETE FROM internal_tasks WHERE id = $1', [taskId])
        );
    }

    async getStats(start: Date, end: Date) {
        return this.repo.getStats(start, end, pool);
    }
}
