//Horas de desenvolvimento activo=4,5
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import * as cron from 'node-cron';
import { supabase } from './config/supabase';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger';

// Routes
import authRoutes from './routes/auth.routes';
import scheduleRoutes from './routes/schedule.routes';
import equipmentRoutes from './routes/equipment.routes';
import clientRoutes from './routes/client.routes';
import inventoryRoutes from './routes/inventory.routes';
import ticketRoutes from './routes/ticket.routes';
import technicianRoutes from './routes/technician.routes';
import reportRoutes from './routes/report.routes';
import clientPortalRoutes from './routes/clientPortal.routes';
import ticketAttachmentRoutes from './routes/ticketAttachment.routes';
import settingRoutes from './routes/setting.routes';
import googleRoutes from './routes/google.routes';
import dashboardRoutes from './routes/dashboard.routes';
import emailTemplateRoutes from './routes/emailTemplate.routes';
import telegramRoutes from './routes/telegram.routes';
import systemRoutes from './routes/system.routes';
import billingRoutes from './routes/billing.routes';
import taskRoutes from './routes/task.routes';

// Services
import { initializeTelegramBot } from './controllers/telegram.controller';
import { scheduleTicketCheck, runDailyReminders } from './services/cronService';

import { logger } from './utils/logger';
import pinoHttp from 'pino-http';
import { apiLimiter } from './middlewares/rateLimiter.middleware';

const app = express();
const port = process.env.PORT || 5001;

app.use(pinoHttp({ logger }));
app.use(apiLimiter);

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

// Body parser com limite reduzido (prevenir DoS)
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ limit: '1mb', extended: true }));

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Register Routes
app.use('/', authRoutes);
app.use('/', scheduleRoutes);
app.use('/', equipmentRoutes);
app.use('/', clientRoutes);
app.use('/', inventoryRoutes);
app.use('/', ticketRoutes);
app.use('/', technicianRoutes);
app.use('/', reportRoutes);
app.use('/', clientPortalRoutes);
app.use('/', ticketAttachmentRoutes);
app.use('/', settingRoutes);
app.use('/', googleRoutes);
app.use('/', dashboardRoutes);
app.use('/', emailTemplateRoutes);
app.use('/', telegramRoutes);
app.use('/', systemRoutes);
app.use('/', billingRoutes);
app.use('/api/tasks', taskRoutes);

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
      cron.schedule('*/30 9-18 * * *', () => runDailyReminders(supabase), { timezone: "Europe/Lisbon" });
      await initializeTelegramBot();
    } catch (err) {
      logger.error(err, 'Error during background initialization:');
    }
  });
}

export { app, supabase };
