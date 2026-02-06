import { Response } from 'express';
import { supabase, ATTACHMENTS_BUCKET } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { sendTelegramNotification } from '../services/telegramService';
import { catchAsync } from '../utils/catchAsync';
import { ApiError, ForbiddenError, NotFoundError, UnauthorizedError, BadRequestError } from '../utils/ApiError';
import { UserRole, TicketStatus } from '../constants/enums';

export const getMyEquipments = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const { data: profile } = await supabase.from('profiles').select('client_id').eq('id', req.user.id).single();
    if (!profile?.client_id) throw new NotFoundError('Client profile not found.');

    const { data, error } = await supabase
        .from('equipments')
        .select('id, brand, model, serialNumber, clientId')
        .eq('clientId', profile.client_id)
        .order('id', { ascending: true });

    if (error) throw new ApiError(500, 'Failed to fetch equipments', error.message);
    res.json(data ?? []);
});

export const getMyTickets = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const { data: profile } = await supabase.from('profiles').select('client_id').eq('id', req.user.id).single();
    if (!profile?.client_id) throw new NotFoundError('Client profile not found.');

    const { data: tickets, error: ticketsError } = await supabase
        .from('tickets')
        .select('id, createdAt, updatedAt, faultDescription, status, scheduleId, client_id, equipmentId')
        .eq('client_id', profile.client_id)
        .order('createdAt', { ascending: false });

    if (ticketsError) throw new ApiError(500, 'Failed to fetch tickets', ticketsError.message);

    const equipmentIds = [...new Set((tickets || []).map(t => t.equipmentId).filter(Boolean))] as number[];
    const scheduleIds = [...new Set((tickets || []).map(t => t.scheduleId).filter(Boolean))] as number[];

    let equipmentMap = new Map();
    if (equipmentIds.length > 0) {
        const { data: equipments } = await supabase.from('equipments').select('id, brand, model, serialNumber').in('id', equipmentIds);
        if (equipments) equipmentMap = new Map(equipments.map(e => [e.id, e]));
    }

    let scheduleMap = new Map();
    if (scheduleIds.length > 0) {
        const { data: schedules } = await supabase.from('schedules').select('id, startDate, endDate, hasReport').in('id', scheduleIds);
        if (schedules) scheduleMap = new Map(schedules.map(s => [s.id, s]));
    }

    const result = (tickets || []).map(t => {
        const e = equipmentMap.get(t.equipmentId);
        const s = scheduleMap.get(t.scheduleId);
        return {
            ...t,
            equipmentInfo: e ? `${e.brand || ''} ${e.model || ''}${e.serialNumber ? ` (${e.serialNumber})` : ''}`.trim() : 'Equipamento Desconhecido',
            startDate: s?.startDate,
            endDate: s?.endDate,
            hasReport: s?.hasReport,
        };
    });

    res.json(result);
});

export const getMySchedules = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const { data: profile } = await supabase.from('profiles').select('client_id').eq('id', req.user.id).single();
    if (!profile?.client_id) throw new NotFoundError('Client profile not found.');

    const { data: schedules, error: schedulesError } = await supabase
        .from('schedules')
        .select('id, title, startDate, endDate, isCompleted, hasReport, clients(name), schedule_technicians(technicianId)')
        .eq('clientId', profile.client_id)
        .order('startDate', { ascending: false });

    if (schedulesError) throw new ApiError(500, 'Failed to fetch schedules', schedulesError.message);
    if (!schedules) return res.json([]);

    const technicianIds = [...new Set(schedules.flatMap(s => s.schedule_technicians?.map((st: any) => st.technicianId) || []))];
    let technicianMap = new Map();
    if (technicianIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name').in('id', technicianIds);
        if (profiles) technicianMap = new Map(profiles.map(p => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]));
    }

    const result = schedules.map(s => ({
        id: s.id,
        title: s.title,
        startDate: s.startDate,
        endDate: s.endDate,
        isCompleted: s.isCompleted,
        hasReport: s.hasReport,
        clientName: Array.isArray(s.clients) ? (s.clients[0] as any)?.name : (s.clients as any)?.name || 'Cliente Desconhecido',
        technicians: s.schedule_technicians?.map((st: any) => technicianMap.get(st.technicianId) || 'Técnico Desconhecido') || [],
    }));

    res.json(result);
});

export const createMyTicket = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const { equipmentId, title, faultDescription } = req.body;

    const { data: profile } = await supabase.from('profiles').select('id, client_id').eq('id', req.user.id).single();
    if (!profile?.client_id) throw new NotFoundError('Client profile not found.');

    const { data: equipment } = await supabase.from('equipments').select('clientId').eq('id', equipmentId).single();
    if (!equipment || equipment.clientId !== profile.client_id) throw new ForbiddenError('Permission denied for this equipment.');

    const { data: ticket, error } = await supabase
        .from('tickets')
        .insert({ client_id: profile.client_id, equipmentId, title, faultDescription, status: TicketStatus.OPEN, created_by_user_id: profile.id })
        .select().single();

    if (error) throw new ApiError(500, 'Failed to create ticket', error.message);

    // Telegram Notification
    const { data: clientData } = await supabase.from('clients').select('name').eq('id', profile.client_id).single();
    const { data: equipData } = await supabase.from('equipments').select('brand, model').eq('id', equipmentId).single();
    const telegramMessage = `🆕 *Novo Ticket Aberto*\n\n*Título:* ${title}\n*Cliente:* ${clientData?.name || 'Cliente'}\n*Equipamento:* ${equipData ? `${equipData.brand} ${equipData.model}` : '?'}\n*Descrição:* ${faultDescription}`;
    sendTelegramNotification(telegramMessage);

    res.status(201).json(ticket);
});

export const getMyReportBySchedule = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const scheduleId = Number(req.params.id);
    const { data: profile } = await supabase.from('profiles').select('client_id').eq('id', req.user.id).single();
    if (!profile?.client_id) throw new NotFoundError('Client profile not found.');

    const { data: report, error } = await supabase.from('reports').select('*').eq('scheduleId', scheduleId).single();
    if (error || !report) throw new NotFoundError('Report not found.');
    if (report.clientId !== profile.client_id) throw new ForbiddenError('Forbidden.');

    const [clientRes, equipmentRes, techRes, timeBlocksRes, partsRes] = await Promise.all([
        supabase.from('clients').select('name, address, nif').eq('id', report.clientId).single(),
        supabase.from('equipments').select('brand, model, serialNumber').eq('id', report.equipmentId).single(),
        supabase.from('report_technicians').select('technicianId').eq('reportId', report.id),
        supabase.from('schedule_time_blocks').select('start_time, end_time').eq('schedule_id', scheduleId),
        supabase.from('report_parts').select('partId, quantity, stock_type, parts(id, reference, designation)').eq('reportId', report.id)
    ]);

    let technicians: any[] = [];
    if (techRes.data) {
        const techIds = techRes.data.map(rt => rt.technicianId);
        const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, color').in('id', techIds);
        if (profiles) technicians = profiles.map(p => ({ id: p.id, name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), color: p.color }));
    }

    const parts = (partsRes.data || []).map((rp: any) => ({
        id: rp.parts.id,
        reference: rp.parts.reference,
        designation: rp.parts.designation,
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
        timeBlocks: timeBlocksRes.data?.map(tb => ({ start: tb.start_time, end: tb.end_time })) || []
    });
});

export const getMyTicketById = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const ticketId = Number(req.params.id);
    const { data: profile } = await supabase.from('profiles').select('client_id').eq('id', req.user.id).single();
    if (!profile?.client_id) throw new NotFoundError('Client profile not found.');

    const { data: ticket, error } = await supabase.from('tickets').select('*').eq('id', ticketId).single();
    if (error || !ticket) throw new NotFoundError('Ticket not found.');
    if (ticket.client_id !== profile.client_id) throw new ForbiddenError('Forbidden.');

    const [clientRes, equipmentRes, responsesRes] = await Promise.all([
        supabase.from('clients').select('name').eq('id', ticket.client_id).single(),
        supabase.from('equipments').select('brand, model, serialNumber').eq('id', ticket.equipmentId).single(),
        supabase.from('ticket_responses').select('id, user_id, message, created_at, isNew').eq('ticket_id', ticketId).order('created_at', { ascending: true })
    ]);

    const authorIds = [...new Set(responsesRes.data?.map(r => r.user_id).filter(Boolean) || [])];
    let authorMap = new Map();
    if (authorIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, role').in('id', authorIds);
        if (profiles) authorMap = new Map(profiles.map(p => [p.id, { name: `${p.first_name} ${p.last_name}`.trim(), role: p.role }]));
    }

    const resps = responsesRes.data?.map(r => ({
        ...r,
        authorName: authorMap.get(r.user_id)?.name || 'Utilizador',
        role: authorMap.get(r.user_id)?.role || UserRole.CLIENT
    }));

    // Mark as read
    await supabase.from('ticket_responses').update({ isNew: false }).eq('ticket_id', ticketId).neq('user_id', req.user.id).eq('isNew', true);

    res.json({
        ...ticket,
        clientName: clientRes.data?.name,
        equipmentInfo: equipmentRes.data ? `${equipmentRes.data.brand} ${equipmentRes.data.model} (${equipmentRes.data.serialNumber})` : '?',
        responses: resps || []
    });
});

export const replyToMyTicket = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const ticketId = Number(req.params.id);
    const { message } = req.body;

    const { data: profile } = await supabase.from('profiles').select('client_id').eq('id', req.user.id).single();
    const { data: ticket } = await supabase.from('tickets').select('client_id').eq('id', ticketId).single();
    if (!ticket || ticket.client_id !== profile?.client_id) throw new ForbiddenError('Forbidden.');

    await supabase.from('tickets').update({ updatedAt: new Date().toISOString() }).eq('id', ticketId);
    const { data: response, error } = await supabase.from('ticket_responses').insert({ ticket_id: ticketId, user_id: req.user.id, message: message.trim(), isNew: false }).select().single();
    if (error) throw new ApiError(500, 'Failed to save reply', error.message);

    res.json(response);
});

export const markTicketAsRead = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const { error } = await supabase.from('ticket_responses').update({ isNew: false }).eq('ticket_id', req.params.id).neq('user_id', req.user.id).eq('isNew', true);
    if (error) throw new ApiError(500, 'Error marking as read', error.message);
    res.status(200).send('Marked as read');
});
