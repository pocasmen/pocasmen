import { supabase } from './config/supabase';
import { logger } from './utils/logger';

async function diagnose() {
    logger.info('--- DIAGNOSTICO ---');

    logger.info('1. Tabela: profiles');
    const { data: pData } = await (supabase.from('profiles') as any).select('*').limit(1);
    if (pData && pData[0]) {
        logger.info({ columns: Object.keys(pData[0]) }, 'Colunas found in profiles');
    }

    logger.info('\n2. Tabela: equipments');
    const { data: eData } = await (supabase.from('equipments') as any).select('*').limit(1);
    if (eData && eData[0]) {
        logger.info({ columns: Object.keys(eData[0]) }, 'Colunas found in equipments');
    }

    logger.info('\n3. Tabela: tickets');
    const { data: tData } = await (supabase.from('tickets') as any).select('*').limit(1);
    if (tData && tData[0]) {
        logger.info({ columns: Object.keys(tData[0]) }, 'Colunas found in tickets');
    }
}

diagnose();
