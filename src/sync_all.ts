import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { googleCalendarService, mapHexToGoogleColor } from './services/googleCalendarService';

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
const calendarId = process.env.GOOGLE_CALENDAR_ID!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncAll() {
    console.log('Starting full synchronization of schedules to Google Calendar...');

    if (!calendarId || calendarId === 'primary') {
        console.warn('Note: Using "primary" calendar. Ensure your service account has access.');
    }

    // 1. Fetch all schedules that are NOT yet synced
    const { data: schedules, error } = await supabase
        .from('schedules')
        .select(`
      id, 
      title, 
      startDate, 
      endDate, 
      additionalInfo,
      clientId,
      equipmentId,
      googleEventId,
      schedule_technicians(technicianId)
    `)
        .is('googleEventId', null);

    if (error) {
        console.error('Error fetching schedules:', error);
        return;
    }

    console.log(`Found ${schedules?.length || 0} unsynced schedules.`);

    if (!schedules || schedules.length === 0) return;

    for (const s of schedules) {
        try {
            console.log(`Syncing schedule ${s.id}: ${s.title}...`);

            // 2. Fetch Client Name
            const { data: client } = await supabase.from('clients').select('name').eq('id', s.clientId).single();
            const clientName = client?.name || 'Cliente Desconhecido';

            // 3. Fetch Equipment
            const { data: equip } = await supabase.from('equipments').select('model').eq('id', s.equipmentId).single();
            const equipInfo = equip?.model || 'Modelo Desconhecido';

            // 4. Fetch Tech Color
            let colorId = '9';
            const techIds = (s.schedule_technicians as any[]).map(t => t.technicianId);
            if (techIds.length > 0) {
                const { data: tech } = await supabase.from('profiles').select('color').eq('id', techIds[0]).single();
                if (tech?.color) {
                    colorId = mapHexToGoogleColor(tech.color);
                }
            }

            // 5. Sync to Google
            const googleEventId = await googleCalendarService.createEvent(calendarId, {
                title: `${clientName} - ${s.title || 'Agendamento'}`,
                description: `Equipamento: ${equipInfo}\nNotas: ${s.additionalInfo || ''}`,
                startTime: s.startDate,
                endTime: s.endDate,
                colorId: colorId
            });

            if (googleEventId) {
                await supabase.from('schedules').update({ googleEventId }).eq('id', s.id);
                console.log(`Successfully synced schedule ${s.id} -> Event ${googleEventId}`);
            } else {
                console.error(`Failed to sync schedule ${s.id}`);
            }

        } catch (err) {
            console.error(`Error syncing schedule ${s.id}:`, err);
        }
    }

    console.log('Finished full synchronization.');
}

syncAll().catch(console.error);
