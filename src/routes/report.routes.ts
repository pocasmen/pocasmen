//Horas de desenvolvimento activo=3,5
import { Router } from 'express';
import * as reportController from '../controllers/report.controller';
import * as reportAttachmentController from '../controllers/reportAttachment.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import * as reportValidation from '../validations/report.validation';
import { UserRole } from '../constants/enums';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: Management of service reports
 */

/**
 * @swagger
 * /api/reports:
 *   get:
 *     summary: Retrieve a list of reports
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by start date
 *       - in: query
 *         name: end
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by end date
 *       - in: query
 *         name: technicianId
 *         schema:
 *           type: string
 *         description: Filter by technician ID
 *       - in: query
 *         name: clientId
 *         schema:
 *           type: integer
 *         description: Filter by client ID
 *     responses:
 *       200:
 *         description: A list of reports
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   serviceDate:
 *                     type: string
 *                     format: date-time
 *                   clientId:
 *                     type: integer
 *                   equipmentId:
 *                     type: integer
 *                   description:
 *                     type: string
 *                   is_signed:
 *                     type: boolean
 */
router.get('/api/reports',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN, UserRole.CLIENT]),
    reportController.getReports
);

/**
 * @swagger
 * /api/reports/{id}:
 *   get:
 *     summary: Get a report by ID
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The report ID
 *     responses:
 *       200:
 *         description: Report details
 *       404:
 *         description: Report not found
 */
router.get('/api/reports/:id',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN, UserRole.CLIENT]),
    validate(reportValidation.reportIdSchema),
    reportController.getReportById
);

router.get('/report/:id',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN, UserRole.CLIENT]),
    validate(reportValidation.reportIdSchema),
    reportController.getReportById
);

/**
 * @swagger
 * /api/reports/by-schedule/{scheduleId}:
 *   get:
 *     summary: Get a report by schedule ID
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The schedule ID
 *     responses:
 *       200:
 *         description: Report details
 *       404:
 *         description: Report not found
 */
router.get('/api/reports/by-schedule/:scheduleId',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    validate(reportValidation.scheduleIdParamSchema),
    reportController.getReportBySchedule
);

router.get('/reports/by-schedule/:scheduleId',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    validate(reportValidation.scheduleIdParamSchema),
    reportController.getReportBySchedule
);

/**
 * @swagger
 * /api/reports:
 *   post:
 *     summary: Create a new report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - clientId
 *               - equipmentId
 *               - scheduleId
 *               - technicianIds
 *               - serviceDate
 *               - hours
 *               - description
 *             properties:
 *               clientId:
 *                 type: integer
 *               equipmentId:
 *                 type: integer
 *               scheduleId:
 *                 type: integer
 *               technicianIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               serviceDate:
 *                 type: string
 *                 format: date-time
 *               hours:
 *                 type: number
 *               description:
 *                 type: string
 *               damage:
 *                 type: string
 *               internalNotes:
 *                 type: string
 *               signature:
 *                 type: string
 *               technician_signature:
 *                  type: string
 *               parts:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     quantity:
 *                       type: integer
 *               includesTravel:
 *                  type: boolean
 *     responses:
 *       201:
 *         description: Report created successfully
 *       400:
 *         description: Validation error
 */
router.post('/api/reports',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    validate(reportValidation.createReportSchema),
    reportController.createReport
);

/**
 * @swagger
 * /api/reports/{id}:
 *   put:
 *     summary: Update an existing report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The report ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               clientId:
 *                 type: integer
 *               equipmentId:
 *                 type: integer
 *               scheduleId:
 *                 type: integer
 *               technicianIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               serviceDate:
 *                 type: string
 *                 format: date-time
 *               hours:
 *                 type: number
 *               description:
 *                 type: string
 *               damage:
 *                 type: string
 *               internalNotes:
 *                 type: string
 *               signature:
 *                 type: string
 *               technician_signature:
 *                  type: string
 *               parts:
 *                 type: array
 *                 items:
 *                   type: object
 *               includesTravel:
 *                  type: boolean
 *     responses:
 *       200:
 *         description: Report updated successfully
 *       404:
 *         description: Report not found
 */
router.put('/api/reports/:id',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN]),
    validate(reportValidation.updateReportSchema),
    reportController.updateReport
);

/**
 * @swagger
 * /api/reports/{id}:
 *   delete:
 *     summary: Delete a report (Admin only)
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The report ID
 *     responses:
 *       204:
 *         description: Report deleted successfully
 *       404:
 *         description: Report not found
 */
router.delete('/api/reports/:id',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
    validate(reportValidation.reportIdSchema),
    reportController.deleteReport
);

// Report Attachments
router.get('/api/reports/:id/attachments',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.OFFICE_STAFF, UserRole.SUPER_ADMIN, UserRole.CLIENT]),
    reportAttachmentController.getReportAttachments
);

router.post('/api/reports/:id/attachments',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.TECHNICIAN, UserRole.SUPER_ADMIN]),
    upload.single('file'),
    reportAttachmentController.uploadReportAttachment
);

router.delete('/api/reports/attachments/:attachmentId',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
    reportAttachmentController.deleteReportAttachment
);

export default router;
