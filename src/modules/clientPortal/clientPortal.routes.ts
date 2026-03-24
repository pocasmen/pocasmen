import { Router } from 'express';
import { pool } from '../../config/db';
import { authenticateToken, authorizeRoles } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import * as clientPortalValidation from '../../validations/clientPortal.validation';
import { UserRole } from '../../constants/enums';
import { ClientRepository } from '../client/client.repository';
import { TicketRepository } from '../ticket/ticket.repository';
import { ScheduleRepository } from '../schedule/schedule.repository';
import { ReportRepository } from '../report/report.repository';
import { EquipmentRepository } from '../equipment/equipment.repository';
import { ClientPortalService } from './clientPortal.service';
import { ClientPortalController } from './clientPortal.controller';

const router = Router();

const clientRepo = new ClientRepository();
const ticketRepo = new TicketRepository();
const scheduleRepo = new ScheduleRepository(pool);
const reportRepo = new ReportRepository();
const equipmentRepo = new EquipmentRepository();

const service = new ClientPortalService(clientRepo, ticketRepo, scheduleRepo, reportRepo, equipmentRepo);
const controller = new ClientPortalController(service);

router.get('/my-companies', authenticateToken, authorizeRoles([UserRole.CLIENT]), controller.getMyCompanies);
router.get('/my-stats', authenticateToken, authorizeRoles([UserRole.CLIENT]), controller.getMyStats);
router.get('/my-equipments', authenticateToken, authorizeRoles([UserRole.CLIENT]), controller.getMyEquipments);
router.get('/my-tickets', authenticateToken, authorizeRoles([UserRole.CLIENT]), controller.getMyTickets);
router.get('/my-schedules', authenticateToken, authorizeRoles([UserRole.CLIENT]), controller.getMySchedules);

router.post('/my-tickets',
    authenticateToken,
    authorizeRoles([UserRole.CLIENT]),
    validate(clientPortalValidation.createMyTicketSchema),
    controller.createMyTicket
);

router.get('/my-report/by-schedule/:id',
    authenticateToken,
    authorizeRoles([UserRole.CLIENT]),
    validate(clientPortalValidation.getMyReportByScheduleSchema),
    controller.getMyReportBySchedule
);

router.get('/my-tickets/:id',
    authenticateToken,
    authorizeRoles([UserRole.CLIENT]),
    validate(clientPortalValidation.getMyTicketByIdSchema),
    controller.getMyTicketById
);

router.post('/my-tickets/:id/reply',
    authenticateToken,
    authorizeRoles([UserRole.CLIENT]),
    validate(clientPortalValidation.replyToMyTicketSchema),
    controller.replyToMyTicket
);

router.put('/my-tickets/:id/mark-as-read',
    authenticateToken,
    controller.markTicketAsRead
);

router.post('/my-report/:id/sign',
    authenticateToken,
    authorizeRoles([UserRole.CLIENT]),
    controller.signMyReport
);

export default router;
