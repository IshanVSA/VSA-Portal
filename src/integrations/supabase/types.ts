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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      analytics: {
        Row: {
          clinic_id: string | null
          date: string | null
          id: string
          metric_type: string
          metrics_json: Json | null
          platform: string
          recorded_at: string
          value: number
        }
        Insert: {
          clinic_id?: string | null
          date?: string | null
          id?: string
          metric_type: string
          metrics_json?: Json | null
          platform: string
          recorded_at?: string
          value?: number
        }
        Update: {
          clinic_id?: string | null
          date?: string | null
          id?: string
          metric_type?: string
          metrics_json?: Json | null
          platform?: string
          recorded_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "analytics_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_submissions: {
        Row: {
          admin_notes: string | null
          clinic_id: string | null
          created_at: string
          id: string
          month: string | null
          notes: string | null
          pet_name: string | null
          pet_type: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          submitter_email: string | null
          submitter_name: string
        }
        Insert: {
          admin_notes?: string | null
          clinic_id?: string | null
          created_at?: string
          id?: string
          month?: string | null
          notes?: string | null
          pet_name?: string | null
          pet_type?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          submitter_email?: string | null
          submitter_name: string
        }
        Update: {
          admin_notes?: string | null
          clinic_id?: string | null
          created_at?: string
          id?: string
          month?: string | null
          notes?: string | null
          pet_name?: string | null
          pet_type?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          submitter_email?: string | null
          submitter_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_submissions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_api_credentials: {
        Row: {
          clinic_id: string
          created_at: string
          google_ads_account_name: string | null
          google_ads_customer_id: string | null
          google_ads_login_customer_id: string | null
          google_ads_refresh_token: string | null
          id: string
          last_google_sync_at: string | null
          last_meta_sync_at: string | null
          meta_instagram_business_id: string | null
          meta_page_access_token: string | null
          meta_page_id: string | null
          meta_page_name: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          google_ads_account_name?: string | null
          google_ads_customer_id?: string | null
          google_ads_login_customer_id?: string | null
          google_ads_refresh_token?: string | null
          id?: string
          last_google_sync_at?: string | null
          last_meta_sync_at?: string | null
          meta_instagram_business_id?: string | null
          meta_page_access_token?: string | null
          meta_page_id?: string | null
          meta_page_name?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          google_ads_account_name?: string | null
          google_ads_customer_id?: string | null
          google_ads_login_customer_id?: string | null
          google_ads_refresh_token?: string | null
          id?: string
          last_google_sync_at?: string | null
          last_meta_sync_at?: string | null
          meta_instagram_business_id?: string | null
          meta_page_access_token?: string | null
          meta_page_id?: string | null
          meta_page_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_api_credentials_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_team_members: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_team_members_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          address: string | null
          ai_seo_enabled: boolean
          assigned_concierge_id: string | null
          clinic_name: string
          created_at: string
          email: string | null
          google_ads_enabled: boolean
          id: string
          logo_url: string | null
          owner_user_id: string | null
          phone: string | null
          seo_enabled: boolean
          social_media_enabled: boolean
          status: string
          timezone: string | null
          website: string | null
          website_enabled: boolean
        }
        Insert: {
          address?: string | null
          ai_seo_enabled?: boolean
          assigned_concierge_id?: string | null
          clinic_name: string
          created_at?: string
          email?: string | null
          google_ads_enabled?: boolean
          id?: string
          logo_url?: string | null
          owner_user_id?: string | null
          phone?: string | null
          seo_enabled?: boolean
          social_media_enabled?: boolean
          status?: string
          timezone?: string | null
          website?: string | null
          website_enabled?: boolean
        }
        Update: {
          address?: string | null
          ai_seo_enabled?: boolean
          assigned_concierge_id?: string | null
          clinic_name?: string
          created_at?: string
          email?: string | null
          google_ads_enabled?: boolean
          id?: string
          logo_url?: string | null
          owner_user_id?: string | null
          phone?: string | null
          seo_enabled?: boolean
          social_media_enabled?: boolean
          status?: string
          timezone?: string | null
          website?: string | null
          website_enabled?: boolean
        }
        Relationships: []
      }
      content_calendar: {
        Row: {
          clinic_id: string
          content_request_id: string | null
          created_at: string
          final_content: Json
          id: string
          platform: string
          scheduled_date: string | null
          status: string
        }
        Insert: {
          clinic_id: string
          content_request_id?: string | null
          created_at?: string
          final_content?: Json
          id?: string
          platform?: string
          scheduled_date?: string | null
          status?: string
        }
        Update: {
          clinic_id?: string
          content_request_id?: string | null
          created_at?: string
          final_content?: Json
          id?: string
          platform?: string
          scheduled_date?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_calendar_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_calendar_content_request_id_fkey"
            columns: ["content_request_id"]
            isOneToOne: false
            referencedRelation: "content_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      content_posts: {
        Row: {
          caption: string | null
          clinic_id: string | null
          compliance_note: string | null
          content: string | null
          content_type: string
          created_at: string
          created_by: string | null
          flag_reason: string | null
          id: string
          platform: string
          published_at: string | null
          scheduled_at: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          status: string
          tags: string[] | null
          title: string
          workflow_stage: string
        }
        Insert: {
          caption?: string | null
          clinic_id?: string | null
          compliance_note?: string | null
          content?: string | null
          content_type?: string
          created_at?: string
          created_by?: string | null
          flag_reason?: string | null
          id?: string
          platform?: string
          published_at?: string | null
          scheduled_at?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          status?: string
          tags?: string[] | null
          title: string
          workflow_stage?: string
        }
        Update: {
          caption?: string | null
          clinic_id?: string | null
          compliance_note?: string | null
          content?: string | null
          content_type?: string
          created_at?: string
          created_by?: string | null
          flag_reason?: string | null
          id?: string
          platform?: string
          published_at?: string | null
          scheduled_at?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          status?: string
          tags?: string[] | null
          title?: string
          workflow_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_posts_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      content_requests: {
        Row: {
          clinic_id: string
          created_at: string
          created_by_concierge_id: string
          id: string
          intake_data: Json
          status: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by_concierge_id: string
          id?: string
          intake_data?: Json
          status?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by_concierge_id?: string
          id?: string
          intake_data?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_requests_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      content_versions: {
        Row: {
          admin_approved: boolean
          client_selected: boolean
          concierge_preferred: boolean
          content_request_id: string
          created_at: string
          generated_content: Json
          id: string
          model_name: string
        }
        Insert: {
          admin_approved?: boolean
          client_selected?: boolean
          concierge_preferred?: boolean
          content_request_id: string
          created_at?: string
          generated_content?: Json
          id?: string
          model_name: string
        }
        Update: {
          admin_approved?: boolean
          client_selected?: boolean
          concierge_preferred?: boolean
          content_request_id?: string
          created_at?: string
          generated_content?: Json
          id?: string
          model_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_versions_content_request_id_fkey"
            columns: ["content_request_id"]
            isOneToOne: false
            referencedRelation: "content_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      department_members: {
        Row: {
          created_at: string
          department: Database["public"]["Enums"]["department_type"]
          department_role: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department: Database["public"]["Enums"]["department_type"]
          department_role: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department?: Database["public"]["Enums"]["department_type"]
          department_role?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      department_tickets: {
        Row: {
          assigned_to: string | null
          attachments: string[] | null
          clinic_id: string | null
          created_at: string
          created_by: string | null
          department: Database["public"]["Enums"]["department_type"]
          description: string | null
          id: string
          notes: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_type: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          attachments?: string[] | null
          clinic_id?: string | null
          created_at?: string
          created_by?: string | null
          department: Database["public"]["Enums"]["department_type"]
          description?: string | null
          id?: string
          notes?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_type: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          attachments?: string[] | null
          clinic_id?: string | null
          created_at?: string
          created_by?: string | null
          department?: Database["public"]["Enums"]["department_type"]
          description?: string | null
          id?: string
          notes?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_tickets_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      pagespeed_scores: {
        Row: {
          accessibility_score: number
          best_practices_score: number
          clinic_id: string
          id: string
          metrics_json: Json
          performance_score: number
          recorded_at: string
          seo_score: number
          strategy: string
        }
        Insert: {
          accessibility_score?: number
          best_practices_score?: number
          clinic_id: string
          id?: string
          metrics_json?: Json
          performance_score?: number
          recorded_at?: string
          seo_score?: number
          strategy: string
        }
        Update: {
          accessibility_score?: number
          best_practices_score?: number
          clinic_id?: string
          id?: string
          metrics_json?: Json
          performance_score?: number
          recorded_at?: string
          seo_score?: number
          strategy?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagespeed_scores_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      post_activity_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          post_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          post_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_activity_log_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          user_id: string
          visibility: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
          visibility?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_workflow: {
        Row: {
          auto_approve_at: string | null
          id: string
          post_id: string
          sent_to_client_at: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          auto_approve_at?: string | null
          id?: string
          post_id: string
          sent_to_client_at?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          auto_approve_at?: string | null
          id?: string
          post_id?: string
          sent_to_client_at?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_workflow_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "content_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          team_role: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          team_role?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          team_role?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      seo_analytics: {
        Row: {
          backlinks: number
          clinic_id: string
          created_at: string
          domain_authority: number
          extended_data: Json | null
          id: string
          keywords_top_10: number
          month: string
          organic_traffic: number
          top_keywords: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          backlinks?: number
          clinic_id: string
          created_at?: string
          domain_authority?: number
          extended_data?: Json | null
          id?: string
          keywords_top_10?: number
          month: string
          organic_traffic?: number
          top_keywords?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          backlinks?: number
          clinic_id?: string
          created_at?: string
          domain_authority?: number
          extended_data?: Json | null
          id?: string
          keywords_top_10?: number
          month?: string
          organic_traffic?: number
          top_keywords?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_analytics_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      website_pageviews: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          path: string
          referrer: string | null
          session_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          path?: string
          referrer?: string | null
          session_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          path?: string
          referrer?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_pageviews_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "concierge" | "client"
      department_type: "website" | "seo" | "google_ads" | "social_media"
      ticket_priority: "regular" | "urgent" | "emergency"
      ticket_status: "open" | "in_progress" | "completed" | "emergency"
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
      app_role: ["admin", "concierge", "client"],
      department_type: ["website", "seo", "google_ads", "social_media"],
      ticket_priority: ["regular", "urgent", "emergency"],
      ticket_status: ["open", "in_progress", "completed", "emergency"],
    },
  },
} as const
