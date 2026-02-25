//Horas de desenvolvimento activo=4,0
import axios from 'axios';
import { logger } from '../utils/logger';

export const sendTelegramNotification = async (message: string, chatId?: string, replyMarkup?: any) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID;
    if (!token || !targetChatId) return;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
        await axios.post(url, { chat_id: targetChatId, text: message, parse_mode: 'Markdown', reply_markup: replyMarkup });
    } catch (error: any) {
        logger.error(error, 'Error sending Telegram notification:');
    }
};
