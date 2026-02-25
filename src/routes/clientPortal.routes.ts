//Horas de desenvolvimento activo=2,5
import { Router } from 'express';
import * as clientPortalController from '../controllers/clientPortal.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import * as clientPortalValidation from '../validations/clientPortal.validation';
import { UserRole } from '../constants/enums';

const router = Router();

router.get('/api/my-companies', authenticateToken, authorizeRoles([UserRole.CLIENT]), clientPortalController.getMyCompanies);
router.get('/api/my-stats', authenticateToken, authorizeRoles([UserRole.CLIENT]), clientPortalController.getMyStats);
router.get('/api/my-equipments', authenticateToken, authorizeRoles([UserRole.CLIENT]), clientPortalController.getMyEquipments);
router.get('/api/my-tickets', authenticateToken, authorizeRoles([UserRole.CLIENT]), clientPortalController.getMyTickets);
router.get('/api/my-schedules', authenticateToken, authorizeRoles([UserRole.CLIENT]), clientPortalController.getMySchedules);

router.post('/api/my-tickets',
    authenticateToken,
    authorizeRoles([UserRole.CLIENT]),
    validate(clientPortalValidation.createMyTicketSchema),
    clientPortalController.createMyTicket
);

router.get('/api/my-report/by-schedule/:id',
    authenticateToken,
    authorizeRoles([UserRole.CLIENT]),
    validate(clientPortalValidation.getMyReportByScheduleSchema),
    clientPortalController.getMyReportBySchedule
);

router.get('/api/my-tickets/:id',
    authenticateToken,
    authorizeRoles([UserRole.CLIENT]),
    validate(clientPortalValidation.getMyTicketByIdSchema),
    clientPortalController.getMyTicketById
);

router.post('/api/my-tickets/:id/reply',
    authenticateToken,
    authorizeRoles([UserRole.CLIENT]),
    validate(clientPortalValidation.replyToMyTicketSchema),
    clientPortalController.replyToMyTicket
);

router.put(['/api/tickets/:id/mark-as-read', '/api/my-tickets/:id/mark-as-read'],
    authenticateToken,
    clientPortalController.markTicketAsRead
);

export default router;
