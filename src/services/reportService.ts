//Horas de desenvolvimento activo=24,5
import { PoolClient } from 'pg';
import * as inventoryService from './inventoryService';
import * as billingService from './billingService';
import { logger } from '../utils/logger';
import { StockType, BillingStatus } from '../types';
import { Report, Part, Schedule, ReportPart, BillingTask } from '../types/supabase';
import { notifyUsers } from './notificationService';
import { pool } from '../config/db';
import { NotFoundError } from '../utils/ApiError';

/**
 * Generates a report number in the format YYYYXXXX
 */
async function generateReportNumber(db: PoolClient, serviceDate: string, scheduleId?: number): Promise<string> {
    let scheduleYear = new Date(serviceDate).getFullYear();

    if (scheduleId) {
        const { rows } = await db.query<Schedule>('SELECT "startDate" FROM schedules WHERE id = $1', [scheduleId]);
        if (rows.length > 0 && rows[0].startDate) {
            scheduleYear = new Date(rows[0].startDate).getFullYear();
        }
    }

    const minReportNum = scheduleYear * 10000;
    const maxReportNum = minReportNum + 9999;

    const { rows: maxReportRows } = await db.query<Report>(
        'SELECT report_number FROM reports WHERE report_number >= $1 AND report_number <= $2 ORDER BY report_number DESC LIMIT 1',
        [minReportNum, maxReportNum]
    );

    let nextSequence = 1;
    if (maxReportRows.length > 0 && maxReportRows[0].report_number) {
        nextSequence = parseInt(String(maxReportRows[0].report_number).slice(4), 10) + 1;
    }
    return `${scheduleYear}${String(nextSequence).padStart(4, '0')}`;
}

/**
 * Syncs technicians for a report
 */
async function syncReportTechnicians(db: PoolClient, reportId: number, technicianIds: string[], signatures?: Record<string, string | null>) {
    await db.query('DELETE FROM report_technicians WHERE "reportId" = $1', [reportId]);
    if (Array.isArray(technicianIds) && technicianIds.length > 0) {
        for (const techId of technicianIds) {
            await db.query(
                'INSERT INTO report_technicians ("reportId", "technicianId", "signature") VALUES ($1, $2, $3)',
                [reportId, techId, signatures ? signatures[techId] : null]
            );
        }
    }
}

async function syncReportPartsAndAbate(db: PoolClient, reportId: number, parts: any[], isUpdate: boolean = false, oldParts: any[] = [], userId: string = '') {
    // 1. Summarize NEW parts
    const finalMap = new Map<string, { partId: number; quantity: number; stockType: StockType; designation: string; isApplied: boolean }>();
    if (Array.isArray(parts)) {
        for (const p of parts) {
            let pId = p.id;
            if (!pId && p.reference) {
                const cleanedRef = p.reference.trim();
                const { rows } = await db.query('SELECT id, track_stock FROM parts WHERE reference = $1 OR TRIM(reference) = $1', [cleanedRef]);
                if (rows.length > 0) {
                    pId = rows[0].id;
                    p.track_stock = rows[0].track_stock;
                }
            }
            if (!pId) continue;

            const qty = Number(p.quantity) || 0;
            if (qty <= 0) continue;

            // Handle different property names from frontend
            const st = (p.stockType || p.stock_type || StockType.GENERAL) as StockType;
            const designation = p.designation || '';
            const isApplied = p.isApplied !== false;

            // If it's a virtual part, we might NOT want to merge them if they have different designations.
            // Even if we merge, we need the designation in the key to distinguish variations.
            const key = `${pId}_${st}_${designation}_${isApplied}`;

            const existing = finalMap.get(key);
            if (existing) {
                existing.quantity += qty;
            } else {
                finalMap.set(key, { partId: pId, quantity: qty, stockType: st, designation, isApplied });
            }
        }
    }

    // 2. Summarize OLD parts
    const oldMap = new Map<string, number>();
    for (const op of oldParts) {
        const key = `${op.partId}_${op.stock_type || StockType.GENERAL}_${op.designation || ''}`;
        oldMap.set(key, Number(op.quantity));
    }

    // 3. Process Deltas
    const allKeys = new Set([...oldMap.keys(), ...finalMap.keys()]);
    for (const key of allKeys) {
        const oldQty = oldMap.get(key) || 0;
        const fresh = finalMap.get(key);
        const newQty = fresh ? fresh.quantity : 0;
        const delta = newQty - oldQty;

        if (delta !== 0) {
            const parts = key.split('_');
            const pId = parseInt(parts[0], 10);
            const st = parts[1];

            // Note: delta > 0 means more parts used (decrement stock)
            // delta < 0 means parts removed (increment stock)
            await inventoryService.abatePartInventory(db, pId, delta, st as StockType, true, userId, reportId);
            await inventoryService.syncPartStock(db, pId);
        }
    }

    // 4. Update the relationship table
    await db.query('DELETE FROM report_parts WHERE "reportId" = $1', [reportId]);
    for (const part of finalMap.values()) {
        await db.query(
            'INSERT INTO report_parts ("reportId", "partId", "quantity", "stock_type", "designation", "is_applied") VALUES ($1, $2, $3, $4, $5, $6)',
            [reportId, part.partId, part.quantity, part.stockType, part.designation, part.isApplied]
        );
    }
}

/**
 * Detects if incoming parts list differs from current DB parts in billing-affecting ways:
 * quantity change, stock_type change, addition or removal of parts.
 */
function detectBillingPartsChange(oldParts: ReportPart[], newPartsRaw: any[]): boolean {
    // Build old map: key = partId_stockType_designation → quantity
    const oldMap = new Map<string, number>();
    for (const op of oldParts) {
        const key = `${op.partId}_${op.stock_type || StockType.GENERAL}_${op.designation || ''}`;
        oldMap.set(key, Number(op.quantity));
    }

    // Build new map from incoming data
    const newMap = new Map<string, number>();
    if (Array.isArray(newPartsRaw)) {
        for (const p of newPartsRaw) {
            const pId = p.id || p.partId;
            if (!pId) continue;
            const qty = Number(p.quantity) || 0;
            if (qty <= 0) continue;
            const st = p.stockType || p.stock_type || StockType.GENERAL;
            const designation = p.designation || '';
            const key = `${pId}_${st}_${designation}`;
            newMap.set(key, (newMap.get(key) || 0) + qty);
        }
    }

    if (oldMap.size !== newMap.size) return true;

    for (const [key, oldQty] of oldMap) {
        const newQty = newMap.get(key);
        if (newQty === undefined || newQty !== oldQty) return true;
    }
    return false;
}

/**
 * Creates a full report with all relations and side effects
 */
export async function createFullReport(db: PoolClient, data: any, creatorId: string) {
    const {
        clientId, equipmentId, scheduleId, technicianIds,
        serviceDate, hours, parts, description, damage,
        serviceType, internalNotes, signature, technician_signature,
        classification, technicianSignatures, isBillingPending, includesTravel,
        timeBlocks, client_signer_name
    } = data;

    const newReportNumber = await generateReportNumber(db, serviceDate, scheduleId);

    const { rows } = await db.query<Report>(
        `INSERT INTO reports (
            "clientId", "equipmentId", "scheduleId", "serviceDate", "hours",
            "description", "damage", "serviceType", "internal_notes",
            "report_number", "signature", "technician_signature",
            "includes_travel", "classification", "created_by", "updated_by", "time_blocks",
            "client_signer_name"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
        [
            clientId, equipmentId, scheduleId, serviceDate, hours,
            description, damage || '', JSON.stringify(Array.isArray(serviceType) ? serviceType : (serviceType ? [serviceType] : [])), internalNotes || '',
            newReportNumber, signature || '', technician_signature || '',
            includesTravel !== undefined ? includesTravel : false,
            classification || 'geral',
            creatorId,
            creatorId, // updated_by also creator initially
            timeBlocks ? JSON.stringify(timeBlocks) : null,
            client_signer_name || null
        ]
    );
    const reportId = rows[0].id;

    await syncReportTechnicians(db, reportId, technicianIds, technicianSignatures);
    await syncReportPartsAndAbate(db, reportId, parts, false, [], creatorId);

    if (scheduleId) {
        // Mark as having a report AND being completed
        await db.query('UPDATE schedules SET "hasReport" = true, "isCompleted" = true WHERE id = $1', [scheduleId]);

        // Ensure reservations for the schedule are released/synced
        const { rows: schParts } = await db.query('SELECT "partId" FROM schedule_parts WHERE "scheduleId" = $1', [scheduleId]);
        if (schParts.length > 0) {
            await inventoryService.syncMultiplePartsReservations(db, schParts.map(p => p.partId));
        }
    }

    await billingService.createBillingTask(db, reportId, isBillingPending === true);

    // A notificação de clientes deve ser feita APÓS a transação fechar (no controller/service principal),
    // caso contrário a query de notificação pode não encontrar o relatório (race condition de COMMIT).

    return reportId;
}

/**
 * Notifica os utilizadores associados ao cliente sobre a disponibilidade de um novo relatório técnico.
 */
export async function sendReportNotificationToClients(reportId: number) {
    try {
        const { rows } = await pool.query(`
            SELECT r.id, r.report_number, r."clientId" AS "clientId", c.name as client_name,
                   e.brand, e.model, e."serialNumber", e.nickname
            FROM reports r
            JOIN clients c ON r."clientId" = c.id
            LEFT JOIN equipments e ON r."equipmentId" = e.id
            WHERE r.id = $1
        `, [reportId]);

        if (rows.length === 0) {
            logger.warn({ reportId }, 'sendReportNotificationToClients: report not found');
            return;
        }
        const report = rows[0];

        const { rows: recipients } = await pool.query(`
            SELECT cu.user_id, p.first_name
            FROM client_users cu
            JOIN profiles p ON p.id = cu.user_id
            WHERE cu.client_id = $1 AND p.role = 'client'
        `, [report.clientId]);

        if (recipients.length > 0) {
            const userIds = recipients.map(r => r.user_id);
            const clientUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/portal`;
            const reportUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/report/print/${reportId}`;
            const equipParts = [
                report.brand && report.model ? `${report.brand} ${report.model}` : null,
                report.serialNumber ? `S/N: ${report.serialNumber}` : null,
                report.nickname ? `(${report.nickname})` : null
            ].filter(Boolean);
            const equipInfo = equipParts.length > 0 ? equipParts.join(' — ') : 'Sem equipamento';

            await notifyUsers(userIds, 'new_report', {
                templateKey: 'new_report',
                variables: {
                    first_name: recipients[0].first_name || 'Cliente',
                    reportId: String(reportId),
                    reportNumber: report.report_number,
                    equipInfo: equipInfo,
                    clientUrl: clientUrl,
                    reportUrl: reportUrl
                },
                telegramText: `📑 *RELATÓRIO TÉCNICO DISPONÍVEL*\n\n*Número:* ${report.report_number}\n*Equipamento:* ${equipInfo}\n\nO relatório da intervenção já pode ser consultado no portal.\n\n[Ver Relatório](${reportUrl})`
            });
        }
    } catch (err) {
        logger.error({ err, reportId }, 'Error sending report notification to clients');
    }
}

/**
 * Updates a full report
 */
export async function updateFullReport(db: PoolClient, reportId: number, data: any, userId: string = '') {
    const {
        clientId, equipmentId, scheduleId, technicianIds,
        serviceDate, hours, parts, description, damage,
        serviceType, internalNotes, signature, technician_signature,
        classification, technicianSignatures, isBillingPending, includesTravel,
        timeBlocks, client_signer_name
    } = data;

    const { rows: oldParts } = await db.query<ReportPart>('SELECT "partId", quantity, stock_type, designation FROM report_parts WHERE "reportId" = $1', [reportId]);

    // Fetch current report data BEFORE update to detect billing-affecting changes
    const { rows: currentReportRows } = await db.query<Report>(
        'SELECT hours, includes_travel FROM reports WHERE id = $1',
        [reportId]
    );
    const currentReport = currentReportRows[0];

    await db.query(
        `UPDATE reports SET 
            "clientId" = $1, "equipmentId" = $2, "scheduleId" = $3, "serviceDate" = $4, "hours" = $5,
            "description" = $6, "damage" = $7, "serviceType" = $8, "internal_notes" = $9,
            "signature" = $10, "technician_signature" = $11, "includes_travel" = $12,
            "classification" = $13, "time_blocks" = $14, "client_signer_name" = $15,
            "updated_by" = $16
        WHERE id = $17`,
        [
            clientId, equipmentId, scheduleId, serviceDate, hours,
            description, damage || '', JSON.stringify(Array.isArray(serviceType) ? serviceType : (serviceType ? [serviceType] : [])), internalNotes || '',
            signature, technician_signature, includesTravel,
            classification || 'geral',
            timeBlocks ? JSON.stringify(timeBlocks) : null,
            client_signer_name || null,
            userId,
            reportId
        ]
    );

    await syncReportTechnicians(db, reportId, technicianIds, technicianSignatures);
    await syncReportPartsAndAbate(db, reportId, parts, true, oldParts, userId);

    // Check if billing task is BILLED and any billing-affecting field changed → NEEDS_REVIEW
    {
        const { rows: taskRows } = await db.query<BillingTask>('SELECT id, status FROM billing_tasks WHERE report_id = $1', [reportId]);
        const task = taskRows[0];

        if (task?.status === BillingStatus.BILLED && currentReport) {
            const hoursChanged = Number(currentReport.hours) !== Number(hours);
            const travelChanged = Boolean(currentReport.includes_travel) !== Boolean(includesTravel);
            const partsChanged = detectBillingPartsChange(oldParts, parts);

            if (hoursChanged || travelChanged || partsChanged) {
                logger.info({ reportId, hoursChanged, travelChanged, partsChanged }, 'Billed report edited with billing-affecting changes → NEEDS_REVIEW');
                await billingService.updateBillingTaskStatus(db, task.id, BillingStatus.NEEDS_REVIEW);
            }
        }
    }

    if (isBillingPending !== undefined) {
        const isPending = isBillingPending === true;
        const { rows: taskRows } = await db.query<BillingTask>('SELECT id, status FROM billing_tasks WHERE report_id = $1', [reportId]);
        const task = taskRows[0];

        if (task) {
            if (isPending) {
                if (task.status !== BillingStatus.BILLED && task.status !== BillingStatus.PENDING_COMPLETION && task.status !== BillingStatus.NEEDS_REVIEW) {
                    await billingService.updateBillingTaskStatus(db, task.id, BillingStatus.PENDING_COMPLETION);
                }
            } else {
                if (task.status === BillingStatus.PENDING_COMPLETION) {
                    await billingService.updateBillingTaskStatus(db, task.id, BillingStatus.REPORT_ISSUED);
                }
            }
        }
    }
}

/**
 * Deletes a report (logical delete)
 */
export async function deleteFullReport(db: PoolClient, reportId: number, userId: string, restoreParts: boolean) {
    const { rows: reportRows } = await db.query<Report>('SELECT id, "scheduleId" FROM reports WHERE id = $1', [reportId]);
    if (reportRows.length === 0) throw new NotFoundError('Relatório não encontrado');
    const report = reportRows[0];

    if (restoreParts) {
        const { rows: parts } = await db.query<ReportPart>('SELECT "partId", quantity, stock_type FROM report_parts WHERE "reportId" = $1', [reportId]);
        for (const p of parts) {
            await inventoryService.abatePartInventory(db, p.partId, -Number(p.quantity), (p.stock_type as StockType) || StockType.GENERAL, true, userId, reportId);
        }
    }

    if (report.scheduleId) {
        await db.query('UPDATE schedules SET "hasReport" = false WHERE id = $1', [report.scheduleId]);
    }

    await db.query(
        'UPDATE reports SET deleted_at = $1, deleted_by = $2 WHERE id = $3',
        [new Date().toISOString(), userId, reportId]
    );
}
