//Horas de desenvolvimento activo=32,5
import { SupabaseClient } from '@supabase/supabase-js';
import { Pool, PoolClient } from 'pg';
import { StockType } from '../types';
import { logger } from '../utils/logger';
import { Database } from '../types/db.types';
import { Part, PartUpdate, PartComponent } from '../types/supabase';
import { BadRequestError, NotFoundError } from '../utils/ApiError';

export const calculateNewQuantity = (current: number, change: number): number => {
    return Math.max(0, current + change);
};

export interface PartUpdateResult {
    newStock: number;
    newReserved: number;
    newOrdered: number;
    newStockFoss: number;
    newReservedFoss: number;
    newOrderedFoss: number;
}

export const enrichPart = (p: any) => {
    const rawStock = Number(p.stock_quantity || 0);
    const rawReserved = Number(p.reserved_quantity || 0);
    const rawStockFoss = Number(p.stock_quantity_foss || 0);
    const rawReservedFoss = Number(p.reserved_quantity_foss || 0);

    const isComposed = !!p.is_composed;
    const virtualStock = Number(p.virtual_stock || 0);
    const virtualStockFoss = Number(p.virtual_stock_foss || 0);

    return {
        ...p,
        // stock_quantity deve ser o total (físico ou potencial máximo)
        stock_quantity: isComposed ? virtualStock : rawStock,
        stock_quantity_foss: isComposed ? virtualStockFoss : rawStockFoss,

        // Campos novos para disponibilidade real
        available_quantity: isComposed
            ? (virtualStock - rawReserved)
            : (rawStock - rawReserved),
        available_quantity_foss: isComposed
            ? (virtualStockFoss - rawReservedFoss)
            : (rawStockFoss - rawReservedFoss),

        reserved_quantity: rawReserved,
        reserved_quantity_foss: rawReservedFoss,
        raw_stock_quantity: rawStock,
        raw_stock_foss: rawStockFoss
    };
};

export const processStockUpdate = (
    current: { stock: number; ordered: number; stockFoss: number; orderedFoss: number },
    change: number,
    isFromOrder: boolean,
    targetStock: StockType.GENERAL | StockType.FOSS
): { newStock: number; newOrdered: number; newStockFoss: number; newOrderedFoss: number } => {
    let newStock = current.stock;
    let newStockFoss = current.stockFoss;
    let newOrdered = current.ordered;
    let newOrderedFoss = current.orderedFoss;

    if (targetStock === StockType.FOSS) {
        newStockFoss = Math.max(0, current.stockFoss + change);
        if (isFromOrder && change > 0) {
            newOrderedFoss = Math.max(0, current.orderedFoss - change);
        }
    } else {
        newStock = Math.max(0, current.stock + change);
        if (isFromOrder && change > 0) {
            newOrdered = Math.max(0, current.ordered - change);
        }
    }

    return { newStock, newOrdered, newStockFoss, newOrderedFoss };
};

export const hasEnoughStock = (stock: number, reserved: number, requested: number): boolean => {
    return (stock - reserved) >= requested;
};

export const processReportAbate = (
    current: { stock: number; reserved: number; stockFoss: number; reservedFoss: number },
    quantityUsed: number,
    stockType: StockType,
    skipReserved: boolean = false
): { newStock: number; newReserved: number; newStockFoss: number; newReservedFoss: number } => {
    let newStock = current.stock;
    let newReserved = current.reserved;
    let newStockFoss = current.stockFoss;
    let newReservedFoss = current.reservedFoss;

    if (stockType === StockType.FOSS) {
        newStockFoss = current.stockFoss - quantityUsed; // Permite negativo
        if (!skipReserved) {
            newReservedFoss = Math.max(0, current.reservedFoss - quantityUsed);
        }
    } else if (stockType === StockType.GENERAL || stockType === StockType.MSD || stockType === StockType.CONTRACT) {
        newStock = current.stock - quantityUsed; // Permite negativo
        if (!skipReserved) {
            newReserved = Math.max(0, current.reserved - quantityUsed);
        }
    }

    return {
        newStock,
        newReserved,
        newStockFoss,
        newReservedFoss
    };
};

export async function abatePartInventory(
    db: PoolClient, 
    partId: number, 
    quantity: number, 
    stockType: StockType = StockType.GENERAL, 
    skipReserved: boolean = false,
    userId: string = '',
    reportId?: number
): Promise<void> {
    if (stockType === StockType.CLIENT || stockType === StockType.WARRANTY) {
        logger.debug({ partId, stockType }, `[DEBUG_INV] Skipping inventory abatement for this stock type.`);
        return;
    }

    const { rows } = await db.query<Part>(
        'SELECT stock_quantity, reserved_quantity, stock_quantity_foss, reserved_quantity_foss, designation, is_composed, track_stock FROM parts WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [partId]
    );

    const currentPart = rows[0];

    if (!currentPart) {
        logger.error(`[ERROR_INV] Part not found ${partId}:`);
        return;
    }

    if (currentPart.track_stock === false) {
        logger.debug({ partId, designation: currentPart.designation }, `[DEBUG_INV] Skipping inventory abatement: Part is virtual (track_stock=false).`);
        return;
    }

    if (currentPart.is_composed) {
        logger.debug({ partId }, `[DEBUG_INV] Part is composed. Exploding components...`);
        const { rows: components } = await db.query<PartComponent>(
            'SELECT child_part_id, quantity FROM part_components WHERE parent_part_id = $1',
            [partId]
        );

        if (components && components.length > 0) {
            for (const comp of components) {
                if (comp.child_part_id) {
                    await abatePartInventory(db, comp.child_part_id, Number(comp.quantity) * quantity, stockType, skipReserved, userId, reportId);
                }
            }
        }

        // Even for composed parts, we should update the parent's reservation if not skipReserved
        if (!skipReserved) {
            const result = processReportAbate(
                {
                    stock: 0, // Kit has no physical stock
                    reserved: currentPart.reserved_quantity || 0,
                    stockFoss: 0,
                    reservedFoss: currentPart.reserved_quantity_foss || 0
                },
                quantity,
                stockType,
                false
            );
            await db.query(
                'UPDATE parts SET reserved_quantity = $1, reserved_quantity_foss = $2 WHERE id = $3',
                [result.newReserved, result.newReservedFoss, partId]
            );
        }
    } else {
        const result = processReportAbate(
            {
                stock: currentPart.stock_quantity || 0,
                reserved: currentPart.reserved_quantity || 0,
                stockFoss: currentPart.stock_quantity_foss || 0,
                reservedFoss: currentPart.reserved_quantity_foss || 0
            },
            quantity,
            stockType,
            skipReserved
        );

        logger.debug({
            partId,
            designation: currentPart.designation,
            stockType,
            skipReserved,
            old: { stock: currentPart.stock_quantity, foss: currentPart.stock_quantity_foss, reserved: currentPart.reserved_quantity },
            new: { stock: result.newStock, foss: result.newStockFoss, reserved: result.newReserved }
        }, `[DEBUG_INV] Abating Part Inventory via Ledger`);

        // Registo na Ledger (Trigger trata de abater stock físico e ordered)
        const mappedStockType = (stockType === StockType.FOSS || stockType === StockType.CONTRACT) ? 'foss' : 'general';
        const safeUserId = userId && userId.trim() ? userId : null; // '' is not a valid UUID
        await db.query(`
            INSERT INTO parts_transactions (part_id, user_id, quantity, stock_type, type, notes, reference_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            partId,
            safeUserId,
            -quantity, // Abate is negative
            mappedStockType,
            'SERVICE_REPORT',
            `Abate via Relatório #${reportId || '?'}`,
            reportId ? String(reportId) : null
        ]);

        // Manter o update só das reservas (não tratadas pelo trigger da Ledger)
        if (!skipReserved) {
            await db.query(
                'UPDATE parts SET reserved_quantity = $1, reserved_quantity_foss = $2 WHERE id = $3',
                [result.newReserved, result.newReservedFoss, partId]
            );
        }
    }
}

export async function updatePartReservation(db: PoolClient, partId: number, change: number, stockType: StockType = StockType.GENERAL): Promise<void> {
    if (stockType === StockType.CLIENT || stockType === StockType.WARRANTY) {
        logger.debug({ partId, stockType }, `[DEBUG_INV] Skipping reservation update for this stock type.`);
        return;
    }

    const { rows } = await db.query<Part>(
        'SELECT reserved_quantity, reserved_quantity_foss, designation, is_composed, track_stock FROM parts WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [partId]
    );

    const currentPart = rows[0];

    if (!currentPart) {
        logger.error(`[ERROR_INV] Part not found ${partId}:`);
        return;
    }

    if (currentPart.track_stock === false) {
        logger.debug({ partId, designation: currentPart.designation }, `[DEBUG_INV] Skipping reservation update: Part is virtual (track_stock=false).`);
        return;
    }

    let sqlSet = [];
    let sqlParams = [];

    if (stockType === StockType.FOSS) {
        const newReservedQuantity = Math.max(0, (currentPart.reserved_quantity_foss || 0) + change);
        sqlSet.push('reserved_quantity_foss = GREATEST(0, $1)');
        sqlParams.push(newReservedQuantity);
        logger.debug({
            partId,
            designation: currentPart.designation,
            old: currentPart.reserved_quantity_foss,
            change,
            new: newReservedQuantity
        }, `[DEBUG_INV] Updating Part Reservation (FOSS)`);
    } else if (stockType === StockType.GENERAL || stockType === StockType.MSD || stockType === StockType.CONTRACT) {
        const newReservedQuantity = Math.max(0, (currentPart.reserved_quantity || 0) + change);
        sqlSet.push('reserved_quantity = GREATEST(0, $1)');
        sqlParams.push(newReservedQuantity);
        logger.debug({
            partId,
            designation: currentPart.designation,
            old: currentPart.reserved_quantity,
            change,
            new: newReservedQuantity
        }, `[DEBUG_INV] Updating Part Reservation (GENERAL/MSD/CONTRACT)`);
    }

    sqlParams.push(partId);
    await db.query(`UPDATE parts SET ${sqlSet.join(', ')} WHERE id = $${sqlParams.length}`, sqlParams);

    if (currentPart.is_composed) {
        logger.debug({ partId }, `[DEBUG_INV] Part is composed. Propagating reservation change to components...`);
        const { rows: components } = await db.query<PartComponent>(
            'SELECT child_part_id, quantity FROM part_components WHERE parent_part_id = $1',
            [partId]
        );

        if (components && components.length > 0) {
            for (const comp of components) {
                if (comp.child_part_id) {
                    await updatePartReservation(db, comp.child_part_id, Number(comp.quantity) * change, stockType);
                }
            }
        }
    }
}

/**
 * Creates a composed part (kit) with its components
 */
export async function createComposedPart(db: PoolClient, data: any): Promise<any> {
    const { reference, designation, components, price, notes } = data;

    const { rows: existingRows } = await db.query<Part>('SELECT id FROM parts WHERE reference = $1 AND deleted_at IS NULL', [reference]);
    if (existingRows.length > 0) throw new BadRequestError('Já existe uma peça com esta referência.');

    const { rows } = await db.query<Part>(
        `INSERT INTO parts (reference, designation, is_composed, stock_quantity, reserved_quantity, ordered_quantity, stock_quantity_foss, reserved_quantity_foss, ordered_quantity_foss, price, notes, track_stock) 
         VALUES ($1, $2, true, 0, 0, 0, 0, 0, 0, $3, $4, $5) RETURNING *`,
        [reference, designation, price || 0, notes || '', data.track_stock !== false]
    );
    const parentPart = rows[0];

    const componentsData = [];
    if (Array.isArray(components) && components.length > 0) {
        for (const comp of components) {
            await db.query(
                'INSERT INTO part_components (parent_part_id, child_part_id, quantity) VALUES ($1, $2, $3)',
                [parentPart.id, comp.partId, comp.quantity]
            );
            componentsData.push({ parent_part_id: parentPart.id, child_part_id: comp.partId, quantity: comp.quantity });
        }
    }
    return { ...parentPart, components: componentsData };
}

/**
 * Updates a composed part (kit) and its components
 */
export async function updateComposedPart(db: PoolClient, partId: number, data: any): Promise<any> {
    const { reference, designation, components, price, notes } = data;

    const { rows } = await db.query<Part>(
        'UPDATE parts SET reference = $1, designation = $2, price = $3, notes = $4, track_stock = $5 WHERE id = $6 RETURNING *',
        [reference, designation, price || 0, notes || '', data.track_stock !== false, partId]
    );
    const parentPart = rows[0];
    if (!parentPart) throw new NotFoundError('Part not found');

    await db.query('DELETE FROM part_components WHERE parent_part_id = $1', [partId]);

    const componentsData = [];
    if (Array.isArray(components) && components.length > 0) {
        for (const comp of components) {
            await db.query(
                'INSERT INTO part_components (parent_part_id, child_part_id, quantity) VALUES ($1, $2, $3)',
                [partId, comp.partId, comp.quantity]
            );
            componentsData.push({ parent_part_id: partId, child_part_id: comp.partId, quantity: comp.quantity });
        }
    }
    return { ...parentPart, components: componentsData };
}

/**
 * Updates stock for a part using Ledger
 */
export async function updatePartStock(db: PoolClient, partId: number, data: any, userId: string): Promise<Part> {
    const { quantity, fromOrder, targetStock, notes, type: providedType, reference_id } = data;

    // Se fromOrder, gera transação PURCHASE_ORDER
    const type = fromOrder ? 'PURCHASE_ORDER' : (providedType || 'MANUAL_ADJUST');
    
    let finalNotes = notes;
    if (!finalNotes) {
        if (fromOrder) finalNotes = `Entrada via Encomenda #${reference_id || '?'}`;
        else if (providedType === 'MANUAL_ADJUST') finalNotes = 'Ajuste manual de stock';
        else finalNotes = 'Ajuste de inventário';
    }

    const mappedStockType = (targetStock === StockType.FOSS || targetStock === StockType.CONTRACT) ? 'foss' : 'general';
    const safeUserId = userId && userId.trim() ? userId : null;

    await db.query(`
        INSERT INTO parts_transactions (part_id, user_id, quantity, stock_type, type, notes, reference_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [partId, safeUserId, quantity, mappedStockType, type, finalNotes, reference_id || null]);

    const { rows } = await db.query<Part>('SELECT * FROM parts WHERE id = $1', [partId]);
    return enrichPart(rows[0]);
}

/**
 * Registers a direct sale (abating stock)
 */
export async function registerDirectSale(db: PoolClient, data: any, userId: string): Promise<Part> {
    const { part_id, quantity, stock_type, notes, reference_id } = data;
    
    const mappedStockType = (stock_type === StockType.FOSS || stock_type === StockType.CONTRACT) ? 'foss' : 'general';
    const safeUserId = userId && userId.trim() ? userId : null;

    await db.query(`
        INSERT INTO parts_transactions (part_id, user_id, quantity, stock_type, type, notes, reference_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [part_id, safeUserId, -quantity, mappedStockType, 'DIRECT_SALE', notes, reference_id]);

    const { rows } = await db.query<Part>('SELECT * FROM parts WHERE id = $1', [part_id]);
    return enrichPart(rows[0]);
}

/**
 * Synchronizes reserved quantity based on active schedules
 */
export async function syncPartStock(db: PoolClient, partId: number): Promise<Part> {
    const { rows } = await db.query<{ total: number; stock_type: string }>(
        `SELECT 
            COALESCE(SUM(quantity), 0) as total,
            stock_type
         FROM (
            -- Direct Reservations
            SELECT sp.quantity, sp.stock_type
            FROM schedule_parts sp
            JOIN schedules s ON sp."scheduleId" = s.id
            WHERE sp."partId" = $1 AND s."isCompleted" = false
            
            UNION ALL
            
            -- Reservations via Kits (where this part is a component)
            SELECT (sp.quantity * pc.quantity) as quantity, sp.stock_type
            FROM part_components pc
            JOIN schedule_parts sp ON pc.parent_part_id = sp."partId"
            JOIN schedules s ON sp."scheduleId" = s.id
            WHERE pc.child_part_id = $1 AND s."isCompleted" = false
         ) as all_res
         GROUP BY stock_type`,
        [partId]
    );

    let generalReserved = 0;
    let fossReserved = 0;

    rows.forEach((item: { total: number; stock_type: string }) => {
        if (item.stock_type === StockType.FOSS) {
            fossReserved = Number(item.total);
        } else if (item.stock_type === StockType.GENERAL || item.stock_type === StockType.MSD || item.stock_type === StockType.CONTRACT) {
            generalReserved += Number(item.total);
        }
    });

    const { rows: updatedRows } = await db.query<Part>(
        `UPDATE parts SET reserved_quantity = GREATEST(0, $1), reserved_quantity_foss = GREATEST(0, $2) WHERE id = $3 RETURNING *`,
        [generalReserved, fossReserved, partId]
    );
    return enrichPart(updatedRows[0]);
}

/**
 * Batch synchronizes reservations for multiple parts, ensuring kits and components are all updated.
 */
export async function syncMultiplePartsReservations(db: PoolClient, partIds: number[]): Promise<void> {
    const uniqueIds = new Set<number>();

    for (const id of partIds) {
        if (!id) continue;
        uniqueIds.add(id);

        // If it's a kit, add components
        const { rows: components } = await db.query('SELECT child_part_id FROM part_components WHERE parent_part_id = $1', [id]);
        components.forEach(c => uniqueIds.add(c.child_part_id));

        // If it's a component, add all its parent kits too (to be safe)
        const { rows: parents } = await db.query('SELECT parent_part_id FROM part_components WHERE child_part_id = $1', [id]);
        parents.forEach(p => uniqueIds.add(p.parent_part_id));
    }

    for (const id of Array.from(uniqueIds)) {
        await syncPartStock(db, id);
    }
}

/**
 * Fetches all parts with calculated virtual stock and composed quantities
 */
/**
 * Fetches parts with calculated virtual stock (now using cached column).
 * Optimized to avoid loading entire DB into memory.
 */
export async function getEnrichedInventory(
    db: SupabaseClient<Database> | PoolClient | Pool,
    page: number = 1,
    limit: number = 50,
    search?: string,
    view?: string
) {
    const offset = (page - 1) * limit;
    let parts: any[] = [];
    let totalCount = 0;

    if ('from' in db) {
        // Supabase Client
        let query = db
            .from('parts')
            .select('*', { count: 'exact' })
            .is('deleted_at', null);

        if (search) {
            const trimmedSearch = search.trim();
            query = query.or(`reference.ilike.%${trimmedSearch}%,designation.ilike.%${trimmedSearch}%`);
        }

        const { data, count, error } = await query
            .order('designation', { ascending: true })
            .range(offset, offset + limit - 1);

        if (error) throw error;
        parts = data || [];
        totalCount = count || 0;
    } else {
        // Pool Client (PG)
        let countQuery = 'SELECT COUNT(*) FROM parts WHERE deleted_at IS NULL';
        let dataQuery = 'SELECT * FROM parts WHERE deleted_at IS NULL';
        let params: any[] = [];
        let dataParams: any[] = [];

        if (search) {
            const trimmedSearch = search.trim();
            const searchCondition = `(reference ILIKE $${params.length + 1} OR designation ILIKE $${params.length + 1})`;
            countQuery += ` AND ${searchCondition}`;
            dataQuery += ` AND ${searchCondition}`;
            params.push(`%${trimmedSearch}%`);
            dataParams.push(`%${trimmedSearch}%`);
        }

        if (view === 'virtual') {
            countQuery += ` AND track_stock = false`;
            dataQuery += ` AND track_stock = false`;
        } else if (view === 'all_search') {
            // No extra filter on track_stock, returns both
        } else {
            // Default views (all, low_stock, reserved) show physical items only
            countQuery += ` AND track_stock = true`;
            dataQuery += ` AND track_stock = true`;
        }

        if (view === 'low_stock') {
            const lowStockCondition = `(
                (is_composed = false AND COALESCE(stock_quantity, 0) - COALESCE(reserved_quantity, 0) < COALESCE(min_stock, 0)) OR
                (is_composed = false AND COALESCE(stock_quantity_foss, 0) - COALESCE(reserved_quantity_foss, 0) < COALESCE(min_stock_foss, 0)) OR
                (is_composed = true AND COALESCE(virtual_stock, 0) - COALESCE(reserved_quantity, 0) < COALESCE(min_stock, 0)) OR
                (is_composed = true AND COALESCE(virtual_stock_foss, 0) - COALESCE(reserved_quantity_foss, 0) < COALESCE(min_stock_foss, 0))
            )`;
            countQuery += ` AND ${lowStockCondition}`;
            dataQuery += ` AND ${lowStockCondition}`;
        } else if (view === 'reserved') {
            const reservedCondition = `(COALESCE(reserved_quantity, 0) > 0 OR COALESCE(reserved_quantity_foss, 0) > 0)`;
            countQuery += ` AND ${reservedCondition}`;
            dataQuery += ` AND ${reservedCondition}`;
        }

        dataQuery += ` ORDER BY designation ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        dataParams.push(limit, offset);

        const { rows: countRows } = await db.query<{ count: string }>(countQuery, params);
        totalCount = parseInt(countRows[0].count, 10);

        const { rows } = await db.query<Part>(dataQuery, dataParams);
        parts = rows;
    }

    // Map using the cached virtual_stock columns
    const mappedParts = parts.map(enrichPart);

    return {
        data: mappedParts,
        pagination: {
            page,
            limit,
            total: totalCount,
            totalPages: Math.ceil(totalCount / limit)
        }
    };
}

/**
 * Fetches all reservations for a specific part
 */
export async function getPartReservations(db: SupabaseClient<Database> | PoolClient, partId: number) {
    const reservations: any[] = [];

    if ('from' in db) {
        const { data: directData } = await db
            .from('schedule_parts')
            .select('quantity, stock_type, schedules(id, title, startDate, clients(name))')
            .eq('partId', partId)
            .eq('schedules.isCompleted', false);

        (directData as any[] || []).filter(item => item.schedules).forEach(item => {
            reservations.push({
                scheduleId: item.schedules.id,
                title: item.schedules.title,
                startDate: item.schedules.startDate,
                clientName: item.schedules.clients?.name || 'Cliente Desconhecido',
                quantityReserved: item.quantity,
                stockType: item.stock_type || StockType.GENERAL,
                origin: 'Direta'
            });
        });

        const { data: parents } = await db
            .from('part_components')
            .select('parent_part_id, quantity, parts:parts!parent_part_id(designation)')
            .eq('child_part_id', partId);

        if (parents && parents.length > 0) {
            for (const parent of parents as any[]) {
                const { data: parentRes } = await db
                    .from('schedule_parts')
                    .select('quantity, stock_type, schedules(id, title, startDate, clients(name))')
                    .eq('partId', parent.parent_part_id)
                    .eq('schedules.isCompleted', false);

                (parentRes as any[] || []).filter(item => item.schedules).forEach(item => {
                    reservations.push({
                        scheduleId: item.schedules.id,
                        title: item.schedules.title,
                        startDate: item.schedules.startDate,
                        clientName: item.schedules.clients?.name || 'Cliente Desconhecido',
                        quantityReserved: item.quantity * parent.quantity,
                        stockType: item.stock_type || StockType.GENERAL,
                        origin: `Via Kit: ${parent.parts?.designation || 'Desconhecido'}`
                    });
                });
            }
        }
    } else {
        // SQL Version
        const { rows: directRows } = await db.query<{
            quantity: number;
            stock_type: string;
            scheduleId: number;
            title: string;
            startDate: string;
            clientName: string | null;
        }>(`
            SELECT sp.quantity, sp.stock_type, s.id as "scheduleId", s.title, s."startDate", c.name as "clientName"
            FROM schedule_parts sp
            JOIN schedules s ON sp."scheduleId" = s.id
            LEFT JOIN clients c ON s."clientId" = c.id
            WHERE sp."partId" = $1 AND s."isCompleted" = false
        `, [partId]);

        directRows.forEach(row => {
            reservations.push({
                scheduleId: row.scheduleId,
                title: row.title,
                startDate: row.startDate,
                clientName: row.clientName || 'Cliente Desconhecido',
                quantityReserved: row.quantity,
                stockType: row.stock_type || StockType.GENERAL,
                origin: 'Direta'
            });
        });

        const { rows: parents } = await db.query<{
            parent_part_id: number;
            quantity: number;
            designation: string;
        }>(`
            SELECT pc.parent_part_id, pc.quantity, p.designation
            FROM part_components pc
            JOIN parts p ON pc.parent_part_id = p.id
            WHERE pc.child_part_id = $1
        `, [partId]);

        for (const parent of parents) {
            const { rows: parentRows } = await db.query<{
                quantity: number;
                stock_type: string;
                scheduleId: number;
                title: string;
                startDate: string;
                clientName: string | null;
            }>(`
                SELECT sp.quantity, sp.stock_type, s.id as "scheduleId", s.title, s."startDate", c.name as "clientName"
                FROM schedule_parts sp
                JOIN schedules s ON sp."scheduleId" = s.id
                LEFT JOIN clients c ON s."clientId" = c.id
                WHERE sp."partId" = $1 AND s."isCompleted" = false
            `, [parent.parent_part_id]);

            parentRows.forEach(row => {
                reservations.push({
                    scheduleId: row.scheduleId,
                    title: row.title,
                    startDate: row.startDate,
                    clientName: row.clientName || 'Cliente Desconhecido',
                    quantityReserved: row.quantity * parent.quantity,
                    stockType: row.stock_type || StockType.GENERAL,
                    origin: `Via Kit: ${parent.designation || 'Desconhecido'}`
                });
            });
        }
    }

    return reservations;
}

/**
 * Updates ONLY the ordered quantity of a part (independent of ledger transactions)
 * Used when placing/cancelling an order.
 */
export async function updatePartOrderedQuantity(db: PoolClient, partId: number, change: number, stockType: StockType): Promise<void> {
    const isFoss = stockType === StockType.FOSS;
    const column = isFoss ? 'ordered_quantity_foss' : 'ordered_quantity';
    
    await db.query(`
        UPDATE parts 
        SET ${column} = GREATEST(0, COALESCE(${column}, 0) + $1)
        WHERE id = $2
    `, [change, partId]);
}
