import { Router } from 'express';
import * as inventoryController from '../controllers/inventory.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import * as inventoryValidation from '../validations/inventory.validation';
import * as commonValidation from '../validations/common.validation';
import { UserRole } from '../constants/enums';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Inventory
 *   description: Management of inventory and parts
 */

/**
 * @swagger
 * /api/inventory:
 *   get:
 *     summary: Retrieve a list of inventory parts
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of parts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   reference:
 *                     type: string
 *                   designation:
 *                     type: string
 *                   stock_quantity:
 *                     type: integer
 *                   reserved_quantity:
 *                     type: integer
 *                   ordered_quantity:
 *                     type: integer
 */
router.get('/api/inventory', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]), inventoryController.getInventory);

/**
 * @swagger
 * /api/inventory/{id}/composed:
 *   put:
 *     summary: Update a composed part (Admin only)
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The part ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reference
 *               - designation
 *               - components
 *             properties:
 *               reference:
 *                 type: string
 *               designation:
 *                 type: string
 *               components:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     partId:
 *                       type: integer
 *                     quantity:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Composed part updated successfully
 *       404:
 *         description: Part not found
 */
router.put('/api/inventory/:id/composed',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
    validate(inventoryValidation.updateComposedPartSchema),
    inventoryController.updateComposedPart
);

/**
 * @swagger
 * /api/inventory/{id}/stock:
 *   put:
 *     summary: Update stock quantity
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The part ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quantity
 *             properties:
 *               quantity:
 *                 type: integer
 *               fromOrder:
 *                 type: boolean
 *               targetStock:
 *                 type: string
 *                 enum: [general, contract, client, warranty]
 *     responses:
 *       200:
 *         description: Stock updated successfully
 *       404:
 *         description: Part not found
 */
router.put('/api/inventory/:id/stock',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    validate(inventoryValidation.updateStockSchema),
    inventoryController.updateStock
);

/**
 * @swagger
 * /api/inventory/{id}/order:
 *   put:
 *     summary: Update ordered quantity
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The part ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quantity
 *             properties:
 *               quantity:
 *                 type: integer
 *               targetStock:
 *                 type: string
 *                 enum: [general, contract, client, warranty]
 *     responses:
 *       200:
 *         description: Ordered quantity updated successfully
 *       404:
 *         description: Part not found
 */
router.put('/api/inventory/:id/order',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    validate(inventoryValidation.updateOrderSchema),
    inventoryController.updateOrder
);

/**
 * @swagger
 * /api/inventory/{id}/reservations:
 *   get:
 *     summary: Get part reservations
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The part ID
 *     responses:
 *       200:
 *         description: List of reservations (schedules and reports)
 *       404:
 *         description: Part not found
 */
router.get('/api/inventory/:id/reservations',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    validate(commonValidation.idParamSchema),
    inventoryController.getPartReservations
);

/**
 * @swagger
 * /api/inventory/{id}:
 *   delete:
 *     summary: Delete a part (Admin only)
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The part ID
 *     responses:
 *       204:
 *         description: Part deleted successfully
 *       404:
 *         description: Part not found
 */
router.delete('/api/inventory/:id',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
    validate(commonValidation.idParamSchema),
    inventoryController.deletePart
);

/**
 * @swagger
 * /api/parts/{reference}:
 *   get:
 *     summary: Get part by reference
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *         description: The part reference
 *     responses:
 *       200:
 *         description: Part details
 *       404:
 *         description: Part not found
 */
router.get('/api/parts/:reference', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]), inventoryController.getPartByReference);

export default router;
