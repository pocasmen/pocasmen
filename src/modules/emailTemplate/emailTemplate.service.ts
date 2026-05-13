import { withTransactionAs } from '../../config/db';
import { SettingRepository } from '../setting/setting.repository';


export class EmailTemplateService {
    constructor(private settingRepo: SettingRepository) {}

    async getTemplates() {
        const value = await this.settingRepo.findByKey('email_templates');
        if (!value) return {};

        try {
            return typeof value === 'string' ? JSON.parse(value) : value;
        } catch {
            return {};
        }
    }

    async updateTemplates(templates: unknown, userId: string) {
        const value = typeof templates === 'string' ? templates : JSON.stringify(templates);
        await withTransactionAs(userId, (db) => this.settingRepo.upsert('email_templates', value, db));
        return { success: true };
    }
}
