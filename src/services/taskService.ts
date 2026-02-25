import { PoolClient } from 'pg';
import { InternalTask, InternalTaskTimeBlock } from '../types/supabase';
import { logger } from '../utils/logger';

/**
 * Syncs time blocks for an internal task and calculates total estimated hours.
 */
async function syncTimeBlocks(db: PoolClient, taskId: number, timeBlocks: { start_time: string; end_time: string }[]): Promise<number> {
    // Delete old blocks
    await db.query('DELETE FROM internal_task_time_blocks WHERE task_id = $1', [taskId]);

    let totalHours = 0;

    if (Array.isArray(timeBlocks) && timeBlocks.length > 0) {
        for (const tb of timeBlocks) {
            await db.query<InternalTaskTimeBlock>(
                'INSERT INTO internal_task_time_blocks (task_id, start_time, end_time) VALUES ($1, $2, $3)',
                [taskId, tb.start_time, tb.end_time]
            );

            // Calculate duration in hours
            const start = new Date(tb.start_time).getTime();
            const end = new Date(tb.end_time).getTime();
            if (end > start) {
                totalHours += (end - start) / (1000 * 60 * 60);
            }
        }
    }

    // Round to 2 decimal places
    const roundedHours = Math.round(totalHours * 100) / 100;

    // Update the task's estimated_hours
    await db.query('UPDATE internal_tasks SET estimated_hours = $1 WHERE id = $2', [roundedHours, taskId]);

    return roundedHours;
}

/**
 * Creates a full internal task with time blocks.
 */
export async function createFullTask(db: PoolClient, creatorId: string, data: any) {
    const {
        user_id, title, description, type, priority, client_id, equipment_id,
        is_private, show_on_calendar, timeBlocks
    } = data;

    const { rows } = await db.query<InternalTask>(
        `INSERT INTO internal_tasks (
            user_id, created_by, title, description, type, priority, 
            client_id, equipment_id, is_private, show_on_calendar
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
        RETURNING *`,
        [
            user_id || creatorId, // Assignee (defaults to creator)
            creatorId,           // Creator
            title,
            description,
            type || 'other',
            priority || 'medium',
            client_id || null,
            equipment_id || null,
            is_private !== undefined ? is_private : true,
            show_on_calendar || false
        ]
    );

    const task = rows[0];
    const taskId = task.id;

    if (timeBlocks && timeBlocks.length > 0) {
        task.estimated_hours = await syncTimeBlocks(db, taskId, timeBlocks);
    }

    return task;
}

/**
 * Updates a full internal task with time blocks.
 */
export async function updateFullTask(db: PoolClient, taskId: number, data: any) {
    const {
        user_id, title, description, type, priority, client_id, equipment_id,
        is_private, show_on_calendar, timeBlocks
    } = data;

    const { rows: updatedRows } = await db.query<InternalTask>(
        `UPDATE internal_tasks SET 
            user_id = $1, title = $2, description = $3, type = $4, priority = $5, 
            client_id = $6, equipment_id = $7, is_private = $8, show_on_calendar = $9
        WHERE id = $10 RETURNING *`,
        [
            user_id,
            title,
            description,
            type,
            priority,
            client_id || null,
            equipment_id || null,
            is_private !== undefined ? is_private : true,
            show_on_calendar || false,
            taskId
        ]
    );

    if (updatedRows.length === 0) throw new Error('Task not found');
    const task = updatedRows[0];

    if (timeBlocks) {
        task.estimated_hours = await syncTimeBlocks(db, taskId, timeBlocks);
    }

    return task;
}
