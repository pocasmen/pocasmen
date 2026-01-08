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
// Forçamos o mock do Supabase antes de importar o resto
globals_1.jest.mock('@supabase/supabase-js', () => {
    const mockChannel = {
        subscribe: globals_1.jest.fn(function (cb) {
            if (typeof cb === 'function')
                cb('SUBSCRIBED');
            return this;
        }),
        send: globals_1.jest.fn(() => Promise.resolve({})),
        on: globals_1.jest.fn().mockReturnThis(),
        unsubscribe: globals_1.jest.fn(),
    };
    return {
        createClient: globals_1.jest.fn(() => ({
            auth: {
                getUser: globals_1.jest.fn(() => Promise.resolve({ data: { user: { id: 'admin_id', user_metadata: { role: 'admin' } } }, error: null })),
                signInWithPassword: globals_1.jest.fn(() => Promise.resolve({})),
            },
            from: globals_1.jest.fn(() => ({
                select: globals_1.jest.fn().mockReturnThis(),
                insert: globals_1.jest.fn().mockReturnThis(),
                update: globals_1.jest.fn().mockReturnThis(),
                delete: globals_1.jest.fn().mockReturnThis(),
                eq: globals_1.jest.fn().mockReturnThis(),
                single: globals_1.jest.fn().mockReturnThis(),
                maybeSingle: globals_1.jest.fn().mockReturnThis(),
                order: globals_1.jest.fn().mockReturnThis(),
                limit: globals_1.jest.fn().mockReturnThis(),
                in: globals_1.jest.fn().mockReturnThis(),
                neq: globals_1.jest.fn().mockReturnThis(),
                then: globals_1.jest.fn((onFulfilled) => Promise.resolve(onFulfilled({ data: null, error: null }))),
            })),
            channel: globals_1.jest.fn(() => mockChannel),
            removeChannel: globals_1.jest.fn(),
            storage: {
                from: globals_1.jest.fn(() => ({
                    upload: globals_1.jest.fn(),
                    getPublicUrl: globals_1.jest.fn(),
                    createSignedUrl: globals_1.jest.fn(),
                    remove: globals_1.jest.fn(),
                })),
            },
        })),
    };
});
(0, globals_1.describe)('Schedule Robustness & Combinations', () => {
    let supabase;
    (0, globals_1.beforeEach)(() => {
        globals_1.jest.clearAllMocks();
        const { supabase: sb } = require('../index');
        supabase = sb;
        // Mock default user (Admin)
        supabase.auth.getUser.mockImplementation(() => Promise.resolve({
            data: { user: { id: 'admin_id', user_metadata: { role: 'admin' } } },
            error: null
        }));
        // Setup base mock for supabase.from
        supabase.from.mockImplementation((table) => {
            const chain = {
                select: globals_1.jest.fn().mockReturnThis(),
                insert: globals_1.jest.fn().mockReturnThis(),
                update: globals_1.jest.fn().mockReturnThis(),
                eq: globals_1.jest.fn().mockReturnThis(),
                single: globals_1.jest.fn().mockReturnThis(),
                maybeSingle: globals_1.jest.fn().mockReturnThis(),
                in: globals_1.jest.fn().mockReturnThis(),
                order: globals_1.jest.fn().mockReturnThis(),
                then: globals_1.jest.fn((onFulfilled) => {
                    let data = { id: 999 };
                    let error = null;
                    if (table === 'schedules') {
                        data = { id: 999 };
                    }
                    else if (table === 'profiles') {
                        data = [{ id: 'tech_1', telegramchatid: '12345', first_name: 'Tech', last_name: 'One' }];
                    }
                    else if (table === 'clients') {
                        data = { id: 1, name: 'Client Test' };
                    }
                    else if (table === 'equipments') {
                        data = { id: 1, brand: 'Brand', model: 'Model' };
                    }
                    else if (table === 'parts') {
                        data = { id: 101, reference: 'REF_EXT', designation: 'Part', reserved_quantity: 10 };
                    }
                    else {
                        data = [];
                    }
                    return Promise.resolve(onFulfilled({ data, error }));
                }),
            };
            return chain;
        });
        // Mock channel correctly
        const mockChannelInstance = {
            subscribe: globals_1.jest.fn(function (cb) {
                if (typeof cb === 'function')
                    cb('SUBSCRIBED');
                return this;
            }),
            send: globals_1.jest.fn(() => Promise.resolve({})),
            on: globals_1.jest.fn().mockReturnThis(),
            unsubscribe: globals_1.jest.fn(),
        };
        supabase.channel.mockReturnValue(mockChannelInstance);
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
            payload: Object.assign(Object.assign({}, baseSchedule), { technicianIds: ['tech_1', 'tech_2'], serviceType: ['Manutenção', 'Reparação'] })
        },
        {
            name: 'No parts and simple string service type',
            payload: Object.assign(Object.assign({}, baseSchedule), { serviceType: 'Instalação', parts: [] })
        },
        {
            name: 'Combination with complex parts list (new and existing)',
            payload: Object.assign(Object.assign({}, baseSchedule), { parts: [
                    { id: 101, reference: 'REF_EXISTING', designation: 'Existing Part', quantity: 5 },
                    { reference: 'REF_NEW', designation: 'New Part', quantity: 2 }
                ] })
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
            payload: Object.assign(Object.assign({}, baseSchedule), { additionalInfo: 'Urgent service, call customer first.', ticketId: 42, isCompleted: false })
        }
    ];
    testCases.forEach((tc) => {
        (0, globals_1.it)(`should handle: ${tc.name}`, () => __awaiter(void 0, void 0, void 0, function* () {
            const payload = tc.payload;
            supabase.from.mockImplementation((table) => {
                const chain = {
                    select: globals_1.jest.fn().mockReturnThis(),
                    insert: globals_1.jest.fn().mockReturnThis(),
                    update: globals_1.jest.fn().mockReturnThis(),
                    eq: globals_1.jest.fn().mockReturnThis(),
                    single: globals_1.jest.fn().mockReturnThis(),
                    maybeSingle: globals_1.jest.fn().mockReturnThis(),
                    in: globals_1.jest.fn().mockReturnThis(),
                    order: globals_1.jest.fn().mockReturnThis(),
                    then: globals_1.jest.fn((onFulfilled) => {
                        let data = { id: 999 };
                        if (table === 'schedules') {
                            data = Object.assign({ id: 999 }, payload);
                        }
                        else if (table === 'parts') {
                            const isNewPart = chain.eq.mock.calls.some((c) => c[0] === 'reference' && c[1] === 'REF_NEW');
                            if (isNewPart)
                                data = null;
                            else
                                data = { id: 101, reference: 'REF_EXISTING', designation: 'Existing Part', reserved_quantity: 10 };
                        }
                        else if (table === 'profiles') {
                            data = [{ id: 'tech_1', telegramchatid: '12345', first_name: 'Tech', last_name: 'One' }];
                        }
                        else if (table === 'clients') {
                            data = { id: 1, name: 'Client Test' };
                        }
                        else if (table === 'equipments') {
                            data = { id: 1, brand: 'Brand', model: 'Model' };
                        }
                        else {
                            data = [];
                        }
                        return Promise.resolve(onFulfilled({ data, error: null }));
                    }),
                };
                return chain;
            });
            const res = yield (0, supertest_1.default)(index_1.app)
                .post('/api/schedules')
                .set('Authorization', 'Bearer dummy_admin_token')
                .send(payload);
            (0, globals_1.expect)(res.statusCode).toBe(201);
            (0, globals_1.expect)(res.body).toHaveProperty('id');
            (0, globals_1.expect)(res.body.id).toBe(999);
        }));
    });
    (0, globals_1.it)('should fail with 400 when missing mandatory fields', () => __awaiter(void 0, void 0, void 0, function* () {
        const invalidPayload = { title: 'Missing Date' };
        const res = yield (0, supertest_1.default)(index_1.app)
            .post('/api/schedules')
            .set('Authorization', 'Bearer dummy_token')
            .send(invalidPayload);
        (0, globals_1.expect)(res.statusCode).toBe(400);
    }));
    (0, globals_1.it)('should fail when no technicians are provided', () => __awaiter(void 0, void 0, void 0, function* () {
        const payload = Object.assign(Object.assign({}, baseSchedule), { technicianIds: [] });
        const res = yield (0, supertest_1.default)(index_1.app)
            .post('/api/schedules')
            .set('Authorization', 'Bearer dummy_token')
            .send(payload);
        (0, globals_1.expect)(res.statusCode).toBe(400);
    }));
});
