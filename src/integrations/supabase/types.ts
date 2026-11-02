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
          timezone: string
          updated_at: string
        }
        Insert: {
          business_name?: string
          default_priority?: number
          id?: number
          late_threshold_minutes?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          business_name?: string
          default_priority?: number
          id?: number
          late_threshold_minutes?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string
          customer_code: string
          customer_type: Database["public"]["Enums"]["customer_type"]
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
          customer_code?: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
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
          customer_code?: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
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
          delivered_qty: number | null
          id: string
          product_id: string
          product_kind: Database["public"]["Enums"]["product_kind"]
          product_name: string
          requested_qty: number
          task_id: string
          unit: string
          unit_price: number
        }
        Insert: {
          delivered_qty?: number | null
          id?: string
          product_id: string
          product_kind: Database["public"]["Enums"]["product_kind"]
          product_name: string
          requested_qty: number
          task_id: string
          unit: string
          unit_price?: number
        }
        Update: {
          delivered_qty?: number | null
          id?: string
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
            referencedRelation: "customers"
            referencedColumns: ["id"]
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
      [_ in never]: never
    }
    Functions: {
      business_tz: { Args: never; Returns: string }
      current_employee_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "employee"
      customer_type: "HOME" | "SHOP" | "OFFICE"
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
      customer_type: ["HOME", "SHOP", "OFFICE"],
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
