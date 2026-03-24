import { Router } from 'express';
import { pool } from '../../config/db';
import { authenticateToken, authorizeRoles } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import * as scheduleValidation from '../../validations/schedule.validation';
import { UserRole } from '../../constants/enums';
import { ScheduleRepository } from './schedule.repository';
import { ScheduleService } from './schedule.service';
import { ScheduleController } from './schedule.controller';

const router = Router();

const repo = new ScheduleRepository(pool);
const service = new ScheduleService(repo);
const controller = new ScheduleController(service);

const STAFF = [UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN];

/**
 * @swagger
 * tags:
 *   name: Schedules
 *   description: Management of service schedules
 */

router.get('/', authenticateToken, authorizeRoles(STAFF), controller.getSchedules);
router.get('/:id', authenticateToken, authorizeRoles(STAFF), validate(scheduleValidation.scheduleIdSchema), controller.getScheduleById);
router.post('/', authenticateToken, authorizeRoles(STAFF), validate(scheduleValidation.createScheduleSchema), controller.createSchedule);
router.post('/fix-titles', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), controller.fixScheduleTitles);
router.put('/:id', authenticateToken, authorizeRoles(STAFF), validate(scheduleValidation.updateScheduleSchema), controller.updateSchedule);
router.post('/:id/complete', authenticateToken, authorizeRoles(STAFF), validate(scheduleValidation.updateScheduleSchema), controller.completeSchedule);
router.delete('/:id', authenticateToken, authorizeRoles(STAFF), validate(scheduleValidation.scheduleIdSchema), controller.deleteSchedule);

export default router;

// Named export para o telegram.controller e clientPortal
export const scheduleRepository = repo;
