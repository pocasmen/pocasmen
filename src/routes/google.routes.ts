import { Router } from 'express';
import * as googleController from '../controllers/google.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { UserRole } from '../constants/enums';

const router = Router();

router.post('/api/google/calendar/sync', authenticateToken, authorizeRoles([UserRole.SUPER_ADMIN]), googleController.syncGoogleCalendar);
router.post('/api/google/calendar/clear', authenticateToken, authorizeRoles([UserRole.SUPER_ADMIN]), googleController.clearGoogleCalendar);

export default router;
