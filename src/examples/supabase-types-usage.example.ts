/**
 * Exemplo de como usar os tipos do Supabase nas novas funcionalidades
 */

import { Response } from 'express';
import { supabase } from '../config/supabase';
import {
    Profile as DbProfile,
    ClientInsert,
    Equipment as DbEquipment,
    PartUpdate,
    Tables
} from '../types/supabase';
import { catchAsync } from '../utils/catchAsync';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { logger } from '../utils/logger';

/**
 * 1. Exemplo de SELECT com tipos automáticos (v5)
 */
export const getMyProfileExample = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    // Agora não precisamos de 'as any'! O supabase client já conhece a Database
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', req.user?.id || '')
        .single();

    if (error) throw error;

    // profile já vem tipado automaticamente como DbProfile!
    logger.info({ firstName: profile.first_name }, 'Profile found:'); // Autocomplete ativo!
    res.json(profile);
});

/**
 * 2. Exemplo de INSERT com tipos
 */
export const createClientExample = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
    // Note: 'email' não existe na tabela clients real
    const newClient: ClientInsert = {
        name: 'Cliente Exemplo',
        nif: '123456789',
        address: 'Rua Exemplo, 123'
        // postCode, address, city são opcionais
    };

    const { data, error } = await supabase
        .from('clients')
        .insert(newClient)
        .select()
        .single();

    if (error) throw error;
    res.json(data);
});

/**
 * 3. Exemplo de UPDATE com tipos
 */
export const updatePartStockExample = async (partId: number, quantity: number) => {
    const update: PartUpdate = {
        stock_quantity: quantity
    };

    const { data, error } = await supabase
        .from('parts')
        .update(update)
        .eq('id', partId)
        .select();

    return { data, error };
};

/**
 * 4. Exemplo de uso de tipos genéricos (Tables)
 */
export const getEquipmentExample = async (id: number): Promise<Tables<'equipments'> | null> => {
    const { data } = await supabase
        .from('equipments')
        .select('*')
        .eq('id', id)
        .single();

    return data;
};
