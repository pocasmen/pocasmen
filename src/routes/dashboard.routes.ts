import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { UserRole } from '../constants/enums';

const router = Router();

router.get('/api/dashboard/stats', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]), dashboardController.getStats);
router.get('/api/dashboard/weekly-schedules', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]), dashboardController.getWeeklySchedules);
router.get('/api/dashboard/pending-reports', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]), dashboardController.getPendingReports);

export default router;
