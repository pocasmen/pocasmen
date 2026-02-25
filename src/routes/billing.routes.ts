//Horas de desenvolvimento activo=1,5
import { Router } from 'express';
import * as billingController from '../controllers/billing.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { UserRole } from '../constants/enums';

const router = Router();

router.use(authenticateToken);

// Permitir que técnicos também vejam as tarefas e estatisticas de faturação
router.get('/api/billing/tasks', authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OFFICE_STAFF, UserRole.TECHNICIAN]), billingController.getBillingTasks);
router.get('/api/billing/stats', authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OFFICE_STAFF, UserRole.TECHNICIAN]), billingController.getBillingStats);

// Apenas office_staff e admin podem alterar etapas de faturação
router.patch('/api/billing/tasks/:id', authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OFFICE_STAFF]), billingController.updateBillingTask);

// Apenas admins podem eliminar tarefas de faturação
router.delete(
    '/api/billing/tasks/:id',
    authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
    billingController.deleteBillingTask
);

export default router;
