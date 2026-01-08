"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const inventoryService_1 = require("../inventoryService");
describe('Inventory Service', () => {
    describe('calculateNewQuantity', () => {
        test('should add quantity correctly', () => {
            expect((0, inventoryService_1.calculateNewQuantity)(10, 5)).toBe(15);
        });
        test('should subtract quantity correctly', () => {
            expect((0, inventoryService_1.calculateNewQuantity)(10, -3)).toBe(7);
        });
        test('should not return negative values', () => {
            expect((0, inventoryService_1.calculateNewQuantity)(5, -10)).toBe(0);
        });
    });
    describe('processStockUpdate', () => {
        test('should update stock and ordered quantity when receiving an order', () => {
            const result = (0, inventoryService_1.processStockUpdate)(10, 5, 3, true);
            expect(result.newStock).toBe(13);
            expect(result.newOrdered).toBe(2);
        });
        test('should not decrease ordered quantity below zero', () => {
            const result = (0, inventoryService_1.processStockUpdate)(10, 5, 10, true);
            expect(result.newOrdered).toBe(0);
        });
        test('should only update stock when not from order', () => {
            const result = (0, inventoryService_1.processStockUpdate)(10, 5, 3, false);
            expect(result.newStock).toBe(13);
            expect(result.newOrdered).toBe(5);
        });
    });
    describe('hasEnoughStock', () => {
        test('should return true if stock minus reserved is enough', () => {
            expect((0, inventoryService_1.hasEnoughStock)(20, 10, 5)).toBe(true);
        });
        test('should return false if available stock is insufficient', () => {
            expect((0, inventoryService_1.hasEnoughStock)(20, 18, 5)).toBe(false);
        });
        test('should return true if exactly enough', () => {
            expect((0, inventoryService_1.hasEnoughStock)(20, 15, 5)).toBe(true);
        });
    });
});
