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
import { Profile, EnrichedPart, EnrichedSchedule, Client, Equipment, StockType, ScheduleStatus, TicketStatus } from '../types';
import { logger } from '../utils/logger';

export const getSchedules = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { data: schedules, error: schedulesError } = await supabase
        .from('schedules')
        .select('*, schedule_technicians(technicianId), schedule_blocks:schedule_time_blocks(*)')
        .order('startDate', { ascending: true });
    if (schedulesError) throw new ApiError(500, 'Failed to fetch schedules', schedulesError.message);

    const technicianIds = [...new Set((schedules || []).flatMap(s => (s.schedule_technicians || []).map((st: { technicianId: string }) => st.technicianId)))];
    let techMap = new Map<string, { id: string; name: string; color?: string }>();
    if (technicianIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, color')
            .in('id', technicianIds);
        if (!profilesError && profiles) {
            techMap = new Map(profiles.map((p: any) => [String(p.id), { id: p.id, name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), color: p.color }]));
        }
    }

    const clientIds = [...new Set((schedules || []).map(s => s.clientId as number).filter(Boolean))];
    const clientMap = new Map<string, string>();
    if (clientIds.length > 0) {
        const { data: cData } = await supabase.from('clients').select('id, name').in('id', clientIds);
        if (cData) cData.forEach(c => clientMap.set(String(c.id), c.name));
    }

    const equipmentIds = [...new Set((schedules || []).map(s => s.equipmentId as number).filter(Boolean))];
    const equipMap = new Map<string, { model: string }>();
    if (equipmentIds.length > 0) {
        const { data: eData } = await supabase.from('equipments').select('id, model').in('id', equipmentIds);
        if (eData) eData.forEach(e => equipMap.set(String(e.id), { model: e.model }));
    }

    const scheduleIds = (schedules || []).map(s => s.id);
    let partsMap = new Map<number, EnrichedPart[]>();

    if (scheduleIds.length > 0) {
        const { data: scheduleParts, error: partsError } = await supabase
            .from('schedule_parts')
            .select('scheduleId, partId, quantity, stock_type, parts(id, reference, designation)')
            .in('scheduleId', scheduleIds);

        if (!partsError && scheduleParts) {
            scheduleParts.forEach((sp: any) => {
                if (!partsMap.has(sp.scheduleId)) {
                    partsMap.set(sp.scheduleId, []);
                }
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

    const result: EnrichedSchedule[] = (schedules || []).map((s: any) => {
        const cId = s.clientId;
        const eId = s.equipmentId;

        return {
            id: s.id,
            title: s.title,
            startDate: s.startDate,
            endDate: s.endDate,
            status: s.isCompleted ? ScheduleStatus.COMPLETED : (s.acknowledgementState || ScheduleStatus.PENDING),
            isCompleted: s.isCompleted,
            hasReport: s.hasReport,
            internalNotes: s.additionalInfo,
            serviceType: s.serviceType,
            ticketId: s.ticketId,
            clientId: cId,
            equipmentId: eId,
            technicians: (s.schedule_technicians || []).map((st: { technicianId: string }) => techMap.get(String(st.technicianId))).filter(Boolean),
            clientName: clientMap.get(String(cId)) || 'Cliente Desconhecido',
            equipmentInfo: equipMap.get(String(eId))?.model || 'Modelo Desconhecido',
            parts: partsMap.get(s.id) || [],
            acknowledgementState: s.acknowledgementState,
            includes_travel: s.includes_travel,
            classification: s.classification || 'geral',
            timeBlocks: (s.schedule_blocks || []).map((tb: any) => ({
                id: tb.id,
                start: tb.start_time,
                end: tb.end_time
            })),
        };
    });

    res.json(result);
});

export const getScheduleById = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { data: schedule, error: scheduleError } = await supabase
        .from('schedules')
        .select('*, schedule_technicians(technicianId), schedule_time_blocks(*)')
        .eq('id', id)
        .single();

    if (scheduleError || !schedule) throw new NotFoundError('Schedule not found');

    const technicianIds = (schedule.schedule_technicians || []).map((st: { technicianId: string }) => st.technicianId);
    let technicians: { id: string; name: string; color?: string }[] = [];
    if (technicianIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, color')
            .in('id', technicianIds);
        if (!profilesError && profiles) {
            technicians = profiles.map((p: any) => ({
                id: p.id,
                name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                color: p.color
            }));
        }
    }

    const { data: scheduleParts } = await supabase
        .from('schedule_parts')
        .select('partId, quantity, stock_type, is_applied, parts(id, reference, designation)')
        .eq('scheduleId', id);

    const parts: EnrichedPart[] = (scheduleParts || []).map((sp: any) => ({
        id: sp.parts.id,
        reference: sp.parts.reference,
        designation: sp.parts.designation,
        quantity: sp.quantity,
        isDesignationLocked: true,
        stockType: sp.stock_type || StockType.GENERAL,
        isApplied: sp.is_applied !== false
    }));

    const cId = schedule.clientId;
    const eId = schedule.equipmentId;

    let clientName = 'Cliente Desconhecido';
    if (cId) {
        const { data: cData } = await supabase.from('clients').select('name').eq('id', cId).single();
        if (cData) clientName = cData.name;
    }

    let equipmentInfo = 'Modelo Desconhecido';
    if (eId) {
        const { data: eData } = await supabase.from('equipments').select('model').eq('id', eId).single();
        if (eData) equipmentInfo = eData.model;
    }

    const result: EnrichedSchedule = {
        ...schedule,
        status: schedule.isCompleted ? ScheduleStatus.COMPLETED : (schedule.acknowledgementState || ScheduleStatus.PENDING),
        internalNotes: schedule.additionalInfo,
        technicians,
        clientName,
        equipmentInfo,
        parts,
        classification: schedule.classification || 'geral',
        timeBlocks: (schedule.schedule_time_blocks || []).map((tb: any) => ({
            id: tb.id,
            start: tb.start_time,
            end: tb.end_time
        })),
    };

    res.json(result);
});

export const createSchedule = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const {
        title,
        startDate,
        endDate,
        clientId,
        equipmentId,
        technicianIds,
        ticketId,
        internalNotes,
        serviceType,
        parts,
        timeBlocks,
        classification,
    } = req.body;

    const generatedTitle = await scheduleService.generateScheduleTitle(supabase, clientId, equipmentId, serviceType);

    const { data: inserted, error: sError } = await supabase
        .from('schedules')
        .insert({
            title: generatedTitle,
            startDate,
            endDate,
            clientId,
            equipmentId,
            isCompleted: false,
            additionalInfo: internalNotes,
            serviceType,
            ticketId,
            acknowledgementState: ScheduleStatus.PENDING,
            includes_travel: req.body.includesTravel,
            classification: classification || 'geral'
        })
        .select('id, title, startDate, endDate, isCompleted, hasReport, additionalInfo, serviceType, ticketId, clientId, equipmentId, acknowledgementState, includes_travel, classification')
        .single();

    if (sError) throw new ApiError(500, 'Failed to create schedule', sError.message);

    const scheduleId = inserted.id;

    // Insert Time Blocks
    if (Array.isArray(timeBlocks) && timeBlocks.length > 0) {
        const blockRows = timeBlocks.map((tb: { start: string; end: string }) => ({
            schedule_id: scheduleId,
            start_time: tb.start,
            end_time: tb.end
        }));
        await supabase.from('schedule_time_blocks').insert(blockRows);
    } else {
        await supabase.from('schedule_time_blocks').insert({
            schedule_id: scheduleId,
            start_time: startDate,
            end_time: endDate
        });
    }

    // Insert Technicians
    if (Array.isArray(technicianIds) && technicianIds.length > 0) {
        const techRows = technicianIds.map((tid: string | number) => ({ scheduleId, technicianId: String(tid) }));
        const { error: stError } = await supabase.from('schedule_technicians').insert(techRows);
        if (stError) throw new ApiError(500, 'Failed to assign technicians', stError.message);
    }

    // Handle Parts
    if (Array.isArray(parts) && parts.length > 0) {
        const partRows = [];
        for (const p of parts) {
            let partId = p.id;
            if (!partId && p.reference && p.designation) {
                const { data: existingPart } = await supabase.from('parts').select('id').eq('reference', p.reference).maybeSingle();
                if (existingPart) {
                    partId = existingPart.id;
                } else {
                    const { data: newPart, error: createError } = await supabase
                        .from('parts')
                        .insert({
                            reference: p.reference,
                            designation: p.designation,
                            stock_quantity: 0,
                            reserved_quantity: 0,
                            ordered_quantity: 0,
                            stock_quantity_contract: 0,
                            reserved_quantity_contract: 0,
                            ordered_quantity_contract: 0,
                            is_composed: false
                        })
                        .select('id')
                        .single();
                    if (!createError && newPart) partId = newPart.id;
                }
            }

            if (partId && p.quantity > 0) {
                partRows.push({
                    scheduleId,
                    partId,
                    quantity: Number(p.quantity),
                    stock_type: p.stockType || StockType.GENERAL,
                    is_applied: p.isApplied === false ? false : true
                });
            }
        }

        if (partRows.length > 0) {
            const { error: spError } = await supabase.from('schedule_parts').insert(partRows);
            if (spError) throw new ApiError(500, 'Failed to assign parts', spError.message);

            for (const partRow of partRows) {
                if (!inserted.isCompleted) {
                    await inventoryService.updatePartReservation(supabase, partRow.partId, Number(partRow.quantity), partRow.stock_type);
                }
            }
        }
    }

    if (ticketId) {
        await supabase.from('tickets').update({ scheduleId, status: TicketStatus.SCHEDULED }).eq('id', ticketId);
    }

    if (technicianIds && technicianIds.length > 0) {
        await scheduleService.sendScheduleNotificationToTechnicians(supabase, scheduleId, technicianIds);
    }

    broadcastCalendarUpdate(supabase, scheduleId);

    const googleCalendarId = process.env.GOOGLE_CALENDAR_ID;
    const isSyncEnabled = await scheduleService.isGoogleSyncEnabled(supabase);

    logger.info({
        googleCalendarId: googleCalendarId ? '***' : 'MISSING',
        isSyncEnabled
    }, '[SYNC DIAGNOSTIC] Checking Google Calendar Sync prerequisites');

    if (googleCalendarId && isSyncEnabled) {
        googleCalendarService.syncSchedule(supabase, googleCalendarId, scheduleId)
            .catch(err => logger.error(err, '[SYNC ERROR] Google Calendar sync failed'));
    } else {
        logger.warn('[SYNC DIAGNOSTIC] Skipping sync. Either Calendar ID missing or Sync disabled in settings.');
    }

    res.status(201).json(inserted);
});

export const updateSchedule = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const scheduleId = Number(req.params.id);
    const {
        title,
        startDate,
        endDate,
        clientId,
        equipmentId,
        technicianIds,
        isCompleted,
        ticketId,
        internalNotes,
        serviceType,
        parts,
        timeBlocks,
        classification,
    } = req.body;

    const { data: originalSchedule, error: fetchError } = await supabase
        .from('schedules')
        .select('title, startDate, endDate, clientId, equipmentId, serviceType, additionalInfo, includes_travel, classification, schedule_technicians(technicianId), schedule_time_blocks(start_time, end_time)')
        .eq('id', scheduleId)
        .single();

    if (fetchError) throw new ApiError(500, 'Failed to fetch original schedule', fetchError.message);

    const { data: originalParts } = await supabase
        .from('schedule_parts')
        .select('partId, quantity')
        .eq('scheduleId', scheduleId);

    // Change Detection
    let hasSignificantChanges = false;
    const normalizeDate = (date: any) => date ? new Date(date).toISOString() : '';
    const normalizeServiceType = (st: any) => {
        if (!st) return '';
        if (typeof st === 'string') return st;
        if (Array.isArray(st)) return st.join(',');
        return String(st);
    };
    const normalizeTimeBlocks = (blocks: any[]) => {
        return blocks.map(tb => ({
            start: new Date(tb.start || tb.start_time).toISOString(),
            end: new Date(tb.end || tb.end_time).toISOString()
        })).sort((a, b) => a.start.localeCompare(b.start));
    };

    if (originalSchedule.title !== (title || 'Agendamento')) hasSignificantChanges = true;
    if (normalizeDate(originalSchedule.startDate) !== normalizeDate(startDate)) hasSignificantChanges = true;
    if (normalizeDate(originalSchedule.endDate) !== normalizeDate(endDate)) hasSignificantChanges = true;
    if (originalSchedule.clientId !== clientId) hasSignificantChanges = true;
    if (originalSchedule.equipmentId !== equipmentId) hasSignificantChanges = true;
    if (normalizeServiceType(originalSchedule.serviceType) !== normalizeServiceType(serviceType)) hasSignificantChanges = true;

    const originalTechIds = (originalSchedule.schedule_technicians || []).map((st: { technicianId: string }) => String(st.technicianId)).sort();
    const newTechIds = Array.isArray(technicianIds) ? technicianIds.map((id: string | number) => String(id)).sort() : [];
    if (JSON.stringify(originalTechIds) !== JSON.stringify(newTechIds)) hasSignificantChanges = true;

    const originalBlocksNormalized = normalizeTimeBlocks(originalSchedule.schedule_time_blocks || []);
    const newBlocksNormalized = normalizeTimeBlocks(timeBlocks || [{ start: startDate, end: endDate }]);
    if (JSON.stringify(originalBlocksNormalized) !== JSON.stringify(newBlocksNormalized)) hasSignificantChanges = true;

    const originalPartsNormalized = (originalParts || []).map((p: { partId: number; quantity: number }) => ({ partId: p.partId, quantity: p.quantity })).sort((a: any, b: any) => a.partId - b.partId);
    const newPartsNormalized = (parts || []).filter((p: any) => p.id && p.quantity > 0).map((p: any) => ({ partId: p.id, quantity: Number(p.quantity) })).sort((a: any, b: any) => a.partId - b.partId);
    if (JSON.stringify(originalPartsNormalized) !== JSON.stringify(newPartsNormalized)) hasSignificantChanges = true;

    const generatedTitle = await scheduleService.generateScheduleTitle(supabase, clientId, equipmentId, serviceType);

    const updateData: any = {
        title: generatedTitle,
        startDate,
        endDate,
        clientId,
        equipmentId,
        isCompleted: !!isCompleted,
        additionalInfo: internalNotes,
        serviceType,
        ticketId,
        includes_travel: req.body.includesTravel !== undefined ? req.body.includesTravel : originalSchedule.includes_travel,
        classification: classification !== undefined ? classification : originalSchedule.classification
    };

    if (hasSignificantChanges) updateData.acknowledgementState = ScheduleStatus.PENDING;

    const { data: updated, error: updateError } = await supabase
        .from('schedules')
        .update(updateData)
        .eq('id', scheduleId)
        .select('id, title, startDate, endDate, isCompleted, hasReport, additionalInfo, serviceType, ticketId, clientId, equipmentId, acknowledgementState, includes_travel, classification')
        .single();

    if (updateError) throw new ApiError(500, 'Failed to update schedule', updateError.message);

    const googleCalendarId = process.env.GOOGLE_CALENDAR_ID;
    if (googleCalendarId && await scheduleService.isGoogleSyncEnabled(supabase)) {
        await googleCalendarService.deleteScheduleEvents(supabase, googleCalendarId, scheduleId).catch(err => logger.error(err));
    }

    await supabase.from('schedule_time_blocks').delete().eq('schedule_id', scheduleId);
    const blockRows = (Array.isArray(timeBlocks) && timeBlocks.length > 0)
        ? timeBlocks.map((tb: { start: string; end: string }) => ({ schedule_id: scheduleId, start_time: tb.start, end_time: tb.end }))
        : [{ schedule_id: scheduleId, start_time: startDate, end_time: endDate }];
    await supabase.from('schedule_time_blocks').insert(blockRows);

    await supabase.from('schedule_technicians').delete().eq('scheduleId', scheduleId);
    if (Array.isArray(technicianIds) && technicianIds.length > 0) {
        await supabase.from('schedule_technicians').insert(technicianIds.map((tid: string | number) => ({ scheduleId, technicianId: String(tid) })));
    }

    const { data: oldParts } = await supabase.from('schedule_parts').select('partId, quantity, stock_type').eq('scheduleId', scheduleId);
    if (oldParts) {
        for (const op of oldParts) {
            await inventoryService.updatePartReservation(supabase, op.partId, -Number(op.quantity), op.stock_type || StockType.GENERAL);
        }
    }

    await supabase.from('schedule_parts').delete().eq('scheduleId', scheduleId);
    if (Array.isArray(parts) && parts.length > 0) {
        const partRows = [];
        for (const p of parts) {
            let partId = p.id;
            if (!partId && p.reference && p.designation) {
                const { data: existingPart } = await supabase.from('parts').select('id').eq('reference', p.reference).maybeSingle();
                if (existingPart) partId = existingPart.id;
                else {
                    const { data: newPart } = await supabase.from('parts').insert({ reference: p.reference, designation: p.designation, stock_quantity: 0, reserved_quantity: 0, ordered_quantity: 0, stock_quantity_contract: 0, reserved_quantity_contract: 0, ordered_quantity_contract: 0, is_composed: false }).select('id').single();
                    if (newPart) partId = newPart.id;
                }
            }
            if (partId && p.quantity > 0) {
                partRows.push({ scheduleId, partId, quantity: Number(p.quantity), stock_type: p.stockType || StockType.GENERAL, is_applied: p.isApplied !== false });
            }
        }
        if (partRows.length > 0) {
            await supabase.from('schedule_parts').insert(partRows);
            for (const pr of partRows) {
                if (!isCompleted) {
                    await inventoryService.updatePartReservation(supabase, pr.partId, Number(pr.quantity), pr.stock_type);
                }
            }
        }
    }

    if (ticketId) {
        await supabase.from('tickets').update({ scheduleId, status: isCompleted ? TicketStatus.CLOSED : TicketStatus.SCHEDULED, scheduled_at: startDate }).eq('id', ticketId);
    }

    if (technicianIds && technicianIds.length > 0 && !isCompleted && hasSignificantChanges) {
        await scheduleService.sendScheduleNotificationToTechnicians(supabase, scheduleId, technicianIds, true);
    }

    if (googleCalendarId && await scheduleService.isGoogleSyncEnabled(supabase)) {
        googleCalendarService.syncSchedule(supabase, googleCalendarId, scheduleId).catch(err => logger.error(err));
    }

    broadcastCalendarUpdate(supabase, scheduleId);
    res.json(updated);
});

export const completeSchedule = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const scheduleId = Number(req.params.id);
    const {
        title,
        startDate,
        endDate,
        clientId,
        equipmentId,
        technicianIds,
        ticketId,
        internalNotes,
        serviceType,
        parts,
        classification,
    } = req.body;

    const generatedTitle = await scheduleService.generateScheduleTitle(supabase, clientId, equipmentId, serviceType);

    const { data: updated, error: updateError } = await supabase
        .from('schedules')
        .update({ title: generatedTitle, startDate, endDate, clientId, equipmentId, isCompleted: true, additionalInfo: internalNotes, serviceType, includes_travel: req.body.includesTravel, classification: classification || 'geral' })
        .eq('id', scheduleId)
        .select('id, title, startDate, endDate, isCompleted, hasReport, additionalInfo, serviceType, ticketId, clientId, equipmentId, includes_travel, classification')
        .single();

    if (updateError) throw new ApiError(500, 'Failed to complete schedule', updateError.message);

    await supabase.from('schedule_technicians').delete().eq('scheduleId', scheduleId);
    if (Array.isArray(technicianIds) && technicianIds.length > 0) {
        await supabase.from('schedule_technicians').insert(technicianIds.map((tid: string | number) => ({ scheduleId, technicianId: String(tid) })));
    }

    const { data: oldParts } = await supabase.from('schedule_parts').select('partId, quantity, stock_type').eq('scheduleId', scheduleId);
    if (oldParts) {
        for (const op of oldParts) {
            await inventoryService.updatePartReservation(supabase, op.partId, -Number(op.quantity), op.stock_type || StockType.GENERAL);
        }
    }

    await supabase.from('schedule_parts').delete().eq('scheduleId', scheduleId);
    if (Array.isArray(parts) && parts.length > 0) {
        const partRows = [];
        for (const p of parts) {
            let partId = p.id;
            if (!partId && p.reference && p.designation) {
                const { data: existingPart } = await supabase.from('parts').select('id').eq('reference', p.reference).maybeSingle();
                if (existingPart) partId = existingPart.id;
                else {
                    const { data: newPart } = await supabase.from('parts').insert({ reference: p.reference, designation: p.designation, stock_quantity: 0, reserved_quantity: 0, ordered_quantity: 0, stock_quantity_contract: 0, reserved_quantity_contract: 0, ordered_quantity_contract: 0, is_composed: false }).select('id').single();
                    if (newPart) partId = newPart.id;
                }
            }
            if (partId && p.quantity > 0) {
                partRows.push({ scheduleId, partId, quantity: Number(p.quantity), stock_type: p.stockType || StockType.GENERAL, is_applied: p.isApplied !== false });
            }
        }
        if (partRows.length > 0) {
            await supabase.from('schedule_parts').insert(partRows);
            // Ao completar um agendamento, as peças deixam de estar reservadas no sistema geral.
            // Elas serão abatidas do stock real quando o relatório for criado.
            // Portanto, NÃO re-reservamos aqui.
        }
    }

    if (ticketId) {
        await supabase.from('tickets').update({ scheduleId, status: TicketStatus.CLOSED, scheduled_at: startDate }).eq('id', ticketId);
    }

    const googleCalendarId = process.env.GOOGLE_CALENDAR_ID;
    if (googleCalendarId && await scheduleService.isGoogleSyncEnabled(supabase)) {
        googleCalendarService.syncSchedule(supabase, googleCalendarId, scheduleId).catch(err => logger.error(err));
    }

    broadcastCalendarUpdate(supabase, scheduleId);
    res.json(updated);
});

export const deleteSchedule = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const scheduleId = Number(req.params.id);

    const { data: schedule, error: scheduleError } = await supabase
        .from('schedules')
        .select('title, startDate, endDate, clients(name), schedule_technicians(technicianId)')
        .eq('id', scheduleId)
        .single();

    if (scheduleError) throw new ApiError(500, 'Failed to fetch schedule', scheduleError.message);
    if (!schedule) throw new NotFoundError('Schedule not found');

    const googleCalendarId = process.env.GOOGLE_CALENDAR_ID;
    if (googleCalendarId && await scheduleService.isGoogleSyncEnabled(supabase)) {
        await googleCalendarService.deleteScheduleEvents(supabase, googleCalendarId, scheduleId).catch(err => logger.error(err));
    }

    const techIds = (schedule.schedule_technicians || []).map((st: { technicianId: string }) => st.technicianId);
    const clientName = Array.isArray(schedule.clients) ? (schedule.clients[0] as any)?.name : (schedule.clients as any)?.name || 'Cliente Desconhecido';

    await supabase.from('schedule_technicians').delete().eq('scheduleId', scheduleId);

    const { data: oldParts } = await supabase.from('schedule_parts').select('partId, quantity, stock_type').eq('scheduleId', scheduleId);
    if (oldParts) {
        for (const op of oldParts) {
            await inventoryService.updatePartReservation(supabase, op.partId, -Number(op.quantity), op.stock_type || StockType.GENERAL);
        }
    }

    await supabase.from('schedule_parts').delete().eq('scheduleId', scheduleId);
    await supabase.from('tickets').update({ scheduleId: null, status: TicketStatus.OPEN, scheduled_at: null }).eq('scheduleId', scheduleId);
    await supabase.from('schedules').delete().eq('id', scheduleId);

    broadcastCalendarUpdate(supabase, scheduleId);

    // Notification of deletion
    try {
        let query = supabase.from('profiles').select('id, telegramchatid, role');
        if (techIds.length > 0) {
            query = query.or(`id.in.(${techIds.map((t: string) => `"${t}"`).join(',')}),role.eq.admin`);
        } else {
            query = query.eq('role', 'admin');
        }
        const { data: profiles } = await query;
        if (profiles) {
            const message = `❌ *Agendamento Cancelado*\n\n*Título:* ${schedule.title}\n*Cliente:* ${clientName}\n\n_Este agendamento foi removido do sistema._`;
            for (const p of profiles) {
                if (p.telegramchatid) await sendTelegramNotification(message, p.telegramchatid);
            }
        }
    } catch (notifErr) { logger.error(notifErr); }

    res.status(204).send();
});

export const fixScheduleTitles = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    logger.info('[FIX] Starting schedule title correction...');

    // Fetch all schedules with 'Agendamento' title OR all schedules to enforce format?
    // User asked to correct "Agendamento". Let's target those first to be safe, or all.
    // "podes corrigir para não ser nenhum agendamento guardado com 'title' apenas 'Agendamento'"

    const { data: schedules, error } = await supabase
        .from('schedules')
        .select('id, clientId, equipmentId, serviceType, title')
        .eq('title', 'Agendamento');

    if (error) throw new ApiError(500, 'Failed to fetch schedules to fix', error.message);
    if (!schedules || schedules.length === 0) {
        return res.json({ message: 'No schedules found with title "Agendamento".' });
    }

    logger.info(`[FIX] Found ${schedules.length} schedules to fix.`);
    let fixedCount = 0;

    for (const schedule of schedules) {
        if (!schedule.clientId || !schedule.equipmentId) continue;

        const newTitle = await scheduleService.generateScheduleTitle(
            supabase,
            schedule.clientId,
            schedule.equipmentId,
            schedule.serviceType
        );

        if (newTitle && newTitle !== 'Agendamento') {
            await supabase.from('schedules').update({ title: newTitle }).eq('id', schedule.id);
            fixedCount++;
        }
    }

    res.json({
        message: 'Schedule titles fixed successfully',
        totalFound: schedules.length,
        fixed: fixedCount
    });
});
