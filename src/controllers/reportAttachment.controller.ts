import { Response } from 'express';
import { supabase, ATTACHMENTS_BUCKET } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { catchAsync } from '../utils/catchAsync';
import { ApiError, BadRequestError, UnauthorizedError, NotFoundError } from '../utils/ApiError';
import { withTransaction } from '../config/db';

export const getReportAttachments = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const reportId = Number(req.params.id);
    const { data: attachments, error } = await supabase
        .from('report_attachments' as any)
        .select('*')
        .eq('report_id', reportId)
        .order('created_at', { ascending: false });

    if (error) throw new ApiError(500, 'Failed to fetch attachments', error.message);

    const result = await Promise.all(((attachments as any[]) || []).map(async att => {
        const { data: signed } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(att.storage_path || '', 3600);
        return { ...att, url: signed?.signedUrl || '' };
    }));

    res.json(result);
});

export const uploadReportAttachment = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const reportId = Number(req.params.id);
    const file = req.file;
    if (!file) throw new BadRequestError('No file uploaded.');

    const fileExt = file.originalname.split('.').pop();
    const filePath = `reports/${reportId}/${Date.now()}-${Math.round(Math.random() * 1E9)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(filePath, file.buffer, { contentType: file.mimetype });
    if (uploadError) throw new ApiError(500, 'Upload failed', uploadError.message);

    const result = await withTransaction(req, async (db) => {
        const { rows } = await db.query(
            'INSERT INTO report_attachments (report_id, file_name, mime_type, storage_path, uploaded_by_user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [reportId, file.originalname, file.mimetype, filePath, req.user!.id]
        );
        return rows[0];
    });

    res.status(201).json(result);
});

export const deleteReportAttachment = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { attachmentId } = req.params;

    await withTransaction(req, async (db) => {
        // Need to use UUID for ID in report_attachments
        const { rows } = await db.query('SELECT storage_path FROM report_attachments WHERE id = $1', [attachmentId]);
        const att = rows[0];

        if (att) {
            await supabase.storage.from(ATTACHMENTS_BUCKET).remove([att.storage_path]);
            const { rowCount } = await db.query('DELETE FROM report_attachments WHERE id = $1', [attachmentId]);
            if (rowCount === 0) throw new NotFoundError('Attachment not found.');
        }
    });

    res.sendStatus(204);
});
