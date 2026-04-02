import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import * as authValidation from '../../validations/auth.validation';
import { UserRole } from '../../constants/enums';
import { authLimiter, registrationLimiter } from '../../middlewares/rateLimiter.middleware';
import { technicianController } from '../technician/technician.routes';
import { ClientRepository } from '../client/client.repository';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

const router = Router();

const clientRepo = new ClientRepository();
const authService = new AuthService(clientRepo);
const controller = new AuthController(authService);

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and user management
 */

router.post('/login', authLimiter, validate(authValidation.loginSchema), controller.login);

router.post('/self-register', registrationLimiter, validate(authValidation.selfRegisterSchema), controller.selfRegister);

router.post('/admin/invite-user',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OFFICE_STAFF, UserRole.TECHNICIAN]),
    validate(authValidation.inviteUserSchema),
    controller.inviteUser
);

router.get('/admin/pending-users',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
    controller.getPendingUsers
);

router.post('/admin/approve-user',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
    validate(authValidation.approveUserSchema),
    controller.approveUser
);

router.get('/admin/impersonate/:id',
    authenticateToken,
    authorizeRoles([UserRole.SUPER_ADMIN]),
    controller.getImpersonatedUser
);

router.get('/users', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OFFICE_STAFF]), technicianController.getExternalUsers);

export default router;
