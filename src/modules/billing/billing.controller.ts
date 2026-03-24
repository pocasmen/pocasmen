import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { BillingService } from './billing.service';

export class BillingController {
    constructor(private billingService: BillingService) {}

    getBillingTasks = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const tasks = await this.billingService.getBillingTasks(
            req.query.startDate as string | undefined,
            req.query.endDate as string | undefined
        );
        res.json(tasks);
    });

    updateBillingTask = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const { status, billing_notes, invoice_number } = req.body;
        const task = await this.billingService.updateBillingTask(+req.params.id, status, billing_notes, invoice_number, req.user!.id);
        res.json(task);
    });

    deleteBillingTask = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        await this.billingService.deleteBillingTask(+req.params.id, req.user!.id);
        res.status(204).send();
    });

    getBillingStats = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const stats = await this.billingService.getBillingStats(
            req.query.startDate as string | undefined,
            req.query.endDate as string | undefined
        );
        res.json(stats);
    });
}
