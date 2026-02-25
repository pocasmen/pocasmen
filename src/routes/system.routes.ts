//Horas de desenvolvimento activo=2,0
import { Router } from 'express';
import { logger } from '../utils/logger';
import { pool } from '../config/db';
import path from 'path';
import fs from 'fs';

const router = Router();

// Load package version
let version = 'unknown';
try {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        version = pkg.version;
    }
} catch (err) {
    logger.error(err as any, 'Error reading package.json version');
}

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

/**
 * @swagger
 * /api/status:
 *   get:
 *     summary: Get detailed system status
 *     tags: [System]
 *     responses:
 *       200:
 *         description: System status information
 */
router.get('/api/status', async (req, res) => {
    let dbStatus = 'Disconnected';
    try {
        const result = await pool.query('SELECT 1');
        if (result.rowCount === 1) {
            dbStatus = 'Connected';
        }
    } catch (err) {
        logger.error(err as any, 'Database health check failed');
        dbStatus = 'Error';
    }

    res.json({
        status: 'success',
        data: {
            version,
            dbStatus,
            environment: process.env.NODE_ENV || 'development',
            uptime: process.uptime(),
            nodeVersion: process.version,
            memoryUsage: process.memoryUsage(),
            timestamp: new Date().toISOString()
        }
    });
});

export default router;

