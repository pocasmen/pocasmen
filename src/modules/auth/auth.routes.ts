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
import { AuthAuditRepository } from './auth-audit.repository';

const router = Router();

const clientRepo = new ClientRepository();
const auditRepo = new AuthAuditRepository();
const authService = new AuthService(clientRepo, auditRepo);
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

router.post('/admin/resend-invite/:userId',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OFFICE_STAFF]),
    controller.resendInvite
);

router.get('/admin/audit-logs',
    authenticateToken,
    authorizeRoles([UserRole.SUPER_ADMIN]),
    controller.getAuditLogs
);

router.get('/users', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OFFICE_STAFF]), technicianController.getExternalUsers);

export default router;
