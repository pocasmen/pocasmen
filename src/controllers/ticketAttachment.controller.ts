import { Response } from 'express';
import { supabase, ATTACHMENTS_BUCKET } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { catchAsync } from '../utils/catchAsync';
import { ApiError, BadRequestError, UnauthorizedError } from '../utils/ApiError';

export const getAttachments = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const ticketId = Number(req.params.id);
    const { data: attachments, error } = await supabase
        .from('ticket_attachments')
        .select('id, ticket_id, file_name, mime_type, storage_path, uploaded_by_user_id, created_at')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false });

    if (error) throw new ApiError(500, 'Failed to fetch attachments', error.message);

    const result = await Promise.all((attachments || []).map(async att => {
        const { data: signed } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(att.storage_path, 3600);
        return { ...att, url: signed?.signedUrl || '' };
    }));

    res.json(result);
});

export const uploadAttachment = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const ticketId = Number(req.params.id);
    const file = req.file;
    if (!file) throw new BadRequestError('No file uploaded.');

    const fileExt = file.originalname.split('.').pop();
    const filePath = `tickets/${ticketId}/${Date.now()}-${Math.round(Math.random() * 1E9)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(filePath, file.buffer, { contentType: file.mimetype });
    if (uploadError) throw new ApiError(500, 'Upload failed', uploadError.message);

    const { data, error } = await supabase
        .from('ticket_attachments')
        .insert({ ticket_id: ticketId, file_name: file.originalname, mime_type: file.mimetype, storage_path: filePath, uploaded_by_user_id: req.user.id })
        .select().single();

    if (error) throw new ApiError(500, 'Metadata save failed', error.message);
    res.status(201).json(data);
});

export const deleteAttachment = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { attachmentId } = req.params;
    const { data: att } = await supabase.from('ticket_attachments').select('storage_path').eq('id', attachmentId).single();
    if (att) {
        await supabase.storage.from(ATTACHMENTS_BUCKET).remove([(att as any).storage_path]);
        await supabase.from('ticket_attachments').delete().eq('id', attachmentId);
    }
    res.sendStatus(204);
});
