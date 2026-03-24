import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middlewares/auth.middleware';
import { UserRole } from '../../constants/enums';
import { GoogleService } from './google.service';
import { GoogleController } from './google.controller';

const router = Router();

const service = new GoogleService();
const controller = new GoogleController(service);

router.post('/calendar/sync', authenticateToken, authorizeRoles([UserRole.SUPER_ADMIN]), controller.syncGoogleCalendar);
router.post('/calendar/clear', authenticateToken, authorizeRoles([UserRole.SUPER_ADMIN]), controller.clearGoogleCalendar);

export default router;
