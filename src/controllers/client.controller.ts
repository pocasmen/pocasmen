//Horas de desenvolvimento activo=4,0
import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { catchAsync } from '../utils/catchAsync';
import { ApiError, NotFoundError } from '../utils/ApiError';
import { withTransaction } from '../config/db';
import { Client, ClientInsert, ClientUpdate } from '../types/supabase';

export const getClients = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const search = req.query.search as string;

    let query = supabase
        .from('clients')
        .select('*');

    if (search) {
        query = query.ilike('name', `%${search}%`);
    }

    const { data, error } = await query.order('name', { ascending: true });

    if (error) throw new ApiError(500, 'Failed to fetch clients', error.message);
    res.json(data ?? []);
});

export const createClient = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { name, address, city, postCode, nif } = req.body;

    const result = await withTransaction(req, async (db) => {
        const { rows } = await db.query<Client>(
            'INSERT INTO clients (name, address, city, "postCode", nif) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [name, address, city, postCode, nif]
        );
        return rows[0];
    });

    res.status(201).json(result);
});

export const updateClient = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { name, address, city, postCode, nif } = req.body;

    const result = await withTransaction(req, async (db) => {
        const { rows, rowCount } = await db.query<Client>(
            'UPDATE clients SET name = $1, address = $2, city = $3, "postCode" = $4, nif = $5 WHERE id = $6 RETURNING *',
            [name, address, city, postCode, nif, Number(id)]
        );
        if (rowCount === 0) throw new NotFoundError('Cliente não encontrado.');
        return rows[0];
    });

    res.json(result);
});

export const deleteClient = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    await withTransaction(req, async (db) => {
        const { rowCount } = await db.query('DELETE FROM clients WHERE id = $1', [Number(id)]);
        if (rowCount === 0) throw new NotFoundError('Cliente não encontrado.');
    });

    res.sendStatus(204);
});
