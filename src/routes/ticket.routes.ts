import { Router } from 'express';
import * as ticketController from '../controllers/ticket.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import * as ticketValidation from '../validations/ticket.validation';
import { UserRole } from '../constants/enums';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Tickets
 *   description: Management of tickets
 */

/**
 * @swagger
 * /api/tickets:
 *   get:
 *     summary: Retrieve a list of tickets
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, scheduled, in_progress, closed]
 *         description: Filter by ticket status
 *     responses:
 *       200:
 *         description: A list of tickets
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
 *                   faultDescription:
 *                     type: string
 *                   status:
 *                     type: string
 *                   client_id:
 *                     type: integer
 *                   equipmentId:
 *                     type: integer
 */
router.get('/api/tickets', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]), ticketController.getTickets);

/**
 * @swagger
 * /api/tickets/{id}:
 *   get:
 *     summary: Get a ticket by ID
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ticket ID
 *     responses:
 *       200:
 *         description: Ticket details including responses
 *       404:
 *         description: Ticket not found
 */
router.get('/api/tickets/:id', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN, UserRole.CLIENT]), validate(ticketValidation.ticketIdSchema), ticketController.getTicketById);

/**
 * @swagger
 * /api/tickets:
 *   post:
 *     summary: Create a new ticket
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - client_id
 *               - equipmentId
 *               - title
 *               - faultDescription
 *             properties:
 *               client_id:
 *                 type: integer
 *               equipmentId:
 *                 type: integer
 *               title:
 *                 type: string
 *               faultDescription:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [open, scheduled, in_progress, closed]
 *     responses:
 *       201:
 *         description: Ticket created successfully
 *       400:
 *         description: Validation error
 */
router.post('/api/tickets', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN, UserRole.CLIENT]), validate(ticketValidation.createTicketSchema), ticketController.createTicket);

/**
 * @swagger
 * /api/tickets/{id}/responses:
 *   post:
 *     summary: Reply to a ticket
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ticket ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reply added successfully
 *       404:
 *         description: Ticket not found
 */
router.post('/api/tickets/:id/responses', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN, UserRole.CLIENT]), validate(ticketValidation.replyToTicketSchema), ticketController.replyToTicket);

/**
 * @swagger
 * /api/tickets/{id}:
 *   delete:
 *     summary: Delete a ticket (Admin only)
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ticket ID
 *     responses:
 *       204:
 *         description: Ticket deleted successfully
 *       404:
 *         description: Ticket not found
 */
router.delete('/api/tickets/:id', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), validate(ticketValidation.ticketIdSchema), ticketController.deleteTicket);

export default router;
