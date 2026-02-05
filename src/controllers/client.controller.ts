import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { catchAsync } from '../utils/catchAsync';
import { ApiError } from '../utils/ApiError';

export const getClients = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const search = req.query.search as string;
    let query = supabase
        .from('clients')
        .select('id, name, address, city, postCode, nif')
        .order('name', { ascending: true });

    if (search) {
        query = query.ilike('name', `%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw new ApiError(500, 'Failed to fetch clients', error.message);
    res.json(data ?? []);
});

export const createClient = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { name, address, city, postCode, nif } = req.body;
    const { data, error } = await supabase
        .from('clients')
        .insert({ name, address, city, postCode, nif })
        .select();
    if (error) throw new ApiError(500, 'Failed to create client', error.message);
    res.status(201).json(data?.[0]);
});

export const updateClient = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { name, address, city, postCode, nif } = req.body;

    const { data, error } = await supabase
        .from('clients')
        .update({ name, address, city, postCode, nif })
        .eq('id', id)
        .select();

    if (error) throw new ApiError(500, 'Failed to update client', error.message);
    res.json(data?.[0]);
});

export const deleteClient = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id);

    if (error) throw new ApiError(500, 'Failed to delete client', error.message);
    res.sendStatus(204);
});
