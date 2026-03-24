import { pool, withTransactionAs } from '../../config/db';
import { BadRequestError, NotFoundError } from '../../utils/ApiError';
import { EquipmentRepository } from './equipment.repository';
import { CreateEquipmentDto, UpdateEquipmentDto } from './equipment.dto';

export class EquipmentService {
    constructor(private repo: EquipmentRepository) {}

    async getEquipments(filters: { search?: string }) {
        return this.repo.findAll(pool, filters);
    }

    async getClientEquipments(clientId: number) {
        return this.repo.findByClientId(clientId, pool);
    }

    async createEquipment(data: CreateEquipmentDto, userId: string) {
        return withTransactionAs(userId, async (db) => {
            if (data.serialNumber) {
                const existing = await this.repo.findBySerialNumber(data.serialNumber, undefined, db);
                if (existing) throw new BadRequestError('Já existe um equipamento com este número de série.');
            }
            const created = await this.repo.create(data, db);
            return this.repo.findById(created.id, db);
        });
    }

    async updateEquipment(id: number, data: UpdateEquipmentDto, userId: string) {
        return withTransactionAs(userId, async (db) => {
            if (data.serialNumber) {
                const existing = await this.repo.findBySerialNumber(data.serialNumber, id, db);
                if (existing) throw new BadRequestError('Já existe um equipamento com este número de série.');
            }
            const updated = await this.repo.update(id, data, db);
            if (!updated) throw new NotFoundError('Equipamento não encontrado.');
            return this.repo.findById(updated.id, db);
        });
    }

    async deleteEquipment(id: number, userId: string) {
        return withTransactionAs(userId, async (db) => {
            const deleted = await this.repo.delete(id, db);
            if (!deleted) throw new NotFoundError('Equipamento não encontrado.');
        });
    }

    async getEquipmentHistory(equipmentId: number) {
        const equipment = await this.repo.findById(equipmentId, pool);
        if (!equipment) throw new NotFoundError('Equipamento não encontrado.');
        const history = await this.repo.getHistory(equipmentId, pool);
        return { details: equipment, ...history };
    }
}
