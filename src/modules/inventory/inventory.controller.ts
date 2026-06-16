import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { BadRequestError } from '../../utils/ApiError';
import { InventoryService } from './inventory.service';
import { PartsOrderService } from './partsOrder.service';
import { PartsSaleService } from './partsSale.service';

export class InventoryController {
    constructor(
        private inventoryService: InventoryService, 
        private partsOrderService: PartsOrderService,
        private partsSaleService: PartsSaleService
    ) {}

    getInventory = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const page   = Math.max(1, Number(req.query.page) || 1);
        const limit  = Math.min(1000, Math.max(1, Number(req.query.limit) || 100));
        const search = (req.query.search as string | undefined)?.trim();
        const view   = (req.query.view as string | undefined)?.trim();
        const result = await this.inventoryService.getInventory(page, limit, search, view);
        res.json(result);
    });

    getPartReservations = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const reservations = await this.inventoryService.getPartReservations(+req.params.id);
        res.json(reservations);
    });

    deletePart = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        await this.inventoryService.deletePart(+req.params.id, req.user!.id);
        res.sendStatus(204);
    });

    getPartComponents = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const partId = +req.params.id;
        if (isNaN(partId)) throw new BadRequestError('ID da peça inválido');
        const result = await this.inventoryService.getPartComponents(partId);
        res.json(result);
    });

    getPartById = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const part = await this.inventoryService.getPartById(+req.params.id);
        res.json(part);
    });

    getPartByReference = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const part = await this.inventoryService.getPartByReference(req.params.reference);
        res.json(part);
    });

    updateComposedPart = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.inventoryService.updateComposedPart(+req.params.id, req.body, req.user!.id);
        res.json(result);
    });

    updateStock = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.inventoryService.updateStock(+req.params.id, req.body, req.user!.id);
        res.json(result);
    });

    updateOrder = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const { quantity, targetStock } = req.body;
        const result = await this.inventoryService.updateOrder(+req.params.id, quantity, targetStock, req.user!.id);
        res.json(result);
    });

    createPart = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.inventoryService.createPart(req.body, req.user!.id);
        res.status(201).json(result);
    });

    createComposedPart = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.inventoryService.createComposedPart(req.body, req.user!.id);
        res.status(201).json(result);
    });

    updatePart = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.inventoryService.updatePart(+req.params.id, req.body, req.user!.id);
        res.json(result);
    });

    syncPartStock = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.inventoryService.syncPartStock(+req.params.id, req.user!.id);
        res.json(result);
    });

    getInventoryAll = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.inventoryService.getInventoryAll();
        res.json(result);
    });

    uploadBatchImages = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const files = req.files as Express.Multer.File[];
        const result = await this.inventoryService.uploadBatchImages(files, req.user!.id);
        res.json(result);
    });

    importPrices = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.inventoryService.importPrices(req.body, req.user!.id);
        res.json(result);
    });

    registerDirectSale = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.inventoryService.registerDirectSale(req.body, req.user!.id);
        res.json(result);
    });

    getPartHistory = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.inventoryService.getPartHistory(+req.params.id);
        res.json(result);
    });

    getTransactions = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 100));
        const result = await this.inventoryService.getTransactions(page, limit);
        res.json(result);
    });

    // Orders
    getOrders = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.partsOrderService.getOrders(req.query);
        res.json(result);
    });

    getOrderById = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.partsOrderService.getOrderById(+req.params.id);
        res.json(result);
    });

    createOrder = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.partsOrderService.createOrder(req.body, req.user!.id);
        res.status(201).json(result);
    });

    receiveItems = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.partsOrderService.receiveItems(+req.params.id, req.body.items, req.user!.id);
        res.json(result);
    });

    addItemsToOrder = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.partsOrderService.addItemsToOrder(+req.params.id, req.body.items, req.user!.id);
        res.json(result);
    });

    deleteOrder = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        await this.partsOrderService.deleteOrder(+req.params.id, req.user!.id);
        res.status(204).send();
    });

    deleteOrderItem = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        await this.partsOrderService.deleteOrderItem(+req.params.id, +req.params.itemId, req.user!.id);
        res.status(204).send();
    });

    // Sales
    getSales = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.partsSaleService.getSales(req.query);
        res.json(result);
    });

    getSaleById = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.partsSaleService.getSaleById(+req.params.id);
        res.json(result);
    });

    createSale = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.partsSaleService.createSale(req.body, req.user!.id);
        res.status(201).json(result);
    });

    addItemsToSale = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.partsSaleService.addItemsToSale(+req.params.id, req.body.items, req.user!.id);
        res.json(result);
    });

    deleteSaleItem = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        await this.partsSaleService.deleteSaleItem(+req.params.id, +req.params.itemId, req.user!.id);
        res.status(204).send();
    });

    deleteSale = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        await this.partsSaleService.deleteSale(+req.params.id, req.user!.id);
        res.status(204).send();
    });
}

