export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          business_name: string
          default_priority: number
          id: number
          late_threshold_minutes: number
          qr_image_path: string | null
          timezone: string
          updated_at: string
          upi_id: string | null
        }
        Insert: {
          business_name?: string
          default_priority?: number
          id?: number
          late_threshold_minutes?: number
          qr_image_path?: string | null
          timezone?: string
          updated_at?: string
          upi_id?: string | null
        }
        Update: {
          business_name?: string
          default_priority?: number
          id?: number
          late_threshold_minutes?: number
          qr_image_path?: string | null
          timezone?: string
          updated_at?: string
          upi_id?: string | null
        }
        Relationships: []
      }
      bills: {
        Row: {
          bill_code: string
          bill_date: string
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          task_id: string
          total_amount: number
        }
        Insert: {
          bill_code?: string
          bill_date?: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          task_id: string
          total_amount: number
        }
        Update: {
          bill_code?: string
          bill_date?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          task_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "bills_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "bills_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "bills_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "delivery_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_empty_can_txns: {
        Row: {
          created_at: string
          customer_id: string
          employee_id: string | null
          id: string
          new_balance: number
          notes: string | null
          performed_by: string | null
          previous_balance: number
          quantity: number
          task_id: string | null
          txn_code: string
          txn_type: Database["public"]["Enums"]["empty_can_txn_type"]
        }
        Insert: {
          created_at?: string
          customer_id: string
          employee_id?: string | null
          id?: string
          new_balance: number
          notes?: string | null
          performed_by?: string | null
          previous_balance: number
          quantity: number
          task_id?: string | null
          txn_code?: string
          txn_type: Database["public"]["Enums"]["empty_can_txn_type"]
        }
        Update: {
          created_at?: string
          customer_id?: string
          employee_id?: string | null
          id?: string
          new_balance?: number
          notes?: string | null
          performed_by?: string | null
          previous_balance?: number
          quantity?: number
          task_id?: string | null
          txn_code?: string
          txn_type?: Database["public"]["Enums"]["empty_can_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "customer_empty_can_txns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_empty_can_txns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_empty_can_txns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_empty_can_txns_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employee_stats"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "customer_empty_can_txns_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_empty_can_txns_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "delivery_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_items: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          item_name: string
          price: number
          product_id: string
          sort_order: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          item_name: string
          price: number
          product_id: string
          sort_order?: number
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          item_name?: string
          price?: number
          product_id?: string
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_items_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_items_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_items_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string
          custom_type: string | null
          customer_code: string
          customer_type: Database["public"]["Enums"]["customer_type"]
          empty_cans_balance: number
          id: string
          joined_at: string
          mobile: string
          name: string
          notes: string | null
          price_per_can: number
          price_per_packet: number
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          address: string
          custom_type?: string | null
          customer_code?: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
          empty_cans_balance?: number
          id?: string
          joined_at?: string
          mobile: string
          name: string
          notes?: string | null
          price_per_can?: number
          price_per_packet?: number
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          address?: string
          custom_type?: string | null
          customer_code?: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
          empty_cans_balance?: number
          id?: string
          joined_at?: string
          mobile?: string
          name?: string
          notes?: string | null
          price_per_can?: number
          price_per_packet?: number
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: []
      }
      delivery_items: {
        Row: {
          customer_item_id: string | null
          delivered_qty: number | null
          id: string
          line_total: number | null
          product_id: string
          product_kind: Database["public"]["Enums"]["product_kind"]
          product_name: string
          requested_qty: number
          task_id: string
          unit: string
          unit_price: number
        }
        Insert: {
          customer_item_id?: string | null
          delivered_qty?: number | null
          id?: string
          line_total?: number | null
          product_id: string
          product_kind: Database["public"]["Enums"]["product_kind"]
          product_name: string
          requested_qty: number
          task_id: string
          unit: string
          unit_price?: number
        }
        Update: {
          customer_item_id?: string | null
          delivered_qty?: number | null
          id?: string
          line_total?: number | null
          product_id?: string
          product_kind?: Database["public"]["Enums"]["product_kind"]
          product_name?: string
          requested_qty?: number
          task_id?: string
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_items_customer_item_id_fkey"
            columns: ["customer_item_id"]
            isOneToOne: false
            referencedRelation: "customer_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "delivery_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_logs: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["task_status"] | null
          id: string
          note: string | null
          task_id: string
          to_status: Database["public"]["Enums"]["task_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["task_status"] | null
          id?: string
          note?: string | null
          task_id: string
          to_status: Database["public"]["Enums"]["task_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["task_status"] | null
          id?: string
          note?: string | null
          task_id?: string
          to_status?: Database["public"]["Enums"]["task_status"]
        }
        Relationships: [
          {
            foreignKeyName: "delivery_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "delivery_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_tasks: {
        Row: {
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          created_by: string | null
          customer_code: string
          customer_id: string
          customer_name: string
          customer_phone: string
          delivery_address: string
          duration_seconds: number | null
          employee_id: string
          empty_cans_returned: number
          failure_reason: string | null
          hold_reason: string | null
          id: string
          notes: string | null
          priority: number
          scheduled_date: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_code: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          customer_code: string
          customer_id: string
          customer_name: string
          customer_phone: string
          delivery_address: string
          duration_seconds?: number | null
          employee_id: string
          empty_cans_returned?: number
          failure_reason?: string | null
          hold_reason?: string | null
          id?: string
          notes?: string | null
          priority?: number
          scheduled_date?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_code?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          customer_code?: string
          customer_id?: string
          customer_name?: string
          customer_phone?: string
          delivery_address?: string
          duration_seconds?: number | null
          employee_id?: string
          empty_cans_returned?: number
          failure_reason?: string | null
          hold_reason?: string | null
          id?: string
          notes?: string | null
          priority?: number
          scheduled_date?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "delivery_tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "delivery_tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tasks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employee_stats"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "delivery_tasks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_permissions: {
        Row: {
          can_complete_delivery: boolean
          can_hold_delivery: boolean
          can_report_failure: boolean
          can_start_delivery: boolean
          can_view_history: boolean
          employee_id: string
          updated_at: string
        }
        Insert: {
          can_complete_delivery?: boolean
          can_hold_delivery?: boolean
          can_report_failure?: boolean
          can_start_delivery?: boolean
          can_view_history?: boolean
          employee_id: string
          updated_at?: string
        }
        Update: {
          can_complete_delivery?: boolean
          can_hold_delivery?: boolean
          can_report_failure?: boolean
          can_start_delivery?: boolean
          can_view_history?: boolean
          employee_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_permissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employee_stats"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "employee_permissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          contact_email: string | null
          employee_code: string
          id: string
          joined_at: string
          mobile: string
          name: string
          role_title: string
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
          user_id: string | null
          username: string
        }
        Insert: {
          contact_email?: string | null
          employee_code?: string
          id?: string
          joined_at?: string
          mobile: string
          name: string
          role_title?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          user_id?: string | null
          username: string
        }
        Update: {
          contact_email?: string | null
          employee_code?: string
          id?: string
          joined_at?: string
          mobile?: string
          name?: string
          role_title?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          user_id?: string | null
          username?: string
        }
        Relationships: []
      }
      inventory_transactions: {
        Row: {
          created_at: string
          id: string
          new_stock: number
          notes: string | null
          performed_by: string | null
          previous_stock: number
          product_id: string
          quantity: number
          task_id: string | null
          txn_code: string
          txn_type: Database["public"]["Enums"]["txn_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          new_stock: number
          notes?: string | null
          performed_by?: string | null
          previous_stock: number
          product_id: string
          quantity: number
          task_id?: string | null
          txn_code?: string
          txn_type: Database["public"]["Enums"]["txn_type"]
        }
        Update: {
          created_at?: string
          id?: string
          new_stock?: number
          notes?: string | null
          performed_by?: string | null
          previous_stock?: number
          product_id?: string
          quantity?: number
          task_id?: string | null
          txn_code?: string
          txn_type?: Database["public"]["Enums"]["txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "delivery_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount: number
          bill_id: string
          created_at: string
          created_by: string | null
          id: string
          payment_id: string
        }
        Insert: {
          amount: number
          bill_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          payment_id: string
        }
        Update: {
          amount?: number
          bill_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bill_balances"
            referencedColumns: ["bill_id"]
          },
          {
            foreignKeyName: "payment_allocations_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payment_balances"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          collected_by: string | null
          created_at: string
          customer_id: string
          employee_id: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          paid_at: string
          payment_code: string
          reference_no: string | null
          reverses_payment_id: string | null
          task_id: string | null
        }
        Insert: {
          amount: number
          collected_by?: string | null
          created_at?: string
          customer_id: string
          employee_id?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string
          payment_code?: string
          reference_no?: string | null
          reverses_payment_id?: string | null
          task_id?: string | null
        }
        Update: {
          amount?: number
          collected_by?: string | null
          created_at?: string
          customer_id?: string
          employee_id?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string
          payment_code?: string
          reference_no?: string | null
          reverses_payment_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employee_stats"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_reverses_payment_id_fkey"
            columns: ["reverses_payment_id"]
            isOneToOne: true
            referencedRelation: "payment_balances"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "payments_reverses_payment_id_fkey"
            columns: ["reverses_payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "delivery_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          available_quantity: number
          created_at: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["product_kind"]
          min_stock_level: number
          name: string
          product_code: string
          unit: string
          updated_at: string
        }
        Insert: {
          available_quantity?: number
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["product_kind"]
          min_stock_level?: number
          name: string
          product_code?: string
          unit?: string
          updated_at?: string
        }
        Update: {
          available_quantity?: number
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["product_kind"]
          min_stock_level?: number
          name?: string
          product_code?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      bill_balances: {
        Row: {
          amount_paid: number | null
          bill_code: string | null
          bill_date: string | null
          bill_id: string | null
          customer_id: string | null
          outstanding: number | null
          payment_status: string | null
          task_id: string | null
          total_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "bills_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "bills_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "delivery_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_balances: {
        Row: {
          bill_count: number | null
          customer_id: string | null
          empty_cans_balance: number | null
          empty_collected: number | null
          empty_issued: number | null
          last_payment_at: string | null
          outstanding: number | null
          partial_bills: number | null
          total_allocated: number | null
          total_billed: number | null
          total_received: number | null
          unapplied_credit: number | null
          unpaid_bills: number | null
        }
        Relationships: []
      }
      customer_stats: {
        Row: {
          customer_id: string | null
          delivery_days: number | null
          last_delivery_at: string | null
          total_cans: number | null
          total_deliveries: number | null
          total_packets: number | null
        }
        Relationships: []
      }
      employee_stats: {
        Row: {
          avg_duration_seconds: number | null
          delivered: number | null
          employee_id: string | null
          failed: number | null
          in_progress: number | null
          last_delivery_at: string | null
          on_hold: number | null
          pending: number | null
        }
        Relationships: []
      }
      payment_balances: {
        Row: {
          allocated: number | null
          amount: number | null
          customer_id: string | null
          is_reversed: boolean | null
          method: Database["public"]["Enums"]["payment_method"] | null
          paid_at: string | null
          payment_code: string | null
          payment_id: string | null
          reverses_payment_id: string | null
          task_id: string | null
          unapplied: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balances"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_reverses_payment_id_fkey"
            columns: ["reverses_payment_id"]
            isOneToOne: true
            referencedRelation: "payment_balances"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "payments_reverses_payment_id_fkey"
            columns: ["reverses_payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "delivery_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_dashboard: { Args: never; Returns: Json }
      admin_exists: { Args: never; Returns: boolean }
      bootstrap_first_admin: { Args: { _user_id: string }; Returns: undefined }
      business_tz: { Args: never; Returns: string }
      cancel_delivery_task: {
        Args: { _reason: string; _task_id: string }
        Returns: {
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          created_by: string | null
          customer_code: string
          customer_id: string
          customer_name: string
          customer_phone: string
          delivery_address: string
          duration_seconds: number | null
          employee_id: string
          empty_cans_returned: number
          failure_reason: string | null
          hold_reason: string | null
          id: string
          notes: string | null
          priority: number
          scheduled_date: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_code: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "delivery_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_delivery: {
        Args: {
          _empty_cans_returned?: number
          _items: Json
          _notes?: string
          _task_id: string
        }
        Returns: {
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          created_by: string | null
          customer_code: string
          customer_id: string
          customer_name: string
          customer_phone: string
          delivery_address: string
          duration_seconds: number | null
          employee_id: string
          empty_cans_returned: number
          failure_reason: string | null
          hold_reason: string | null
          id: string
          notes: string | null
          priority: number
          scheduled_date: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_code: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "delivery_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_delivery_task: {
        Args: {
          _customer_id: string
          _employee_id: string
          _items: Json
          _notes?: string
          _priority: number
          _scheduled_date?: string
        }
        Returns: {
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          created_by: string | null
          customer_code: string
          customer_id: string
          customer_name: string
          customer_phone: string
          delivery_address: string
          duration_seconds: number | null
          employee_id: string
          empty_cans_returned: number
          failure_reason: string | null
          hold_reason: string | null
          id: string
          notes: string | null
          priority: number
          scheduled_date: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_code: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "delivery_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_product: {
        Args: {
          _kind: Database["public"]["Enums"]["product_kind"]
          _min_stock: number
          _name: string
          _opening_stock: number
          _unit: string
        }
        Returns: {
          available_quantity: number
          created_at: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["product_kind"]
          min_stock_level: number
          name: string
          product_code: string
          unit: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_employee_id: { Args: never; Returns: string }
      delivery_report: { Args: { _from: string; _to: string }; Returns: Json }
      fail_delivery: {
        Args: { _reason: string; _task_id: string }
        Returns: {
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          created_by: string | null
          customer_code: string
          customer_id: string
          customer_name: string
          customer_phone: string
          delivery_address: string
          duration_seconds: number | null
          employee_id: string
          empty_cans_returned: number
          failure_reason: string | null
          hold_reason: string | null
          id: string
          notes: string | null
          priority: number
          scheduled_date: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_code: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "delivery_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hold_delivery: {
        Args: { _reason: string; _task_id: string }
        Returns: {
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          created_by: string | null
          customer_code: string
          customer_id: string
          customer_name: string
          customer_phone: string
          delivery_address: string
          duration_seconds: number | null
          employee_id: string
          empty_cans_returned: number
          failure_reason: string | null
          hold_reason: string | null
          id: string
          notes: string | null
          priority: number
          scheduled_date: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_code: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "delivery_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      log_task: {
        Args: {
          _from: Database["public"]["Enums"]["task_status"]
          _note: string
          _task: string
          _to: Database["public"]["Enums"]["task_status"]
        }
        Returns: undefined
      }
      my_next_task_id: { Args: never; Returns: string }
      next_eligible_task_id: { Args: { _employee: string }; Returns: string }
      reassign_delivery_task: {
        Args: { _employee_id: string; _priority?: number; _task_id: string }
        Returns: {
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          created_by: string | null
          customer_code: string
          customer_id: string
          customer_name: string
          customer_phone: string
          delivery_address: string
          duration_seconds: number | null
          employee_id: string
          empty_cans_returned: number
          failure_reason: string | null
          hold_reason: string | null
          id: string
          notes: string | null
          priority: number
          scheduled_date: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_code: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "delivery_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_stock_movement: {
        Args: {
          _notes?: string
          _product_id: string
          _quantity: number
          _type: Database["public"]["Enums"]["txn_type"]
        }
        Returns: {
          created_at: string
          id: string
          new_stock: number
          notes: string | null
          performed_by: string | null
          previous_stock: number
          product_id: string
          quantity: number
          task_id: string | null
          txn_code: string
          txn_type: Database["public"]["Enums"]["txn_type"]
        }
        SetofOptions: {
          from: "*"
          to: "inventory_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      require_admin: { Args: never; Returns: undefined }
      resume_delivery_task: {
        Args: { _task_id: string }
        Returns: {
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          created_by: string | null
          customer_code: string
          customer_id: string
          customer_name: string
          customer_phone: string
          delivery_address: string
          duration_seconds: number | null
          employee_id: string
          empty_cans_returned: number
          failure_reason: string | null
          hold_reason: string | null
          id: string
          notes: string | null
          priority: number
          scheduled_date: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_code: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "delivery_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_task_priority: {
        Args: { _priority: number; _task_id: string }
        Returns: {
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          created_by: string | null
          customer_code: string
          customer_id: string
          customer_name: string
          customer_phone: string
          delivery_address: string
          duration_seconds: number | null
          employee_id: string
          empty_cans_returned: number
          failure_reason: string | null
          hold_reason: string | null
          id: string
          notes: string | null
          priority: number
          scheduled_date: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_code: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "delivery_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_delivery: {
        Args: { _task_id: string }
        Returns: {
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          created_by: string | null
          customer_code: string
          customer_id: string
          customer_name: string
          customer_phone: string
          delivery_address: string
          duration_seconds: number | null
          employee_id: string
          empty_cans_returned: number
          failure_reason: string | null
          hold_reason: string | null
          id: string
          notes: string | null
          priority: number
          scheduled_date: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_code: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "delivery_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "employee"
      customer_type: "HOME" | "SHOP" | "OFFICE" | "CUSTOM"
      empty_can_txn_type:
        | "OPENING_BALANCE"
        | "EMPTY_CANS_COLLECTED"
        | "EMPTY_CANS_ISSUED"
        | "BALANCE_ADJUSTMENT"
      payment_method: "CASH" | "UPI" | "BANK_TRANSFER" | "OTHER"
      product_kind: "FILLED_CAN" | "PACKET" | "EMPTY_CAN" | "OTHER"
      record_status: "ACTIVE" | "INACTIVE"
      task_status:
        | "PENDING"
        | "IN_PROGRESS"
        | "DELIVERED"
        | "FAILED"
        | "ON_HOLD"
        | "CANCELLED"
      txn_type:
        | "OPENING_STOCK"
        | "STOCK_ADDED"
        | "DELIVERY"
        | "DAMAGE"
        | "ADJUSTMENT"
        | "EMPTY_CAN_RETURN"
        | "CORRECTION"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "employee"],
      customer_type: ["HOME", "SHOP", "OFFICE", "CUSTOM"],
      empty_can_txn_type: [
        "OPENING_BALANCE",
        "EMPTY_CANS_COLLECTED",
        "EMPTY_CANS_ISSUED",
        "BALANCE_ADJUSTMENT",
      ],
      payment_method: ["CASH", "UPI", "BANK_TRANSFER", "OTHER"],
      product_kind: ["FILLED_CAN", "PACKET", "EMPTY_CAN", "OTHER"],
      record_status: ["ACTIVE", "INACTIVE"],
      task_status: [
        "PENDING",
        "IN_PROGRESS",
        "DELIVERED",
        "FAILED",
        "ON_HOLD",
        "CANCELLED",
      ],
      txn_type: [
        "OPENING_STOCK",
        "STOCK_ADDED",
        "DELIVERY",
        "DAMAGE",
        "ADJUSTMENT",
        "EMPTY_CAN_RETURN",
        "CORRECTION",
      ],
    },
  },
} as const
