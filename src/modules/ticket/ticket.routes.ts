import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import * as ticketValidation from '../../validations/ticket.validation';
import { UserRole } from '../../constants/enums';
import multer from 'multer';
import { TicketRepository } from './ticket.repository';
import { TicketService } from './ticket.service';
import { TicketController } from './ticket.controller';
import { TicketAttachmentRepository } from './ticketAttachment.repository';
import { TicketAttachmentService } from './ticketAttachment.service';
import { TicketAttachmentController } from './ticketAttachment.controller';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

const repo = new TicketRepository();
const service = new TicketService(repo);
const controller = new TicketController(service);

const attRepo = new TicketAttachmentRepository();
const attService = new TicketAttachmentService(attRepo);
const attController = new TicketAttachmentController(attService);

const ALL_ROLES = [UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN, UserRole.CLIENT];
const STAFF    = [UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN];

/**
 * @swagger
 * tags:
 *   name: Tickets
 *   description: Management of tickets
 */

router.get('/', authenticateToken, authorizeRoles(STAFF), controller.getTickets);
router.get('/:id', authenticateToken, authorizeRoles(ALL_ROLES), validate(ticketValidation.ticketIdSchema), controller.getTicketById);
router.post('/', authenticateToken, authorizeRoles(ALL_ROLES), validate(ticketValidation.createTicketSchema), controller.createTicket);
router.post('/:id/responses', authenticateToken, authorizeRoles(ALL_ROLES), validate(ticketValidation.replyToTicketSchema), controller.replyToTicket);
router.delete('/:id', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), validate(ticketValidation.ticketIdSchema), controller.deleteTicket);
router.put('/:id/mark-as-read', authenticateToken, authorizeRoles(STAFF), controller.markTicketAsRead);

// Ticket Attachments
router.get('/:id/attachments', authenticateToken, authorizeRoles(ALL_ROLES), attController.getAttachments);
router.post('/:id/attachments', authenticateToken, authorizeRoles(ALL_ROLES), upload.single('file'), attController.uploadAttachment);
router.delete('/:id/attachments/:attachmentId', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), attController.deleteAttachment);
router.delete('/attachments/:attachmentId', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]), attController.deleteAttachment);

export default router;

// Named export for clientPortal compatibility
export const ticketRepository = repo;
