import { Router } from 'express';
import * as reportAttachmentController from '../controllers/reportAttachment.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import multer from 'multer';
import { UserRole } from '../constants/enums';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.get('/api/reports/:id/attachments',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN, UserRole.CLIENT]),
    reportAttachmentController.getReportAttachments
);

router.post('/api/reports/:id/attachments',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.SUPER_ADMIN]),
    upload.single('file'),
    reportAttachmentController.uploadReportAttachment
);

router.delete('/api/reports/attachments/:attachmentId',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
    reportAttachmentController.deleteReportAttachment
);

export default router;
