//Horas de desenvolvimento activo=4,5
import axios from 'axios';
import { logger } from '../utils/logger';

/**
 * Escapes HTML special characters for Telegram HTML parse_mode
 */
export const escapeHTML = (str: string) => {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

export const sendTelegramNotification = async (message: string, chatId?: string, replyMarkup?: any) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID;
    if (!token || !targetChatId) return;

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
        await axios.post(url, { 
            chat_id: targetChatId, 
            text: message, 
            parse_mode: 'HTML', 
            reply_markup: replyMarkup 
        });
    } catch (error: any) {
        logger.error({
            error: error.response?.data || error.message,
            chatId: targetChatId,
            messageSnippet: message.substring(0, 100)
        }, 'Error sending Telegram notification:');
    }
};
