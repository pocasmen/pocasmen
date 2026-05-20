import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// 1. Mock @supabase/supabase-js
jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => ({
        storage: {
            from: jest.fn(() => ({
                upload: jest.fn(),
                createSignedUrl: jest.fn(),
                remove: jest.fn(),
            })),
        },
    })),
}));

// Import service, repository and supabase after mocking @supabase/supabase-js
import { TicketAttachmentService } from '../modules/ticket/ticketAttachment.service';
import { TicketAttachmentRepository } from '../modules/ticket/ticketAttachment.repository';
import { supabase } from '../config/supabase';

// 2. Mock DB and withTransactionAs
jest.mock('../config/db', () => ({
    pool: {},
    withTransactionAs: jest.fn(),
}));

describe('TicketAttachmentService', () => {
    let service: TicketAttachmentService;
    let mockRepo: jest.Mocked<TicketAttachmentRepository>;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockRepo = {
            findByTicketId: jest.fn(),
            findById: jest.fn(),
        } as unknown as jest.Mocked<TicketAttachmentRepository>;

        service = new TicketAttachmentService(mockRepo);
    });

    describe('uploadAttachment', () => {
        const mockFile = {
            originalname: 'log.txt',
            mimetype: 'text/plain',
            buffer: Buffer.from('fake log content'),
        } as unknown as Express.Multer.File;

        it('should successfully upload an attachment and save to DB', async () => {
            const mockUpload = (jest.fn() as any).mockResolvedValue({ data: { path: 'tickets/65/log.txt' }, error: null });
            (supabase.storage.from as any).mockImplementation(() => ({
                upload: mockUpload,
            }));

            // Dynamically mock withTransactionAs
            const { withTransactionAs } = require('../config/db');
            (withTransactionAs as any).mockImplementationOnce(async (userId: string, callback: any) => {
                const mockDb = {
                    query: (jest.fn() as any).mockResolvedValue({
                        rows: [{ id: 'mock-att-uuid', ticket_id: 65, file_name: 'log.txt' }]
                    }),
                };
                return callback(mockDb);
            });

            const result = await service.uploadAttachment(65, mockFile, 'user-123');

            expect(mockUpload).toHaveBeenCalled();
            expect(result).toHaveProperty('id', 'mock-att-uuid');
        });

        it('should throw correct error if no file is provided', async () => {
            await expect(service.uploadAttachment(65, null as any, 'user-123'))
                .rejects
                .toThrow('No file uploaded.');
        });

        it('should throw correct error if storage upload fails', async () => {
            const mockUpload = (jest.fn() as any).mockResolvedValue({
                data: null,
                error: { message: 'new row violates row-level security policy' }
            });
            (supabase.storage.from as any).mockImplementation(() => ({
                upload: mockUpload,
            }));

            await expect(service.uploadAttachment(65, mockFile, 'user-123'))
                .rejects
                .toThrow('Upload failed');
        });
    });

    describe('deleteAttachment', () => {
        it('should delete file from storage and record from database', async () => {
            const mockAttachment = {
                id: 'att-2',
                ticket_id: 65,
                storage_path: 'tickets/65/file.png'
            };
            
            mockRepo.findById.mockResolvedValue(mockAttachment);
            const mockRemove = (jest.fn() as any).mockResolvedValue({ data: [], error: null });
            (supabase.storage.from as any).mockImplementation(() => ({
                remove: mockRemove,
            }));

            // Re-mock withTransactionAs to test the DELETE query
            const { withTransactionAs } = require('../config/db');
            (withTransactionAs as any).mockImplementationOnce(async (userId: string, callback: any) => {
                const mockDb = {
                    query: (jest.fn() as any).mockResolvedValue({ rowCount: 1 }),
                };
                await callback(mockDb);
            });

            await service.deleteAttachment('att-2', 'user-123');

            expect(mockRepo.findById).toHaveBeenCalledWith('att-2', expect.any(Object));
            expect(mockRemove).toHaveBeenCalledWith(['tickets/65/file.png']);
        });
    });
});
