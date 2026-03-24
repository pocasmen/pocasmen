import { Router } from 'express';
import multer from 'multer';
import { authenticateToken, authorizeRoles } from '../../middlewares/auth.middleware';
import { UserRole } from '../../constants/enums';
import { InvoiceRepository } from './invoice.repository';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './invoice.controller';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

const repo = new InvoiceRepository();
const service = new InvoiceService(repo);
const controller = new InvoiceController(service);

const ADMIN_STAFF = [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OFFICE_STAFF];

router.post('/upload', authenticateToken, authorizeRoles(ADMIN_STAFF), upload.single('file'), controller.uploadInvoice);
router.get('/', authenticateToken, authorizeRoles(ADMIN_STAFF), controller.listInvoices);

export default router;
