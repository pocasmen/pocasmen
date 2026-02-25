//Horas de desenvolvimento activo=1,5
import { Router } from 'express';
import * as billingController from '../controllers/billing.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { UserRole } from '../constants/enums';

const router = Router();

router.use(authenticateToken);

// Apenas office_staff e admin podem aceder ao sistema de faturação
router.use(authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OFFICE_STAFF]));

router.get('/api/billing/tasks', billingController.getBillingTasks);
router.get('/api/billing/stats', billingController.getBillingStats);
router.patch('/api/billing/tasks/:id', billingController.updateBillingTask);

// Apenas admins podem eliminar tarefas de faturação
router.delete(
    '/api/billing/tasks/:id',
    authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
    billingController.deleteBillingTask
);

export default router;
