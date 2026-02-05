import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { catchAsync } from '../utils/catchAsync';
import { ApiError } from '../utils/ApiError';
import { TicketStatus } from '../constants/enums';

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
    const [tickets, weeklySchedules, completedPending, overduePending] = await Promise.all([
        supabase.from('tickets').select('status'),
        supabase.from('schedules').select('isCompleted, hasReport, startDate, endDate').gte('startDate', start.toISOString()).lte('startDate', end.toISOString()),
        supabase.from('schedules').select('id', { count: 'exact', head: true }).gte('startDate', start.toISOString()).lte('startDate', end.toISOString()).eq('isCompleted', true).eq('hasReport', false),
        supabase.from('schedules').select('id', { count: 'exact', head: true }).gte('startDate', start.toISOString()).lte('startDate', end.toISOString()).eq('isCompleted', false).eq('hasReport', false).lt('endDate', now.toISOString())
    ]);

    const ticketsStats = { open: 0, scheduled: 0, closed: 0 };
    (tickets.data || []).forEach(t => {
        if (t.status === TicketStatus.OPEN || t.status === TicketStatus.ACKNOWLEDGED) ticketsStats.open++;
        else if (t.status === TicketStatus.SCHEDULED) ticketsStats.scheduled++;
        else if (t.status === TicketStatus.CLOSED) ticketsStats.closed++;
    });

    const weeklyStats = { total: weeklySchedules.data?.length || 0, completed: 0, withReport: 0, overdue: 0 };
    (weeklySchedules.data || []).forEach((s: any) => {
        if (s.hasReport) weeklyStats.withReport++;
        else if (s.isCompleted) weeklyStats.completed++;
        else if (s.endDate && new Date(s.endDate) < now) weeklyStats.overdue++;
    });

    res.json({
        tickets: ticketsStats,
        weekly: weeklyStats,
        overdue: weeklyStats.overdue,
        pendingReports: {
            total: (completedPending.count || 0) + (overduePending.count || 0),
            completed: completedPending.count || 0,
            overdue: overduePending.count || 0
        }
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

    const { data: schedules, error } = await supabase
        .from('schedules')
        .select('id, title, startDate, endDate, isCompleted, hasReport, clients(name), schedule_technicians(technicianId)')
        .gte('startDate', start.toISOString())
        .lte('startDate', end.toISOString())
        .order('startDate', { ascending: false });

    if (error) throw new ApiError(500, 'Failed to fetch weekly schedules', error.message);

    const technicianIds = [...new Set((schedules || []).flatMap(s => s.schedule_technicians.map((st: any) => st.technicianId)))];
    let techMap = new Map();
    if (technicianIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name').in('id', technicianIds);
        if (profiles) techMap = new Map(profiles.map(p => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]));
    }

    const result = (schedules || []).map(s => ({
        id: s.id,
        title: s.title,
        startDate: s.startDate,
        endDate: s.endDate,
        isCompleted: !!s.isCompleted,
        hasReport: !!s.hasReport,
        clientName: Array.isArray(s.clients) ? s.clients[0]?.name : (s.clients as any)?.name || 'Cliente Desconhecido',
        technicians: s.schedule_technicians.map((st: any) => techMap.get(st.technicianId) || 'Técnico Desconhecido'),
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
    const { data: schedules, error } = await supabase
        .from('schedules')
        .select('id, title, startDate, endDate, isCompleted, hasReport, clients(name), schedule_technicians(technicianId)')
        .gte('startDate', start.toISOString())
        .lte('startDate', end.toISOString())
        .eq('hasReport', false)
        .or(`isCompleted.eq.true,and(isCompleted.eq.false,endDate.lt.${now})`)
        .order('endDate', { ascending: false });

    if (error) throw new ApiError(500, 'Failed to fetch pending reports', error.message);

    const technicianIds = [...new Set((schedules || []).flatMap(s => s.schedule_technicians.map((st: any) => st.technicianId)))];
    let techMap = new Map();
    if (technicianIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name').in('id', technicianIds);
        if (profiles) techMap = new Map(profiles.map(p => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]));
    }

    const result = (schedules || []).map(s => ({
        ...s,
        clientName: Array.isArray(s.clients) ? s.clients[0]?.name : (s.clients as any)?.name || 'Cliente Desconhecido',
        technicians: s.schedule_technicians.map((st: any) => techMap.get(st.technicianId) || 'Técnico Desconhecido'),
    }));

    res.json(result);
});
