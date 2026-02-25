//Horas de desenvolvimento activo=2,5
import { Router } from 'express';
import * as equipmentController from '../controllers/equipment.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import * as equipmentValidation from '../validations/equipment.validation';
import * as commonValidation from '../validations/common.validation';
import { UserRole } from '../constants/enums';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Equipments
 *   description: Management of equipments
 */

/**
 * @swagger
 * /api/equipments:
 *   get:
 *     summary: Retrieve a list of equipments
 *     tags: [Equipments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of equipments
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   brand:
 *                     type: string
 *                   model:
 *                     type: string
 *                   serialNumber:
 *                     type: string
 *                   clientId:
 *                     type: integer
 */
router.get('/api/equipments', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]), equipmentController.getEquipments);

/**
 * @swagger
 * /api/clients/{id}/equipments:
 *   get:
 *     summary: Get equipments by client ID
 *     tags: [Equipments]
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
 *       200:
 *         description: List of equipments for the client
 *       404:
 *         description: Client not found
 */
router.get('/api/clients/:id/equipments',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    validate(commonValidation.idParamSchema),
    equipmentController.getClientEquipments
);

/**
 * @swagger
 * /api/equipments:
 *   post:
 *     summary: Create a new equipment
 *     tags: [Equipments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - brand
 *               - model
 *               - serialNumber
 *               - clientId
 *             properties:
 *               brand:
 *                 type: string
 *               model:
 *                 type: string
 *               serialNumber:
 *                 type: string
 *               clientId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Equipment created successfully
 *       400:
 *         description: Validation error
 */
router.post('/api/equipments',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    validate(equipmentValidation.createEquipmentSchema),
    equipmentController.createEquipment
);

/**
 * @swagger
 * /api/equipments/{id}:
 *   put:
 *     summary: Update an existing equipment
 *     tags: [Equipments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The equipment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               brand:
 *                 type: string
 *               model:
 *                 type: string
 *               serialNumber:
 *                 type: string
 *               clientId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Equipment updated successfully
 *       404:
 *         description: Equipment not found
 */
router.put('/api/equipments/:id',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    validate(equipmentValidation.updateEquipmentSchema),
    equipmentController.updateEquipment
);

/**
 * @swagger
 * /api/equipments/{id}:
 *   delete:
 *     summary: Delete an equipment (Admin only)
 *     tags: [Equipments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The equipment ID
 *     responses:
 *       204:
 *         description: Equipment deleted successfully
 *       404:
 *         description: Equipment not found
 */
router.delete('/api/equipments/:id', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), equipmentController.deleteEquipment);

/**
 * @swagger
 * /api/equipments/{id}/history:
 *   get:
 *     summary: Get equipment history (tickets, schedules, reports)
 *     tags: [Equipments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The equipment ID
 *     responses:
 *       200:
 *         description: Equipment history
 *       404:
 *         description: Equipment not found
 */
router.get('/api/equipments/:id/history',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN, UserRole.CLIENT]),
    validate(equipmentValidation.getEquipmentHistorySchema),
    equipmentController.getEquipmentHistory
);

export default router;
