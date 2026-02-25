//Horas de desenvolvimento activo=1,5
import { Router } from 'express';
import * as emailTemplateController from '../controllers/emailTemplate.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { UserRole } from '../constants/enums';

const router = Router();

router.get('/api/admin/email-templates', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), emailTemplateController.getTemplates);
router.put('/api/admin/email-templates', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), emailTemplateController.updateTemplates);

export default router;
