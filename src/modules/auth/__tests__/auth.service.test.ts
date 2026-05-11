import { AuthService } from '../auth.service';
import { ClientRepository } from '../../client/client.repository';
import { jest, describe, beforeEach, it, expect, afterEach } from '@jest/globals';
import { UserRole } from '../../../constants/enums';

// Mocks
jest.mock('../../../config/supabase', () => ({
    supabase: {
        auth: {
            admin: {
                getUserById: jest.fn(),
                updateUserById: jest.fn(),
                inviteUserByEmail: jest.fn(),
                generateLink: jest.fn()
            }
        }
    }
}));

jest.mock('../../../config/db', () => ({
    pool: {
        query: jest.fn()
    },
    withTransactionAs: jest.fn(async (userId, callback: any) => {
        // Mock a DB runner
        const mockDb = { query: (jest.fn() as any).mockResolvedValue({ rowCount: 1 }) };
        return await callback(mockDb);
    })
}));

jest.mock('../../../services/emailService', () => ({
    sendEmailWithTemplate: jest.fn(async () => true)
}));

import { supabase } from '../../../config/supabase';
import * as db from '../../../config/db';
import * as emailService from '../../../services/emailService';

describe('AuthService', () => {
    let authService: AuthService;
    let clientRepoMock: jest.Mocked<ClientRepository>;

    beforeEach(() => {
        clientRepoMock = {
            findById: jest.fn(),
            findAll: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findUsersByClientId: jest.fn(),
            validateAccess: jest.fn(),
            findMyCompanies: jest.fn()
        } as unknown as jest.Mocked<ClientRepository>;

        authService = new AuthService(clientRepoMock);
        jest.clearAllMocks();
        (emailService.sendEmailWithTemplate as jest.Mock).mockReturnValue(Promise.resolve(true));
    });

    describe('inviteUser', () => {
        it('should invite a user to a client and pass company_name', async () => {
            const data = { email: 'new@example.com', client_id: 1, role: UserRole.CLIENT };
            
            clientRepoMock.findById.mockResolvedValue({ id: 1, name: 'Test Corp' } as any);
            (supabase.auth.admin.inviteUserByEmail as jest.Mock).mockImplementation(async () => ({ error: null }));

            const result = await authService.inviteUser(data, UserRole.ADMIN);

            expect(clientRepoMock.findById).toHaveBeenCalledWith(1, db.pool);
            expect(supabase.auth.admin.inviteUserByEmail).toHaveBeenCalledWith('new@example.com', expect.objectContaining({
                data: expect.objectContaining({
                    role: UserRole.CLIENT,
                    client_id: 1,
                    company_name: 'Test Corp' // Testing that the company name was attached
                })
            }));
            expect(result.message).toContain('Invite sent to new@example.com');
        });
    });

    describe('approveUser', () => {
        it('should approve a user without using profiles.client_id directly', async () => {
            const data = { userId: 'pending_123', client_ids: [100] };
            
            // Mock fetching the user via Supabase
            (supabase.auth.admin.getUserById as jest.Mock).mockImplementation(async () => ({
                data: { user: { id: 'pending_123', email: 'pending@example.com' } },
                error: null
            }));

            (supabase.auth.admin.updateUserById as jest.Mock).mockImplementation(async () => ({
                data: { user: { id: 'pending_123', email: 'pending@example.com' } },
                error: null
            }));

            (supabase.auth.admin.generateLink as jest.Mock).mockImplementation(async () => ({
                data: { properties: { action_link: 'http://test-link.com' } },
                error: null
            }));

            // Using the mocked withTransactionAs which provides a mockDb
            (db.withTransactionAs as jest.Mock).mockImplementation(async (userId, callback: any) => {
                const mockDb = { query: (jest.fn() as any).mockResolvedValue({ rowCount: 1 }) };
                return await callback(mockDb);
            });

            const result = await authService.approveUser(data, 'admin_999');

            expect(supabase.auth.admin.getUserById).toHaveBeenCalledWith('pending_123');
            expect(db.withTransactionAs).toHaveBeenCalled();
            expect(result).toBeDefined();
        });
    });
});
