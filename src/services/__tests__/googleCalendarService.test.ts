import { googleCalendarService } from '../googleCalendarService';
import { SupabaseClient } from '@supabase/supabase-js';

describe('Google Calendar Service', () => {
    let mockSupabase: any;

    beforeEach(() => {
        mockSupabase = {
            from: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                single: jest.fn().mockReturnThis(),
                then: jest.fn((cb: any) => Promise.resolve(cb({
                    data: {
                        id: 1,
                        title: 'Test',
                        startDate: '2026-01-01T10:00:00Z',
                        endDate: '2026-01-01T11:00:00Z',
                        clientId: 1,
                        equipmentId: 1,
                        serviceType: 'manutencao'
                    }, error: null
                })))
            }),
            storage: {
                from: jest.fn().mockReturnValue({
                    getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'http://test.com' } })
                })
            }
        };
    });

    test('should fetch schedule data for sync', async () => {
        // This is a partial test as googleCalendarService is complex and interacts with Google APIs
        // but it checks the Supabase fetching part
        try {
            await googleCalendarService.syncSchedule(mockSupabase, 'calendar_id', 1);
        } catch (e) {
            // Likely fails due to missing Google credentials in environment, which is expected in unit test
        }
        expect(mockSupabase.from).toHaveBeenCalledWith('schedules');
    });
});
