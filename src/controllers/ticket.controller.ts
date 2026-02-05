import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { ATTACHMENTS_BUCKET } from '../config/supabase';
import { catchAsync } from '../utils/catchAsync';
import { ApiError, BadRequestError, NotFoundError, UnauthorizedError } from '../utils/ApiError';
import { Ticket, Client, Equipment, Profile, TicketStatus, UserRole } from '../types';
import { sendTelegramNotification } from '../services/telegramService';

export const getTickets = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const status = (req.query.status as string) || TicketStatus.OPEN;
    const { data: tickets, error: ticketsError } = await supabase
        .from('tickets')
        .select('id, createdAt, updatedAt, faultDescription, status, scheduleId, client_id, equipmentId')
        .eq('status', status)
        .order('createdAt', { ascending: false });

    if (ticketsError) throw new ApiError(500, 'Failed to fetch tickets', ticketsError.message);

    const clientIds = [...new Set((tickets || []).map(t => t.client_id).filter(Boolean))] as number[];
    const equipmentIds = [...new Set((tickets || []).map(t => t.equipmentId).filter(Boolean))] as number[];

    let clientMap = new Map<number, string>();
    if (clientIds.length > 0) {
        const { data: clients, error: clientsError } = await supabase
            .from('clients')
            .select('id, name')
            .in('id', clientIds);
        if (!clientsError && clients) {
            clientMap = new Map(clients.map((c: any) => [c.id as number, c.name as string]));
        }
    }

    let equipmentMap = new Map<number, { brand?: string; model?: string; serialNumber?: string }>();
    if (equipmentIds.length > 0) {
        const { data: equipments, error: equipmentsError } = await supabase
            .from('equipments')
            .select('id, brand, model, serialNumber')
            .in('id', equipmentIds);
        if (!equipmentsError && equipments) {
            equipmentMap = new Map(equipments.map((e: any) => [e.id as number, { brand: e.brand, model: e.model, serialNumber: e.serialNumber }]));
        }
    }

    const result = (tickets || []).map(t => {
        const clientName = clientMap.get(t.client_id as number) || 'Cliente Desconhecido';
        const e = equipmentMap.get(t.equipmentId as number);
        const equipmentInfo = e ? `${e.brand || ''} ${e.model || ''}${e.serialNumber ? ` (${e.serialNumber})` : ''}`.trim() : 'Equipamento Desconhecido';
        return {
            id: t.id,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            faultDescription: t.faultDescription,
            status: t.status,
            scheduleId: t.scheduleId,
            client_id: t.client_id,
            equipmentId: t.equipmentId,
            clientName,
            equipmentInfo,
        };
    });

    res.json(result);
});

export const getTicketById = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const ticketId = Number(req.params.id);
    if (!ticketId || Number.isNaN(ticketId)) throw new BadRequestError('Invalid ticket id');

    const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('id, createdAt, updatedAt, title, faultDescription, status, scheduleId, client_id, equipmentId, created_by_user_id')
        .eq('id', ticketId)
        .single();
    if (ticketError) throw new ApiError(500, 'Failed to fetch ticket', ticketError.message);
    if (!ticket) throw new NotFoundError('Ticket not found');

    let clientName = 'Cliente Desconhecido';
    {
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id, name')
            .eq('id', ticket.client_id)
            .single();
        if (!clientError && client) {
            clientName = (client as any).name || clientName;
        }
    }

    let equipmentInfo = 'Equipamento Desconhecido';
    {
        const { data: equipment, error: equipmentError } = await supabase
            .from('equipments')
            .select('id, brand, model, serialNumber')
            .eq('id', ticket.equipmentId)
            .single();
        if (!equipmentError && equipment) {
            equipmentInfo = `${(equipment as any).brand || ''} ${(equipment as any).model || ''}${(equipment as any).serialNumber ? ` (${(equipment as any).serialNumber})` : ''}`.trim();
        }
    }

    let userFirstName = '';
    let userLastName = '';
    {
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', ticket.created_by_user_id)
            .single();
        if (userProfile) {
            userFirstName = (userProfile as any).first_name || '';
            userLastName = (userProfile as any).last_name || '';
        }
    }

    const { data: attachments, error: attachError } = await supabase
        .from('ticket_attachments')
        .select('id, ticket_id, file_name, mime_type, storage_path, uploaded_by_user_id, created_at')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false });
    if (attachError) throw new ApiError(500, 'Failed to fetch attachments', attachError.message);
    const bucket = ATTACHMENTS_BUCKET;
    const enriched = await Promise.all((attachments || []).map(async att => {
        const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(att.storage_path, 3600);
        return { ...att, url: signed?.signedUrl || '' };
    }));

    let responses: any[] = [];
    {
        const { data, error } = await supabase
            .from('ticket_responses')
            .select('id, ticket_id, user_id, message, created_at, isNew, profiles(role)')
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true });
        if (error) {
            const { data: legacyData, error: legacyErr } = await supabase
                .from('ticket_responses')
                .select('id, ticket_id, user_id, message, created_at')
                .eq('ticket_id', ticketId)
                .order('created_at', { ascending: true });
            if (legacyErr) throw new ApiError(500, 'Failed to fetch responses', legacyErr.message);
            responses = legacyData || [];
        } else {
            responses = data || [];
        }
    }

    const authorIds = [...new Set((responses || []).map((r: any) => r.user_id).filter(Boolean))];
    let authorMap = new Map<string, { name: string; role: string }>();
    if (authorIds.length > 0) {
        const { data: profilesList, error: profErr } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, role')
            .in('id', authorIds);
        if (!profErr && profilesList) {
            authorMap = new Map(profilesList.map((p: any) => [p.id, { name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), role: p.role || UserRole.CLIENT }]));
        }
    }

    const responsesEnriched = (responses || []).map((r: any) => ({
        ...r,
        authorName: authorMap.get(r.user_id)?.name || 'Utilizador',
        role: authorMap.get(r.user_id)?.role || UserRole.CLIENT
    }));

    res.json({
        ...ticket,
        clientName,
        equipmentInfo,
        userFirstName,
        userLastName,
        attachments: enriched,
        responses: responsesEnriched,
    });
});

export const createTicket = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const { client_id, equipmentId, title, faultDescription, status } = req.body;

    const { data: ticket, error } = await supabase
        .from('tickets')
        .insert({
            client_id,
            equipmentId,
            title,
            faultDescription,
            status: status || TicketStatus.OPEN,
            created_by_user_id: req.user.id
        })
        .select().single();

    if (error) throw new ApiError(500, 'Failed to create ticket', error.message);

    // Telegram Notification
    const { data: clientData } = await supabase.from('clients').select('name').eq('id', client_id).single();
    const { data: equipData } = await supabase.from('equipments').select('brand, model').eq('id', equipmentId).single();
    const telegramMessage = `🆕 *Novo Ticket Criado (Interno)*\n\n*Título:* ${title}\n*Cliente:* ${clientData?.name || 'Cliente'}\n*Equipamento:* ${equipData ? `${equipData.brand} ${equipData.model}` : '?'}\n*Descrição:* ${faultDescription}`;
    sendTelegramNotification(telegramMessage);

    res.status(201).json(ticket);
});

export const replyToTicket = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const ticketId = Number(req.params.id);
    const { message } = req.body as { message?: string };

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('id', req.user.id)
        .single();
    if (profileError) throw new ApiError(500, 'Failed to fetch user profile', profileError.message);

    const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('id, faultDescription')
        .eq('id', ticketId)
        .single();
    if (ticketError) throw new ApiError(500, 'Failed to fetch ticket', ticketError.message);
    if (!ticket) throw new NotFoundError('Ticket not found');

    const { data: updated, error: updateError } = await supabase
        .from('tickets')
        .update({ updatedAt: new Date().toISOString() })
        .eq('id', ticketId)
        .select('id, title, faultDescription');
    if (updateError) throw new ApiError(500, 'Failed to update ticket', updateError.message);

    await supabase
        .from('ticket_responses')
        .insert({ ticket_id: ticketId, user_id: profile?.id, message: message?.trim() || '', isNew: true, created_at: new Date().toISOString() });

    await supabase.from('ticket_responses').update({ isNew: false }).eq('ticket_id', ticketId).eq('isNew', true).neq('user_id', req.user.id);

    res.json(updated?.[0] ?? null);
});

export const deleteTicket = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const ticketId = Number(req.params.id);
    if (!ticketId || Number.isNaN(ticketId)) throw new BadRequestError('Invalid ticket id');

    const { data: updated, error: updateError } = await supabase
        .from('tickets')
        .update({ status: TicketStatus.DELETED, updatedAt: new Date().toISOString() })
        .eq('id', ticketId)
        .select('id, status')
        .single();
    if (updateError) throw new ApiError(500, 'Failed to delete ticket', updateError.message);

    res.json(updated);
});
