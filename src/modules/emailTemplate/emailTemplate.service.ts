import { withTransactionAs } from '../../config/db';
import { SettingRepository } from '../setting/setting.repository';

const DEFAULT_TEMPLATES = {
    approval: {
        name: 'Aprovação Cliente',
        from: '',
        subject: 'Aprovação de Conta - Project1',
        body: '<h2>Bem-vindo ao Project1!</h2><p>A sua conta foi aprovada.</p><p><a href="{{login_url}}">Aceder à Plataforma</a></p>',
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
