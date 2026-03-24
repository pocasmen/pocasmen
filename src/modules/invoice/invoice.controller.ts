import { Response } from 'express';
import { InvoiceService } from './invoice.service';
import { ApiError } from '../../utils/ApiError';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';

export class InvoiceController {
  constructor(private service: InvoiceService) {}

  uploadInvoice = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) throw new ApiError(400, 'Nenhum ficheiro PDF enviado.');
    if (!req.user) throw new ApiError(401, 'Utilizador não autenticado.');

    const result = await this.service.uploadAndParseInvoice(req.file, req.user.id);
    res.json(result);
  });

  listInvoices = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const invoices = await this.service.list();
    res.json(invoices);
  });
}
