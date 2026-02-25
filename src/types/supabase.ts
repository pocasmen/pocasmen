/**
 * Helper types para facilitar o uso dos tipos do Supabase
 */

import { Database } from './db.types';

// Tipos de tabelas
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];

// Tipos específicos de cada tabela (para facilitar imports)
export type Profile = Tables<'profiles'>;
export type ProfileInsert = TablesInsert<'profiles'>;
export type ProfileUpdate = TablesUpdate<'profiles'>;

export type Client = Tables<'clients'>;
export type ClientInsert = TablesInsert<'clients'>;
export type ClientUpdate = TablesUpdate<'clients'>;

export type Equipment = Tables<'equipments'>;
export type EquipmentInsert = TablesInsert<'equipments'>;
export type EquipmentUpdate = TablesUpdate<'equipments'>;

export type Part = Tables<'parts'>;
export type PartInsert = TablesInsert<'parts'>;
export type PartUpdate = TablesUpdate<'parts'>;

export type PartComponent = Tables<'part_components'>;
export type PartComponentInsert = TablesInsert<'part_components'>;
export type PartComponentUpdate = TablesUpdate<'part_components'>;

export type Schedule = Tables<'schedules'>;
export type ScheduleInsert = TablesInsert<'schedules'>;
export type ScheduleUpdate = TablesUpdate<'schedules'>;

export type ScheduleTechnician = Tables<'schedule_technicians'>;
export type ScheduleTechnicianInsert = TablesInsert<'schedule_technicians'>;
export type ScheduleTechnicianUpdate = TablesUpdate<'schedule_technicians'>;

export type SchedulePart = Tables<'schedule_parts'>;
export type SchedulePartInsert = TablesInsert<'schedule_parts'>;
export type SchedulePartUpdate = TablesUpdate<'schedule_parts'>;

export type ScheduleTimeBlock = Tables<'schedule_time_blocks'>;
export type ScheduleTimeBlockInsert = TablesInsert<'schedule_time_blocks'>;
export type ScheduleTimeBlockUpdate = TablesUpdate<'schedule_time_blocks'>;

export type Report = Tables<'reports'>;
export type ReportInsert = TablesInsert<'reports'>;
export type ReportUpdate = TablesUpdate<'reports'>;

export type ReportTechnician = Tables<'report_technicians'>;
export type ReportTechnicianInsert = TablesInsert<'report_technicians'>;
export type ReportTechnicianUpdate = TablesUpdate<'report_technicians'>;

export type ReportPart = Tables<'report_parts'>;
export type ReportPartInsert = TablesInsert<'report_parts'>;
export type ReportPartUpdate = TablesUpdate<'report_parts'>;

export type Ticket = Tables<'tickets'>;
export type TicketInsert = TablesInsert<'tickets'>;
export type TicketUpdate = TablesUpdate<'tickets'>;

export type BillingTask = Tables<'billing_tasks'>;
export type BillingTaskInsert = TablesInsert<'billing_tasks'>;
export type BillingTaskUpdate = TablesUpdate<'billing_tasks'>;

export type AppSetting = Tables<'settings'>;
export type AppSettingInsert = TablesInsert<'settings'>;
export type AppSettingUpdate = TablesUpdate<'settings'>;

export type InternalTask = Tables<'internal_tasks'>;
export type InternalTaskInsert = TablesInsert<'internal_tasks'>;
export type InternalTaskUpdate = TablesUpdate<'internal_tasks'>;

export type InternalTaskTimeBlock = Tables<'internal_task_time_blocks'>;
export type InternalTaskTimeBlockInsert = TablesInsert<'internal_task_time_blocks'>;
export type InternalTaskTimeBlockUpdate = TablesUpdate<'internal_task_time_blocks'>;

// Re-export do tipo Database para uso direto
export type { Database } from './db.types';
