import { pool, withTransactionAs } from '../../config/db';
import { NotFoundError } from '../../utils/ApiError';
import { ClientRepository } from './client.repository';
import { CreateClientDto, UpdateClientDto } from './client.dto';

export class ClientService {
    constructor(private repo: ClientRepository) {}

    async getClients(filters: { search?: string, is_blacklisted?: boolean }) {
        return this.repo.findAll(pool, filters);
    }

    async createClient(data: CreateClientDto, userId: string) {
        return withTransactionAs(userId, (db) => this.repo.create(data, db));
    }

    async updateClient(id: number, data: UpdateClientDto, userId: string) {
        return withTransactionAs(userId, async (db) => {
            const updated = await this.repo.update(id, data, db);
            if (!updated) throw new NotFoundError('Cliente não encontrado.');
            return updated;
        });
    }

    async deleteClient(id: number, userId: string) {
        return withTransactionAs(userId, async (db) => {
            const deleted = await this.repo.delete(id, db);
            if (!deleted) throw new NotFoundError('Cliente não encontrado.');
        });
    }

    async getClientUsers(clientId: number) {
        return this.repo.findUsersByClientId(clientId, pool);
    }
}
