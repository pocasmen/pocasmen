/**
 * Inventory Service
 * Contains pure logic for stock calculations and validation.
 */

export const calculateNewQuantity = (current: number, change: number): number => {
    // Note: User requested allowing negative balance for abates, 
    // but for reservations/general additions we might still want to guard against negative if appropriate.
    // However, since we allow negative on abate, we'll let this be simple.
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
    targetStock: 'general' | 'contract'
): { newStock: number; newOrdered: number; newStockContract: number; newOrderedContract: number } => {
    let newStock = current.stock;
    let newStockContract = current.stockContract;
    let newOrdered = current.ordered;
    let newOrderedContract = current.orderedContract;

    if (targetStock === 'contract') {
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
    stockType: 'general' | 'contract' | 'client' | 'warranty'
): { newStock: number; newReserved: number; newStockContract: number; newReservedContract: number } => {
    let newStock = current.stock;
    let newReserved = current.reserved;
    let newStockContract = current.stockContract;
    let newReservedContract = current.reservedContract;

    if (stockType === 'contract') {
        newStockContract = current.stockContract - quantityUsed; // Permite negativo
        newReservedContract = Math.max(0, current.reservedContract - quantityUsed);
    } else if (stockType === 'general') {
        newStock = current.stock - quantityUsed; // Permite negativo
        newReserved = Math.max(0, current.reserved - quantityUsed);
    }
    // 'client' e 'warranty' não alteram nada

    return {
        newStock,
        newReserved,
        newStockContract,
        newReservedContract
    };
};
