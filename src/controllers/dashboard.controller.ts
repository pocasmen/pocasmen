//Horas de desenvolvimento activo=12,0
import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { catchAsync } from '../utils/catchAsync';
import { ApiError } from '../utils/ApiError';
import { TicketStatus } from '../constants/enums';
import { Profile as DbProfile } from '../types/supabase';

export const getStats = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    let startDateParam = req.query.startDate as string;
    let endDateParam = req.query.endDate as string;
    let start: Date;
    let end: Date;

    if (startDateParam && endDateParam) {
        start = new Date(startDateParam);
        end = new Date(endDateParam);
    } else {
        const today = new Date();
        const day = today.getDay() || 7;
        start = new Date(today);
        start.setDate(today.getDate() - (day - 1));
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
    }

    const now = new Date();
    const [ticketsRes, weeklySchedulesRes, completedPendingRes, overduePendingRes, tasksRes] = await Promise.all([
        supabase.from('tickets').select('*'),
        supabase.from('schedules').select('*').gte('startDate', start.toISOString()).lte('startDate', end.toISOString()),
        supabase.from('schedules').select('*').gte('startDate', start.toISOString()).lte('startDate', end.toISOString()).eq('isCompleted', true).eq('hasReport', false),
        supabase.from('schedules').select('*').gte('startDate', start.toISOString()).lte('startDate', end.toISOString()).eq('isCompleted', false).eq('hasReport', false).lt('endDate', now.toISOString()),
        supabase.from('internal_tasks').select('*, internal_task_time_blocks(*)')
    ]);

    const tickets = ticketsRes.data || [];
    const weeklySchedules = weeklySchedulesRes.data || [];
    const completedPending = completedPendingRes.data || [];
    const overduePending = overduePendingRes.data || [];
    const allTasks = tasksRes.data || [];

    const ticketsStats = { open: 0, scheduled: 0, closed: 0 };
    tickets.forEach((t) => {
        if (t.status === TicketStatus.OPEN || t.status === TicketStatus.ACKNOWLEDGED) ticketsStats.open++;
        else if (t.status === TicketStatus.SCHEDULED) ticketsStats.scheduled++;
        else if (t.status === TicketStatus.CLOSED) ticketsStats.closed++;
    });

    const weeklyStats = { total: weeklySchedules.length, completed: 0, withReport: 0, overdue: 0 };
    weeklySchedules.forEach((s) => {
        if (s.hasReport) weeklyStats.withReport++;
        else if (s.isCompleted) weeklyStats.completed++;
        else if (s.endDate && new Date(s.endDate) < now) weeklyStats.overdue++;
    });

    // Task stats within range
    const rangeStart = start.getTime();
    const rangeEnd = end.getTime();
    
    const rangeTasks = allTasks.filter(t => {
        const createdAt = new Date(t.created_at).getTime();
        const blocks = t.internal_task_time_blocks || [];
        if (blocks.length > 0) {
            return blocks.some((b: any) => {
                const bStart = new Date(b.start_time).getTime();
                return bStart >= rangeStart && bStart <= rangeEnd;
            });
        }
        return createdAt >= rangeStart && createdAt <= rangeEnd;
    });

    const tasksStats = {
        total: rangeTasks.length,
        completed: rangeTasks.filter(t => t.completed).length,
        pending: rangeTasks.filter(t => !t.completed).length
    };

    res.json({
        tickets: ticketsStats,
        weekly: weeklyStats,
        overdue: weeklyStats.overdue,
        pendingReports: {
            total: completedPending.length + overduePending.length,
            completed: completedPending.length,
            overdue: overduePending.length
        },
        tasks: tasksStats
    });
});

export const getWeeklySchedules = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    let startDateParam = req.query.startDate as string;
    let endDateParam = req.query.endDate as string;
    let start: Date, end: Date;

    if (startDateParam && endDateParam) {
        start = new Date(startDateParam);
        end = new Date(endDateParam);
    } else {
        const today = new Date();
        const day = today.getDay() || 7;
        start = new Date(today);
        start.setDate(today.getDate() - (day - 1));
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
    }

    const { data: schedulesRaw, error } = await supabase
        .from('schedules')
        .select(`
            id, title, startDate, endDate, isCompleted, hasReport, clientId, equipmentId,
            clients(name), 
            schedule_technicians(technicianId)
        `)
        .gte('startDate', start.toISOString())
        .lte('startDate', end.toISOString())
        .order('startDate', { ascending: false });

    if (error) throw new ApiError(500, 'Failed to fetch weekly schedules', error.message);

    const technicianIds = [...new Set((schedulesRaw || []).flatMap((s: any) => (s.schedule_technicians || []).map((st: any) => st.technicianId)))];
    let techMap = new Map<string, string>();
    if (technicianIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', technicianIds);
        if (profiles) techMap = new Map((profiles as DbProfile[]).map(p => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]));
    }

    const result = (schedulesRaw || []).map((s: any) => ({
        id: s.id,
        title: s.title,
        startDate: s.startDate,
        endDate: s.endDate,
        isCompleted: !!s.isCompleted,
        hasReport: !!s.hasReport,
        clientId: s.clientId,
        equipmentId: s.equipmentId,
        clientName: s.clients?.name || (Array.isArray(s.clients) ? s.clients[0]?.name : 'Cliente Desconhecido'),
        technicians: (s.schedule_technicians || []).map((st: any) => ({
            id: st.technicianId,
            name: techMap.get(st.technicianId) || 'Técnico Desconhecido'
        })),
    }));

    res.json(result);
});

export const getPendingReports = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    let startDateParam = req.query.startDate as string;
    let endDateParam = req.query.endDate as string;
    let start: Date, end: Date;

    if (startDateParam && endDateParam) {
        start = new Date(startDateParam);
        end = new Date(endDateParam);
    } else {
        const today = new Date();
        start = new Date(today);
        start.setDate(today.getDate() - (today.getDay() || 7) + 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(start.getDate() + 4);
        end.setHours(23, 59, 59, 999);
    }

    const now = new Date().toISOString();
    const { data: schedulesRaw, error } = await supabase
        .from('schedules')
        .select(`
            id, title, startDate, endDate, isCompleted, hasReport, clientId, equipmentId,
            clients(name), 
            schedule_technicians(technicianId)
        `)
        .gte('startDate', start.toISOString())
        .lte('startDate', end.toISOString())
        .eq('hasReport', false)
        .or(`isCompleted.eq.true,and(isCompleted.eq.false,endDate.lt.${now})`)
        .order('endDate', { ascending: false });

    if (error) throw new ApiError(500, 'Failed to fetch pending reports', error.message);

    const technicianIds = [...new Set((schedulesRaw || []).flatMap((s: any) => (s.schedule_technicians || []).map((st: any) => st.technicianId)))];
    let techMap = new Map<string, string>();
    if (technicianIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', technicianIds);
        if (profiles) techMap = new Map((profiles as DbProfile[]).map(p => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]));
    }

    const result = (schedulesRaw || []).map((s: any) => ({
        ...s,
        clientName: s.clients?.name || (Array.isArray(s.clients) ? s.clients[0]?.name : 'Cliente Desconhecido'),
        technicians: (s.schedule_technicians || []).map((st: any) => ({
            id: st.technicianId,
            name: techMap.get(st.technicianId) || 'Técnico Desconhecido'
        })),
    }));

    res.json(result);
});
