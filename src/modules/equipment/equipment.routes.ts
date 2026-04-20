import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import * as equipmentValidation from '../../validations/equipment.validation';
import { UserRole } from '../../constants/enums';
import { EquipmentRepository } from './equipment.repository';
import { EquipmentService } from './equipment.service';
import { EquipmentController } from './equipment.controller';

const router = Router();

const repo = new EquipmentRepository();
const service = new EquipmentService(repo);
const controller = new EquipmentController(service);

const STAFF = [UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN];

/**
 * @swagger
 * tags:
 *   name: Equipments
 *   description: Management of equipments
 */

router.get('/', authenticateToken, authorizeRoles(STAFF), controller.getEquipments);

router.post('/',
    authenticateToken,
    authorizeRoles(STAFF),
    validate(equipmentValidation.createEquipmentSchema),
    controller.createEquipment
);

router.put('/:id',
    authenticateToken,
    authorizeRoles(STAFF),
    validate(equipmentValidation.updateEquipmentSchema),
    controller.updateEquipment
);

router.delete('/:id', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), controller.deleteEquipment);

router.get('/:id/history',
    authenticateToken,
    authorizeRoles([...STAFF, UserRole.CLIENT]),
    controller.getEquipmentHistory
);

router.get('/:id/ownership', authenticateToken, authorizeRoles(STAFF), controller.getOwnershipHistory);
router.post('/:id/transfer', authenticateToken, authorizeRoles(STAFF), controller.transferEquipment);
router.put('/ownership/:periodId', authenticateToken, authorizeRoles(STAFF), controller.updateOwnershipPeriod);

export default router;

// Named export for use in client.routes.ts (/:id/equipments cross-module route)
export const equipmentController = controller;
