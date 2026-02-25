//Horas de desenvolvimento activo=1,5
import { Router } from 'express';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: System
 *   description: System health and test endpoints
 */

/**
 * @swagger
 * /api/test:
 *   get:
 *     summary: Test server availability
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Server is alive
 */
router.get('/api/test', (req, res) => {
    logger.info('[DEBUG] /api/test endpoint hit. Server is alive!');
    res.send('Server is alive!');
});

/**
 * @swagger
 * /api/healthcheck:
 *   get:
 *     summary: Health check endpoint
 *     tags: [System]
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/api/healthcheck', (req, res) => {
    logger.info('[DEBUG] /api/healthcheck endpoint hit. UptimeBot is alive!');
    res.status(200).send('OK');
});

export default router;
