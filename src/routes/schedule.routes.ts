import { Router } from 'express';
import * as scheduleController from '../controllers/schedule.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import * as scheduleValidation from '../validations/schedule.validation';
import { UserRole } from '../constants/enums';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Schedules
 *   description: Management of service schedules
 */

/**
 * @swagger
 * /api/schedules:
 *   get:
 *     summary: Retrieve a list of schedules
 *     tags: [Schedules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by start date (ISO string)
 *       - in: query
 *         name: end
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by end date (ISO string)
 *       - in: query
 *         name: technicianId
 *         schema:
 *           type: string
 *         description: Filter by technician ID
 *       - in: query
 *         name: clientId
 *         schema:
 *           type: integer
 *         description: Filter by client ID
 *     responses:
 *       200:
 *         description: A list of schedules
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   title:
 *                     type: string
 *                   startDate:
 *                     type: string
 *                     format: date-time
 *                   endDate:
 *                     type: string
 *                     format: date-time
 *                   clientId:
 *                     type: integer
 *                   equipmentId:
 *                     type: integer
 *                   serviceType:
 *                     type: string
 *                   isCompleted:
 *                     type: boolean
 */
router.get('/api/schedules',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    scheduleController.getSchedules
);

/**
 * @swagger
 * /api/schedules/{id}:
 *   get:
 *     summary: Get a schedule by ID
 *     tags: [Schedules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The schedule ID
 *     responses:
 *       200:
 *         description: Schedule details
 *       404:
 *         description: Schedule not found
 */
router.get('/api/schedules/:id',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    validate(scheduleValidation.scheduleIdSchema),
    scheduleController.getScheduleById
);

/**
 * @swagger
 * /api/schedules:
 *   post:
 *     summary: Create a new schedule
 *     tags: [Schedules]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startDate
 *               - endDate
 *               - clientId
 *               - equipmentId
 *               - technicianIds
 *             properties:
 *               title:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               clientId:
 *                 type: integer
 *               equipmentId:
 *                 type: integer
 *               technicianIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               ticketId:
 *                 type: integer
 *               internalNotes:
 *                 type: string
 *               serviceType:
 *                 type: array
 *                 items:
 *                   type: string
 *               parts:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     quantity:
 *                       type: integer
 *               includesTravel:
 *                  type: boolean
 *     responses:
 *       201:
 *         description: Schedule created successfully
 *       400:
 *         description: Validation error
 */
router.post('/api/schedules',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    validate(scheduleValidation.createScheduleSchema),
    scheduleController.createSchedule
);

/**
 * @swagger
 * /api/schedules/{id}:
 *   put:
 *     summary: Update an existing schedule
 *     tags: [Schedules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The schedule ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               clientId:
 *                 type: integer
 *               equipmentId:
 *                 type: integer
 *               technicianIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               isCompleted:
 *                 type: boolean
 *               ticketId:
 *                 type: integer
 *               internalNotes:
 *                 type: string
 *               serviceType:
 *                 type: array
 *                 items:
 *                   type: string
 *               parts:
 *                 type: array
 *                 items:
 *                   type: object
 *               includesTravel:
 *                  type: boolean
 *     responses:
 *       200:
 *         description: Schedule updated successfully
 *       404:
 *         description: Schedule not found
 */
router.put('/api/schedules/:id',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    validate(scheduleValidation.updateScheduleSchema),
    scheduleController.updateSchedule
);

/**
 * @swagger
 * /api/schedules/{id}/complete:
 *   post:
 *     summary: Mark a schedule as complete
 *     tags: [Schedules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The schedule ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isCompleted:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Schedule marked as complete
 *       404:
 *         description: Schedule not found
 */
router.post('/api/schedules/:id/complete',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    validate(scheduleValidation.updateScheduleSchema),
    scheduleController.completeSchedule
);

/**
 * @swagger
 * /api/schedules/{id}:
 *   delete:
 *     summary: Delete a schedule
 *     tags: [Schedules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The schedule ID
 *     responses:
 *       204:
 *         description: Schedule deleted successfully
 *       404:
 *         description: Schedule not found
 */
router.delete('/api/schedules/:id',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    validate(scheduleValidation.scheduleIdSchema),
    scheduleController.deleteSchedule
);

/**
 * @swagger
 * /api/schedules/fix-titles:
 *   post:
 *     summary: Fix generic schedule titles
 *     tags: [Schedules]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Schedules fixed
 */
router.post('/api/schedules/fix-titles',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
    scheduleController.fixScheduleTitles
);

export default router;
