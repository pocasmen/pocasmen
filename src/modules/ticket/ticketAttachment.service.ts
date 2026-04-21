import { supabase, ATTACHMENTS_BUCKET } from '../../config/supabase';
import { pool, withTransactionAs } from '../../config/db';
import { ApiError, BadRequestError, NotFoundError } from '../../utils/ApiError';
import { TicketAttachmentRepository } from './ticketAttachment.repository';

export class TicketAttachmentService {
    constructor(private attachmentRepo: TicketAttachmentRepository) {}

    async getAttachments(ticketId: number) {
        const attachments = await this.attachmentRepo.findByTicketId(ticketId, pool);

        const result = await Promise.all((attachments || []).map(async (att: any) => {
            const { data: signed } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(att.storage_path || '', 3600);
            return { ...att, url: signed?.signedUrl || '' };
        }));

        return result;
    }

    async uploadAttachment(ticketId: number, file: Express.Multer.File, userId: string) {
        if (!file) throw new BadRequestError('No file uploaded.');

        const fileExt = file.originalname.split('.').pop();
        const filePath = `tickets/${ticketId}/${Date.now()}-${Math.round(Math.random() * 1E9)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(filePath, file.buffer, { contentType: file.mimetype });
        if (uploadError) throw new ApiError(500, 'Upload failed', uploadError.message);

        return await withTransactionAs(userId, async (db) => {
            const { rows } = await db.query(
                'INSERT INTO ticket_attachments (ticket_id, file_name, mime_type, storage_path, uploaded_by_user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                [ticketId, file.originalname, file.mimetype, filePath, userId]
            );
            return rows[0];
        });
    }

    async deleteAttachment(attachmentId: string, userId: string) {
        await withTransactionAs(userId, async (db) => {
            const att = await this.attachmentRepo.findById(attachmentId, db);

            if (att) {
                await supabase.storage.from(ATTACHMENTS_BUCKET).remove([att.storage_path]);
                const { rowCount } = await db.query('DELETE FROM ticket_attachments WHERE id = $1', [attachmentId]);
                if (rowCount === 0) throw new NotFoundError('Attachment not found.');
            }
        });
    }
}
