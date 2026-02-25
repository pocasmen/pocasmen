//Horas de desenvolvimento activo=12,0
import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { ATTACHMENTS_BUCKET } from '../config/supabase';
import { catchAsync } from '../utils/catchAsync';
import { ApiError, BadRequestError, NotFoundError, UnauthorizedError } from '../utils/ApiError';
import { TicketStatus, UserRole } from '../types';
import { sendTelegramNotification } from '../services/telegramService';
import { mapTicketDatabaseToResponse } from '../utils/mappers';
import { TicketUpdate, TicketInsert, Client as DbClient, Equipment as DbEquipment, Profile as DbProfile } from '../types/supabase';
import * as ticketService from '../services/ticketService';

export const getTickets = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const status = (req.query.status as string) || TicketStatus.OPEN;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 100));
    const offset = (page - 1) * limit;

    let query = supabase.from('tickets').select('*', { count: 'exact' });

    if (status === TicketStatus.OPEN) {
        // Para a listagem de "Abertos", incluímos OPEN e ACKNOWLEDGED, 
        // mas EXCLUÍMOS explicitamente tickets que tenham scheduleId (visto que esses devem estar em "Agendados")
        query = query.in('status', [TicketStatus.OPEN, TicketStatus.ACKNOWLEDGED]).is('scheduleId', null);
    } else {
        query = query.eq('status', status);
    }

    const { data: tickets, error: ticketsError, count: totalCount } = await query
        .order('createdAt', { ascending: false })
        .range(offset, offset + limit - 1);

    if (ticketsError) throw new ApiError(500, 'Failed to fetch tickets', ticketsError.message);

    const clientIds = [...new Set((tickets || []).map(t => t.client_id).filter(Boolean))] as number[];
    const equipmentIds = [...new Set((tickets || []).map(t => t.equipmentId).filter(Boolean))] as number[];
    const userIds = [...new Set((tickets || []).map(t => t.created_by_user_id).filter(Boolean))] as string[];

    let clientMap = new Map<number, string>();
    if (clientIds.length > 0) {
        const { data: clients, error: clientsError } = await supabase
            .from('clients')
            .select('*')
            .in('id', clientIds);
        if (!clientsError && clients) {
            clientMap = new Map((clients as DbClient[]).map(c => [c.id, c.name]));
        }
    }

    let equipmentMap = new Map<number, { brand?: string; model?: string; serialNumber?: string }>();
    if (equipmentIds.length > 0) {
        const { data: equipments, error: equipmentsError } = await supabase
            .from('equipments')
            .select('*')
            .in('id', equipmentIds);
        if (!equipmentsError && equipments) {
            equipmentMap = new Map((equipments as DbEquipment[]).map(e => [e.id, { brand: e.brand || undefined, model: e.model || undefined, serialNumber: e.serialNumber || undefined }]));
        }
    }

    let userMap = new Map<string, { firstName: string; lastName: string }>();
    if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', userIds);
        if (!profilesError && profiles) {
            userMap = new Map((profiles as DbProfile[]).map(p => [p.id, { firstName: p.first_name || '', lastName: p.last_name || '' }]));
        }
    }

    const result = (tickets || []).map(t => {
        const clientName = clientMap.get(t.client_id || 0) || 'Cliente Desconhecido';
        const e = equipmentMap.get(t.equipmentId || 0);
        const equipmentInfo = e ? `${e.brand || ''} ${e.model || ''}${e.serialNumber ? ` (${e.serialNumber})` : ''}`.trim() : 'Equipamento Desconhecido';
        const u = userMap.get(t.created_by_user_id || '');
        return mapTicketDatabaseToResponse(t, clientName, equipmentInfo, u?.firstName, u?.lastName);
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

export const getTicketById = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const ticketId = Number(req.params.id);
    if (!ticketId || Number.isNaN(ticketId)) throw new BadRequestError('Invalid ticket id');

    const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', ticketId)
        .single();
    if (ticketError) throw new ApiError(500, 'Failed to fetch ticket', ticketError.message);
    if (!ticket) throw new NotFoundError('Ticket not found');

    let clientName = 'Cliente Desconhecido';
    {
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('*')
            .eq('id', ticket.client_id || 0)
            .single();
        if (!clientError && client) {
            clientName = (client as DbClient).name || clientName;
        }
    }

    let equipmentInfo = 'Equipamento Desconhecido';
    {
        const { data: equipment, error: equipmentError } = await supabase
            .from('equipments')
            .select('*')
            .eq('id', ticket.equipmentId || 0)
            .single();
        if (!equipmentError && equipment) {
            equipmentInfo = `${(equipment as DbEquipment).brand || ''} ${(equipment as DbEquipment).model || ''}${(equipment as DbEquipment).serialNumber ? ` (${(equipment as DbEquipment).serialNumber})` : ''}`.trim();
        }
    }

    let userFirstName = '';
    let userLastName = '';
    {
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', ticket.created_by_user_id || '')
            .single();
        if (userProfile?.first_name || userProfile?.last_name) {
            userFirstName = (userProfile as DbProfile).first_name || '';
            userLastName = (userProfile as DbProfile).last_name || '';
        } else if (ticket.created_by_user_id) {
            // Fallback to Auth Metadata
            const { data: authUser } = await supabase.auth.admin.getUserById(ticket.created_by_user_id);
            if (authUser?.user?.user_metadata) {
                userFirstName = authUser.user.user_metadata.first_name || '';
                userLastName = authUser.user.user_metadata.last_name || '';
            }
        }
    }

    const { data: attachments, error: attachError } = await supabase
        .from('ticket_attachments')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false });
    if (attachError) throw new ApiError(500, 'Failed to fetch attachments', attachError.message);
    const bucket = ATTACHMENTS_BUCKET;
    const enriched = await Promise.all((attachments || []).map(async att => {
        const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(att.storage_path || '', 3600);
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
                .select('*')
                .eq('ticket_id', ticketId)
                .order('created_at', { ascending: true });
            if (legacyErr) throw new ApiError(500, 'Failed to fetch responses', legacyErr.message);
            responses = legacyData || [];
        } else {
            responses = data || [];
        }
    }

    const authorIds = [...new Set((responses || []).map((r: any) => r.user_id).filter(Boolean))] as string[];
    let authorMap = new Map<string, { name: string; role: string }>();
    if (authorIds.length > 0) {
        const { data: profilesList, error: profErr } = await supabase
            .from('profiles')
            .select('*')
            .in('id', authorIds);
        if (!profErr && profilesList) {
            authorMap = new Map((profilesList as DbProfile[]).map((p) => [p.id, { name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), role: p.role || UserRole.CLIENT }]));
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

import { withTransaction } from '../config/db';

export const createTicket = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const result = await withTransaction(req, async (db) => {
        return await ticketService.createFullTicket(db, req.body, req.user!.id);
    });
    res.status(201).json(result);
});

export const replyToTicket = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const ticketId = Number(req.params.id);
    const { message } = req.body as { message?: string };

    if (!message) throw new BadRequestError('Message is required');

    const result = await withTransaction(req, async (db) => {
        return await ticketService.replyToFullTicket(db, ticketId, req.user!.id, message);
    });
    res.json(result);
});

export const deleteTicket = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const ticketId = Number(req.params.id);
    if (!ticketId || Number.isNaN(ticketId)) throw new BadRequestError('Invalid ticket id');

    const result = await withTransaction(req, async (db) => {
        const { rows, rowCount } = await db.query(
            'UPDATE tickets SET status = $1, "updatedAt" = $2 WHERE id = $3 RETURNING *',
            [TicketStatus.DELETED, new Date().toISOString(), ticketId]
        );
        if (rowCount === 0) throw new NotFoundError('Ticket not found');
        return rows[0];
    });

    res.json(result);
});
