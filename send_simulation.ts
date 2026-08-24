import { sendEmailWithTemplate } from './src/services/emailService';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function run() {
    console.log("A iniciar envio de email de simulação...");
    try {
        const result = await sendEmailWithTemplate(
            'pedro@microatomo.pt',
            'ticket_opened',
            {
                ticketId: 'SIM-999',
                ticketTitle: 'Simulação Exata de Ticket (Teste Sistema)',
                ticketUrl: 'https://portal.microatomo.pt/tickets/SIM-999'
            }
        );
        console.log("Resultado do envio:", result);
    } catch (error) {
        console.error("Erro ao enviar:", error);
    }
    process.exit(0);
}

run();
