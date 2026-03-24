import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middlewares/auth.middleware';
import { UserRole } from '../../constants/enums';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';

const router = Router();

const repo = new BillingRepository();
const service = new BillingService(repo);
const controller = new BillingController(service);

router.use(authenticateToken);

const BILLING_VIEWERS = [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OFFICE_STAFF, UserRole.TECHNICIAN];

router.get('/tasks',    authorizeRoles(BILLING_VIEWERS), controller.getBillingTasks);
router.get('/stats',    authorizeRoles(BILLING_VIEWERS), controller.getBillingStats);
router.patch('/tasks/:id', authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OFFICE_STAFF]), controller.updateBillingTask);
router.delete('/tasks/:id', authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), controller.deleteBillingTask);

export default router;
