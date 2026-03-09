//Horas de desenvolvimento activo=35,5
import { SupabaseClient } from '@supabase/supabase-js';
import { PoolClient } from 'pg';
import { sendTelegramNotification } from './telegramService';
import * as inventoryService from './inventoryService';
import { logger } from '../utils/logger';
import { supabase } from '../config/supabase';
import { Database } from '../types/db.types';
import { Profile, Client, Equipment, Schedule, SchedulePart, ScheduleTechnician, ScheduleTimeBlock, Ticket, Part } from '../types/supabase';
import { StockType, ScheduleStatus, TicketStatus } from '../types';

export const SERVICE_TYPE_MAP: Record<string, string> = {
    'manutencao': 'Manutenção',
    'reparacao': 'Reparação',
    'assistencia': 'Assistência',
    'remota': 'Remota',
    'instalacao': 'Instalação',
    'calibracao': 'Calibração'
};

/**
 * Extracts a clean service type key from various formats.
 */
export function getServiceTypeKey(serviceType: any): string {
    if (!serviceType) return '';

    if (Array.isArray(serviceType)) return serviceType[0] || '';

    if (typeof serviceType === 'string') {
        if (serviceType.startsWith('{') || serviceType.startsWith('[')) {
            const cleanStr = serviceType.replace(/^[\{\[]/, '').replace(/[\}\]]$/, '').replace(/\"/g, '');
            if (cleanStr.includes(',')) {
                return cleanStr.split(',')[0].trim();
            }
            return cleanStr.trim();
        }
        return serviceType.trim();
    }

    return String(serviceType);
}

/**
 * Extracts an array of clean service type keys from various formats.
 */
export function getServiceTypeKeys(serviceType: any): string[] {
    if (!serviceType) return [];

    let rawKeys: string[] = [];

    if (Array.isArray(serviceType)) {
        rawKeys = serviceType;
    } else if (typeof serviceType === 'string') {
        if (serviceType.startsWith('{') || serviceType.startsWith('[')) {
            const cleanStr = serviceType.replace(/^[\{\[]/, '').replace(/[\}\]]$/, '').replace(/\"/g, '');
            rawKeys = cleanStr.split(',').map(s => s.trim()).filter(Boolean);
        } else {
            rawKeys = [serviceType.trim()];
        }
    } else {
        rawKeys = [String(serviceType)];
    }

    return rawKeys.filter(Boolean);
}

/**
 * Formats a serviceType into a readable label.
 */
export function formatServiceType(serviceType: any): string {
    const sTypeKey = getServiceTypeKey(serviceType);
    if (!sTypeKey) return 'Não especificado';
    return SERVICE_TYPE_MAP[sTypeKey] || sTypeKey.charAt(0).toUpperCase() + sTypeKey.slice(1);
}

/**
 * Generates a standardized title for a schedule: "{ServiceType} - {Equipment} - {Client}"
 */
export async function generateScheduleTitle(supabase: SupabaseClient<Database>, clientId: number, equipmentId: number, serviceType: string | string[]): Promise<string> {
    try {
        const [clientRes, equipRes] = await Promise.all([
            supabase.from('clients').select('name').eq('id', clientId).single(),
            supabase.from('equipments').select('model').eq('id', equipmentId).single()
        ]);

        const clientName = clientRes.data?.name || 'Cliente';
        const equipModel = equipRes.data?.model || 'Equipamento';
        const serviceLabel = formatServiceType(serviceType);

        return `${serviceLabel} - ${equipModel} - ${clientName}`;
    } catch (err) {
        logger.error(err, 'Error generating schedule title');
        return 'Agendamento';
    }
}

/**
 * Checks if Google Calendar Sync is enabled in settings
 */
export async function isGoogleSyncEnabled(supabase: SupabaseClient<Database>): Promise<boolean> {
    try {
        const { data, error } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'google_calendar_sync_enabled')
            .single();

        if (error || !data) return false;
        return data.value === 'true';
    } catch (err) {
        logger.error(err, '[SYNC] Error checking sync setting');
        return false;
    }
}

/**
 * Sends a Telegram notification to assigned technicians and admins about a new or updated schedule
 */
export async function sendScheduleNotificationToTechnicians(supabase: SupabaseClient<Database>, scheduleId: number, technicianIds: string[], isUpdate: boolean = false) {
    try {
        const { data: scheduleRaw, error: sError } = await supabase
            .from('schedules')
            .select('title, startDate, endDate, serviceType, additionalInfo, clientId, equipmentId, acknowledgementState, clients(name), equipments(brand, model, serialNumber)')
            .eq('id', scheduleId)
            .single();

        if (sError || !scheduleRaw) {
            logger.error(sError, 'Error fetching schedule for notification');
            return;
        }

        const { data: scheduleParts, error: partsError } = await supabase
            .from('schedule_parts')
            .select('quantity, parts(reference, designation)')
            .eq('scheduleId', scheduleId);

        const schedule = scheduleRaw as any; // Temporary cast for nested objects until we fix deep typing
        const clientName = schedule.clients?.name || (Array.isArray(schedule.clients) ? schedule.clients[0]?.name : 'Cliente Desconhecido');

        const startDate = schedule.startDate ? new Date(schedule.startDate).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' }) : 'A definir';
        const endDate = schedule.endDate ? new Date(schedule.endDate).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' }) : 'A definir';

        const serviceTypeLabel = formatServiceType(schedule.serviceType);

        const equipment = schedule.equipments;
        let equipmentInfo = 'Não especificado';
        if (equipment) {
            const eq = Array.isArray(equipment) ? equipment[0] : equipment;
            const brand = eq.brand || '';
            const model = eq.model || '';
            const serialNumber = eq.serialNumber || '';
            equipmentInfo = `${brand} ${model}${serialNumber ? ` (S/N: ${serialNumber})` : ''}`.trim();
        }

        const { data: profiles, error: pError } = await supabase
            .from('profiles')
            .select('id, telegramchatid, role, first_name, last_name')
            .or(`id.in.(${technicianIds.map(id => `"${id}"`).join(',')}),role.eq.admin,role.eq.super_admin`);

        if (pError || !profiles) {
            logger.error(pError, 'Error fetching admin and technician profiles for notification');
            return;
        }

        const typedProfiles = profiles as Profile[];

        const assignedTechNames = typedProfiles
            .filter(p => technicianIds.includes(p.id))
            .map(p => `${p.first_name || ''} ${p.last_name || ''}`.trim())
            .join(', ');

        const isBacklog = schedule.acknowledgementState === 'pending_scheduling' || !schedule.startDate;
        const notificationTitle = isBacklog ? '⏳ *Novo Serviço Pendente*' : (isUpdate ? '🔄 *Re-Agendamento*' : '📅 *Novo Agendamento*');

        let baseMessage = `${notificationTitle}\n\n`;
        baseMessage += `*Tipo de Serviço:* ${serviceTypeLabel}\n`;
        baseMessage += `*Cliente:* ${clientName}\n`;
        baseMessage += `*Equipamento:* ${equipmentInfo}\n`;

        if (isBacklog) {
            baseMessage += `*Estado:* Aguarda Agendamento (Backlog)\n`;
        } else {
            baseMessage += `*Início:* ${startDate}\n`;
            baseMessage += `*Final:* ${endDate}\n`;
        }

        if (schedule.additionalInfo) {
            baseMessage += `*Notas Internas:* ${schedule.additionalInfo}\n`;
        }

        if (scheduleParts && scheduleParts.length > 0) {
            baseMessage += `\n*Peças Necessárias:*\n`;
            scheduleParts.forEach((sp: any) => {
                const p = sp.parts;
                baseMessage += `• ${sp.quantity}x ${p.reference} - ${p.designation}\n`;
            });
        }

        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: '✅ Aceitar', callback_data: `sch_acc_${scheduleId}` },
                    { text: '❌ Rejeitar', callback_data: `sch_rej_${scheduleId}` }
                ]
            ]
        };

        for (const profile of typedProfiles) {
            if (!profile.telegramchatid) continue;

            if (profile.role === 'admin' || profile.role === 'super_admin') {
                let adminMessage = baseMessage;
                adminMessage += `\n*Técnicos Atribuídos:* ${assignedTechNames}\n`;
                adminMessage += `\n_Aviso informativo para administração._`;
                await sendTelegramNotification(adminMessage, profile.telegramchatid);
            }

            if (technicianIds.includes(profile.id)) {
                let techMessage = baseMessage;
                if (isBacklog) {
                    techMessage += `\nFaça o agendamento assim que possivel! Obrigado!`;
                    await sendTelegramNotification(techMessage, profile.telegramchatid);
                } else {
                    techMessage += `\nPor favor, confirme a sua disponibilidade.`;
                    await sendTelegramNotification(techMessage, profile.telegramchatid, replyMarkup);
                }
            }
        }
    } catch (err) {
        logger.error(err, 'Unexpected error in sendScheduleNotificationToTechnicians');
    }
}

/**
 * Syncs time blocks for a schedule
 */
async function syncTimeBlocks(db: PoolClient, scheduleId: number, timeBlocks: any[], startDate?: string, endDate?: string) {
    await db.query('DELETE FROM schedule_time_blocks WHERE schedule_id = $1', [scheduleId]);
    if (Array.isArray(timeBlocks) && timeBlocks.length > 0) {
        for (const tb of timeBlocks) {
            await db.query<ScheduleTimeBlock>('INSERT INTO schedule_time_blocks (schedule_id, start_time, end_time) VALUES ($1, $2, $3)', [scheduleId, tb.start, tb.end]);
        }
    } else if (startDate && endDate) {
        await db.query<ScheduleTimeBlock>('INSERT INTO schedule_time_blocks (schedule_id, start_time, end_time) VALUES ($1, $2, $3)', [scheduleId, startDate, endDate]);
    }
}

/**
 * Syncs technicians for a schedule
 */
export async function syncTechnicians(db: PoolClient, scheduleId: number, technicianIds: string[]) {
    await db.query('DELETE FROM schedule_technicians WHERE "scheduleId" = $1', [scheduleId]);
    if (Array.isArray(technicianIds) && technicianIds.length > 0) {
        for (const techId of technicianIds) {
            await db.query<ScheduleTechnician>('INSERT INTO schedule_technicians ("scheduleId", "technicianId") VALUES ($1, $2)', [scheduleId, String(techId)]);
        }
    }
}

/**
 * Syncs parts and updates reservations using absolute synchronization.
 * Self-correcting against drift.
 */
export async function syncPartsAndReservations(db: PoolClient, scheduleId: number, parts: any[], isCompleted: boolean, wasAlreadyCompletedParam?: boolean) {
    let wasAlreadyCompleted = wasAlreadyCompletedParam;

    if (wasAlreadyCompleted === undefined) {
        const { rows: currentStatus } = await db.query<{ isCompleted: boolean }>('SELECT "isCompleted" FROM schedules WHERE id = $1', [scheduleId]);
        wasAlreadyCompleted = currentStatus.length > 0 && currentStatus[0].isCompleted;
    }

    const { rows: originalParts } = await db.query<SchedulePart>('SELECT "partId", quantity, stock_type FROM schedule_parts WHERE "scheduleId" = $1', [scheduleId]);

    // Track all parts involved for later synchronization
    const affectedPartIds = new Set<number>();
    originalParts.forEach(op => affectedPartIds.add(op.partId));

    await db.query('DELETE FROM schedule_parts WHERE "scheduleId" = $1', [scheduleId]);

    if (Array.isArray(parts) && parts.length > 0) {
        for (const p of parts) {
            let partId = p.id;
            if (!partId && p.reference && p.designation) {
                const { rows: existingPartRows } = await db.query<Part>('SELECT id FROM parts WHERE reference = $1', [p.reference]);
                if (existingPartRows.length > 0) {
                    partId = existingPartRows[0].id;
                } else {
                    const { rows: newPartRows } = await db.query<Part>(
                        'INSERT INTO parts (reference, designation, stock_quantity, reserved_quantity, ordered_quantity, stock_quantity_foss, reserved_quantity_foss, ordered_quantity_foss, is_composed) VALUES ($1, $2, 0, 0, 0, 0, 0, 0, false) RETURNING id',
                        [p.reference, p.designation]
                    );
                    partId = newPartRows[0].id;
                }
            }

            if (partId && p.quantity > 0) {
                affectedPartIds.add(partId);
                await db.query<SchedulePart>(
                    'INSERT INTO schedule_parts ("scheduleId", "partId", quantity, stock_type, is_applied) VALUES ($1, $2, $3, $4, $5)',
                    [scheduleId, partId, Number(p.quantity), p.stockType || StockType.GENERAL, p.isApplied !== false]
                );
            }
        }
    }

    // Recalculate everything for involved parts to ensure perfect sync.
    if (affectedPartIds.size > 0) {
        await inventoryService.syncMultiplePartsReservations(db, Array.from(affectedPartIds));
    }
}

/**
 * Creates a full schedule with all relations
 */
export async function createFullSchedule(db: PoolClient, data: any) {
    const {
        startDate, endDate, clientId, equipmentId, technicianIds,
        ticketId, internalNotes, serviceType, parts, timeBlocks,
        classification, priority, includesTravel
    } = data;

    const generatedTitle = await generateScheduleTitle(supabase, clientId, equipmentId, serviceType);

    const { rows } = await db.query<Schedule>(
        `INSERT INTO schedules (
            title, "startDate", "endDate", "clientId", "equipmentId", 
            "isCompleted", "additionalInfo", "serviceType", "ticketId",
            "acknowledgementState", "includes_travel", "classification", "priority"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
        RETURNING id, title, "startDate", "endDate", "isCompleted", "hasReport", "additionalInfo", "serviceType", "ticketId", "clientId", "equipmentId", "acknowledgementState", "includes_travel", "classification", "priority"`,
        [
            generatedTitle,
            startDate || null,
            endDate || null,
            clientId,
            equipmentId,
            false,
            internalNotes,
            JSON.stringify(Array.isArray(serviceType) ? serviceType : (serviceType ? [serviceType] : [])),
            ticketId,
            (!startDate) ? ScheduleStatus.PENDING_SCHEDULING : ScheduleStatus.PENDING,
            includesTravel !== undefined ? includesTravel : false,
            classification || 'geral',
            priority || null
        ]
    );
    const insertedSchedule = rows[0];
    const scheduleId = insertedSchedule.id;

    await syncTimeBlocks(db, scheduleId, timeBlocks, startDate, endDate);
    await syncTechnicians(db, scheduleId, technicianIds);
    await syncPartsAndReservations(db, scheduleId, parts, false, false);

    if (ticketId) {
        await db.query<Ticket>('UPDATE tickets SET "scheduleId" = $1, status = $2 WHERE id = $3', [scheduleId, TicketStatus.SCHEDULED, ticketId]);
    }

    return insertedSchedule;
}

/**
 * Updates a full schedule with all relations
 */
export async function updateFullSchedule(db: PoolClient, scheduleId: number, data: any) {
    const {
        startDate, endDate, clientId, equipmentId, technicianIds,
        isCompleted, ticketId, internalNotes, serviceType, parts,
        timeBlocks, classification, includesTravel
    } = data;

    const { rows: originalRows } = await db.query<Schedule>('SELECT title, "startDate", "endDate", "clientId", "equipmentId", "serviceType", "acknowledgementState", "isCompleted" FROM schedules WHERE id = $1', [scheduleId]);
    if (originalRows.length === 0) throw new Error('Schedule not found');
    const originalSchedule = originalRows[0];
    const wasAlreadyCompleted = originalSchedule.isCompleted;

    if (wasAlreadyCompleted) throw new Error('Não é possível editar um agendamento já concluído.');

    const generatedTitle = await generateScheduleTitle(supabase, clientId, equipmentId, serviceType);

    // Check significant changes BEFORE update
    let hasSignificantChanges = false;
    if (originalSchedule.clientId !== clientId) hasSignificantChanges = true;
    if (originalSchedule.equipmentId !== equipmentId) hasSignificantChanges = true;
    if (JSON.stringify(getServiceTypeKeys(originalSchedule.serviceType)) !== JSON.stringify(getServiceTypeKeys(serviceType))) hasSignificantChanges = true;
    if (originalSchedule.includes_travel !== (includesTravel !== undefined ? includesTravel : false)) hasSignificantChanges = true;
    if (originalSchedule.classification !== (classification || 'geral')) hasSignificantChanges = true;
    if (originalSchedule.priority !== (data.priority || originalSchedule.priority || null)) hasSignificantChanges = true;

    const origStart = originalSchedule.startDate ? new Date(originalSchedule.startDate).getTime() : 0;
    const newStart = startDate ? new Date(startDate).getTime() : 0;
    if (Math.abs(origStart - newStart) > 1000) hasSignificantChanges = true;

    const origEnd = originalSchedule.endDate ? new Date(originalSchedule.endDate).getTime() : 0;
    const newEnd = endDate ? new Date(endDate).getTime() : 0;
    if (Math.abs(origEnd - newEnd) > 1000) hasSignificantChanges = true;

    // Check technician changes
    const { rows: existingTechRows } = await db.query<ScheduleTechnician>('SELECT "technicianId" FROM schedule_technicians WHERE "scheduleId" = $1', [scheduleId]);
    const existingTechIds = existingTechRows.map(r => String(r.technicianId)).sort();
    const incomingTechIds = (technicianIds || []).map((id: any) => String(id)).sort();
    if (JSON.stringify(existingTechIds) !== JSON.stringify(incomingTechIds)) hasSignificantChanges = true;

    // Check parts changes
    const { rows: existingPartRows } = await db.query<SchedulePart>('SELECT "partId", quantity, stock_type FROM schedule_parts WHERE "scheduleId" = $1', [scheduleId]);
    const existingParts = existingPartRows.map(p => ({ id: p.partId, qty: Number(p.quantity), st: p.stock_type || StockType.GENERAL })).sort((a, b) => (a.id || 0) - (b.id || 0));
    const incomingParts = (parts || []).map((p: any) => ({ id: p.id, qty: Number(p.quantity), st: p.stockType || StockType.GENERAL })).sort((a: any, b: any) => (a.id || 0) - (b.id || 0));
    if (JSON.stringify(existingParts) !== JSON.stringify(incomingParts)) hasSignificantChanges = true;

    // Check time blocks changes
    const { rows: existingTBRows } = await db.query<ScheduleTimeBlock>('SELECT start_time, end_time FROM schedule_time_blocks WHERE schedule_id = $1', [scheduleId]);
    const existingTBs = existingTBRows.map(r => ({ start: new Date(r.start_time).getTime(), end: new Date(r.end_time).getTime() })).sort((a, b) => a.start - b.start);
    const incomingTBs = (timeBlocks || []).map((tb: any) => ({ start: new Date(tb.start).getTime(), end: new Date(tb.end).getTime() })).sort((a: any, b: any) => a.start - b.start);
    if (JSON.stringify(existingTBs) !== JSON.stringify(incomingTBs)) hasSignificantChanges = true;

    // Determine new acknowledgement state
    let newAcknowledgementState = originalSchedule.acknowledgementState;
    if (isCompleted) {
        newAcknowledgementState = ScheduleStatus.COMPLETED;
    } else if (originalSchedule.acknowledgementState === ScheduleStatus.PENDING_SCHEDULING && startDate) {
        newAcknowledgementState = ScheduleStatus.PENDING;
    } else if (hasSignificantChanges) {
        // Reset to pending if significant changes occurred, so technicians must confirm again
        newAcknowledgementState = ScheduleStatus.PENDING;
    }

    const { rows: updatedRows } = await db.query<Schedule>(
        `UPDATE schedules SET 
            title = $1, "startDate" = $2, "endDate" = $3, "clientId" = $4, "equipmentId" = $5, 
            "isCompleted" = $6, "additionalInfo" = $7, "serviceType" = $8, "ticketId" = $9,
            "acknowledgementState" = $10, "includes_travel" = $11, "classification" = $12, "priority" = $13
        WHERE id = $14 RETURNING *`,
        [
            generatedTitle,
            startDate || null,
            endDate || null,
            clientId,
            equipmentId,
            isCompleted || false,
            internalNotes,
            JSON.stringify(Array.isArray(serviceType) ? serviceType : (serviceType ? [serviceType] : [])),
            ticketId,
            newAcknowledgementState || ScheduleStatus.PENDING,
            includesTravel !== undefined ? includesTravel : false,
            classification || 'geral',
            data.priority || originalSchedule.priority || null,
            scheduleId
        ]
    );
    const updatedSchedule = updatedRows[0];

    // Google Calendar Cleanup List
    const { rows: existingBlocksRows } = await db.query<ScheduleTimeBlock>('SELECT google_event_id FROM schedule_time_blocks WHERE schedule_id = $1 AND google_event_id IS NOT NULL', [scheduleId]);
    const googleEventIdsToCleanup = existingBlocksRows.map((r) => r.google_event_id).filter((id): id is string => id !== null);

    await syncTimeBlocks(db, scheduleId, timeBlocks, startDate, endDate);
    await syncTechnicians(db, scheduleId, technicianIds);
    await syncPartsAndReservations(db, scheduleId, parts, isCompleted, !!wasAlreadyCompleted);

    if (ticketId) {
        await db.query('UPDATE tickets SET "scheduleId" = $1, status = $2, scheduled_at = $3 WHERE id = $4', [scheduleId, isCompleted ? TicketStatus.CLOSED : TicketStatus.SCHEDULED, startDate, ticketId]);
    }

    return { updatedSchedule, hasSignificantChanges, googleEventIdsToCleanup };
}

/**
 * Completes a schedule
 */
export async function completeFullSchedule(db: PoolClient, scheduleId: number, data: any) {
    const {
        startDate, endDate, clientId, equipmentId, technicianIds,
        ticketId, internalNotes, serviceType, parts, classification,
        timeBlocks, includesTravel
    } = data;

    const { rows: origRows } = await db.query<{ isCompleted: boolean }>('SELECT "isCompleted" FROM schedules WHERE id = $1', [scheduleId]);
    const wasAlreadyCompleted = origRows.length > 0 && origRows[0].isCompleted;

    const generatedTitle = await generateScheduleTitle(supabase, clientId, equipmentId, serviceType);

    const { rows } = await db.query<Schedule>(
        `UPDATE schedules SET title = $1, "startDate" = $2, "endDate" = $3, "clientId" = $4, "equipmentId" = $5, "isCompleted" = true, "additionalInfo" = $6, "serviceType" = $7, "includes_travel" = $8, "classification" = $9 WHERE id = $10 RETURNING *`,
        [generatedTitle, startDate, endDate, clientId, equipmentId, internalNotes, serviceType, includesTravel || false, classification || 'geral', scheduleId]
    );
    const updated = rows[0];

    const { rows: blockRows } = await db.query<ScheduleTimeBlock>('SELECT google_event_id FROM schedule_time_blocks WHERE schedule_id = $1 AND google_event_id IS NOT NULL', [scheduleId]);
    const googleEventIdsToCleanup = blockRows.map((r) => r.google_event_id).filter((id): id is string => id !== null);

    await syncTimeBlocks(db, scheduleId, timeBlocks, startDate, endDate);
    await syncTechnicians(db, scheduleId, technicianIds);
    await syncPartsAndReservations(db, scheduleId, parts, true, !!wasAlreadyCompleted); // isCompleted = true

    if (ticketId) {
        await db.query('UPDATE tickets SET "scheduleId" = $1, status = $2, scheduled_at = $3 WHERE id = $4', [scheduleId, TicketStatus.CLOSED, startDate, ticketId]);
    }

    return { updated, googleEventIdsToCleanup };
}
