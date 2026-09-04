// Hand-written subset of the schema covering only what the app code
// currently touches. Regenerate/expand via `supabase gen types` once a
// local Postgres/Docker is available, or extend by hand as new tables
// are used.

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: { id: number; name: string; created_at: string };
        Insert: { id?: number; name: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
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
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reports"]["Insert"]>;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
