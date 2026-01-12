"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const body_parser_1 = __importDefault(require("body-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
const axios_1 = __importDefault(require("axios"));
const cron = __importStar(require("node-cron"));
const multer_1 = __importDefault(require("multer"));
const supabase_js_1 = require("@supabase/supabase-js");
const inventoryService = __importStar(require("./services/inventoryService"));
const emailService = __importStar(require("./services/emailService"));
dotenv_1.default.config();
// --- SUPABASE CLIENT INITIALIZATION ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Supabase URL or Service Key not defined in environment variables.");
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey);
exports.supabase = supabase;
console.log('Server initialization with Supabase client.');
const ATTACHMENTS_BUCKET = process.env.SUPABASE_TICKET_ATTACHMENTS_BUCKET || 'ticket-attachments';
// --- TELEGRAM NOTIFICATION FUNCTION ---
const sendTelegramNotification = (message, chatId, replyMarkup) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID;
    if (!token || !targetChatId)
        return;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
        yield axios_1.default.post(url, { chat_id: targetChatId, text: message, parse_mode: 'Markdown', reply_markup: replyMarkup });
    }
    catch (error) {
        console.error('Error sending Telegram notification:', ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
    }
});
// --- REALTIME BROADCAST HELPER ---
const broadcastCalendarUpdate = (scheduleId) => {
    const channel = supabase.channel('calendar_updates');
    channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            channel.send({
                type: 'broadcast',
                event: 'schedule_changed',
                payload: { scheduleId, timestamp: new Date().toISOString() }
            }).then(() => {
                console.log(`[DEBUG:BROADCAST] Calendar update broadcasted for scheduleId: ${scheduleId}`);
                // Pequeno delay antes de remover o canal para garantir o envio
                setTimeout(() => supabase.removeChannel(channel), 1000);
            });
        }
    });
};
// --- TELEGRAM BOT POLLING LOGIC ---
let lastUpdateId = 0;
let botUsername = '';
function handleTelegramUpdate(update) {
    return __awaiter(this, void 0, void 0, function* () {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token)
            return;
        // 1. Lógica de Associação (/start [UUID])
        if (update.message && update.message.text) {
            const text = update.message.text;
            const chatId = update.message.chat.id;
            if (text.startsWith('/start ')) {
                const profileId = text.split(' ')[1];
                if (profileId) {
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    if (uuidRegex.test(profileId)) {
                        const { error } = yield supabase
                            .from('profiles')
                            .update({ telegramchatid: chatId.toString() })
                            .eq('id', profileId);
                        if (!error) {
                            yield sendTelegramNotification('✅ Conta associada com sucesso! Agora irá receber notificações neste chat.', chatId.toString());
                            return { type: 'association', success: true };
                        }
                    }
                }
            }
        }
        // 2. Lógica de Botões (Callback Query)
        if (update.callback_query) {
            const callbackData = update.callback_query.data;
            const chatId = update.callback_query.message.chat.id;
            const messageId = update.callback_query.message.message_id;
            const originalText = update.callback_query.message.text;
            console.log(`[TELEGRAM DEBUG] Button clicked: data=${callbackData}, chatId=${chatId}`);
            if (callbackData.startsWith('sch_acc_') || callbackData.startsWith('sch_rej_')) {
                const isAccept = callbackData.startsWith('sch_acc_');
                const scheduleId = isAccept ? callbackData.replace('sch_acc_', '') : callbackData.replace('sch_rej_', '');
                const newState = isAccept ? 'accepted' : 'rejected';
                console.log(`[TELEGRAM DEBUG] Updating schedule ${scheduleId} to state: ${newState}`);
                const { error } = yield supabase
                    .from('schedules')
                    .update({ acknowledgementState: newState })
                    .eq('id', scheduleId);
                if (error) {
                    console.error(`[TELEGRAM DEBUG] Supabase error updating schedule ${scheduleId}:`, error);
                }
                else {
                    console.log(`[TELEGRAM DEBUG] Successfully updated schedule ${scheduleId} to ${newState}`);
                    broadcastCalendarUpdate(scheduleId);
                    // Obter o ticketId associado para atualizar o seu estado se necessário
                    const { data: schedule } = yield supabase
                        .from('schedules')
                        .select('ticketId')
                        .eq('id', scheduleId)
                        .single();
                    if (schedule && schedule.ticketId) {
                        if (!isAccept) {
                            console.log(`[TELEGRAM DEBUG] Reverting ticket ${schedule.ticketId} to open because schedule was rejected`);
                            yield supabase.from('tickets').update({ status: 'open' }).eq('id', schedule.ticketId);
                        }
                    }
                    yield axios_1.default.post(`https://api.telegram.org/bot${token}/editMessageText`, {
                        chat_id: chatId,
                        message_id: messageId,
                        text: `${originalText}\n\n${isAccept ? '✅ *Aceite pelo Técnico*' : '❌ *Rejeitado pelo Técnico*'}`,
                        parse_mode: 'Markdown'
                    });
                    return { type: 'button', success: true };
                }
            }
        }
    });
}
function getBotInfo() {
    return __awaiter(this, void 0, void 0, function* () {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const webhookBaseUrl = process.env.TELEGRAM_WEBHOOK_URL;
        if (!token)
            return;
        try {
            if (webhookBaseUrl) {
                const webhookUrl = `${webhookBaseUrl}/api/telegram/webhook`;
                yield axios_1.default.post(`https://api.telegram.org/bot${token}/setWebhook`, { url: webhookUrl });
                console.log(`Telegram Webhook set to: ${webhookUrl}`);
            }
            else {
                // Clear webhook if no URL is provided to allow manual sycn (getUpdates)
                yield axios_1.default.get(`https://api.telegram.org/bot${token}/deleteWebhook`);
                console.log('Telegram Webhook cleared (using manual sync).');
            }
            const response = yield axios_1.default.get(`https://api.telegram.org/bot${token}/getMe`);
            botUsername = response.data.result.username;
            console.log(`Telegram Bot identified as: @${botUsername}`);
        }
        catch (error) {
            console.error('Error during Telegram bot initialization:', error.message);
        }
    });
}
function syncTelegramUpdates() {
    return __awaiter(this, void 0, void 0, function* () {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token)
            return { success: false, error: 'Token não configurado' };
        try {
            const response = yield axios_1.default.get(`https://api.telegram.org/bot${token}/getUpdates`, {
                params: { offset: lastUpdateId + 1, timeout: 1 }
            });
            const updates = response.data.result;
            let processedCount = 0;
            for (const update of updates) {
                lastUpdateId = update.update_id;
                const result = yield handleTelegramUpdate(update);
                if (result)
                    processedCount++;
            }
            return { success: true, count: processedCount };
        }
        catch (error) {
            console.error('Error syncing Telegram updates:', error.message);
            return { success: false, error: error.message };
        }
    });
}
function sendScheduleNotificationToTechnicians(scheduleId_1, technicianIds_1) {
    return __awaiter(this, arguments, void 0, function* (scheduleId, technicianIds, isUpdate = false) {
        var _a, _b;
        try {
            const { data: schedule, error: sError } = yield supabase
                .from('schedules')
                .select('title, startDate, endDate, serviceType, additionalInfo, clients(name)')
                .eq('id', scheduleId)
                .single();
            if (sError || !schedule) {
                console.error('Error fetching schedule for notification:', sError);
                return;
            }
            const { data: scheduleParts, error: partsError } = yield supabase
                .from('schedule_parts')
                .select('quantity, parts(reference, designation)')
                .eq('scheduleId', scheduleId);
            const clientName = Array.isArray(schedule.clients) ? (_a = schedule.clients[0]) === null || _a === void 0 ? void 0 : _a.name : ((_b = schedule.clients) === null || _b === void 0 ? void 0 : _b.name) || 'Cliente Desconhecido';
            const startDate = new Date(schedule.startDate).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
            const endDate = new Date(schedule.endDate).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
            const serviceType = schedule.serviceType || 'Não especificado';
            // Procurar os perfis dos técnicos atribuídos + todos os administradores (admin e super_admin) para obter nomes e Chat IDs
            const { data: profiles, error: pError } = yield supabase
                .from('profiles')
                .select('id, telegramchatid, role, first_name, last_name')
                .or(`id.in.(${technicianIds.map(id => `"${id}"`).join(',')}),role.eq.admin,role.eq.super_admin`);
            if (pError || !profiles) {
                console.error('Error fetching admin and technician profiles for notification:', pError);
                return;
            }
            // Criar lista de nomes dos técnicos atribuídos para a mensagem dos admins
            const assignedTechNames = profiles
                .filter(p => technicianIds.includes(p.id))
                .map(p => `${p.first_name || ''} ${p.last_name || ''}`.trim())
                .join(', ');
            const notificationTitle = isUpdate ? '🔄 *Re-Agendamento*' : '📅 *Novo Agendamento*';
            // Construir a parte comum da mensagem
            let baseMessage = `${notificationTitle}\n\n`;
            baseMessage += `*Título:* ${schedule.title}\n`;
            baseMessage += `*Cliente:* ${clientName}\n`;
            baseMessage += `*Tipo de Serviço:* ${serviceType}\n`;
            baseMessage += `*Início:* ${startDate}\n`;
            baseMessage += `*Final:* ${endDate}\n`;
            if (schedule.additionalInfo) {
                baseMessage += `*Notas:* ${schedule.additionalInfo}\n`;
            }
            if (scheduleParts && scheduleParts.length > 0) {
                baseMessage += `\n*Peças necessárias:*\n`;
                scheduleParts.forEach((sp) => {
                    const p = sp.parts;
                    baseMessage += `• ${sp.quantity}x ${p.reference} - ${p.designation}\n`;
                });
            }
            const replyMarkup = {
                inline_keyboard: [
                    [
                        { text: '✅ Aceitar', callback_data: `sch_acc_${scheduleId}` },
                        { text: '❌ Rejeitar', callback_data: `sch_rej_${scheduleId}` }
                    ]
                ]
            };
            for (const profile of profiles) {
                if (!profile.telegramchatid)
                    continue;
                if (profile.role === 'admin' || profile.role === 'super_admin') {
                    // Mensagem para Admin/SuperAdmin: Com lista de técnicos e SEM botões
                    let adminMessage = baseMessage;
                    adminMessage += `\n*Técnicos Atribuídos:* ${assignedTechNames}\n`;
                    adminMessage += `\n_Aviso informativo para administração._`;
                    yield sendTelegramNotification(adminMessage, profile.telegramchatid);
                }
                if (technicianIds.includes(profile.id)) {
                    // Mensagem para Técnico/Office Staff: SEM lista de técnicos (para ser curta) e COM botões
                    let techMessage = baseMessage;
                    techMessage += `\nPor favor, confirme a sua disponibilidade.`;
                    yield sendTelegramNotification(techMessage, profile.telegramchatid, replyMarkup);
                }
            }
        }
        catch (err) {
            console.error('Unexpected error in sendScheduleNotificationToTechnicians:', err);
        }
    });
}
// --- CRON JOB FOR TICKET CHECKS ---
let scheduledTask;
function runTicketCheck() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Running pending ticket check...');
        try {
            const { count, error } = yield supabase.from('tickets').select('*', { count: 'exact', head: true }).in('status', ['open', 'acknowledged']);
            if (error)
                throw error;
            if (count && count > 0) {
                const message = `🔔 *Daily Reminder:* There are *${count}* pending ticket(s).`;
                sendTelegramNotification(message);
            }
        }
        catch (error) {
            console.error('Error running ticket check:', error);
        }
    });
}
function scheduleTicketCheck() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('Scheduling ticket check task...');
            const { data, error } = yield supabase.from('settings').select('*');
            if (error)
                throw error;
            const settings = data.reduce((acc, row) => (Object.assign(Object.assign({}, acc), { [row.key]: row.value })), {});
            if (settings['ticket_notification_active'] !== 'true') {
                if (scheduledTask)
                    scheduledTask.stop();
                return;
            }
            const [hour, minute] = (settings['ticket_notification_time'] || '17:00').split(':');
            const cronExpression = `${minute} ${hour} * * 1-5`;
            if (!cron.validate(cronExpression)) {
                console.error(`Invalid cron expression from settings. Defaulting.`);
                if (scheduledTask)
                    scheduledTask.stop();
                scheduledTask = cron.schedule(`0 17 * * 1-5`, runTicketCheck, { timezone: "Europe/Lisbon" });
                return;
            }
            if (scheduledTask)
                scheduledTask.stop();
            scheduledTask = cron.schedule(cronExpression, runTicketCheck, { timezone: "Europe/Lisbon" });
            console.log(`Ticket check task scheduled for ${settings['ticket_notification_time']} on weekdays.`);
        }
        catch (error) {
            console.error('Error scheduling ticket check:', error);
        }
    });
}
// --- EXPRESS APP SETUP ---
const app = (0, express_1.default)();
exports.app = app;
const port = process.env.PORT || 5001;
//const port = 5001;
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json());
// Multer setup for file uploads (stores files in memory)
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
const authenticateToken = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token)
            return res.sendStatus(401);
        const { data: { user }, error } = yield supabase.auth.getUser(token);
        if (error || !user)
            return res.sendStatus(403);
        req.user = user;
        next();
    }
    catch (err) {
        next(err);
    }
});
const authorizeRoles = (roles) => {
    return (req, res, next) => {
        var _a, _b;
        const userRole = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.user_metadata) === null || _b === void 0 ? void 0 : _b.role;
        if (!req.user || !userRole || !roles.includes(userRole)) {
            return res.status(403).json({ error: 'Permission denied for this role.' });
        }
        next();
    };
};
function markLastClientMessageAsRead(ticketId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Find the last message from the client that is marked as new
            // We join with profiles to identify messages where the user has the 'client' role
            const { data: lastClientMessage, error: fetchError } = yield supabase
                .from('ticket_responses')
                .select('id, profiles!inner(role)')
                .eq('ticket_id', ticketId)
                .eq('profiles.role', 'client')
                .eq('isNew', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 means no rows found
                console.error('Error fetching last client message:', fetchError);
                return;
            }
            if (lastClientMessage) {
                // Update its status to read
                const { error: updateError } = yield supabase
                    .from('ticket_responses')
                    .update({ isNew: false })
                    .eq('id', lastClientMessage.id);
                if (updateError) {
                    console.error('Error marking last client message as read:', updateError);
                }
                else {
                    console.log(`Last client message for ticket ${ticketId} marked as read.`);
                }
            }
        }
        catch (err) {
            console.error('Unexpected error in markLastClientMessageAsRead:', err);
        }
    });
}
// --- API ENDPOINTS ---
app.get('/', (req, res) => res.send('Server is running!'));
app.get('/api/test', (req, res) => {
    console.log('[DEBUG] /api/test endpoint hit. Server is alive!');
    res.send('Server is alive!');
});
// AUTH
app.post('/auth/login', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password } = req.body;
    const { data, error } = yield supabase.auth.signInWithPassword({ email, password });
    if (error)
        return res.status(401).json({ error: error.message });
    res.json(data);
}));
app.post('/auth/self-register', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, firstName, lastName, companyName } = req.body;
    if (!email || !firstName || !lastName || !companyName) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }
    try {
        const { error } = yield supabase.auth.admin.inviteUserByEmail(email, {
            data: {
                first_name: firstName,
                last_name: lastName,
                company_name: companyName,
                role: 'pending_client'
            }
        });
        if (error) {
            console.error('Error during self-register invitation:', error);
            if (error.message.includes('unique constraint') || error.message.includes('already exists')) {
                return res.status(409).json({ error: 'Um utilizador com este email já existe.' });
            }
            return res.status(500).json({ error: error.message });
        }
        res.status(200).json({ message: `Convite de registo enviado para ${email}. Por favor, verifique o seu email para continuar.` });
    }
    catch (err) {
        console.error('Fatal error during self-register:', err);
        res.status(500).json({ error: 'Ocorreu um erro inesperado no servidor.' });
    }
}));
app.get('/api/telegram/bot-info', authenticateToken, (req, res) => {
    res.json({ username: botUsername });
});
app.post('/api/telegram/webhook', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // O Telegram espera um status 200 rápido
    res.sendStatus(200);
    try {
        const update = req.body;
        console.log('[TELEGRAM DEBUG] Webhook received update:', JSON.stringify(update, null, 2));
        yield handleTelegramUpdate(update);
    }
    catch (err) {
        console.error('[TELEGRAM DEBUG] Error processing webhook update:', err);
    }
}));
app.post('/api/admin/set-telegram-webhook', authenticateToken, authorizeRoles(['super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { url } = req.body;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!url || !token)
        return res.status(400).json({ error: 'URL is required' });
    try {
        const webhookUrl = `${url}/api/telegram/webhook`;
        yield axios_1.default.post(`https://api.telegram.org/bot${token}/setWebhook`, { url: webhookUrl });
        res.json({ message: `Webhook set to ${webhookUrl}` });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
}));
app.post('/api/admin/sync-telegram-updates', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield syncTelegramUpdates();
    res.json(result);
}));
app.post('/admin/invite-user', authenticateToken, authorizeRoles(['admin', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const _c = req.body, { email, client_id, role } = _c, meta = __rest(_c, ["email", "client_id", "role"]);
    if (!email || !role)
        return res.status(400).json({ error: 'Email and role are required.' });
    if (role === 'client' && !client_id)
        return res.status(400).json({ error: 'Client ID is required for client role.' });
    // Only super_admin can create super_admin users
    const requestingUserRole = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.user_metadata) === null || _b === void 0 ? void 0 : _b.role;
    if (role === 'super_admin' && requestingUserRole !== 'super_admin') {
        return res.status(403).json({ error: 'Only Super Admin can create Super Admin users.' });
    }
    const inviteData = Object.assign({ role: role, must_set_password: true }, meta);
    if (client_id) {
        const { data: client, error: clientError } = yield supabase.from('clients').select('id').eq('id', client_id).single();
        if (clientError || !client)
            return res.status(404).json({ error: 'Client not found.' });
        inviteData.client_id = client_id;
    }
    const { data, error } = yield supabase.auth.admin.inviteUserByEmail(email, { data: inviteData });
    if (error)
        return res.status(500).json({ error: error.message });
    res.status(200).json({ message: `Invite sent to ${email}.` });
}));
app.get('/admin/pending-users', authenticateToken, authorizeRoles(['admin', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data: { users }, error } = yield supabase.auth.admin.listUsers();
        if (error)
            throw error;
        const pendingUsers = users.filter(u => u.user_metadata.role === 'pending_client');
        res.json(pendingUsers);
    }
    catch (err) {
        console.error('Error fetching pending users:', err);
        res.status(500).json({ error: 'Failed to fetch pending users', details: err.message });
    }
}));
app.post('/admin/approve-user', authenticateToken, authorizeRoles(['admin', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, client_id } = req.body;
    if (!userId || !client_id) {
        return res.status(400).json({ error: 'User ID and Client ID are required.' });
    }
    try {
        // Update profile: set client_id AND role to 'client'
        const { error: profileError } = yield supabase
            .from('profiles')
            .update({
            client_id: client_id,
            role: 'client' // ← FIX: Sync role in profiles table
        })
            .eq('id', userId);
        if (profileError) {
            console.error(`Error updating profile for user ${userId}:`, profileError);
            throw new Error(`Failed to associate user with client: ${profileError.message}`);
        }
        // Update auth.users metadata
        const { data: updatedUser, error: userError } = yield supabase.auth.admin.updateUserById(userId, { user_metadata: { role: 'client' } });
        if (userError) {
            console.error(`Error updating auth role for user ${userId}:`, userError);
            throw new Error(`Failed to update user role: ${userError.message}`);
        }
        res.status(200).json({ message: 'User approved and associated successfully.', user: updatedUser });
        // Send confirmation email
        if (updatedUser.user && updatedUser.user.email) {
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            const loginUrl = `${frontendUrl}/login`;
            let emailSubject = 'Aprovação de Conta - Project1';
            let emailHtml = `
        <div style="font-family: Arial, sans-serif; color: #333;">
          <h2>Bem-vindo ao Project1!</h2>
          <p>A sua conta foi aprovada pelo administrador.</p>
          <p>Já pode aceder à plataforma e gerir os seus pedidos de assistência.</p>
          <p>
            <a href="${loginUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Aceder à Plataforma
            </a>
          </p>
          <p style="font-size: 0.9em; color: #777; margin-top: 20px;">
            Se o botão acima não funcionar, copie e cole este link no seu browser:<br>
            ${loginUrl}
          </p>
        </div>
      `;
            // Try to fetch custom template
            try {
                const { data: settingsData } = yield supabase.from('settings').select('value').eq('key', 'email_templates').single();
                if (settingsData && settingsData.value) {
                    const templates = JSON.parse(settingsData.value);
                    if (templates.approval) {
                        emailSubject = templates.approval.subject || emailSubject;
                        if (templates.approval.body) {
                            emailHtml = templates.approval.body.replace(/{{login_url}}/g, loginUrl);
                        }
                    }
                }
            }
            catch (e) {
                console.error("Error loading email template, using default:", e);
            }
            emailService.sendEmail(updatedUser.user.email, emailSubject, emailHtml).catch(err => {
                console.error("Failed to send approval email async:", err);
            });
        }
    }
    catch (err) {
        console.error('Error in approval process:', err);
        res.status(500).json({ error: 'Failed to approve user', details: err.message });
    }
}));
// EMAIL TEMPLATES ENDPOINTS
app.get('/api/admin/email-templates', authenticateToken, authorizeRoles(['admin', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data, error } = yield supabase
            .from('settings')
            .select('value')
            .eq('key', 'email_templates')
            .single();
        if (error && error.code !== 'PGRST116') {
            return res.status(500).json({ error: 'Failed to fetch email templates', details: error.message });
        }
        const defaultTemplates = {
            approval: {
                name: 'Aprovação Cliente',
                subject: 'Aprovação de Conta - Project1',
                body: `<div style="font-family: Arial, sans-serif; color: #333;">
<h2>Bem-vindo ao Project1!</h2>
<p>A sua conta foi aprovada pelo administrador.</p>
<p>Já pode aceder à plataforma e gerir os seus pedidos de assistência.</p>
<p>
  <a href="{{login_url}}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
    Aceder à Plataforma
  </a>
</p>
<p style="font-size: 0.9em; color: #777; margin-top: 20px;">
  Se o botão acima não funcionar, copie e cole este link no seu browser:<br>
  {{login_url}}
</p>
</div>`
            }
        };
        let templates = defaultTemplates;
        if (data && data.value) {
            try {
                const parsed = JSON.parse(data.value);
                templates = Object.assign(Object.assign({}, defaultTemplates), parsed);
            }
            catch (e) {
                console.error("Error parsing email templates setting:", e);
            }
        }
        res.json(templates);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.put('/api/admin/email-templates', authenticateToken, authorizeRoles(['admin', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const templates = req.body;
    try {
        const { data: existing } = yield supabase.from('settings').select('id').eq('key', 'email_templates').single();
        let error;
        if (existing) {
            const result = yield supabase.from('settings').update({ value: JSON.stringify(templates) }).eq('key', 'email_templates');
            error = result.error;
        }
        else {
            const result = yield supabase.from('settings').insert({ key: 'email_templates', value: JSON.stringify(templates) });
            error = result.error;
        }
        if (error)
            return res.status(500).json({ error: 'Failed to update email templates', details: error.message });
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
// DASHBOARD
app.get('/api/dashboard/stats', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('[DEBUG] /api/dashboard/stats endpoint hit.');
    try {
        const { count: openTickets, error: ticketsError } = yield supabase.from('tickets').select('*', { count: 'exact', head: true }).in('status', ['open', 'acknowledged']);
        if (ticketsError)
            throw ticketsError;
        const today = new Date();
        const firstDayOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
        const lastDayOfWeek = new Date(firstDayOfWeek.getFullYear(), firstDayOfWeek.getMonth(), firstDayOfWeek.getDate() + 6);
        const { count: weeklySchedules, error: schedulesError } = yield supabase.from('schedules').select('*', { count: 'exact', head: true }).gte('startDate', firstDayOfWeek.toISOString()).lte('startDate', lastDayOfWeek.toISOString());
        if (schedulesError)
            throw schedulesError;
        const { count: pendingReports, error: reportsError } = yield supabase.from('schedules').select('*', { count: 'exact', head: true }).eq('isCompleted', true).eq('hasReport', false);
        if (reportsError)
            throw reportsError;
        res.json({ openTickets: openTickets || 0, weeklySchedules: weeklySchedules || 0, pendingReports: pendingReports || 0 });
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.get('/api/dashboard/weekly-schedules', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('[DEBUG] /api/dashboard/weekly-schedules endpoint hit.');
    try {
        const today = new Date();
        const firstDayOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
        const lastDayOfWeek = new Date(firstDayOfWeek.getFullYear(), firstDayOfWeek.getMonth(), firstDayOfWeek.getDate() + 6);
        const { data: schedules, error: schedulesError } = yield supabase
            .from('schedules')
            .select('id, title, startDate, clients(name), schedule_technicians(technicianId)')
            .gte('startDate', firstDayOfWeek.toISOString())
            .lte('startDate', lastDayOfWeek.toISOString())
            .order('startDate', { ascending: true });
        if (schedulesError)
            throw schedulesError;
        const technicianIds = [...new Set(schedules.flatMap(s => s.schedule_technicians.map((st) => st.technicianId)))];
        if (technicianIds.length === 0) {
            const result = schedules.map(s => {
                var _a, _b;
                return ({
                    id: s.id,
                    title: s.title,
                    startDate: s.startDate,
                    clientName: Array.isArray(s.clients) ? (_a = s.clients[0]) === null || _a === void 0 ? void 0 : _a.name : ((_b = s.clients) === null || _b === void 0 ? void 0 : _b.name) || 'Cliente Desconhecido',
                    technicians: [],
                });
            });
            return res.json(result);
        }
        const { data: profiles, error: profilesError } = yield supabase
            .from('profiles')
            .select('id, first_name, last_name, role')
            .in('id', technicianIds);
        if (profilesError)
            throw profilesError;
        const technicianMap = new Map(profiles.map(p => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]));
        const result = schedules.map(s => {
            var _a, _b;
            return ({
                id: s.id,
                title: s.title,
                startDate: s.startDate,
                clientName: Array.isArray(s.clients) ? (_a = s.clients[0]) === null || _a === void 0 ? void 0 : _a.name : ((_b = s.clients) === null || _b === void 0 ? void 0 : _b.name) || 'Cliente Desconhecido',
                technicians: s.schedule_technicians.map((st) => technicianMap.get(st.technicianId) || 'Técnico Desconhecido'),
            });
        });
        res.json(result);
    }
    catch (err) {
        console.error('Error fetching weekly schedules:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.get('/api/dashboard/pending-reports', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('[DEBUG] /api/dashboard/pending-reports endpoint hit.');
    try {
        const { data: schedules, error: schedulesError } = yield supabase
            .from('schedules')
            .select('id, title, endDate, clients(name), schedule_technicians(technicianId)')
            .eq('isCompleted', true)
            .eq('hasReport', false)
            .order('endDate', { ascending: true });
        if (schedulesError)
            throw schedulesError;
        const technicianIds = [...new Set(schedules.flatMap(s => s.schedule_technicians.map((st) => st.technicianId)))];
        if (technicianIds.length === 0) {
            const result = schedules.map(s => {
                var _a, _b;
                return ({
                    id: s.id,
                    title: s.title,
                    endDate: s.endDate,
                    clientName: Array.isArray(s.clients) ? (_a = s.clients[0]) === null || _a === void 0 ? void 0 : _a.name : ((_b = s.clients) === null || _b === void 0 ? void 0 : _b.name) || 'Cliente Desconhecido',
                    technicians: [],
                });
            });
            return res.json(result);
        }
        const { data: profiles, error: profilesError } = yield supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', technicianIds);
        if (profilesError)
            throw profilesError;
        const technicianMap = new Map(profiles.map(p => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]));
        const result = schedules.map(s => {
            var _a, _b;
            return ({
                id: s.id,
                title: s.title,
                endDate: s.endDate,
                clientName: Array.isArray(s.clients) ? (_a = s.clients[0]) === null || _a === void 0 ? void 0 : _a.name : ((_b = s.clients) === null || _b === void 0 ? void 0 : _b.name) || 'Cliente Desconhecido',
                technicians: s.schedule_technicians.map((st) => technicianMap.get(st.technicianId) || 'Técnico Desconhecido'),
            });
        });
        res.json(result);
    }
    catch (err) {
        console.error('Error fetching pending reports:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
// ... (Continue with the rest of the endpoints)
// CLIENTS, EQUIPMENTS, TECHNICIANS, PARTS, INVENTORY, SCHEDULES, REPORTS, TICKETS, ATTACHMENTS
// All endpoints from previous successful replacements should be here,
// with all 'clientId' references changed to 'client_id' and all route handlers
// correctly typed as async (req: AuthenticatedRequest, res: Response)
// ...
app.get('/api/clients', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const search = req.query.search;
        let query = supabase
            .from('clients')
            .select('id, name, address, city, postCode, nif')
            .order('name', { ascending: true });
        if (search) {
            query = query.ilike('name', `%${search}%`);
        }
        const { data, error } = yield query;
        if (error)
            return res.status(500).json({ error: 'Failed to fetch clients', details: error.message });
        res.json(data !== null && data !== void 0 ? data : []);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.put('/api/clients/:id', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { name, address, city, postCode, nif } = req.body;
    if (!name)
        return res.status(400).json({ error: 'Name is required.' });
    try {
        const { data, error } = yield supabase
            .from('clients')
            .update({ name, address, city, postCode, nif })
            .eq('id', id)
            .select();
        if (error)
            return res.status(500).json({ error: 'Failed to update client', details: error.message });
        res.json(data === null || data === void 0 ? void 0 : data[0]);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.delete('/api/clients/:id', authenticateToken, authorizeRoles(['admin', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const { error } = yield supabase
            .from('clients')
            .delete()
            .eq('id', id);
        if (error)
            return res.status(500).json({ error: 'Failed to delete client', details: error.message });
        res.sendStatus(204);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.post('/api/clients', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, address, city, postCode, nif } = req.body;
    if (!name)
        return res.status(400).json({ error: 'Name is required.' });
    try {
        const { data, error } = yield supabase
            .from('clients')
            .insert({ name, address, city, postCode, nif })
            .select();
        if (error)
            return res.status(500).json({ error: 'Failed to create client', details: error.message });
        res.status(201).json(data === null || data === void 0 ? void 0 : data[0]);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
// TECHNICIANS (profiles)
app.get('/api/technicians', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data, error } = yield supabase
            .from('profiles')
            .select('id, email, role, first_name, last_name, color, telegramchatid')
            .in('role', ['technician', 'admin', 'office_staff', 'super_admin'])
            .order('first_name', { ascending: true });
        if (error)
            return res.status(500).json({ error: 'Failed to fetch users', details: error.message });
        const result = (data || []).map((p) => ({
            id: p.id,
            email: p.email || '',
            role: p.role || 'technician',
            first_name: p.first_name || '',
            last_name: p.last_name || '',
            color: p.color || '#3174ad',
            telegramchatid: p.telegramchatid || '',
            name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
        }));
        res.json(result);
    }
    catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.put('/api/technicians/:id', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.params.id;
        const { first_name, last_name, color, role, telegramchatid } = req.body;
        const requestingUser = req.user;
        const requestingUserRole = requestingUser.user_metadata.role;
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required.' });
        }
        // Se for técnico ou office_staff, só pode editar o seu próprio perfil
        // E não pode alterar a sua própria role
        if (requestingUserRole === 'technician' || requestingUserRole === 'office_staff') {
            if (userId !== requestingUser.id) {
                return res.status(403).json({ error: 'Você só pode editar o seu próprio perfil.' });
            }
            // Impede técnico/office_staff de mudar a sua própria role
        }
        const updateData = { first_name, last_name, color, telegramchatid };
        // Role change logic:
        // - super_admin can change any role to any role
        // - admin can change roles but NOT to super_admin
        // - technician/office_staff cannot change roles
        if (role && (requestingUserRole === 'admin' || requestingUserRole === 'super_admin')) {
            // Only super_admin can set or change to super_admin role
            if (role === 'super_admin' && requestingUserRole !== 'super_admin') {
                return res.status(403).json({ error: 'Only Super Admin can assign Super Admin role.' });
            }
            updateData.role = role;
        }
        const { data, error } = yield supabase
            .from('profiles')
            .update(updateData)
            .eq('id', userId)
            .select('id, email, role, first_name, last_name, color, telegramchatid')
            .single();
        if (error) {
            console.error('Error updating profile:', error);
            return res.status(500).json({ error: 'Failed to update user', details: error.message });
        }
        res.json(data);
    }
    catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
// SETTINGS
app.get('/api/settings', authenticateToken, authorizeRoles(['super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data, error } = yield supabase
            .from('settings')
            .select('key, value');
        if (error)
            return res.status(500).json({ error: 'Failed to fetch settings', details: error.message });
        const settingsObj = (data || []).reduce((acc, row) => {
            var _a;
            acc[row.key] = (_a = row.value) !== null && _a !== void 0 ? _a : '';
            return acc;
        }, {});
        res.json(settingsObj);
    }
    catch (err) {
        console.error('Error fetching settings:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
// REPORTS
app.get(['/api/reports', '/reports'], authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    console.log('[DEBUG] GET /reports - Request received');
    try {
        const { data: reports, error: reportsError } = yield supabase
            .from('reports')
            .select('*')
            .order('serviceDate', { ascending: false });
        if (reportsError) {
            console.error('[ERROR] GET /reports - Error fetching reports:', reportsError);
            return res.status(500).json({ error: 'Failed to fetch reports', details: reportsError.message });
        }
        console.log(`[DEBUG] GET /reports - Found ${(reports === null || reports === void 0 ? void 0 : reports.length) || 0} reports`);
        if (!reports || reports.length === 0) {
            return res.json([]);
        }
        // Fetch related data in parallel for performance
        const clientIds = [...new Set(reports.map(r => r.clientId).filter(Boolean))];
        const equipmentIds = [...new Set(reports.map(r => r.equipmentId).filter(Boolean))];
        const reportIds = reports.map(r => r.id);
        const [clientsRes, equipmentsRes, techniciansRes] = yield Promise.all([
            clientIds.length > 0 ? supabase.from('clients').select('id, name').in('id', clientIds) : Promise.resolve({ data: [] }),
            equipmentIds.length > 0 ? supabase.from('equipments').select('id, brand, model').in('id', equipmentIds) : Promise.resolve({ data: [] }),
            reportIds.length > 0 ? supabase.from('report_technicians').select('reportId, technicianId').in('reportId', reportIds) : Promise.resolve({ data: [] })
        ]);
        const clientMap = new Map(((_a = clientsRes.data) === null || _a === void 0 ? void 0 : _a.map(c => [c.id, c.name])) || []);
        const equipmentMap = new Map(((_b = equipmentsRes.data) === null || _b === void 0 ? void 0 : _b.map(e => [e.id, e])) || []);
        // Fetch all profiles for technician mapping
        const techIds = [...new Set(((_c = techniciansRes.data) === null || _c === void 0 ? void 0 : _c.map(rt => rt.technicianId).filter(Boolean)) || [])];
        const { data: profiles } = techIds.length > 0 ? yield supabase.from('profiles').select('id, first_name, last_name, color').in('id', techIds) : { data: [] };
        const profileMap = new Map((profiles === null || profiles === void 0 ? void 0 : profiles.map(p => [p.id, p])) || []);
        const techMap = new Map();
        (_d = techniciansRes.data) === null || _d === void 0 ? void 0 : _d.forEach(rt => {
            const p = profileMap.get(rt.technicianId);
            if (p) {
                if (!techMap.has(rt.reportId))
                    techMap.set(rt.reportId, []);
                techMap.get(rt.reportId).push({
                    id: p.id,
                    name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                    color: p.color
                });
            }
        });
        const result = reports.map(r => {
            const eq = equipmentMap.get(r.equipmentId);
            return Object.assign(Object.assign({}, r), { clientName: clientMap.get(r.clientId) || 'Cliente Desconhecido', equipmentBrand: (eq === null || eq === void 0 ? void 0 : eq.brand) || '', equipmentModel: (eq === null || eq === void 0 ? void 0 : eq.model) || '', technicians: techMap.get(r.id) || [], internalNotes: r.internal_notes });
        });
        console.log('[DEBUG] GET /reports - Successfully returning results');
        res.json(result);
    }
    catch (err) {
        console.error('[FATAL ERROR] GET /reports:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.get(['/api/reports/:id', '/report/:id'], authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    console.log(`[DEBUG] GET /report/:id - id: ${id}`);
    try {
        const { data: report, error } = yield supabase
            .from('reports')
            .select('*')
            .eq('id', id)
            .single();
        if (error) {
            console.error('[ERROR] GET /report/:id - Error fetching report:', error);
            return res.status(500).json({ error: 'Failed to fetch report', details: error.message });
        }
        if (!report)
            return res.status(404).json({ error: 'Report not found' });
        // Fetch related data
        const [clientRes, equipmentRes, techRes] = yield Promise.all([
            supabase.from('clients').select('id, name, address, nif').eq('id', report.clientId).single(),
            supabase.from('equipments').select('id, brand, model, serialNumber').eq('id', report.equipmentId).single(),
            supabase.from('report_technicians').select('technicianId').eq('reportId', report.id)
        ]);
        const client = clientRes.data;
        const equipment = equipmentRes.data;
        const reportTechs = techRes.data || [];
        let technicianNames = '';
        let technicians = [];
        if (reportTechs.length > 0) {
            const techIds = reportTechs.map((rt) => rt.technicianId);
            const { data: profiles } = yield supabase.from('profiles').select('id, first_name, last_name, color').in('id', techIds);
            if (profiles) {
                technicians = profiles.map((p) => ({
                    id: p.id,
                    name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                    color: p.color
                }));
                technicianNames = technicians.map(t => t.name).join(', ');
            }
        }
        // Map to the format expected by ReportPrintPage
        const detailedReport = Object.assign(Object.assign({}, report), { clientName: (client === null || client === void 0 ? void 0 : client.name) || 'Cliente Desconhecido', clientAddress: (client === null || client === void 0 ? void 0 : client.address) || '', clientNif: (client === null || client === void 0 ? void 0 : client.nif) || '', equipmentBrand: (equipment === null || equipment === void 0 ? void 0 : equipment.brand) || '', equipmentModel: (equipment === null || equipment === void 0 ? void 0 : equipment.model) || '', equipmentSerialNumber: (equipment === null || equipment === void 0 ? void 0 : equipment.serialNumber) || '', technicianName: technicianNames, technicians: technicians, internalNotes: report.internal_notes });
        res.json(detailedReport);
    }
    catch (err) {
        console.error('[FATAL ERROR] GET /report/:id:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.get(['/api/reports/by-schedule/:scheduleId', '/reports/by-schedule/:scheduleId'], authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const scheduleId = Number(req.params.scheduleId);
    console.log(`[DEBUG] GET /reports/by-schedule - Received for scheduleId: ${scheduleId}`);
    try {
        if (!scheduleId || isNaN(scheduleId))
            return res.status(400).json({ error: 'Invalid schedule ID' });
        const { data: report, error } = yield supabase
            .from('reports')
            .select('*')
            .eq('scheduleId', scheduleId)
            .maybeSingle();
        if (error) {
            console.error('[ERROR] GET /reports/by-schedule - Error fetching report:', error);
            return res.status(500).json({ error: 'Failed to fetch report', details: error.message });
        }
        if (!report) {
            console.log(`[DEBUG] GET /reports/by-schedule - No report found for scheduleId: ${scheduleId}`);
            return res.status(404).json({ error: 'Report not found' });
        }
        console.log(`[DEBUG] GET /reports/by-schedule - Found report ID: ${report.id}. Fetching technicians...`);
        // Fetch technicians
        const { data: reportTechnicians, error: rtError } = yield supabase
            .from('report_technicians')
            .select('technicianId')
            .eq('reportId', report.id);
        let technicians = [];
        if (!rtError && reportTechnicians && reportTechnicians.length > 0) {
            const techIds = reportTechnicians.map((rt) => rt.technicianId);
            const { data: profiles, error: pError } = yield supabase
                .from('profiles')
                .select('id, first_name, last_name, color')
                .in('id', techIds);
            if (!pError && profiles) {
                technicians = profiles.map((p) => ({
                    id: p.id,
                    name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                    color: p.color
                }));
            }
        }
        console.log(`[DEBUG] GET /reports/by-schedule - Returning report with ${technicians.length} technicians`);
        res.json(Object.assign(Object.assign({}, report), { technicians, internalNotes: report.internal_notes }));
    }
    catch (err) {
        console.error('[FATAL ERROR] GET /reports/by-schedule:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.post('/api/reports', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('[DEBUG] POST /api/reports hit. Request body:', req.body);
    try {
        const { clientId, equipmentId, scheduleId, technicianIds, serviceDate, hours, parts, description, damage, serviceType, internalNotes } = req.body;
        // Validations
        if (!clientId || !equipmentId || !scheduleId || !technicianIds || !serviceDate || hours === undefined || !description) {
            console.error('[ERROR] POST /api/reports: Missing required fields.', { clientId, equipmentId, scheduleId, technicianIds, serviceDate, hours, description });
            return res.status(400).json({ error: 'Campos obrigatórios em falta para criar o relatório.' });
        }
        if (!Array.isArray(technicianIds)) {
            return res.status(400).json({ error: 'technicianIds deve ser uma lista de IDs.' });
        }
        if (parts && !Array.isArray(parts)) {
            return res.status(400).json({ error: 'parts deve ser uma lista válida.' });
        }
        // 1. Fetch Schedule Year
        const { data: scheduleData, error: scheduleError } = yield supabase
            .from('schedules')
            .select('startDate')
            .eq('id', scheduleId)
            .single();
        if (scheduleError || !scheduleData) {
            console.error('[ERROR] POST /api/reports: Failed to fetch schedule date.', scheduleError);
            return res.status(500).json({ error: 'Erro ao obter dados do agendamento.' });
        }
        const scheduleYear = new Date(scheduleData.startDate).getFullYear();
        const yearPrefix = `${scheduleYear}`;
        // 2. Find max report_number for this year
        // Assuming report_number format: "AAAABBBB" (e.g., 20260001) as specificied
        const { data: maxReport, error: maxReportError } = yield supabase
            .from('reports')
            .select('report_number')
            .ilike('report_number', `${yearPrefix}%`) // Filter by year prefix
            .order('report_number', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (maxReportError) {
            console.error('[ERROR] POST /api/reports: Failed to fetch max report number.', maxReportError);
            // Fail safe or error? Let's error to ensure sequence/uniqueness
            return res.status(500).json({ error: 'Erro ao gerar número do relatório.' });
        }
        let nextSequence = 1;
        if (maxReport && maxReport.report_number) {
            const currentSequenceStr = String(maxReport.report_number).slice(4); // Remove AAAA
            const currentSequence = parseInt(currentSequenceStr, 10);
            if (!isNaN(currentSequence)) {
                nextSequence = currentSequence + 1;
            }
        }
        const nextSequenceStr = String(nextSequence).padStart(4, '0');
        const newReportNumber = `${yearPrefix}${nextSequenceStr}`;
        console.log(`[DEBUG] Generated report_number: ${newReportNumber} for Year: ${scheduleYear}`);
        console.log('[DEBUG] Attempting to insert report into Supabase...');
        const { data: report, error: reportError } = yield supabase
            .from('reports')
            .insert({
            clientId,
            equipmentId,
            scheduleId,
            serviceDate,
            hours,
            parts: parts || [],
            description,
            damage: damage || '',
            serviceType: serviceType || [],
            internal_notes: internalNotes || '',
            report_number: newReportNumber
        })
            .select('id')
            .single();
        if (reportError) {
            console.error('[ERROR] Supabase insert report error:', reportError);
            return res.status(500).json({ error: 'Erro ao criar relatório.', details: reportError.message });
        }
        console.log('[DEBUG] Report inserted successfully. Report ID:', report.id);
        if (technicianIds.length > 0) {
            const reportTechnicians = technicianIds.map((techId) => ({ reportId: report.id, technicianId: techId }));
            console.log('[DEBUG] Attempting to associate technicians:', reportTechnicians);
            const { error: techError } = yield supabase.from('report_technicians').insert(reportTechnicians);
            if (techError) {
                console.error('[ERROR] Supabase associate technicians error:', techError);
                // Not fatal, but good to know
                // return res.status(500).json({ error: 'Erro ao associar técnicos ao relatório.', details: techError.message });
            }
            else {
                console.log('[DEBUG] Technicians associated successfully.');
            }
        }
        else {
            console.log('[DEBUG] No technicians to associate.');
        }
        console.log('[DEBUG] Attempting to update schedule hasReport status for scheduleId:', scheduleId);
        const { error: scheduleUpdateError } = yield supabase.from('schedules').update({ hasReport: true }).eq('id', scheduleId);
        if (scheduleUpdateError) {
            console.error('[ERROR] Supabase update schedule hasReport error:', scheduleUpdateError);
        }
        console.log('[DEBUG] Schedule hasReport status updated.');
        // --- INVENTORY MANAGEMENT: Automatic Abate ---
        if (Array.isArray(parts) && parts.length > 0) {
            console.log(`[DEBUG_INV] Processing automatic abate for ${parts.length} parts.`);
            for (const p of parts) {
                if (p.id && p.quantity > 0) {
                    try {
                        const { data: currentPart, error: fetchError } = yield supabase
                            .from('parts')
                            .select('stock_quantity, reserved_quantity, designation')
                            .eq('id', p.id)
                            .single();
                        if (!fetchError && currentPart) {
                            const { newStock, newReserved } = inventoryService.processReportAbate(currentPart.stock_quantity || 0, currentPart.reserved_quantity || 0, Number(p.quantity));
                            console.log(`[DEBUG_INV] Abating Part "${currentPart.designation}" (ID: ${p.id}): Old Stock=${currentPart.stock_quantity}, New Stock=${newStock} | Old Reserved=${currentPart.reserved_quantity}, New Reserved=${newReserved}`);
                            yield supabase
                                .from('parts')
                                .update({ stock_quantity: newStock, reserved_quantity: newReserved })
                                .eq('id', p.id);
                        }
                    }
                    catch (invErr) {
                        console.error(`[ERROR_INV] Error processing part abate for part ${p.id}:`, invErr);
                    }
                }
            }
        }
        res.status(201).json({ message: 'Relatório criado com sucesso!', reportId: report.id });
    }
    catch (err) {
        console.error('[FATAL ERROR] POST /api/reports:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao criar relatório.', details: err.message || 'Erro desconhecido' });
    }
}));
app.put('/api/reports/:id', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('[DEBUG] PUT /api/reports/:id hit. Report ID:', req.params.id, 'Request body:', req.body);
    try {
        const reportId = req.params.id;
        const { clientId, equipmentId, scheduleId, technicianIds, serviceDate, hours, parts, description, damage, serviceType, internalNotes } = req.body;
        if (!clientId || !equipmentId || !scheduleId || !technicianIds || !serviceDate || hours === undefined || !description) {
            console.error('[ERROR] PUT /api/reports/:id: Missing required fields.', { reportId, clientId, equipmentId, scheduleId, technicianIds, serviceDate, hours, description });
            return res.status(400).json({ error: 'Campos obrigatórios em falta para atualizar o relatório.' });
        }
        console.log('[DEBUG] Attempting to update report in Supabase. Report ID:', reportId);
        const { data: updatedReport, error: reportError } = yield supabase
            .from('reports')
            .update({ clientId, equipmentId, scheduleId, serviceDate, hours, parts: parts || [], description, damage: damage || '', serviceType: serviceType || [], internal_notes: internalNotes || '' })
            .eq('id', reportId)
            .select('id')
            .single();
        if (reportError) {
            console.error('[ERROR] Supabase update report error:', reportError);
            return res.status(500).json({ error: 'Erro ao atualizar relatório.', details: reportError.message });
        }
        console.log('[DEBUG] Report updated successfully. Report ID:', updatedReport.id);
        console.log('[DEBUG] Attempting to delete existing report technicians for report ID:', reportId);
        const { error: deleteTechError } = yield supabase.from('report_technicians').delete().eq('reportId', reportId);
        if (deleteTechError) {
            console.error('[ERROR] Supabase delete report technicians error:', deleteTechError);
            return res.status(500).json({ error: 'Erro ao remover técnicos antigos do relatório.', details: deleteTechError.message });
        }
        console.log('[DEBUG] Existing technicians deleted.');
        const reportTechnicians = technicianIds.map((techId) => ({ reportId: updatedReport.id, technicianId: techId }));
        console.log('[DEBUG] Attempting to associate new technicians:', reportTechnicians);
        const { error: insertTechError } = yield supabase.from('report_technicians').insert(reportTechnicians);
        if (insertTechError) {
            console.error('[ERROR] Supabase insert new report technicians error:', insertTechError);
            return res.status(500).json({ error: 'Erro ao associar novos técnicos ao relatório.', details: insertTechError.message });
        }
        console.log('[DEBUG] New technicians associated successfully.');
        res.status(200).json({ message: 'Relatório atualizado com sucesso!', reportId: updatedReport.id });
    }
    catch (err) {
        console.error('[FATAL ERROR] PUT /api/reports/:id:', err);
        res.status(500).json({ error: 'Erro interno do servidor.', details: err.message });
    }
}));
app.put('/api/settings', authenticateToken, authorizeRoles(['super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const entries = Object.entries(req.body || {});
        const rows = entries.map(([key, value]) => ({ key, value }));
        if (rows.length === 0)
            return res.status(400).json({ error: 'No settings provided.' });
        const { data, error } = yield supabase
            .from('settings')
            .upsert(rows, { onConflict: 'key' })
            .select('key, value');
        if (error)
            return res.status(500).json({ error: 'Failed to save settings', details: error.message });
        const settingsObj = (data || []).reduce((acc, row) => {
            var _a;
            acc[row.key] = (_a = row.value) !== null && _a !== void 0 ? _a : '';
            return acc;
        }, {});
        // Re-schedule cron based on updated settings
        scheduleTicketCheck();
        res.json(settingsObj);
    }
    catch (err) {
        console.error('Error saving settings:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.get('/api/my-equipments', authenticateToken, authorizeRoles(['client']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { data: profile, error: profileError } = yield supabase
            .from('profiles')
            .select('id, client_id')
            .eq('id', (_a = req.user) === null || _a === void 0 ? void 0 : _a.id)
            .single();
        if (profileError)
            return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
        if (!profile || !profile.client_id)
            return res.status(404).json({ error: 'Profile not found or not associated to a client.' });
        console.log('[DEBUG] Profile and client_id fetched:', profile.id, profile.client_id);
        const { data, error } = yield supabase
            .from('equipments')
            .select('id, brand, model, serialNumber, clientId')
            .eq('clientId', profile.client_id)
            .order('id', { ascending: true });
        if (error)
            return res.status(500).json({ error: 'Failed to fetch equipments', details: error.message });
        res.json(data !== null && data !== void 0 ? data : []);
    }
    catch (err) {
        console.error('Error fetching my equipments:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.get('/api/my-tickets', authenticateToken, authorizeRoles(['client']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    console.log('[DEBUG] /api/my-tickets endpoint hit.');
    try {
        const { data: profile, error: profileError } = yield supabase
            .from('profiles')
            .select('id, client_id')
            .eq('id', (_a = req.user) === null || _a === void 0 ? void 0 : _a.id)
            .single();
        if (profileError)
            return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
        if (!profile || !profile.client_id)
            return res.status(404).json({ error: 'Profile not found or not associated to a client.' });
        const { data: tickets, error: ticketsError } = yield supabase
            .from('tickets')
            .select('id, createdAt, updatedAt, faultDescription, status, scheduleId, client_id, equipmentId')
            .eq('client_id', profile.client_id)
            .order('createdAt', { ascending: false });
        if (ticketsError)
            return res.status(500).json({ error: 'Failed to fetch tickets', details: ticketsError.message });
        const equipmentIds = [...new Set((tickets || []).map(t => t.equipmentId).filter(Boolean))];
        const scheduleIds = [...new Set((tickets || []).map(t => t.scheduleId).filter(Boolean))];
        let equipmentMap = new Map();
        if (equipmentIds.length > 0) {
            const { data: equipments, error: equipmentsError } = yield supabase
                .from('equipments')
                .select('id, brand, model, serialNumber')
                .in('id', equipmentIds);
            if (!equipmentsError && equipments) {
                equipmentMap = new Map(equipments.map(e => [e.id, { brand: e.brand, model: e.model, serialNumber: e.serialNumber }]));
            }
        }
        let scheduleMap = new Map();
        if (scheduleIds.length > 0) {
            const { data: schedules, error: schedulesError } = yield supabase
                .from('schedules')
                .select('id, startDate, endDate, hasReport')
                .in('id', scheduleIds);
            if (!schedulesError && schedules) {
                scheduleMap = new Map(schedules.map(s => [s.id, { startDate: s.startDate, endDate: s.endDate, hasReport: s.hasReport }]));
            }
        }
        const result = (tickets || []).map(t => {
            const e = equipmentMap.get(t.equipmentId);
            const equipmentInfo = e ? `${e.brand || ''} ${e.model || ''}${e.serialNumber ? ` (${e.serialNumber})` : ''}`.trim() : 'Equipamento Desconhecido';
            const s = t.scheduleId ? scheduleMap.get(t.scheduleId) : undefined;
            return {
                id: t.id,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt,
                faultDescription: t.faultDescription,
                status: t.status,
                scheduleId: t.scheduleId,
                client_id: t.client_id,
                equipmentId: t.equipmentId,
                equipmentInfo,
                startDate: s === null || s === void 0 ? void 0 : s.startDate,
                endDate: s === null || s === void 0 ? void 0 : s.endDate,
                hasReport: s === null || s === void 0 ? void 0 : s.hasReport,
            };
        });
        res.json(result);
    }
    catch (err) {
        console.error('Error fetching my tickets:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.get('/api/my-schedules', authenticateToken, authorizeRoles(['client']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    console.log('[DEBUG] /api/my-schedules endpoint hit.');
    try {
        const { data: profile, error: profileError } = yield supabase
            .from('profiles')
            .select('id, client_id')
            .eq('id', (_a = req.user) === null || _a === void 0 ? void 0 : _a.id).single();
        if (profileError) {
            console.error('[ERROR] Failed to fetch user profile:', profileError);
            return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
        }
        if (!profile || !profile.client_id) {
            console.error('[ERROR] Profile not found or not associated to a client for user ID:', (_b = req.user) === null || _b === void 0 ? void 0 : _b.id);
            return res.status(404).json({ error: 'Profile not found or not associated to a client.' });
        }
        console.log('[DEBUG] User profile fetched:', profile);
        const { data: schedules, error: schedulesError } = yield supabase
            .from('schedules')
            .select('id, title, startDate, endDate, isCompleted, hasReport, clients(name), schedule_technicians(technicianId)')
            .eq('clientId', profile.client_id)
            .order('startDate', { ascending: false });
        if (schedulesError) {
            console.error('[ERROR] Error fetching schedules:', schedulesError);
            return res.status(500).json({ error: 'Failed to fetch schedules', details: schedulesError.message });
        }
        // Ensure schedules data is not null or undefined before proceeding
        if (!schedules || schedules.length === 0) {
            console.log('[DEBUG] No schedules found for client_id:', profile.client_id);
            return res.status(200).json([]); // Return empty array if no schedules found
        }
        console.log('[DEBUG] Schedules data fetched:', JSON.stringify(schedules, null, 2));
        // Log the structure of schedule_technicians for debugging
        console.log('[DEBUG] Structure of schedule_technicians:', JSON.stringify(schedules.map(s => s.schedule_technicians), null, 2));
        const technicianIds = [...new Set(schedules.flatMap(s => { var _a; return ((_a = s.schedule_technicians) === null || _a === void 0 ? void 0 : _a.map((st) => st.technicianId)) || []; }))];
        let technicianMap = new Map();
        if (technicianIds.length > 0) {
            const { data: profiles, error: profilesError } = yield supabase
                .from('profiles')
                .select('id, first_name, last_name')
                .in('id', technicianIds);
            if (profilesError) {
                console.error('[ERROR] Error fetching technician profiles:', profilesError);
                return res.status(500).json({ error: 'Failed to fetch technician profiles', details: profilesError.message });
            }
            technicianMap = new Map(profiles.map(p => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]));
        }
        const result = schedules.map(s => {
            var _a, _b, _c;
            return ({
                id: s.id,
                title: s.title,
                startDate: s.startDate,
                endDate: s.endDate,
                isCompleted: s.isCompleted,
                hasReport: s.hasReport,
                clientName: Array.isArray(s.clients) ? (_a = s.clients[0]) === null || _a === void 0 ? void 0 : _a.name : ((_b = s.clients) === null || _b === void 0 ? void 0 : _b.name) || 'Cliente Desconhecido',
                technicians: ((_c = s.schedule_technicians) === null || _c === void 0 ? void 0 : _c.map((st) => technicianMap.get(st.technicianId) || 'Técnico Desconhecido')) || [],
            });
        });
        res.json(result !== null && result !== void 0 ? result : []);
    }
    catch (err) {
        console.error('Error fetching my schedules:', err);
        res.status(500).json({ error: 'Internal server error', details: err instanceof Error ? err.message : 'Unknown error' });
    }
}));
app.post('/api/my-tickets', authenticateToken, authorizeRoles(['client']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { equipmentId, title, faultDescription } = req.body;
        if (!equipmentId || !title || !faultDescription)
            return res.status(400).json({ error: 'equipmentId, title and faultDescription are required.' });
        const { data: profile, error: profileError } = yield supabase
            .from('profiles')
            .select('id, client_id')
            .eq('id', (_a = req.user) === null || _a === void 0 ? void 0 : _a.id)
            .single();
        if (profileError)
            return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
        if (!profile || !profile.client_id)
            return res.status(404).json({ error: 'Profile not found or not associated to a client.' });
        const { data: equipment, error: equipmentError } = yield supabase
            .from('equipments')
            .select('id, clientId')
            .eq('id', equipmentId)
            .single();
        if (equipmentError)
            return res.status(500).json({ error: 'Failed to verify equipment', details: equipmentError.message });
        if (!equipment || equipment.clientId !== profile.client_id)
            return res.status(403).json({ error: 'Permission denied for this equipment.' });
        const { data, error } = yield supabase
            .from('tickets')
            .insert({ client_id: profile.client_id, equipmentId, title, faultDescription, status: 'open', created_by_user_id: profile.id })
            .select('id, createdAt, updatedAt, title, faultDescription, status, scheduleId, client_id, equipmentId');
        if (error)
            return res.status(500).json({ error: 'Failed to create ticket', details: error.message });
        const newTicket = data === null || data === void 0 ? void 0 : data[0];
        if (newTicket) {
            // Enviar notificação imediata para o grupo de técnicos
            const { data: clientData } = yield supabase.from('clients').select('name').eq('id', profile.client_id).single();
            const { data: equipData } = yield supabase.from('equipments').select('brand, model').eq('id', equipmentId).single();
            const clientName = (clientData === null || clientData === void 0 ? void 0 : clientData.name) || 'Cliente Desconhecido';
            const equipmentInfo = equipData ? `${equipData.brand} ${equipData.model}` : 'Equipamento Desconhecido';
            const telegramMessage = `🆕 *Novo Ticket Aberto*\n\n` +
                `*Título:* ${title}\n` +
                `*Cliente:* ${clientName}\n` +
                `*Equipamento:* ${equipmentInfo}\n` +
                `*Descrição:* ${faultDescription}\n\n` +
                `_Aceda ao portal para gerir este pedido._`;
            sendTelegramNotification(telegramMessage);
        }
        res.status(201).json(newTicket !== null && newTicket !== void 0 ? newTicket : null);
    }
    catch (err) {
        console.error('Error creating ticket:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.get('/api/my-report/by-schedule/:id', authenticateToken, authorizeRoles(['client']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const scheduleId = Number(req.params.id);
        if (!scheduleId || Number.isNaN(scheduleId))
            return res.status(400).json({ error: 'Invalid schedule id' });
        const { data: profile, error: profileError } = yield supabase
            .from('profiles')
            .select('id, client_id')
            .eq('id', (_a = req.user) === null || _a === void 0 ? void 0 : _a.id)
            .single();
        if (profileError)
            return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
        if (!profile || !profile.client_id)
            return res.status(404).json({ error: 'Profile not found or not associated to a client.' });
        const { data: report, error: reportError } = yield supabase
            .from('reports')
            .select('id, clientId, equipmentId, serviceDate, hours, description, parts, scheduleId, serviceType, damage')
            .eq('scheduleId', scheduleId)
            .single();
        if (reportError)
            return res.status(500).json({ error: 'Failed to fetch report', details: reportError.message });
        if (!report)
            return res.status(404).json({ error: 'Report not found' });
        if (report.clientId !== profile.client_id)
            return res.status(403).json({ error: 'Permission denied for this report.' });
        let clientName = '';
        let clientAddress = '';
        let clientNif = '';
        {
            const { data: client, error: clientError } = yield supabase
                .from('clients')
                .select('id, name, address, nif')
                .eq('id', report.clientId)
                .single();
            if (!clientError && client) {
                clientName = client.name || '';
                clientAddress = client.address || '';
                clientNif = client.nif || '';
            }
        }
        let equipmentBrand = '';
        let equipmentModel = '';
        let equipmentSerialNumber = '';
        {
            const { data: equipment, error: equipmentError } = yield supabase
                .from('equipments')
                .select('id, brand, model, serialNumber')
                .eq('id', report.equipmentId)
                .single();
            if (!equipmentError && equipment) {
                equipmentBrand = equipment.brand || '';
                equipmentModel = equipment.model || '';
                equipmentSerialNumber = equipment.serialNumber || '';
            }
        }
        let technicians = [];
        {
            const { data: rt, error: rtError } = yield supabase
                .from('report_technicians')
                .select('technicianId')
                .eq('reportId', report.id);
            if (!rtError && rt && rt.length > 0) {
                const techIds = rt.map((r) => r.technicianId);
                const { data: profiles, error: profilesError } = yield supabase
                    .from('profiles')
                    .select('id, first_name, last_name, color')
                    .in('id', techIds);
                if (!profilesError && profiles) {
                    technicians = profiles.map((p) => ({ id: p.id, name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), color: p.color }));
                }
            }
        }
        const result = {
            id: report.id,
            clientId: report.clientId,
            equipmentId: report.equipmentId,
            scheduleId: report.scheduleId,
            technicians,
            serviceDate: report.serviceDate,
            hours: report.hours,
            parts: report.parts,
            description: report.description,
            serviceType: report.serviceType,
            damage: report.damage,
            clientName,
            clientAddress,
            clientNif,
            equipmentBrand,
            equipmentModel,
            equipmentSerialNumber,
        };
        res.json(result);
    }
    catch (err) {
        console.error('Error fetching my report by schedule:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
// CLIENT PORTAL: TICKET DETAILS AND ATTACHMENTS
app.get('/api/my-tickets/:id', authenticateToken, authorizeRoles(['client']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const ticketId = Number(req.params.id);
        if (!ticketId || Number.isNaN(ticketId))
            return res.status(400).json({ error: 'Invalid ticket id' });
        const { data: profile, error: profileError } = yield supabase
            .from('profiles')
            .select('id, client_id')
            .eq('id', (_a = req.user) === null || _a === void 0 ? void 0 : _a.id)
            .single();
        if (profileError)
            return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
        if (!profile || !profile.client_id)
            return res.status(404).json({ error: 'Profile not found or not associated to a client.' });
        const { data: ticket, error: ticketError } = yield supabase
            .from('tickets')
            .select('id, createdAt, updatedAt, title, faultDescription, status, scheduleId, client_id, equipmentId, created_by_user_id')
            .eq('id', ticketId)
            .single();
        if (ticketError)
            return res.status(500).json({ error: 'Failed to fetch ticket', details: ticketError.message });
        if (!ticket)
            return res.status(404).json({ error: 'Ticket not found' });
        if (ticket.client_id !== profile.client_id)
            return res.status(403).json({ error: 'Permission denied for this ticket.' });
        let clientName = 'Cliente Desconhecido';
        {
            const { data: client, error: clientError } = yield supabase
                .from('clients')
                .select('id, name')
                .eq('id', ticket.client_id)
                .single();
            if (!clientError && client)
                clientName = client.name || clientName;
        }
        let equipmentInfo = 'Equipamento Desconhecido';
        {
            const { data: equipment, error: equipmentError } = yield supabase
                .from('equipments')
                .select('id, brand, model, serialNumber')
                .eq('id', ticket.equipmentId)
                .single();
            if (!equipmentError && equipment) {
                equipmentInfo = `${equipment.brand || ''} ${equipment.model || ''}${equipment.serialNumber ? ` (${equipment.serialNumber})` : ''}`.trim();
            }
        }
        let userFirstName = '';
        let userLastName = '';
        {
            if (ticket.created_by_user_id) {
                const { data: userProfile, error: userError } = yield supabase
                    .from('profiles')
                    .select('id, first_name, last_name, role')
                    .eq('id', ticket.created_by_user_id)
                    .single();
                if (!userError && userProfile) {
                    userFirstName = userProfile.first_name || '';
                    userLastName = userProfile.last_name || '';
                }
            }
        }
        let responses = [];
        let usingLegacy = false;
        {
            const { data, error } = yield supabase
                .from('ticket_responses')
                .select('id, ticket_id, user_id, message, created_at, isNew, profiles(role)') // Adicionado profiles(role)
                .eq('ticket_id', ticketId)
                .order('created_at', { ascending: true });
            if (error) {
                const { data: legacyData, error: legacyErr } = yield supabase
                    .from('ticket_responses')
                    .select('id, ticket_id, user_id, message, created_at')
                    .eq('ticket_id', ticketId)
                    .order('created_at', { ascending: true });
                if (legacyErr)
                    return res.status(500).json({ error: 'Failed to fetch responses', details: legacyErr.message });
                responses = legacyData || [];
                usingLegacy = true;
            }
            else {
                responses = data || [];
            }
        }
        const authorIds = [...new Set((responses || []).map((r) => r.user_id).filter(Boolean))];
        let authorMap = new Map();
        if (authorIds.length > 0) {
            const { data: profilesList, error: profErr } = yield supabase
                .from('profiles')
                .select('id, first_name, last_name, role')
                .in('id', authorIds);
            if (!profErr && profilesList) {
                authorMap = new Map(profilesList.map((p) => [p.id, { name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), role: p.role || 'client' }]));
            }
        }
        const responsesEnriched = (responses || []).map((r) => {
            var _a, _b;
            return ({
                id: r.id,
                ticket_id: r.ticket_id,
                user_id: r.user_id,
                authorName: ((_a = authorMap.get(r.user_id)) === null || _a === void 0 ? void 0 : _a.name) || 'Utilizador',
                message: r.message,
                created_at: r.created_at,
                isNew: usingLegacy ? false : !!r.isNew,
                role: ((_b = authorMap.get(r.user_id)) === null || _b === void 0 ? void 0 : _b.role) || 'client',
            });
        });
        try {
            if (!usingLegacy) {
                yield supabase
                    .from('ticket_responses')
                    .update({ isNew: false })
                    .eq('ticket_id', ticketId)
                    .neq('user_id', ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id) || '')
                    .eq('isNew', true);
            }
        }
        catch (_c) { }
        const result = {
            id: ticket.id,
            createdAt: ticket.createdAt,
            updatedAt: ticket.updatedAt,
            title: ticket.title,
            faultDescription: ticket.faultDescription,
            status: ticket.status,
            scheduleId: ticket.scheduleId,
            client_id: ticket.client_id,
            equipmentId: ticket.equipmentId,
            clientName,
            equipmentInfo,
            userFirstName,
            userLastName,
            responses: responsesEnriched,
        };
        // Verifica se o role está presente
        res.json(result);
    }
    catch (err) {
        console.error('Error fetching my ticket details:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.post('/api/my-tickets/:id/reply', authenticateToken, authorizeRoles(['client']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const ticketId = Number(req.params.id);
        const { message } = req.body;
        if (!ticketId || Number.isNaN(ticketId))
            return res.status(400).json({ error: 'Invalid ticket id' });
        if (!message || !message.trim())
            return res.status(400).json({ error: 'Message is required.' });
        const { data: profile, error: profileError } = yield supabase
            .from('profiles')
            .select('id, client_id, first_name, last_name')
            .eq('id', (_a = req.user) === null || _a === void 0 ? void 0 : _a.id)
            .single();
        if (profileError)
            return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
        if (!profile || !profile.client_id)
            return res.status(404).json({ error: 'Profile not found or not associated to a client.' });
        const { data: ticket, error: ticketError } = yield supabase
            .from('tickets')
            .select('id, client_id, faultDescription')
            .eq('id', ticketId)
            .single();
        if (ticketError)
            return res.status(500).json({ error: 'Failed to fetch ticket', details: ticketError.message });
        if (!ticket)
            return res.status(404).json({ error: 'Ticket not found' });
        if (ticket.client_id !== profile.client_id)
            return res.status(403).json({ error: 'Permission denied for this ticket.' });
        const author = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Cliente';
        const { data: updated, error: updateError } = yield supabase
            .from('tickets')
            .update({ updatedAt: new Date().toISOString() })
            .eq('id', ticketId)
            .select('id, title, faultDescription');
        if (updateError)
            return res.status(500).json({ error: 'Failed to update ticket', details: updateError.message });
        yield supabase
            .from('ticket_responses')
            .insert({ ticket_id: ticketId, user_id: profile.id, message: message.trim(), isNew: false, created_at: new Date().toISOString() });
        res.json((_b = updated === null || updated === void 0 ? void 0 : updated[0]) !== null && _b !== void 0 ? _b : null);
    }
    catch (err) {
        console.error('Error replying to ticket:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.put(['/api/tickets/:id/mark-as-read', '/api/my-tickets/:id/mark-as-read'], authenticateToken, authorizeRoles(['client', 'technician', 'office_staff', 'admin', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const ticketId = Number(req.params.id);
        yield supabase
            .from('ticket_responses')
            .update({ isNew: false })
            .eq('ticket_id', ticketId)
            .neq('user_id', ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || '')
            .eq('isNew', true);
        res.status(200).send('Messages marked as read');
    }
    catch (error) {
        console.error('Error marking messages as read:', error);
        res.status(500).send('Failed to mark messages as read');
    }
}));
app.get('/api/tickets/:id/attachments', authenticateToken, authorizeRoles(['client', 'admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const ticketId = Number(req.params.id);
        if (!ticketId || Number.isNaN(ticketId))
            return res.status(400).json({ error: 'Invalid ticket id' });
        const { data: attachments, error } = yield supabase
            .from('ticket_attachments')
            .select('id, ticket_id, file_name, mime_type, storage_path, uploaded_by_user_id, created_at')
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: false });
        if (error)
            return res.status(500).json({ error: 'Failed to fetch attachments', details: error.message });
        const bucket = ATTACHMENTS_BUCKET;
        const result = yield Promise.all((attachments || []).map((att) => __awaiter(void 0, void 0, void 0, function* () {
            const { data: signed, error: signedErr } = yield supabase.storage.from(bucket).createSignedUrl(att.storage_path, 3600);
            return Object.assign(Object.assign({}, att), { url: (signed === null || signed === void 0 ? void 0 : signed.signedUrl) || '' });
        })));
        res.json(result);
    }
    catch (err) {
        console.error('Error fetching attachments:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.post('/api/tickets/:id/attachments', authenticateToken, authorizeRoles(['client', 'admin', 'technician', 'office_staff', 'super_admin']), upload.single('file'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const ticketId = Number(req.params.id);
        const file = req.file;
        if (!ticketId || Number.isNaN(ticketId))
            return res.status(400).json({ error: 'Invalid ticket id' });
        if (!file)
            return res.status(400).json({ error: 'No file uploaded.' });
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
        if (file.size > MAX_FILE_SIZE) {
            return res.status(400).json({ error: 'O ficheiro é demasiado grande. Máximo 10MB.' });
        }
        const ALLOWED_TYPES = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain', 'text/csv',
            'application/zip', 'application/x-zip-compressed',
            'application/x-rar-compressed', 'application/vnd.rar',
            'application/x-7z-compressed'
        ];
        if (!ALLOWED_TYPES.includes(file.mimetype)) {
            return res.status(400).json({ error: 'Tipo de ficheiro não permitido.' });
        }
        const fileExt = file.originalname.split('.').pop();
        const fileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}.${fileExt}`;
        const filePath = `tickets/${ticketId}/${fileName}`;
        const { error: uploadError } = yield supabase.storage
            .from(ATTACHMENTS_BUCKET)
            .upload(filePath, file.buffer, {
            contentType: file.mimetype,
        });
        if (uploadError) {
            console.error('Error uploading file to Supabase Storage:', uploadError);
            return res.status(500).json({ error: 'Failed to upload file to storage', details: uploadError.message });
        }
        const { data, error } = yield supabase
            .from('ticket_attachments')
            .insert({
            ticket_id: ticketId,
            file_name: file.originalname,
            mime_type: file.mimetype,
            storage_path: filePath,
            uploaded_by_user_id: (_a = req.user) === null || _a === void 0 ? void 0 : _a.id,
        })
            .select()
            .single();
        if (error) {
            console.error('Error saving attachment metadata to database:', error);
            return res.status(500).json({ error: 'Failed to save attachment metadata', details: error.message });
        }
        res.status(201).json(data);
    }
    catch (err) {
        console.error('Error uploading attachment:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.delete('/api/tickets/:ticketId/attachments/:attachmentId', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const ticketId = Number(req.params.ticketId);
        const attachmentId = String(req.params.attachmentId);
        if (!ticketId || Number.isNaN(ticketId))
            return res.status(400).json({ error: 'Invalid ticket id' });
        if (!attachmentId)
            return res.status(400).json({ error: 'Invalid attachment id' });
        const { data: attachment, error: fetchError } = yield supabase
            .from('ticket_attachments')
            .select('id, storage_path, ticket_id')
            .eq('id', attachmentId)
            .single();
        if (fetchError)
            return res.status(500).json({ error: 'Failed to fetch attachment', details: fetchError.message });
        if (!attachment || attachment.ticket_id !== ticketId)
            return res.status(404).json({ error: 'Attachment not found' });
        const bucket = ATTACHMENTS_BUCKET;
        const { error: storageError } = yield supabase.storage.from(bucket).remove([attachment.storage_path]);
        if (storageError)
            return res.status(500).json({ error: 'Failed to delete file from storage', details: storageError.message });
        const { error: deleteError } = yield supabase
            .from('ticket_attachments')
            .delete()
            .eq('id', attachmentId)
            .eq('ticket_id', ticketId);
        if (deleteError)
            return res.status(500).json({ error: 'Failed to delete attachment record', details: deleteError.message });
        res.status(204).send();
    }
    catch (err) {
        console.error('Error deleting attachment:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
// SCHEDULES for calendar
app.get('/api/schedules', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data: schedules, error: schedulesError } = yield supabase
            .from('schedules')
            .select('*, schedule_technicians(technicianId), schedule_blocks:schedule_time_blocks(*)')
            .order('startDate', { ascending: true });
        if (schedulesError)
            return res.status(500).json({ error: 'Failed to fetch schedules', details: schedulesError.message });
        // Debug logging
        const totalBlocks = (schedules || []).reduce((acc, s) => { var _a; return acc + (((_a = s.schedule_blocks) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0);
        console.log(`[DEBUG_GET_SCHEDULES] Fetched ${schedules === null || schedules === void 0 ? void 0 : schedules.length} schedules with ${totalBlocks} total time blocks.`);
        const technicianIds = [...new Set((schedules || []).flatMap(s => (s.schedule_technicians || []).map((st) => st.technicianId)))];
        let techMap = new Map();
        if (technicianIds.length > 0) {
            const { data: profiles, error: profilesError } = yield supabase
                .from('profiles')
                .select('id, first_name, last_name, color')
                .in('id', technicianIds);
            if (!profilesError && profiles) {
                techMap = new Map(profiles.map((p) => [String(p.id), { id: p.id, name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), color: p.color }]));
            }
        }
        const clientIds = [...new Set((schedules || []).map(s => s.clientId || s.client_id || s.clientid).filter(Boolean))];
        const clientMap = new Map();
        if (clientIds.length > 0) {
            const { data: cData } = yield supabase.from('clients').select('id, name').in('id', clientIds);
            if (cData)
                cData.forEach(c => clientMap.set(String(c.id), c.name));
        }
        const equipmentIds = [...new Set((schedules || []).map(s => s.equipmentId || s.equipment_id || s.equipmentid).filter(Boolean))];
        const equipMap = new Map();
        if (equipmentIds.length > 0) {
            const { data: eData, error: eErr } = yield supabase.from('equipments').select('id, model').in('id', equipmentIds);
            if (eData)
                eData.forEach(e => equipMap.set(String(e.id), { model: e.model }));
        }
        // Buscar peças para todos os agendamentos
        const scheduleIds = (schedules || []).map(s => s.id);
        let partsMap = new Map();
        if (scheduleIds.length > 0) {
            const { data: scheduleParts, error: partsError } = yield supabase
                .from('schedule_parts')
                .select('scheduleId, partId, quantity, parts(id, reference, designation)')
                .in('scheduleId', scheduleIds);
            if (!partsError && scheduleParts) {
                scheduleParts.forEach((sp) => {
                    if (!partsMap.has(sp.scheduleId)) {
                        partsMap.set(sp.scheduleId, []);
                    }
                    partsMap.get(sp.scheduleId).push({
                        id: sp.parts.id,
                        reference: sp.parts.reference,
                        designation: sp.parts.designation,
                        quantity: sp.quantity,
                        isDesignationLocked: true
                    });
                });
            }
        }
        const result = (schedules || []).map((s) => {
            var _a;
            const cId = s.clientId || s.client_id || s.clientid;
            const eId = s.equipmentId || s.equipment_id || s.equipmentid;
            return {
                id: s.id,
                title: s.title,
                startDate: s.startDate,
                endDate: s.endDate,
                isCompleted: s.isCompleted,
                hasReport: s.hasReport,
                internalNotes: s.additionalInfo,
                serviceType: s.serviceType,
                ticketId: s.ticketId,
                clientId: cId,
                equipmentId: eId,
                technicians: (s.schedule_technicians || []).map((st) => techMap.get(String(st.technicianId))).filter(Boolean),
                clientName: clientMap.get(String(cId)) || 'Cliente Desconhecido',
                equipmentInfo: ((_a = equipMap.get(String(eId))) === null || _a === void 0 ? void 0 : _a.model) || 'Modelo Desconhecido',
                parts: partsMap.get(s.id) || [],
                acknowledgementState: s.acknowledgementState,
                timeBlocks: (s.schedule_blocks || []).map((tb) => ({
                    id: tb.id,
                    start: tb.start_time,
                    end: tb.end_time
                })),
            };
        });
        res.json(result);
    }
    catch (err) {
        console.error('Error fetching schedules:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.get('/api/schedules/:id', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { data: schedule, error: scheduleError } = yield supabase
            .from('schedules')
            .select('*, schedule_technicians(technicianId), schedule_time_blocks(*)')
            .eq('id', id)
            .single();
        if (scheduleError || !schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }
        // Fetch technicians
        const technicianIds = (schedule.schedule_technicians || []).map((st) => st.technicianId);
        let technicians = [];
        if (technicianIds.length > 0) {
            const { data: profiles, error: profilesError } = yield supabase
                .from('profiles')
                .select('id, first_name, last_name, color')
                .in('id', technicianIds);
            if (!profilesError && profiles) {
                technicians = profiles.map((p) => ({
                    id: p.id,
                    name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                    color: p.color
                }));
            }
        }
        // Fetch parts
        const { data: scheduleParts, error: partsError } = yield supabase
            .from('schedule_parts')
            .select('partId, quantity, parts(id, reference, designation)')
            .eq('scheduleId', id);
        const parts = (scheduleParts || []).map((sp) => ({
            id: sp.parts.id,
            reference: sp.parts.reference,
            designation: sp.parts.designation,
            quantity: sp.quantity,
            isDesignationLocked: true
        }));
        const cId = schedule.clientId || schedule.client_id || schedule.clientid;
        const eId = schedule.equipmentId || schedule.equipment_id || schedule.equipmentid;
        // Fetch Client Name
        let clientName = 'Cliente Desconhecido';
        if (cId) {
            const { data: cData } = yield supabase.from('clients').select('name').eq('id', cId).single();
            if (cData)
                clientName = cData.name;
        }
        // Fetch Equipment Model
        let equipmentInfo = 'Modelo Desconhecido';
        if (eId) {
            const { data: eData } = yield supabase.from('equipments').select('model').eq('id', eId).single();
            if (eData)
                equipmentInfo = eData.model;
        }
        const result = {
            id: schedule.id,
            title: schedule.title,
            startDate: schedule.startDate,
            endDate: schedule.endDate,
            isCompleted: schedule.isCompleted,
            hasReport: schedule.hasReport,
            internalNotes: schedule.additionalInfo,
            serviceType: schedule.serviceType,
            ticketId: schedule.ticketId,
            clientId: cId,
            equipmentId: eId,
            technicians,
            clientName,
            equipmentInfo,
            parts,
            acknowledgementState: schedule.acknowledgementState,
            timeBlocks: (schedule.schedule_time_blocks || []).map((tb) => ({
                id: tb.id,
                start: tb.start_time,
                end: tb.end_time
            })),
        };
        res.json(result);
    }
    catch (err) {
        console.error('Error fetching schedule by ID:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.post('/api/schedules', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { title, startDate, endDate, clientId, equipmentId, technicianIds, isCompleted, ticketId, internalNotes, serviceType, parts, timeBlocks, } = req.body;
        console.log('[DEBUG_SCHEDULES] POST /api/schedules. Body:', JSON.stringify(req.body));
        console.log('[DEBUG_SCHEDULES] POST /api/schedules. internalNotes extracted:', internalNotes);
        if (!startDate || !endDate || !clientId || !equipmentId) {
            return res.status(400).json({ error: 'startDate, endDate, clientId and equipmentId are required.' });
        }
        if (!Array.isArray(technicianIds) || technicianIds.length === 0) {
            return res.status(400).json({ error: 'At least one technician is required.' });
        }
        const { data: inserted, error: insertError } = yield supabase
            .from('schedules')
            .insert({ title: title || 'Agendamento', startDate, endDate, clientId, equipmentId, isCompleted: !!isCompleted, additionalInfo: internalNotes, serviceType, ticketId })
            .select('id, title, startDate, endDate, isCompleted, hasReport, additionalInfo, serviceType, ticketId, clientId, equipmentId, acknowledgementState')
            .single();
        if (insertError) {
            console.error('[DEBUG_SCHEDULES] POST /api/schedules. Insert error:', insertError);
            return res.status(500).json({ error: 'Failed to create schedule', details: insertError.message });
        }
        console.log('[DEBUG_SCHEDULES] POST /api/schedules. Insert success. saved additionalInfo:', inserted.additionalInfo);
        const scheduleId = inserted.id;
        // Insert Time Blocks
        if (Array.isArray(timeBlocks) && timeBlocks.length > 0) {
            const blockRows = timeBlocks.map((tb) => ({
                schedule_id: scheduleId,
                start_time: tb.start,
                end_time: tb.end
            }));
            const { error: tbError } = yield supabase.from('schedule_time_blocks').insert(blockRows);
            if (tbError)
                console.error('Error inserting time blocks:', tbError);
        }
        else {
            // Fallback
            const { error: tbError } = yield supabase.from('schedule_time_blocks').insert({
                schedule_id: scheduleId,
                start_time: startDate,
                end_time: endDate
            });
            if (tbError)
                console.error('Error inserting default time block:', tbError);
        }
        if (Array.isArray(technicianIds) && technicianIds.length > 0) {
            const techRows = technicianIds.map((tid) => ({ scheduleId, technicianId: String(tid) }));
            const { error: stError } = yield supabase.from('schedule_technicians').insert(techRows);
            if (stError)
                return res.status(500).json({ error: 'Failed to assign technicians', details: stError.message });
        }
        if (Array.isArray(parts) && parts.length > 0) {
            const partRows = [];
            for (const p of parts) {
                let partId = p.id;
                // Se a peça não tem id mas tem reference e designation, criar a peça
                if (!partId && p.reference && p.designation) {
                    console.log('[DEBUG] Creating new part:', p.reference, p.designation);
                    // Verificar se já existe uma peça com esta referência
                    const { data: existingPart, error: checkError } = yield supabase
                        .from('parts')
                        .select('id')
                        .eq('reference', p.reference)
                        .maybeSingle(); // Use maybeSingle() instead of single() to avoid error when not found
                    if (checkError) {
                        console.error('[ERROR] Error checking for existing part:', checkError);
                        return res.status(500).json({ error: 'Failed to check for existing part', details: checkError.message });
                    }
                    if (existingPart) {
                        partId = existingPart.id;
                        console.log('[DEBUG] Part already exists with id:', partId);
                    }
                    else {
                        // Criar a nova peça
                        const { data: newPart, error: createError } = yield supabase
                            .from('parts')
                            .insert({
                            reference: p.reference,
                            designation: p.designation,
                            stock_quantity: 0,
                            reserved_quantity: 0,
                            ordered_quantity: 0
                        })
                            .select('id')
                            .single();
                        if (createError) {
                            console.error('[ERROR] Failed to create part:', createError);
                            return res.status(500).json({ error: 'Failed to create part', details: createError.message });
                        }
                        partId = newPart.id;
                        console.log('[DEBUG] New part created with id:', partId);
                    }
                }
                if (partId && p.quantity > 0) {
                    partRows.push({ scheduleId, partId, quantity: Number(p.quantity) });
                }
            }
            if (partRows.length > 0) {
                const { error: spError } = yield supabase.from('schedule_parts').insert(partRows);
                if (spError)
                    return res.status(500).json({ error: 'Failed to assign parts', details: spError.message });
                // Incrementar reserved_quantity para cada peça
                for (const partRow of partRows) {
                    console.log(`[DEBUG_INV] Processing reservation for partId: ${partRow.partId}, Quantity to add: ${partRow.quantity}`);
                    const { data: currentPart, error: fetchError } = yield supabase
                        .from('parts')
                        .select('reserved_quantity, designation')
                        .eq('id', partRow.partId)
                        .single();
                    if (fetchError) {
                        console.error(`[DEBUG_INV] ERROR fetching part ${partRow.partId}:`, fetchError);
                        continue; // Continue with other parts
                    }
                    const newReservedQuantity = inventoryService.calculateNewQuantity(currentPart.reserved_quantity || 0, Number(partRow.quantity));
                    console.log(`[DEBUG_INV] Part "${currentPart.designation}" (ID: ${partRow.partId}): Current Reserved=${currentPart.reserved_quantity || 0} + Adding=${Number(partRow.quantity)} = New Reserved=${newReservedQuantity}`);
                    const { error: updateError } = yield supabase
                        .from('parts')
                        .update({ reserved_quantity: newReservedQuantity })
                        .eq('id', partRow.partId);
                    if (updateError) {
                        console.error(`[DEBUG_INV] ERROR updating part ${partRow.partId}:`, updateError);
                    }
                    else {
                        console.log(`[DEBUG_INV] SUCCESS: Updated part ${partRow.partId} reserved_quantity to ${newReservedQuantity}`);
                    }
                }
            }
        }
        if (ticketId) {
            yield supabase.from('tickets').update({ scheduleId, status: 'scheduled' }).eq('id', ticketId);
        }
        // Notificar técnicos via Telegram
        if (technicianIds && technicianIds.length > 0) {
            yield sendScheduleNotificationToTechnicians(scheduleId, technicianIds);
        }
        broadcastCalendarUpdate(scheduleId);
        const finalClientId = clientId || inserted.clientId || inserted.client_id || inserted.clientid;
        const finalEquipId = equipmentId || inserted.equipmentId || inserted.equipment_id || inserted.equipmentid;
        // Fetch additional info for the response
        let clientName = 'Cliente Desconhecido';
        if (finalClientId) {
            const { data: cData } = yield supabase.from('clients').select('name').eq('id', finalClientId).single();
            if (cData)
                clientName = cData.name;
        }
        let equipmentInfo = 'Modelo Desconhecido';
        if (finalEquipId) {
            const { data: eData } = yield supabase.from('equipments').select('model').eq('id', finalEquipId).single();
            if (eData)
                equipmentInfo = eData.model;
        }
        const result = Object.assign(Object.assign({}, inserted), { clientId: finalClientId, equipmentId: finalEquipId, internalNotes: inserted.additionalInfo, acknowledgementState: inserted.acknowledgementState, technicians: [], parts: [], clientName,
            equipmentInfo, timeBlocks: timeBlocks && timeBlocks.length > 0 ? timeBlocks.map((t) => ({ start: t.start, end: t.end })) : [{ start: startDate, end: endDate }] });
        res.status(201).json(result);
    }
    catch (err) {
        console.error('Error creating schedule:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.put('/api/schedules/:id', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const scheduleId = Number(req.params.id);
        const { title, startDate, endDate, clientId, equipmentId, technicianIds, isCompleted, ticketId, internalNotes, serviceType, parts, timeBlocks, } = req.body;
        console.log('[DEBUG_SCHEDULES] PUT /api/schedules/:id. ID:', scheduleId);
        console.log('[DEBUG_SCHEDULES] PUT /api/schedules/:id. Body:', JSON.stringify(req.body));
        console.log('[DEBUG_SCHEDULES] PUT /api/schedules/:id. internalNotes extracted:', internalNotes);
        if (!scheduleId || Number.isNaN(scheduleId))
            return res.status(400).json({ error: 'Invalid schedule id' });
        if (!startDate || !endDate || !clientId || !equipmentId) {
            return res.status(400).json({ error: 'startDate, endDate, clientId and equipmentId are required.' });
        }
        if (!Array.isArray(technicianIds) || technicianIds.length === 0) {
            return res.status(400).json({ error: 'At least one technician is required.' });
        }
        const { data: updated, error: updateError } = yield supabase
            .from('schedules')
            .update({ title: title || 'Agendamento', startDate, endDate, clientId, equipmentId, isCompleted: !!isCompleted, additionalInfo: internalNotes, serviceType, ticketId, acknowledgementState: 'pending' })
            .eq('id', scheduleId)
            .select('id, title, startDate, endDate, isCompleted, hasReport, additionalInfo, serviceType, ticketId, clientId, equipmentId, acknowledgementState')
            .single();
        if (updateError) {
            console.error('[DEBUG_SCHEDULES] PUT /api/schedules/:id. Update error:', updateError);
            return res.status(500).json({ error: 'Failed to update schedule', details: updateError.message });
        }
        console.log('[DEBUG_SCHEDULES] PUT /api/schedules/:id. Update success. saved additionalInfo:', updated.additionalInfo);
        // Update Time Blocks
        // Remove old blocks
        yield supabase.from('schedule_time_blocks').delete().eq('schedule_id', scheduleId);
        if (Array.isArray(timeBlocks) && timeBlocks.length > 0) {
            const blockRows = timeBlocks.map((tb) => ({
                schedule_id: scheduleId,
                start_time: tb.start,
                end_time: tb.end
            }));
            const { error: tbError } = yield supabase.from('schedule_time_blocks').insert(blockRows);
            if (tbError)
                console.error('Error inserting updated time blocks:', tbError);
        }
        else {
            // Fallback
            const { error: tbError } = yield supabase.from('schedule_time_blocks').insert({
                schedule_id: scheduleId,
                start_time: startDate,
                end_time: endDate
            });
            if (tbError)
                console.error('Error inserting default time block on update:', tbError);
        }
        yield supabase.from('schedule_technicians').delete().eq('scheduleId', scheduleId);
        if (Array.isArray(technicianIds) && technicianIds.length > 0) {
            const techRows = technicianIds.map((tid) => ({ scheduleId, technicianId: String(tid) }));
            const { error: stError } = yield supabase.from('schedule_technicians').insert(techRows);
            if (stError)
                return res.status(500).json({ error: 'Failed to assign technicians', details: stError.message });
        }
        // --- INVENTORY MANAGEMENT: Release old reservations ---
        const { data: oldParts } = yield supabase
            .from('schedule_parts')
            .select('partId, quantity')
            .eq('scheduleId', scheduleId);
        if (oldParts && oldParts.length > 0) {
            console.log(`[DEBUG_INV] Found ${oldParts.length} old parts to release for schedule ${scheduleId}`);
            for (const op of oldParts) {
                const { data: currentPart } = yield supabase.from('parts').select('reserved_quantity, designation').eq('id', op.partId).single();
                if (currentPart) {
                    const currentReserved = currentPart.reserved_quantity || 0;
                    const qtyToRelease = Number(op.quantity);
                    const newReserved = Math.max(0, currentReserved - qtyToRelease);
                    console.log(`[DEBUG_INV] Releasing Part "${currentPart.designation}" (ID: ${op.partId}): Current Reserved=${currentReserved} - Releasing=${qtyToRelease} = New Reserved=${newReserved}`);
                    yield supabase.from('parts').update({ reserved_quantity: newReserved }).eq('id', op.partId);
                }
                else {
                    console.warn(`[DEBUG_INV] Part ${op.partId} not found when releasing reservation.`);
                }
            }
        }
        yield supabase.from('schedule_parts').delete().eq('scheduleId', scheduleId);
        if (Array.isArray(parts) && parts.length > 0) {
            const partRows = [];
            for (const p of parts) {
                let partId = p.id;
                // Se a peça não tem id mas tem reference e designation, criar a peça
                if (!partId && p.reference && p.designation) {
                    console.log('[DEBUG] Creating new part:', p.reference, p.designation);
                    // Verificar se já existe uma peça com esta referência
                    const { data: existingPart, error: checkError } = yield supabase
                        .from('parts')
                        .select('id')
                        .eq('reference', p.reference)
                        .maybeSingle(); // Use maybeSingle() instead of single() to avoid error when not found
                    if (checkError) {
                        console.error('[ERROR] Error checking for existing part:', checkError);
                        return res.status(500).json({ error: 'Failed to check for existing part', details: checkError.message });
                    }
                    if (existingPart) {
                        partId = existingPart.id;
                        console.log('[DEBUG] Part already exists with id:', partId);
                    }
                    else {
                        // Criar a nova peça
                        const { data: newPart, error: createError } = yield supabase
                            .from('parts')
                            .insert({
                            reference: p.reference,
                            designation: p.designation,
                            stock_quantity: 0,
                            reserved_quantity: 0,
                            ordered_quantity: 0
                        })
                            .select('id')
                            .single();
                        if (createError) {
                            console.error('[ERROR] Failed to create part:', createError);
                            return res.status(500).json({ error: 'Failed to create part', details: createError.message });
                        }
                        partId = newPart.id;
                        console.log('[DEBUG] New part created with id:', partId);
                    }
                }
                if (partId && p.quantity > 0) {
                    partRows.push({ scheduleId, partId, quantity: Number(p.quantity) });
                }
            }
            if (partRows.length > 0) {
                const { error: spError } = yield supabase.from('schedule_parts').insert(partRows);
                if (spError)
                    return res.status(500).json({ error: 'Failed to assign parts', details: spError.message });
                // --- INVENTORY MANAGEMENT: Add new reservations ---
                for (const partRow of partRows) {
                    console.log(`[DEBUG_INV] PUT: Processing NEW reservation for partId: ${partRow.partId}, Quantity: ${partRow.quantity}`);
                    const { data: currentPart, error: fetchError } = yield supabase
                        .from('parts')
                        .select('reserved_quantity, designation')
                        .eq('id', partRow.partId)
                        .single();
                    if (fetchError) {
                        console.error(`[DEBUG_INV] ERROR fetching part ${partRow.partId}:`, fetchError);
                        continue;
                    }
                    const newReservedQuantity = inventoryService.calculateNewQuantity(currentPart.reserved_quantity || 0, Number(partRow.quantity));
                    console.log(`[DEBUG_INV] PUT: Part "${currentPart.designation}" (ID: ${partRow.partId}): Current Reserved=${currentPart.reserved_quantity || 0} + Adding=${Number(partRow.quantity)} = New Reserved=${newReservedQuantity}`);
                    const { error: updateError } = yield supabase
                        .from('parts')
                        .update({ reserved_quantity: newReservedQuantity })
                        .eq('id', partRow.partId);
                    if (updateError) {
                        console.error(`[DEBUG_INV] ERROR updating part ${partRow.partId}:`, updateError);
                    }
                    else {
                        console.log(`[DEBUG_INV] SUCCESS: Updated part ${partRow.partId} reserved_quantity to ${newReservedQuantity}`);
                    }
                }
            }
        }
        if (ticketId) {
            let responsibleId = null;
            const { data: existingTicket } = yield supabase
                .from('tickets')
                .select('id')
                .eq('id', ticketId)
                .single();
            if (Array.isArray(technicianIds) && technicianIds.length > 0) {
                responsibleId = String(technicianIds[0]);
            }
            yield supabase
                .from('tickets')
                .update({ scheduleId, status: isCompleted ? 'closed' : 'scheduled', scheduled_at: startDate })
                .eq('id', ticketId);
        }
        // Notificar técnicos sobre atualização (opcional, mas recomendado)
        if (technicianIds && technicianIds.length > 0 && !isCompleted) {
            yield sendScheduleNotificationToTechnicians(scheduleId, technicianIds, true);
        }
        // Fetch additional info for the response
        const cIdToFetch = clientId || updated.clientId || updated.client_id || updated.clientid;
        let clientName = 'Cliente Desconhecido';
        if (cIdToFetch) {
            const { data: cData } = yield supabase.from('clients').select('name').eq('id', cIdToFetch).single();
            if (cData)
                clientName = cData.name;
        }
        const eIdToFetch = equipmentId || updated.equipmentId || updated.equipment_id || updated.equipmentid;
        let equipmentInfo = 'Modelo Desconhecido';
        if (eIdToFetch) {
            const { data: eData } = yield supabase.from('equipments').select('model').eq('id', eIdToFetch).single();
            if (eData)
                equipmentInfo = eData.model;
        }
        const finalObject = Object.assign(Object.assign({}, updated), { internalNotes: updated.additionalInfo, acknowledgementState: updated.acknowledgementState || 'pending', clientName,
            equipmentInfo, timeBlocks: timeBlocks && timeBlocks.length > 0 ? timeBlocks.map((t) => ({ start: t.start, end: t.end })) : [{ start: startDate, end: endDate }] });
        broadcastCalendarUpdate(scheduleId);
        res.json(finalObject);
    }
    catch (err) {
        console.error('Error updating schedule:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.post('/api/schedules/:id/complete', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const scheduleId = Number(req.params.id);
        const { title, startDate, endDate, clientId, equipmentId, technicianIds, ticketId, internalNotes, serviceType, parts, } = req.body;
        if (!scheduleId || Number.isNaN(scheduleId))
            return res.status(400).json({ error: 'Invalid schedule id' });
        if (!Array.isArray(technicianIds) || technicianIds.length === 0) {
            return res.status(400).json({ error: 'At least one technician is required.' });
        }
        const { data: updated, error: updateError } = yield supabase
            .from('schedules')
            .update({ title, startDate, endDate, clientId, equipmentId, isCompleted: true, additionalInfo: internalNotes, serviceType })
            .eq('id', scheduleId)
            .select('id, title, startDate, endDate, isCompleted, hasReport, additionalInfo, serviceType, ticketId, clientId, equipmentId')
            .single();
        if (updateError)
            return res.status(500).json({ error: 'Failed to complete schedule', details: updateError.message });
        yield supabase.from('schedule_technicians').delete().eq('scheduleId', scheduleId);
        if (Array.isArray(technicianIds) && technicianIds.length > 0) {
            const techRows = technicianIds.map((tid) => ({ scheduleId, technicianId: String(tid) }));
            const { error: stError } = yield supabase.from('schedule_technicians').insert(techRows);
            if (stError)
                return res.status(500).json({ error: 'Failed to assign technicians', details: stError.message });
        }
        // --- INVENTORY MANAGEMENT: Release old reservations ---
        const { data: oldParts } = yield supabase
            .from('schedule_parts')
            .select('partId, quantity')
            .eq('scheduleId', scheduleId);
        if (oldParts && oldParts.length > 0) {
            for (const op of oldParts) {
                const { data: currentPart } = yield supabase.from('parts').select('reserved_quantity').eq('id', op.partId).single();
                if (currentPart) {
                    const newReserved = inventoryService.calculateNewQuantity(currentPart.reserved_quantity || 0, -op.quantity);
                    yield supabase.from('parts').update({ reserved_quantity: newReserved }).eq('id', op.partId);
                }
            }
        }
        yield supabase.from('schedule_parts').delete().eq('scheduleId', scheduleId);
        if (Array.isArray(parts) && parts.length > 0) {
            const partRows = [];
            for (const p of parts) {
                let partId = p.id;
                // Se a peça não tem id mas tem reference e designation, criar a peça
                if (!partId && p.reference && p.designation) {
                    console.log('[DEBUG] Creating new part:', p.reference, p.designation);
                    // Verificar se já existe uma peça com esta referência
                    const { data: existingPart, error: checkError } = yield supabase
                        .from('parts')
                        .select('id')
                        .eq('reference', p.reference)
                        .maybeSingle(); // Use maybeSingle() instead of single() to avoid error when not found
                    if (checkError) {
                        console.error('[ERROR] Error checking for existing part:', checkError);
                        return res.status(500).json({ error: 'Failed to check for existing part', details: checkError.message });
                    }
                    if (existingPart) {
                        partId = existingPart.id;
                        console.log('[DEBUG] Part already exists with id:', partId);
                    }
                    else {
                        // Criar a nova peça
                        const { data: newPart, error: createError } = yield supabase
                            .from('parts')
                            .insert({
                            reference: p.reference,
                            designation: p.designation,
                            stock_quantity: 0,
                            reserved_quantity: 0,
                            ordered_quantity: 0
                        })
                            .select('id')
                            .single();
                        if (createError) {
                            console.error('[ERROR] Failed to create part:', createError);
                            return res.status(500).json({ error: 'Failed to create part', details: createError.message });
                        }
                        partId = newPart.id;
                        console.log('[DEBUG] New part created with id:', partId);
                    }
                }
                if (partId && p.quantity > 0) {
                    partRows.push({ scheduleId, partId, quantity: Number(p.quantity) });
                }
            }
            if (partRows.length > 0) {
                const { error: spError } = yield supabase.from('schedule_parts').insert(partRows);
                if (spError)
                    return res.status(500).json({ error: 'Failed to assign parts', details: spError.message });
                // --- INVENTORY MANAGEMENT: Add new reservations ---
                for (const partRow of partRows) {
                    const { data: currentPart, error: fetchError } = yield supabase
                        .from('parts')
                        .select('reserved_quantity')
                        .eq('id', partRow.partId)
                        .single();
                    if (fetchError) {
                        console.error('[ERROR] Failed to fetch part for reservation:', fetchError);
                        continue;
                    }
                    const newReservedQuantity = inventoryService.calculateNewQuantity(currentPart.reserved_quantity || 0, Number(partRow.quantity));
                    const { error: updateError } = yield supabase
                        .from('parts')
                        .update({ reserved_quantity: newReservedQuantity })
                        .eq('id', partRow.partId);
                    if (updateError) {
                        console.error('[ERROR] Failed to update reserved quantity:', updateError);
                    }
                }
            }
        }
        if (ticketId) {
            let responsibleId = null;
            const { data: existingTicket } = yield supabase
                .from('tickets')
                .select('id')
                .eq('id', ticketId)
                .single();
            if (Array.isArray(technicianIds) && technicianIds.length > 0) {
                responsibleId = String(technicianIds[0]);
            }
            yield supabase
                .from('tickets')
                .update({ scheduleId, status: 'closed', scheduled_at: startDate })
                .eq('id', ticketId);
        }
        broadcastCalendarUpdate(scheduleId);
        res.json(Object.assign(Object.assign({}, updated), { internalNotes: updated.additionalInfo }));
    }
    catch (err) {
        console.error('Error completing schedule:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.delete('/api/schedules/:id', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const scheduleId = Number(req.params.id);
        if (!scheduleId || Number.isNaN(scheduleId))
            return res.status(400).json({ error: 'Invalid schedule id' });
        // 1. Fetch details necessary for notification BEFORE deletion
        const { data: schedule, error: scheduleError } = yield supabase
            .from('schedules')
            .select('title, startDate, endDate, clients(name), schedule_technicians(technicianId)')
            .eq('id', scheduleId)
            .single();
        if (scheduleError)
            return res.status(500).json({ error: 'Failed to fetch schedule', details: scheduleError.message });
        if (!schedule)
            return res.status(404).json({ error: 'Schedule not found' });
        const techIds = (schedule.schedule_technicians || []).map((st) => st.technicianId);
        const clientName = Array.isArray(schedule.clients) ? (_a = schedule.clients[0]) === null || _a === void 0 ? void 0 : _a.name : ((_b = schedule.clients) === null || _b === void 0 ? void 0 : _b.name) || 'Cliente Desconhecido';
        const startDate = new Date(schedule.startDate).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
        const endDate = new Date(schedule.endDate).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
        const { error: stDelError } = yield supabase.from('schedule_technicians').delete().eq('scheduleId', scheduleId);
        if (stDelError)
            return res.status(500).json({ error: 'Failed to delete schedule technicians', details: stDelError.message });
        // --- INVENTORY MANAGEMENT: Release reservations before deleting ---
        const { data: oldParts } = yield supabase
            .from('schedule_parts')
            .select('partId, quantity')
            .eq('scheduleId', scheduleId);
        if (oldParts && oldParts.length > 0) {
            for (const op of oldParts) {
                const { data: currentPart } = yield supabase.from('parts').select('reserved_quantity').eq('id', op.partId).single();
                if (currentPart) {
                    const newReserved = inventoryService.calculateNewQuantity(currentPart.reserved_quantity || 0, -op.quantity);
                    yield supabase.from('parts').update({ reserved_quantity: newReserved }).eq('id', op.partId);
                    console.log(`[DEBUG] Released reservation of ${op.quantity} for part ${op.partId}`);
                }
            }
        }
        const { error: spDelError } = yield supabase.from('schedule_parts').delete().eq('scheduleId', scheduleId);
        if (spDelError)
            return res.status(500).json({ error: 'Failed to delete schedule parts', details: spDelError.message });
        const { error: ticketUpdateError } = yield supabase
            .from('tickets')
            .update({ scheduleId: null, status: 'open', scheduled_at: null })
            .eq('scheduleId', scheduleId);
        if (ticketUpdateError)
            return res.status(500).json({ error: 'Failed to update related ticket', details: ticketUpdateError.message });
        const { error: scheduleDelError } = yield supabase.from('schedules').delete().eq('id', scheduleId);
        if (scheduleDelError)
            return res.status(500).json({ error: 'Failed to delete schedule', details: scheduleDelError.message });
        broadcastCalendarUpdate(scheduleId);
        // --- NOTIFICATION OF DELETION ---
        try {
            let query = supabase.from('profiles').select('id, telegramchatid, role');
            if (techIds.length > 0) {
                query = query.or(`id.in.(${techIds.map((t) => `"${t}"`).join(',')}),role.eq.admin`);
            }
            else {
                query = query.eq('role', 'admin');
            }
            const { data: profiles } = yield query;
            if (profiles && profiles.length > 0) {
                const message = `❌ *Agendamento Cancelado*\n\n*Título:* ${schedule.title}\n*Cliente:* ${clientName}\n*Início:* ${startDate}\n*Fim:* ${endDate}\n\n_Este agendamento foi removido do sistema._`;
                for (const p of profiles) {
                    if (p.telegramchatid) {
                        yield sendTelegramNotification(message, p.telegramchatid);
                    }
                }
            }
        }
        catch (notifErr) {
            console.error('Error sending deletion notifications:', notifErr);
            // Suppress error so it doesn't fail the deletion response
        }
        res.status(204).send();
    }
    catch (err) {
        console.error('Error deleting schedule:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.get('/api/equipments', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const search = req.query.search;
        let query = supabase
            .from('equipments')
            .select('id, brand, model, serialNumber, clients(name)')
            .order('id', { ascending: true });
        if (search) {
            // Using 'or' to search across multiple columns
            query = query.or(`brand.ilike.%${search}%,model.ilike.%${search}%,serialNumber.ilike.%${search}%`);
        }
        const { data, error } = yield query;
        if (error)
            return res.status(500).json({ error: 'Failed to fetch equipments', details: error.message });
        const result = (data || []).map((e) => {
            var _a, _b;
            return ({
                id: e.id,
                brand: e.brand,
                model: e.model,
                serialNumber: e.serialNumber,
                clientName: Array.isArray(e.clients) ? (_a = e.clients[0]) === null || _a === void 0 ? void 0 : _a.name : ((_b = e.clients) === null || _b === void 0 ? void 0 : _b.name) || 'Cliente Desconhecido',
            });
        });
        res.json(result);
    }
    catch (err) {
        console.error('Error fetching equipments:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.get('/api/clients/:id/equipments', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const clientIdParam = Number(req.params.id);
    if (!clientIdParam || Number.isNaN(clientIdParam)) {
        return res.status(400).json({ error: 'Invalid client id' });
    }
    try {
        const { data, error } = yield supabase
            .from('equipments')
            .select('id, brand, model, serialNumber, clients(name)')
            .eq('clientId', clientIdParam)
            .order('id', { ascending: true });
        if (error)
            return res.status(500).json({ error: 'Failed to fetch client equipments', details: error.message });
        const result = (data || []).map((e) => {
            var _a, _b;
            return ({
                id: e.id,
                brand: e.brand,
                model: e.model,
                serialNumber: e.serialNumber,
                clientName: Array.isArray(e.clients) ? (_a = e.clients[0]) === null || _a === void 0 ? void 0 : _a.name : ((_b = e.clients) === null || _b === void 0 ? void 0 : _b.name) || 'Cliente Desconhecido',
            });
        });
        res.json(result);
    }
    catch (err) {
        console.error('Error fetching client equipments:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.put('/api/equipments/:id', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { id } = req.params;
    const { brand, model, serialNumber, clientId } = req.body;
    if (!brand || !model || !serialNumber || !clientId) {
        return res.status(400).json({ error: 'brand, model, serialNumber and clientId are required.' });
    }
    try {
        const { data, error } = yield supabase
            .from('equipments')
            .update({ brand, model, serialNumber, clientId })
            .eq('id', id)
            .select('id, brand, model, serialNumber, clients(name)');
        if (error)
            return res.status(500).json({ error: 'Failed to update equipment', details: error.message });
        const updated = data === null || data === void 0 ? void 0 : data[0];
        const responseBody = updated ? {
            id: updated.id,
            brand: updated.brand,
            model: updated.model,
            serialNumber: updated.serialNumber,
            clientName: Array.isArray(updated.clients) ? (_a = updated.clients[0]) === null || _a === void 0 ? void 0 : _a.name : ((_b = updated.clients) === null || _b === void 0 ? void 0 : _b.name) || 'Cliente Desconhecido',
        } : null;
        res.json(responseBody);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.delete('/api/equipments/:id', authenticateToken, authorizeRoles(['admin', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const { error } = yield supabase
            .from('equipments')
            .delete()
            .eq('id', id);
        if (error)
            return res.status(500).json({ error: 'Failed to delete equipment', details: error.message });
        res.sendStatus(204);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.post('/api/equipments', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { brand, model, serialNumber, clientId } = req.body;
    if (!brand || !model || !serialNumber || !clientId) {
        return res.status(400).json({ error: 'brand, model, serialNumber and clientId are required.' });
    }
    try {
        const { data: client, error: clientError } = yield supabase
            .from('clients')
            .select('id')
            .eq('id', clientId)
            .single();
        if (clientError || !client)
            return res.status(404).json({ error: 'Client not found.' });
        const { data, error } = yield supabase
            .from('equipments')
            .insert({ brand, model, serialNumber, clientId })
            .select('id, brand, model, serialNumber, clients(name)');
        if (error)
            return res.status(500).json({ error: 'Failed to create equipment', details: error.message });
        const created = data === null || data === void 0 ? void 0 : data[0];
        const responseBody = created ? {
            id: created.id,
            brand: created.brand,
            model: created.model,
            serialNumber: created.serialNumber,
            clientName: Array.isArray(created.clients) ? (_a = created.clients[0]) === null || _a === void 0 ? void 0 : _a.name : ((_b = created.clients) === null || _b === void 0 ? void 0 : _b.name) || 'Cliente Desconhecido',
        } : null;
        res.status(201).json(responseBody);
    }
    catch (err) {
        console.error('Error creating equipment:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
// INVENTORY
app.get('/api/inventory', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data, error } = yield supabase
            .from('parts')
            .select('id, reference, designation, stock_quantity, reserved_quantity, ordered_quantity')
            .order('designation', { ascending: true });
        if (error)
            return res.status(500).json({ error: 'Failed to fetch inventory', details: error.message });
        res.json(data !== null && data !== void 0 ? data : []);
    }
    catch (err) {
        console.error('Error fetching inventory:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.post('/api/inventory', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { reference, designation, stock_quantity, reserved_quantity, ordered_quantity } = req.body;
        if (!reference || !designation) {
            return res.status(400).json({ error: 'Reference and designation are required.' });
        }
        const { data, error } = yield supabase
            .from('parts')
            .insert([{ reference, designation, stock_quantity: stock_quantity || 0, reserved_quantity: reserved_quantity || 0, ordered_quantity: ordered_quantity || 0 }])
            .select('id, reference, designation, stock_quantity, reserved_quantity, ordered_quantity')
            .single();
        if (error) {
            console.error('Error adding inventory item:', error);
            return res.status(500).json({ error: 'Failed to add inventory item', details: error.message });
        }
        res.status(201).json(data);
    }
    catch (err) {
        console.error('Error adding inventory item:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.put('/api/inventory/:id/stock', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const partId = req.params.id;
        const { quantity, fromOrder } = req.body; // quantity can be positive (add) or negative (remove)
        if (!partId || typeof quantity !== 'number') {
            return res.status(400).json({ error: 'Part ID and quantity are required.' });
        }
        const { data: currentPart, error: fetchError } = yield supabase
            .from('parts')
            .select('stock_quantity, ordered_quantity')
            .eq('id', partId)
            .single();
        if (fetchError || !currentPart) {
            console.error('Error fetching current part for stock update:', fetchError);
            return res.status(404).json({ error: 'Part not found.' });
        }
        const { newStock: newStockQuantity, newOrdered: newOrderedQuantity } = inventoryService.processStockUpdate(currentPart.stock_quantity, currentPart.ordered_quantity, quantity, !!fromOrder);
        const { data, error } = yield supabase
            .from('parts')
            .update({ stock_quantity: newStockQuantity, ordered_quantity: newOrderedQuantity })
            .eq('id', partId)
            .select('id, reference, designation, stock_quantity, reserved_quantity, ordered_quantity')
            .single();
        if (error) {
            console.error('Error updating stock quantity:', error);
            return res.status(500).json({ error: 'Failed to update stock quantity', details: error.message });
        }
        res.json(data);
    }
    catch (err) {
        console.error('Error updating stock quantity:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.put('/api/inventory/:id/order', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const partId = req.params.id;
        const { quantity } = req.body;
        if (!partId || typeof quantity !== 'number' || quantity <= 0) {
            return res.status(400).json({ error: 'Part ID and a positive quantity are required.' });
        }
        const { data: currentPart, error: fetchError } = yield supabase
            .from('parts')
            .select('ordered_quantity')
            .eq('id', partId)
            .single();
        if (fetchError || !currentPart) {
            console.error('Error fetching current part for order update:', fetchError);
            return res.status(404).json({ error: 'Part not found.' });
        }
        const newOrderedQuantity = inventoryService.calculateNewQuantity(currentPart.ordered_quantity, quantity);
        const { data, error } = yield supabase
            .from('parts')
            .update({ ordered_quantity: newOrderedQuantity })
            .eq('id', partId)
            .select('id, reference, designation, stock_quantity, reserved_quantity, ordered_quantity')
            .single();
        if (error) {
            console.error('Error updating ordered quantity:', error);
            return res.status(500).json({ error: 'Failed to update ordered quantity', details: error.message });
        }
        res.json(data);
    }
    catch (err) {
        console.error('Error updating ordered quantity:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.get('/api/inventory/:id/reservations', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const partId = req.params.id;
        const { data, error } = yield supabase
            .from('schedule_parts')
            .select('quantity, schedules(id, title, startDate, isCompleted, clients(name))')
            .eq('partId', partId)
            .eq('schedules.isCompleted', false);
        if (error) {
            console.error('Error fetching part reservations:', error);
            return res.status(500).json({ error: 'Failed to fetch reservations', details: error.message });
        }
        // Filter out null schedules 
        const reservations = (data || [])
            .filter((item) => item.schedules)
            .map((item) => {
            var _a;
            return ({
                scheduleId: item.schedules.id,
                title: item.schedules.title,
                startDate: item.schedules.startDate,
                clientName: ((_a = item.schedules.clients) === null || _a === void 0 ? void 0 : _a.name) || 'Cliente Desconhecido',
                quantityReserved: item.quantity
            });
        });
        res.json(reservations);
    }
    catch (err) {
        console.error('Error fetching part reservations:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
// GET PART BY REFERENCE - usado no modal de agendamento para autocompletar designação
app.get('/api/parts/:reference', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const reference = req.params.reference;
        if (!reference) {
            return res.status(400).json({ error: 'Reference is required.' });
        }
        const { data, error } = yield supabase
            .from('parts')
            .select('id, reference, designation')
            .eq('reference', reference)
            .single();
        if (error) {
            if (error.code === 'PGRST116') {
                // No rows found
                return res.status(404).json({ error: 'Part not found.' });
            }
            console.error('Error fetching part by reference:', error);
            return res.status(500).json({ error: 'Failed to fetch part', details: error.message });
        }
        res.json(data);
    }
    catch (err) {
        console.error('Error fetching part by reference:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
// TICKETS LIST BY STATUS
app.get('/api/tickets', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const status = req.query.status || 'open';
    try {
        const { data: tickets, error: ticketsError } = yield supabase
            .from('tickets')
            .select('id, createdAt, updatedAt, faultDescription, status, scheduleId, client_id, equipmentId')
            .eq('status', status)
            .order('createdAt', { ascending: false });
        if (ticketsError)
            return res.status(500).json({ error: 'Failed to fetch tickets', details: ticketsError.message });
        const clientIds = [...new Set((tickets || []).map(t => t.client_id).filter(Boolean))];
        const equipmentIds = [...new Set((tickets || []).map(t => t.equipmentId).filter(Boolean))];
        let clientMap = new Map();
        if (clientIds.length > 0) {
            const { data: clients, error: clientsError } = yield supabase
                .from('clients')
                .select('id, name')
                .in('id', clientIds);
            if (!clientsError && clients) {
                clientMap = new Map(clients.map(c => [c.id, c.name]));
            }
        }
        let equipmentMap = new Map();
        if (equipmentIds.length > 0) {
            const { data: equipments, error: equipmentsError } = yield supabase
                .from('equipments')
                .select('id, brand, model, serialNumber')
                .in('id', equipmentIds);
            if (!equipmentsError && equipments) {
                equipmentMap = new Map(equipments.map(e => [e.id, { brand: e.brand, model: e.model, serialNumber: e.serialNumber }]));
            }
        }
        const result = (tickets || []).map(t => {
            const clientName = clientMap.get(t.client_id) || 'Cliente Desconhecido';
            const e = equipmentMap.get(t.equipmentId);
            const equipmentInfo = e ? `${e.brand || ''} ${e.model || ''}${e.serialNumber ? ` (${e.serialNumber})` : ''}`.trim() : 'Equipamento Desconhecido';
            return {
                id: t.id,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt,
                faultDescription: t.faultDescription,
                status: t.status,
                scheduleId: t.scheduleId,
                client_id: t.client_id,
                equipmentId: t.equipmentId,
                clientName,
                equipmentInfo,
            };
        });
        res.json(result);
    }
    catch (err) {
        console.error('Error fetching tickets:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.get('/api/tickets/:id', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const ticketId = Number(req.params.id);
        if (!ticketId || Number.isNaN(ticketId))
            return res.status(400).json({ error: 'Invalid ticket id' });
        const { data: ticket, error: ticketError } = yield supabase
            .from('tickets')
            .select('id, createdAt, updatedAt, title, faultDescription, status, scheduleId, client_id, equipmentId, created_by_user_id')
            .eq('id', ticketId)
            .single();
        if (ticketError)
            return res.status(500).json({ error: 'Failed to fetch ticket', details: ticketError.message });
        if (!ticket)
            return res.status(404).json({ error: 'Ticket not found' });
        let clientName = 'Cliente Desconhecido';
        {
            const { data: client, error: clientError } = yield supabase
                .from('clients')
                .select('id, name')
                .eq('id', ticket.client_id)
                .single();
            if (!clientError && client) {
                clientName = client.name || clientName;
            }
        }
        let equipmentInfo = 'Equipamento Desconhecido';
        {
            const { data: equipment, error: equipmentError } = yield supabase
                .from('equipments')
                .select('id, brand, model, serialNumber')
                .eq('id', ticket.equipmentId)
                .single();
            if (!equipmentError && equipment) {
                equipmentInfo = `${equipment.brand || ''} ${equipment.model || ''}${equipment.serialNumber ? ` (${equipment.serialNumber})` : ''}`.trim();
            }
        }
        let userFirstName = '';
        let userLastName = '';
        {
            const { data: userProfile } = yield supabase
                .from('profiles')
                .select('first_name, last_name')
                .eq('id', ticket.created_by_user_id)
                .single();
            if (userProfile) {
                userFirstName = userProfile.first_name || '';
                userLastName = userProfile.last_name || '';
            }
        }
        const { data: attachments, error: attachError } = yield supabase
            .from('ticket_attachments')
            .select('id, ticket_id, file_name, mime_type, storage_path, uploaded_by_user_id, created_at')
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: false });
        if (attachError)
            return res.status(500).json({ error: 'Failed to fetch attachments', details: attachError.message });
        const bucket = ATTACHMENTS_BUCKET;
        const enriched = yield Promise.all((attachments || []).map((att) => __awaiter(void 0, void 0, void 0, function* () {
            const { data: signed } = yield supabase.storage.from(bucket).createSignedUrl(att.storage_path, 3600);
            return Object.assign(Object.assign({}, att), { url: (signed === null || signed === void 0 ? void 0 : signed.signedUrl) || '' });
        })));
        let responses = [];
        let usingLegacy = false;
        {
            const { data, error } = yield supabase
                .from('ticket_responses')
                .select('id, ticket_id, user_id, message, created_at, isNew, profiles(role)')
                .eq('ticket_id', ticketId)
                .order('created_at', { ascending: true });
            if (error) {
                const { data: legacyData, error: legacyErr } = yield supabase
                    .from('ticket_responses')
                    .select('id, ticket_id, user_id, message, created_at')
                    .eq('ticket_id', ticketId)
                    .order('created_at', { ascending: true });
                if (legacyErr)
                    return res.status(500).json({ error: 'Failed to fetch responses', details: legacyErr.message });
                responses = legacyData || [];
                usingLegacy = true;
            }
            else {
                responses = data || [];
            }
        }
        const authorIds = [...new Set((responses || []).map((r) => r.user_id).filter(Boolean))];
        let authorMap = new Map();
        if (authorIds.length > 0) {
            const { data: profilesList, error: profErr } = yield supabase
                .from('profiles')
                .select('id, first_name, last_name, role')
                .in('id', authorIds);
            if (!profErr && profilesList) {
                authorMap = new Map(profilesList.map((p) => [p.id, { name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), role: p.role || 'client' }]));
            }
        }
        const responsesEnriched = (responses || []).map((r) => {
            var _a, _b;
            return ({
                id: r.id,
                ticket_id: r.ticket_id,
                user_id: r.user_id,
                authorName: ((_a = authorMap.get(r.user_id)) === null || _a === void 0 ? void 0 : _a.name) || 'Utilizador',
                message: r.message,
                created_at: r.created_at,
                isNew: usingLegacy ? false : !!r.isNew,
                role: ((_b = authorMap.get(r.user_id)) === null || _b === void 0 ? void 0 : _b.role) || 'client',
            });
        });
        const result = {
            id: ticket.id,
            createdAt: ticket.createdAt,
            updatedAt: ticket.updatedAt,
            title: ticket.title,
            faultDescription: ticket.faultDescription,
            status: ticket.status,
            scheduleId: ticket.scheduleId,
            client_id: ticket.client_id,
            equipmentId: ticket.equipmentId,
            clientName,
            equipmentInfo,
            userFirstName,
            userLastName,
            attachments: enriched,
            responses: responsesEnriched,
        };
        res.json(result);
    }
    catch (err) {
        console.error('Error fetching ticket details:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.post('/api/tickets/:id/reply', authenticateToken, authorizeRoles(['admin', 'technician', 'office_staff', 'super_admin']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const ticketId = Number(req.params.id);
        const { message } = req.body;
        if (!ticketId || Number.isNaN(ticketId))
            return res.status(400).json({ error: 'Invalid ticket id' });
        if (!message || !message.trim())
            return res.status(400).json({ error: 'Message is required.' });
        const { data: profile, error: profileError } = yield supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .eq('id', (_a = req.user) === null || _a === void 0 ? void 0 : _a.id)
            .single();
        if (profileError)
            return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
        const { data: ticket, error: ticketError } = yield supabase
            .from('tickets')
            .select('id, faultDescription')
            .eq('id', ticketId)
            .single();
        if (ticketError)
            return res.status(500).json({ error: 'Failed to fetch ticket', details: ticketError.message });
        if (!ticket)
            return res.status(404).json({ error: 'Ticket not found' });
        const { data: updated, error: updateError } = yield supabase
            .from('tickets')
            .update({ updatedAt: new Date().toISOString() })
            .eq('id', ticketId)
            .select('id, title, faultDescription');
        if (updateError)
            return res.status(500).json({ error: 'Failed to update ticket', details: updateError.message });
        yield supabase
            .from('ticket_responses')
            .insert({ ticket_id: ticketId, user_id: profile === null || profile === void 0 ? void 0 : profile.id, message: message.trim(), isNew: true, created_at: new Date().toISOString() });
        yield markLastClientMessageAsRead(ticketId);
        res.json((_b = updated === null || updated === void 0 ? void 0 : updated[0]) !== null && _b !== void 0 ? _b : null);
    }
    catch (err) {
        console.error('Error replying to ticket (manager):', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.delete('/admin/tickets/:id', authenticateToken, authorizeRoles(['admin', 'technician']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const ticketId = Number(req.params.id);
        if (!ticketId || Number.isNaN(ticketId))
            return res.status(400).json({ error: 'Invalid ticket id' });
        const { data: ticket, error: ticketError } = yield supabase
            .from('tickets')
            .select('id, status')
            .eq('id', ticketId)
            .single();
        if (ticketError)
            return res.status(500).json({ error: 'Failed to fetch ticket', details: ticketError.message });
        if (!ticket)
            return res.status(404).json({ error: 'Ticket not found' });
        const { data: updated, error: updateError } = yield supabase
            .from('tickets')
            .update({ status: 'deleted', updatedAt: new Date().toISOString() })
            .eq('id', ticketId)
            .select('id, status')
            .single();
        if (updateError)
            return res.status(500).json({ error: 'Failed to delete ticket', details: updateError.message });
        res.json(updated);
    }
    catch (err) {
        console.error('Error deleting ticket:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.get('/api/equipments/:id/history', authenticateToken, authorizeRoles(['admin', 'technician', 'client']), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const equipmentId = Number(req.params.id);
    if (!equipmentId || Number.isNaN(equipmentId)) {
        return res.status(400).json({ error: 'Invalid equipment id' });
    }
    try {
        const { data: equipment, error: equipmentError } = yield supabase
            .from('equipments')
            .select('id, brand, model, serialNumber, clientId')
            .eq('id', equipmentId)
            .single();
        if (equipmentError)
            return res.status(500).json({ error: 'Failed to fetch equipment details', details: equipmentError.message });
        if (!equipment)
            return res.status(404).json({ error: 'Equipment not found' });
        const userRole = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.user_metadata) === null || _b === void 0 ? void 0 : _b.role;
        if (userRole === 'client') {
            const { data: profile, error: profileError } = yield supabase
                .from('profiles')
                .select('id, client_id')
                .eq('id', (_c = req.user) === null || _c === void 0 ? void 0 : _c.id)
                .single();
            if (profileError)
                return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
            if (!profile || profile.client_id !== equipment.clientId) {
                return res.status(403).json({ error: 'Permission denied for this equipment.' });
            }
        }
        let clientName = 'Cliente Desconhecido';
        {
            const { data: client, error: clientError } = yield supabase
                .from('clients')
                .select('id, name')
                .eq('id', equipment.clientId)
                .single();
            if (!clientError && client) {
                clientName = client.name || clientName;
            }
        }
        const { data: tickets, error: ticketsError } = yield supabase
            .from('tickets')
            .select('id, createdAt, faultDescription, status')
            .eq('equipmentId', equipmentId)
            .order('createdAt', { ascending: false });
        if (ticketsError)
            return res.status(500).json({ error: 'Failed to fetch tickets', details: ticketsError.message });
        const { data: schedules, error: schedulesError } = yield supabase
            .from('schedules')
            .select('id, title, startDate, isCompleted')
            .eq('equipmentId', equipmentId)
            .order('startDate', { ascending: false });
        if (schedulesError)
            return res.status(500).json({ error: 'Failed to fetch schedules', details: schedulesError.message });
        const schedulesResult = (schedules || []).map((s) => ({
            id: s.id,
            title: s.title,
            startDate: s.startDate,
            isCompleted: s.isCompleted,
            technicians: [],
        }));
        const { data: reports, error: reportsError } = yield supabase
            .from('reports')
            .select('id, serviceDate, hours, description')
            .eq('equipmentId', equipmentId)
            .order('serviceDate', { ascending: false });
        if (reportsError)
            return res.status(500).json({ error: 'Failed to fetch reports', details: reportsError.message });
        const details = {
            id: equipment.id,
            brand: equipment.brand,
            model: equipment.model,
            serialNumber: equipment.serialNumber,
            clientId: equipment.clientId,
            clientName,
        };
        res.json({
            details,
            tickets: tickets || [],
            schedules: schedulesResult,
            reports: reports || [],
        });
    }
    catch (err) {
        console.error('Error fetching equipment history:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}));
app.use((err, req, res, next) => {
    console.error('Global error handler:', err.stack);
    res.status(500).json({ error: 'Internal server error', details: err.message });
});
// --- INICIAR SERVIDOR ---
if (process.env.NODE_ENV !== 'test') {
    app.listen(port, () => __awaiter(void 0, void 0, void 0, function* () {
        console.log(`Server is running on http://localhost:${port}`);
        scheduleTicketCheck();
        yield getBotInfo();
    }));
}
