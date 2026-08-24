import { supabase } from './src/config/supabase';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function run() {
    console.log("A obter o template de produção da base de dados...");
    try {
        const { data: settingsData, error } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'email_templates')
            .maybeSingle();

        if (error) throw error;

        let subject = 'Mensagem de Project1';
        let body = '';
        
        if (settingsData?.value) {
            const templates = typeof settingsData.value === 'string'
                ? JSON.parse(settingsData.value)
                : settingsData.value;
            const template = templates['ticket_opened'];
            
            if (template) {
                subject = template.subject || subject;
                body = template.body || '';
            }
        }

        const variables = {
            ticketId: 'SIM-999',
            ticketTitle: 'Simulação Exata de Ticket (Teste Sistema)',
            clientUrl: 'https://portal.microatomo.pt',
            first_name: 'Pedro'
        };

        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            body = body.replace(regex, value);
            subject = subject.replace(regex, value);
        }

        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>${subject}</title>
        </head>
        <body>
            <div style="border: 1px solid #ccc; padding: 20px; max-width: 600px; margin: 0 auto; font-family: sans-serif;">
                <div style="background-color: #f5f5f5; padding: 10px; margin-bottom: 20px; font-size: 12px; color: #666;">
                    <strong>Assunto:</strong> ${subject}<br>
                    <strong>Para:</strong> pedro@microatomo.pt
                </div>
                ${body}
            </div>
        </body>
        </html>`;

        const outputPath = path.resolve(__dirname, 'simulacao_email.html');
        fs.writeFileSync(outputPath, htmlContent, 'utf8');
        
        console.log(`\n✅ Ficheiro atualizado! Adicionadas as variáveis que faltavam.`);
        
        // Evitar erro do handle do node no exit
        setTimeout(() => process.exit(0), 100);

    } catch (error) {
        console.error("Erro ao gerar email:", error);
        process.exit(1);
    }
}

run();
