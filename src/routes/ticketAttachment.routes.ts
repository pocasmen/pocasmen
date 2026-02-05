import { Router } from 'express';
import * as ticketAttachmentController from '../controllers/ticketAttachment.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import multer from 'multer';
import { UserRole } from '../constants/enums';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.get('/api/tickets/:id/attachments', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN, UserRole.CLIENT]), ticketAttachmentController.getAttachments);
router.post('/api/tickets/:id/attachments', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN, UserRole.CLIENT]), upload.single('file'), ticketAttachmentController.uploadAttachment);
router.delete('/api/attachments/:attachmentId', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), ticketAttachmentController.deleteAttachment);

export default router;
