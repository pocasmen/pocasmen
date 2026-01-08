"use strict";
/**
 * Inventory Service
 * Contains pure logic for stock calculations and validation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.processReportAbate = exports.hasEnoughStock = exports.processStockUpdate = exports.calculateNewQuantity = void 0;
const calculateNewQuantity = (current, change) => {
    const result = current + change;
    return Math.max(0, result);
};
exports.calculateNewQuantity = calculateNewQuantity;
const processStockUpdate = (currentStock, currentOrdered, change, isFromOrder) => {
    const newStock = Math.max(0, currentStock + change);
    let newOrdered = currentOrdered;
    if (isFromOrder && change > 0) {
        newOrdered = Math.max(0, currentOrdered - change);
    }
    return { newStock, newOrdered };
};
exports.processStockUpdate = processStockUpdate;
const hasEnoughStock = (stock, reserved, requested) => {
    return (stock - reserved) >= requested;
};
exports.hasEnoughStock = hasEnoughStock;
const processReportAbate = (currentStock, currentReserved, quantityUsed) => {
    return {
        newStock: Math.max(0, currentStock - quantityUsed),
        newReserved: Math.max(0, currentReserved - quantityUsed)
    };
};
exports.processReportAbate = processReportAbate;
