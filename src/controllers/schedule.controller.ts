//Horas de desenvolvimento activo=20,0
import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import * as inventoryService from '../services/inventoryService';
import * as scheduleService from '../services/scheduleService';
import { broadcastCalendarUpdate } from '../services/realtimeService';
import { googleCalendarService } from '../services/googleCalendarService';
import { sendTelegramNotification } from '../services/telegramService';
import { catchAsync } from '../utils/catchAsync';
import { ApiError, NotFoundError } from '../utils/ApiError';
import { EnrichedPart, EnrichedSchedule, StockType, ScheduleStatus, TicketStatus } from '../types';
import { logger } from '../utils/logger';
import { mapScheduleDatabaseToResponse } from '../utils/mappers';
import {
    Schedule,
    Profile,
    Client,
    Equipment,
    SchedulePart,
    ScheduleTechnician,
} from '../types/supabase';
import { withTransaction } from '../config/db';

export const getSchedules = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 200));
    const offset = (page - 1) * limit;

    const { count: totalCount } = await supabase
        .from('schedules')
        .select('*', { count: 'exact', head: true });

    const { data: schedulesRaw, error: schedulesError } = await supabase
        .from('schedules')
        .select('*, schedule_technicians(technicianId), schedule_blocks:schedule_time_blocks(*)')
        .order('startDate', { ascending: false })
        .range(offset, offset + limit - 1);

    if (schedulesError) throw new ApiError(500, 'Failed to fetch schedules', schedulesError.message);

    const technicianIds = [...new Set((schedulesRaw || []).flatMap(s => (s.schedule_technicians as any[] || []).map(st => st.technicianId)))];
    let techMap = new Map<string, { id: string; name: string; color?: string }>();
    if (technicianIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('*')
            .in('id', technicianIds);
        if (!profilesError && profiles) {
            techMap = new Map((profiles as Profile[]).map(p => [String(p.id), { id: p.id, name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), color: p.color || undefined }]));
        }
    }

    const clientIds = [...new Set((schedulesRaw || []).map(s => s.clientId).filter((id): id is number => !!id))];
    const clientMap = new Map<string, string>();
    if (clientIds.length > 0) {
        const { data: cData } = await supabase.from('clients').select('*').in('id', clientIds);
        if (cData) (cData as Client[]).forEach(c => clientMap.set(String(c.id), c.name));
    }

    const equipmentIds = [...new Set((schedulesRaw || []).map(s => s.equipmentId).filter((id): id is number => !!id))];
    const equipMap = new Map<string, { model: string | null }>();
    if (equipmentIds.length > 0) {
        const { data: eData } = await supabase.from('equipments').select('*').in('id', equipmentIds);
        if (eData) (eData as Equipment[]).forEach(e => equipMap.set(String(e.id), { model: e.model }));
    }

    const scheduleIds = (schedulesRaw || []).map(s => s.id);
    let partsMap = new Map<number, EnrichedPart[]>();

    if (scheduleIds.length > 0) {
        const { data: scheduleParts, error: partsError } = await supabase
            .from('schedule_parts')
            .select('scheduleId, partId, quantity, stock_type, parts(id, reference, designation)')
            .in('scheduleId', scheduleIds);

        if (!partsError && scheduleParts) {
            (scheduleParts as any[]).forEach((sp: any) => {
                if (!partsMap.has(sp.scheduleId)) partsMap.set(sp.scheduleId, []);
                partsMap.get(sp.scheduleId)!.push({
                    id: sp.parts.id,
                    reference: sp.parts.reference,
                    designation: sp.parts.designation,
                    quantity: sp.quantity,
                    isDesignationLocked: true,
                    stockType: sp.stock_type || StockType.GENERAL
                });
            });
        }
    }

    const result: EnrichedSchedule[] = (schedulesRaw || []).map(s => {
        const cId = s.clientId;
        const eId = s.equipmentId;
        const sRaw = s as any;

        const technicians = (sRaw.schedule_technicians || [])
            .map((st: any) => techMap.get(String(st.technicianId)))
            .filter((t: any): t is { id: string; name: string; color?: string } => !!t);

        return mapScheduleDatabaseToResponse(
            s,
            clientMap.get(String(cId)) || 'Cliente Desconhecido',
            equipMap.get(String(eId))?.model || 'Modelo Desconhecido',
            technicians,
            partsMap.get(s.id) || []
        );
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

export const getScheduleById = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { data: scheduleRaw, error: scheduleError } = await supabase
        .from('schedules')
        .select('*, schedule_technicians(technicianId), schedule_time_blocks(*)')
        .eq('id', Number(id))
        .single();

    if (scheduleError || !scheduleRaw) throw new NotFoundError('Schedule not found');
    const scheduleData = scheduleRaw as any;

    const technicianIds = (scheduleData.schedule_technicians || []).map((st: { technicianId: string }) => st.technicianId);
    let technicians: { id: string; name: string; color?: string }[] = [];
    if (technicianIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('*')
            .in('id', technicianIds);
        if (!profilesError && profiles) {
            technicians = (profiles as Profile[]).map((p) => ({
                id: p.id,
                name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                color: p.color || undefined
            }));
        }
    }

    const { data: scheduleParts } = await supabase
        .from('schedule_parts')
        .select('partId, quantity, stock_type, is_applied, parts(id, reference, designation)')
        .eq('scheduleId', Number(id));

    const parts: EnrichedPart[] = (scheduleParts as any[] || []).map((sp: any) => ({
        id: sp.parts.id,
        reference: sp.parts.reference,
        designation: sp.parts.designation,
        quantity: sp.quantity,
        isDesignationLocked: true,
        stockType: sp.stock_type || StockType.GENERAL,
        isApplied: sp.is_applied !== false
    }));

    const cId = scheduleRaw.clientId;
    const eId = scheduleRaw.equipmentId;

    let clientName = 'Cliente Desconhecido';
    if (cId) {
        const { data: cData } = await supabase.from('clients').select('*').eq('id', Number(cId)).single();
        if (cData) clientName = (cData as Client).name;
    }

    let equipmentInfo = 'Modelo Desconhecido';
    if (eId) {
        const { data: eData } = await supabase.from('equipments').select('*').eq('id', Number(eId)).single();
        if (eData) equipmentInfo = (eData as Equipment).model || 'Modelo Desconhecido';
    }

    const result = mapScheduleDatabaseToResponse(
        scheduleData,
        clientName,
        equipmentInfo,
        technicians,
        parts
    );

    res.json(result);
});

export const createSchedule = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const technicianIds = req.body.technicianIds;
    const { startDate, endDate } = req.body;

    const inserted = await withTransaction(req, async (db) => {
        return await scheduleService.createFullSchedule(db, req.body);
    });

    const scheduleId = inserted.id;
    if (technicianIds && technicianIds.length > 0) await scheduleService.sendScheduleNotificationToTechnicians(supabase, scheduleId, technicianIds);

    broadcastCalendarUpdate(supabase, scheduleId);

    const googleCalendarId = process.env.GOOGLE_CALENDAR_ID;
    const isSyncEnabled = await scheduleService.isGoogleSyncEnabled(supabase);
    if (googleCalendarId && isSyncEnabled && startDate && endDate) {
        googleCalendarService.syncSchedule(supabase, googleCalendarId, scheduleId).catch(err => logger.error(err, '[SYNC ERROR] Google Calendar sync failed'));
    }

    res.status(201).json({
        ...inserted,
        serviceType: scheduleService.getServiceTypeKey(inserted.serviceType)
    });
});

export const updateSchedule = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const scheduleId = Number(req.params.id);
    const { startDate, endDate, technicianIds, isCompleted } = req.body;

    const result = await withTransaction(req, async (db) => {
        return await scheduleService.updateFullSchedule(db, scheduleId, req.body);
    });

    const googleCalendarId = process.env.GOOGLE_CALENDAR_ID;
    if (googleCalendarId && await scheduleService.isGoogleSyncEnabled(supabase)) {
        await googleCalendarService.deleteScheduleEvents(supabase, googleCalendarId, scheduleId, result.googleEventIdsToCleanup).catch(err => logger.error(err));
        if (startDate && endDate) await googleCalendarService.syncSchedule(supabase, googleCalendarId, scheduleId).catch(err => logger.error(err));
    }

    if (technicianIds && technicianIds.length > 0 && !isCompleted && result.hasSignificantChanges) await scheduleService.sendScheduleNotificationToTechnicians(supabase, scheduleId, technicianIds, true);

    broadcastCalendarUpdate(supabase, scheduleId);
    res.json({
        ...result.updatedSchedule,
        serviceType: scheduleService.getServiceTypeKey(result.updatedSchedule.serviceType)
    });
});

export const completeSchedule = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const scheduleId = Number(req.params.id);
    const { startDate, endDate } = req.body;

    const result = await withTransaction(req, async (db) => {
        return await scheduleService.completeFullSchedule(db, scheduleId, req.body);
    });

    const googleCalendarId = process.env.GOOGLE_CALENDAR_ID;
    if (googleCalendarId && await scheduleService.isGoogleSyncEnabled(supabase)) {
        await googleCalendarService.deleteScheduleEvents(supabase, googleCalendarId, scheduleId, result.googleEventIdsToCleanup).catch(err => logger.error(err));
        if (startDate && endDate) await googleCalendarService.syncSchedule(supabase, googleCalendarId, scheduleId).catch(err => logger.error(err));
    }

    broadcastCalendarUpdate(supabase, scheduleId);
    res.json({ ...result.updated, serviceType: scheduleService.getServiceTypeKey(result.updated.serviceType) });
});

export const deleteSchedule = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const scheduleId = Number(req.params.id);

    await withTransaction(req, async (db) => {
        const { rows: scheduleRows } = await db.query<Schedule & { client_name: string | null }>(
            'SELECT s.title, s."startDate", s."endDate", c.name as client_name FROM schedules s LEFT JOIN clients c ON s."clientId" = c.id WHERE s.id = $1',
            [scheduleId]
        );
        if (scheduleRows.length === 0) throw new NotFoundError('Schedule not found');
        const schedule = scheduleRows[0];

        const { rows: techIdsRows } = await db.query<ScheduleTechnician>('SELECT "technicianId" FROM schedule_technicians WHERE "scheduleId" = $1', [scheduleId]);
        const techIds = techIdsRows.map(r => r.technicianId);

        if (process.env.GOOGLE_CALENDAR_ID && await scheduleService.isGoogleSyncEnabled(supabase)) {
            await googleCalendarService.deleteScheduleEvents(supabase, process.env.GOOGLE_CALENDAR_ID, scheduleId).catch(err => logger.error(err));
        }

        await db.query('DELETE FROM schedule_technicians WHERE "scheduleId" = $1', [scheduleId]);
        const { rows: oldParts } = await db.query<SchedulePart>('SELECT "partId", quantity, stock_type FROM schedule_parts WHERE "scheduleId" = $1', [scheduleId]);
        for (const op of oldParts) await inventoryService.updatePartReservation(db, op.partId, -Number(op.quantity), (op.stock_type as StockType) || StockType.GENERAL);

        await db.query('DELETE FROM schedule_parts WHERE "scheduleId" = $1', [scheduleId]);
        await db.query('UPDATE tickets SET "scheduleId" = NULL, status = $1, "scheduled_at" = NULL WHERE "scheduleId" = $2', [TicketStatus.OPEN, scheduleId]);
        await db.query('DELETE FROM schedules WHERE id = $1', [scheduleId]);

        try {
            const message = `❌ *Agendamento Cancelado*\n\n*Título:* ${schedule.title}\n*Cliente:* ${schedule.client_name || 'Desconhecido'}\n\n_Este agendamento foi removido do sistema._`;
            const { rows: profiles } = await db.query<Profile>('SELECT telegramchatid FROM profiles WHERE id = ANY($1) OR role = \'admin\'', [techIds]);
            for (const p of profiles) if (p.telegramchatid) await sendTelegramNotification(message, p.telegramchatid);
        } catch (notifErr) { logger.error(notifErr); }
    });

    broadcastCalendarUpdate(supabase, scheduleId);
    res.status(204).send();
});

export const fixScheduleTitles = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { data: schedulesRaw, error } = await supabase.from('schedules').select('*').eq('title', 'Agendamento');
    if (error) throw new ApiError(500, 'Failed to fetch schedules to fix', error.message);
    if (!schedulesRaw || schedulesRaw.length === 0) return res.json({ message: 'No schedules found with title "Agendamento".' });

    let fixedCount = 0;
    for (const schedule of schedulesRaw) {
        if (!schedule.clientId || !schedule.equipmentId) continue;
        const newTitle = await scheduleService.generateScheduleTitle(supabase, schedule.clientId, schedule.equipmentId, schedule.serviceType as any);
        if (newTitle && newTitle !== 'Agendamento') {
            await supabase.from('schedules').update({ title: newTitle }).eq('id', schedule.id);
            fixedCount++;
        }
    }
    res.json({ message: 'Schedule titles fixed successfully', totalFound: schedulesRaw.length, fixed: fixedCount });
});
