import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import * as technicianValidation from '../../validations/technician.validation';
import { UserRole } from '../../constants/enums';
import { ProfileRepository } from './profile.repository';
import { TechnicianService } from './technician.service';
import { TechnicianController } from './technician.controller';

const router = Router();
const profileRepo = new ProfileRepository();
const service = new TechnicianService(profileRepo);
const controller = new TechnicianController(service);

/**
 * @swagger
 * tags:
 *   name: Technicians
 *   description: Management of technicians and user profiles
 */

const STAFF = [UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN];

router.get('/', authenticateToken, authorizeRoles(STAFF), controller.getTechnicians);
router.get('/me', authenticateToken, controller.getMe);
router.put('/:id',
    authenticateToken,
    authorizeRoles([...STAFF, UserRole.CLIENT]),
    validate(technicianValidation.updateTechnicianSchema),
    controller.updateTechnician
);
router.delete('/:id', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), controller.deleteTechnician);

export default router;

// Named export for external use (e.g. clientPortal)
export const technicianController = controller;
