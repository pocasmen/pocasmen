import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { BadRequestError } from '../../utils/ApiError';
import { InventoryService } from './inventory.service';

export class InventoryController {
    constructor(private inventoryService: InventoryService) {}

    getInventory = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const page   = Math.max(1, Number(req.query.page) || 1);
        const limit  = Math.min(1000, Math.max(1, Number(req.query.limit) || 100));
        const search = req.query.search as string | undefined;
        const view   = req.query.view as string | undefined;
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
}
