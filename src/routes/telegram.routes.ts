import { Router } from 'express';
import * as telegramController from '../controllers/telegram.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { UserRole } from '../constants/enums';

const router = Router();

router.get('/api/telegram/bot-info', authenticateToken, authorizeRoles([UserRole.SUPER_ADMIN]), telegramController.getBotInfo);
router.post('/api/telegram/set-webhook', authenticateToken, authorizeRoles([UserRole.SUPER_ADMIN]), telegramController.setWebhook);
router.post('/api/telegram/webhook', telegramController.handleWebhook);
router.post('/api/telegram-webhook', telegramController.handleWebhook); // Fallback para URLs com hífen
router.post('/api/telegram/sync-updates', authenticateToken, authorizeRoles([UserRole.SUPER_ADMIN]), telegramController.syncUpdates);

export default router;
