import { pool } from '../config/db';
import { sendEmailWithTemplate } from './emailService';
import { sendTelegramNotification } from './telegramService';
import { logger } from '../utils/logger';

export interface NotificationPayload {
    templateKey: string;
    variables: Record<string, string>;
    telegramText: string;
}

/**
 * Notifica uma lista de utilizadores baseado nas suas preferências individuais.
 */
export async function notifyUsers(
    userIds: string[], 
    eventKey: string, 
    payload: NotificationPayload
) {
    if (!userIds.length) return;


    try {
        // 1. Verificar configuração global de notificações de clientes
        const { rows: settingsRows } = await pool.query('SELECT value FROM settings WHERE key = $1', ['client_notifications_enabled']);
        const clientNotificationsEnabled = settingsRows.length > 0 ? settingsRows[0].value === 'true' : true; // Default true se não existir

        // 2. Obter perfis, preferências e roles
        const { rows: profiles } = await pool.query(
            'SELECT id, email, role, telegramchatid, notification_prefs FROM profiles WHERE id = ANY($1)',
            [userIds]
        );

        for (const profile of profiles) {
            // Se for cliente e as notificações globais estiverem desativadas, saltar
            if (profile.role === 'client' && !clientNotificationsEnabled) {
                continue;
            }

            const prefs = profile.notification_prefs;
            if (!prefs || !prefs[eventKey]) continue;

            // Enviar Email via Template
            if (prefs[eventKey].email && profile.email) {
                sendEmailWithTemplate(profile.email, payload.templateKey, payload.variables).catch(err => 
                    logger.error({ err, userId: profile.id, template: payload.templateKey }, 'Error sending templated email notification')
                );
            }

            // Enviar Telegram
            if (prefs[eventKey].telegram && profile.telegramchatid) {
                sendTelegramNotification(payload.telegramText, profile.telegramchatid).catch(err => 
                    logger.error({ err, userId: profile.id }, 'Error sending telegram notification')
                );
            }
        }
    } catch (err) {
        logger.error({ err, eventKey }, 'Failed to process notifications');
    }
}
