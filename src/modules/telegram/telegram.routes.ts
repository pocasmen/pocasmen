import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middlewares/auth.middleware';
import { UserRole } from '../../constants/enums';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { ScheduleRepository } from '../schedule/schedule.repository';
import { ProfileRepository } from '../technician/profile.repository';
import { pool } from '../../config/db';

const router = Router();

const scheduleRepo = new ScheduleRepository(pool);
const profileRepo = new ProfileRepository();
const service = new TelegramService(scheduleRepo, profileRepo);
const controller = new TelegramController(service);

router.get('/bot-info', authenticateToken, authorizeRoles([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.CLIENT]), controller.getBotInfo);
router.post('/set-webhook', authenticateToken, authorizeRoles([UserRole.SUPER_ADMIN]), controller.setWebhook);
router.post('/webhook', controller.handleWebhook);
router.post('/sync-updates', authenticateToken, authorizeRoles([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.CLIENT]), controller.syncUpdates);

export const initializeTelegramBot = () => service.initializeTelegramBot();

export default router;
