import request from 'supertest';
import { app } from '../../index';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { UserRole } from '../../constants/enums';

// Mock Supabase with a proxy-like chain to avoid "is not a function" errors
const createMockChain = (responseData: any = { data: null, error: null }) => {
    const chain: any = {};
    const methods = ['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit', 'in', 'maybeSingle', 'single', 'or', 'gte', 'lte', 'lt'];

    methods.forEach(method => {
        chain[method] = jest.fn().mockReturnValue(chain);
    });

    // Make the chain thenable to simulate the Promise return
    chain.then = (onFulfilled: any) => Promise.resolve(onFulfilled(responseData));

    return chain;
};

jest.mock('../../config/supabase', () => ({
    supabase: {
        auth: {
            getUser: jest.fn(),
        },
        from: jest.fn()
    }
}));

const { supabase: mockSupabase } = require('../../config/supabase');

describe('Inventory Flow Integration Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        (mockSupabase.auth.getUser as any).mockResolvedValue({
            data: { user: { id: 'admin_id', user_metadata: { role: UserRole.ADMIN } } },
            error: null
        });
    });

    describe('GET /api/inventory', () => {
        it('should return 200 and list of parts', async () => {
            const mockParts = [{ id: 1, reference: 'REF1', designation: 'Peca 1' }];
            (mockSupabase.from as any).mockReturnValue(createMockChain({ data: mockParts, error: null }));

            const res = await request(app)
                .get('/api/inventory')
                .set('Authorization', 'Bearer admin_token');

            expect(res.statusCode).toBe(200);
            expect(res.body[0].reference).toBe('REF1');
        });
    });

    describe('POST /api/inventory', () => {
        it('should create a new part', async () => {
            let callCount = 0;
            (mockSupabase.from as any).mockImplementation(() => {
                callCount++;
                return createMockChain({
                    data: callCount === 1 ? null : { id: 100, reference: 'NEW' },
                    error: null
                });
            });

            const res = await request(app)
                .post('/api/inventory')
                .set('Authorization', 'Bearer admin_token')
                .send({ reference: 'NEW', designation: 'Nova' });

            expect(res.statusCode).toBe(201);
            expect(res.body.id).toBe(100);
        });

        it('should return 400 if reference already exists', async () => {
            const partPayload = { reference: 'EXISTING', designation: 'Peca' };

            (mockSupabase.from as any).mockReturnValue(createMockChain({ data: { id: 1 }, error: null }));

            const res = await request(app)
                .post('/api/inventory')
                .set('Authorization', 'Bearer admin_token')
                .send(partPayload);

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toMatch(/Já existe uma peça/);
        });
    });

    describe('PUT /api/inventory/:id', () => {
        it('should update a part', async () => {
            (mockSupabase.from as any).mockReturnValue(createMockChain({
                data: { id: 50, reference: 'UPD' },
                error: null
            }));

            const res = await request(app)
                .put('/api/inventory/50')
                .set('Authorization', 'Bearer admin_token')
                .send({ reference: 'UPD', designation: 'Atu' });

            expect(res.statusCode).toBe(200);
        });
    });

    describe('DELETE /api/inventory/:id', () => {
        it('should delete a part when no dependencies exist', async () => {
            (mockSupabase.from as any).mockImplementation((table: string) => {
                if (table === 'schedule_parts' || table === 'part_components') {
                    // Count 0 means no dependencies
                    return createMockChain({ data: null, error: null, count: 0 });
                }
                return createMockChain({ data: null, error: null });
            });

            const res = await request(app)
                .delete('/api/inventory/99')
                .set('Authorization', 'Bearer admin_token');

            expect(res.statusCode).toBe(204);
        });

        it('should return 400 if part has dependencies', async () => {
            (mockSupabase.from as any).mockImplementation((table: string) => {
                if (table === 'schedule_parts') {
                    return createMockChain({ data: null, error: null, count: 1 });
                }
                return createMockChain({ data: null, error: null, count: 0 });
            });

            const res = await request(app)
                .delete('/api/inventory/99')
                .set('Authorization', 'Bearer admin_token');

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toMatch(/utilizada em agendamentos/);
        });
    });
});
