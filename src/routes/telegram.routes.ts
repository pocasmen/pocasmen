import { Router } from 'express';
import * as telegramController from '../controllers/telegram.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { UserRole } from '../constants/enums';

const router = Router();

router.get('/bot-info', authenticateToken, authorizeRoles([UserRole.SUPER_ADMIN]), telegramController.getBotInfo);
router.post('/set-webhook', authenticateToken, authorizeRoles([UserRole.SUPER_ADMIN]), telegramController.setWebhook);
router.post('/webhook', telegramController.handleWebhook);
router.post('/sync-updates', authenticateToken, authorizeRoles([UserRole.SUPER_ADMIN]), telegramController.syncUpdates);

export default router;
