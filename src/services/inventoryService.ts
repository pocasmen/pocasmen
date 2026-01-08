/**
 * Inventory Service
 * Contains pure logic for stock calculations and validation.
 */

export const calculateNewQuantity = (current: number, change: number): number => {
    const result = current + change;
    return Math.max(0, result);
};

export interface PartUpdateResult {
    newReserved: number;
    newStock: number;
    newOrdered: number;
}

export const processStockUpdate = (
    currentStock: number,
    currentOrdered: number,
    change: number,
    isFromOrder: boolean
): { newStock: number; newOrdered: number } => {
    const newStock = Math.max(0, currentStock + change);
    let newOrdered = currentOrdered;

    if (isFromOrder && change > 0) {
        newOrdered = Math.max(0, currentOrdered - change);
    }

    return { newStock, newOrdered };
};

export const hasEnoughStock = (stock: number, reserved: number, requested: number): boolean => {
    return (stock - reserved) >= requested;
};

export const processReportAbate = (
    currentStock: number,
    currentReserved: number,
    quantityUsed: number
): { newStock: number; newReserved: number } => {
    return {
        newStock: Math.max(0, currentStock - quantityUsed),
        newReserved: Math.max(0, currentReserved - quantityUsed)
    };
};

