import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middlewares/auth.middleware';
import { UserRole } from '../../constants/enums';
import { SettingRepository } from '../setting/setting.repository';
import { EmailTemplateService } from './emailTemplate.service';
import { EmailTemplateController } from './emailTemplate.controller';

const router = Router();

// EmailTemplate reutiliza SettingRepository (armazena em settings table)
const settingRepo = new SettingRepository();
const service = new EmailTemplateService(settingRepo);
const controller = new EmailTemplateController(service);

router.get('/', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), controller.getTemplates);
router.put('/', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), controller.updateTemplates);

export default router;
