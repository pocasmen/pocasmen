import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middlewares/auth.middleware';
import { UserRole } from '../../constants/enums';
import { TaskRepository } from '../task/task.repository';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

const router = Router();

const taskRepo = new TaskRepository();
const service = new DashboardService(taskRepo);
const controller = new DashboardController(service);

const STAFF = [UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN];

router.get('/stats', authenticateToken, authorizeRoles(STAFF), controller.getStats);
router.get('/weekly-schedules', authenticateToken, authorizeRoles(STAFF), controller.getWeeklySchedules);
router.get('/pending-reports', authenticateToken, authorizeRoles(STAFF), controller.getPendingReports);

export default router;
