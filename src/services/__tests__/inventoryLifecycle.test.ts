
import { PoolClient } from 'pg';
import * as inventoryService from '../inventoryService';
import * as scheduleService from '../scheduleService';
import * as reportService from '../reportService';
import { StockType } from '../../types';

describe('Inventory & Lifecycle Integration Tests (Unit Mocks)', () => {
    let mockDb: any;

    beforeEach(() => {
        mockDb = {
            query: jest.fn().mockImplementation(async (sql: string, params: any[]) => {
                // Default response to avoid undefined errors
                return { rows: [] };
            }),
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // --- SCHEDULE FLOW ---
    describe('Schedule Lifecycle & Reservations', () => {
        it('should reserve components when a kit is added to a schedule', async () => {
            const kitId = 1;
            const componentId = 2;

            mockDb.query.mockImplementation(async (sql: string, params: any[]) => {
                const s = sql.toLowerCase();
                if (s.includes('from parts') && s.includes('where id = $1')) {
                    if (params[0] === kitId) {
                        return { rows: [{ id: kitId, reserved_quantity: 0, reserved_quantity_contract: 0, is_composed: true, designation: 'Kit A' }] };
                    }
                    if (params[0] === componentId) {
                        return { rows: [{ id: componentId, reserved_quantity: 0, reserved_quantity_contract: 0, is_composed: false, designation: 'Part B' }] };
                    }
                }
                if (s.includes('from part_components') && s.includes('where parent_part_id = $1')) {
                    return { rows: [{ child_part_id: componentId, quantity: 2 }] };
                }
                return { rows: [] };
            });

            await inventoryService.updatePartReservation(mockDb, kitId, 1, StockType.GENERAL);

            // Verify Kit update
            const kitUpdate = mockDb.query.mock.calls.find((c: any) =>
                c[0].includes('UPDATE parts') && c[0].includes('reserved_quantity') && c[1][1] === kitId
            );
            expect(kitUpdate).toBeDefined();
            expect(kitUpdate[1][0]).toBe(1);

            // Verify Component update (1 * 2 multiplier)
            const compUpdate = mockDb.query.mock.calls.find((c: any) =>
                c[0].includes('UPDATE parts') && c[0].includes('reserved_quantity') && c[1][1] === componentId
            );
            expect(compUpdate).toBeDefined();
            expect(compUpdate[1][0]).toBe(2);
        });

        it('should release reservations when a schedule is updated (item removed)', async () => {
            const scheduleId = 100;
            const oldPartId = 5;

            mockDb.query.mockImplementation(async (sql: string, params: any[]) => {
                const s = sql.toLowerCase();
                if (s.includes('from schedules')) return { rows: [{ isCompleted: false }] };
                if (s.includes('from schedule_parts')) {
                    return { rows: [{ partId: oldPartId, quantity: 3, stock_type: 'general' }] };
                }
                if (s.includes('from parts') && params[0] === oldPartId) {
                    return { rows: [{ id: oldPartId, reserved_quantity: 3, designation: 'OldPart' }] };
                }
                return { rows: [] };
            });

            await scheduleService.syncPartsAndReservations(mockDb, scheduleId, [], false);

            const releaseUpdate = mockDb.query.mock.calls.find((c: any) =>
                c[0].includes('UPDATE parts') && c[0].includes('reserved_quantity') && c[1][1] === oldPartId
            );
            expect(releaseUpdate).toBeDefined();
            expect(releaseUpdate[1][0]).toBe(0); // 3 - 3 = 0
        });

        it('should NOT allow updates or reservation changes once schedule is completed', async () => {
            const scheduleId = 101;
            mockDb.query.mockImplementation(async (sql: string, params: any[]) => {
                const s = sql.toLowerCase();
                if (s.includes('from schedules')) return { rows: [{ isCompleted: true }] };
                return { rows: [] };
            });

            await scheduleService.syncPartsAndReservations(mockDb, scheduleId, [{ id: 1, quantity: 5 }], true);

            const inventoryUpdates = mockDb.query.mock.calls.filter((c: any) =>
                c[0].includes('UPDATE parts') && (c[0].includes('reserved_quantity') || c[0].includes('stock_quantity'))
            );
            expect(inventoryUpdates.length).toBe(0);
        });
    });

    // --- REPORT FLOW ---
    describe('Report Lifecycle & Abatement', () => {
        it('should abate stock and release reservation when a report is created', async () => {
            const partId = 10;
            const quantity = 2;

            mockDb.query.mockImplementation(async (sql: string, params: any[]) => {
                const s = sql.toLowerCase();
                if (s.includes('from parts') && params[0] === partId) {
                    return {
                        rows: [{
                            id: partId,
                            stock_quantity: 10,
                            reserved_quantity: 2,
                            stock_quantity_contract: 0,
                            reserved_quantity_contract: 0,
                            is_composed: false
                        }]
                    };
                }
                return { rows: [] };
            });

            await inventoryService.abatePartInventory(mockDb, partId, quantity, StockType.GENERAL, false);

            const updateCall = mockDb.query.mock.calls.find((c: any) => c[0].includes('UPDATE parts SET stock_quantity'));
            expect(updateCall).toBeDefined();
            // Expected: [newStock, newReserved, newStockContract, newReservedContract, partId]
            expect(updateCall[1]).toEqual([8, 0, 0, 0, partId]);
        });

        it('should restore inventory when a report is deleted', async () => {
            const reportId = 500;
            const partId = 10;

            mockDb.query.mockImplementation(async (sql: string, params: any[]) => {
                const s = sql.toLowerCase();
                // SQL patterns MUST be lowercased in patterns to match s
                if (s.includes('from reports where id = $1')) return { rows: [{ id: reportId, scheduleId: 100 }] };
                if (s.includes('from report_parts where "reportid" = $1')) { // pattern is lowercased to match s
                    return { rows: [{ partId: partId, quantity: 2, stock_type: 'general' }] };
                }
                if (s.includes('from parts') && params[0] === partId) {
                    return {
                        rows: [{
                            id: partId,
                            stock_quantity: 8,
                            reserved_quantity: 0,
                            stock_quantity_contract: 0,
                            reserved_quantity_contract: 0,
                            is_composed: false
                        }]
                    };
                }
                return { rows: [] };
            });

            await reportService.deleteFullReport(mockDb, reportId, 'user-1', true);

            const updateCall = mockDb.query.mock.calls.find((c: any) => c[0].includes('UPDATE parts SET stock_quantity'));
            expect(updateCall).toBeDefined();
            // 8 - (-2) = 10. Reserved stays 0.
            expect(updateCall[1]).toEqual([10, 0, 0, 0, partId]);
        });

        it('should handle kit abatement by abating components', async () => {
            const kitId = 1;
            const componentId = 2;

            mockDb.query.mockImplementation(async (sql: string, params: any[]) => {
                const s = sql.toLowerCase();
                if (s.includes('from parts') && params[0] === kitId) {
                    return { rows: [{ id: kitId, is_composed: true, designation: 'Kit A' }] };
                }
                if (s.includes('from part_components')) {
                    return { rows: [{ child_part_id: componentId, quantity: 5 }] };
                }
                if (s.includes('from parts') && params[0] === componentId) {
                    return { rows: [{ id: componentId, stock_quantity: 100, reserved_quantity: 10, stock_quantity_contract: 0, reserved_quantity_contract: 0, is_composed: false }] };
                }
                return { rows: [] };
            });

            await inventoryService.abatePartInventory(mockDb, kitId, 1, StockType.GENERAL, false);

            const updateCall = mockDb.query.mock.calls.find((c: any) =>
                c[0].includes('UPDATE parts') && c[1][4] === componentId
            );
            expect(updateCall).toBeDefined();
            // 100 - (1*5) = 95. reserved 10 - (1*5) = 5.
            expect(updateCall[1]).toEqual([95, 5, 0, 0, componentId]);
        });
    });
});
