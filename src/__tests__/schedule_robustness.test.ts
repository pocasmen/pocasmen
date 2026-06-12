import request from 'supertest';
import { app } from '../index';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Forçamos o mock do Supabase antes de importar o resto
jest.mock('@supabase/supabase-js', () => {
    const mockChannel = {
        subscribe: jest.fn(function (this: any, cb: any) {
            if (typeof cb === 'function') cb('SUBSCRIBED');
            return this;
        }),
        send: jest.fn(() => Promise.resolve({} as any)),
        on: jest.fn().mockReturnThis(),
        unsubscribe: jest.fn(),
    };

    return {
        createClient: jest.fn(() => ({
            auth: {
                getUser: jest.fn(() => Promise.resolve({ data: { user: { id: '00000000-0000-0000-0000-000000000001', user_metadata: { role: 'admin' } } }, error: null } as any)),
                signInWithPassword: jest.fn(() => Promise.resolve({} as any)),
            },
            from: jest.fn(() => ({
                select: jest.fn().mockReturnThis(),
                insert: jest.fn().mockReturnThis(),
                update: jest.fn().mockReturnThis(),
                delete: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockReturnThis(),
                maybeSingle: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                in: jest.fn().mockReturnThis(),
                neq: jest.fn().mockReturnThis(),
                then: jest.fn((onFulfilled: any) => Promise.resolve(onFulfilled({ data: null, error: null }))),
            })),
            channel: jest.fn(() => mockChannel),
            removeChannel: jest.fn(),
            storage: {
                from: jest.fn(() => ({
                    upload: jest.fn(),
                    getPublicUrl: jest.fn(),
                    createSignedUrl: jest.fn(),
                    remove: jest.fn(),
                })),
            },
        })),
    };
});

describe('Schedule Robustness & Combinations', () => {
    let supabase: any;

    beforeEach(() => {
        jest.clearAllMocks();
        const { supabase: sb } = require('../index');
        supabase = sb;

        // Mock default user (Admin)
        (supabase.auth.getUser as any).mockImplementation(() => Promise.resolve({
            data: { user: { id: '00000000-0000-0000-0000-000000000001', user_metadata: { role: 'admin' } } },
            error: null
        }));

        // Setup base mock for supabase.from
        (supabase.from as any).mockImplementation((table: any) => {
            const chain: any = {
                select: jest.fn().mockReturnThis(),
                insert: jest.fn().mockReturnThis(),
                update: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockReturnThis(),
                maybeSingle: jest.fn().mockReturnThis(),
                in: jest.fn().mockReturnThis(),
                order: jest.fn().mockReturnThis(),
                then: jest.fn((onFulfilled: any) => {
                    let data: any = { id: 999 };
                    let error: any = null;

                    if (table === 'schedules') {
                        data = { id: 999 };
                    } else if (table === 'profiles') {
                        data = [{ id: 'tech_1', telegramchatid: '12345', first_name: 'Tech', last_name: 'One' }];
                    } else if (table === 'clients') {
                        data = { id: 1, name: 'Client Test' };
                    } else if (table === 'equipments') {
                        data = { id: 1, brand: 'Brand', model: 'Model' };
                    } else if (table === 'parts') {
                        data = { id: 101, reference: 'REF_EXT', designation: 'Part', reserved_quantity: 10 };
                    } else {
                        data = [];
                    }

                    return Promise.resolve(onFulfilled({ data, error }));
                }),
            };
            return chain;
        });

        // Mock channel correctly
        const mockChannelInstance = {
            subscribe: jest.fn(function (this: any, cb: any) {
                if (typeof cb === 'function') cb('SUBSCRIBED');
                return this;
            }),
            send: jest.fn(() => Promise.resolve({} as any)),
            on: jest.fn().mockReturnThis(),
            unsubscribe: jest.fn(),
        };
        (supabase.channel as any).mockReturnValue(mockChannelInstance);
    });

    const baseSchedule = {
        title: 'Schedule Test',
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        clientId: 1,
        equipmentId: 1,
        technicianIds: ['tech_1'],
    };

    const testCases = [
        {
            name: 'Multiple technicians and array of service types',
            payload: {
                ...baseSchedule,
                technicianIds: ['tech_1', 'tech_2'],
                serviceType: ['Manutenção', 'Reparação'],
            }
        },
        {
            name: 'No parts and simple string service type',
            payload: {
                ...baseSchedule,
                serviceType: 'Instalação',
                parts: []
            }
        },
        {
            name: 'Combination with complex parts list (new and existing)',
            payload: {
                ...baseSchedule,
                parts: [
                    { id: 101, reference: 'REF_EXISTING', designation: 'Existing Part', quantity: 5 },
                    { reference: 'REF_NEW', designation: 'New Part', quantity: 2 }
                ]
            }
        },
        {
            name: 'Minimal payload (just required fields)',
            payload: {
                title: 'Minimal Schedule',
                startDate: new Date().toISOString(),
                endDate: new Date().toISOString(),
                clientId: 2,
                equipmentId: 2,
                technicianIds: ['tech_min']
            }
        },
        {
            name: 'Schedule with ticket association and additional info',
            payload: {
                ...baseSchedule,
                additionalInfo: 'Urgent service, call customer first.',
                ticketId: 42,
                isCompleted: false
            }
        }
    ];

    testCases.forEach((tc) => {
        it(`should handle: ${tc.name}`, async () => {
            const payload = tc.payload as any;

            (supabase.from as any).mockImplementation((table: any) => {
                const chain: any = {
                    select: jest.fn().mockReturnThis(),
                    insert: jest.fn().mockReturnThis(),
                    update: jest.fn().mockReturnThis(),
                    eq: jest.fn().mockReturnThis(),
                    single: jest.fn().mockReturnThis(),
                    maybeSingle: jest.fn().mockReturnThis(),
                    in: jest.fn().mockReturnThis(),
                    order: jest.fn().mockReturnThis(),
                    then: jest.fn((onFulfilled: any) => {
                        let data: any = { id: 999 };
                        if (table === 'schedules') {
                            data = { id: 999, ...payload };
                        } else if (table === 'parts') {
                            const isNewPart = (chain.eq as any).mock.calls.some((c: any) => c[0] === 'reference' && c[1] === 'REF_NEW');
                            if (isNewPart) data = null;
                            else data = { id: 101, reference: 'REF_EXISTING', designation: 'Existing Part', reserved_quantity: 10 };
                        } else if (table === 'profiles') {
                            data = [{ id: 'tech_1', telegramchatid: '12345', first_name: 'Tech', last_name: 'One' }];
                        } else if (table === 'clients') {
                            data = { id: 1, name: 'Client Test' };
                        } else if (table === 'equipments') {
                            data = { id: 1, brand: 'Brand', model: 'Model' };
                        } else {
                            data = [];
                        }
                        return Promise.resolve(onFulfilled({ data, error: null }));
                    }),
                };
                return chain;
            });

            const res = await request(app)
                .post('/api/schedules')
                .set('Authorization', 'Bearer dummy_admin_token')
                .send(payload);

            expect(res.statusCode).toBe(201);
            expect(res.body).toHaveProperty('id');
            expect(res.body.id).toBe(999);
        });
    });

    it('should fail with 400 when missing mandatory fields', async () => {
        const invalidPayload = { title: 'Missing Date' };
        const res = await request(app)
            .post('/api/schedules')
            .set('Authorization', 'Bearer dummy_token')
            .send(invalidPayload);

        expect(res.statusCode).toBe(400);
    });

    it('should fail when no technicians are provided', async () => {
        const payload = { ...baseSchedule, technicianIds: [] };
        const res = await request(app)
            .post('/api/schedules')
            .set('Authorization', 'Bearer dummy_token')
            .send(payload);

        expect(res.statusCode).toBe(400);
    });
});
