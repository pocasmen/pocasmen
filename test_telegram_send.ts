
import { sendTelegramNotification } from './src/services/telegramService';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    console.log('Sending test notification...');
    const chatId = '6963590685'; // António Pedroso
    const message = 'Test from Antigravity: Confirmar agendamento?';
    const replyMarkup = {
        inline_keyboard: [
            [
                { text: '✅ Aceitar', callback_data: `test_acc` },
                { text: '❌ Rejeitar', callback_data: `test_rej` }
            ]
        ]
    };

    try {
        await sendTelegramNotification(message, chatId, replyMarkup);
        console.log('Notification sent successfully (check Telegram).');
    } catch (error) {
        console.error('Error in test:', error);
    }
}

test();
