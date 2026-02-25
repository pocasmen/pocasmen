import request from 'supertest';
import { app } from '../../index';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { UserRole } from '../../constants/enums';

// Mock Supabase
const createMockChain = (responseData: any = { data: null, error: null }) => {
    const chain: any = {};
    const methods = ['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit', 'in', 'maybeSingle', 'single', 'or', 'gte', 'lte', 'lt', 'is'];

    methods.forEach(method => {
        chain[method] = jest.fn().mockReturnValue(chain);
    });

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

describe('Report Delete Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    const setAuth = (role: UserRole) => {
        (mockSupabase.auth.getUser as any).mockResolvedValue({
            data: { user: { id: 'user_123', user_metadata: { role } } },
            error: null
        });
    };

    describe('DELETE /api/reports/:id', () => {
        it('should allow admin to delete report and restore parts', async () => {
            setAuth(UserRole.ADMIN);

            // Mock report finding
            (mockSupabase.from as any).mockImplementation((table: string) => {
                if (table === 'reports') {
                    return createMockChain({ data: { id: 1, scheduleId: 10 }, error: null });
                }
                if (table === 'report_parts') {
                    return createMockChain({ data: [{ partId: 101, quantity: 2, stock_type: 'general' }], error: null });
                }
                if (table === 'parts') {
                    return createMockChain({ data: { id: 101, stock_quantity: 10 }, error: null });
                }
                return createMockChain({ data: null, error: null });
            });

            const res = await request(app)
                .delete('/api/reports/1?restoreParts=true')
                .set('Authorization', 'Bearer admin_token');

            expect(res.statusCode).toBe(200);
            expect(res.body.message).toMatch(/removido com sucesso/);

            // Verify that soft delete was called
            expect(mockSupabase.from).toHaveBeenCalledWith('reports');
        });

        it('should return 403 for unauthorized users (technician)', async () => {
            setAuth(UserRole.TECHNICIAN);

            const res = await request(app)
                .delete('/api/reports/1')
                .set('Authorization', 'Bearer tech_token');

            expect(res.statusCode).toBe(403);
        });

        it('should return 404 if report not found', async () => {
            setAuth(UserRole.SUPER_ADMIN);

            (mockSupabase.from as any).mockReturnValue(createMockChain({ data: null, error: { message: 'Not found' } }));

            const res = await request(app)
                .delete('/api/reports/999')
                .set('Authorization', 'Bearer admin_token');

            expect(res.statusCode).toBe(404);
        });
    });
});
