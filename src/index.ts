import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import axios from 'axios';
import * as cron from 'node-cron';
import multer from 'multer';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as inventoryService from './services/inventoryService';

dotenv.config();

// --- SUPABASE CLIENT INITIALIZATION ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Supabase URL or Service Key not defined in environment variables.");
  process.exit(1);
}
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey);
console.log('Server initialization with Supabase client.');

const ATTACHMENTS_BUCKET = process.env.SUPABASE_TICKET_ATTACHMENTS_BUCKET || 'ticket-attachments';

// --- TELEGRAM NOTIFICATION FUNCTION ---
const sendTelegramNotification = async (message: string, chatId?: string, replyMarkup?: any) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID;
  if (!token || !targetChatId) return;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    await axios.post(url, { chat_id: targetChatId, text: message, parse_mode: 'Markdown', reply_markup: replyMarkup });
  } catch (error: any) {
    console.error('Error sending Telegram notification:', error.response?.data || error.message);
  }
};

// --- REALTIME BROADCAST HELPER ---
const broadcastCalendarUpdate = (scheduleId?: number | string) => {
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

async function handleTelegramUpdate(update: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  // 1. Lógica de Associação (/start [UUID])
  if (update.message && update.message.text) {
    const text = update.message.text;
    const chatId = update.message.chat.id;

    if (text.startsWith('/start ')) {
      const profileId = text.split(' ')[1];
      if (profileId) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(profileId)) {
          const { error } = await supabase
            .from('profiles')
            .update({ telegramchatid: chatId.toString() })
            .eq('id', profileId);

          if (!error) {
            await sendTelegramNotification('✅ Conta associada com sucesso! Agora irá receber notificações neste chat.', chatId.toString());
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
      const { error } = await supabase
        .from('schedules')
        .update({ acknowledgementState: newState })
        .eq('id', scheduleId);

      if (error) {
        console.error(`[TELEGRAM DEBUG] Supabase error updating schedule ${scheduleId}:`, error);
      } else {
        console.log(`[TELEGRAM DEBUG] Successfully updated schedule ${scheduleId} to ${newState}`);
        broadcastCalendarUpdate(scheduleId);
        // Obter o ticketId associado para atualizar o seu estado se necessário
        const { data: schedule } = await supabase
          .from('schedules')
          .select('ticketId')
          .eq('id', scheduleId)
          .single();

        if (schedule && schedule.ticketId) {
          if (!isAccept) {
            console.log(`[TELEGRAM DEBUG] Reverting ticket ${schedule.ticketId} to open because schedule was rejected`);
            await supabase.from('tickets').update({ status: 'open' }).eq('id', schedule.ticketId);
          }
        }

        await axios.post(`https://api.telegram.org/bot${token}/editMessageText`, {
          chat_id: chatId,
          message_id: messageId,
          text: `${originalText}\n\n${isAccept ? '✅ *Aceite pelo Técnico*' : '❌ *Rejeitado pelo Técnico*'}`,
          parse_mode: 'Markdown'
        });
        return { type: 'button', success: true };
      }
    }
  }
}

async function getBotInfo() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookBaseUrl = process.env.TELEGRAM_WEBHOOK_URL;
  if (!token) return;
  try {
    if (webhookBaseUrl) {
      const webhookUrl = `${webhookBaseUrl}/api/telegram/webhook`;
      await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, { url: webhookUrl });
      console.log(`Telegram Webhook set to: ${webhookUrl}`);
    } else {
      // Clear webhook if no URL is provided to allow manual sycn (getUpdates)
      await axios.get(`https://api.telegram.org/bot${token}/deleteWebhook`);
      console.log('Telegram Webhook cleared (using manual sync).');
    }

    const response = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
    botUsername = response.data.result.username;
    console.log(`Telegram Bot identified as: @${botUsername}`);
  } catch (error: any) {
    console.error('Error during Telegram bot initialization:', error.message);
  }
}

async function syncTelegramUpdates() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { success: false, error: 'Token não configurado' };

  try {
    const response = await axios.get(`https://api.telegram.org/bot${token}/getUpdates`, {
      params: { offset: lastUpdateId + 1, timeout: 1 }
    });

    const updates = response.data.result;
    let processedCount = 0;

    for (const update of updates) {
      lastUpdateId = update.update_id;
      const result = await handleTelegramUpdate(update);
      if (result) processedCount++;
    }
    return { success: true, count: processedCount };
  } catch (error: any) {
    console.error('Error syncing Telegram updates:', error.message);
    return { success: false, error: error.message };
  }
}

async function sendScheduleNotificationToTechnicians(scheduleId: number, technicianIds: string[], isUpdate: boolean = false) {
  try {
    const { data: schedule, error: sError } = await supabase
      .from('schedules')
      .select('title, startDate, endDate, serviceType, additionalInfo, clients(name)')
      .eq('id', scheduleId)
      .single();

    if (sError || !schedule) {
      console.error('Error fetching schedule for notification:', sError);
      return;
    }

    const { data: scheduleParts, error: partsError } = await supabase
      .from('schedule_parts')
      .select('quantity, parts(reference, designation)')
      .eq('scheduleId', scheduleId);

    const clientName = Array.isArray(schedule.clients) ? schedule.clients[0]?.name : (schedule.clients as any)?.name || 'Cliente Desconhecido';
    const startDate = new Date(schedule.startDate).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
    const endDate = new Date(schedule.endDate).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
    const serviceType = schedule.serviceType || 'Não especificado';

    const { data: profiles, error: pError } = await supabase
      .from('profiles')
      .select('id, telegramchatid')
      .in('id', technicianIds);

    if (pError || !profiles) {
      console.error('Error fetching profiles for notification:', pError);
      return;
    }

    const notificationTitle = isUpdate ? '🔄 *Re-Agendamento*' : '📅 *Novo Agendamento*';
    let message = `${notificationTitle}\n\n`;
    message += `*Título:* ${schedule.title}\n`;
    message += `*Cliente:* ${clientName}\n`;
    message += `*Tipo de Serviço:* ${serviceType}\n`;
    message += `*Início:* ${startDate}\n`;
    message += `*Final:* ${endDate}\n`;
    if (schedule.additionalInfo) {
      message += `*Notas:* ${schedule.additionalInfo}\n`;
    }

    if (scheduleParts && scheduleParts.length > 0) {
      message += `\n*Peças necessárias:*\n`;
      scheduleParts.forEach((sp: any) => {
        const p = sp.parts;
        message += `• ${sp.quantity}x ${p.reference} - ${p.designation}\n`;
      });
    }

    message += `\nPor favor, confirme a sua disponibilidade.`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '✅ Aceitar', callback_data: `sch_acc_${scheduleId}` },
          { text: '❌ Rejeitar', callback_data: `sch_rej_${scheduleId}` }
        ]
      ]
    };

    for (const profile of profiles) {
      if (profile.telegramchatid) {
        await sendTelegramNotification(message, profile.telegramchatid, replyMarkup);
      }
    }
  } catch (err) {
    console.error('Unexpected error in sendScheduleNotificationToTechnicians:', err);
  }
}

// --- CRON JOB FOR TICKET CHECKS ---
let scheduledTask: cron.ScheduledTask;

async function runTicketCheck() {
  console.log('Running pending ticket check...');
  try {
    const { count, error } = await supabase.from('tickets').select('*', { count: 'exact', head: true }).in('status', ['open', 'acknowledged']);
    if (error) throw error;
    if (count && count > 0) {
      const message = `🔔 *Daily Reminder:* There are *${count}* pending ticket(s).`;
      sendTelegramNotification(message);
    }
  } catch (error) {
    console.error('Error running ticket check:', error);
  }
}

async function scheduleTicketCheck() {
  try {
    console.log('Scheduling ticket check task...');
    const { data, error } = await supabase.from('settings').select('*');
    if (error) throw error;

    const settings = data.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {} as Record<string, string>);
    if (settings['ticket_notification_active'] !== 'true') {
      if (scheduledTask) scheduledTask.stop();
      return;
    }

    const [hour, minute] = (settings['ticket_notification_time'] || '17:00').split(':');
    const cronExpression = `${minute} ${hour} * * 1-5`;
    if (!cron.validate(cronExpression)) {
      console.error(`Invalid cron expression from settings. Defaulting.`);
      if (scheduledTask) scheduledTask.stop();
      scheduledTask = cron.schedule(`0 17 * * 1-5`, runTicketCheck, { timezone: "Europe/Lisbon" });
      return;
    }

    if (scheduledTask) scheduledTask.stop();
    scheduledTask = cron.schedule(cronExpression, runTicketCheck, { timezone: "Europe/Lisbon" });
    console.log(`Ticket check task scheduled for ${settings['ticket_notification_time']} on weekdays.`);
  } catch (error) {
    console.error('Error scheduling ticket check:', error);
  }
}

// --- EXPRESS APP SETUP ---
const app = express();
const port = process.env.PORT || 5001;
//const port = 5001;
app.use(cors());
app.use(bodyParser.json());

// Multer setup for file uploads (stores files in memory)
const upload = multer({ storage: multer.memoryStorage() });

// --- MIDDLEWARE ---
interface AuthenticatedRequest extends Request {
  user?: any;
  file?: Express.Multer.File;
}

const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.sendStatus(403);

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

const authorizeRoles = (roles: Array<'client' | 'technician' | 'admin'>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userRole = req.user?.user_metadata?.role;
    if (!req.user || !userRole || !roles.includes(userRole)) {
      return res.status(403).json({ error: 'Permission denied for this role.' });
    }
    next();
  };
};


async function markLastClientMessageAsRead(ticketId: number) {
  try {
    // Find the last message from the client that is marked as new
    // We join with profiles to identify messages where the user has the 'client' role
    const { data: lastClientMessage, error: fetchError } = await supabase
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
      const { error: updateError } = await supabase
        .from('ticket_responses')
        .update({ isNew: false })
        .eq('id', lastClientMessage.id);

      if (updateError) {
        console.error('Error marking last client message as read:', updateError);
      } else {
        console.log(`Last client message for ticket ${ticketId} marked as read.`);
      }
    }
  } catch (err) {
    console.error('Unexpected error in markLastClientMessageAsRead:', err);
  }
}

// --- API ENDPOINTS ---
app.get('/', (req, res) => res.send('Server is running!'));

app.get('/api/test', (req, res) => {
  console.log('[DEBUG] /api/test endpoint hit. Server is alive!');
  res.send('Server is alive!');
});

// AUTH
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: error.message });
  res.json(data);
});

app.post('/auth/self-register', async (req, res) => {
  const { email, firstName, lastName, companyName } = req.body;
  if (!email || !firstName || !lastName || !companyName) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }

  try {
    const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
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

  } catch (err: any) {
    console.error('Fatal error during self-register:', err);
    res.status(500).json({ error: 'Ocorreu um erro inesperado no servidor.' });
  }
});

app.get('/api/telegram/bot-info', authenticateToken, (req, res) => {
  res.json({ username: botUsername });
});

app.post('/api/telegram/webhook', async (req, res) => {
  // O Telegram espera um status 200 rápido
  res.sendStatus(200);

  try {
    const update = req.body;
    console.log('[TELEGRAM DEBUG] Webhook received update:', JSON.stringify(update, null, 2));
    await handleTelegramUpdate(update);
  } catch (err) {
    console.error('[TELEGRAM DEBUG] Error processing webhook update:', err);
  }
});

app.post('/api/admin/set-telegram-webhook', authenticateToken, authorizeRoles(['admin']), async (req, res) => {
  const { url } = req.body;
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!url || !token) return res.status(400).json({ error: 'URL is required' });

  try {
    const webhookUrl = `${url}/api/telegram/webhook`;
    await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, { url: webhookUrl });
    res.json({ message: `Webhook set to ${webhookUrl}` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/sync-telegram-updates', authenticateToken, authorizeRoles(['admin']), async (req, res) => {
  const result = await syncTelegramUpdates();
  res.json(result);
});

app.post('/admin/invite-user', authenticateToken, authorizeRoles(['admin']), async (req: AuthenticatedRequest, res) => {
  const { email, client_id, role, ...meta } = req.body;
  if (!email || !role) return res.status(400).json({ error: 'Email and role are required.' });
  if (role === 'client' && !client_id) return res.status(400).json({ error: 'Client ID is required for client role.' });

  const inviteData: any = { role: role, must_set_password: true, ...meta };
  if (client_id) {
    const { data: client, error: clientError } = await supabase.from('clients').select('id').eq('id', client_id).single();
    if (clientError || !client) return res.status(404).json({ error: 'Client not found.' });
    inviteData.client_id = client_id;
  }

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, { data: inviteData });
  if (error) return res.status(500).json({ error: error.message });

  res.status(200).json({ message: `Invite sent to ${email}.` });
});

app.get('/admin/pending-users', authenticateToken, authorizeRoles(['admin']), async (req: AuthenticatedRequest, res) => {
  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;

    const pendingUsers = users.filter(u => u.user_metadata.role === 'pending_client');

    res.json(pendingUsers);

  } catch (err: any) {
    console.error('Error fetching pending users:', err);
    res.status(500).json({ error: 'Failed to fetch pending users', details: err.message });
  }
});

app.post('/admin/approve-user', authenticateToken, authorizeRoles(['admin']), async (req: AuthenticatedRequest, res) => {
  const { userId, client_id } = req.body;
  if (!userId || !client_id) {
    return res.status(400).json({ error: 'User ID and Client ID are required.' });
  }

  try {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ client_id: client_id })
      .eq('id', userId);

    if (profileError) {
      console.error(`Error updating profile for user ${userId}:`, profileError);
      throw new Error(`Failed to associate user with client: ${profileError.message}`);
    }

    const { data: updatedUser, error: userError } = await supabase.auth.admin.updateUserById(
      userId,
      { user_metadata: { role: 'client' } }
    );

    if (userError) {
      console.error(`Error updating auth role for user ${userId}:`, userError);
      throw new Error(`Failed to update user role: ${userError.message}`);
    }

    res.status(200).json({ message: 'User approved and associated successfully.', user: updatedUser });

  } catch (err: any) {
    console.error('Error in approval process:', err);
    res.status(500).json({ error: 'Failed to approve user', details: err.message });
  }
});

// DASHBOARD
app.get('/api/dashboard/stats', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res) => {
  console.log('[DEBUG] /api/dashboard/stats endpoint hit.');
  try {
    const { count: openTickets, error: ticketsError } = await supabase.from('tickets').select('*', { count: 'exact', head: true }).in('status', ['open', 'acknowledged']);
    if (ticketsError) throw ticketsError;

    const today = new Date();
    const firstDayOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
    const lastDayOfWeek = new Date(firstDayOfWeek.getFullYear(), firstDayOfWeek.getMonth(), firstDayOfWeek.getDate() + 6);

    const { count: weeklySchedules, error: schedulesError } = await supabase.from('schedules').select('*', { count: 'exact', head: true }).gte('startDate', firstDayOfWeek.toISOString()).lte('startDate', lastDayOfWeek.toISOString());
    if (schedulesError) throw schedulesError;

    const { count: pendingReports, error: reportsError } = await supabase.from('schedules').select('*', { count: 'exact', head: true }).eq('isCompleted', true).eq('hasReport', false);
    if (reportsError) throw reportsError;

    res.json({ openTickets: openTickets || 0, weeklySchedules: weeklySchedules || 0, pendingReports: pendingReports || 0 });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/api/dashboard/weekly-schedules', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res) => {
  console.log('[DEBUG] /api/dashboard/weekly-schedules endpoint hit.');
  try {
    const today = new Date();
    const firstDayOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
    const lastDayOfWeek = new Date(firstDayOfWeek.getFullYear(), firstDayOfWeek.getMonth(), firstDayOfWeek.getDate() + 6);

    const { data: schedules, error: schedulesError } = await supabase
      .from('schedules')
      .select('id, title, startDate, clients(name), schedule_technicians(technicianId)')
      .gte('startDate', firstDayOfWeek.toISOString())
      .lte('startDate', lastDayOfWeek.toISOString())
      .order('startDate', { ascending: true });

    if (schedulesError) throw schedulesError;

    const technicianIds = [...new Set(schedules.flatMap(s => s.schedule_technicians.map((st: any) => st.technicianId)))];

    if (technicianIds.length === 0) {
      const result = schedules.map(s => ({
        id: s.id,
        title: s.title,
        startDate: s.startDate,
        clientName: Array.isArray(s.clients) ? s.clients[0]?.name : (s.clients as any)?.name || 'Cliente Desconhecido',
        technicians: [],
      }));
      return res.json(result);
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, role')
      .in('id', technicianIds);

    if (profilesError) throw profilesError;

    const technicianMap = new Map(profiles.map(p => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]));

    const result = schedules.map(s => ({
      id: s.id,
      title: s.title,
      startDate: s.startDate,
      clientName: Array.isArray(s.clients) ? s.clients[0]?.name : (s.clients as any)?.name || 'Cliente Desconhecido',
      technicians: s.schedule_technicians.map((st: any) => technicianMap.get(st.technicianId) || 'Técnico Desconhecido'),
    }));

    res.json(result);
  } catch (err: any) {
    console.error('Error fetching weekly schedules:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/api/dashboard/pending-reports', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res) => {
  console.log('[DEBUG] /api/dashboard/pending-reports endpoint hit.');
  try {
    const { data: schedules, error: schedulesError } = await supabase
      .from('schedules')
      .select('id, title, endDate, clients(name), schedule_technicians(technicianId)')
      .eq('isCompleted', true)
      .eq('hasReport', false)
      .order('endDate', { ascending: true });

    if (schedulesError) throw schedulesError;

    const technicianIds = [...new Set(schedules.flatMap(s => s.schedule_technicians.map((st: any) => st.technicianId)))];

    if (technicianIds.length === 0) {
      const result = schedules.map(s => ({
        id: s.id,
        title: s.title,
        endDate: s.endDate,
        clientName: Array.isArray(s.clients) ? s.clients[0]?.name : (s.clients as any)?.name || 'Cliente Desconhecido',
        technicians: [],
      }));
      return res.json(result);
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', technicianIds);

    if (profilesError) throw profilesError;

    const technicianMap = new Map(profiles.map(p => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]));

    const result = schedules.map(s => ({
      id: s.id,
      title: s.title,
      endDate: s.endDate,
      clientName: Array.isArray(s.clients) ? s.clients[0]?.name : (s.clients as any)?.name || 'Cliente Desconhecido',
      technicians: s.schedule_technicians.map((st: any) => technicianMap.get(st.technicianId) || 'Técnico Desconhecido'),
    }));

    res.json(result);
  } catch (err: any) {
    console.error('Error fetching pending reports:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// ... (Continue with the rest of the endpoints)

// CLIENTS, EQUIPMENTS, TECHNICIANS, PARTS, INVENTORY, SCHEDULES, REPORTS, TICKETS, ATTACHMENTS
// All endpoints from previous successful replacements should be here,
// with all 'clientId' references changed to 'client_id' and all route handlers
// correctly typed as async (req: AuthenticatedRequest, res: Response)

// ...

app.get('/api/clients', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, address, nif')
      .order('name', { ascending: true });
    if (error) return res.status(500).json({ error: 'Failed to fetch clients', details: error.message });
    res.json(data ?? []);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.post('/api/clients', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  const { name, address, nif } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  try {
    const { data, error } = await supabase
      .from('clients')
      .insert({ name, address, nif })
      .select();
    if (error) return res.status(500).json({ error: 'Failed to create client', details: error.message });
    res.status(201).json(data?.[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// TECHNICIANS (profiles)
app.get('/api/technicians', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, role, first_name, last_name, color, telegramchatid')
      .in('role', ['technician', 'admin'])
      .order('first_name', { ascending: true });
    if (error) return res.status(500).json({ error: 'Failed to fetch users', details: error.message });

    const result = (data || []).map((p: any) => ({
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
  } catch (err: any) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.put('/api/technicians/:id', authenticateToken, authorizeRoles(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.params.id;
    const { first_name, last_name, color, role, telegramchatid } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required.' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ first_name, last_name, color, role, telegramchatid })
      .eq('id', userId)
      .select('id, email, role, first_name, last_name, color, telegramchatid')
      .single();

    if (error) {
      console.error('Error updating user:', error);
      return res.status(500).json({ error: 'Failed to update user', details: error.message });
    }

    res.json(data);
  } catch (err: any) {
    console.error('Error updating user:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// SETTINGS
app.get('/api/settings', authenticateToken, authorizeRoles(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('key, value');
    if (error) return res.status(500).json({ error: 'Failed to fetch settings', details: error.message });

    const settingsObj = (data || []).reduce((acc: Record<string, string>, row: any) => {
      acc[row.key] = row.value ?? '';
      return acc;
    }, {});

    res.json(settingsObj);
  } catch (err: any) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// REPORTS
app.get(['/api/reports', '/reports'], authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  console.log('[DEBUG] GET /reports - Request received');
  try {
    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select('*')
      .order('serviceDate', { ascending: false });

    if (reportsError) {
      console.error('[ERROR] GET /reports - Error fetching reports:', reportsError);
      return res.status(500).json({ error: 'Failed to fetch reports', details: reportsError.message });
    }

    console.log(`[DEBUG] GET /reports - Found ${reports?.length || 0} reports`);

    if (!reports || reports.length === 0) {
      return res.json([]);
    }

    // Fetch related data in parallel for performance
    const clientIds = [...new Set(reports.map(r => r.clientId).filter(Boolean))];
    const equipmentIds = [...new Set(reports.map(r => r.equipmentId).filter(Boolean))];
    const reportIds = reports.map(r => r.id);

    const [clientsRes, equipmentsRes, techniciansRes] = await Promise.all([
      clientIds.length > 0 ? supabase.from('clients').select('id, name').in('id', clientIds) : Promise.resolve({ data: [] }),
      equipmentIds.length > 0 ? supabase.from('equipments').select('id, brand, model').in('id', equipmentIds) : Promise.resolve({ data: [] }),
      reportIds.length > 0 ? supabase.from('report_technicians').select('reportId, technicianId').in('reportId', reportIds) : Promise.resolve({ data: [] })
    ]);

    const clientMap = new Map(clientsRes.data?.map(c => [c.id, c.name]) || []);
    const equipmentMap = new Map(equipmentsRes.data?.map(e => [e.id, e]) || []);

    // Fetch all profiles for technician mapping
    const techIds = [...new Set(techniciansRes.data?.map(rt => rt.technicianId).filter(Boolean) || [])];
    const { data: profiles } = techIds.length > 0 ? await supabase.from('profiles').select('id, first_name, last_name, color').in('id', techIds) : { data: [] };
    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    const techMap = new Map<number, any[]>();
    techniciansRes.data?.forEach(rt => {
      const p = profileMap.get(rt.technicianId);
      if (p) {
        if (!techMap.has(rt.reportId)) techMap.set(rt.reportId, []);
        techMap.get(rt.reportId)!.push({
          id: p.id,
          name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
          color: p.color
        });
      }
    });

    const result = reports.map(r => {
      const eq = equipmentMap.get(r.equipmentId);
      return {
        ...r,
        clientName: clientMap.get(r.clientId) || 'Cliente Desconhecido',
        equipmentBrand: eq?.brand || '',
        equipmentModel: eq?.model || '',
        technicians: techMap.get(r.id) || [],
        internalNotes: r.internal_notes
      };
    });

    console.log('[DEBUG] GET /reports - Successfully returning results');
    res.json(result);
  } catch (err: any) {
    console.error('[FATAL ERROR] GET /reports:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get(['/api/reports/:id', '/report/:id'], authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  console.log(`[DEBUG] GET /report/:id - id: ${id}`);
  try {
    const { data: report, error } = await supabase
      .from('reports')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[ERROR] GET /report/:id - Error fetching report:', error);
      return res.status(500).json({ error: 'Failed to fetch report', details: error.message });
    }

    if (!report) return res.status(404).json({ error: 'Report not found' });

    // Fetch related data
    const [clientRes, equipmentRes, techRes] = await Promise.all([
      supabase.from('clients').select('id, name, address, nif').eq('id', report.clientId).single(),
      supabase.from('equipments').select('id, brand, model, serialNumber').eq('id', report.equipmentId).single(),
      supabase.from('report_technicians').select('technicianId').eq('reportId', report.id)
    ]);

    const client = clientRes.data;
    const equipment = equipmentRes.data;
    const reportTechs = techRes.data || [];

    let technicianNames = '';
    let technicians: any[] = [];

    if (reportTechs.length > 0) {
      const techIds = reportTechs.map((rt: any) => rt.technicianId);
      const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, color').in('id', techIds);
      if (profiles) {
        technicians = profiles.map((p: any) => ({
          id: p.id,
          name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
          color: p.color
        }));
        technicianNames = technicians.map(t => t.name).join(', ');
      }
    }

    // Map to the format expected by ReportPrintPage
    const detailedReport = {
      ...report,
      clientName: client?.name || 'Cliente Desconhecido',
      clientAddress: client?.address || '',
      clientNif: client?.nif || '',
      equipmentBrand: equipment?.brand || '',
      equipmentModel: equipment?.model || '',
      equipmentSerialNumber: equipment?.serialNumber || '',
      technicianName: technicianNames,
      technicians: technicians,
      internalNotes: report.internal_notes
    };

    res.json(detailedReport);
  } catch (err: any) {
    console.error('[FATAL ERROR] GET /report/:id:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get(['/api/reports/by-schedule/:scheduleId', '/reports/by-schedule/:scheduleId'], authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  const scheduleId = Number(req.params.scheduleId);
  console.log(`[DEBUG] GET /reports/by-schedule - Received for scheduleId: ${scheduleId}`);

  try {
    if (!scheduleId || isNaN(scheduleId)) return res.status(400).json({ error: 'Invalid schedule ID' });

    const { data: report, error } = await supabase
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
    const { data: reportTechnicians, error: rtError } = await supabase
      .from('report_technicians')
      .select('technicianId')
      .eq('reportId', report.id);

    let technicians: any[] = [];
    if (!rtError && reportTechnicians && reportTechnicians.length > 0) {
      const techIds = reportTechnicians.map((rt: any) => rt.technicianId);
      const { data: profiles, error: pError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, color')
        .in('id', techIds);

      if (!pError && profiles) {
        technicians = profiles.map((p: any) => ({
          id: p.id,
          name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
          color: p.color
        }));
      }
    }

    console.log(`[DEBUG] GET /reports/by-schedule - Returning report with ${technicians.length} technicians`);
    res.json({ ...report, technicians, internalNotes: report.internal_notes });
  } catch (err: any) {
    console.error('[FATAL ERROR] GET /reports/by-schedule:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.post('/api/reports', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  console.log('[DEBUG] POST /api/reports hit. Request body:', req.body);
  try {
    const { clientId, equipmentId, scheduleId, technicianIds, serviceDate, hours, parts, description, damage, serviceType, internalNotes } = req.body;
    if (!clientId || !equipmentId || !scheduleId || !technicianIds || !serviceDate || hours === undefined || !description) {
      console.error('[ERROR] POST /api/reports: Missing required fields.', { clientId, equipmentId, scheduleId, technicianIds, serviceDate, hours, description });
      return res.status(400).json({ error: 'Campos obrigatórios em falta para criar o relatório.' });
    }

    console.log('[DEBUG] Attempting to insert report into Supabase...');
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({ clientId, equipmentId, scheduleId, serviceDate, hours, parts: parts || [], description, damage: damage || '', serviceType: serviceType || [], internal_notes: internalNotes || '' })
      .select('id')
      .single();

    if (reportError) {
      console.error('[ERROR] Supabase insert report error:', reportError);
      return res.status(500).json({ error: 'Erro ao criar relatório.', details: reportError.message });
    }
    console.log('[DEBUG] Report inserted successfully. Report ID:', report.id);

    const reportTechnicians = technicianIds.map((techId: number) => ({ reportId: report.id, technicianId: techId }));
    console.log('[DEBUG] Attempting to associate technicians:', reportTechnicians);
    const { error: techError } = await supabase.from('report_technicians').insert(reportTechnicians);

    if (techError) {
      console.error('[ERROR] Supabase associate technicians error:', techError);
      return res.status(500).json({ error: 'Erro ao associar técnicos ao relatório.', details: techError.message });
    }
    console.log('[DEBUG] Technicians associated successfully.');

    console.log('[DEBUG] Attempting to update schedule hasReport status for scheduleId:', scheduleId);
    const { error: scheduleUpdateError } = await supabase.from('schedules').update({ hasReport: true }).eq('id', scheduleId);
    if (scheduleUpdateError) {
      console.error('[ERROR] Supabase update schedule hasReport error:', scheduleUpdateError);
      // Decide if this should be a blocking error or just log it. For now, logging.
    }
    console.log('[DEBUG] Schedule hasReport status updated.');

    // --- INVENTORY MANAGEMENT: Automatic Abate ---
    if (Array.isArray(parts) && parts.length > 0) {
      console.log(`[DEBUG_INV] Processing automatic abate for ${parts.length} parts.`);
      for (const p of parts) {
        if (p.id && p.quantity > 0) {
          const { data: currentPart, error: fetchError } = await supabase
            .from('parts')
            .select('stock_quantity, reserved_quantity, designation')
            .eq('id', p.id)
            .single();

          if (!fetchError && currentPart) {
            const { newStock, newReserved } = inventoryService.processReportAbate(
              currentPart.stock_quantity || 0,
              currentPart.reserved_quantity || 0,
              Number(p.quantity)
            );

            console.log(`[DEBUG_INV] Abating Part "${currentPart.designation}" (ID: ${p.id}): Old Stock=${currentPart.stock_quantity}, New Stock=${newStock} | Old Reserved=${currentPart.reserved_quantity}, New Reserved=${newReserved}`);

            await supabase
              .from('parts')
              .update({ stock_quantity: newStock, reserved_quantity: newReserved })
              .eq('id', p.id);
          }
        }
      }
    }

    res.status(201).json({ message: 'Relatório criado com sucesso!', reportId: report.id });
  } catch (err: any) {
    console.error('[FATAL ERROR] POST /api/reports:', err);
    res.status(500).json({ error: 'Erro interno do servidor.', details: err.message });
  }
});

app.put('/api/reports/:id', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  console.log('[DEBUG] PUT /api/reports/:id hit. Report ID:', req.params.id, 'Request body:', req.body);
  try {
    const reportId = req.params.id;
    const { clientId, equipmentId, scheduleId, technicianIds, serviceDate, hours, parts, description, damage, serviceType, internalNotes } = req.body;

    if (!clientId || !equipmentId || !scheduleId || !technicianIds || !serviceDate || hours === undefined || !description) {
      console.error('[ERROR] PUT /api/reports/:id: Missing required fields.', { reportId, clientId, equipmentId, scheduleId, technicianIds, serviceDate, hours, description });
      return res.status(400).json({ error: 'Campos obrigatórios em falta para atualizar o relatório.' });
    }

    console.log('[DEBUG] Attempting to update report in Supabase. Report ID:', reportId);
    const { data: updatedReport, error: reportError } = await supabase
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
    const { error: deleteTechError } = await supabase.from('report_technicians').delete().eq('reportId', reportId);
    if (deleteTechError) {
      console.error('[ERROR] Supabase delete report technicians error:', deleteTechError);
      return res.status(500).json({ error: 'Erro ao remover técnicos antigos do relatório.', details: deleteTechError.message });
    }
    console.log('[DEBUG] Existing technicians deleted.');

    const reportTechnicians = technicianIds.map((techId: number) => ({ reportId: updatedReport.id, technicianId: techId }));
    console.log('[DEBUG] Attempting to associate new technicians:', reportTechnicians);
    const { error: insertTechError } = await supabase.from('report_technicians').insert(reportTechnicians);

    if (insertTechError) {
      console.error('[ERROR] Supabase insert new report technicians error:', insertTechError);
      return res.status(500).json({ error: 'Erro ao associar novos técnicos ao relatório.', details: insertTechError.message });
    }
    console.log('[DEBUG] New technicians associated successfully.');

    res.status(200).json({ message: 'Relatório atualizado com sucesso!', reportId: updatedReport.id });
  } catch (err: any) {
    console.error('[FATAL ERROR] PUT /api/reports/:id:', err);
    res.status(500).json({ error: 'Erro interno do servidor.', details: err.message });
  }
});



app.put('/api/settings', authenticateToken, authorizeRoles(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const entries = Object.entries(req.body || {}) as Array<[string, string]>;
    const rows = entries.map(([key, value]) => ({ key, value }));
    if (rows.length === 0) return res.status(400).json({ error: 'No settings provided.' });

    const { data, error } = await supabase
      .from('settings')
      .upsert(rows, { onConflict: 'key' })
      .select('key, value');
    if (error) return res.status(500).json({ error: 'Failed to save settings', details: error.message });

    const settingsObj = (data || []).reduce((acc: Record<string, string>, row: any) => {
      acc[row.key] = row.value ?? '';
      return acc;
    }, {});

    // Re-schedule cron based on updated settings
    scheduleTicketCheck();

    res.json(settingsObj);
  } catch (err: any) {
    console.error('Error saving settings:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/api/my-equipments', authenticateToken, authorizeRoles(['client']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, client_id')
      .eq('id', req.user?.id)
      .single();
    if (profileError) return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
    if (!profile || !profile.client_id) return res.status(404).json({ error: 'Profile not found or not associated to a client.' });
    console.log('[DEBUG] Profile and client_id fetched:', profile.id, profile.client_id);

    const { data, error } = await supabase
      .from('equipments')
      .select('id, brand, model, serialNumber, clientId')
      .eq('clientId', profile.client_id)
      .order('id', { ascending: true });
    if (error) return res.status(500).json({ error: 'Failed to fetch equipments', details: error.message });

    res.json(data ?? []);
  } catch (err: any) {
    console.error('Error fetching my equipments:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/api/my-tickets', authenticateToken, authorizeRoles(['client']), async (req: AuthenticatedRequest, res: Response) => {
  console.log('[DEBUG] /api/my-tickets endpoint hit.');
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, client_id')
      .eq('id', req.user?.id)
      .single();
    if (profileError) return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
    if (!profile || !profile.client_id) return res.status(404).json({ error: 'Profile not found or not associated to a client.' });

    const { data: tickets, error: ticketsError } = await supabase
      .from('tickets')
      .select('id, createdAt, updatedAt, faultDescription, status, scheduleId, client_id, equipmentId')
      .eq('client_id', profile.client_id)
      .order('createdAt', { ascending: false });
    if (ticketsError) return res.status(500).json({ error: 'Failed to fetch tickets', details: ticketsError.message });

    const equipmentIds = [...new Set((tickets || []).map(t => t.equipmentId).filter(Boolean))] as number[];
    const scheduleIds = [...new Set((tickets || []).map(t => t.scheduleId).filter(Boolean))] as number[];

    let equipmentMap = new Map<number, { brand?: string; model?: string; serialNumber?: string }>();
    if (equipmentIds.length > 0) {
      const { data: equipments, error: equipmentsError } = await supabase
        .from('equipments')
        .select('id, brand, model, serialNumber')
        .in('id', equipmentIds);
      if (!equipmentsError && equipments) {
        equipmentMap = new Map(equipments.map(e => [e.id as number, { brand: e.brand, model: e.model, serialNumber: e.serialNumber }]));
      }
    }

    let scheduleMap = new Map<number, { startDate?: string; endDate?: string; hasReport?: boolean }>();
    if (scheduleIds.length > 0) {
      const { data: schedules, error: schedulesError } = await supabase
        .from('schedules')
        .select('id, startDate, endDate, hasReport')
        .in('id', scheduleIds);
      if (!schedulesError && schedules) {
        scheduleMap = new Map(schedules.map(s => [s.id as number, { startDate: s.startDate, endDate: s.endDate, hasReport: s.hasReport }]));
      }
    }

    const result = (tickets || []).map(t => {
      const e = equipmentMap.get(t.equipmentId as number);
      const equipmentInfo = e ? `${e.brand || ''} ${e.model || ''}${e.serialNumber ? ` (${e.serialNumber})` : ''}`.trim() : 'Equipamento Desconhecido';
      const s = t.scheduleId ? scheduleMap.get(t.scheduleId as number) : undefined;
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
        startDate: s?.startDate,
        endDate: s?.endDate,
        hasReport: s?.hasReport,
      };
    });

    res.json(result);
  } catch (err: any) {
    console.error('Error fetching my tickets:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/api/my-schedules', authenticateToken, authorizeRoles(['client']), async (req: AuthenticatedRequest, res: Response) => {
  console.log('[DEBUG] /api/my-schedules endpoint hit.');
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, client_id')
      .eq('id', req.user?.id).single();
    if (profileError) {
      console.error('[ERROR] Failed to fetch user profile:', profileError);
      return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
    }
    if (!profile || !profile.client_id) {
      console.error('[ERROR] Profile not found or not associated to a client for user ID:', req.user?.id);
      return res.status(404).json({ error: 'Profile not found or not associated to a client.' });
    }
    console.log('[DEBUG] User profile fetched:', profile);

    const { data: schedules, error: schedulesError } = await supabase
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

    const technicianIds = [...new Set(schedules.flatMap(s => s.schedule_technicians?.map((st: any) => st.technicianId) || []))];

    let technicianMap = new Map();
    if (technicianIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', technicianIds);
      if (profilesError) {
        console.error('[ERROR] Error fetching technician profiles:', profilesError);
        return res.status(500).json({ error: 'Failed to fetch technician profiles', details: profilesError.message });
      }
      technicianMap = new Map(profiles.map(p => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]));
    }

    const result = schedules.map(s => ({
      id: s.id,
      title: s.title,
      startDate: s.startDate,
      endDate: s.endDate,
      isCompleted: s.isCompleted,
      hasReport: s.hasReport,

      clientName: Array.isArray(s.clients) ? s.clients[0]?.name : (s.clients as any)?.name || 'Cliente Desconhecido',
      technicians: s.schedule_technicians?.map((st: any) => technicianMap.get(st.technicianId) || 'Técnico Desconhecido') || [],
    }));

    res.json(result ?? []);
  } catch (err: any) {
    console.error('Error fetching my schedules:', err);
    res.status(500).json({ error: 'Internal server error', details: err instanceof Error ? err.message : 'Unknown error' });
  }
});

app.post('/api/my-tickets', authenticateToken, authorizeRoles(['client']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { equipmentId, title, faultDescription } = req.body as { equipmentId?: number; title?: string; faultDescription?: string };
    if (!equipmentId || !title || !faultDescription) return res.status(400).json({ error: 'equipmentId, title and faultDescription are required.' });

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, client_id')
      .eq('id', req.user?.id)
      .single();
    if (profileError) return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
    if (!profile || !profile.client_id) return res.status(404).json({ error: 'Profile not found or not associated to a client.' });

    const { data: equipment, error: equipmentError } = await supabase
      .from('equipments')
      .select('id, clientId')
      .eq('id', equipmentId)
      .single();
    if (equipmentError) return res.status(500).json({ error: 'Failed to verify equipment', details: equipmentError.message });
    if (!equipment || equipment.clientId !== profile.client_id) return res.status(403).json({ error: 'Permission denied for this equipment.' });

    const { data, error } = await supabase
      .from('tickets')
      .insert({ client_id: profile.client_id, equipmentId, title, faultDescription, status: 'open', created_by_user_id: profile.id })
      .select('id, createdAt, updatedAt, title, faultDescription, status, scheduleId, client_id, equipmentId');
    if (error) return res.status(500).json({ error: 'Failed to create ticket', details: error.message });

    res.status(201).json(data?.[0] ?? null);
  } catch (err: any) {
    console.error('Error creating ticket:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/api/my-report/by-schedule/:id', authenticateToken, authorizeRoles(['client']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const scheduleId = Number(req.params.id);
    if (!scheduleId || Number.isNaN(scheduleId)) return res.status(400).json({ error: 'Invalid schedule id' });

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, client_id')
      .eq('id', req.user?.id)
      .single();
    if (profileError) return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
    if (!profile || !profile.client_id) return res.status(404).json({ error: 'Profile not found or not associated to a client.' });

    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('id, clientId, equipmentId, serviceDate, hours, description, parts, scheduleId, serviceType, damage')
      .eq('scheduleId', scheduleId)
      .single();
    if (reportError) return res.status(500).json({ error: 'Failed to fetch report', details: reportError.message });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (report.clientId !== profile.client_id) return res.status(403).json({ error: 'Permission denied for this report.' });

    let clientName = '';
    let clientAddress = '';
    let clientNif = '';
    {
      const { data: client, error: clientError } = await supabase
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
      const { data: equipment, error: equipmentError } = await supabase
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

    let technicians: Array<{ id: string; name: string; color?: string }> = [];
    {
      const { data: rt, error: rtError } = await supabase
        .from('report_technicians')
        .select('technicianId')
        .eq('reportId', report.id);
      if (!rtError && rt && rt.length > 0) {
        const techIds = rt.map((r: any) => r.technicianId);
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, color')
          .in('id', techIds);
        if (!profilesError && profiles) {
          technicians = profiles.map((p: any) => ({ id: p.id, name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), color: p.color }));
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
      serviceType: report.serviceType as any,
      damage: report.damage,
      clientName,
      clientAddress,
      clientNif,
      equipmentBrand,
      equipmentModel,
      equipmentSerialNumber,
    };

    res.json(result);
  } catch (err: any) {
    console.error('Error fetching my report by schedule:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// CLIENT PORTAL: TICKET DETAILS AND ATTACHMENTS
app.get('/api/my-tickets/:id', authenticateToken, authorizeRoles(['client']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ticketId = Number(req.params.id);
    if (!ticketId || Number.isNaN(ticketId)) return res.status(400).json({ error: 'Invalid ticket id' });

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, client_id')
      .eq('id', req.user?.id)
      .single();
    if (profileError) return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
    if (!profile || !profile.client_id) return res.status(404).json({ error: 'Profile not found or not associated to a client.' });

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, createdAt, updatedAt, title, faultDescription, status, scheduleId, client_id, equipmentId, created_by_user_id')
      .eq('id', ticketId)
      .single();
    if (ticketError) return res.status(500).json({ error: 'Failed to fetch ticket', details: ticketError.message });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.client_id !== profile.client_id) return res.status(403).json({ error: 'Permission denied for this ticket.' });

    let clientName = 'Cliente Desconhecido';
    {
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, name')
        .eq('id', ticket.client_id)
        .single();
      if (!clientError && client) clientName = client.name || clientName;
    }

    let equipmentInfo = 'Equipamento Desconhecido';
    {
      const { data: equipment, error: equipmentError } = await supabase
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
        const { data: userProfile, error: userError } = await supabase
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

    let responses: any[] = [];
    let usingLegacy = false;
    {
      const { data, error } = await supabase
        .from('ticket_responses')
        .select('id, ticket_id, user_id, message, created_at, isNew, profiles(role)') // Adicionado profiles(role)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
      if (error) {
        const { data: legacyData, error: legacyErr } = await supabase
          .from('ticket_responses')
          .select('id, ticket_id, user_id, message, created_at')
          .eq('ticket_id', ticketId)
          .order('created_at', { ascending: true });
        if (legacyErr) return res.status(500).json({ error: 'Failed to fetch responses', details: legacyErr.message });
        responses = legacyData || [];
        usingLegacy = true;
      } else {
        responses = data || [];
      }
    }

    const authorIds = [...new Set((responses || []).map((r: any) => r.user_id).filter(Boolean))];
    let authorMap = new Map<string, { name: string; role: string }>();
    if (authorIds.length > 0) {
      const { data: profilesList, error: profErr } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, role')
        .in('id', authorIds);
      if (!profErr && profilesList) {
        authorMap = new Map(profilesList.map((p: any) => [p.id, { name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), role: p.role || 'client' }]));
      }
    }

    const responsesEnriched = (responses || []).map((r: any) => ({
      id: r.id,
      ticket_id: r.ticket_id,
      user_id: r.user_id,
      authorName: authorMap.get(r.user_id)?.name || 'Utilizador',
      message: r.message,
      created_at: r.created_at,
      isNew: usingLegacy ? false : !!r.isNew,
      role: authorMap.get(r.user_id)?.role || 'client',
    }));

    try {
      if (!usingLegacy) {
        await supabase
          .from('ticket_responses')
          .update({ isNew: false })
          .eq('ticket_id', ticketId)
          .neq('user_id', req.user?.id || '')
          .eq('isNew', true);
      }
    } catch { }

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
  } catch (err: any) {
    console.error('Error fetching my ticket details:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.post('/api/my-tickets/:id/reply', authenticateToken, authorizeRoles(['client']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ticketId = Number(req.params.id);

    const { message } = req.body as { message?: string };
    if (!ticketId || Number.isNaN(ticketId)) return res.status(400).json({ error: 'Invalid ticket id' });
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required.' });

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, client_id, first_name, last_name')
      .eq('id', req.user?.id)
      .single();
    if (profileError) return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
    if (!profile || !profile.client_id) return res.status(404).json({ error: 'Profile not found or not associated to a client.' });

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, client_id, faultDescription')
      .eq('id', ticketId)
      .single();
    if (ticketError) return res.status(500).json({ error: 'Failed to fetch ticket', details: ticketError.message });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.client_id !== profile.client_id) return res.status(403).json({ error: 'Permission denied for this ticket.' });

    const author = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Cliente';
    const { data: updated, error: updateError } = await supabase
      .from('tickets')
      .update({ updatedAt: new Date().toISOString() })
      .eq('id', ticketId)
      .select('id, title, faultDescription');
    if (updateError) return res.status(500).json({ error: 'Failed to update ticket', details: updateError.message });

    await supabase
      .from('ticket_responses')
      .insert({ ticket_id: ticketId, user_id: profile.id, message: message.trim(), isNew: false, created_at: new Date().toISOString() });

    res.json(updated?.[0] ?? null);
  } catch (err: any) {
    console.error('Error replying to ticket:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.put(['/api/tickets/:id/mark-as-read', '/api/my-tickets/:id/mark-as-read'], authenticateToken, authorizeRoles(['client', 'technician', 'admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ticketId = Number(req.params.id);
    await supabase
      .from('ticket_responses')
      .update({ isNew: false })
      .eq('ticket_id', ticketId)
      .neq('user_id', req.user?.id || '')
      .eq('isNew', true);
    res.status(200).send('Messages marked as read');
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).send('Failed to mark messages as read');
  }
});

app.get('/api/tickets/:id/attachments', authenticateToken, authorizeRoles(['client', 'admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ticketId = Number(req.params.id);
    if (!ticketId || Number.isNaN(ticketId)) return res.status(400).json({ error: 'Invalid ticket id' });

    const { data: attachments, error } = await supabase
      .from('ticket_attachments')
      .select('id, ticket_id, file_name, mime_type, storage_path, uploaded_by_user_id, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'Failed to fetch attachments', details: error.message });

    const bucket = ATTACHMENTS_BUCKET;
    const result = await Promise.all((attachments || []).map(async att => {
      const { data: signed, error: signedErr } = await supabase.storage.from(bucket).createSignedUrl(att.storage_path, 3600);
      return { ...att, url: signed?.signedUrl || '' };
    }));

    res.json(result);
  } catch (err: any) {
    console.error('Error fetching attachments:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.post('/api/tickets/:id/attachments', authenticateToken, authorizeRoles(['client', 'admin', 'technician']), upload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ticketId = Number(req.params.id);
    const file = req.file;
    if (!ticketId || Number.isNaN(ticketId)) return res.status(400).json({ error: 'Invalid ticket id' });
    if (!file) return res.status(400).json({ error: 'No file uploaded.' });

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

    const { error: uploadError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
      });

    if (uploadError) {
      console.error('Error uploading file to Supabase Storage:', uploadError);
      return res.status(500).json({ error: 'Failed to upload file to storage', details: uploadError.message });
    }

    const { data, error } = await supabase
      .from('ticket_attachments')
      .insert({
        ticket_id: ticketId,
        file_name: file.originalname,
        mime_type: file.mimetype,
        storage_path: filePath,
        uploaded_by_user_id: req.user?.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving attachment metadata to database:', error);
      return res.status(500).json({ error: 'Failed to save attachment metadata', details: error.message });
    }

    res.status(201).json(data);
  } catch (err: any) {
    console.error('Error uploading attachment:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.delete('/api/tickets/:ticketId/attachments/:attachmentId', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ticketId = Number(req.params.ticketId);
    const attachmentId = String(req.params.attachmentId);
    if (!ticketId || Number.isNaN(ticketId)) return res.status(400).json({ error: 'Invalid ticket id' });
    if (!attachmentId) return res.status(400).json({ error: 'Invalid attachment id' });

    const { data: attachment, error: fetchError } = await supabase
      .from('ticket_attachments')
      .select('id, storage_path, ticket_id')
      .eq('id', attachmentId)
      .single();
    if (fetchError) return res.status(500).json({ error: 'Failed to fetch attachment', details: fetchError.message });
    if (!attachment || attachment.ticket_id !== ticketId) return res.status(404).json({ error: 'Attachment not found' });

    const bucket = ATTACHMENTS_BUCKET;
    const { error: storageError } = await supabase.storage.from(bucket).remove([attachment.storage_path]);
    if (storageError) return res.status(500).json({ error: 'Failed to delete file from storage', details: storageError.message });

    const { error: deleteError } = await supabase
      .from('ticket_attachments')
      .delete()
      .eq('id', attachmentId)
      .eq('ticket_id', ticketId);
    if (deleteError) return res.status(500).json({ error: 'Failed to delete attachment record', details: deleteError.message });

    res.status(204).send();
  } catch (err: any) {
    console.error('Error deleting attachment:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// SCHEDULES for calendar
app.get('/api/schedules', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: schedules, error: schedulesError } = await supabase
      .from('schedules')
      .select('id, title, startDate, endDate, isCompleted, hasReport, additionalInfo, serviceType, ticketId, clientId, equipmentId, acknowledgementState, schedule_technicians(technicianId), clients(name)')
      .order('startDate', { ascending: true });
    if (schedulesError) return res.status(500).json({ error: 'Failed to fetch schedules', details: schedulesError.message });

    const technicianIds = [...new Set((schedules || []).flatMap(s => (s.schedule_technicians || []).map((st: any) => st.technicianId)))];
    let techMap = new Map<string, { id: string; name: string; color?: string }>();
    if (technicianIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, color')
        .in('id', technicianIds);
      if (!profilesError && profiles) {
        techMap = new Map(profiles.map((p: any) => [p.id, { id: p.id, name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), color: p.color }]));
      }
    }

    // Buscar peças para todos os agendamentos
    const scheduleIds = (schedules || []).map(s => s.id);
    let partsMap = new Map<number, any[]>();

    if (scheduleIds.length > 0) {
      const { data: scheduleParts, error: partsError } = await supabase
        .from('schedule_parts')
        .select('scheduleId, partId, quantity, parts(id, reference, designation)')
        .in('scheduleId', scheduleIds);

      if (!partsError && scheduleParts) {
        scheduleParts.forEach((sp: any) => {
          if (!partsMap.has(sp.scheduleId)) {
            partsMap.set(sp.scheduleId, []);
          }
          partsMap.get(sp.scheduleId)!.push({
            id: sp.parts.id,
            reference: sp.parts.reference,
            designation: sp.parts.designation,
            quantity: sp.quantity,
            isDesignationLocked: true
          });
        });
      }
    }

    const result = (schedules || []).map((s: any) => ({
      id: s.id,
      title: s.title,
      startDate: s.startDate,
      endDate: s.endDate,
      isCompleted: s.isCompleted,
      hasReport: s.hasReport,
      internalNotes: s.additionalInfo,
      serviceType: s.serviceType,
      ticketId: s.ticketId,
      clientId: s.clientId,
      equipmentId: s.equipmentId,
      technicians: (s.schedule_technicians || []).map((st: any) => techMap.get(st.technicianId)).filter(Boolean),
      clientName: Array.isArray(s.clients) ? s.clients[0]?.name : (s.clients as any)?.name || 'Cliente Desconhecido',
      parts: partsMap.get(s.id) || [],
      acknowledgementState: s.acknowledgementState,
    }));

    res.json(result);
  } catch (err: any) {
    console.error('Error fetching schedules:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/api/schedules/:id', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { data: schedule, error: scheduleError } = await supabase
      .from('schedules')
      .select('id, title, startDate, endDate, isCompleted, hasReport, additionalInfo, serviceType, ticketId, clientId, equipmentId, acknowledgementState, schedule_technicians(technicianId), clients(name)')
      .eq('id', id)
      .single();

    if (scheduleError || !schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Fetch technicians
    const technicianIds = (schedule.schedule_technicians || []).map((st: any) => st.technicianId);
    let technicians: any[] = [];
    if (technicianIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, color')
        .in('id', technicianIds);
      if (!profilesError && profiles) {
        technicians = profiles.map((p: any) => ({
          id: p.id,
          name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
          color: p.color
        }));
      }
    }

    // Fetch parts
    const { data: scheduleParts, error: partsError } = await supabase
      .from('schedule_parts')
      .select('partId, quantity, parts(id, reference, designation)')
      .eq('scheduleId', id);

    const parts = (scheduleParts || []).map((sp: any) => ({
      id: sp.parts.id,
      reference: sp.parts.reference,
      designation: sp.parts.designation,
      quantity: sp.quantity,
      isDesignationLocked: true
    }));

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
      clientId: schedule.clientId,
      equipmentId: schedule.equipmentId,
      technicians,
      clientName: Array.isArray(schedule.clients) ? schedule.clients[0]?.name : (schedule.clients as any)?.name || 'Cliente Desconhecido',
      parts,
      acknowledgementState: schedule.acknowledgementState,
    };

    res.json(result);
  } catch (err: any) {
    console.error('Error fetching schedule by ID:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});


app.post('/api/schedules', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      title,
      startDate,
      endDate,
      clientId,
      equipmentId,
      technicianIds,
      isCompleted,
      ticketId,
      internalNotes,
      serviceType,
      parts,
    } = req.body as any;

    console.log('[DEBUG_SCHEDULES] POST /api/schedules. Body:', JSON.stringify(req.body));
    console.log('[DEBUG_SCHEDULES] POST /api/schedules. internalNotes extracted:', internalNotes);

    if (!title || !startDate || !endDate || !clientId || !equipmentId) {
      return res.status(400).json({ error: 'title, startDate, endDate, clientId and equipmentId are required.' });
    }
    if (!Array.isArray(technicianIds) || technicianIds.length === 0) {
      return res.status(400).json({ error: 'At least one technician is required.' });
    }

    const { data: inserted, error: insertError } = await supabase
      .from('schedules')
      .insert({ title, startDate, endDate, clientId, equipmentId, isCompleted: !!isCompleted, additionalInfo: internalNotes, serviceType, ticketId })
      .select('id, title, startDate, endDate, isCompleted, hasReport, additionalInfo, serviceType, ticketId, clientId, equipmentId, acknowledgementState')
      .single();

    if (insertError) {
      console.error('[DEBUG_SCHEDULES] POST /api/schedules. Insert error:', insertError);
      return res.status(500).json({ error: 'Failed to create schedule', details: insertError.message });
    }
    console.log('[DEBUG_SCHEDULES] POST /api/schedules. Insert success. saved additionalInfo:', inserted.additionalInfo);

    const scheduleId = inserted.id as number;

    if (Array.isArray(technicianIds) && technicianIds.length > 0) {
      const techRows = technicianIds.map((tid: any) => ({ scheduleId, technicianId: String(tid) }));
      const { error: stError } = await supabase.from('schedule_technicians').insert(techRows);
      if (stError) return res.status(500).json({ error: 'Failed to assign technicians', details: stError.message });
    }

    if (Array.isArray(parts) && parts.length > 0) {
      const partRows = [];

      for (const p of parts) {
        let partId = p.id;

        // Se a peça não tem id mas tem reference e designation, criar a peça
        if (!partId && p.reference && p.designation) {
          console.log('[DEBUG] Creating new part:', p.reference, p.designation);

          // Verificar se já existe uma peça com esta referência
          const { data: existingPart, error: checkError } = await supabase
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
          } else {
            // Criar a nova peça
            const { data: newPart, error: createError } = await supabase
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
        const { error: spError } = await supabase.from('schedule_parts').insert(partRows);
        if (spError) return res.status(500).json({ error: 'Failed to assign parts', details: spError.message });

        // Incrementar reserved_quantity para cada peça
        for (const partRow of partRows) {
          console.log(`[DEBUG_INV] Processing reservation for partId: ${partRow.partId}, Quantity to add: ${partRow.quantity}`);

          const { data: currentPart, error: fetchError } = await supabase
            .from('parts')
            .select('reserved_quantity, designation')
            .eq('id', partRow.partId)
            .single();

          if (fetchError) {
            console.error(`[DEBUG_INV] ERROR fetching part ${partRow.partId}:`, fetchError);
            continue; // Continue with other parts
          }

          const newReservedQuantity = inventoryService.calculateNewQuantity(
            currentPart.reserved_quantity || 0,
            Number(partRow.quantity)
          );

          console.log(`[DEBUG_INV] Part "${currentPart.designation}" (ID: ${partRow.partId}): Current Reserved=${currentPart.reserved_quantity || 0} + Adding=${Number(partRow.quantity)} = New Reserved=${newReservedQuantity}`);

          const { error: updateError } = await supabase
            .from('parts')
            .update({ reserved_quantity: newReservedQuantity })
            .eq('id', partRow.partId);

          if (updateError) {
            console.error(`[DEBUG_INV] ERROR updating part ${partRow.partId}:`, updateError);
          } else {
            console.log(`[DEBUG_INV] SUCCESS: Updated part ${partRow.partId} reserved_quantity to ${newReservedQuantity}`);
          }
        }
      }
    }

    if (ticketId) {
      await supabase.from('tickets').update({ scheduleId, status: 'scheduled' }).eq('id', ticketId);
    }

    // Notificar técnicos via Telegram
    if (technicianIds && technicianIds.length > 0) {
      await sendScheduleNotificationToTechnicians(scheduleId, technicianIds);
    }

    broadcastCalendarUpdate(scheduleId);

    const result = {
      ...inserted,
      internalNotes: inserted.additionalInfo,
      acknowledgementState: inserted.acknowledgementState,
      technicians: [], // Will be updated if assigned
      parts: [],
    };

    res.status(201).json(result);
  } catch (err: any) {
    console.error('Error creating schedule:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.put('/api/schedules/:id', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const scheduleId = Number(req.params.id);
    const {
      title,
      startDate,
      endDate,
      clientId,
      equipmentId,
      technicianIds,
      isCompleted,
      ticketId,
      internalNotes,
      serviceType,
      parts,
    } = req.body as any;

    console.log('[DEBUG_SCHEDULES] PUT /api/schedules/:id. ID:', scheduleId);
    console.log('[DEBUG_SCHEDULES] PUT /api/schedules/:id. Body:', JSON.stringify(req.body));
    console.log('[DEBUG_SCHEDULES] PUT /api/schedules/:id. internalNotes extracted:', internalNotes);

    if (!scheduleId || Number.isNaN(scheduleId)) return res.status(400).json({ error: 'Invalid schedule id' });
    if (!title || !startDate || !endDate || !clientId || !equipmentId) {
      return res.status(400).json({ error: 'title, startDate, endDate, clientId and equipmentId are required.' });
    }
    if (!Array.isArray(technicianIds) || technicianIds.length === 0) {
      return res.status(400).json({ error: 'At least one technician is required.' });
    }

    const { data: updated, error: updateError } = await supabase
      .from('schedules')
      .update({ title, startDate, endDate, clientId, equipmentId, isCompleted: !!isCompleted, additionalInfo: internalNotes, serviceType, ticketId, acknowledgementState: 'pending' })
      .eq('id', scheduleId)
      .select('id, title, startDate, endDate, isCompleted, hasReport, additionalInfo, serviceType, ticketId, clientId, equipmentId, acknowledgementState')
      .single();

    if (updateError) {
      console.error('[DEBUG_SCHEDULES] PUT /api/schedules/:id. Update error:', updateError);
      return res.status(500).json({ error: 'Failed to update schedule', details: updateError.message });
    }
    console.log('[DEBUG_SCHEDULES] PUT /api/schedules/:id. Update success. saved additionalInfo:', updated.additionalInfo);

    await supabase.from('schedule_technicians').delete().eq('scheduleId', scheduleId);
    if (Array.isArray(technicianIds) && technicianIds.length > 0) {
      const techRows = technicianIds.map((tid: any) => ({ scheduleId, technicianId: String(tid) }));
      const { error: stError } = await supabase.from('schedule_technicians').insert(techRows);
      if (stError) return res.status(500).json({ error: 'Failed to assign technicians', details: stError.message });
    }

    // --- INVENTORY MANAGEMENT: Release old reservations ---
    const { data: oldParts } = await supabase
      .from('schedule_parts')
      .select('partId, quantity')
      .eq('scheduleId', scheduleId);

    if (oldParts && oldParts.length > 0) {
      console.log(`[DEBUG_INV] Found ${oldParts.length} old parts to release for schedule ${scheduleId}`);
      for (const op of oldParts) {
        const { data: currentPart } = await supabase.from('parts').select('reserved_quantity, designation').eq('id', op.partId).single();
        if (currentPart) {
          const currentReserved = currentPart.reserved_quantity || 0;
          const qtyToRelease = Number(op.quantity);
          const newReserved = Math.max(0, currentReserved - qtyToRelease);

          console.log(`[DEBUG_INV] Releasing Part "${currentPart.designation}" (ID: ${op.partId}): Current Reserved=${currentReserved} - Releasing=${qtyToRelease} = New Reserved=${newReserved}`);

          await supabase.from('parts').update({ reserved_quantity: newReserved }).eq('id', op.partId);
        } else {
          console.warn(`[DEBUG_INV] Part ${op.partId} not found when releasing reservation.`);
        }
      }
    }

    await supabase.from('schedule_parts').delete().eq('scheduleId', scheduleId);
    if (Array.isArray(parts) && parts.length > 0) {
      const partRows = [];

      for (const p of parts) {
        let partId = p.id;

        // Se a peça não tem id mas tem reference e designation, criar a peça
        if (!partId && p.reference && p.designation) {
          console.log('[DEBUG] Creating new part:', p.reference, p.designation);

          // Verificar se já existe uma peça com esta referência
          const { data: existingPart, error: checkError } = await supabase
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
          } else {
            // Criar a nova peça
            const { data: newPart, error: createError } = await supabase
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
        const { error: spError } = await supabase.from('schedule_parts').insert(partRows);
        if (spError) return res.status(500).json({ error: 'Failed to assign parts', details: spError.message });

        // --- INVENTORY MANAGEMENT: Add new reservations ---
        for (const partRow of partRows) {
          console.log(`[DEBUG_INV] PUT: Processing NEW reservation for partId: ${partRow.partId}, Quantity: ${partRow.quantity}`);

          const { data: currentPart, error: fetchError } = await supabase
            .from('parts')
            .select('reserved_quantity, designation')
            .eq('id', partRow.partId)
            .single();

          if (fetchError) {
            console.error(`[DEBUG_INV] ERROR fetching part ${partRow.partId}:`, fetchError);
            continue;
          }

          const newReservedQuantity = inventoryService.calculateNewQuantity(
            currentPart.reserved_quantity || 0,
            Number(partRow.quantity)
          );

          console.log(`[DEBUG_INV] PUT: Part "${currentPart.designation}" (ID: ${partRow.partId}): Current Reserved=${currentPart.reserved_quantity || 0} + Adding=${Number(partRow.quantity)} = New Reserved=${newReservedQuantity}`);

          const { error: updateError } = await supabase
            .from('parts')
            .update({ reserved_quantity: newReservedQuantity })
            .eq('id', partRow.partId);

          if (updateError) {
            console.error(`[DEBUG_INV] ERROR updating part ${partRow.partId}:`, updateError);
          } else {
            console.log(`[DEBUG_INV] SUCCESS: Updated part ${partRow.partId} reserved_quantity to ${newReservedQuantity}`);
          }
        }
      }
    }

    if (ticketId) {
      let responsibleId: string | null = null;
      const { data: existingTicket } = await supabase
        .from('tickets')
        .select('id')
        .eq('id', ticketId)
        .single();
      if (Array.isArray(technicianIds) && technicianIds.length > 0) {
        responsibleId = String(technicianIds[0]);
      }
      await supabase
        .from('tickets')
        .update({ scheduleId, status: isCompleted ? 'closed' : 'scheduled', scheduled_at: startDate })
        .eq('id', ticketId);
    }

    // Notificar técnicos sobre atualização (opcional, mas recomendado)
    if (technicianIds && technicianIds.length > 0 && !isCompleted) {
      await sendScheduleNotificationToTechnicians(scheduleId, technicianIds, true);
    }

    const finalObject = {
      ...updated,
      internalNotes: updated.additionalInfo,
      acknowledgementState: updated.acknowledgementState || 'pending',
    };

    broadcastCalendarUpdate(scheduleId);

    res.json(finalObject);
  } catch (err: any) {
    console.error('Error updating schedule:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.post('/api/schedules/:id/complete', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const scheduleId = Number(req.params.id);
    const {
      title,
      startDate,
      endDate,
      clientId,
      equipmentId,
      technicianIds,
      ticketId,
      internalNotes,
      serviceType,
      parts,
    } = req.body as any;

    if (!scheduleId || Number.isNaN(scheduleId)) return res.status(400).json({ error: 'Invalid schedule id' });
    if (!Array.isArray(technicianIds) || technicianIds.length === 0) {
      return res.status(400).json({ error: 'At least one technician is required.' });
    }

    const { data: updated, error: updateError } = await supabase
      .from('schedules')
      .update({ title, startDate, endDate, clientId, equipmentId, isCompleted: true, additionalInfo: internalNotes, serviceType })
      .eq('id', scheduleId)
      .select('id, title, startDate, endDate, isCompleted, hasReport, additionalInfo, serviceType, ticketId, clientId, equipmentId')
      .single();
    if (updateError) return res.status(500).json({ error: 'Failed to complete schedule', details: updateError.message });

    await supabase.from('schedule_technicians').delete().eq('scheduleId', scheduleId);
    if (Array.isArray(technicianIds) && technicianIds.length > 0) {
      const techRows = technicianIds.map((tid: any) => ({ scheduleId, technicianId: String(tid) }));
      const { error: stError } = await supabase.from('schedule_technicians').insert(techRows);
      if (stError) return res.status(500).json({ error: 'Failed to assign technicians', details: stError.message });
    }

    // --- INVENTORY MANAGEMENT: Release old reservations ---
    const { data: oldParts } = await supabase
      .from('schedule_parts')
      .select('partId, quantity')
      .eq('scheduleId', scheduleId);

    if (oldParts && oldParts.length > 0) {
      for (const op of oldParts) {
        const { data: currentPart } = await supabase.from('parts').select('reserved_quantity').eq('id', op.partId).single();
        if (currentPart) {
          const newReserved = inventoryService.calculateNewQuantity(currentPart.reserved_quantity || 0, -op.quantity);
          await supabase.from('parts').update({ reserved_quantity: newReserved }).eq('id', op.partId);
        }
      }
    }

    await supabase.from('schedule_parts').delete().eq('scheduleId', scheduleId);
    if (Array.isArray(parts) && parts.length > 0) {
      const partRows = [];

      for (const p of parts) {
        let partId = p.id;

        // Se a peça não tem id mas tem reference e designation, criar a peça
        if (!partId && p.reference && p.designation) {
          console.log('[DEBUG] Creating new part:', p.reference, p.designation);

          // Verificar se já existe uma peça com esta referência
          const { data: existingPart, error: checkError } = await supabase
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
          } else {
            // Criar a nova peça
            const { data: newPart, error: createError } = await supabase
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
        const { error: spError } = await supabase.from('schedule_parts').insert(partRows);
        if (spError) return res.status(500).json({ error: 'Failed to assign parts', details: spError.message });

        // --- INVENTORY MANAGEMENT: Add new reservations ---
        for (const partRow of partRows) {
          const { data: currentPart, error: fetchError } = await supabase
            .from('parts')
            .select('reserved_quantity')
            .eq('id', partRow.partId)
            .single();

          if (fetchError) {
            console.error('[ERROR] Failed to fetch part for reservation:', fetchError);
            continue;
          }

          const newReservedQuantity = inventoryService.calculateNewQuantity(currentPart.reserved_quantity || 0, Number(partRow.quantity));

          const { error: updateError } = await supabase
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
      let responsibleId: string | null = null;
      const { data: existingTicket } = await supabase
        .from('tickets')
        .select('id')
        .eq('id', ticketId)
        .single();
      if (Array.isArray(technicianIds) && technicianIds.length > 0) {
        responsibleId = String(technicianIds[0]);
      }
      await supabase
        .from('tickets')
        .update({ scheduleId, status: 'closed', scheduled_at: startDate })
        .eq('id', ticketId);
    }

    broadcastCalendarUpdate(scheduleId);

    res.json({ ...updated, internalNotes: updated.additionalInfo });
  } catch (err: any) {
    console.error('Error completing schedule:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.delete('/api/schedules/:id', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const scheduleId = Number(req.params.id);
    if (!scheduleId || Number.isNaN(scheduleId)) return res.status(400).json({ error: 'Invalid schedule id' });

    const { data: schedule, error: scheduleError } = await supabase
      .from('schedules')
      .select('id')
      .eq('id', scheduleId)
      .single();
    if (scheduleError) return res.status(500).json({ error: 'Failed to fetch schedule', details: scheduleError.message });
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    const { error: stDelError } = await supabase.from('schedule_technicians').delete().eq('scheduleId', scheduleId);
    if (stDelError) return res.status(500).json({ error: 'Failed to delete schedule technicians', details: stDelError.message });

    // --- INVENTORY MANAGEMENT: Release reservations before deleting ---
    const { data: oldParts } = await supabase
      .from('schedule_parts')
      .select('partId, quantity')
      .eq('scheduleId', scheduleId);

    if (oldParts && oldParts.length > 0) {
      for (const op of oldParts) {
        const { data: currentPart } = await supabase.from('parts').select('reserved_quantity').eq('id', op.partId).single();
        if (currentPart) {
          const newReserved = inventoryService.calculateNewQuantity(currentPart.reserved_quantity || 0, -op.quantity);
          await supabase.from('parts').update({ reserved_quantity: newReserved }).eq('id', op.partId);
          console.log(`[DEBUG] Released reservation of ${op.quantity} for part ${op.partId}`);
        }
      }
    }

    const { error: spDelError } = await supabase.from('schedule_parts').delete().eq('scheduleId', scheduleId);
    if (spDelError) return res.status(500).json({ error: 'Failed to delete schedule parts', details: spDelError.message });

    const { error: ticketUpdateError } = await supabase
      .from('tickets')
      .update({ scheduleId: null, status: 'open', scheduled_at: null })
      .eq('scheduleId', scheduleId);
    if (ticketUpdateError) return res.status(500).json({ error: 'Failed to update related ticket', details: ticketUpdateError.message });

    const { error: scheduleDelError } = await supabase.from('schedules').delete().eq('id', scheduleId);
    if (scheduleDelError) return res.status(500).json({ error: 'Failed to delete schedule', details: scheduleDelError.message });

    broadcastCalendarUpdate(scheduleId);

    res.status(204).send();
  } catch (err: any) {
    console.error('Error deleting schedule:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/api/equipments', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('equipments')
      .select('id, brand, model, serialNumber, clients(name)')
      .order('id', { ascending: true });
    if (error) return res.status(500).json({ error: 'Failed to fetch equipments', details: error.message });

    const result = (data || []).map((e: any) => ({
      id: e.id,
      brand: e.brand,
      model: e.model,
      serialNumber: e.serialNumber,
      clientName: Array.isArray(e.clients) ? e.clients[0]?.name : (e.clients as any)?.name || 'Cliente Desconhecido',
    }));

    res.json(result);
  } catch (err: any) {
    console.error('Error fetching equipments:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/api/clients/:id/equipments', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  const clientIdParam = Number(req.params.id);
  if (!clientIdParam || Number.isNaN(clientIdParam)) {
    return res.status(400).json({ error: 'Invalid client id' });
  }
  try {
    const { data, error } = await supabase
      .from('equipments')
      .select('id, brand, model, serialNumber, clients(name)')
      .eq('clientId', clientIdParam)
      .order('id', { ascending: true });
    if (error) return res.status(500).json({ error: 'Failed to fetch client equipments', details: error.message });

    const result = (data || []).map((e: any) => ({
      id: e.id,
      brand: e.brand,
      model: e.model,
      serialNumber: e.serialNumber,
      clientName: Array.isArray(e.clients) ? e.clients[0]?.name : (e.clients as any)?.name || 'Cliente Desconhecido',
    }));

    res.json(result);
  } catch (err: any) {
    console.error('Error fetching client equipments:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.post('/api/equipments', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  const { brand, model, serialNumber, clientId } = req.body as { brand?: string; model?: string; serialNumber?: string; clientId?: number };
  if (!brand || !model || !serialNumber || !clientId) {
    return res.status(400).json({ error: 'brand, model, serialNumber and clientId are required.' });
  }
  try {
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .single();
    if (clientError || !client) return res.status(404).json({ error: 'Client not found.' });

    const { data, error } = await supabase
      .from('equipments')
      .insert({ brand, model, serialNumber, clientId })
      .select('id, brand, model, serialNumber, clients(name)');
    if (error) return res.status(500).json({ error: 'Failed to create equipment', details: error.message });

    const created = data?.[0];
    const responseBody = created ? {
      id: created.id,
      brand: created.brand,
      model: created.model,
      serialNumber: created.serialNumber,
      clientName: Array.isArray(created.clients) ? created.clients[0]?.name : (created.clients as any)?.name || 'Cliente Desconhecido',
    } : null;
    res.status(201).json(responseBody);
  } catch (err: any) {
    console.error('Error creating equipment:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// INVENTORY
app.get('/api/inventory', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('parts')
      .select('id, reference, designation, stock_quantity, reserved_quantity, ordered_quantity')
      .order('designation', { ascending: true });
    if (error) return res.status(500).json({ error: 'Failed to fetch inventory', details: error.message });
    res.json(data ?? []);
  } catch (err: any) {
    console.error('Error fetching inventory:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.post('/api/inventory', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reference, designation, stock_quantity, reserved_quantity, ordered_quantity } = req.body;

    if (!reference || !designation) {
      return res.status(400).json({ error: 'Reference and designation are required.' });
    }

    const { data, error } = await supabase
      .from('parts')
      .insert([{ reference, designation, stock_quantity: stock_quantity || 0, reserved_quantity: reserved_quantity || 0, ordered_quantity: ordered_quantity || 0 }])
      .select('id, reference, designation, stock_quantity, reserved_quantity, ordered_quantity')
      .single();

    if (error) {
      console.error('Error adding inventory item:', error);
      return res.status(500).json({ error: 'Failed to add inventory item', details: error.message });
    }

    res.status(201).json(data);
  } catch (err: any) {
    console.error('Error adding inventory item:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.put('/api/inventory/:id/stock', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const partId = req.params.id;
    const { quantity, fromOrder } = req.body; // quantity can be positive (add) or negative (remove)

    if (!partId || typeof quantity !== 'number') {
      return res.status(400).json({ error: 'Part ID and quantity are required.' });
    }

    const { data: currentPart, error: fetchError } = await supabase
      .from('parts')
      .select('stock_quantity, ordered_quantity')
      .eq('id', partId)
      .single();

    if (fetchError || !currentPart) {
      console.error('Error fetching current part for stock update:', fetchError);
      return res.status(404).json({ error: 'Part not found.' });
    }

    const { newStock: newStockQuantity, newOrdered: newOrderedQuantity } = inventoryService.processStockUpdate(
      currentPart.stock_quantity,
      currentPart.ordered_quantity,
      quantity,
      !!fromOrder
    );

    const { data, error } = await supabase
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
  } catch (err: any) {
    console.error('Error updating stock quantity:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.put('/api/inventory/:id/order', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const partId = req.params.id;
    const { quantity } = req.body;

    if (!partId || typeof quantity !== 'number' || quantity <= 0) {
      return res.status(400).json({ error: 'Part ID and a positive quantity are required.' });
    }

    const { data: currentPart, error: fetchError } = await supabase
      .from('parts')
      .select('ordered_quantity')
      .eq('id', partId)
      .single();

    if (fetchError || !currentPart) {
      console.error('Error fetching current part for order update:', fetchError);
      return res.status(404).json({ error: 'Part not found.' });
    }

    const newOrderedQuantity = inventoryService.calculateNewQuantity(currentPart.ordered_quantity, quantity);

    const { data, error } = await supabase
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
  } catch (err: any) {
    console.error('Error updating ordered quantity:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/api/inventory/:id/reservations', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const partId = req.params.id;

    const { data, error } = await supabase
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
      .filter((item: any) => item.schedules)
      .map((item: any) => ({
        scheduleId: item.schedules.id,
        title: item.schedules.title,
        startDate: item.schedules.startDate,
        clientName: item.schedules.clients?.name || 'Cliente Desconhecido',
        quantityReserved: item.quantity
      }));

    res.json(reservations);
  } catch (err: any) {
    console.error('Error fetching part reservations:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// GET PART BY REFERENCE - usado no modal de agendamento para autocompletar designação
app.get('/api/parts/:reference', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reference = req.params.reference;

    if (!reference) {
      return res.status(400).json({ error: 'Reference is required.' });
    }

    const { data, error } = await supabase
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
  } catch (err: any) {
    console.error('Error fetching part by reference:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// TICKETS LIST BY STATUS
app.get('/api/tickets', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  const status = (req.query.status as string) || 'open';
  try {
    const { data: tickets, error: ticketsError } = await supabase
      .from('tickets')
      .select('id, createdAt, updatedAt, faultDescription, status, scheduleId, client_id, equipmentId')
      .eq('status', status)
      .order('createdAt', { ascending: false });
    if (ticketsError) return res.status(500).json({ error: 'Failed to fetch tickets', details: ticketsError.message });

    const clientIds = [...new Set((tickets || []).map(t => t.client_id).filter(Boolean))] as number[];
    const equipmentIds = [...new Set((tickets || []).map(t => t.equipmentId).filter(Boolean))] as number[];

    let clientMap = new Map<number, string>();
    if (clientIds.length > 0) {
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('id, name')
        .in('id', clientIds);
      if (!clientsError && clients) {
        clientMap = new Map(clients.map(c => [c.id as number, c.name as string]));
      }
    }

    let equipmentMap = new Map<number, { brand?: string; model?: string; serialNumber?: string }>();
    if (equipmentIds.length > 0) {
      const { data: equipments, error: equipmentsError } = await supabase
        .from('equipments')
        .select('id, brand, model, serialNumber')
        .in('id', equipmentIds);
      if (!equipmentsError && equipments) {
        equipmentMap = new Map(equipments.map(e => [e.id as number, { brand: e.brand, model: e.model, serialNumber: e.serialNumber }]));
      }
    }

    const result = (tickets || []).map(t => {
      const clientName = clientMap.get(t.client_id as number) || 'Cliente Desconhecido';
      const e = equipmentMap.get(t.equipmentId as number);
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
  } catch (err: any) {
    console.error('Error fetching tickets:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/api/tickets/:id', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ticketId = Number(req.params.id);
    if (!ticketId || Number.isNaN(ticketId)) return res.status(400).json({ error: 'Invalid ticket id' });

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, createdAt, updatedAt, title, faultDescription, status, scheduleId, client_id, equipmentId, created_by_user_id')
      .eq('id', ticketId)
      .single();
    if (ticketError) return res.status(500).json({ error: 'Failed to fetch ticket', details: ticketError.message });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    let clientName = 'Cliente Desconhecido';
    {
      const { data: client, error: clientError } = await supabase
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
      const { data: equipment, error: equipmentError } = await supabase
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
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', ticket.created_by_user_id)
        .single();
      if (userProfile) {
        userFirstName = userProfile.first_name || '';
        userLastName = userProfile.last_name || '';
      }
    }

    const { data: attachments, error: attachError } = await supabase
      .from('ticket_attachments')
      .select('id, ticket_id, file_name, mime_type, storage_path, uploaded_by_user_id, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false });
    if (attachError) return res.status(500).json({ error: 'Failed to fetch attachments', details: attachError.message });
    const bucket = ATTACHMENTS_BUCKET;
    const enriched = await Promise.all((attachments || []).map(async att => {
      const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(att.storage_path, 3600);
      return { ...att, url: signed?.signedUrl || '' };
    }));

    let responses: any[] = [];
    let usingLegacy = false;
    {
      const { data, error } = await supabase
        .from('ticket_responses')
        .select('id, ticket_id, user_id, message, created_at, isNew, profiles(role)')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
      if (error) {
        const { data: legacyData, error: legacyErr } = await supabase
          .from('ticket_responses')
          .select('id, ticket_id, user_id, message, created_at')
          .eq('ticket_id', ticketId)
          .order('created_at', { ascending: true });
        if (legacyErr) return res.status(500).json({ error: 'Failed to fetch responses', details: legacyErr.message });
        responses = legacyData || [];
        usingLegacy = true;
      } else {
        responses = data || [];
      }
    }

    const authorIds = [...new Set((responses || []).map((r: any) => r.user_id).filter(Boolean))];
    let authorMap = new Map<string, { name: string; role: string }>();
    if (authorIds.length > 0) {
      const { data: profilesList, error: profErr } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, role')
        .in('id', authorIds);
      if (!profErr && profilesList) {
        authorMap = new Map(profilesList.map((p: any) => [p.id, { name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), role: p.role || 'client' }]));
      }
    }

    const responsesEnriched = (responses || []).map((r: any) => ({
      id: r.id,
      ticket_id: r.ticket_id,
      user_id: r.user_id,
      authorName: authorMap.get(r.user_id)?.name || 'Utilizador',
      message: r.message,
      created_at: r.created_at,
      isNew: usingLegacy ? false : !!r.isNew,
      role: authorMap.get(r.user_id)?.role || 'client',
    }));

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
  } catch (err: any) {
    console.error('Error fetching ticket details:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.post('/api/tickets/:id/reply', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ticketId = Number(req.params.id);
    const { message } = req.body as { message?: string };
    if (!ticketId || Number.isNaN(ticketId)) return res.status(400).json({ error: 'Invalid ticket id' });
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required.' });

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('id', req.user?.id)
      .single();
    if (profileError) return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, faultDescription')
      .eq('id', ticketId)
      .single();
    if (ticketError) return res.status(500).json({ error: 'Failed to fetch ticket', details: ticketError.message });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const { data: updated, error: updateError } = await supabase
      .from('tickets')
      .update({ updatedAt: new Date().toISOString() })
      .eq('id', ticketId)
      .select('id, title, faultDescription');
    if (updateError) return res.status(500).json({ error: 'Failed to update ticket', details: updateError.message });

    await supabase
      .from('ticket_responses')
      .insert({ ticket_id: ticketId, user_id: profile?.id, message: message.trim(), isNew: true, created_at: new Date().toISOString() });

    await markLastClientMessageAsRead(ticketId);

    res.json(updated?.[0] ?? null);
  } catch (err: any) {
    console.error('Error replying to ticket (manager):', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.delete('/admin/tickets/:id', authenticateToken, authorizeRoles(['admin', 'technician']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ticketId = Number(req.params.id);
    if (!ticketId || Number.isNaN(ticketId)) return res.status(400).json({ error: 'Invalid ticket id' });

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, status')
      .eq('id', ticketId)
      .single();
    if (ticketError) return res.status(500).json({ error: 'Failed to fetch ticket', details: ticketError.message });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const { data: updated, error: updateError } = await supabase
      .from('tickets')
      .update({ status: 'deleted', updatedAt: new Date().toISOString() })
      .eq('id', ticketId)
      .select('id, status')
      .single();
    if (updateError) return res.status(500).json({ error: 'Failed to delete ticket', details: updateError.message });

    res.json(updated);
  } catch (err: any) {
    console.error('Error deleting ticket:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.get('/api/equipments/:id/history', authenticateToken, authorizeRoles(['admin', 'technician', 'client']), async (req: AuthenticatedRequest, res: Response) => {
  const equipmentId = Number(req.params.id);
  if (!equipmentId || Number.isNaN(equipmentId)) {
    return res.status(400).json({ error: 'Invalid equipment id' });
  }
  try {
    const { data: equipment, error: equipmentError } = await supabase
      .from('equipments')
      .select('id, brand, model, serialNumber, clientId')
      .eq('id', equipmentId)
      .single();
    if (equipmentError) return res.status(500).json({ error: 'Failed to fetch equipment details', details: equipmentError.message });
    if (!equipment) return res.status(404).json({ error: 'Equipment not found' });

    const userRole = req.user?.user_metadata?.role;
    if (userRole === 'client') {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, client_id')
        .eq('id', req.user?.id)
        .single();
      if (profileError) return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
      if (!profile || profile.client_id !== equipment.clientId) {
        return res.status(403).json({ error: 'Permission denied for this equipment.' });
      }
    }

    let clientName = 'Cliente Desconhecido';
    {
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, name')
        .eq('id', equipment.clientId)
        .single();
      if (!clientError && client) {
        clientName = client.name || clientName;
      }
    }

    const { data: tickets, error: ticketsError } = await supabase
      .from('tickets')
      .select('id, createdAt, faultDescription, status')
      .eq('equipmentId', equipmentId)
      .order('createdAt', { ascending: false });
    if (ticketsError) return res.status(500).json({ error: 'Failed to fetch tickets', details: ticketsError.message });

    const { data: schedules, error: schedulesError } = await supabase
      .from('schedules')
      .select('id, title, startDate, isCompleted')
      .eq('equipmentId', equipmentId)
      .order('startDate', { ascending: false });
    if (schedulesError) return res.status(500).json({ error: 'Failed to fetch schedules', details: schedulesError.message });

    const schedulesResult = (schedules || []).map((s: any) => ({
      id: s.id,
      title: s.title,
      startDate: s.startDate,
      isCompleted: s.isCompleted,
      technicians: [],
    }));

    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select('id, serviceDate, hours, description')
      .eq('equipmentId', equipmentId)
      .order('serviceDate', { ascending: false });
    if (reportsError) return res.status(500).json({ error: 'Failed to fetch reports', details: reportsError.message });

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
  } catch (err: any) {
    console.error('Error fetching equipment history:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Global error handler:', err.stack);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// --- INICIAR SERVIDOR ---
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, async () => {
    console.log(`Server is running on http://localhost:${port}`);
    scheduleTicketCheck();
    await getBotInfo();
  });
}

export { app, supabase };
