import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import * as reportValidation from '../../validations/report.validation';
import { UserRole } from '../../constants/enums';
import multer from 'multer';
import { ReportRepository } from './report.repository';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { ReportAttachmentRepository } from './reportAttachment.repository';
import { ReportAttachmentService } from './reportAttachment.service';
import { ReportAttachmentController } from './reportAttachment.controller';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

const repo = new ReportRepository();
const service = new ReportService(repo);
const controller = new ReportController(service);

const attRepo = new ReportAttachmentRepository();
const attService = new ReportAttachmentService(attRepo);
const attController = new ReportAttachmentController(attService);

const ALL_ROLES = [UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN, UserRole.CLIENT];
const STAFF    = [UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN];

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: Management of service reports
 */

router.get('/', authenticateToken, authorizeRoles(ALL_ROLES), controller.getReports);
router.get('/by-schedule/:scheduleId', authenticateToken, authorizeRoles(STAFF), validate(reportValidation.scheduleIdParamSchema), controller.getReportBySchedule);
router.get('/:id', authenticateToken, authorizeRoles(ALL_ROLES), validate(reportValidation.reportIdSchema), controller.getReportById);
router.post('/', authenticateToken, authorizeRoles(STAFF), validate(reportValidation.createReportSchema), controller.createReport);
router.put('/:id', authenticateToken, authorizeRoles(STAFF), validate(reportValidation.updateReportSchema), controller.updateReport);
router.delete('/:id', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), validate(reportValidation.reportIdSchema), controller.deleteReport);

// Report Attachments
router.get('/:id/attachments', authenticateToken, authorizeRoles(ALL_ROLES), attController.getReportAttachments);
router.post('/:id/attachments', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.SUPER_ADMIN]), upload.single('file'), attController.uploadReportAttachment);
router.delete('/attachments/:attachmentId', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), attController.deleteReportAttachment);

export default router;

// Named export for clientPortal compatibility
export const reportRepository = repo;
