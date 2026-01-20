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
exports.googleCalendarService = exports.mapHexToGoogleColor = void 0;
const googleapis_1 = require("googleapis");
const path_1 = __importDefault(require("path"));
// Define the scope for Calendar API
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
// Path to the service account key file
const KEY_FILE_PATH = path_1.default.join(process.cwd(), 'google-credentials.json');
const auth = new googleapis_1.google.auth.GoogleAuth({
    keyFile: KEY_FILE_PATH,
    scopes: SCOPES,
});
const calendar = googleapis_1.google.calendar({ version: 'v3', auth });
/**
 * Maps common hex colors to Google Calendar color IDs (1-11)
 * @param hex Hex color string
 * @returns string colorId
 */
const mapHexToGoogleColor = (hex) => {
    const h = (hex || '').toLowerCase();
    // Default mapping for some common technician colors
    const colorMap = {
        '#3174ad': '9', // Primary Blue -> Blueberry
        '#28a745': '10', // Success Green -> Basil
        '#dc3545': '11', // Danger Red -> Tomato
        '#ffc107': '5', // Warning Yellow -> Banana
        '#6c757d': '8', // Secondary Gray -> Graphite
        '#17a2b8': '7', // Info Cyan -> Peacock
        '#6610f2': '3', // Indigo -> Grape
        '#e83e8c': '4', // Pink -> Flamingo
        '#fd7e14': '6', // Orange -> Tangerine
    };
    // Try exact match
    if (colorMap[h])
        return colorMap[h];
    // Try approximate matches based on keywords or components
    if (h.includes('blue'))
        return '9';
    if (h.includes('green'))
        return '10';
    if (h.includes('red'))
        return '11';
    if (h.includes('yellow'))
        return '5';
    if (h.includes('orange'))
        return '6';
    if (h.includes('purple') || h.includes('grape'))
        return '3';
    if (h.includes('gray') || h.includes('grey'))
        return '8';
    return '9'; // Default to Blueberry
};
exports.mapHexToGoogleColor = mapHexToGoogleColor;
/**
 * Service to manage Google Calendar synchronization
 */
exports.googleCalendarService = {
    /**
     * Create an event in Google Calendar
     * @param calendarId The ID of the calendar to sync with
     * @param eventDetails Details of the appointment
     * @returns The created Google Event ID
     */
    createEvent(calendarId, eventDetails) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!calendarId) {
                    console.warn('[GOOGLE CALENDAR] No Calendar ID provided. Skipping sync.');
                    return null;
                }
                const event = {
                    summary: eventDetails.title,
                    location: eventDetails.location || '',
                    description: eventDetails.description,
                    colorId: eventDetails.colorId,
                    start: {
                        dateTime: eventDetails.startTime,
                        timeZone: 'Europe/Lisbon', // Adjust as needed or make dynamic
                    },
                    end: {
                        dateTime: eventDetails.endTime,
                        timeZone: 'Europe/Lisbon',
                    },
                };
                const response = yield calendar.events.insert({
                    calendarId: calendarId,
                    requestBody: event,
                });
                console.log(`[GOOGLE CALENDAR] Event created: ${response.data.id}`);
                return response.data.id;
            }
            catch (error) {
                console.error('[GOOGLE CALENDAR] Error creating event:', error);
                return null;
            }
        });
    },
    /**
     * Update an existing event in Google Calendar
     * @param calendarId The ID of the calendar
     * @param eventId The Google Event ID
     * @param eventDetails Updated details
     */
    updateEvent(calendarId, eventId, eventDetails) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!calendarId || !eventId) {
                    console.warn('[GOOGLE CALENDAR] Missing Calendar ID or Event ID. Skipping update.');
                    return false;
                }
                const event = {
                    summary: eventDetails.title,
                    location: eventDetails.location || '',
                    description: eventDetails.description,
                    colorId: eventDetails.colorId,
                    start: {
                        dateTime: eventDetails.startTime,
                        timeZone: 'Europe/Lisbon',
                    },
                    end: {
                        dateTime: eventDetails.endTime,
                        timeZone: 'Europe/Lisbon',
                    },
                };
                yield calendar.events.update({
                    calendarId: calendarId,
                    eventId: eventId,
                    requestBody: event,
                });
                console.log(`[GOOGLE CALENDAR] Event updated: ${eventId}`);
                return true;
            }
            catch (error) {
                console.error('[GOOGLE CALENDAR] Error updating event:', error);
                return false;
            }
        });
    },
    /**
     * Delete an event from Google Calendar
     * @param calendarId The ID of the calendar
     * @param eventId The Google Event ID
     */
    deleteEvent(calendarId, eventId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!calendarId || !eventId) {
                    return false;
                }
                yield calendar.events.delete({
                    calendarId: calendarId,
                    eventId: eventId,
                });
                console.log(`[GOOGLE CALENDAR] Event deleted: ${eventId}`);
                return true;
            }
            catch (error) {
                console.error('[GOOGLE CALENDAR] Error deleting event:', error);
                return false;
            }
        });
    },
    /**
     * Synchronizes all unsynced schedules to Google Calendar
     */
    syncAllUnsynced(supabase, calendarId) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('[SYNC] Starting full synchronization of unsynced schedules...');
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
                console.error('[SYNC] Error fetching unsynced schedules:', error);
                throw error;
            }
            console.log(`[SYNC] Found ${(schedules === null || schedules === void 0 ? void 0 : schedules.length) || 0} unsynced schedules.`);
            let successCount = 0;
            let failCount = 0;
            if (!schedules || schedules.length === 0)
                return { successCount, failCount };
            for (const s of schedules) {
                try {
                    // Fetch Client Name
                    const { data: client } = yield supabase.from('clients').select('name').eq('id', s.clientId).single();
                    const clientName = (client === null || client === void 0 ? void 0 : client.name) || 'Cliente Desconhecido';
                    // Fetch Equipment
                    const { data: equip } = yield supabase.from('equipments').select('model').eq('id', s.equipmentId).single();
                    const equipInfo = (equip === null || equip === void 0 ? void 0 : equip.model) || 'Modelo Desconhecido';
                    // Fetch Tech Color
                    let colorId = '9';
                    const techIds = s.schedule_technicians.map(t => t.technicianId);
                    if (techIds.length > 0) {
                        const { data: tech } = yield supabase.from('profiles').select('color').eq('id', techIds[0]).single();
                        if (tech === null || tech === void 0 ? void 0 : tech.color) {
                            colorId = (0, exports.mapHexToGoogleColor)(tech.color);
                        }
                    }
                    // Sync to Google
                    const googleEventId = yield this.createEvent(calendarId, {
                        title: `${clientName} - ${s.title || 'Agendamento'}`,
                        description: `Equipamento: ${equipInfo}\nNotas: ${s.additionalInfo || ''}`,
                        startTime: s.startDate,
                        endTime: s.endDate,
                        colorId: colorId
                    });
                    if (googleEventId) {
                        yield supabase.from('schedules').update({ googleEventId }).eq('id', s.id);
                        successCount++;
                    }
                    else {
                        failCount++;
                    }
                }
                catch (err) {
                    console.error(`[SYNC] Error syncing schedule ${s.id}:`, err);
                    failCount++;
                }
            }
            return { successCount, failCount };
        });
    }
};
