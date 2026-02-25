//Horas de desenvolvimento activo=2,0
import { Router } from 'express';
import * as clientController from '../controllers/client.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import * as clientValidation from '../validations/client.validation';
import { UserRole } from '../constants/enums';
import { createResourceLimiter } from '../middlewares/rateLimiter.middleware';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Clients
 *   description: Management of clients
 */

/**
 * @swagger
 * /api/clients:
 *   get:
 *     summary: Retrieve a list of clients
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of clients
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   nif:
 *                     type: string
 *                   email:
 *                     type: string
 *                   phone:
 *                     type: string
 *                   address:
 *                     type: string
 *                   hasContract:
 *                     type: boolean
 */
router.get('/api/clients', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]), clientController.getClients);

/**
 * @swagger
 * /api/clients:
 *   post:
 *     summary: Create a new client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               nif:
 *                 type: string
 *                 description: Must be 9-15 characters if provided
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
 *               hasContract:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Client created successfully
 *       400:
 *         description: Validation error
 */
router.post('/api/clients',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    createResourceLimiter,
    validate(clientValidation.createClientSchema),
    clientController.createClient
);

/**
 * @swagger
 * /api/clients/{id}:
 *   put:
 *     summary: Update an existing client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The client ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               nif:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
 *               hasContract:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Client updated successfully
 *       404:
 *         description: Client not found
 */
router.put('/api/clients/:id',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    validate(clientValidation.updateClientSchema),
    clientController.updateClient
);

/**
 * @swagger
 * /api/clients/{id}:
 *   delete:
 *     summary: Delete a client (Admin only)
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The client ID
 *     responses:
 *       204:
 *         description: Client deleted successfully
 *       404:
 *         description: Client not found
 */
router.delete('/api/clients/:id', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), clientController.deleteClient);

export default router;
