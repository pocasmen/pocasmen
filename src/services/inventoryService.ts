import { SupabaseClient } from '@supabase/supabase-js';
import { Part, StockType } from '../types';
import { logger } from '../utils/logger';

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

export async function abatePartInventory(supabase: SupabaseClient, partId: number, quantity: number, stockType: StockType = StockType.GENERAL, skipReserved: boolean = false) {
    if (stockType === StockType.CLIENT || stockType === StockType.WARRANTY) {
        logger.debug({ partId, stockType }, `[DEBUG_INV] Skipping inventory abatement for this stock type.`);
        return;
    }

    const { data: currentPart, error: fetchError } = await supabase
        .from('parts')
        .select('stock_quantity, reserved_quantity, stock_quantity_contract, reserved_quantity_contract, designation, is_composed')
        .eq('id', partId)
        .single();

    if (fetchError || !currentPart) {
        logger.error(fetchError, `[ERROR_INV] Part not found or error fetching part ${partId}:`);
        return;
    }

    if (currentPart.is_composed) {
        logger.debug({ partId }, `[DEBUG_INV] Part is composed. Exploding components...`);
        const { data: components, error: compError } = await supabase
            .from('part_components')
            .select('child_part_id, quantity')
            .eq('parent_part_id', partId);

        if (compError) {
            logger.error(compError, `[ERROR_INV] Error fetching components for part ${partId}:`);
            return;
        }

        if (components && components.length > 0) {
            for (const comp of components) {
                await abatePartInventory(supabase, comp.child_part_id, comp.quantity * quantity, stockType, skipReserved);
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

        await supabase
            .from('parts')
            .update({
                stock_quantity: result.newStock,
                reserved_quantity: result.newReserved,
                stock_quantity_contract: result.newStockContract,
                reserved_quantity_contract: result.newReservedContract
            })
            .eq('id', partId);
    }
}

export async function updatePartReservation(supabase: SupabaseClient, partId: number, change: number, stockType: StockType = StockType.GENERAL) {
    if (stockType === StockType.CLIENT || stockType === StockType.WARRANTY) {
        logger.debug({ partId, stockType }, `[DEBUG_INV] Skipping reservation update for this stock type.`);
        return;
    }

    const { data: currentPart, error: fetchError } = await supabase
        .from('parts')
        .select('reserved_quantity, reserved_quantity_contract, designation, is_composed')
        .eq('id', partId)
        .single();

    if (fetchError || !currentPart) {
        logger.error(fetchError, `[ERROR_INV] Part not found or error fetching part ${partId}:`);
        return;
    }

    const updateData: Partial<Part> = {};
    if (stockType === StockType.CONTRACT) {
        const newReservedQuantity = calculateNewQuantity(
            currentPart.reserved_quantity_contract || 0,
            change
        );
        updateData.reserved_quantity_contract = newReservedQuantity;
        logger.debug({
            partId,
            designation: currentPart.designation,
            old: currentPart.reserved_quantity_contract,
            change,
            new: newReservedQuantity
        }, `[DEBUG_INV] Updating Part Reservation (CONTRACT)`);
    } else {
        const newReservedQuantity = calculateNewQuantity(
            currentPart.reserved_quantity || 0,
            change
        );
        updateData.reserved_quantity = newReservedQuantity;
        logger.debug({
            partId,
            designation: currentPart.designation,
            old: currentPart.reserved_quantity,
            change,
            new: newReservedQuantity
        }, `[DEBUG_INV] Updating Part Reservation (GENERAL)`);
    }

    await supabase
        .from('parts')
        .update(updateData)
        .eq('id', partId);

    if (currentPart.is_composed) {
        logger.debug({ partId }, `[DEBUG_INV] Part is composed. Propagating reservation change to components...`);
        const { data: components, error: compError } = await supabase
            .from('part_components')
            .select('child_part_id, quantity')
            .eq('parent_part_id', partId);

        if (compError) {
            logger.error(compError, `[ERROR_INV] Error fetching components for part ${partId}:`);
            return;
        }

        if (components && components.length > 0) {
            for (const comp of components) {
                await updatePartReservation(supabase, comp.child_part_id, comp.quantity * change, stockType);
            }
        }
    }
}
