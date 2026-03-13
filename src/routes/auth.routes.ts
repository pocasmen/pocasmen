//Horas de desenvolvimento activo=2,5
import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticateToken, authorizeRoles } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import * as authValidation from '../validations/auth.validation';
import { UserRole } from '../constants/enums';
import { authLimiter } from '../middlewares/rateLimiter.middleware';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and user management
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login a user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/auth/login', authLimiter, validate(authValidation.loginSchema), authController.login);

/**
 * @swagger
 * /auth/self-register:
 *   post:
 *     summary: Self-register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - first_name
 *               - last_name
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Registration request submitted
 */
router.post('/auth/self-register', authLimiter, validate(authValidation.selfRegisterSchema), authController.selfRegister);

/**
 * @swagger
 * /admin/invite-user:
 *   post:
 *     summary: Invite a new user (Admin only)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               role:
 *                 type: string
 *                 enum: [admin, technician, office_staff, client]
 *     responses:
 *       201:
 *         description: User invited successfully
 *       403:
 *         description: Forbidden
 */
router.post('/admin/invite-user',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OFFICE_STAFF, UserRole.TECHNICIAN]),
    validate(authValidation.inviteUserSchema),
    authController.inviteUser
);

/**
 * @swagger
 * /admin/pending-users:
 *   get:
 *     summary: List pending users (Admin only)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending users
 *       403:
 *         description: Forbidden
 */
router.get('/admin/pending-users',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
    authController.getPendingUsers
);

/**
 * @swagger
 * /admin/approve-user:
 *   post:
 *     summary: Approve a pending user (Admin only)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: User approved successfully
 *       403:
 *         description: Forbidden
 */
router.post('/admin/approve-user',
    authenticateToken,
    authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
    validate(authValidation.approveUserSchema),
    authController.approveUser
);

/**
 * @swagger
 * /admin/impersonate/{id}:
 *   get:
 *     summary: Retrieve user details for impersonation (Super Admin only)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID to impersonate
 *     responses:
 *       200:
 *         description: User found
 *       404:
 *         description: User not found
 */
router.get('/admin/impersonate/:id',
    authenticateToken,
    authorizeRoles([UserRole.SUPER_ADMIN]),
    authController.getImpersonatedUser
);

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Retrieve a list of external client users
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.get('/api/users', authenticateToken, authorizeRoles([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.OFFICE_STAFF]), (req, res, next) => {
    import('../controllers/technician.controller').then(tc => tc.getExternalUsers(req, res, next)).catch(next);
});

export default router;
