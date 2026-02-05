import { Router } from 'express';
import * as technicianController from '../controllers/technician.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import * as technicianValidation from '../validations/technician.validation';
import { UserRole } from '../constants/enums';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Technicians
 *   description: Management of technicians
 */

/**
 * @swagger
 * /api/technicians:
 *   get:
 *     summary: Retrieve a list of technicians
 *     tags: [Technicians]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of technicians
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                   email:
 *                     type: string
 *                   first_name:
 *                     type: string
 *                   last_name:
 *                     type: string
 *                   role:
 *                     type: string
 *                   color:
 *                     type: string
 */
router.get('/api/technicians', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]), technicianController.getTechnicians);

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Get current logged-in user details
 *     tags: [Technicians]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user details
 *       401:
 *         description: Unauthorized
 */
router.get('/api/users/me', authenticateToken, technicianController.getMe);

/**
 * @swagger
 * /api/technicians/{id}:
 *   put:
 *     summary: Update a technician (Admin only)
 *     tags: [Technicians]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The technician (user) ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               color:
 *                 type: string
 *               telegramchatid:
 *                 type: string
 *               signature:
 *                 type: string
 *               daily_notifications_enabled:
 *                 type: boolean
 *               notification_time:
 *                 type: string
 *               phone:
 *                 type: string
 *               google_calendar_color_id:
 *                  type: string
 *     responses:
 *       200:
 *         description: Technician updated successfully
 *       404:
 *         description: Technician not found
 */
router.put('/api/technicians/:id', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), validate(technicianValidation.updateTechnicianSchema), technicianController.updateTechnician);

export default router;
