import { ProfileRepository } from '../profile.repository';
import { QueryRunner } from '../../../types/db.types';
import { jest, describe, beforeEach, it, expect } from '@jest/globals';

describe('ProfileRepository', () => {
    let repo: ProfileRepository;
    let mockDb: any;

    beforeEach(() => {
        repo = new ProfileRepository();
        mockDb = {
            query: jest.fn()
        };
    });

    it('should update profile and insert client associations without using client_id column on profiles', async () => {
        const data = {
            first_name: 'John',
            last_name: 'Doe',
            client_ids: [10, 20]
        };

        // Mock DB calls to resolve successfully
        mockDb.query.mockResolvedValue({ rows: [{ id: 'user_123', first_name: 'John' }], rowCount: 1 });

        const result = await repo.update('user_123', data, mockDb);

        // Total expected queries: 1 UPDATE + 1 DELETE + 2 INSERT = 4 queries
        expect(mockDb.query).toHaveBeenCalledTimes(4);

        // 1. Check UPDATE query format (ensure client_id is not set)
        const updateCall = mockDb.query.mock.calls[0];
        const updateSql = updateCall[0] as string;
        expect(updateSql).toContain('UPDATE profiles SET');
        expect(updateSql).not.toContain('client_id ='); // Should no longer reference client_id

        // 2. Check DELETE query
        const deleteCall = mockDb.query.mock.calls[1];
        expect(deleteCall[0]).toContain('DELETE FROM client_users WHERE user_id = $1');
        expect(deleteCall[1]).toEqual(['user_123']);

        // 3. Check INSERT queries for each client ID
        const insertCall1 = mockDb.query.mock.calls[2];
        expect(insertCall1[0]).toContain('INSERT INTO client_users (user_id, client_id)');
        expect(insertCall1[1]).toEqual(['user_123', 10]);

        const insertCall2 = mockDb.query.mock.calls[3];
        expect(insertCall2[0]).toContain('INSERT INTO client_users (user_id, client_id)');
        expect(insertCall2[1]).toEqual(['user_123', 20]);

        expect(result).toBeDefined();
        expect(result.id).toBe('user_123');
    });

    it('should update profile only if client_ids is not provided', async () => {
        const data = {
            first_name: 'Jane'
        };

        mockDb.query.mockResolvedValue({ rows: [{ id: 'user_456' }], rowCount: 1 });

        await repo.update('user_456', data, mockDb);

        // Should only execute the UPDATE query, skipping associations
        expect(mockDb.query).toHaveBeenCalledTimes(1);
        const updateCall = mockDb.query.mock.calls[0];
        const updateSql = updateCall[0] as string;
        expect(updateSql).toContain('UPDATE profiles SET');
    });
});
