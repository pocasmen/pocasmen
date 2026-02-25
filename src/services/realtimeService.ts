//Horas de desenvolvimento activo=3,5
import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

export const broadcastCalendarUpdate = (supabase: SupabaseClient, scheduleId?: number | string) => {
    const channel = supabase.channel('calendar_updates');
    channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            channel.send({
                type: 'broadcast',
                event: 'schedule_changed',
                payload: { scheduleId, timestamp: new Date().toISOString() }
            }).then(() => {
                logger.debug({ scheduleId }, `[DEBUG:BROADCAST] Calendar update broadcasted`);
                // Pequeno delay antes de remover o canal para garantir o envio
                setTimeout(() => supabase.removeChannel(channel), 1000);
            });
        }
    });
};
