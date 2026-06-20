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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_table: string
          facility_id: string
          id: string
          payload: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_table: string
          facility_id: string
          id?: string
          payload?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_table?: string
          facility_id?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          expense_date: string
          facility_id: string
          id: string
          inventory_item_id: string | null
          inventory_transaction_id: string | null
          notes: string | null
          source: string
          title: string
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          facility_id?: string
          id?: string
          inventory_item_id?: string | null
          inventory_transaction_id?: string | null
          notes?: string | null
          source?: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          facility_id?: string
          id?: string
          inventory_item_id?: string | null
          inventory_transaction_id?: string | null
          notes?: string | null
          source?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_inventory_transaction_id_fkey"
            columns: ["inventory_transaction_id"]
            isOneToOne: false
            referencedRelation: "inventory_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      facilities: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          parent_facility_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          parent_facility_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          parent_facility_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facilities_parent_facility_id_fkey"
            columns: ["parent_facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          expiry_date: string | null
          facility_id: string
          id: string
          is_active: boolean
          last_stocked_at: string | null
          lot_number: string | null
          name: string
          quantity: number
          reorder_level: number
          storage_location: string | null
          unit: string
          unit_cost: number
          updated_at: string
          vendor: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expiry_date?: string | null
          facility_id?: string
          id?: string
          is_active?: boolean
          last_stocked_at?: string | null
          lot_number?: string | null
          name: string
          quantity?: number
          reorder_level?: number
          storage_location?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expiry_date?: string | null
          facility_id?: string
          id?: string
          is_active?: boolean
          last_stocked_at?: string | null
          lot_number?: string | null
          name?: string
          quantity?: number
          reorder_level?: number
          storage_location?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          balance_after: number
          created_at: string
          facility_id: string
          id: string
          item_id: string
          notes: string | null
          performed_by: string | null
          quantity: number
          reason: string | null
          reference_number: string | null
          total_cost: number
          transaction_type: string
          unit_cost: number
        }
        Insert: {
          balance_after: number
          created_at?: string
          facility_id: string
          id?: string
          item_id: string
          notes?: string | null
          performed_by?: string | null
          quantity: number
          reason?: string | null
          reference_number?: string | null
          total_cost?: number
          transaction_type: string
          unit_cost?: number
        }
        Update: {
          balance_after?: number
          created_at?: string
          facility_id?: string
          id?: string
          item_id?: string
          notes?: string | null
          performed_by?: string | null
          quantity?: number
          reason?: string | null
          reference_number?: string | null
          total_cost?: number
          transaction_type?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          id: string
          invoice_id: string
          line_total: number
          order_test_id: string | null
          quantity: number
          test_name: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id: string
          line_total?: number
          order_test_id?: string | null
          quantity?: number
          test_name: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string
          line_total?: number
          order_test_id?: string | null
          quantity?: number
          test_name?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_order_test_id_fkey"
            columns: ["order_test_id"]
            isOneToOne: true
            referencedRelation: "order_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          created_at: string
          facility_id: string
          id: string
          invoice_id: string
          notes: string | null
          payment_method: string
          receipt_number: string
          received_at: string
          received_by: string | null
          reference_number: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          facility_id: string
          id?: string
          invoice_id: string
          notes?: string | null
          payment_method: string
          receipt_number?: string
          received_at?: string
          received_by?: string | null
          reference_number?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          facility_id?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_method?: string
          receipt_number?: string
          received_at?: string
          received_by?: string | null
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          created_at: string
          created_by: string | null
          discount_amount: number
          due_at: string | null
          facility_id: string
          id: string
          invoice_number: string
          issued_at: string
          notes: string | null
          order_id: string
          payment_status: Database["public"]["Enums"]["invoice_payment_status"]
          subtotal: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          due_at?: string | null
          facility_id?: string
          id?: string
          invoice_number?: string
          issued_at?: string
          notes?: string | null
          order_id: string
          payment_status?: Database["public"]["Enums"]["invoice_payment_status"]
          subtotal?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          due_at?: string | null
          facility_id?: string
          id?: string
          invoice_number?: string
          issued_at?: string
          notes?: string | null
          order_id?: string
          payment_status?: Database["public"]["Enums"]["invoice_payment_status"]
          subtotal?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_test_results: {
        Row: {
          abnormal_flag: boolean
          abnormal_reason: string | null
          created_at: string
          entered_at: string
          entered_by: string | null
          id: string
          interpretation: string | null
          order_test_id: string
          updated_at: string
          value_boolean: boolean | null
          value_numeric: number | null
          value_text: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          abnormal_flag?: boolean
          abnormal_reason?: string | null
          created_at?: string
          entered_at?: string
          entered_by?: string | null
          id?: string
          interpretation?: string | null
          order_test_id: string
          updated_at?: string
          value_boolean?: boolean | null
          value_numeric?: number | null
          value_text?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          abnormal_flag?: boolean
          abnormal_reason?: string | null
          created_at?: string
          entered_at?: string
          entered_by?: string | null
          id?: string
          interpretation?: string | null
          order_test_id?: string
          updated_at?: string
          value_boolean?: boolean | null
          value_numeric?: number | null
          value_text?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_test_results_order_test_id_fkey"
            columns: ["order_test_id"]
            isOneToOne: true
            referencedRelation: "order_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      order_tests: {
        Row: {
          barcode_value: string
          collected_at: string | null
          collected_by: string | null
          created_at: string
          id: string
          in_progress_at: string | null
          order_id: string
          qr_value: string
          reported_at: string | null
          results_entered_at: string | null
          sample_code: string
          specimen_label: string | null
          status: Database["public"]["Enums"]["sample_status"]
          test_id: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          barcode_value: string
          collected_at?: string | null
          collected_by?: string | null
          created_at?: string
          id?: string
          in_progress_at?: string | null
          order_id: string
          qr_value: string
          reported_at?: string | null
          results_entered_at?: string | null
          sample_code: string
          specimen_label?: string | null
          status?: Database["public"]["Enums"]["sample_status"]
          test_id: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          barcode_value?: string
          collected_at?: string | null
          collected_by?: string | null
          created_at?: string
          id?: string
          in_progress_at?: string | null
          order_id?: string
          qr_value?: string
          reported_at?: string | null
          results_entered_at?: string | null
          sample_code?: string
          specimen_label?: string | null
          status?: Database["public"]["Enums"]["sample_status"]
          test_id?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_tests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_tests_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          facility_id: string
          id: string
          notes: string | null
          order_number: string
          ordered_at: string
          ordered_by: string | null
          patient_id: string
          priority: string
          reported_at: string | null
          status: Database["public"]["Enums"]["sample_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          facility_id?: string
          id?: string
          notes?: string | null
          order_number: string
          ordered_at?: string
          ordered_by?: string | null
          patient_id: string
          priority?: string
          reported_at?: string | null
          status?: Database["public"]["Enums"]["sample_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          facility_id?: string
          id?: string
          notes?: string | null
          order_number?: string
          ordered_at?: string
          ordered_by?: string | null
          patient_id?: string
          priority?: string
          reported_at?: string | null
          status?: Database["public"]["Enums"]["sample_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          dob: string | null
          email: string | null
          emergency_contact: string | null
          facility_id: string
          first_name: string | null
          id: string
          lab_id: string
          last_name: string | null
          lga: string | null
          medical_record_number: string | null
          name: string
          national_id: string | null
          ndpr_consent: boolean
          ndpr_consent_at: string | null
          notes: string | null
          phone: string | null
          sex: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          dob?: string | null
          email?: string | null
          emergency_contact?: string | null
          facility_id?: string
          first_name?: string | null
          id?: string
          lab_id: string
          last_name?: string | null
          lga?: string | null
          medical_record_number?: string | null
          name: string
          national_id?: string | null
          ndpr_consent?: boolean
          ndpr_consent_at?: string | null
          notes?: string | null
          phone?: string | null
          sex?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          dob?: string | null
          email?: string | null
          emergency_contact?: string | null
          facility_id?: string
          first_name?: string | null
          id?: string
          lab_id?: string
          last_name?: string | null
          lga?: string | null
          medical_record_number?: string | null
          name?: string
          national_id?: string | null
          ndpr_consent?: boolean
          ndpr_consent_at?: string | null
          notes?: string | null
          phone?: string | null
          sex?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          facility_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          facility_id?: string | null
          id: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          facility_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_custody_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["sample_status"] | null
          id: string
          notes: string | null
          order_test_id: string
          to_status: Database["public"]["Enums"]["sample_status"] | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["sample_status"] | null
          id?: string
          notes?: string | null
          order_test_id: string
          to_status?: Database["public"]["Enums"]["sample_status"] | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["sample_status"] | null
          id?: string
          notes?: string | null
          order_test_id?: string
          to_status?: Database["public"]["Enums"]["sample_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "sample_custody_logs_order_test_id_fkey"
            columns: ["order_test_id"]
            isOneToOne: false
            referencedRelation: "order_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      tests: {
        Row: {
          category: string | null
          created_at: string
          facility_id: string | null
          id: string
          is_active: boolean
          name: string
          price: number
          reference_range: Json
          result_type: string
          test_code: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          facility_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          price?: number
          reference_range?: Json
          result_type: string
          test_code?: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          facility_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          reference_range?: Json
          result_type?: string
          test_code?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tests_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_inventory_transaction: {
        Args: {
          notes_value?: string
          quantity_value: number
          reason_value?: string
          reference_number_value?: string
          target_item_id: string
          transaction_type_value: string
        }
        Returns: {
          balance_after: number
          created_at: string
          facility_id: string
          item_id: string
          quantity: number
          transaction_id: string
          transaction_type: string
        }[]
      }
      create_order_with_tests: {
        Args: {
          order_notes?: string
          patient_uuid: string
          priority_value?: string
          selected_test_ids: string[]
        }
        Returns: {
          barcode_value: string
          order_id: string
          order_number: string
          order_status: Database["public"]["Enums"]["sample_status"]
          order_test_id: string
          patient_id: string
          qr_value: string
          sample_code: string
          sample_status: Database["public"]["Enums"]["sample_status"]
          test_id: string
          test_name: string
        }[]
      }
      current_user_can_manage_billing: { Args: never; Returns: boolean }
      current_user_can_manage_inventory: { Args: never; Returns: boolean }
      current_user_facility_id: { Args: never; Returns: string }
      current_user_is_admin: { Args: never; Returns: boolean }
      default_facility_id: { Args: never; Returns: string }
      facility_access_allowed: {
        Args: { target_facility_id: string }
        Returns: boolean
      }
      generate_invoice_number: { Args: never; Returns: string }
      generate_order_number: { Args: never; Returns: string }
      generate_patient_lab_id: { Args: never; Returns: string }
      generate_receipt_number: { Args: never; Returns: string }
      generate_sample_code: { Args: never; Returns: string }
      generate_test_code: { Args: never; Returns: string }
      inventory_item_in_current_facility: {
        Args: { target_item_id: string }
        Returns: boolean
      }
      inventory_transaction_in_current_facility: {
        Args: { target_transaction_id: string }
        Returns: boolean
      }
      invoice_in_current_facility: {
        Args: { target_invoice_id: string }
        Returns: boolean
      }
      invoice_item_in_current_facility: {
        Args: { target_invoice_item_id: string }
        Returns: boolean
      }
      invoice_payment_in_current_facility: {
        Args: { target_payment_id: string }
        Returns: boolean
      }
      order_in_current_facility: {
        Args: { target_order_id: string }
        Returns: boolean
      }
      order_record_in_current_facility: {
        Args: { target_order_id: string }
        Returns: boolean
      }
      order_test_in_current_facility: {
        Args: { target_order_test_id: string }
        Returns: boolean
      }
      patient_in_current_facility: {
        Args: { target_patient_id: string }
        Returns: boolean
      }
      refresh_order_status: {
        Args: { target_order_id: string }
        Returns: undefined
      }
      register_invoice_payment: {
        Args: {
          amount_value: number
          notes_value?: string
          payment_method_value: string
          reference_number_value?: string
          target_invoice_id: string
        }
        Returns: {
          amount: number
          amount_paid: number
          balance_due: number
          invoice_id: string
          payment_id: string
          payment_status: Database["public"]["Enums"]["invoice_payment_status"]
          receipt_number: string
          received_at: string
        }[]
      }
      result_record_in_current_facility: {
        Args: { target_result_id: string }
        Returns: boolean
      }
      sample_log_in_current_facility: {
        Args: { target_log_id: string }
        Returns: boolean
      }
      search_patients: {
        Args: { page_number?: number; page_size?: number; search_term?: string }
        Returns: {
          address: string
          created_at: string
          created_by: string
          dob: string
          email: string
          emergency_contact: string
          facility_id: string
          id: string
          lab_id: string
          lga: string
          name: string
          national_id: string
          ndpr_consent: boolean
          ndpr_consent_at: string | null
          notes: string
          order_count: number
          phone: string
          sex: string
          similarity_score: number
          state: string
          total_count: number
          updated_at: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sync_invoice_for_order: {
        Args: { target_order_id: string }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "SuperAdmin"
        | "Admin"
        | "Receptionist"
        | "LabScientist"
        | "Verifier"
        | "Accountant"
      invoice_payment_status: "Unpaid" | "Partial" | "Paid"
      sample_status:
        | "Registered"
        | "Collected"
        | "In_Progress"
        | "Results_Entered"
        | "Verified"
        | "Reported"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: [
        "SuperAdmin",
        "Admin",
        "Receptionist",
        "LabScientist",
        "Verifier",
        "Accountant",
      ],
      sample_status: [
        "Registered",
        "Collected",
        "In_Progress",
        "Results_Entered",
        "Verified",
        "Reported",
      ],
    },
  },
} as const
