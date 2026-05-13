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
          invoice_number: string | null
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
          invoice_number?: string | null
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
          invoice_number?: string | null
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
      report_attachments: {
        Row: {
          id: string
          report_id: number | null
          file_name: string
          mime_type: string
          storage_path: string
          uploaded_by_user_id: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          report_id?: number | null
          file_name: string
          mime_type: string
          storage_path: string
          uploaded_by_user_id?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          report_id?: number | null
          file_name?: string
          mime_type?: string
          storage_path?: string
          uploaded_by_user_id?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_attachments_report_id_fkey"
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
          nickname: string | null
          is_blacklisted: boolean | null
          blacklist_reason: string | null
        }
        Insert: {
          id?: number
          name: string
          address?: string | null
          nif?: string | null
          postCode?: string | null
          city?: string | null
          nickname?: string | null
          is_blacklisted?: boolean | null
          blacklist_reason?: string | null
        }
        Update: {
          id?: number
          name?: string
          address?: string | null
          nif?: string | null
          postCode?: string | null
          city?: string | null
          nickname?: string | null
          is_blacklisted?: boolean | null
          blacklist_reason?: string | null
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
      invoices: {
        Row: {
          id: string
          invoice_number: string
          customer_name: string | null
          customer_nif: string | null
          vendor: string | null
          issue_date: string | null
          due_date: string | null
          reference: string | null
          incidence: number | null
          vat_total: number | null
          total_value: number | null
          file_url: string | null
          billing_task_id: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          invoice_number: string
          customer_name?: string | null
          customer_nif?: string | null
          vendor?: string | null
          issue_date?: string | null
          due_date?: string | null
          reference?: string | null
          incidence?: number | null
          vat_total?: number | null
          total_value?: number | null
          file_url?: string | null
          billing_task_id?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          invoice_number?: string
          customer_name?: string | null
          customer_nif?: string | null
          vendor?: string | null
          issue_date?: string | null
          due_date?: string | null
          reference?: string | null
          incidence?: number | null
          vat_total?: number | null
          total_value?: number | null
          file_url?: string | null
          billing_task_id?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_billing_task_id_fkey"
            columns: ["billing_task_id"]
            isOneToOne: false
            referencedRelation: "billing_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          id: string
          invoice_id: string
          code: string | null
          description: string | null
          quantity: number | null
          unit_price: number | null
          total_price: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          invoice_id: string
          code?: string | null
          description?: string | null
          quantity?: number | null
          unit_price?: number | null
          total_price?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          invoice_id?: string
          code?: string | null
          description?: string | null
          quantity?: number | null
          unit_price?: number | null
          total_price?: number | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          id: string
          first_name: string | null
          last_name: string | null
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
          notification_prefs: Json | null
        }
        Insert: {
          id?: string
          first_name?: string | null
          last_name?: string | null
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
          notification_prefs?: Json | null
        }
        Update: {
          id?: string
          first_name?: string | null
          last_name?: string | null
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
          notification_prefs?: Json | null
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
      client_users: {
        Row: {
          id: string
          user_id: string
          client_id: number
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          client_id: number
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          client_id?: number
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      equipment_ownership: {
        Row: {
          id: number
          equipment_id: number
          client_id: number
          start_date: string
          end_date: string | null
          created_at: string | null
        }
        Insert: {
          id?: number
          equipment_id: number
          client_id: number
          start_date?: string
          end_date?: string | null
          created_at?: string | null
        }
        Update: {
          id?: number
          equipment_id?: number
          client_id?: number
          start_date?: string
          end_date?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_ownership_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_ownership_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
          status: string | null
          nickname: string | null
        }
        Insert: {
          id?: number
          brand: string
          model?: string | null
          serialNumber?: string | null
          clientId: number
          additionalInfo?: string | null
          status?: string | null
          nickname?: string | null
        }
        Update: {
          id?: number
          brand?: string
          model?: string | null
          serialNumber?: string | null
          clientId?: number
          additionalInfo?: string | null
          status?: string | null
          nickname?: string | null
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
          min_stock: number | null
          min_stock_foss: number | null
          image_path: string | null
          price: number | null
          notes: string | null
          deleted_at: string | null
          deleted_by: string | null
          track_stock: boolean | null
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
          min_stock?: number | null
          min_stock_foss?: number | null
          image_path?: string | null
          price?: number | null
          notes?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          track_stock?: boolean | null
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
          min_stock?: number | null
          min_stock_foss?: number | null
          image_path?: string | null
          price?: number | null
          notes?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          track_stock?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_order_items: {
        Row: {
          id: number
          order_id: number
          part_id: number
          designation: string | null
          quantity_ordered: number
          quantity_received: number
          stock_type: string
          created_at: string | null
        }
        Insert: {
          id?: number
          order_id: number
          part_id: number
          designation?: string | null
          quantity_ordered: number
          quantity_received?: number
          stock_type: string
          created_at?: string | null
        }
        Update: {
          id?: number
          order_id?: number
          part_id?: number
          designation?: string | null
          quantity_ordered?: number
          quantity_received?: number
          stock_type?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "parts_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_order_items_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_orders: {
        Row: {
          id: number
          document_number: string
          user_id: string | null
          status: any
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          document_number: string
          user_id?: string | null
          status?: any
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          document_number?: string
          user_id?: string | null
          status?: any
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      audit_logs: {
        Row: {
          id: string
          table_name: string
          record_id: string | null
          operation: string
          old_data: Json | null
          new_data: Json | null
          changed_by: string | null
          changed_at: string | null
          changed_by_name: string | null
        }
        Insert: {
          id?: string
          table_name: string
          record_id?: string | null
          operation: string
          old_data?: Json | null
          new_data?: Json | null
          changed_by?: string | null
          changed_at?: string | null
          changed_by_name?: string | null
        }
        Update: {
          id?: string
          table_name?: string
          record_id?: string | null
          operation?: string
          old_data?: Json | null
          new_data?: Json | null
          changed_by?: string | null
          changed_at?: string | null
          changed_by_name?: string | null
        }
        Relationships: []
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
          designation: string
        }
        Insert: {
          scheduleId: number
          partId: number
          quantity: number
          stock_type?: string | null
          is_applied?: boolean | null
          designation?: string
        }
        Update: {
          scheduleId?: number
          partId?: number
          quantity?: number
          stock_type?: string | null
          is_applied?: boolean | null
          designation?: string
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
      auth_audit_logs: {
        Row: {
          id: number
          timestamp: string | null
          email: string
          status: string
          ip: string | null
          user_agent: string | null
          reason: string | null
          user_id: string | null
          created_at: string | null
        }
        Insert: {
          id?: number
          timestamp?: string | null
          email: string
          status: string
          ip?: string | null
          user_agent?: string | null
          reason?: string | null
          user_id?: string | null
          created_at?: string | null
        }
        Update: {
          id?: number
          timestamp?: string | null
          email?: string
          status?: string
          ip?: string | null
          user_agent?: string | null
          reason?: string | null
          user_id?: string | null
          created_at?: string | null
        }
        Relationships: []
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
          created_at: string | null
          updated_at: string | null
          created_by: string | null
          updated_by: string | null
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
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          updated_by?: string | null
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
          created_at?: string | null
          updated_at?: string | null
          created_by?: string | null
          updated_by?: string | null
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
          {
            foreignKeyName: "schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          },
        ]
      }
      report_parts: {
        Row: {
          reportId: number
          partId: number
          quantity: number
          stock_type: string | null
          designation: string
        }
        Insert: {
          reportId: number
          partId: number
          quantity: number
          stock_type?: string | null
          designation?: string
        }
        Update: {
          reportId?: number
          partId?: number
          quantity?: number
          stock_type?: string | null
          designation?: string
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
      parts_transactions: {
        Row: {
          id: number
          part_id: number
          user_id: string | null
          quantity: number
          stock_type: string
          type: any
          reference_id: string | null
          notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: number
          part_id: number
          user_id?: string | null
          quantity: number
          stock_type: string
          type: any
          reference_id?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: number
          part_id?: number
          user_id?: string | null
          quantity?: number
          stock_type?: string
          type?: any
          reference_id?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_transactions_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          created_at: string | null
          updated_at: string | null
          updated_by: string | null
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
          created_at?: string | null
          updated_at?: string | null
          updated_by?: string | null
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
          created_at?: string | null
          updated_at?: string | null
          updated_by?: string | null
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
            foreignKeyName: "reports_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          updated_by: string | null
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
          updated_by?: string | null
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
          updated_by?: string | null
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
          },
          {
            foreignKeyName: "internal_tasks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
