import { createBillingTask, updateBillingTaskStatus } from '../billingService';
import { BillingStatus } from '../../constants/enums';
import { PoolClient } from 'pg';

describe('Billing Service', () => {
    let mockDb: jest.Mocked<PoolClient>;

    beforeEach(() => {
        mockDb = {
            query: jest.fn(),
        } as any;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('createBillingTask', () => {
        it('should create a billing task successfully', async () => {
            const mockData = { id: 1, report_id: 123, status: BillingStatus.REPORT_ISSUED };
            (mockDb.query as jest.Mock).mockResolvedValue({ rows: [mockData] });

            const result = await createBillingTask(mockDb, 123);

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO billing_tasks'),
                expect.any(Array)
            );
            expect(result).toEqual(mockData);
        });

        it('should create a billing task with PENDING_COMPLETION status when isPending is true', async () => {
            const mockData = { id: 2, report_id: 124, status: BillingStatus.PENDING_COMPLETION };
            (mockDb.query as jest.Mock).mockResolvedValue({ rows: [mockData] });

            const result = await createBillingTask(mockDb, 124, true);

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO billing_tasks'),
                expect.arrayContaining([124, BillingStatus.PENDING_COMPLETION, expect.any(String)])
            );
            expect(result).toEqual(mockData);
        });
    });

    describe('updateBillingTaskStatus', () => {
        it('should update task status successfully', async () => {
            const mockData = { id: 1, status: BillingStatus.READY_FOR_BILLING, report_id: 123 };
            (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [mockData] }) // update billing_tasks
                .mockResolvedValueOnce({ rows: [] }); // update reports

            const result = await updateBillingTaskStatus(mockDb, 1, BillingStatus.READY_FOR_BILLING);

            expect(mockDb.query).toHaveBeenCalledTimes(2);
            expect(result).toEqual(mockData);
        });

        it('should set billed_at when status is BILLED', async () => {
            const mockData = { id: 1, status: BillingStatus.BILLED, report_id: 123 };
            (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [mockData] }) // update billing_tasks
                .mockResolvedValueOnce({ rows: [] }); // update reports

            await updateBillingTaskStatus(mockDb, 1, BillingStatus.BILLED);

            expect(mockDb.query).toHaveBeenCalledWith(
                expect.stringContaining('SET status = $1, billed_at = CURRENT_TIMESTAMP'),
                expect.any(Array)
            );
        });
    });
});
