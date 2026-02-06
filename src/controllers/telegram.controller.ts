import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import axios from 'axios';
import { sendTelegramNotification } from '../services/telegramService';
import { broadcastCalendarUpdate } from '../services/realtimeService';
import { catchAsync } from '../utils/catchAsync';
import { ApiError, BadRequestError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { ScheduleStatus } from '../constants/enums';

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
            const { error } = await supabase.from('profiles').update({ telegramchatid: update.message.chat.id.toString() }).eq('id', profileId);
            if (!error) await sendTelegramNotification('✅ Conta associada!', update.message.chat.id.toString());
        }
    }

    if (update.callback_query) {
        const callbackQueryId = update.callback_query.id;
        const callbackData = update.callback_query.data;
        const chatId = update.callback_query.message.chat.id;
        const messageId = update.callback_query.message.message_id;

        if (callbackData.startsWith('sch_acc_') || callbackData.startsWith('sch_rej_')) {
            // Responder imediatamente ao callback para parar o spinner no Telegram
            await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                callback_query_id: callbackQueryId
            }).catch(err => logger.error(err, '[TELEGRAM] Erro ao responder callback query:'));

            const isAccept = callbackData.startsWith('sch_acc_');
            const scheduleId = isAccept ? callbackData.replace('sch_acc_', '') : callbackData.replace('sch_rej_', '');
            const newState = isAccept ? ScheduleStatus.ACCEPTED : ScheduleStatus.REJECTED;

            // Correção: o nome da coluna correto é acknowledgementState
            const { error: updateError } = await supabase
                .from('schedules')
                .update({ acknowledgementState: newState })
                .eq('id', scheduleId);

            if (updateError) {
                logger.error(updateError, `[TELEGRAM] Erro ao atualizar agendamento ${scheduleId}:`);
                return;
            }

            // Notificar o frontend de que houve uma alteração
            broadcastCalendarUpdate(supabase, scheduleId);

            const { data: s } = await supabase.from('schedules').select('*, clients(name), equipments(model, serialNumber)').eq('id', scheduleId).single();
            if (s) {
                const clientName = (s.clients as any)?.name || 'Cliente';
                const eq = (s.equipments as any);
                const statusEmoji = isAccept ? '✅' : '❌';
                const statusText = isAccept ? 'ACEITE' : 'REJEITADO';

                let updatedMsg = `${statusEmoji} *AGENDAMENTO ${statusText}*\n\n`;
                updatedMsg += `*Cliente:* ${clientName}\n*Equipamento:* ${eq?.model || '?'}\n`;

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

export const fetchBotInfo = async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    try {
        const { data } = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
        botUsername = data.result.username;
        logger.info(`[TELEGRAM] Bot identified: @${botUsername}`);
    } catch (err) {
        logger.error(err, '[TELEGRAM] Error getting bot info:');
    }
};
