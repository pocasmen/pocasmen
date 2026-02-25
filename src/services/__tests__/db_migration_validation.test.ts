import { abatePartInventory, updatePartReservation } from '../inventoryService';
import { StockType } from '../../types';

describe('Inventory Service - DB Migration Validation', () => {
    let mockSupabase: any;
    let mockPgClient: any;

    beforeEach(() => {
        mockSupabase = {
            from: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockReturnThis(),
                update: jest.fn().mockReturnThis(),
                then: jest.fn((cb: any) => Promise.resolve(cb({
                    data: {
                        id: 1,
                        stock_quantity: 10,
                        reserved_quantity: 2,
                        stock_quantity_contract: 5,
                        reserved_quantity_contract: 0,
                        is_composed: false
                    }, error: null
                })))
            })
        };

        mockPgClient = {
            query: jest.fn().mockResolvedValue({
                rows: [{
                    id: 1,
                    stock_quantity: 10,
                    reserved_quantity: 2,
                    stock_quantity_contract: 5,
                    reserved_quantity_contract: 0,
                    is_composed: false
                }]
            })
        };
    });

    test('should correctly abate stock', async () => {
        await abatePartInventory(mockSupabase, 1, 2, StockType.GENERAL, false);
        expect(mockSupabase.from).toHaveBeenCalledWith('parts');
    });

    test('should correctly update reservation', async () => {
        await updatePartReservation(mockPgClient, 1, 3, StockType.GENERAL);
        expect(mockPgClient.query).toHaveBeenCalled();
    });
});
