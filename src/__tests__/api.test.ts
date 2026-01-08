import request from 'supertest';
import { app } from '../index';
import { describe, it, expect, beforeEach } from '@jest/globals';

// Mock do Supabase
jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => ({
        auth: {
            getUser: jest.fn(),
            signInWithPassword: jest.fn(),
        },
        from: jest.fn(() => ({
            select: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
        })),
        storage: {
            from: jest.fn(() => ({
                upload: jest.fn(),
                getPublicUrl: jest.fn(),
                createSignedUrl: jest.fn(),
                remove: jest.fn(),
            })),
        },
    })),
}));

describe('API Integration Tests', () => {
    describe('GET /api/test', () => {
        it('should return 200 and server alive message', async () => {
            const res = await request(app).get('/api/test');
            expect(res.statusCode).toBe(200);
            expect(res.text).toBe('Server is alive!');
        });
    });

    describe('AUTH Endpoints', () => {
        it('POST /auth/login - should attempt to login via Supabase', async () => {
            // Importamos o app e o supabase mockado
            const { supabase } = require('../index');

            (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
                data: { user: { id: '123' }, session: { access_token: 'fake_token' } },
                error: null
            });

            const res = await request(app)
                .post('/auth/login')
                .send({ email: 'test@example.com', password: 'password123' });

            expect(res.statusCode).toBe(200);
            expect(res.body.user.id).toBe('123');
            expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
                email: 'test@example.com',
                password: 'password123'
            });
        });

        it('POST /auth/login - should return 401 on failure', async () => {
            const { supabase } = require('../index');

            (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
                data: { user: null, session: null },
                error: { message: 'Invalid credentials' }
            });

            const res = await request(app)
                .post('/auth/login')
                .send({ email: 'wrong@example.com', password: 'wrong' });

            expect(res.statusCode).toBe(401);
            expect(res.body.error).toBe('Invalid credentials');
        });
    });

    describe('Protected Routes', () => {
        it('GET /api/tickets - should return 200 and list of tickets for admin', async () => {
            const { supabase } = require('../index');

            // Mock do usuário autenticado (middleware authenticateToken)
            (supabase.auth.getUser as jest.Mock).mockResolvedValue({
                data: {
                    user: {
                        id: 'admin_id',
                        user_metadata: { role: 'admin' }
                    }
                },
                error: null
            });

            // Mock dos dados de tickets
            (supabase.from as jest.Mock).mockImplementation((table: string) => {
                const mockObj: any = {
                    select: jest.fn().mockReturnThis(),
                    eq: jest.fn().mockReturnThis(),
                    order: jest.fn().mockReturnThis(),
                    in: jest.fn().mockReturnThis(),
                };

                if (table === 'tickets') {
                    mockObj.order = jest.fn().mockResolvedValue({
                        data: [
                            { id: 1, title: 'Ticket 1', status: 'open', client_id: 101, equipmentId: 201 },
                        ],
                        error: null
                    });
                } else {
                    mockObj.in = jest.fn().mockResolvedValue({ data: [], error: null });
                }

                return mockObj;
            });

            const res = await request(app)
                .get('/api/tickets')
                .set('Authorization', 'Bearer fake_admin_token');

            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body[0].id).toBe(1);
        });

        it('GET /api/tickets - should return 403 if user is a client', async () => {
            const { supabase } = require('../index');

            (supabase.auth.getUser as jest.Mock).mockResolvedValue({
                data: {
                    user: {
                        id: 'client_id',
                        user_metadata: { role: 'client' }
                    }
                },
                error: null
            });

            const res = await request(app)
                .get('/api/tickets')
                .set('Authorization', 'Bearer fake_client_token');

            expect(res.statusCode).toBe(403);
        });
    });

    describe('Schedule Creation & Inventory Integration', () => {
        it('POST /api/schedules - should create a schedule and reserve parts correctly', async () => {
            const { supabase } = require('../index');

            // 1. Mock Admin Auth
            (supabase.auth.getUser as jest.Mock).mockResolvedValue({
                data: { user: { id: 'admin_id', user_metadata: { role: 'admin' } } },
                error: null
            });

            // 2. Mock Complex Chain of Calls
            const mockInsertSchedule = { data: { id: 10, title: 'Test Schedule' }, error: null };
            const mockPartPayload = { id: 501, reference: 'REF01', designation: 'Part 01', reserved_quantity: 10 };

            const createMockChain = (data: any = null, error: any = null) => {
                const chain: any = {
                    select: jest.fn().mockReturnThis(),
                    insert: jest.fn().mockReturnThis(),
                    update: jest.fn().mockReturnThis(),
                    eq: jest.fn().mockReturnThis(),
                    single: jest.fn().mockReturnThis(),
                    maybeSingle: jest.fn().mockReturnThis(),
                    order: jest.fn().mockReturnThis(),
                    in: jest.fn().mockReturnThis(),
                    then: jest.fn((onFulfilled: any) => Promise.resolve(onFulfilled({ data, error }))),
                };
                return chain;
            };

            (supabase.from as jest.Mock).mockImplementation((table: string) => {
                if (table === 'schedules') {
                    return createMockChain({ id: 10 });
                }
                if (table === 'parts') {
                    // Especial: a primeira chamada select().eq().single() precisa de dados
                    // A segunda update().eq() pode retornar vazio.
                    // Vamos usar mockImplementationOnce no chain
                    const chain = createMockChain(mockPartPayload);
                    return chain;
                }
                return createMockChain();
            });

            const schedulePayload = {
                title: 'Instalação de AC',
                startDate: new Date().toISOString(),
                endDate: new Date().toISOString(),
                clientId: 1,
                equipmentId: 1,
                technicianIds: ['tech_01'],
                parts: [
                    { id: 501, reference: 'REF01', designation: 'Part 01', quantity: 2 }
                ]
            };

            const res = await request(app)
                .post('/api/schedules')
                .set('Authorization', 'Bearer admin_token')
                .send(schedulePayload);

            // 3. Assertions
            expect(res.statusCode).toBe(201);
            expect(res.body.id).toBe(10);

            // Verificar se o Supabase foi chamado para as partes certas
            expect(supabase.from).toHaveBeenCalledWith('schedules');
            expect(supabase.from).toHaveBeenCalledWith('schedule_technicians');
            expect(supabase.from).toHaveBeenCalledWith('schedule_parts');
            expect(supabase.from).toHaveBeenCalledWith('parts');
        });
    });

    describe('Service Reports', () => {
        it('POST /api/reports - should create a report and update schedule status', async () => {
            const { supabase } = require('../index');

            // 1. Mock Tech Auth
            (supabase.auth.getUser as jest.Mock).mockResolvedValue({
                data: { user: { id: 'tech_id', user_metadata: { role: 'technician' } } },
                error: null
            });

            // 2. Mock Chain
            const createMockChain = (data: any = null, error: any = null) => ({
                select: jest.fn().mockReturnThis(),
                insert: jest.fn().mockReturnThis(),
                update: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data, error }),
                then: jest.fn((onFulfilled: any) => Promise.resolve(onFulfilled({ data, error }))),
            });

            (supabase.from as jest.Mock).mockImplementation((table: string) => {
                if (table === 'reports') return createMockChain({ id: 50 });
                if (table === 'report_technicians') return createMockChain();
                if (table === 'schedules') return createMockChain();
                if (table === 'parts') {
                    // Simular peça com stock para ser abatido
                    return createMockChain({
                        id: 501,
                        designation: 'Part 01',
                        stock_quantity: 10,
                        reserved_quantity: 2
                    });
                }
                return createMockChain();
            });

            const reportPayload = {
                clientId: 1,
                equipmentId: 1,
                scheduleId: 10,
                technicianIds: ['tech_id'],
                serviceDate: '2026-01-03',
                hours: 2,
                parts: [
                    { id: 501, designation: 'Part 01', quantity: 2 }
                ],
                description: 'Reparação efetuada com sucesso.',
                damage: 'Fuga de gás',
                serviceType: ['Reparação']
            };

            const res = await request(app)
                .post('/api/reports')
                .set('Authorization', 'Bearer tech_token')
                .send(reportPayload);

            // 3. Assertions
            expect(res.statusCode).toBe(201);
            expect(res.body.reportId).toBe(50);
            expect(supabase.from).toHaveBeenCalledWith('reports');
            expect(supabase.from).toHaveBeenCalledWith('report_technicians');
            expect(supabase.from).toHaveBeenCalledWith('schedules');
            expect(supabase.from).toHaveBeenCalledWith('parts'); // Novo: verifica abate
        });
    });

    describe('Inventory Reservations', () => {
        it('GET /api/inventory/:id/reservations - should return a list of schedules for a reserved part', async () => {
            const { supabase } = require('../index');

            // 1. Mock Admin Auth
            (supabase.auth.getUser as jest.Mock).mockResolvedValue({
                data: { user: { id: 'admin_id', user_metadata: { role: 'admin' } } },
                error: null
            });

            // 2. Mock Chain for reservation data
            const createMockChain = (data: any = null, error: any = null) => ({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                then: jest.fn((onFulfilled: any) => Promise.resolve(onFulfilled({ data, error }))),
            });

            const mockReservationData = [
                {
                    quantity: 2,
                    schedules: {
                        id: 10,
                        title: 'Reparação AC',
                        startDate: '2026-01-10',
                        isCompleted: false,
                        clients: { name: 'Cliente A' }
                    }
                }
            ];

            (supabase.from as jest.Mock).mockImplementation((table: string) => {
                if (table === 'schedule_parts') return createMockChain(mockReservationData);
                return createMockChain();
            });

            const res = await request(app)
                .get('/api/inventory/501/reservations')
                .set('Authorization', 'Bearer admin_token');

            // 3. Assertions
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body[0].title).toBe('Reparação AC');
            expect(res.body[0].quantityReserved).toBe(2);
            expect(res.body[0].clientName).toBe('Cliente A');
        });
    });
    describe('Ticket Attachments', () => {
        it('POST /api/tickets/:id/attachments - should upload file and save metadata', async () => {
            const { supabase } = require('../index');

            // 1. Mock Tech Auth
            (supabase.auth.getUser as jest.Mock).mockResolvedValue({
                data: { user: { id: 'tech_id', user_metadata: { role: 'technician' } } },
                error: null
            });

            // 2. Mock Storage Upload
            (supabase.storage.from as jest.Mock).mockImplementation((bucket: string) => ({
                upload: jest.fn().mockResolvedValue({ data: { path: 'path/to/file' }, error: null }),
                getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'http://cdn/file.png' } }),
            }));

            // 3. Mock Database Insert
            const createMockChain = (data: any = null, error: any = null) => ({
                insert: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data, error }),
                then: jest.fn((onFulfilled: any) => Promise.resolve(onFulfilled({ data, error }))),
            });

            (supabase.from as jest.Mock).mockImplementation((table: string) => {
                if (table === 'ticket_attachments') {
                    return createMockChain({ id: 99, file_name: 'test.png' });
                }
                return createMockChain();
            });

            const res = await request(app)
                .post('/api/tickets/1/attachments')
                .set('Authorization', 'Bearer tech_token')
                .attach('file', Buffer.from('fake image content'), 'test.png');

            // 4. Assertions
            expect(res.statusCode).toBe(201);
            expect(res.body.id).toBe(99);
            expect(supabase.storage.from).toHaveBeenCalledWith('ticket-attachments');
            expect(supabase.from).toHaveBeenCalledWith('ticket_attachments');
        });
    });
});
