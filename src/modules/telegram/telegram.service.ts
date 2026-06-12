import axios from 'axios';
import { supabase } from '../../config/supabase';
import { pool, withTransactionAs } from '../../config/db';
import { ScheduleRepository } from '../schedule/schedule.repository';
import { ProfileRepository } from '../technician/profile.repository';
import { sendTelegramNotification } from '../../services/telegramService';
import { broadcastCalendarUpdate } from '../../services/realtimeService';
import { SERVICE_TYPE_MAP, getServiceTypeKeys } from '../../services/scheduleService';
import { logger } from '../../utils/logger';
import { ScheduleStatus } from '../../constants/enums';
import { NotFoundError } from '../../utils/ApiError';

export class TelegramService {
    public botUsername: string = '';

    constructor(
        private scheduleRepo: ScheduleRepository,
        private profileRepo: ProfileRepository
    ) {}

    async getBotInfo() {
        return { username: this.botUsername };
    }

    async setWebhook(url: string) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (!url || !token) throw new Error('URL and token are required');

        const webhookUrl = `${url}/api/telegram/webhook`;
        await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, { 
            url: webhookUrl,
            secret_token: secretToken
        });
        return { message: `Webhook set to ${webhookUrl}` };
    }

    async processTelegramUpdate(update: any) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) return;

        if (update.message) logger.debug('[TELEGRAM] Received message');
        if (update.callback_query) logger.debug('[TELEGRAM] Received callback_query');

        if (update.message?.text?.startsWith('/start ')) {
            const profileId = update.message.text.split(' ')[1];
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidRegex.test(profileId)) {
                logger.info({ profileId, chat_id: update.message.chat.id }, '[TELEGRAM] Associating profile');
                await withTransactionAs(profileId, async (db) => {
                    await db.query('UPDATE profiles SET telegramchatid = $1 WHERE id = $2', [update.message.chat.id.toString(), profileId]);
                });
                await sendTelegramNotification('✅ Conta associada com sucesso!', update.message.chat.id.toString());
            }
        }

        if (update.callback_query) {
            const callbackQueryId = update.callback_query.id;
            const callbackData = update.callback_query.data;
            const chatIdUnsafe = update.callback_query.message.chat.id;
            const chatId = String(chatIdUnsafe);
            const messageId = update.callback_query.message.message_id;

            if (callbackData.startsWith('sch_acc_') || callbackData.startsWith('sch_rej_')) {
                logger.info({ callbackData, chatId, messageId }, '[TELEGRAM] Button clicked');

                const isAccept = callbackData.startsWith('sch_acc_');
                const scheduleIdStr = isAccept ? callbackData.replace('sch_acc_', '') : callbackData.replace('sch_rej_', '');
                const scheduleId = Number(scheduleIdStr);
                const newState = isAccept ? ScheduleStatus.ACCEPTED : ScheduleStatus.REJECTED;

                if (isNaN(scheduleId)) {
                    logger.error({ callbackData }, '[TELEGRAM] Invalid schedule ID in callback');
                    return;
                }

                await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                    callback_query_id: callbackQueryId,
                    text: isAccept ? 'A aceitar agendamento...' : 'A rejeitar agendamento...'
                }).catch(err => logger.error(err.message, '[TELEGRAM] Erro ao responder callback query:'));

                let technicianId: string | null = null;
                try {
                    // Descobrimos o id do tecnico antes da transação principal (ou lá dentro) via profileRepo
                    // Precisamos de pool para usar findByTelegramChatId, vamos injecta-lo
                    const profile = await this.profileRepo.findByTelegramChatId(chatId, pool);
                    technicianId = profile?.id || null;

                    await withTransactionAs(technicianId || 'telegram-webhook', async (db) => {
                        const { rowCount } = await db.query(
                            'UPDATE schedules SET "acknowledgementState" = $1 WHERE id = $2',
                            [newState, scheduleId]
                        );

                        if (rowCount === 0) {
                            throw new NotFoundError(`Agendamento ${scheduleId} não encontrado.`);
                        }

                        logger.info({ scheduleId, newState, technicianId }, '[TELEGRAM] Schedule status updated');
                    });

                    broadcastCalendarUpdate(supabase, scheduleId);

                    const s = await this.scheduleRepo.findById(scheduleId);
     
                    if (!s) {
                        logger.error(`[TELEGRAM] Schedule ${scheduleId} not found for message update`);
                        return;
                    }
     
                    const clientName = s.clientName || 'Cliente';
                    const startDate = s.startDate ? new Date(s.startDate).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' }) : 'A definir';
                    const endDate = s.endDate ? new Date(s.endDate).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' }) : 'A definir';
                    const serviceTypeKeys = getServiceTypeKeys(s.serviceType);
                    const serviceType = serviceTypeKeys.length > 0 ? SERVICE_TYPE_MAP[serviceTypeKeys[0]] || serviceTypeKeys[0] : 'Não especificado';
     
                    const equipmentInfo = `${s.equipmentBrand || ''} ${s.equipmentModel || ''}${s.equipmentSerialNumber ? ` (S/N: ${s.equipmentSerialNumber})` : ''}`.trim() || 'Não especificado';

                    const statusEmoji = isAccept ? '✅' : '❌';
                    const statusText = isAccept ? 'ACEITE' : 'REJEITADO';

                    let updatedMsg = `${statusEmoji} <b>AGENDAMENTO ${statusText}</b>\n\n`;
                    updatedMsg += `<b>Tipo de Serviço:</b> ${serviceType}\n`;
                    updatedMsg += `<b>Cliente:</b> ${clientName}\n`;
                    updatedMsg += `<b>Equipamento:</b> ${equipmentInfo}\n`;
                    updatedMsg += `<b>Início:</b> ${startDate}\n`;
                    updatedMsg += `<b>Final:</b> ${endDate}\n`;

                    if (s.additionalInfo) updatedMsg += `<b>Notas Internas:</b> ${s.additionalInfo}\n`;

                    if (s.parts && s.parts.length > 0) {
                        updatedMsg += `\n<b>Peças Necessárias:</b>\n`;
                        s.parts.forEach((p: any) => {
                            updatedMsg += `• ${p.quantity}x ${p.reference} - ${p.designation}\n`;
                        });
                    }

                    updatedMsg += isAccept ? `\nObrigado por confirmar o agendamento! Bom trabalho!` : `\nO agendamento foi rejeitado.`;

                    await axios.post(`https://api.telegram.org/bot${token}/editMessageText`, {
                        chat_id: chatId,
                        message_id: messageId,
                        text: updatedMsg,
                        parse_mode: 'HTML'
                    }).catch(err => logger.error(err.message, '[TELEGRAM] Erro ao editar mensagem:'));

                } catch (err: any) {
                    logger.error(err, '[TELEGRAM] Error in callback query processing:');
                    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                        chat_id: chatId,
                        text: `❌ Erro ao processar: ${err.message}`
                    }).catch(() => { });
                }
            }
        }
    }

    async syncTelegramUpdates() {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) return { success: false, error: 'No token' };
        try {
            const { data } = await axios.get(`https://api.telegram.org/bot${token}/getUpdates`);
            for (const update of data.result) {
                await this.processTelegramUpdate(update);
            }
            return { success: true, count: data.result.length };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    async initializeTelegramBot() {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const url = process.env.TELEGRAM_WEBHOOK_URL;

        if (!token) {
            logger.warn('[TELEGRAM] No bot token found. Telegram features disabled.');
            return;
        }

        try {
            const { data: me } = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
            this.botUsername = me.result.username;
            logger.info(`[TELEGRAM] Bot identified: @${this.botUsername}`);

            if (url) {
                const webhookUrl = `${url}/api/telegram/webhook`;
                const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
                await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, { 
                    url: webhookUrl,
                    secret_token: secretToken
                });
                logger.info(`[TELEGRAM] Webhook auto-configured to: ${webhookUrl}${secretToken ? ' (with Secret Token)' : ''}`);
            }
        } catch (err) {
            logger.error(err, '[TELEGRAM] Initialization failed:');
        }
    }
}
