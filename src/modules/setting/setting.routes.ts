import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middlewares/auth.middleware';
import { UserRole } from '../../constants/enums';
import { SettingRepository } from './setting.repository';
import { SettingService } from './setting.service';
import { SettingController } from './setting.controller';

const router = Router();
const repo = new SettingRepository();
const service = new SettingService(repo);
const controller = new SettingController(service);

router.get('/', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.TECHNICIAN]), controller.getSettings);
router.put('/', authenticateToken, authorizeRoles([UserRole.SUPER_ADMIN]), controller.updateSettings);

export default router;
