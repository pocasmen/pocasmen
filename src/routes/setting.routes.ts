import { Router } from 'express';
import * as settingController from '../controllers/setting.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { UserRole } from '../constants/enums';

const router = Router();

router.get('/api/settings', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), settingController.getSettings);
router.put('/api/settings', authenticateToken, authorizeRoles([UserRole.SUPER_ADMIN]), settingController.updateSettings);

export default router;
