"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const index_1 = require("../index");
const globals_1 = require("@jest/globals");
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
(0, globals_1.describe)('API Integration Tests', () => {
    (0, globals_1.describe)('GET /api/test', () => {
        (0, globals_1.it)('should return 200 and server alive message', () => __awaiter(void 0, void 0, void 0, function* () {
            const res = yield (0, supertest_1.default)(index_1.app).get('/api/test');
            (0, globals_1.expect)(res.statusCode).toBe(200);
            (0, globals_1.expect)(res.text).toBe('Server is alive!');
        }));
    });
    (0, globals_1.describe)('AUTH Endpoints', () => {
        (0, globals_1.it)('POST /auth/login - should attempt to login via Supabase', () => __awaiter(void 0, void 0, void 0, function* () {
            // Importamos o app e o supabase mockado
            const { supabase } = require('../index');
            supabase.auth.signInWithPassword.mockResolvedValue({
                data: { user: { id: '123' }, session: { access_token: 'fake_token' } },
                error: null
            });
            const res = yield (0, supertest_1.default)(index_1.app)
                .post('/auth/login')
                .send({ email: 'test@example.com', password: 'password123' });
            (0, globals_1.expect)(res.statusCode).toBe(200);
            (0, globals_1.expect)(res.body.user.id).toBe('123');
            (0, globals_1.expect)(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
                email: 'test@example.com',
                password: 'password123'
            });
        }));
        (0, globals_1.it)('POST /auth/login - should return 401 on failure', () => __awaiter(void 0, void 0, void 0, function* () {
            const { supabase } = require('../index');
            supabase.auth.signInWithPassword.mockResolvedValue({
                data: { user: null, session: null },
                error: { message: 'Invalid credentials' }
            });
            const res = yield (0, supertest_1.default)(index_1.app)
                .post('/auth/login')
                .send({ email: 'wrong@example.com', password: 'wrong' });
            (0, globals_1.expect)(res.statusCode).toBe(401);
            (0, globals_1.expect)(res.body.error).toBe('Invalid credentials');
        }));
    });
    (0, globals_1.describe)('Protected Routes', () => {
        (0, globals_1.it)('GET /api/tickets - should return 200 and list of tickets for admin', () => __awaiter(void 0, void 0, void 0, function* () {
            const { supabase } = require('../index');
            // Mock do usuário autenticado (middleware authenticateToken)
            supabase.auth.getUser.mockResolvedValue({
                data: {
                    user: {
                        id: 'admin_id',
                        user_metadata: { role: 'admin' }
                    }
                },
                error: null
            });
            // Mock dos dados de tickets
            supabase.from.mockImplementation((table) => {
                const mockObj = {
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
                }
                else {
                    mockObj.in = jest.fn().mockResolvedValue({ data: [], error: null });
                }
                return mockObj;
            });
            const res = yield (0, supertest_1.default)(index_1.app)
                .get('/api/tickets')
                .set('Authorization', 'Bearer fake_admin_token');
            (0, globals_1.expect)(res.statusCode).toBe(200);
            (0, globals_1.expect)(Array.isArray(res.body)).toBe(true);
            (0, globals_1.expect)(res.body[0].id).toBe(1);
        }));
        (0, globals_1.it)('GET /api/tickets - should return 403 if user is a client', () => __awaiter(void 0, void 0, void 0, function* () {
            const { supabase } = require('../index');
            supabase.auth.getUser.mockResolvedValue({
                data: {
                    user: {
                        id: 'client_id',
                        user_metadata: { role: 'client' }
                    }
                },
                error: null
            });
            const res = yield (0, supertest_1.default)(index_1.app)
                .get('/api/tickets')
                .set('Authorization', 'Bearer fake_client_token');
            (0, globals_1.expect)(res.statusCode).toBe(403);
        }));
    });
    (0, globals_1.describe)('Schedule Creation & Inventory Integration', () => {
        (0, globals_1.it)('POST /api/schedules - should create a schedule and reserve parts correctly', () => __awaiter(void 0, void 0, void 0, function* () {
            const { supabase } = require('../index');
            // 1. Mock Admin Auth
            supabase.auth.getUser.mockResolvedValue({
                data: { user: { id: 'admin_id', user_metadata: { role: 'admin' } } },
                error: null
            });
            // 2. Mock Complex Chain of Calls
            const mockInsertSchedule = { data: { id: 10, title: 'Test Schedule' }, error: null };
            const mockPartPayload = { id: 501, reference: 'REF01', designation: 'Part 01', reserved_quantity: 10 };
            const createMockChain = (data = null, error = null) => {
                const chain = {
                    select: jest.fn().mockReturnThis(),
                    insert: jest.fn().mockReturnThis(),
                    update: jest.fn().mockReturnThis(),
                    eq: jest.fn().mockReturnThis(),
                    single: jest.fn().mockReturnThis(),
                    maybeSingle: jest.fn().mockReturnThis(),
                    order: jest.fn().mockReturnThis(),
                    in: jest.fn().mockReturnThis(),
                    then: jest.fn((onFulfilled) => Promise.resolve(onFulfilled({ data, error }))),
                };
                return chain;
            };
            supabase.from.mockImplementation((table) => {
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
            const res = yield (0, supertest_1.default)(index_1.app)
                .post('/api/schedules')
                .set('Authorization', 'Bearer admin_token')
                .send(schedulePayload);
            // 3. Assertions
            (0, globals_1.expect)(res.statusCode).toBe(201);
            (0, globals_1.expect)(res.body.id).toBe(10);
            // Verificar se o Supabase foi chamado para as partes certas
            (0, globals_1.expect)(supabase.from).toHaveBeenCalledWith('schedules');
            (0, globals_1.expect)(supabase.from).toHaveBeenCalledWith('schedule_technicians');
            (0, globals_1.expect)(supabase.from).toHaveBeenCalledWith('schedule_parts');
            (0, globals_1.expect)(supabase.from).toHaveBeenCalledWith('parts');
        }));
    });
    (0, globals_1.describe)('Service Reports', () => {
        (0, globals_1.it)('POST /api/reports - should create a report and update schedule status', () => __awaiter(void 0, void 0, void 0, function* () {
            const { supabase } = require('../index');
            // 1. Mock Tech Auth
            supabase.auth.getUser.mockResolvedValue({
                data: { user: { id: 'tech_id', user_metadata: { role: 'technician' } } },
                error: null
            });
            // 2. Mock Chain
            const createMockChain = (data = null, error = null) => ({
                select: jest.fn().mockReturnThis(),
                insert: jest.fn().mockReturnThis(),
                update: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data, error }),
                then: jest.fn((onFulfilled) => Promise.resolve(onFulfilled({ data, error }))),
            });
            supabase.from.mockImplementation((table) => {
                if (table === 'reports')
                    return createMockChain({ id: 50 });
                if (table === 'report_technicians')
                    return createMockChain();
                if (table === 'schedules')
                    return createMockChain();
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
            const res = yield (0, supertest_1.default)(index_1.app)
                .post('/api/reports')
                .set('Authorization', 'Bearer tech_token')
                .send(reportPayload);
            // 3. Assertions
            (0, globals_1.expect)(res.statusCode).toBe(201);
            (0, globals_1.expect)(res.body.reportId).toBe(50);
            (0, globals_1.expect)(supabase.from).toHaveBeenCalledWith('reports');
            (0, globals_1.expect)(supabase.from).toHaveBeenCalledWith('report_technicians');
            (0, globals_1.expect)(supabase.from).toHaveBeenCalledWith('schedules');
            (0, globals_1.expect)(supabase.from).toHaveBeenCalledWith('parts'); // Novo: verifica abate
        }));
    });
    (0, globals_1.describe)('Inventory Reservations', () => {
        (0, globals_1.it)('GET /api/inventory/:id/reservations - should return a list of schedules for a reserved part', () => __awaiter(void 0, void 0, void 0, function* () {
            const { supabase } = require('../index');
            // 1. Mock Admin Auth
            supabase.auth.getUser.mockResolvedValue({
                data: { user: { id: 'admin_id', user_metadata: { role: 'admin' } } },
                error: null
            });
            // 2. Mock Chain for reservation data
            const createMockChain = (data = null, error = null) => ({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                then: jest.fn((onFulfilled) => Promise.resolve(onFulfilled({ data, error }))),
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
            supabase.from.mockImplementation((table) => {
                if (table === 'schedule_parts')
                    return createMockChain(mockReservationData);
                return createMockChain();
            });
            const res = yield (0, supertest_1.default)(index_1.app)
                .get('/api/inventory/501/reservations')
                .set('Authorization', 'Bearer admin_token');
            // 3. Assertions
            (0, globals_1.expect)(res.statusCode).toBe(200);
            (0, globals_1.expect)(Array.isArray(res.body)).toBe(true);
            (0, globals_1.expect)(res.body[0].title).toBe('Reparação AC');
            (0, globals_1.expect)(res.body[0].quantityReserved).toBe(2);
            (0, globals_1.expect)(res.body[0].clientName).toBe('Cliente A');
        }));
    });
    (0, globals_1.describe)('Ticket Attachments', () => {
        (0, globals_1.it)('POST /api/tickets/:id/attachments - should upload file and save metadata', () => __awaiter(void 0, void 0, void 0, function* () {
            const { supabase } = require('../index');
            // 1. Mock Tech Auth
            supabase.auth.getUser.mockResolvedValue({
                data: { user: { id: 'tech_id', user_metadata: { role: 'technician' } } },
                error: null
            });
            // 2. Mock Storage Upload
            supabase.storage.from.mockImplementation((bucket) => ({
                upload: jest.fn().mockResolvedValue({ data: { path: 'path/to/file' }, error: null }),
                getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'http://cdn/file.png' } }),
            }));
            // 3. Mock Database Insert
            const createMockChain = (data = null, error = null) => ({
                insert: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data, error }),
                then: jest.fn((onFulfilled) => Promise.resolve(onFulfilled({ data, error }))),
            });
            supabase.from.mockImplementation((table) => {
                if (table === 'ticket_attachments') {
                    return createMockChain({ id: 99, file_name: 'test.png' });
                }
                return createMockChain();
            });
            const res = yield (0, supertest_1.default)(index_1.app)
                .post('/api/tickets/1/attachments')
                .set('Authorization', 'Bearer tech_token')
                .attach('file', Buffer.from('fake image content'), 'test.png');
            // 4. Assertions
            (0, globals_1.expect)(res.statusCode).toBe(201);
            (0, globals_1.expect)(res.body.id).toBe(99);
            (0, globals_1.expect)(supabase.storage.from).toHaveBeenCalledWith('ticket-attachments');
            (0, globals_1.expect)(supabase.from).toHaveBeenCalledWith('ticket_attachments');
        }));
    });
});
