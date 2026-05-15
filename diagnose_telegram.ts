import { supabase } from './src/config/supabase';
import { sendScheduleNotificationToTechnicians } from './src/services/scheduleService';
import dotenv from 'dotenv';
dotenv.config();

async function testAuditNotification() {
    console.log('=== Teste de Notificação com Auditoria ===');

    const scheduleId = 433; // Agendamento de teste existente

    const { data: techRows, error: techError } = await supabase
        .from('schedule_technicians')
        .select('technicianId')
        .eq('scheduleId', scheduleId);

    if (techError || !techRows) {
        console.error('Erro ao buscar técnicos:', techError);
        return;
    }

    const techIds = techRows.map(r => r.technicianId);
    console.log(`Técnicos encontrados para agendamento ${scheduleId}:`, techIds);

    // Teste 1: Novo agendamento (isUpdate = false)
    console.log('\n[TEST 1] Enviando como NOVO AGENDAMENTO (isUpdate=false)...');
    await sendScheduleNotificationToTechnicians(supabase, scheduleId, techIds, false);
    console.log('Teste 1 concluído.');

    // Pequena pausa
    await new Promise(r => setTimeout(r, 2000));

    // Teste 2: Re-agendamento (isUpdate = true)
    console.log('\n[TEST 2] Enviando como RE-AGENDAMENTO (isUpdate=true)...');
    await sendScheduleNotificationToTechnicians(supabase, scheduleId, techIds, true);
    console.log('Teste 2 concluído.');

    console.log('\n=== Testes terminados. Verifique o Telegram. ===');
}

testAuditNotification().catch(console.error);
