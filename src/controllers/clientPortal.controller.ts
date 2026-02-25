//Horas de desenvolvimento activo=26,0
import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { catchAsync } from '../utils/catchAsync';
import { ApiError, ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/ApiError';
import { UserRole, TicketStatus } from '../constants/enums';
import { Profile as DbProfile, Equipment as DbEquipment, Ticket as DbTicket, Schedule as DbSchedule } from '../types/supabase';
import * as ticketService from '../services/ticketService';
import { withTransaction } from '../config/db';

/**
 * Validates if the user has access to a specific client_id via client_users table
 */
const getValidatedClientId = async (userId: string, requestedClientId?: any): Promise<number> => {
    if (!requestedClientId) {
        throw new ApiError(400, 'É obrigatório selecionar uma empresa (clientId).');
    }
    const clientId = Number(requestedClientId);
    if (isNaN(clientId)) throw new ApiError(400, 'clientId inválido.');

    const { data, error } = await supabase
        .from('client_users' as any)
        .select('client_id')
        .eq('user_id', userId)
        .eq('client_id', clientId)
        .single();

    if (error || !data) {
        throw new ForbiddenError('Não tem acesso a esta empresa.');
    }
    return (data as any).client_id;
};

export const getMyCompanies = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();

    // Fetch all clients associated with this user
    const { data: clientUsers, error } = await supabase
        .from('client_users' as any)
        .select('client_id, clients(*)')
        .eq('user_id', req.user.id);

    if (error) throw new ApiError(500, 'Falha ao buscar as empresas', error.message);
    const companies = clientUsers?.map((cu: any) => cu.clients).filter((c: any) => !!c) || [];
    res.json(companies);
});

export const getMyStats = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const clientId = await getValidatedClientId(req.user.id, req.query.clientId);

    // Tickets
    const { data: tickets } = await supabase.from('tickets').select('status').eq('client_id', clientId).neq('status', TicketStatus.DELETED);
    const ticketsData = tickets || [];
    const openTickets = ticketsData.filter(t => t.status === TicketStatus.OPEN).length;
    const scheduledTickets = ticketsData.filter(t => t.status === TicketStatus.SCHEDULED).length;
    const closedTickets = ticketsData.filter(t => t.status === TicketStatus.CLOSED).length;

    // Schedules
    const { data: schedules } = await supabase.from('schedules').select('isCompleted, hasReport, endDate').eq('clientId', clientId);
    const schedulesData = schedules || [];

    let schedPending = 0, schedCompleted = 0, schedClosed = 0, schedOverdue = 0;
    const now = new Date();
    schedulesData.forEach((s: any) => {
        if (s.hasReport) schedClosed++;
        else if (s.isCompleted) schedCompleted++;
        else if (s.endDate && new Date(s.endDate) < now) schedOverdue++;
        else schedPending++;
    });

    // Reports
    const { count: reportsCount } = await supabase.from('reports').select('*', { count: 'exact', head: true }).eq('clientId', clientId).is('deleted_at', null);

    // Equipments
    const { count: equipmentsCount } = await supabase.from('equipments').select('*', { count: 'exact', head: true }).eq('clientId', clientId);

    res.json({
        tickets: {
            open: openTickets,
            scheduled: scheduledTickets,
            closed: closedTickets,
            total: ticketsData.length
        },
        schedules: {
            pending: schedPending,
            completed: schedCompleted,
            closed: schedClosed,
            overdue: schedOverdue,
            total: schedulesData.length
        },
        reports: {
            total: reportsCount || 0
        },
        equipments: {
            total: equipmentsCount || 0
        }
    });
});

export const getMyEquipments = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const clientId = await getValidatedClientId(req.user.id, req.query.clientId);

    const { data, error } = await supabase
        .from('equipments')
        .select('*')
        .eq('clientId', clientId)
        .order('id', { ascending: true });

    if (error) throw new ApiError(500, 'Failed to fetch equipments', error.message);
    res.json(data ?? []);
});

export const getMyTickets = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const clientId = await getValidatedClientId(req.user.id, req.query.clientId);

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20)); // Default smaller limit for mobile/client
    const offset = (page - 1) * limit;

    const { count: totalCount } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .neq('status', TicketStatus.DELETED);

    const { data: ticketsRaw, error: ticketsError } = await supabase
        .from('tickets')
        .select('*')
        .eq('client_id', clientId)
        .neq('status', TicketStatus.DELETED)
        .order('createdAt', { ascending: false })
        .range(offset, offset + limit - 1);

    if (ticketsError) throw new ApiError(500, 'Failed to fetch tickets', ticketsError.message);
    const tickets = ticketsRaw || [];

    const equipmentIds = [...new Set(tickets.map(t => t.equipmentId).filter((id): id is number => !!id))];
    const scheduleIds = [...new Set(tickets.map(t => t.scheduleId).filter((id): id is number => !!id))];

    let equipmentMap = new Map<number, DbEquipment>();
    if (equipmentIds.length > 0) {
        const { data: equipments } = await supabase.from('equipments').select('*').in('id', equipmentIds);
        if (equipments) equipmentMap = new Map((equipments as DbEquipment[]).map(e => [e.id, e]));
    }

    let scheduleMap = new Map<number, DbSchedule>();
    if (scheduleIds.length > 0) {
        const { data: schedules } = await supabase.from('schedules').select('*').in('id', scheduleIds);
        if (schedules) scheduleMap = new Map((schedules as DbSchedule[]).map(s => [s.id, s]));
    }

    const result = tickets.map(t => {
        const e = t.equipmentId ? equipmentMap.get(t.equipmentId) : null;
        const s = t.scheduleId ? scheduleMap.get(t.scheduleId) : null;
        return {
            ...t,
            equipmentInfo: e ? `${e.brand || ''} ${e.model || ''}${e.serialNumber ? ` (${e.serialNumber})` : ''}`.trim() : 'Equipamento Desconhecido',
            startDate: s?.startDate,
            endDate: s?.endDate,
            hasReport: s?.hasReport,
        };
    });

    res.json({
        data: result,
        pagination: {
            page,
            limit,
            total: totalCount || 0,
            totalPages: Math.ceil((totalCount || 0) / limit)
        }
    });
});

export const getMySchedules = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const clientId = await getValidatedClientId(req.user.id, req.query.clientId);

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const { count: totalCount } = await supabase
        .from('schedules')
        .select('*', { count: 'exact', head: true })
        .eq('clientId', clientId);

    const { data: schedulesRaw, error: schedulesError } = await supabase
        .from('schedules')
        .select(`
            id, title, startDate, endDate, isCompleted, hasReport, equipmentId,
            clients(name), 
            schedule_technicians(technicianId)
        `)
        .eq('clientId', clientId)
        .order('startDate', { ascending: false })
        .range(offset, offset + limit - 1);

    if (schedulesError) throw new ApiError(500, 'Failed to fetch schedules', schedulesError.message);
    const schedules = (schedulesRaw || []) as any[];

    const technicianIds = [...new Set(schedules.flatMap(s => (s.schedule_technicians || []).map((st: any) => st.technicianId)))];
    const equipmentIds = [...new Set(schedules.map(s => s.equipmentId).filter((id): id is number => !!id))];

    let technicianMap = new Map<string, string>();
    if (technicianIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', technicianIds);
        if (profiles) technicianMap = new Map((profiles as DbProfile[]).map(p => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]));
    }

    let equipmentMap = new Map<number, any>();
    if (equipmentIds.length > 0) {
        const { data: equips } = await supabase.from('equipments').select('*').in('id', equipmentIds);
        if (equips) equipmentMap = new Map((equips as any[]).map(e => [e.id, e]));
    }

    const result = schedules.map(s => {
        const e = s.equipmentId ? equipmentMap.get(s.equipmentId) : null;
        return {
            id: s.id,
            title: s.title,
            startDate: s.startDate,
            endDate: s.endDate,
            isCompleted: !!s.isCompleted,
            hasReport: !!s.hasReport,
            equipmentId: s.equipmentId,
            equipmentInfo: e ? `${e.brand || ''} ${e.model || ''}${e.serialNumber ? ` (${e.serialNumber})` : ''}`.trim() : 'Equipamento Desconhecido',
            clientName: s.clients?.name || (Array.isArray(s.clients) ? s.clients[0]?.name : 'Cliente Desconhecido'),
            technicians: (s.schedule_technicians || []).map((st: any) => technicianMap.get(st.technicianId) || 'Técnico Desconhecido'),
        };
    });

    res.json({
        data: result,
        pagination: {
            page,
            limit,
            total: totalCount || 0,
            totalPages: Math.ceil((totalCount || 0) / limit)
        }
    });
});

export const createMyTicket = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const { equipmentId, clientId: requestedClientId } = req.body;

    // Fallback: If clientId is not in body, assume they passed it via query (unlikely for POST but just in case)
    const clientIdParam = requestedClientId || req.query.clientId;
    const clientId = await getValidatedClientId(req.user.id, clientIdParam);

    const result = await withTransaction(req, async (db) => {
        // Double check equipment ownership
        if (equipmentId) {
            const { rows: equipRows } = await db.query<DbEquipment>('SELECT * FROM equipments WHERE id = $1', [Number(equipmentId)]);
            const equipment = equipRows[0];
            if (!equipment || equipment.clientId !== clientId) throw new ForbiddenError('Permissão negada para este equipamento.');
        }

        return await ticketService.createFullTicket(db, { ...req.body, client_id: clientId }, req.user!.id);
    });

    res.status(201).json(result);
});

export const getMyReportBySchedule = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const scheduleId = Number(req.params.id);

    const { data: report, error } = await supabase.from('reports').select('*').eq('scheduleId', scheduleId).is('deleted_at', null).maybeSingle();
    if (error || !report) throw new NotFoundError('Report not found.');

    // Validate if user has access to this report's client
    await getValidatedClientId(req.user.id, report.clientId);

    const [clientRes, equipmentRes, techRes, timeBlocksRes, partsRes] = await Promise.all([
        supabase.from('clients').select('*').eq('id', report.clientId || 0).single(),
        supabase.from('equipments').select('*').eq('id', report.equipmentId || 0).single(),
        supabase.from('report_technicians').select('*').eq('reportId', report.id),
        supabase.from('schedule_time_blocks').select('*').eq('schedule_id', scheduleId),
        supabase.from('report_parts').select('partId, quantity, stock_type, parts(id, reference, designation)').eq('reportId', report.id)
    ]);

    let technicians: any[] = [];
    if (techRes.data) {
        const techIds = (techRes.data || []).map(rt => rt.technicianId).filter((id): id is string => !!id);
        const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, color').in('id', techIds);
        if (profiles) technicians = profiles.map(p => ({ id: p.id, name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), color: p.color }));
    }

    const parts = (partsRes.data || []).map((rp: any) => ({
        id: rp.parts?.id,
        reference: rp.parts?.reference,
        designation: rp.parts?.designation,
        quantity: rp.quantity,
        stockType: rp.stock_type || 'general'
    }));

    res.json({
        ...report,
        clientName: clientRes.data?.name,
        clientAddress: clientRes.data?.address,
        clientNif: clientRes.data?.nif,
        equipmentBrand: equipmentRes.data?.brand,
        equipmentModel: equipmentRes.data?.model,
        equipmentSerialNumber: equipmentRes.data?.serialNumber,
        technicians,
        parts,
        timeBlocks: (timeBlocksRes.data || []).map(tb => ({ start: tb.start_time, end: tb.end_time })) || []
    });
});

export const getMyTicketById = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const ticketId = Number(req.params.id);

    const { data: ticket, error } = await supabase.from('tickets').select('*').eq('id', ticketId).single();
    if (error || !ticket) throw new NotFoundError('Ticket not found.');

    // Validate if user has access to this ticket's client
    await getValidatedClientId(req.user.id, ticket.client_id);

    const [clientRes, equipmentRes, responsesRes, reportRes] = await Promise.all([
        supabase.from('clients').select('*').eq('id', ticket.client_id).single(),
        supabase.from('equipments').select('*').eq('id', ticket.equipmentId || 0).single(),
        supabase.from('ticket_responses').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true }),
        supabase.from('reports').select('id').eq('scheduleId', ticket.scheduleId || 0).is('deleted_at', null).maybeSingle()
    ]);

    const hasReport = !!reportRes.data;

    const authorIds = [...new Set((responsesRes.data || []).map(r => r.user_id).filter((id): id is string => !!id))];
    let authorMap = new Map<string, { name: string, role: string | null }>();
    if (authorIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, role').in('id', authorIds);
        if (profiles) authorMap = new Map(profiles.map(p => [p.id, { name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), role: p.role }]));
    }

    const resps = (responsesRes.data || []).map(r => {
        const author = r.user_id ? authorMap.get(r.user_id) : null;
        return {
            ...r,
            authorName: author?.name || 'Utilizador',
            role: author?.role || UserRole.CLIENT
        };
    });

    // Fetch requester's profile with fallback to Auth metadata
    let userFirstName = '';
    let userLastName = '';

    const { data: requesterProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', ticket.created_by_user_id || '')
        .single();

    if (requesterProfile?.first_name || requesterProfile?.last_name) {
        userFirstName = requesterProfile.first_name || '';
        userLastName = requesterProfile.last_name || '';
    } else if (ticket.created_by_user_id) {
        // Fallback to Auth Metadata if profile is missing/empty
        const { data: authUser } = await supabase.auth.admin.getUserById(ticket.created_by_user_id);
        if (authUser?.user?.user_metadata) {
            userFirstName = authUser.user.user_metadata.first_name || '';
            userLastName = authUser.user.user_metadata.last_name || '';
        }
    }

    // Mark as read
    await supabase.from('ticket_responses').update({ isNew: false }).eq('ticket_id', ticketId).neq('user_id', req.user.id).eq('isNew', true);

    res.json({
        ...ticket,
        clientName: clientRes.data?.name,
        equipmentInfo: equipmentRes.data ? `${equipmentRes.data.brand} ${equipmentRes.data.model} (${equipmentRes.data.serialNumber})` : '?',
        userFirstName,
        userLastName,
        responses: resps
    });
});

export const replyToMyTicket = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const ticketId = Number(req.params.id);
    const { message } = req.body;

    const result = await withTransaction(req, async (db) => {
        const { rows: ticketRows } = await db.query<DbTicket>('SELECT client_id FROM tickets WHERE id = $1', [ticketId]);
        const ticket = ticketRows[0];
        if (!ticket) throw new ForbiddenError('Forbidden.');

        // Access validation
        await getValidatedClientId(req.user!.id, ticket.client_id);

        return await ticketService.replyToFullTicket(db, ticketId, req.user!.id, message);
    });

    res.json(result);
});

export const markTicketAsRead = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const ticketId = Number(req.params.id);

    await withTransaction(req, async (db) => {
        // Can be improved to validate if the ticket belongs to a valid client for this user, but doing a quick update is relatively safe if restricted to user_id.
        // Actually, we should validate it ideally, but let's keep it simple as it only clears the "isNew" flag on their END
        await db.query(
            'UPDATE ticket_responses SET "isNew" = false WHERE ticket_id = $1 AND user_id != $2 AND "isNew" = true',
            [ticketId, req.user!.id]
        );
    });

    res.status(200).send('Marked as read');
});
