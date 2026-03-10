export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      billing_tasks: {
        Row: {
          id: number
          report_id: number
          status: string
          assigned_role: string
          notes: string | null
          billing_notes: string | null
          billed_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          report_id: number
          status?: string
          assigned_role?: string
          notes?: string | null
          billing_notes?: string | null
          billed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          report_id?: number
          status?: string
          assigned_role?: string
          notes?: string | null
          billing_notes?: string | null
          billed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_tasks_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          id: number
          name: string
          address: string | null
          nif: string | null
          postCode: string | null
          city: string | null
        }
        Insert: {
          id?: number
          name: string
          address?: string | null
          nif?: string | null
          postCode?: string | null
          city?: string | null
        }
        Update: {
          id?: number
          name?: string
          address?: string | null
          nif?: string | null
          postCode?: string | null
          city?: string | null
        }
        Relationships: []
      }
      part_components: {
        Row: {
          id: number
          parent_part_id: number
          child_part_id: number
          quantity: number
        }
        Insert: {
          id?: number
          parent_part_id: number
          child_part_id: number
          quantity?: number
        }
        Update: {
          id?: number
          parent_part_id?: number
          child_part_id?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "part_components_parent_part_id_fkey"
            columns: ["parent_part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_components_child_part_id_fkey"
            columns: ["child_part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      equipments: {
        Row: {
          id: number
          brand: string
          model: string | null
          serialNumber: string | null
          clientId: number
          additionalInfo: string | null
        }
        Insert: {
          id?: number
          brand: string
          model?: string | null
          serialNumber?: string | null
          clientId: number
          additionalInfo?: string | null
        }
        Update: {
          id?: number
          brand?: string
          model?: string | null
          serialNumber?: string | null
          clientId?: number
          additionalInfo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipments_clientId_fkey"
            columns: ["clientId"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          id: string
          first_name: string | null
          last_name: string | null
          phone_number: string | null
          client_id: number | null
          color: string | null
          created_at: string
          updated_at: string
          email: string | null
          role: string | null
          telegramchatid: string | null
          signature: string | null
          daily_notifications_enabled: boolean | null
          notification_time: string | null
          last_notification_sent: string | null
          phone: string | null
          google_calendar_color_id: string | null
          client_role: string | null
        }
        Insert: {
          id?: string
          first_name?: string | null
          last_name?: string | null
          phone_number?: string | null
          client_id?: number | null
          color?: string | null
          created_at?: string
          updated_at?: string
          email?: string | null
          role?: string | null
          telegramchatid?: string | null
          signature?: string | null
          daily_notifications_enabled?: boolean | null
          notification_time?: string | null
          last_notification_sent?: string | null
          phone?: string | null
          google_calendar_color_id?: string | null
          client_role?: string | null
        }
        Update: {
          id?: string
          first_name?: string | null
          last_name?: string | null
          phone_number?: string | null
          client_id?: number | null
          color?: string | null
          created_at?: string
          updated_at?: string
          email?: string | null
          role?: string | null
          telegramchatid?: string | null
          signature?: string | null
          daily_notifications_enabled?: boolean | null
          notification_time?: string | null
          last_notification_sent?: string | null
          phone?: string | null
          google_calendar_color_id?: string | null
          client_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_technicians: {
        Row: {
          scheduleId: number
          technicianId: string
        }
        Insert: {
          scheduleId: number
          technicianId: string
        }
        Update: {
          scheduleId?: number
          technicianId?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_technicians_scheduleId_fkey"
            columns: ["scheduleId"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      report_technicians: {
        Row: {
          reportId: number
          technicianId: string
          signature: string | null
        }
        Insert: {
          reportId: number
          technicianId: string
          signature?: string | null
        }
        Update: {
          reportId?: number
          technicianId?: string
          signature?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_technicians_reportid_fkey"
            columns: ["reportId"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_technicians_reportId_fkey"
            columns: ["reportId"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          value: string | null
        }
        Insert: {
          key: string
          value?: string | null
        }
        Update: {
          key?: string
          value?: string | null
        }
        Relationships: []
      }
      parts: {
        Row: {
          id: number
          reference: string
          designation: string
          stock_quantity: number
          reserved_quantity: number
          ordered_quantity: number
          is_composed: boolean | null
          stock_quantity_foss: number | null
          reserved_quantity_foss: number | null
          ordered_quantity_foss: number | null
          virtual_stock: number | null
          virtual_stock_foss: number | null
        }
        Insert: {
          id?: number
          reference: string
          designation: string
          stock_quantity?: number
          reserved_quantity?: number
          ordered_quantity?: number
          is_composed?: boolean | null
          stock_quantity_foss?: number | null
          reserved_quantity_foss?: number | null
          ordered_quantity_foss?: number | null
          virtual_stock?: number | null
          virtual_stock_foss?: number | null
        }
        Update: {
          id?: number
          reference?: string
          designation?: string
          stock_quantity?: number
          reserved_quantity?: number
          ordered_quantity?: number
          is_composed?: boolean | null
          stock_quantity_foss?: number | null
          reserved_quantity_foss?: number | null
          ordered_quantity_foss?: number | null
          virtual_stock?: number | null
          virtual_stock_foss?: number | null
        }
        Relationships: []
      }
      ticket_responses: {
        Row: {
          id: number
          ticket_id: number
          user_id: string
          message: string
          created_at: string
          isNew: boolean
        }
        Insert: {
          id?: number
          ticket_id: number
          user_id: string
          message: string
          created_at?: string
          isNew?: boolean
        }
        Update: {
          id?: number
          ticket_id?: number
          user_id?: string
          message?: string
          created_at?: string
          isNew?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ticket_responses_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_time_blocks: {
        Row: {
          id: number
          schedule_id: number
          start_time: string
          end_time: string
          created_at: string | null
          google_event_id: string | null
        }
        Insert: {
          id?: number
          schedule_id: number
          start_time: string
          end_time: string
          created_at?: string | null
          google_event_id?: string | null
        }
        Update: {
          id?: number
          schedule_id?: number
          start_time?: string
          end_time?: string
          created_at?: string | null
          google_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_time_blocks_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_parts: {
        Row: {
          scheduleId: number
          partId: number
          quantity: number
          stock_type: string | null
          is_applied: boolean | null
        }
        Insert: {
          scheduleId: number
          partId: number
          quantity: number
          stock_type?: string | null
          is_applied?: boolean | null
        }
        Update: {
          scheduleId?: number
          partId?: number
          quantity?: number
          stock_type?: string | null
          is_applied?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_parts_scheduleId_fkey"
            columns: ["scheduleId"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_parts_partId_fkey"
            columns: ["partId"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          id: number
          client_id: number
          equipmentId: number
          faultDescription: string | null
          status: string
          scheduleId: number | null
          createdAt: string
          updatedAt: string
          created_by_user_id: string | null
          responsible_technician_id: string | null
          scheduled_at: string | null
          title: string | null
        }
        Insert: {
          id?: number
          client_id: number
          equipmentId: number
          faultDescription?: string | null
          status?: string
          scheduleId?: number | null
          createdAt?: string
          updatedAt?: string
          created_by_user_id?: string | null
          responsible_technician_id?: string | null
          scheduled_at?: string | null
          title?: string | null
        }
        Update: {
          id?: number
          client_id?: number
          equipmentId?: number
          faultDescription?: string | null
          status?: string
          scheduleId?: number | null
          createdAt?: string
          updatedAt?: string
          created_by_user_id?: string | null
          responsible_technician_id?: string | null
          scheduled_at?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_equipmentId_fkey"
            columns: ["equipmentId"]
            isOneToOne: false
            referencedRelation: "equipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_scheduleId_fkey"
            columns: ["scheduleId"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_responsible_technician_id_fkey"
            columns: ["responsible_technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_attachments: {
        Row: {
          id: string
          ticket_id: number
          file_name: string
          mime_type: string
          storage_path: string
          uploaded_by_user_id: string
          created_at: string | null
        }
        Insert: {
          id?: string
          ticket_id: number
          file_name: string
          mime_type: string
          storage_path: string
          uploaded_by_user_id: string
          created_at?: string | null
        }
        Update: {
          id?: string
          ticket_id?: number
          file_name?: string
          mime_type?: string
          storage_path?: string
          uploaded_by_user_id?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_uploaded_by_user_id_fkey"
            columns: ["uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          id: number
          title: string
          startDate: string | null
          endDate: string | null
          clientId: number | null
          equipmentId: number | null
          isCompleted: boolean | null
          hasReport: boolean | null
          additionalInfo: string | null
          serviceType: Json | null
          acknowledgementState: string | null
          ticketId: number | null
          includes_travel: boolean | null
          classification: string | null
          priority: string | null
        }
        Insert: {
          id?: number
          title: string
          startDate?: string | null
          endDate?: string | null
          clientId?: number | null
          equipmentId?: number | null
          isCompleted?: boolean | null
          hasReport?: boolean | null
          additionalInfo?: string | null
          serviceType?: Json | null
          acknowledgementState?: string | null
          ticketId?: number | null
          includes_travel?: boolean | null
          classification?: string | null
          priority?: string | null
        }
        Update: {
          id?: number
          title?: string
          startDate?: string | null
          endDate?: string | null
          clientId?: number | null
          equipmentId?: number | null
          isCompleted?: boolean | null
          hasReport?: boolean | null
          additionalInfo?: string | null
          serviceType?: Json | null
          acknowledgementState?: string | null
          ticketId?: number | null
          includes_travel?: boolean | null
          classification?: string | null
          priority?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedules_clientId_fkey"
            columns: ["clientId"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_equipmentId_fkey"
            columns: ["equipmentId"]
            isOneToOne: false
            referencedRelation: "equipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_ticketId_fkey"
            columns: ["ticketId"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          id: number
          clientId: number | null
          equipmentId: number | null
          serviceDate: string | null
          hours: number | null
          description: string | null
          scheduleId: number | null
          serviceType: Json | null
          damage: string | null
          internal_notes: string | null
          report_number: number | null
          signature: string | null
          technician_signature: string | null
          includes_travel: boolean | null
          classification: string | null
          deleted_at: string | null
          deleted_by: string | null
          created_by: string | null
          billing_status: string | null
          time_blocks: Json | null
          client_signer_name: string | null
        }
        Insert: {
          id?: number
          clientId?: number | null
          equipmentId?: number | null
          serviceDate?: string | null
          hours?: number | null
          description?: string | null
          scheduleId?: number | null
          serviceType?: Json | null
          damage?: string | null
          internal_notes?: string | null
          report_number?: number | null
          signature?: string | null
          technician_signature?: string | null
          includes_travel?: boolean | null
          classification?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          created_by?: string | null
          billing_status?: string | null
          time_blocks?: Json | null
          client_signer_name?: string | null
        }
        Update: {
          id?: number
          clientId?: number | null
          equipmentId?: number | null
          serviceDate?: string | null
          hours?: number | null
          description?: string | null
          scheduleId?: number | null
          serviceType?: Json | null
          damage?: string | null
          internal_notes?: string | null
          report_number?: number | null
          signature?: string | null
          technician_signature?: string | null
          includes_travel?: boolean | null
          classification?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          created_by?: string | null
          billing_status?: string | null
          time_blocks?: Json | null
          client_signer_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_clientId_fkey"
            columns: ["clientId"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_equipmentId_fkey"
            columns: ["equipmentId"]
            isOneToOne: false
            referencedRelation: "equipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_scheduleid_fkey"
            columns: ["scheduleId"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_parts: {
        Row: {
          reportId: number
          partId: number
          quantity: number
          stock_type: string | null
        }
        Insert: {
          reportId: number
          partId: number
          quantity: number
          stock_type?: string | null
        }
        Update: {
          reportId?: number
          partId?: number
          quantity?: number
          stock_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_parts_partid_fkey"
            columns: ["partId"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_parts_reportid_fkey"
            columns: ["reportId"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_tasks: {
        Row: {
          id: number
          user_id: string
          created_by: string
          title: string
          description: string
          type: string
          priority: string
          client_id: number | null
          equipment_id: number | null
          is_private: boolean
          show_on_calendar: boolean
          estimated_hours: number | null
          created_at: string
          updated_at: string
          completed: boolean | null
          completed_at: string | null
        }
        Insert: {
          id?: number
          user_id: string
          created_by: string
          title: string
          description: string
          type: string
          priority: string
          client_id?: number | null
          equipment_id?: number | null
          is_private?: boolean
          show_on_calendar?: boolean
          estimated_hours?: number | null
          created_at?: string
          updated_at?: string
          completed?: boolean | null
          completed_at?: string | null
        }
        Update: {
          id?: number
          user_id?: string
          created_by?: string
          title?: string
          description?: string
          type?: string
          priority?: string
          client_id?: number | null
          equipment_id?: number | null
          is_private?: boolean
          show_on_calendar?: boolean
          estimated_hours?: number | null
          created_at?: string
          updated_at?: string
          completed?: boolean | null
          completed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "internal_tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_tasks_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipments"
            referencedColumns: ["id"]
          }
        ]
      }
      internal_task_time_blocks: {
        Row: {
          id: number
          task_id: number
          start_time: string
          end_time: string
        }
        Insert: {
          id?: number
          task_id: number
          start_time: string
          end_time: string
        }
        Update: {
          id?: number
          task_id?: number
          start_time?: string
          end_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_task_time_blocks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "internal_tasks"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
