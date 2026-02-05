import { SupabaseClient } from '@supabase/supabase-js';
import { sendTelegramNotification } from './telegramService';
import { Client, Equipment, Profile } from '../types';
import { logger } from '../utils/logger';

export const SERVICE_TYPE_MAP: Record<string, string> = {
    'manutencao': 'Manutenção',
    'reparacao': 'Reparação',
    'assistencia': 'Assistência',
    'remota': 'Remota',
    'instalacao': 'Instalação',
    'calibracao': 'Calibração'
};

/**
 * Generates a standardized title for a schedule: "{ServiceType} - {Equipment} - {Client}"
 */
export async function generateScheduleTitle(supabase: SupabaseClient, clientId: number, equipmentId: number, serviceType: string | string[]): Promise<string> {
    try {
        const [clientRes, equipRes] = await Promise.all([
            supabase.from('clients').select('name').eq('id', clientId).single(),
            supabase.from('equipments').select('model').eq('id', equipmentId).single()
        ]);

        const clientName = clientRes.data?.name || 'Cliente';
        const equipModel = equipRes.data?.model || 'Equipamento';

        // Resolve Service Type Label
        let sTypeStr = Array.isArray(serviceType) ? serviceType[0] : serviceType;
        if (!sTypeStr) sTypeStr = 'Serviço';
        const serviceLabel = SERVICE_TYPE_MAP[sTypeStr] || sTypeStr.charAt(0).toUpperCase() + sTypeStr.slice(1);

        return `${serviceLabel} - ${equipModel} - ${clientName}`;
    } catch (err) {
        logger.error(err, 'Error generating schedule title');
        return 'Agendamento';
    }
}

/**
 * Checks if Google Calendar Sync is enabled in settings
 */
export async function isGoogleSyncEnabled(supabase: SupabaseClient): Promise<boolean> {
    try {
        const { data, error } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'google_calendar_sync_enabled')
            .single();

        if (error || !data) return false;
        return data.value === 'true';
    } catch (err) {
        logger.error(err, '[SYNC] Error checking sync setting');
        return false;
    }
}

/**
 * Sends a Telegram notification to assigned technicians and admins about a new or updated schedule
 */
export async function sendScheduleNotificationToTechnicians(supabase: SupabaseClient, scheduleId: number, technicianIds: string[], isUpdate: boolean = false) {
    try {
        const { data: schedule, error: sError } = await supabase
            .from('schedules')
            .select('title, startDate, endDate, serviceType, additionalInfo, clientId, equipmentId, clients(name), equipments(brand, model, serialNumber)')
            .eq('id', scheduleId)
            .single();

        if (sError || !schedule) {
            logger.error(sError, 'Error fetching schedule for notification');
            return;
        }

        const { data: scheduleParts, error: partsError } = await supabase
            .from('schedule_parts')
            .select('quantity, parts(reference, designation)')
            .eq('scheduleId', scheduleId);

        const clientData = schedule.clients as unknown as Client | Client[];
        const clientName = Array.isArray(clientData) ? clientData[0]?.name : clientData?.name || 'Cliente Desconhecido';

        const startDate = new Date(schedule.startDate).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
        const endDate = new Date(schedule.endDate).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });

        // Service Type formatting
        const serviceType = SERVICE_TYPE_MAP[schedule.serviceType] || schedule.serviceType || 'Não especificado';

        // Equipment info
        const equipmentData = schedule.equipments as unknown as Equipment | Equipment[];
        const equipment = Array.isArray(equipmentData) ? equipmentData[0] : equipmentData;
        let equipmentInfo = 'Não especificado';
        if (equipment) {
            const brand = equipment.brand || '';
            const model = equipment.model || '';
            const serialNumber = equipment.serialNumber || '';
            equipmentInfo = `${brand} ${model}${serialNumber ? ` (S/N: ${serialNumber})` : ''}`.trim();
        }

        // Search for assigned technicians' profiles + all admins (admin and super_admin) to get names and Chat IDs
        const { data: profiles, error: pError } = await supabase
            .from('profiles')
            .select('id, telegramchatid, role, first_name, last_name')
            .or(`id.in.(${technicianIds.map(id => `"${id}"`).join(',')}),role.eq.admin,role.eq.super_admin`);

        if (pError || !profiles) {
            logger.error(pError, 'Error fetching admin and technician profiles for notification');
            return;
        }

        const typedProfiles = profiles as Profile[];

        // Create list of names of assigned technicians for admin message
        const assignedTechNames = typedProfiles
            .filter(p => technicianIds.includes(p.id))
            .map(p => `${p.first_name || ''} ${p.last_name || ''}`.trim())
            .join(', ');

        const notificationTitle = isUpdate ? '🔄 *Re-Agendamento*' : '📅 *Novo Agendamento*';

        // Build the message with consistent formatting
        let baseMessage = `${notificationTitle}\n\n`;
        baseMessage += `*Tipo de Serviço:* ${serviceType}\n`;
        baseMessage += `*Cliente:* ${clientName}\n`;
        baseMessage += `*Equipamento:* ${equipmentInfo}\n`;
        baseMessage += `*Início:* ${startDate}\n`;
        baseMessage += `*Final:* ${endDate}\n`;

        if (schedule.additionalInfo) {
            baseMessage += `*Notas Internas:* ${schedule.additionalInfo}\n`;
        }

        if (scheduleParts && scheduleParts.length > 0) {
            baseMessage += `\n*Peças Necessárias:*\n`;
            scheduleParts.forEach((sp: any) => {
                const p = sp.parts;
                baseMessage += `• ${sp.quantity}x ${p.reference} - ${p.designation}\n`;
            });
        }

        const replyMarkup = {
            inline_keyboard: [
                [
                    { text: '✅ Aceitar', callback_data: `sch_acc_${scheduleId}` },
                    { text: '❌ Rejeitar', callback_data: `sch_rej_${scheduleId}` }
                ]
            ]
        };

        for (const profile of typedProfiles) {
            if (!profile.telegramchatid) continue;

            if (profile.role === 'admin' || profile.role === 'super_admin') {
                // Message for Admin/SuperAdmin: With tech list and WITHOUT buttons
                let adminMessage = baseMessage;
                adminMessage += `\n*Técnicos Atribuídos:* ${assignedTechNames}\n`;
                adminMessage += `\n_Aviso informativo para administração._`;
                await sendTelegramNotification(adminMessage, profile.telegramchatid);
            }

            if (technicianIds.includes(profile.id)) {
                // Message for Technician/Office Staff: WITHOUT tech list and WITH buttons
                let techMessage = baseMessage;
                techMessage += `\nPor favor, confirme a sua disponibilidade.`;
                await sendTelegramNotification(techMessage, profile.telegramchatid, replyMarkup);
            }
        }
    } catch (err) {
        logger.error(err, 'Unexpected error in sendScheduleNotificationToTechnicians');
    }
}
