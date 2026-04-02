import { withTransactionAs } from '../../config/db';
import { SettingRepository } from '../setting/setting.repository';

const DEFAULT_TEMPLATES = {
    approval: {
        name: 'Aprovação Cliente',
        from: '',
        subject: '',
        body: '',
    },
    approval_pending_password: {
        name: 'Aprovação Cliente (Senha Pendente)',
        from: '',
        subject: '',
        body: '',
    },
};

export class EmailTemplateService {
    constructor(private settingRepo: SettingRepository) {}

    async getTemplates() {
        const value = await this.settingRepo.findByKey('email_templates');
        if (!value) return DEFAULT_TEMPLATES;

        try {
            const parsed = typeof value === 'string' ? JSON.parse(value) : value;
            return { ...DEFAULT_TEMPLATES, ...parsed };
        } catch {
            return DEFAULT_TEMPLATES;
        }
    }

    async updateTemplates(templates: unknown, userId: string) {
        const value = typeof templates === 'string' ? templates : JSON.stringify(templates);
        await withTransactionAs(userId, (db) => this.settingRepo.upsert('email_templates', value, db));
        return { success: true };
    }
}
