import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { ClientService } from './client.service';

export class ClientController {
    constructor(private clientService: ClientService) {}

    getClients = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const clients = await this.clientService.getClients({
            search: req.query.search as string | undefined,
            is_blacklisted: req.query.is_blacklisted === 'true' ? true : req.query.is_blacklisted === 'false' ? false : undefined,
            equipment_category: req.query.equipment_category as string | undefined,
        });
        res.json(clients);
    });

    getClient = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const client = await this.clientService.getClientById(+req.params.id);
        res.json(client);
    });

    createClient = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const client = await this.clientService.createClient(req.body, req.user!.id);
        res.status(201).json(client);
    });

    updateClient = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const client = await this.clientService.updateClient(
            +req.params.id,
            req.body,
            req.user!.id
        );
        res.json(client);
    });

    deleteClient = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        await this.clientService.deleteClient(+req.params.id, req.user!.id);
        res.sendStatus(204);
    });

    getClientUsers = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const users = await this.clientService.getClientUsers(+req.params.id);
        res.json(users);
    });
}
