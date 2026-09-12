// Hand-written subset of the schema covering only what the app code
// currently touches. Regenerate/expand via `supabase gen types` once a
// local Postgres/Docker is available, or extend by hand as new tables
// are used.

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: { id: number; name: string; default_distribution_email: string | null; created_at: string };
        Insert: {
          id?: number;
          name: string;
          default_distribution_email?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: { id: string; full_name: string | null; created_at: string };
        Insert: { id: string; full_name?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      org_members: {
        Row: {
          id: number;
          org_id: number;
          user_id: string;
          role: string;
          department: string | null;
          skills: string[];
          is_available: boolean;
          active_task_count: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          org_id: number;
          user_id: string;
          role?: string;
          department?: string | null;
          skills?: string[];
          is_available?: boolean;
          active_task_count?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["org_members"]["Insert"]>;
        Relationships: [];
      };
      reports: {
        Row: {
          id: number;
          org_id: number;
          requested_by: string;
          title: string | null;
          natural_language_request: string;
          report_type_id: number | null;
          structured_plan: Json | null;
          status: string;
          confidence_overall: number | null;
          export_formats: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          org_id: number;
          requested_by: string;
          title?: string | null;
          natural_language_request: string;
          report_type_id?: number | null;
          structured_plan?: Json | null;
          status?: string;
          confidence_overall?: number | null;
          export_formats?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reports"]["Insert"]>;
        Relationships: [];
      };
      report_schedules: {
        Row: {
          id: number;
          org_id: number;
          created_by: string;
          title: string | null;
          natural_language_request: string;
          frequency: string;
          day_of_week: number | null;
          day_of_month: number | null;
          hour_utc: number;
          status: string;
          last_run_at: string | null;
          last_report_id: number | null;
          next_run_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          org_id: number;
          created_by: string;
          title?: string | null;
          natural_language_request: string;
          frequency: string;
          day_of_week?: number | null;
          day_of_month?: number | null;
          hour_utc?: number;
          status?: string;
          last_run_at?: string | null;
          last_report_id?: number | null;
          next_run_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["report_schedules"]["Insert"]>;
        Relationships: [];
      };
      attachment_requirements: {
        Row: {
          id: number;
          org_id: number;
          report_id: number;
          requirement_key: string;
          description: string | null;
          is_required: boolean;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          org_id: number;
          report_id: number;
          requirement_key: string;
          description?: string | null;
          is_required?: boolean;
          status?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["attachment_requirements"]["Insert"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          org_id: number | null;
          report_id: number | null;
          actor_type: string;
          actor_id: string | null;
          action: string;
          entity_type: string | null;
          entity_id: number | null;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: number;
          org_id?: number | null;
          report_id?: number | null;
          actor_type: string;
          actor_id?: string | null;
          action: string;
          entity_type?: string | null;
          entity_id?: number | null;
          details?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: number;
          org_id: number;
          user_id: string;
          task_id: number | null;
          type: string;
          message: string;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          org_id: number;
          user_id: string;
          task_id?: number | null;
          type: string;
          message: string;
          read_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
        Relationships: [];
      };
      attachments: {
        Row: {
          id: number;
          org_id: number;
          requirement_id: number | null;
          storage_path: string;
          uploaded_by: string | null;
          classification: string | null;
          classification_confidence: number | null;
          validation_status: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          org_id: number;
          requirement_id?: number | null;
          storage_path: string;
          uploaded_by?: string | null;
          classification?: string | null;
          classification_confidence?: number | null;
          validation_status?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["attachments"]["Insert"]>;
        Relationships: [];
      };
      data_sources: {
        Row: {
          id: number;
          org_id: number;
          name: string;
          kind: string;
          connection_ref: string | null;
          schema_cache: Json | null;
          connector_config: Json | null;
          connector_secret: Json | null;
          synced_table_name: string | null;
          last_synced_at: string | null;
          sync_error: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          org_id: number;
          name: string;
          kind?: string;
          connection_ref?: string | null;
          schema_cache?: Json | null;
          connector_config?: Json | null;
          connector_secret?: Json | null;
          synced_table_name?: string | null;
          last_synced_at?: string | null;
          sync_error?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["data_sources"]["Insert"]>;
        Relationships: [];
      };
      queries: {
        Row: {
          id: number;
          org_id: number;
          report_id: number;
          data_source_id: number | null;
          natural_language_request: string | null;
          sql_text: string | null;
          tables: string[];
          fields: Json;
          confidence: number | null;
          status: string;
          validation_errors: Json;
          result_ref: string | null;
          result_preview: Json;
          row_count: number | null;
          executed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          org_id: number;
          report_id: number;
          data_source_id?: number | null;
          natural_language_request?: string | null;
          sql_text?: string | null;
          tables?: string[];
          fields?: Json;
          confidence?: number | null;
          status?: string;
          validation_errors?: Json;
          result_ref?: string | null;
          result_preview?: Json;
          row_count?: number | null;
          executed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["queries"]["Insert"]>;
        Relationships: [];
      };
      designs: {
        Row: {
          id: number;
          org_id: number;
          report_id: number;
          version: number;
          layout: Json;
          components: Json;
          style: Json;
          confidence: number;
          status: string;
          generated_by: string;
          qa_issues: Json;
          created_at: string;
        };
        Insert: {
          id?: number;
          org_id: number;
          report_id: number;
          version?: number;
          layout?: Json;
          components?: Json;
          style?: Json;
          confidence: number;
          status?: string;
          generated_by?: string;
          qa_issues?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["designs"]["Insert"]>;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: number;
          org_id: number;
          report_id: number | null;
          task_type: string;
          related_entity_type: string | null;
          related_entity_id: number | null;
          assigned_to: string | null;
          priority: string;
          status: string;
          confidence: number | null;
          deadline: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: number;
          org_id: number;
          report_id?: number | null;
          task_type: string;
          related_entity_type?: string | null;
          related_entity_id?: number | null;
          assigned_to?: string | null;
          priority?: string;
          status?: string;
          confidence?: number | null;
          deadline?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Insert"]>;
        Relationships: [];
      };
      distributions: {
        Row: {
          id: number;
          org_id: number;
          report_id: number;
          channel: string;
          recipients: string[];
          status: string;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          org_id: number;
          report_id: number;
          channel: string;
          recipients?: string[];
          status?: string;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["distributions"]["Insert"]>;
        Relationships: [];
      };
      report_exports: {
        Row: {
          id: number;
          org_id: number;
          report_id: number;
          format: string;
          storage_path: string | null;
          generated_at: string;
        };
        Insert: {
          id?: number;
          org_id: number;
          report_id: number;
          format: string;
          storage_path?: string | null;
          generated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["report_exports"]["Insert"]>;
        Relationships: [];
      };
      confidence_thresholds: {
        Row: { id: number; org_id: number; action_type: string; threshold: number };
        Insert: { id?: number; org_id: number; action_type: string; threshold?: number };
        Update: Partial<Database["public"]["Tables"]["confidence_thresholds"]["Insert"]>;
        Relationships: [];
      };
      dashboards: {
        Row: {
          id: number;
          org_id: number;
          created_by: string | null;
          name: string;
          refresh_seconds: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          org_id: number;
          created_by?: string | null;
          name: string;
          refresh_seconds?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["dashboards"]["Insert"]>;
        Relationships: [];
      };
      dashboard_widgets: {
        Row: {
          id: number;
          org_id: number;
          dashboard_id: number;
          widget_type: string;
          title: string;
          data_source_id: number | null;
          table_name: string;
          config: Json;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          org_id: number;
          dashboard_id: number;
          widget_type: string;
          title: string;
          data_source_id?: number | null;
          table_name: string;
          config?: Json;
          position?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["dashboard_widgets"]["Insert"]>;
        Relationships: [];
      };
      report_templates: {
        Row: {
          id: number;
          org_id: number;
          created_by: string | null;
          name: string;
          description: string | null;
          natural_language_request: string;
          export_formats: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          org_id: number;
          created_by?: string | null;
          name: string;
          description?: string | null;
          natural_language_request: string;
          export_formats?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["report_templates"]["Insert"]>;
        Relationships: [];
      };
      report_builder_reports: {
        Row: {
          id: number;
          org_id: number;
          created_by: string | null;
          name: string;
          data_source_id: number | null;
          table_name: string;
          config: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          org_id: number;
          created_by?: string | null;
          name: string;
          data_source_id?: number | null;
          table_name: string;
          config?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["report_builder_reports"]["Insert"]>;
        Relationships: [];
      };
      sales_orders: {
        Row: {
          id: number;
          org_id: number;
          order_date: string;
          category_name: string;
          units_sold: number;
          gross_revenue: number;
          discount_amount: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          org_id: number;
          order_date: string;
          category_name: string;
          units_sold: number;
          gross_revenue?: number;
          discount_amount?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sales_orders"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      sales_report_quarterly: {
        Args: { p_org_id: number; p_from: string | null; p_to: string | null };
        Returns: {
          sales_year: number;
          quarter: string;
          category_name: string;
          total_orders: number;
          total_units_sold: number;
          net_sales_revenue: number;
        }[];
      };
    };
  };
}
