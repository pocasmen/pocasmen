import { supabase } from './config/supabase';

async function diagnose() {
    console.log('--- DIAGNOSTICO ---');

    console.log('1. Tabela: profiles');
    const { data: pData } = await (supabase.from('profiles') as any).select('*').limit(1);
    if (pData && pData[0]) {
        console.log('Colunas found in profiles:', Object.keys(pData[0]));
    }

    console.log('\n2. Tabela: equipments');
    const { data: eData } = await (supabase.from('equipments') as any).select('*').limit(1);
    if (eData && eData[0]) {
        console.log('Colunas found in equipments:', Object.keys(eData[0]));
    }

    console.log('\n3. Tabela: tickets');
    const { data: tData } = await (supabase.from('tickets') as any).select('*').limit(1);
    if (tData && tData[0]) {
        console.log('Colunas found in tickets:', Object.keys(tData[0]));
    }
}

diagnose();
