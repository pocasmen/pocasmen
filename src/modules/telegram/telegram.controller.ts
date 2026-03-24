import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { TelegramService } from './telegram.service';

export class TelegramController {
    constructor(private service: TelegramService) {}

    getBotInfo = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const info = await this.service.getBotInfo();
        res.json(info);
    });

    setWebhook = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.service.setWebhook(req.body.url);
        res.json(result);
    });

    handleWebhook = catchAsync(async (req: Request, res: Response) => {
        // 1. Verificação de Origem: Secret Token
        const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (secretToken && req.headers['x-telegram-bot-api-secret-token'] !== secretToken) {
            return res.sendStatus(403);
        }

        // Responde imediatamente para o telegram não re-enviar
        res.sendStatus(200);

        try {
            await this.service.processTelegramUpdate(req.body);
        } catch (err) {
            // Error handling internal
        }
    });

    syncUpdates = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const result = await this.service.syncTelegramUpdates();
        res.json(result);
    });
}
