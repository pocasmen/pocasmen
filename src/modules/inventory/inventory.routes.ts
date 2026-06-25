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
import { PartsOrderRepository } from './partsOrder.repository';
import { PartsOrderService } from './partsOrder.service';
import { PartsSaleRepository } from './partsSale.repository';
import { PartsSaleService } from './partsSale.service';

import { PartsTransactionRepository } from './partsTransaction.repository';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

const repo = new InventoryRepository();
const transRepo = new PartsTransactionRepository();
const orderRepo = new PartsOrderRepository();
const saleRepo = new PartsSaleRepository();

const service = new InventoryService(repo, transRepo);
const orderService = new PartsOrderService(orderRepo);
const saleService = new PartsSaleService(saleRepo);

const controller = new InventoryController(service, orderService, saleService);

const STAFF = [UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN];

/**
 * @swagger
 * tags:
 *   name: Inventory
 *   description: Management of inventory and parts
 */

router.get('/all-export', authenticateToken, authorizeRoles([UserRole.SUPER_ADMIN]), controller.getInventoryAll);
router.get('/transactions', authenticateToken, authorizeRoles(STAFF), controller.getTransactions);
router.get('/', authenticateToken, authorizeRoles(STAFF), controller.getInventory);
router.post('/import-prices', authenticateToken, authorizeRoles([UserRole.SUPER_ADMIN]), controller.importPrices);
router.post('/', authenticateToken, authorizeRoles(STAFF), validate(inventoryValidation.createPartSchema), controller.createPart);
router.post('/composed', authenticateToken, authorizeRoles(STAFF), validate(inventoryValidation.createComposedPartSchema), controller.createComposedPart);
router.get('/parts/:reference', authenticateToken, authorizeRoles(STAFF), controller.getPartByReference);

router.post('/batch-images', authenticateToken, authorizeRoles(STAFF), upload.array('files', 500), controller.uploadBatchImages);

// Encomendas
router.get('/orders', authenticateToken, authorizeRoles(STAFF), controller.getOrders);
router.get('/orders/:id', authenticateToken, authorizeRoles(STAFF), validate(commonValidation.idParamSchema), controller.getOrderById);
router.post('/orders', authenticateToken, authorizeRoles(STAFF), controller.createOrder);
router.post('/orders/:id/receive', authenticateToken, authorizeRoles(STAFF), validate(commonValidation.idParamSchema), controller.receiveItems);
router.post('/orders/:id/revert', authenticateToken, authorizeRoles(STAFF), validate(commonValidation.idParamSchema), controller.revertReception);
router.post('/orders/:id/items', authenticateToken, authorizeRoles(STAFF), validate(commonValidation.idParamSchema), controller.addItemsToOrder);
router.delete('/orders/:id', authenticateToken, authorizeRoles(STAFF), validate(commonValidation.idParamSchema), controller.deleteOrder);
router.delete('/orders/:id/items/:itemId', authenticateToken, authorizeRoles(STAFF), controller.deleteOrderItem);

// Vendas
router.get('/sales', authenticateToken, authorizeRoles(STAFF), controller.getSales);
router.get('/sales/:id', authenticateToken, authorizeRoles(STAFF), validate(commonValidation.idParamSchema), controller.getSaleById);
router.post('/sales', authenticateToken, authorizeRoles(STAFF), controller.createSale);
router.post('/sales/:id/items', authenticateToken, authorizeRoles(STAFF), validate(commonValidation.idParamSchema), controller.addItemsToSale);
router.delete('/sales/:id/items/:itemId', authenticateToken, authorizeRoles(STAFF), controller.deleteSaleItem);
router.delete('/sales/:id', authenticateToken, authorizeRoles(STAFF), validate(commonValidation.idParamSchema), controller.deleteSale);

// Generic ID routes (Place after all static paths like /orders to avoid conflict)
router.get('/:id', authenticateToken, authorizeRoles(STAFF), validate(commonValidation.idParamSchema), controller.getPartById);
router.get('/:id/reservations', authenticateToken, authorizeRoles(STAFF), validate(commonValidation.idParamSchema), controller.getPartReservations);
router.get('/:id/components', authenticateToken, authorizeRoles(STAFF), validate(commonValidation.idParamSchema), controller.getPartComponents);
router.get('/:id/history', authenticateToken, authorizeRoles(STAFF), validate(commonValidation.idParamSchema), controller.getPartHistory);

router.put('/:id/composed', authenticateToken, authorizeRoles(STAFF), validate(inventoryValidation.updateComposedPartSchema), controller.updateComposedPart);
router.put('/:id/stock', authenticateToken, authorizeRoles(STAFF), validate(inventoryValidation.updateStockSchema), controller.updateStock);
router.put('/:id/order', authenticateToken, authorizeRoles(STAFF), validate(inventoryValidation.updateOrderSchema), controller.updateOrder);
router.put('/:id', authenticateToken, authorizeRoles(STAFF), validate(inventoryValidation.updatePartSchema), controller.updatePart);

router.delete('/:id', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.SUPER_ADMIN]), validate(commonValidation.idParamSchema), controller.deletePart);

router.post('/:id/sync', authenticateToken, authorizeRoles(STAFF), validate(commonValidation.idParamSchema), controller.syncPartStock);
router.post('/direct-sale', authenticateToken, authorizeRoles(STAFF), validate(inventoryValidation.directSaleSchema), controller.registerDirectSale);

export default router;
