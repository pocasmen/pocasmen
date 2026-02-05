import { z } from 'zod';

export const updateSettingsSchema = z.object({
    body: z.record(z.string(), z.any())
});
