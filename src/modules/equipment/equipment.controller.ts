import { Response } from 'express';
import { pool } from '../../config/db';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { ForbiddenError, ApiError } from '../../utils/ApiError';
import { UserRole } from '../../constants/enums';
import { EquipmentService } from './equipment.service';

export class EquipmentController {
    constructor(private equipmentService: EquipmentService) {}

    getEquipments = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const equipments = await this.equipmentService.getEquipments({
            search: req.query.search as string | undefined,
        });
        res.json(equipments);
    });

    getClientEquipments = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const equipments = await this.equipmentService.getClientEquipments(+req.params.id);
        res.json(equipments);
    });

    createEquipment = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const equipment = await this.equipmentService.createEquipment(req.body, req.user!.id);
        res.status(201).json(equipment);
    });

    updateEquipment = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const equipment = await this.equipmentService.updateEquipment(+req.params.id, req.body, req.user!.id);
        res.json(equipment);
    });

    deleteEquipment = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        await this.equipmentService.deleteEquipment(+req.params.id, req.user!.id);
        res.sendStatus(204);
    });

    getEquipmentHistory = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const equipmentId = +req.params.id;
        if (!req.user) throw new ApiError(401, 'Unauthorized');

        // Se for um utilizador do portal do cliente, extraímos o client_id associado a ele
        let requestingClientId: number | undefined;
        if (req.user.user_metadata?.role === UserRole.CLIENT) {
            const { rows } = await pool.query('SELECT client_id FROM profiles WHERE id = $1', [req.user.id]);
            if (rows.length === 0 || !rows[0].client_id) {
                throw new ForbiddenError('Perfil de cliente não configurado corretamente.');
            }
            requestingClientId = rows[0].client_id;
        }

        const result = await this.equipmentService.getEquipmentHistory(equipmentId, requestingClientId);
        res.json(result);
    });

    getOwnershipHistory = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.equipmentService.getOwnershipHistory(+req.params.id);
        res.json(result);
    });

    transferEquipment = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.equipmentService.transferEquipment(+req.params.id, req.body, req.user!.id);
        res.json(result);
    });

    updateOwnershipPeriod = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        await this.equipmentService.updateOwnershipPeriod(+req.params.periodId, req.body, req.user!.id);
        res.sendStatus(204);
    });
}
