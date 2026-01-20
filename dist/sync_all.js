"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const googleCalendarService_1 = require("./services/googleCalendarService");
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../.env') });
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const calendarId = process.env.GOOGLE_CALENDAR_ID;
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
function syncAll() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Starting full synchronization of schedules to Google Calendar...');
        if (!calendarId || calendarId === 'primary') {
            console.warn('Note: Using "primary" calendar. Ensure your service account has access.');
        }
        // 1. Fetch all schedules that are NOT yet synced
        const { data: schedules, error } = yield supabase
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
        console.log(`Found ${(schedules === null || schedules === void 0 ? void 0 : schedules.length) || 0} unsynced schedules.`);
        if (!schedules || schedules.length === 0)
            return;
        for (const s of schedules) {
            try {
                console.log(`Syncing schedule ${s.id}: ${s.title}...`);
                // 2. Fetch Client Name
                const { data: client } = yield supabase.from('clients').select('name').eq('id', s.clientId).single();
                const clientName = (client === null || client === void 0 ? void 0 : client.name) || 'Cliente Desconhecido';
                // 3. Fetch Equipment
                const { data: equip } = yield supabase.from('equipments').select('model').eq('id', s.equipmentId).single();
                const equipInfo = (equip === null || equip === void 0 ? void 0 : equip.model) || 'Modelo Desconhecido';
                // 4. Fetch Tech Color
                let colorId = '9';
                const techIds = s.schedule_technicians.map(t => t.technicianId);
                if (techIds.length > 0) {
                    const { data: tech } = yield supabase.from('profiles').select('color').eq('id', techIds[0]).single();
                    if (tech === null || tech === void 0 ? void 0 : tech.color) {
                        colorId = (0, googleCalendarService_1.mapHexToGoogleColor)(tech.color);
                    }
                }
                // 5. Sync to Google
                const googleEventId = yield googleCalendarService_1.googleCalendarService.createEvent(calendarId, {
                    title: `${clientName} - ${s.title || 'Agendamento'}`,
                    description: `Equipamento: ${equipInfo}\nNotas: ${s.additionalInfo || ''}`,
                    startTime: s.startDate,
                    endTime: s.endDate,
                    colorId: colorId
                });
                if (googleEventId) {
                    yield supabase.from('schedules').update({ googleEventId }).eq('id', s.id);
                    console.log(`Successfully synced schedule ${s.id} -> Event ${googleEventId}`);
                }
                else {
                    console.error(`Failed to sync schedule ${s.id}`);
                }
            }
            catch (err) {
                console.error(`Error syncing schedule ${s.id}:`, err);
            }
        }
        console.log('Finished full synchronization.');
    });
}
syncAll().catch(console.error);
