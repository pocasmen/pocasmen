import './instrumentation';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import * as cron from 'node-cron';
import { supabase } from './config/supabase';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger';

// Routes
import authRoutes from './modules/auth/auth.routes';
import scheduleRoutes from './modules/schedule/schedule.routes';
import equipmentRoutes from './modules/equipment/equipment.routes';
import clientRoutes from './modules/client/client.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import ticketRoutes from './modules/ticket/ticket.routes';
import technicianRoutes from './modules/technician/technician.routes';
import reportRoutes from './modules/report/report.routes';
import clientPortalRoutes from './modules/clientPortal/clientPortal.routes';
import settingRoutes from './modules/setting/setting.routes';
import googleRoutes from './modules/google/google.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import emailTemplateRoutes from './modules/emailTemplate/emailTemplate.routes';
import telegramRoutes from './modules/telegram/telegram.routes';
import systemRoutes from './modules/system/system.routes';
import billingRoutes from './modules/billing/billing.routes';
import taskRoutes from './modules/task/task.routes';
import invoiceRoutes from './modules/invoice/invoice.routes';
import { SystemController } from './modules/system/system.controller';

// Services
import { initializeTelegramBot } from './modules/telegram/telegram.routes';
import { scheduleTicketCheck, runDailyReminders } from './services/cronService';
import { initScheduleListener } from './events/listeners/schedule.listener';

import { logger } from './utils/logger';
import pinoHttp from 'pino-http';
import { apiLimiter } from './middlewares/rateLimiter.middleware';
import { withObservability } from './utils/observability';

// Initialize Event Listeners
initScheduleListener();

const app = express();
app.set('trust proxy', 1);
const port = process.env.PORT || 5001;

// CORS restrito ao frontend (segurança)
// Strip any trailing slash: browsers send origins without it, and the CORS
// comparison is exact — a single '/' difference triggers a block.
const rawFrontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const frontendOrigin = rawFrontendUrl.replace(/\/+$/, '');

const corsOptions = {
  origin: frontendOrigin,
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

app.use(pinoHttp({ logger }));
app.use(helmet());
app.use(apiLimiter);

// Body parser com limite aumentado para suportar uploads de inventário
app.use(bodyParser.json({ limit: '2mb' }));
app.use(bodyParser.urlencoded({ limit: '2mb', extended: true }));

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Register Routes
app.use('/api/auth', authRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/equipments', equipmentRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/technicians', technicianRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/client-portal', clientPortalRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/google', googleRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/email-templates', emailTemplateRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/invoices', invoiceRoutes);

// Health check and status alias
const systemController = new SystemController();
app.get('/api/status', systemController.status);
app.get('/api/healthcheck', systemController.healthcheck);

// Global Error Handler
import { errorHandler } from './middlewares/error.middleware';
app.use(errorHandler);

// Start Server
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, async () => {
    logger.info(`Server is running on http://localhost:${port}`);

    // Background Initializations
    try {
      await scheduleTicketCheck(supabase);
      cron.schedule('*/30 9-18 * * *', () => withObservability('daily_reminders', () => runDailyReminders(supabase)), { timezone: "Europe/Lisbon" });
      await initializeTelegramBot();
    } catch (err) {
      logger.error(err, 'Error during background initialization:');
    }
  });
}

export { app, supabase };
