import { calculateNewQuantity, processStockUpdate, hasEnoughStock } from '../inventoryService';
import { StockType } from '../../types';

describe('Inventory Service', () => {
    describe('calculateNewQuantity', () => {
        test('should add quantity correctly', () => {
            expect(calculateNewQuantity(10, 5)).toBe(15);
        });

        test('should subtract quantity correctly', () => {
            expect(calculateNewQuantity(10, -3)).toBe(7);
        });

        test('should not return negative values', () => {
            expect(calculateNewQuantity(5, -10)).toBe(0);
        });
    });

    describe('processStockUpdate', () => {
        test('should update stock and ordered quantity when receiving an order (general)', () => {
            const result = processStockUpdate(
                { stock: 10, ordered: 5, stockFoss: 0, orderedFoss: 0 },
                3,
                true,
                StockType.GENERAL
            );
            expect(result.newStock).toBe(13);
            expect(result.newOrdered).toBe(2);
        });

        test('should update contract stock and ordered quantity when receiving an order (contract)', () => {
            const result = processStockUpdate(
                { stock: 0, ordered: 0, stockFoss: 10, orderedFoss: 5 },
                3,
                true,
                StockType.FOSS
            );
            expect(result.newStockFoss).toBe(13);
            expect(result.newOrderedFoss).toBe(2);
        });

        test('should not decrease ordered quantity below zero', () => {
            const result = processStockUpdate(
                { stock: 10, ordered: 5, stockFoss: 0, orderedFoss: 0 },
                10,
                true,
                StockType.GENERAL
            );
            expect(result.newOrdered).toBe(0);
        });

        test('should only update stock when not from order', () => {
            const result = processStockUpdate(
                { stock: 10, ordered: 5, stockFoss: 0, orderedFoss: 0 },
                3,
                false,
                StockType.GENERAL
            );
            expect(result.newStock).toBe(13);
            expect(result.newOrdered).toBe(5);
        });
    });

    describe('hasEnoughStock', () => {
        test('should return true if stock minus reserved is enough', () => {
            expect(hasEnoughStock(20, 10, 5)).toBe(true);
        });

        test('should return false if available stock is insufficient', () => {
            expect(hasEnoughStock(20, 18, 5)).toBe(false);
        });

        test('should return true if exactly enough', () => {
            expect(hasEnoughStock(20, 15, 5)).toBe(true);
        });
    });
});
