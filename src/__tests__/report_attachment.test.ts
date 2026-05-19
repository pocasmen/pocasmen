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
import { ReportAttachmentService } from '../modules/report/reportAttachment.service';
import { ReportAttachmentRepository } from '../modules/report/reportAttachment.repository';
import { supabase } from '../config/supabase';

// 2. Mock DB and withTransactionAs
jest.mock('../config/db', () => ({
    pool: {},
    withTransactionAs: jest.fn(),
}));

describe('ReportAttachmentService', () => {
    let service: ReportAttachmentService;
    let mockRepo: jest.Mocked<ReportAttachmentRepository>;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockRepo = {
            findByReportId: jest.fn(),
            findById: jest.fn(),
        } as unknown as jest.Mocked<ReportAttachmentRepository>;

        service = new ReportAttachmentService(mockRepo);
    });

    describe('uploadReportAttachment', () => {
        const mockFile = {
            originalname: 'photo.jpg',
            mimetype: 'image/jpeg',
            buffer: Buffer.from('fake image content'),
        } as unknown as Express.Multer.File;

        it('should successfully upload an attachment and save to DB', async () => {
            const mockUpload = (jest.fn() as any).mockResolvedValue({ data: { path: 'reports/123/photo.jpg' }, error: null });
            (supabase.storage.from as any).mockImplementation(() => ({
                upload: mockUpload,
            }));

            // Dynamically mock withTransactionAs
            const { withTransactionAs } = require('../config/db');
            (withTransactionAs as any).mockImplementationOnce(async (userId: string, callback: any) => {
                const mockDb = {
                    query: (jest.fn() as any).mockResolvedValue({
                        rows: [{ id: 'mock-att-uuid', report_id: 123, file_name: 'photo.jpg' }]
                    }),
                };
                return callback(mockDb);
            });

            const result = await service.uploadReportAttachment(123, mockFile, 'user-123');

            expect(mockUpload).toHaveBeenCalled();
            expect(result).toHaveProperty('id', 'mock-att-uuid');
        });

        it('should throw correct error if no file is provided', async () => {
            await expect(service.uploadReportAttachment(123, null as any, 'user-123'))
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

            await expect(service.uploadReportAttachment(123, mockFile, 'user-123'))
                .rejects
                .toThrow('Upload failed');
        });
    });

    describe('deleteReportAttachment', () => {
        it('should delete file from storage and record from database', async () => {
            const mockAttachment = {
                id: 'att-1',
                report_id: 123,
                storage_path: 'reports/123/file.png'
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
                return callback(mockDb);
            });

            await service.deleteReportAttachment('att-1', 'user-123');

            expect(mockRepo.findById).toHaveBeenCalledWith('att-1', expect.any(Object));
            expect(mockRemove).toHaveBeenCalledWith(['reports/123/file.png']);
        });
    });
});
