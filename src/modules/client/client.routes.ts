import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import * as clientValidation from '../../validations/client.validation';
import * as commonValidation from '../../validations/common.validation';
import { UserRole } from '../../constants/enums';
import { createResourceLimiter } from '../../middlewares/rateLimiter.middleware';
import { equipmentController } from '../equipment/equipment.routes';

import { ClientRepository } from './client.repository';
import { ClientService } from './client.service';
import { ClientController } from './client.controller';

const router = Router();

// Dependency Injection wiring
const repo = new ClientRepository();
const service = new ClientService(repo);
const controller = new ClientController(service);

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
 */
router.get(
    '/',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    controller.getClients
);

/**
 * @swagger
 * /api/clients:
 *   post:
 *     summary: Create a new client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Client created successfully
 *       400:
 *         description: Validation error
 */
router.post(
    '/',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    createResourceLimiter,
    validate(clientValidation.createClientSchema),
    controller.createClient
);

/**
 * @swagger
 * /api/clients/{id}:
 *   put:
 *     summary: Update an existing client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Client updated successfully
 *       404:
 *         description: Client not found
 */
router.put(
    '/:id',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    validate(clientValidation.updateClientSchema),
    controller.updateClient
);

/**
 * @swagger
 * /api/clients/{id}:
 *   delete:
 *     summary: Delete a client (Admin only)
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204:
 *         description: Client deleted successfully
 *       404:
 *         description: Client not found
 */
router.delete(
    '/:id',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
    controller.deleteClient
);

router.get(
    '/:id/users',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    controller.getClientUsers
);

/**
 * @swagger
 * /api/clients/{id}/equipments:
 *   get:
 *     summary: Get equipments by client ID
 *     tags: [Equipments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of equipments for the client
 *       404:
 *         description: Client not found
 */
// NOTE: Esta rota usa o equipmentController enquanto o módulo equipment não for migrado.
// Quando a Fase 2 migrar o módulo equipment, mover para equipment.routes.ts ou injetar EquipmentService aqui.
router.get(
    '/:id/equipments',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    validate(commonValidation.idParamSchema),
    equipmentController.getClientEquipments
);

export default router;
