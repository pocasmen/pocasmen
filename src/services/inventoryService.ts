//Horas de desenvolvimento activo=32,5
import { SupabaseClient } from '@supabase/supabase-js';
import { Pool, PoolClient } from 'pg';
import { StockType } from '../types';
import { logger } from '../utils/logger';
import { Database } from '../types/db.types';
import { Part, PartUpdate, PartComponent } from '../types/supabase';

export const calculateNewQuantity = (current: number, change: number): number => {
    return current + change;
};

export interface PartUpdateResult {
    newStock: number;
    newReserved: number;
    newOrdered: number;
    newStockContract: number;
    newReservedContract: number;
    newOrderedContract: number;
}

export const enrichPart = (p: any) => {
    const rawStock = Number(p.stock_quantity || 0);
    const rawReserved = Number(p.reserved_quantity || 0);
    const rawStockContract = Number(p.stock_quantity_contract || 0);
    const rawReservedContract = Number(p.reserved_quantity_contract || 0);

    const isComposed = !!p.is_composed;
    const virtualStock = Number(p.virtual_stock || 0);
    const virtualStockContract = Number(p.virtual_stock_contract || 0);

    return {
        ...p,
        // stock_quantity deve ser o total (físico ou potencial máximo)
        stock_quantity: isComposed ? virtualStock : rawStock,
        stock_quantity_contract: isComposed ? virtualStockContract : rawStockContract,

        // Campos novos para disponibilidade real
        available_quantity: isComposed
            ? (virtualStock - rawReserved)
            : (rawStock - rawReserved),
        available_quantity_contract: isComposed
            ? (virtualStockContract - rawReservedContract)
            : (rawStockContract - rawReservedContract),

        reserved_quantity: rawReserved,
        reserved_quantity_contract: rawReservedContract,
        raw_stock_quantity: rawStock,
        raw_stock_contract: rawStockContract
    };
};

export const processStockUpdate = (
    current: { stock: number; ordered: number; stockContract: number; orderedContract: number },
    change: number,
    isFromOrder: boolean,
    targetStock: StockType.GENERAL | StockType.CONTRACT
): { newStock: number; newOrdered: number; newStockContract: number; newOrderedContract: number } => {
    let newStock = current.stock;
    let newStockContract = current.stockContract;
    let newOrdered = current.ordered;
    let newOrderedContract = current.orderedContract;

    if (targetStock === StockType.CONTRACT) {
        newStockContract = Math.max(0, current.stockContract + change);
        if (isFromOrder && change > 0) {
            newOrderedContract = Math.max(0, current.orderedContract - change);
        }
    } else {
        newStock = Math.max(0, current.stock + change);
        if (isFromOrder && change > 0) {
            newOrdered = Math.max(0, current.ordered - change);
        }
    }

    return { newStock, newOrdered, newStockContract, newOrderedContract };
};

export const hasEnoughStock = (stock: number, reserved: number, requested: number): boolean => {
    return (stock - reserved) >= requested;
};

export const processReportAbate = (
    current: { stock: number; reserved: number; stockContract: number; reservedContract: number },
    quantityUsed: number,
    stockType: StockType,
    skipReserved: boolean = false
): { newStock: number; newReserved: number; newStockContract: number; newReservedContract: number } => {
    let newStock = current.stock;
    let newReserved = current.reserved;
    let newStockContract = current.stockContract;
    let newReservedContract = current.reservedContract;

    if (stockType === StockType.CONTRACT) {
        newStockContract = current.stockContract - quantityUsed; // Permite negativo
        if (!skipReserved) {
            newReservedContract = Math.max(0, current.reservedContract - quantityUsed);
        }
    } else if (stockType === StockType.GENERAL) {
        newStock = current.stock - quantityUsed; // Permite negativo
        if (!skipReserved) {
            newReserved = Math.max(0, current.reserved - quantityUsed);
        }
    }

    return {
        newStock,
        newReserved,
        newStockContract,
        newReservedContract
    };
};

export async function abatePartInventory(db: PoolClient, partId: number, quantity: number, stockType: StockType = StockType.GENERAL, skipReserved: boolean = false): Promise<void> {
    if (stockType === StockType.CLIENT || stockType === StockType.WARRANTY) {
        logger.debug({ partId, stockType }, `[DEBUG_INV] Skipping inventory abatement for this stock type.`);
        return;
    }

    const { rows } = await db.query<Part>(
        'SELECT stock_quantity, reserved_quantity, stock_quantity_contract, reserved_quantity_contract, designation, is_composed FROM parts WHERE id = $1',
        [partId]
    );

    const currentPart = rows[0];

    if (!currentPart) {
        logger.error(`[ERROR_INV] Part not found ${partId}:`);
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
                    await abatePartInventory(db, comp.child_part_id, Number(comp.quantity) * quantity, stockType, skipReserved);
                }
            }
        }
    } else {
        const result = processReportAbate(
            {
                stock: currentPart.stock_quantity || 0,
                reserved: currentPart.reserved_quantity || 0,
                stockContract: currentPart.stock_quantity_contract || 0,
                reservedContract: currentPart.reserved_quantity_contract || 0
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
            old: { stock: currentPart.stock_quantity, contract: currentPart.stock_quantity_contract, reserved: currentPart.reserved_quantity },
            new: { stock: result.newStock, contract: result.newStockContract, reserved: result.newReserved }
        }, `[DEBUG_INV] Abating Part Inventory`);

        await db.query(
            'UPDATE parts SET stock_quantity = $1, reserved_quantity = $2, stock_quantity_contract = $3, reserved_quantity_contract = $4 WHERE id = $5',
            [result.newStock, result.newReserved, result.newStockContract, result.newReservedContract, partId]
        );
    }
}

export async function updatePartReservation(db: PoolClient, partId: number, change: number, stockType: StockType = StockType.GENERAL): Promise<void> {
    if (stockType === StockType.CLIENT || stockType === StockType.WARRANTY) {
        logger.debug({ partId, stockType }, `[DEBUG_INV] Skipping reservation update for this stock type.`);
        return;
    }

    const { rows } = await db.query<Part>(
        'SELECT reserved_quantity, reserved_quantity_contract, designation, is_composed FROM parts WHERE id = $1',
        [partId]
    );

    const currentPart = rows[0];

    if (!currentPart) {
        logger.error(`[ERROR_INV] Part not found ${partId}:`);
        return;
    }

    let sqlSet = [];
    let sqlParams = [];

    if (stockType === StockType.CONTRACT) {
        const newReservedQuantity = Math.max(0, (currentPart.reserved_quantity_contract || 0) + change);
        sqlSet.push('reserved_quantity_contract = GREATEST(0, $1)');
        sqlParams.push(newReservedQuantity);
        logger.debug({
            partId,
            designation: currentPart.designation,
            old: currentPart.reserved_quantity_contract,
            change,
            new: newReservedQuantity
        }, `[DEBUG_INV] Updating Part Reservation (CONTRACT)`);
    } else {
        const newReservedQuantity = Math.max(0, (currentPart.reserved_quantity || 0) + change);
        sqlSet.push('reserved_quantity = GREATEST(0, $1)');
        sqlParams.push(newReservedQuantity);
        logger.debug({
            partId,
            designation: currentPart.designation,
            old: currentPart.reserved_quantity,
            change,
            new: newReservedQuantity
        }, `[DEBUG_INV] Updating Part Reservation (GENERAL)`);
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
    const { reference, designation, components } = data;

    const { rows: existingRows } = await db.query<Part>('SELECT id FROM parts WHERE reference = $1', [reference]);
    if (existingRows.length > 0) throw new Error('Já existe uma peça com esta referência.');

    const { rows } = await db.query<Part>(
        `INSERT INTO parts (reference, designation, is_composed, stock_quantity, reserved_quantity, ordered_quantity, stock_quantity_contract, reserved_quantity_contract, ordered_quantity_contract) 
         VALUES ($1, $2, true, 0, 0, 0, 0, 0, 0) RETURNING *`,
        [reference, designation]
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
    const { reference, designation, components } = data;

    const { rows } = await db.query<Part>(
        'UPDATE parts SET reference = $1, designation = $2 WHERE id = $3 RETURNING *',
        [reference, designation, partId]
    );
    const parentPart = rows[0];
    if (!parentPart) throw new Error('Part not found');

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
 * Updates stock for a part
 */
export async function updatePartStock(db: PoolClient, partId: number, data: any): Promise<Part> {
    const { quantity, fromOrder, targetStock } = data;

    const { rows: fetchRows } = await db.query<Part>(
        'SELECT stock_quantity, ordered_quantity, stock_quantity_contract, ordered_quantity_contract, is_composed FROM parts WHERE id = $1 FOR UPDATE',
        [partId]
    );
    if (fetchRows.length === 0) throw new Error('Peça não encontrada');
    const currentPart = fetchRows[0];

    if (currentPart.is_composed) {
        await db.query('SELECT child_part_id FROM part_components WHERE parent_part_id = $1 FOR UPDATE', [partId]);
    }

    const updateResult = processStockUpdate({
        stock: currentPart.stock_quantity || 0,
        ordered: currentPart.ordered_quantity || 0,
        stockContract: currentPart.stock_quantity_contract || 0,
        orderedContract: currentPart.ordered_quantity_contract || 0
    }, quantity, !!fromOrder, targetStock || StockType.GENERAL);

    const { rows } = await db.query<Part>(
        `UPDATE parts SET stock_quantity = $1, ordered_quantity = $2, stock_quantity_contract = $3, ordered_quantity_contract = $4 WHERE id = $5 RETURNING *`,
        [updateResult.newStock, updateResult.newOrdered, updateResult.newStockContract, updateResult.newOrderedContract, partId]
    );
    return enrichPart(rows[0]);
}

/**
 * Synchronizes reserved quantity based on active schedules
 */
export async function syncPartStock(db: PoolClient, partId: number): Promise<Part> {
    const query = `
        SELECT 
            COALESCE(SUM(CASE WHEN s."isCompleted" = false THEN sp.quantity ELSE 0 END), 0) as direct_qty,
            COALESCE(SUM(CASE WHEN s."isCompleted" = false THEN (sp.quantity * pc.quantity) ELSE 0 END), 0) as kit_qty,
            sp.stock_type
        FROM parts p
        LEFT JOIN schedule_parts sp ON p.id = sp."partId"
        LEFT JOIN schedules s ON sp."scheduleId" = s.id
        LEFT JOIN part_components pc ON p.id = pc.parent_part_id AND pc.child_part_id = $1
        WHERE (p.id = $1 OR pc.child_part_id = $1)
        GROUP BY sp.stock_type
    `;

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
    let contractReserved = 0;

    rows.forEach((item: { total: number; stock_type: string }) => {
        if (item.stock_type === StockType.CONTRACT) contractReserved = Number(item.total);
        else generalReserved = Number(item.total);
    });

    const { rows: updatedRows } = await db.query<Part>(
        `UPDATE parts SET reserved_quantity = GREATEST(0, $1), reserved_quantity_contract = GREATEST(0, $2) WHERE id = $3 RETURNING *`,
        [generalReserved, contractReserved, partId]
    );
    return enrichPart(updatedRows[0]);
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
    limit: number = 50
) {
    const offset = (page - 1) * limit;
    let parts: any[] = [];
    let totalCount = 0;

    if ('from' in db) {
        // Supabase Client
        const { data, count, error } = await db
            .from('parts')
            .select('*', { count: 'exact' })
            .order('designation', { ascending: true })
            .range(offset, offset + limit - 1);

        if (error) throw error;
        parts = data || [];
        totalCount = count || 0;
    } else {
        // Pool Client (PG)
        const { rows: countRows } = await db.query<{ count: string }>('SELECT COUNT(*) FROM parts');
        totalCount = parseInt(countRows[0].count, 10);

        const { rows } = await db.query<Part>('SELECT * FROM parts ORDER BY designation ASC LIMIT $1 OFFSET $2', [limit, offset]);
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
