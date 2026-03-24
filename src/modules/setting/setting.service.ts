import { pool, withTransactionAs } from '../../config/db';
import { SettingRepository } from './setting.repository';

export class SettingService {
    constructor(private repo: SettingRepository) {}

    async getSettings() {
        return this.repo.findAll(pool);
    }

    async updateSettings(body: Record<string, unknown>, userId: string) {
        return withTransactionAs(userId, async (db) => {
            for (const [key, value] of Object.entries(body)) {
                await this.repo.upsert(key, String(value), db);
            }
            return this.repo.findAll(db);
        });
    }
}
