//Horas de desenvolvimento activo=4,5
import { Request, Response, NextFunction } from 'express';
import { User } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase';
import { UserRole } from '../constants/enums';

export interface AuthenticatedRequest extends Request {
    user?: User;
    originalUser?: User;
    file?: Express.Multer.File;
}

// ─── JWT Secret (Supabase signs tokens with SUPABASE_JWT_SECRET) ──────────────
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
if (!JWT_SECRET) {
    console.warn('[auth] ⚠️  SUPABASE_JWT_SECRET não definido — a usar supabase.auth.getUser (lento) em cada request.');
} else {
    console.info('[auth] ✅ SUPABASE_JWT_SECRET carregado — verificação JWT local activa (sem chamadas de rede).');
}

// ─── Simple LRU-TTL cache for impersonation lookups ───────────────────────────
const IMPERSONATE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const impersonateCache = new Map<string, { user: User; expiresAt: number }>();

function getCachedImpersonation(userId: string): User | null {
    const entry = impersonateCache.get(userId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        impersonateCache.delete(userId);
        return null;
    }
    return entry.user;
}

function setCachedImpersonation(userId: string, user: User): void {
    // Limit cache size to 50 entries to avoid memory leaks
    if (impersonateCache.size >= 50) {
        const firstKey = impersonateCache.keys().next().value;
        if (firstKey) impersonateCache.delete(firstKey);
    }
    impersonateCache.set(userId, { user, expiresAt: Date.now() + IMPERSONATE_CACHE_TTL_MS });
}

// ─── Local JWT verification (zero network calls) ──────────────────────────────
function verifyTokenLocally(token: string): User | null {
    if (!JWT_SECRET) return null;
    try {
        const payload = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
        // Reconstruct a User-compatible object from JWT claims
        return {
            id: payload.sub as string,
            aud: payload.aud as string,
            role: (payload.role as string) ?? 'authenticated',
            email: payload.email as string | undefined,
            phone: payload.phone as string | undefined,
            app_metadata: (payload.app_metadata as Record<string, unknown>) ?? {},
            user_metadata: (payload.user_metadata as Record<string, unknown>) ?? {},
            created_at: (payload.iat
                ? new Date((payload.iat as number) * 1000).toISOString()
                : new Date().toISOString()),
            updated_at: (payload.updated_at as string | undefined),
            last_sign_in_at: (payload.last_sign_in_at as string | undefined),
            identities: [],
            factors: [],
        } as unknown as User;
    } catch {
        return null;
    }
}

// ─── Main middleware ───────────────────────────────────────────────────────────
export const authenticateToken = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) return res.sendStatus(401);

        // 1️⃣ Try local verification first (no network)
        let user = verifyTokenLocally(token);

        // 2️⃣ Fallback: call Supabase only if local secret not configured
        if (!user) {
            console.debug(`[auth:SUPABASE] ${req.method} ${req.path} — chamada de rede ao Supabase`);
            const { data, error } = await supabase.auth.getUser(token);
            if (error || !data.user) return res.sendStatus(403);
            user = data.user;
        } else {
            console.debug(`[auth:LOCAL] ${req.method} ${req.path} — JWT verificado localmente ✅`);
        }

        req.user = user;
        req.originalUser = user;

        // 3️⃣ Impersonation — cached to avoid repeated admin API calls
        const impersonateId = req.headers['x-impersonate-user'];
        if (impersonateId && typeof impersonateId === 'string') {
            if (user.user_metadata?.role === UserRole.SUPER_ADMIN) {
                const cached = getCachedImpersonation(impersonateId);
                if (cached) {
                    req.user = cached;
                } else {
                    const { data: { user: impersonatedUser }, error: impError } =
                        await supabase.auth.admin.getUserById(impersonateId);
                    if (!impError && impersonatedUser) {
                        setCachedImpersonation(impersonateId, impersonatedUser);
                        req.user = impersonatedUser;
                    }
                }
            }
        }

        next();
    } catch (err) {
        next(err);
    }
};

// ─── RBAC helper ──────────────────────────────────────────────────────────────
export const authorizeRoles = (roles: Array<UserRole>) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const userRole = req.user?.user_metadata?.role;
        if (!req.user || !userRole || !roles.includes(userRole as UserRole)) {
            return res.status(403).json({ error: 'Permission denied for this role.' });
        }
        next();
    };
};
