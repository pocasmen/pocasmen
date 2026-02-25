//Horas de desenvolvimento activo=15,0
import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import axios from 'axios';
import { sendTelegramNotification } from '../services/telegramService';
import { broadcastCalendarUpdate } from '../services/realtimeService';
import { SERVICE_TYPE_MAP, getServiceTypeKeys } from '../services/scheduleService';
import { catchAsync } from '../utils/catchAsync';
import { BadRequestError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { ScheduleStatus } from '../constants/enums';
import { ProfileUpdate, ScheduleUpdate, Schedule as DbSchedule } from '../types/supabase';
import { withTransaction } from '../config/db';
import { setAuditUser } from '../utils/dbHelper';
import { Database } from '../types/db.types';

let botUsername = '';

export const getBotInfo = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    res.json({ username: botUsername });
});

export const setWebhook = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { url } = req.body;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!url || !token) throw new BadRequestError('URL and token are required');

    const webhookUrl = `${url}/api/telegram/webhook`;
    await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, { url: webhookUrl });
    res.json({ message: `Webhook set to ${webhookUrl}` });
});

export const handleWebhook = catchAsync(async (req: Request, res: Response) => {
    logger.info({ body: req.body }, '[TELEGRAM] Webhook received');
    res.sendStatus(200);
    const update = req.body;
    await processTelegramUpdate(update);
});

export const syncUpdates = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const result = await syncTelegramUpdates();
    res.json(result);
});

async function processTelegramUpdate(update: any) {
    logger.debug({ update }, '[TELEGRAM] Processing update');
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    if (update.message?.text?.startsWith('/start ')) {
        const profileId = update.message.text.split(' ')[1];
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(profileId)) {
            await withTransaction({ user: { id: profileId } }, async (db) => {
                await db.query('UPDATE profiles SET telegramchatid = $1 WHERE id = $2', [update.message.chat.id.toString(), profileId]);
            });
            await sendTelegramNotification('✅ Conta associada!', update.message.chat.id.toString());
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

            await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                callback_query_id: callbackQueryId
            }).catch(err => logger.error(err, '[TELEGRAM] Erro ao responder callback query:'));

            const isAccept = callbackData.startsWith('sch_acc_');
            const scheduleId = Number(isAccept ? callbackData.replace('sch_acc_', '') : callbackData.replace('sch_rej_', ''));
            const newState = isAccept ? ScheduleStatus.ACCEPTED : ScheduleStatus.REJECTED;

            await withTransaction({}, async (db) => {
                // Tenta encontrar o perfil do técnico pelo Telegram Chat ID para injetar no log de auditoria
                const { rows: profileRows } = await db.query('SELECT id FROM profiles WHERE telegramchatid = $1', [chatId]);
                const technicianId = profileRows[0]?.id;

                if (technicianId) {
                    await setAuditUser(db, technicianId);
                }

                const { rowCount } = await db.query(
                    'UPDATE schedules SET "acknowledgementState" = $1 WHERE id = $2',
                    [newState, scheduleId]
                );

                if (rowCount === 0) {
                    logger.error(`[TELEGRAM] Agendamento ${scheduleId} não encontrado para atualização.`);
                    return;
                }

                logger.info({ scheduleId, newState, technicianId }, '[TELEGRAM] Schedule status updated in DB via transaction');
            });

            broadcastCalendarUpdate(supabase, scheduleId);

            // Fetch info for the message update
            const { data: sRaw } = await supabase
                .from('schedules')
                .select('*, clients(name), equipments(brand, model, serialNumber)')
                .eq('id', scheduleId)
                .single();

            const s = sRaw as any;

            if (s) {
                const { data: scheduleParts } = await supabase
                    .from('schedule_parts')
                    .select('quantity, parts(reference, designation)')
                    .eq('scheduleId', scheduleId);

                const clientName = s.clients?.name || (Array.isArray(s.clients) ? s.clients[0]?.name : 'Cliente');
                const eq = s.equipments;
                const startDate = s.startDate ? new Date(s.startDate).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' }) : 'A definir';
                const endDate = s.endDate ? new Date(s.endDate).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' }) : 'A definir';
                const serviceTypeKeys = getServiceTypeKeys(s.serviceType);
                const serviceType = serviceTypeKeys.length > 0 ? SERVICE_TYPE_MAP[serviceTypeKeys[0]] || serviceTypeKeys[0] : 'Não especificado';

                let equipmentInfo = 'Não especificado';
                if (eq) {
                    const e = Array.isArray(eq) ? eq[0] : eq;
                    equipmentInfo = `${e.brand || ''} ${e.model || ''}${e.serialNumber ? ` (S/N: ${e.serialNumber})` : ''}`.trim();
                }

                const statusEmoji = isAccept ? '✅' : '❌';
                const statusText = isAccept ? 'ACEITE' : 'REJEITADO';

                let updatedMsg = `${statusEmoji} *AGENDAMENTO ${statusText}*\n\n`;
                updatedMsg += `*Tipo de Serviço:* ${serviceType}\n`;
                updatedMsg += `*Cliente:* ${clientName}\n`;
                updatedMsg += `*Equipamento:* ${equipmentInfo}\n`;
                updatedMsg += `*Início:* ${startDate}\n`;
                updatedMsg += `*Final:* ${endDate}\n`;

                if (s.additionalInfo) updatedMsg += `*Notas Internas:* ${s.additionalInfo}\n`;

                if (scheduleParts && (scheduleParts as any[]).length > 0) {
                    updatedMsg += `\n*Peças Necessárias:*\n`;
                    (scheduleParts as any[]).forEach((sp: any) => {
                        const p = sp.parts;
                        updatedMsg += `• ${sp.quantity}x ${p.reference} - ${p.designation}\n`;
                    });
                }

                updatedMsg += isAccept ? `\nObrigado por confirmar o agendamento! Bom trabalho!` : `\nO agendamento foi rejeitado. Por favor, entre em contacto com a administração se necessário.`;

                await axios.post(`https://api.telegram.org/bot${token}/editMessageText`, {
                    chat_id: chatId,
                    message_id: messageId,
                    text: updatedMsg,
                    parse_mode: 'Markdown'
                }).catch(err => logger.error(err, '[TELEGRAM] Erro ao editar mensagem:'));
            }
        }
    }
}

async function syncTelegramUpdates() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return { success: false, error: 'No token' };
    try {
        const { data } = await axios.get(`https://api.telegram.org/bot${token}/getUpdates`);
        for (const update of data.result) {
            await processTelegramUpdate(update);
        }
        return { success: true, count: data.result.length };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export const initializeTelegramBot = async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const url = process.env.TELEGRAM_WEBHOOK_URL;

    if (!token) {
        logger.warn('[TELEGRAM] No bot token found. Telegram features disabled.');
        return;
    }

    try {
        const { data: me } = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
        botUsername = me.result.username;
        logger.info(`[TELEGRAM] Bot identified: @${botUsername}`);

        if (url) {
            const webhookUrl = `${url}/api/telegram/webhook`;
            await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, { url: webhookUrl });
            logger.info(`[TELEGRAM] Webhook auto-configured to: ${webhookUrl}`);
        }
    } catch (err) {
        logger.error(err, '[TELEGRAM] Initialization failed:');
    }
};
