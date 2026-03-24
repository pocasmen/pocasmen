import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import * as inventoryValidation from '../../validations/inventory.validation';
import * as commonValidation from '../../validations/common.validation';
import { UserRole } from '../../constants/enums';
import multer from 'multer';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

const repo = new InventoryRepository();
const service = new InventoryService(repo);
const controller = new InventoryController(service);

const STAFF = [UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN];

/**
 * @swagger
 * tags:
 *   name: Inventory
 *   description: Management of inventory and parts
 */

router.get('/all-export', authenticateToken, authorizeRoles([UserRole.SUPER_ADMIN]), controller.getInventoryAll);
router.get('/', authenticateToken, authorizeRoles(STAFF), controller.getInventory);
router.post('/import-prices', authenticateToken, authorizeRoles([UserRole.SUPER_ADMIN]), controller.importPrices);
router.post('/', authenticateToken, authorizeRoles(STAFF), validate(inventoryValidation.createPartSchema), controller.createPart);
router.post('/composed', authenticateToken, authorizeRoles(STAFF), validate(inventoryValidation.createComposedPartSchema), controller.createComposedPart);
router.get('/parts/:reference', authenticateToken, authorizeRoles(STAFF), controller.getPartByReference);

router.post('/batch-images', authenticateToken, authorizeRoles(STAFF), upload.array('files', 500), controller.uploadBatchImages);

router.put('/:id/composed', authenticateToken, authorizeRoles(STAFF), validate(inventoryValidation.updateComposedPartSchema), controller.updateComposedPart);
router.put('/:id/stock', authenticateToken, authorizeRoles(STAFF), validate(inventoryValidation.updateStockSchema), controller.updateStock);
router.put('/:id/order', authenticateToken, authorizeRoles(STAFF), validate(inventoryValidation.updateOrderSchema), controller.updateOrder);
router.put('/:id', authenticateToken, authorizeRoles(STAFF), validate(inventoryValidation.updatePartSchema), controller.updatePart);
router.delete('/:id', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.SUPER_ADMIN]), validate(commonValidation.idParamSchema), controller.deletePart);
router.get('/:id/reservations', authenticateToken, authorizeRoles(STAFF), validate(commonValidation.idParamSchema), controller.getPartReservations);
router.get('/:id/components', authenticateToken, authorizeRoles(STAFF), validate(commonValidation.idParamSchema), controller.getPartComponents);
router.post('/:id/sync', authenticateToken, authorizeRoles(STAFF), validate(commonValidation.idParamSchema), controller.syncPartStock);

export default router;
