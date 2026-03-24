import { Router } from 'express';
import { SystemController } from './system.controller';

const router = Router();
const controller = new SystemController();

/**
 * @swagger
 * tags:
 *   name: System
 *   description: System health and test endpoints
 */

router.get('/test', controller.test);
router.get('/healthcheck', controller.healthcheck);
router.get('/status', controller.status);
router.post('/test-email', controller.testEmail);

export default router;
