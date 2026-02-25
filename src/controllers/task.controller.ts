import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import * as taskService from '../services/taskService';
import { catchAsync } from '../utils/catchAsync';
import { ApiError, NotFoundError } from '../utils/ApiError';
import { withTransaction } from '../config/db';
import { UserRole } from '../constants/enums';
import { InternalTask } from '../types/supabase';

export const getTasks = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const userId = user.id;
    const role = user.user_metadata.role;

    let query = supabase
        .from('internal_tasks')
        .select(`
            *,
            assignee:profiles!internal_tasks_user_id_fkey(first_name, last_name, color),
            creator:profiles!internal_tasks_created_by_fkey(first_name, last_name),
            clients(name),
            equipments(brand, model, serialNumber),
            internal_task_time_blocks(*)
        `);

    // Filter by privacy and role
    // super_admin sees everything
    if (role !== UserRole.SUPER_ADMIN) {
        query = query.or(`user_id.eq.${userId},created_by.eq.${userId},is_private.eq.false`);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw new ApiError(500, 'Failed to fetch tasks', error.message);

    res.json(data);
});

export const getTaskById = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const user = req.user!;
    const role = user.user_metadata.role;

    const { data: task, error } = await supabase
        .from('internal_tasks')
        .select(`
            *,
            assignee:profiles!internal_tasks_user_id_fkey(first_name, last_name, color),
            creator:profiles!internal_tasks_created_by_fkey(first_name, last_name),
            clients(name),
            equipments(brand, model, serialNumber),
            internal_task_time_blocks(*)
        `)
        .eq('id', Number(id))
        .single();

    if (error || !task) throw new NotFoundError('Task not found');

    // Access control
    if (role !== UserRole.SUPER_ADMIN && task.user_id !== user.id && task.created_by !== user.id && task.is_private) {
        throw new ApiError(403, 'You do not have permission to view this private task');
    }

    res.json(task);
});

export const createTask = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;

    const task = await withTransaction(req, async (db) => {
        return await taskService.createFullTask(db, userId, req.body);
    });

    res.status(201).json(task);
});

export const updateTask = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const taskId = Number(req.params.id);
    const userId = req.user!.id;
    const role = req.user!.user_metadata.role;

    // Check ownership unless super_admin
    const { data: originalTask } = await supabase
        .from('internal_tasks')
        .select('user_id')
        .eq('id', taskId)
        .single();

    if (!originalTask) throw new NotFoundError('Task not found');
    if (role !== UserRole.SUPER_ADMIN && originalTask.user_id !== userId) {
        throw new ApiError(403, 'You can only update your own tasks');
    }

    const updatedTask = await withTransaction(req, async (db) => {
        return await taskService.updateFullTask(db, taskId, req.body);
    });

    res.json(updatedTask);
});

export const deleteTask = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const taskId = Number(req.params.id);
    const userId = req.user!.id;
    const role = req.user!.user_metadata.role;

    // Check ownership unless super_admin
    const { data: originalTask } = await supabase
        .from('internal_tasks')
        .select('user_id')
        .eq('id', taskId)
        .single();

    if (!originalTask) throw new NotFoundError('Task not found');
    if (role !== UserRole.SUPER_ADMIN && originalTask.user_id !== userId) {
        throw new ApiError(403, 'You can only delete your own tasks');
    }

    await withTransaction(req, async (db) => {
        await db.query('DELETE FROM internal_tasks WHERE id = $1', [taskId]);
    });

    res.status(204).send();
});
