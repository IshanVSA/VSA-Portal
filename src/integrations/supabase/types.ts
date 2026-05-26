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
      blog_client_submissions: {
        Row: {
          approved_by: string | null
          approved_date: string | null
          clinic_id: string
          compliance_scan_result: Json | null
          content_text: string
          created_at: string
          fed_into_generation: boolean
          id: string
          submission_month: number | null
          submission_type: string
          submission_year: number | null
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          approved_date?: string | null
          clinic_id: string
          compliance_scan_result?: Json | null
          content_text: string
          created_at?: string
          fed_into_generation?: boolean
          id?: string
          submission_month?: number | null
          submission_type?: string
          submission_year?: number | null
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          approved_date?: string | null
          clinic_id?: string
          compliance_scan_result?: Json | null
          content_text?: string
          created_at?: string
          fed_into_generation?: boolean
          id?: string
          submission_month?: number | null
          submission_type?: string
          submission_year?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_client_submissions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          active_hazards: Json | null
          approval_timestamp: string | null
          approval_type: string | null
          blog_1_confirmed: boolean
          blog_1_slot: string | null
          blog_1_slug: string | null
          blog_1_status: string
          blog_1_topic: string | null
          blog_1_type: string | null
          blog_1_url: string | null
          blog_2_confirmed: boolean
          blog_2_slot: string | null
          blog_2_slug: string | null
          blog_2_status: string
          blog_2_topic: string | null
          blog_2_type: string | null
          blog_2_url: string | null
          blog_3_confirmed: boolean
          blog_3_slot: string | null
          blog_3_slug: string | null
          blog_3_status: string
          blog_3_topic: string | null
          blog_3_type: string | null
          blog_3_url: string | null
          blog_month_count: number
          clinic_id: string
          created_at: string
          duplicate_risk_flagged: boolean
          emergency_topic: string | null
          failure_reason: string | null
          generation_date: string
          generation_status: string
          generation_type: string
          governing_body_applied: string | null
          high_alert_hazards: Json | null
          hospital_type_detected: string | null
          id: string
          image_filename_1: string | null
          image_filename_2: string | null
          image_filename_3: string | null
          jurisdiction_detected: string | null
          last_attempt_at: string | null
          marked_published_at: string | null
          marked_published_by: string | null
          next_retry_at: string | null
          prompt_version_id: string | null
          publish_date_1: string | null
          publish_date_2: string | null
          publish_date_3: string | null
          qa_issues: Json | null
          qa_status: string
          raw_output_text: string | null
          remark_round: number
          retry_count: number
          sitemap_ping_sent: boolean
          spelling_mode: string | null
          token_count_input: number | null
          token_count_output: number | null
          type_mismatch_flagged: boolean
          unverified_fields: Json | null
          updated_at: string
          verification_complete: boolean
        }
        Insert: {
          active_hazards?: Json | null
          approval_timestamp?: string | null
          approval_type?: string | null
          blog_1_confirmed?: boolean
          blog_1_slot?: string | null
          blog_1_slug?: string | null
          blog_1_status?: string
          blog_1_topic?: string | null
          blog_1_type?: string | null
          blog_1_url?: string | null
          blog_2_confirmed?: boolean
          blog_2_slot?: string | null
          blog_2_slug?: string | null
          blog_2_status?: string
          blog_2_topic?: string | null
          blog_2_type?: string | null
          blog_2_url?: string | null
          blog_3_confirmed?: boolean
          blog_3_slot?: string | null
          blog_3_slug?: string | null
          blog_3_status?: string
          blog_3_topic?: string | null
          blog_3_type?: string | null
          blog_3_url?: string | null
          blog_month_count?: number
          clinic_id: string
          created_at?: string
          duplicate_risk_flagged?: boolean
          emergency_topic?: string | null
          failure_reason?: string | null
          generation_date?: string
          generation_status?: string
          generation_type?: string
          governing_body_applied?: string | null
          high_alert_hazards?: Json | null
          hospital_type_detected?: string | null
          id?: string
          image_filename_1?: string | null
          image_filename_2?: string | null
          image_filename_3?: string | null
          jurisdiction_detected?: string | null
          last_attempt_at?: string | null
          marked_published_at?: string | null
          marked_published_by?: string | null
          next_retry_at?: string | null
          prompt_version_id?: string | null
          publish_date_1?: string | null
          publish_date_2?: string | null
          publish_date_3?: string | null
          qa_issues?: Json | null
          qa_status?: string
          raw_output_text?: string | null
          remark_round?: number
          retry_count?: number
          sitemap_ping_sent?: boolean
          spelling_mode?: string | null
          token_count_input?: number | null
          token_count_output?: number | null
          type_mismatch_flagged?: boolean
          unverified_fields?: Json | null
          updated_at?: string
          verification_complete?: boolean
        }
        Update: {
          active_hazards?: Json | null
          approval_timestamp?: string | null
          approval_type?: string | null
          blog_1_confirmed?: boolean
          blog_1_slot?: string | null
          blog_1_slug?: string | null
          blog_1_status?: string
          blog_1_topic?: string | null
          blog_1_type?: string | null
          blog_1_url?: string | null
          blog_2_confirmed?: boolean
          blog_2_slot?: string | null
          blog_2_slug?: string | null
          blog_2_status?: string
          blog_2_topic?: string | null
          blog_2_type?: string | null
          blog_2_url?: string | null
          blog_3_confirmed?: boolean
          blog_3_slot?: string | null
          blog_3_slug?: string | null
          blog_3_status?: string
          blog_3_topic?: string | null
          blog_3_type?: string | null
          blog_3_url?: string | null
          blog_month_count?: number
          clinic_id?: string
          created_at?: string
          duplicate_risk_flagged?: boolean
          emergency_topic?: string | null
          failure_reason?: string | null
          generation_date?: string
          generation_status?: string
          generation_type?: string
          governing_body_applied?: string | null
          high_alert_hazards?: Json | null
          hospital_type_detected?: string | null
          id?: string
          image_filename_1?: string | null
          image_filename_2?: string | null
          image_filename_3?: string | null
          jurisdiction_detected?: string | null
          last_attempt_at?: string | null
          marked_published_at?: string | null
          marked_published_by?: string | null
          next_retry_at?: string | null
          prompt_version_id?: string | null
          publish_date_1?: string | null
          publish_date_2?: string | null
          publish_date_3?: string | null
          qa_issues?: Json | null
          qa_status?: string
          raw_output_text?: string | null
          remark_round?: number
          retry_count?: number
          sitemap_ping_sent?: boolean
          spelling_mode?: string | null
          token_count_input?: number | null
          token_count_output?: number | null
          type_mismatch_flagged?: boolean
          unverified_fields?: Json | null
          updated_at?: string
          verification_complete?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_prompt_version_id_fkey"
            columns: ["prompt_version_id"]
            isOneToOne: false
            referencedRelation: "blog_prompt_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_prompt_versions: {
        Row: {
          approved_by: string | null
          approved_date: string | null
          change_notes: string | null
          created_at: string
          generation_count: number
          id: string
          is_current: boolean
          prompt_text: string
          updated_at: string
          version_label: string
        }
        Insert: {
          approved_by?: string | null
          approved_date?: string | null
          change_notes?: string | null
          created_at?: string
          generation_count?: number
          id?: string
          is_current?: boolean
          prompt_text: string
          updated_at?: string
          version_label: string
        }
        Update: {
          approved_by?: string | null
          approved_date?: string | null
          change_notes?: string | null
          created_at?: string
          generation_count?: number
          id?: string
          is_current?: boolean
          prompt_text?: string
          updated_at?: string
          version_label?: string
        }
        Relationships: []
      }
      blog_tracker: {
        Row: {
          clinic_id: string
          cluster_data: Json
          created_at: string
          id: string
          last_updated: string
          month_count: number
          published_slugs: Json
        }
        Insert: {
          clinic_id: string
          cluster_data?: Json
          created_at?: string
          id?: string
          last_updated?: string
          month_count?: number
          published_slugs?: Json
        }
        Update: {
          clinic_id?: string
          cluster_data?: Json
          created_at?: string
          id?: string
          last_updated?: string
          month_count?: number
          published_slugs?: Json
        }
        Relationships: [
          {
            foreignKeyName: "blog_tracker_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
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
      client_journey_steps: {
        Row: {
          clinic_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          notes: string | null
          status: string
          step_number: number
          updated_at: string
        }
        Insert: {
          clinic_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          step_number: number
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          step_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_journey_steps_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      client_sub_accounts: {
        Row: {
          created_at: string
          hide_financials: boolean
          id: string
          parent_user_id: string
          sub_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hide_financials?: boolean
          id?: string
          parent_user_id: string
          sub_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hide_financials?: boolean
          id?: string
          parent_user_id?: string
          sub_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      clinic_api_credentials: {
        Row: {
          clinic_id: string
          created_at: string
          gbp_account_id: string | null
          gbp_connected_at: string | null
          gbp_location_id: string | null
          gbp_location_name: string | null
          gbp_perf_last_sync_at: string | null
          gbp_perf_last_sync_error: string | null
          gbp_perf_last_sync_status: string | null
          gbp_refresh_token: string | null
          google_ads_account_name: string | null
          google_ads_customer_id: string | null
          google_ads_login_customer_id: string | null
          google_ads_refresh_token: string | null
          id: string
          last_gbp_sync_at: string | null
          last_google_sync_at: string | null
          last_meta_sync_at: string | null
          meta_granted_scopes: string[] | null
          meta_instagram_business_id: string | null
          meta_page_access_token: string | null
          meta_page_id: string | null
          meta_page_name: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          gbp_account_id?: string | null
          gbp_connected_at?: string | null
          gbp_location_id?: string | null
          gbp_location_name?: string | null
          gbp_perf_last_sync_at?: string | null
          gbp_perf_last_sync_error?: string | null
          gbp_perf_last_sync_status?: string | null
          gbp_refresh_token?: string | null
          google_ads_account_name?: string | null
          google_ads_customer_id?: string | null
          google_ads_login_customer_id?: string | null
          google_ads_refresh_token?: string | null
          id?: string
          last_gbp_sync_at?: string | null
          last_google_sync_at?: string | null
          last_meta_sync_at?: string | null
          meta_granted_scopes?: string[] | null
          meta_instagram_business_id?: string | null
          meta_page_access_token?: string | null
          meta_page_id?: string | null
          meta_page_name?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          gbp_account_id?: string | null
          gbp_connected_at?: string | null
          gbp_location_id?: string | null
          gbp_location_name?: string | null
          gbp_perf_last_sync_at?: string | null
          gbp_perf_last_sync_error?: string | null
          gbp_perf_last_sync_status?: string | null
          gbp_refresh_token?: string | null
          google_ads_account_name?: string | null
          google_ads_customer_id?: string | null
          google_ads_login_customer_id?: string | null
          google_ads_refresh_token?: string | null
          id?: string
          last_gbp_sync_at?: string | null
          last_google_sync_at?: string | null
          last_meta_sync_at?: string | null
          meta_granted_scopes?: string[] | null
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
      clinic_brand_dna: {
        Row: {
          additional_fields: Json
          call_notes: Json
          clinic_id: string
          completeness_score: number
          confidence_flags: Json
          created_at: string
          id: string
          status: string
          submitted_by: string | null
          synthesized_profile: Json
          updated_at: string
          website_extracted_at: string | null
        }
        Insert: {
          additional_fields?: Json
          call_notes?: Json
          clinic_id: string
          completeness_score?: number
          confidence_flags?: Json
          created_at?: string
          id?: string
          status?: string
          submitted_by?: string | null
          synthesized_profile?: Json
          updated_at?: string
          website_extracted_at?: string | null
        }
        Update: {
          additional_fields?: Json
          call_notes?: Json
          clinic_id?: string
          completeness_score?: number
          confidence_flags?: Json
          created_at?: string
          id?: string
          status?: string
          submitted_by?: string | null
          synthesized_profile?: Json
          updated_at?: string
          website_extracted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_brand_dna_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_ga4_credentials: {
        Row: {
          clinic_id: string
          connected_by: string | null
          created_at: string
          ga4_account_display_name: string | null
          ga4_property_display_name: string | null
          ga4_property_id: string | null
          id: string
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          refresh_token_enc: string | null
          updated_at: string
        }
        Insert: {
          clinic_id: string
          connected_by?: string | null
          created_at?: string
          ga4_account_display_name?: string | null
          ga4_property_display_name?: string | null
          ga4_property_id?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          refresh_token_enc?: string | null
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          connected_by?: string | null
          created_at?: string
          ga4_account_display_name?: string | null
          ga4_property_display_name?: string | null
          ga4_property_id?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          refresh_token_enc?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_ga4_credentials_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_ga4_cta_daily: {
        Row: {
          clinic_id: string
          created_at: string
          cta_type: string
          date: string
          event_count: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          cta_type: string
          date: string
          event_count?: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          cta_type?: string
          date?: string
          event_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "clinic_ga4_cta_daily_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_ga4_traffic_daily: {
        Row: {
          avg_engagement_time_seconds: number
          channel_group: string
          clinic_id: string
          created_at: string
          date: string
          engaged_sessions: number
          engagement_rate: number
          event_count: number
          events_per_session: number
          id: string
          sessions: number
          updated_at: string
        }
        Insert: {
          avg_engagement_time_seconds?: number
          channel_group: string
          clinic_id: string
          created_at?: string
          date: string
          engaged_sessions?: number
          engagement_rate?: number
          event_count?: number
          events_per_session?: number
          id?: string
          sessions?: number
          updated_at?: string
        }
        Update: {
          avg_engagement_time_seconds?: number
          channel_group?: string
          clinic_id?: string
          created_at?: string
          date?: string
          engaged_sessions?: number
          engagement_rate?: number
          event_count?: number
          events_per_session?: number
          id?: string
          sessions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_ga4_traffic_daily_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_gbp_config: {
        Row: {
          accreditations: string[] | null
          after_hours_referral: string | null
          booking_url: string | null
          city: string | null
          clinic_differentiator: string | null
          clinic_id: string
          cluster_id: string | null
          cluster_position: string | null
          content_exclusions: string[] | null
          country: string | null
          created_at: string | null
          founding_story: string | null
          geo_radius_km: number | null
          governing_body: string | null
          hook_style_current: string | null
          hospital_type: number | null
          hours: Json | null
          id: string
          jurisdiction: string | null
          last_variant_used: string | null
          local_landmarks: string[] | null
          narrative_anchor: string | null
          neighbourhood: string | null
          neighbourhood_character: string | null
          phone_number: string | null
          species_treated: string[] | null
          stat_holiday_protocol: string | null
          state_or_province: string | null
          top_services: string[] | null
          topic_variant_current: string | null
          updated_at: string | null
          voice_fingerprint: string | null
          website_url: string | null
        }
        Insert: {
          accreditations?: string[] | null
          after_hours_referral?: string | null
          booking_url?: string | null
          city?: string | null
          clinic_differentiator?: string | null
          clinic_id: string
          cluster_id?: string | null
          cluster_position?: string | null
          content_exclusions?: string[] | null
          country?: string | null
          created_at?: string | null
          founding_story?: string | null
          geo_radius_km?: number | null
          governing_body?: string | null
          hook_style_current?: string | null
          hospital_type?: number | null
          hours?: Json | null
          id?: string
          jurisdiction?: string | null
          last_variant_used?: string | null
          local_landmarks?: string[] | null
          narrative_anchor?: string | null
          neighbourhood?: string | null
          neighbourhood_character?: string | null
          phone_number?: string | null
          species_treated?: string[] | null
          stat_holiday_protocol?: string | null
          state_or_province?: string | null
          top_services?: string[] | null
          topic_variant_current?: string | null
          updated_at?: string | null
          voice_fingerprint?: string | null
          website_url?: string | null
        }
        Update: {
          accreditations?: string[] | null
          after_hours_referral?: string | null
          booking_url?: string | null
          city?: string | null
          clinic_differentiator?: string | null
          clinic_id?: string
          cluster_id?: string | null
          cluster_position?: string | null
          content_exclusions?: string[] | null
          country?: string | null
          created_at?: string | null
          founding_story?: string | null
          geo_radius_km?: number | null
          governing_body?: string | null
          hook_style_current?: string | null
          hospital_type?: number | null
          hours?: Json | null
          id?: string
          jurisdiction?: string | null
          last_variant_used?: string | null
          local_landmarks?: string[] | null
          narrative_anchor?: string | null
          neighbourhood?: string | null
          neighbourhood_character?: string | null
          phone_number?: string | null
          species_treated?: string[] | null
          stat_holiday_protocol?: string | null
          state_or_province?: string | null
          top_services?: string[] | null
          topic_variant_current?: string | null
          updated_at?: string | null
          voice_fingerprint?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_gbp_config_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_gbp_config_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "geo_clusters"
            referencedColumns: ["cluster_id"]
          },
        ]
      }
      clinic_gbp_performance_daily: {
        Row: {
          business_bookings: number
          business_conversations: number
          business_direction_requests: number
          business_impressions_desktop_maps: number
          business_impressions_desktop_search: number
          business_impressions_mobile_maps: number
          business_impressions_mobile_search: number
          call_clicks: number
          clinic_id: string
          created_at: string
          date: string
          id: string
          location_id: string
          website_clicks: number
        }
        Insert: {
          business_bookings?: number
          business_conversations?: number
          business_direction_requests?: number
          business_impressions_desktop_maps?: number
          business_impressions_desktop_search?: number
          business_impressions_mobile_maps?: number
          business_impressions_mobile_search?: number
          call_clicks?: number
          clinic_id: string
          created_at?: string
          date: string
          id?: string
          location_id: string
          website_clicks?: number
        }
        Update: {
          business_bookings?: number
          business_conversations?: number
          business_direction_requests?: number
          business_impressions_desktop_maps?: number
          business_impressions_desktop_search?: number
          business_impressions_mobile_maps?: number
          business_impressions_mobile_search?: number
          call_clicks?: number
          clinic_id?: string
          created_at?: string
          date?: string
          id?: string
          location_id?: string
          website_clicks?: number
        }
        Relationships: [
          {
            foreignKeyName: "clinic_gbp_performance_daily_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_monthly_signals: {
        Row: {
          active_promotions: Json | null
          campaign_month_number: number | null
          client_asset_post_count: number | null
          client_content_preference: Json | null
          clinic_id: string
          clinic_news_this_month: string | null
          community_events: Json | null
          created_at: string
          currency: string | null
          facebook_specific_this_month: string | null
          id: string
          local_alerts: Json | null
          local_news: Json | null
          month_year: string
          monthly_budget: number | null
          seasonal_topics: Json | null
          statutory_holidays: Json | null
          stock_post_count: number | null
          top_performer_last_month: Json | null
          updated_at: string
        }
        Insert: {
          active_promotions?: Json | null
          campaign_month_number?: number | null
          client_asset_post_count?: number | null
          client_content_preference?: Json | null
          clinic_id: string
          clinic_news_this_month?: string | null
          community_events?: Json | null
          created_at?: string
          currency?: string | null
          facebook_specific_this_month?: string | null
          id?: string
          local_alerts?: Json | null
          local_news?: Json | null
          month_year: string
          monthly_budget?: number | null
          seasonal_topics?: Json | null
          statutory_holidays?: Json | null
          stock_post_count?: number | null
          top_performer_last_month?: Json | null
          updated_at?: string
        }
        Update: {
          active_promotions?: Json | null
          campaign_month_number?: number | null
          client_asset_post_count?: number | null
          client_content_preference?: Json | null
          clinic_id?: string
          clinic_news_this_month?: string | null
          community_events?: Json | null
          created_at?: string
          currency?: string | null
          facebook_specific_this_month?: string | null
          id?: string
          local_alerts?: Json | null
          local_news?: Json | null
          month_year?: string
          monthly_budget?: number | null
          seasonal_topics?: Json | null
          statutory_holidays?: Json | null
          stock_post_count?: number | null
          top_performer_last_month?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_monthly_signals_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_partners: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_partners_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_promotions: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          end_date: string
          exclusions: string
          governing_body_confirmed: boolean | null
          id: string
          inclusions: string
          offer_name: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          end_date: string
          exclusions?: string
          governing_body_confirmed?: boolean | null
          id?: string
          inclusions?: string
          offer_name: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string
          exclusions?: string
          governing_body_confirmed?: boolean | null
          id?: string
          inclusions?: string
          offer_name?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_promotions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
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
          blog_package_active: boolean
          campaign_start_date: string | null
          clinic_name: string
          compliance_body_override: string | null
          content_settings: Json
          created_at: string
          email: string | null
          google_ads_enabled: boolean
          google_place_id: string | null
          id: string
          logo_url: string | null
          owner_user_id: string | null
          phone: string | null
          profile_status: string | null
          seo_enabled: boolean
          social_media_enabled: boolean
          status: string
          timezone: string | null
          tracking_script_url: string | null
          website: string | null
          website_enabled: boolean
        }
        Insert: {
          address?: string | null
          ai_seo_enabled?: boolean
          assigned_concierge_id?: string | null
          blog_package_active?: boolean
          campaign_start_date?: string | null
          clinic_name: string
          compliance_body_override?: string | null
          content_settings?: Json
          created_at?: string
          email?: string | null
          google_ads_enabled?: boolean
          google_place_id?: string | null
          id?: string
          logo_url?: string | null
          owner_user_id?: string | null
          phone?: string | null
          profile_status?: string | null
          seo_enabled?: boolean
          social_media_enabled?: boolean
          status?: string
          timezone?: string | null
          tracking_script_url?: string | null
          website?: string | null
          website_enabled?: boolean
        }
        Update: {
          address?: string | null
          ai_seo_enabled?: boolean
          assigned_concierge_id?: string | null
          blog_package_active?: boolean
          campaign_start_date?: string | null
          clinic_name?: string
          compliance_body_override?: string | null
          content_settings?: Json
          created_at?: string
          email?: string | null
          google_ads_enabled?: boolean
          google_place_id?: string | null
          id?: string
          logo_url?: string | null
          owner_user_id?: string | null
          phone?: string | null
          profile_status?: string | null
          seo_enabled?: boolean
          social_media_enabled?: boolean
          status?: string
          timezone?: string | null
          tracking_script_url?: string | null
          website?: string | null
          website_enabled?: boolean
        }
        Relationships: []
      }
      compliance_override_log: {
        Row: {
          clinic_id: string | null
          compliance_body: string | null
          context: string
          created_at: string
          id: string
          issues: Json
          metadata: Json
          offer_name: string | null
          override_reason: string
          user_id: string
        }
        Insert: {
          clinic_id?: string | null
          compliance_body?: string | null
          context: string
          created_at?: string
          id?: string
          issues?: Json
          metadata?: Json
          offer_name?: string | null
          override_reason: string
          user_id: string
        }
        Update: {
          clinic_id?: string | null
          compliance_body?: string | null
          context?: string
          created_at?: string
          id?: string
          issues?: Json
          metadata?: Json
          offer_name?: string | null
          override_reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_override_log_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
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
          image_url: string | null
          image_urls: string[] | null
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
          image_url?: string | null
          image_urls?: string[] | null
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
          image_url?: string | null
          image_urls?: string[] | null
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
          auto_approve_at: string | null
          clinic_id: string
          created_at: string
          created_by_concierge_id: string
          id: string
          intake_data: Json
          sent_to_client_at: string | null
          status: string
        }
        Insert: {
          auto_approve_at?: string | null
          clinic_id: string
          created_at?: string
          created_by_concierge_id: string
          id?: string
          intake_data?: Json
          sent_to_client_at?: string | null
          status?: string
        }
        Update: {
          auto_approve_at?: string | null
          clinic_id?: string
          created_at?: string
          created_by_concierge_id?: string
          id?: string
          intake_data?: Json
          sent_to_client_at?: string | null
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
      cron_heartbeats: {
        Row: {
          failures_24h: number
          job_name: string
          last_error: string | null
          last_run_at: string
          last_status: string
          runs_24h: number
          updated_at: string
          window_start: string
        }
        Insert: {
          failures_24h?: number
          job_name: string
          last_error?: string | null
          last_run_at?: string
          last_status?: string
          runs_24h?: number
          updated_at?: string
          window_start?: string
        }
        Update: {
          failures_24h?: number
          job_name?: string
          last_error?: string | null
          last_run_at?: string
          last_status?: string
          runs_24h?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      department_chat_reads: {
        Row: {
          clinic_id: string
          department: Database["public"]["Enums"]["department_type"]
          id: string
          last_read_at: string
          last_read_message_id: string | null
          user_id: string
        }
        Insert: {
          clinic_id: string
          department: Database["public"]["Enums"]["department_type"]
          id?: string
          last_read_at?: string
          last_read_message_id?: string | null
          user_id: string
        }
        Update: {
          clinic_id?: string
          department?: Database["public"]["Enums"]["department_type"]
          id?: string
          last_read_at?: string
          last_read_message_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_chat_reads_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_chat_reads_last_read_message_id_fkey"
            columns: ["last_read_message_id"]
            isOneToOne: false
            referencedRelation: "department_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      department_chats: {
        Row: {
          attachments: Json
          clinic_id: string
          created_at: string
          department: Database["public"]["Enums"]["department_type"]
          edited_at: string | null
          id: string
          message: string
          pinned: boolean
          reactions: Json
          reply_to: string | null
          user_id: string
        }
        Insert: {
          attachments?: Json
          clinic_id: string
          created_at?: string
          department: Database["public"]["Enums"]["department_type"]
          edited_at?: string | null
          id?: string
          message: string
          pinned?: boolean
          reactions?: Json
          reply_to?: string | null
          user_id: string
        }
        Update: {
          attachments?: Json
          clinic_id?: string
          created_at?: string
          department?: Database["public"]["Enums"]["department_type"]
          edited_at?: string | null
          id?: string
          message?: string
          pinned?: boolean
          reactions?: Json
          reply_to?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_chats_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_chats_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "department_chats"
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
      department_task_attachments: {
        Row: {
          created_at: string
          duration_seconds: number | null
          file_name: string
          file_path: string
          id: string
          kind: string
          mime_type: string | null
          size_bytes: number | null
          task_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          file_name: string
          file_path: string
          id?: string
          kind: string
          mime_type?: string | null
          size_bytes?: number | null
          task_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          file_name?: string
          file_path?: string
          id?: string
          kind?: string
          mime_type?: string | null
          size_bytes?: number | null
          task_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "department_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      department_task_candidates: {
        Row: {
          created_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_task_candidates_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "department_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      department_task_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "department_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      department_tasks: {
        Row: {
          assigned_to: string | null
          clinic_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          department: Database["public"]["Enums"]["department_type"]
          description: string | null
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          clinic_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          department: Database["public"]["Enums"]["department_type"]
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          clinic_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          department?: Database["public"]["Enums"]["department_type"]
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_tasks_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      department_ticket_assignments: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          department: Database["public"]["Enums"]["department_type"]
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          department: Database["public"]["Enums"]["department_type"]
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          department?: Database["public"]["Enums"]["department_type"]
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_ticket_assignments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_ticket_assignments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "department_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      department_ticket_candidates: {
        Row: {
          created_at: string
          department: Database["public"]["Enums"]["department_type"]
          ticket_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department: Database["public"]["Enums"]["department_type"]
          ticket_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          department?: Database["public"]["Enums"]["department_type"]
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_ticket_candidates_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "department_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      department_tickets: {
        Row: {
          assigned_to: string | null
          attachments: string[] | null
          clinic_id: string | null
          completion_email_error: string | null
          completion_email_recipients: number | null
          completion_email_sent_at: string | null
          content_approval_status: string | null
          content_approved_at: string | null
          content_change_notes: string | null
          content_deliverable_files: string[]
          content_preview: Json | null
          content_ready_for_review_at: string | null
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
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          assigned_to?: string | null
          attachments?: string[] | null
          clinic_id?: string | null
          completion_email_error?: string | null
          completion_email_recipients?: number | null
          completion_email_sent_at?: string | null
          content_approval_status?: string | null
          content_approved_at?: string | null
          content_change_notes?: string | null
          content_deliverable_files?: string[]
          content_preview?: Json | null
          content_ready_for_review_at?: string | null
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
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          assigned_to?: string | null
          attachments?: string[] | null
          clinic_id?: string | null
          completion_email_error?: string | null
          completion_email_recipients?: number | null
          completion_email_sent_at?: string | null
          content_approval_status?: string | null
          content_approved_at?: string | null
          content_change_notes?: string | null
          content_deliverable_files?: string[]
          content_preview?: Json | null
          content_ready_for_review_at?: string | null
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
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
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
      gbp_batches: {
        Row: {
          batch_number: number
          clinics: string[]
          cluster_id: string | null
          collision_check: Json | null
          created_at: string | null
          id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          batch_number: number
          clinics?: string[]
          cluster_id?: string | null
          collision_check?: Json | null
          created_at?: string | null
          id?: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          batch_number?: number
          clinics?: string[]
          cluster_id?: string | null
          collision_check?: Json | null
          created_at?: string | null
          id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gbp_batches_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "geo_clusters"
            referencedColumns: ["cluster_id"]
          },
        ]
      }
      gbp_compliance_scans: {
        Row: {
          batch_id: string | null
          clinic_id: string
          id: string
          issues_count: number | null
          month: number
          overall_pass: boolean
          scan_result: Json
          scanned_at: string | null
          year: number
        }
        Insert: {
          batch_id?: string | null
          clinic_id: string
          id?: string
          issues_count?: number | null
          month: number
          overall_pass: boolean
          scan_result: Json
          scanned_at?: string | null
          year: number
        }
        Update: {
          batch_id?: string | null
          clinic_id?: string
          id?: string
          issues_count?: number | null
          month?: number
          overall_pass?: boolean
          scan_result?: Json
          scanned_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "gbp_compliance_scans_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "gbp_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gbp_compliance_scans_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      gbp_post_history: {
        Row: {
          approved_by: string | null
          batch_id: string | null
          clinic_id: string
          compliance_scan: Json | null
          created_at: string | null
          cta_text: string | null
          cta_url: string | null
          gbp_post_resource_name: string | null
          generated_by: string | null
          hook_style: string | null
          id: string
          local_landmark_used: string | null
          month: number
          post_content: string
          post_type: string
          primary_keyword: string
          publish_attempts: number
          publish_error: string | null
          published_at: string | null
          reviewed_by: string | null
          scheduled_publish_at: string | null
          secondary_keywords: string[] | null
          status: string | null
          topic: string
          topic_variant: string | null
          updated_at: string | null
          week_number: number
          word_count: number | null
          year: number
        }
        Insert: {
          approved_by?: string | null
          batch_id?: string | null
          clinic_id: string
          compliance_scan?: Json | null
          created_at?: string | null
          cta_text?: string | null
          cta_url?: string | null
          gbp_post_resource_name?: string | null
          generated_by?: string | null
          hook_style?: string | null
          id?: string
          local_landmark_used?: string | null
          month: number
          post_content: string
          post_type: string
          primary_keyword: string
          publish_attempts?: number
          publish_error?: string | null
          published_at?: string | null
          reviewed_by?: string | null
          scheduled_publish_at?: string | null
          secondary_keywords?: string[] | null
          status?: string | null
          topic: string
          topic_variant?: string | null
          updated_at?: string | null
          week_number: number
          word_count?: number | null
          year: number
        }
        Update: {
          approved_by?: string | null
          batch_id?: string | null
          clinic_id?: string
          compliance_scan?: Json | null
          created_at?: string | null
          cta_text?: string | null
          cta_url?: string | null
          gbp_post_resource_name?: string | null
          generated_by?: string | null
          hook_style?: string | null
          id?: string
          local_landmark_used?: string | null
          month?: number
          post_content?: string
          post_type?: string
          primary_keyword?: string
          publish_attempts?: number
          publish_error?: string | null
          published_at?: string | null
          reviewed_by?: string | null
          scheduled_publish_at?: string | null
          secondary_keywords?: string[] | null
          status?: string | null
          topic?: string
          topic_variant?: string | null
          updated_at?: string | null
          week_number?: number
          word_count?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "gbp_post_history_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "gbp_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gbp_post_history_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      gbp_recent_content: {
        Row: {
          clinic_id: string
          content_type: string
          created_at: string | null
          id: string
          primary_keyword: string | null
          publish_date: string | null
          source_month: number | null
          source_year: number | null
          title: string
          topic_cluster: string | null
        }
        Insert: {
          clinic_id: string
          content_type: string
          created_at?: string | null
          id?: string
          primary_keyword?: string | null
          publish_date?: string | null
          source_month?: number | null
          source_year?: number | null
          title: string
          topic_cluster?: string | null
        }
        Update: {
          clinic_id?: string
          content_type?: string
          created_at?: string | null
          id?: string
          primary_keyword?: string | null
          publish_date?: string | null
          source_month?: number | null
          source_year?: number | null
          title?: string
          topic_cluster?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gbp_recent_content_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      gbp_topic_library: {
        Row: {
          created_at: string | null
          id: string
          month: number
          seasonal_theme: string
          updated_at: string | null
          variant: string
          week_1_topic: string
          week_2_topic: string
          week_3_topic: string
          week_4_topic: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          month: number
          seasonal_theme: string
          updated_at?: string | null
          variant: string
          week_1_topic: string
          week_2_topic: string
          week_3_topic: string
          week_4_topic: string
        }
        Update: {
          created_at?: string | null
          id?: string
          month?: number
          seasonal_theme?: string
          updated_at?: string | null
          variant?: string
          week_1_topic?: string
          week_2_topic?: string
          week_3_topic?: string
          week_4_topic?: string
        }
        Relationships: []
      }
      geo_clusters: {
        Row: {
          clinics: string[]
          cluster_id: string
          created_at: string | null
          id: string
          is_solo: boolean | null
          region: string
          updated_at: string | null
        }
        Insert: {
          clinics?: string[]
          cluster_id: string
          created_at?: string | null
          id?: string
          is_solo?: boolean | null
          region: string
          updated_at?: string | null
        }
        Update: {
          clinics?: string[]
          cluster_id?: string
          created_at?: string | null
          id?: string
          is_solo?: boolean | null
          region?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      oauth_temp_tokens: {
        Row: {
          clinic_id: string
          created_at: string
          expires_at: string
          id: string
          payload: Json
          provider: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          expires_at?: string
          id?: string
          payload?: Json
          provider: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          payload?: Json
          provider?: string
        }
        Relationships: []
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
          welcome_email_last_attempt_at: string | null
          welcome_email_last_error: string | null
          welcome_email_sent_at: string | null
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
          welcome_email_last_attempt_at?: string | null
          welcome_email_last_error?: string | null
          welcome_email_sent_at?: string | null
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
          welcome_email_last_attempt_at?: string | null
          welcome_email_last_error?: string | null
          welcome_email_sent_at?: string | null
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
      sm2_generations: {
        Row: {
          approval_status: string
          approved_at: string | null
          auto_approved_at: string | null
          client_feedback: string | null
          clinic_id: string
          created_at: string
          dna_completeness_score: number | null
          email_day0_sent: boolean | null
          email_day3_sent: boolean | null
          email_day5_sent: boolean | null
          failure_reason: string | null
          generation_confidence_score: number | null
          html_file_path: string | null
          id: string
          last_attempt_at: string | null
          model_used: string | null
          month_year: string
          next_retry_at: string | null
          pipeline_data: Json
          pipeline_stage: string
          retry_count: number
          sent_to_client_at: string | null
          stage_completed_at: string | null
          stage_started_at: string | null
          token_count: number | null
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          auto_approved_at?: string | null
          client_feedback?: string | null
          clinic_id: string
          created_at?: string
          dna_completeness_score?: number | null
          email_day0_sent?: boolean | null
          email_day3_sent?: boolean | null
          email_day5_sent?: boolean | null
          failure_reason?: string | null
          generation_confidence_score?: number | null
          html_file_path?: string | null
          id?: string
          last_attempt_at?: string | null
          model_used?: string | null
          month_year: string
          next_retry_at?: string | null
          pipeline_data?: Json
          pipeline_stage?: string
          retry_count?: number
          sent_to_client_at?: string | null
          stage_completed_at?: string | null
          stage_started_at?: string | null
          token_count?: number | null
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          auto_approved_at?: string | null
          client_feedback?: string | null
          clinic_id?: string
          created_at?: string
          dna_completeness_score?: number | null
          email_day0_sent?: boolean | null
          email_day3_sent?: boolean | null
          email_day5_sent?: boolean | null
          failure_reason?: string | null
          generation_confidence_score?: number | null
          html_file_path?: string | null
          id?: string
          last_attempt_at?: string | null
          model_used?: string | null
          month_year?: string
          next_retry_at?: string | null
          pipeline_data?: Json
          pipeline_stage?: string
          retry_count?: number
          sent_to_client_at?: string | null
          stage_completed_at?: string | null
          stage_started_at?: string | null
          token_count?: number | null
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sm2_generations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      sm2_post_performance: {
        Row: {
          clinic_id: string
          comments: number
          created_at: string
          generation_id: string
          id: string
          likes: number
          platform: string
          post_number: number
          reach: number
          recorded_at: string
          shares: number
        }
        Insert: {
          clinic_id: string
          comments?: number
          created_at?: string
          generation_id: string
          id?: string
          likes?: number
          platform?: string
          post_number?: number
          reach?: number
          recorded_at?: string
          shares?: number
        }
        Update: {
          clinic_id?: string
          comments?: number
          created_at?: string
          generation_id?: string
          id?: string
          likes?: number
          platform?: string
          post_number?: number
          reach?: number
          recorded_at?: string
          shares?: number
        }
        Relationships: [
          {
            foreignKeyName: "sm2_post_performance_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sm2_post_performance_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "sm2_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      sm2_posts: {
        Row: {
          art_direction: Json | null
          caption: string | null
          client_feedback: string | null
          clinic_id: string
          compliance_notes: string | null
          concierge_brief: Json | null
          created_at: string
          cta: string | null
          generation_id: string
          hashtags: string[] | null
          hook: string | null
          hook_b: string | null
          id: string
          image_path: string | null
          image_paths: string[]
          image_uploaded_at: string | null
          image_uploaded_by: string | null
          platform: string
          position: number
          post_number: number | null
          post_type: string | null
          run_meta_ad: boolean
          scheduled_date: string
          status: string | null
          stories: Json | null
          theme: string | null
          topic: string | null
          updated_at: string
        }
        Insert: {
          art_direction?: Json | null
          caption?: string | null
          client_feedback?: string | null
          clinic_id: string
          compliance_notes?: string | null
          concierge_brief?: Json | null
          created_at?: string
          cta?: string | null
          generation_id: string
          hashtags?: string[] | null
          hook?: string | null
          hook_b?: string | null
          id?: string
          image_path?: string | null
          image_paths?: string[]
          image_uploaded_at?: string | null
          image_uploaded_by?: string | null
          platform: string
          position?: number
          post_number?: number | null
          post_type?: string | null
          run_meta_ad?: boolean
          scheduled_date: string
          status?: string | null
          stories?: Json | null
          theme?: string | null
          topic?: string | null
          updated_at?: string
        }
        Update: {
          art_direction?: Json | null
          caption?: string | null
          client_feedback?: string | null
          clinic_id?: string
          compliance_notes?: string | null
          concierge_brief?: Json | null
          created_at?: string
          cta?: string | null
          generation_id?: string
          hashtags?: string[] | null
          hook?: string | null
          hook_b?: string | null
          id?: string
          image_path?: string | null
          image_paths?: string[]
          image_uploaded_at?: string | null
          image_uploaded_by?: string | null
          platform?: string
          position?: number
          post_number?: number | null
          post_type?: string | null
          run_meta_ad?: boolean
          scheduled_date?: string
          status?: string | null
          stories?: Json | null
          theme?: string | null
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sm2_posts_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "sm2_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      sm2_system_prompts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          notes: string | null
          prompt_text: string
          version: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          prompt_text: string
          version: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          prompt_text?: string
          version?: string
        }
        Relationships: []
      }
      statutory_holidays_reference: {
        Row: {
          created_at: string
          day_of_month: number | null
          day_rule: string | null
          holiday_name: string
          id: string
          month: number
          province: string
        }
        Insert: {
          created_at?: string
          day_of_month?: number | null
          day_rule?: string | null
          holiday_name: string
          id?: string
          month: number
          province: string
        }
        Update: {
          created_at?: string
          day_of_month?: number | null
          day_rule?: string | null
          holiday_name?: string
          id?: string
          month?: number
          province?: string
        }
        Relationships: []
      }
      sub_account_clinics: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          sub_account_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          sub_account_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          sub_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_account_clinics_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_account_clinics_sub_account_id_fkey"
            columns: ["sub_account_id"]
            isOneToOne: false
            referencedRelation: "client_sub_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      terms_acceptance_log: {
        Row: {
          acceptance_type: string
          accepted_at: string
          casl_consent_given: boolean
          id: string
          ip_address: string | null
          terms_version: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          acceptance_type?: string
          accepted_at?: string
          casl_consent_given?: boolean
          id?: string
          ip_address?: string | null
          terms_version: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          acceptance_type?: string
          accepted_at?: string
          casl_consent_given?: boolean
          id?: string
          ip_address?: string | null
          terms_version?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_acceptance_log_terms_version_fkey"
            columns: ["terms_version"]
            isOneToOne: false
            referencedRelation: "terms_versions"
            referencedColumns: ["version"]
          },
        ]
      }
      terms_decline_log: {
        Row: {
          declined_at: string
          id: string
          ip_address: string | null
          resolution: string | null
          resolved_at: string | null
          terms_version: string
          user_id: string
        }
        Insert: {
          declined_at?: string
          id?: string
          ip_address?: string | null
          resolution?: string | null
          resolved_at?: string | null
          terms_version: string
          user_id: string
        }
        Update: {
          declined_at?: string
          id?: string
          ip_address?: string | null
          resolution?: string | null
          resolved_at?: string | null
          terms_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_decline_log_terms_version_fkey"
            columns: ["terms_version"]
            isOneToOne: false
            referencedRelation: "terms_versions"
            referencedColumns: ["version"]
          },
        ]
      }
      terms_versions: {
        Row: {
          amendment_type: string
          created_at: string
          effective_at: string
          is_active: boolean
          version: string
        }
        Insert: {
          amendment_type?: string
          created_at?: string
          effective_at: string
          is_active?: boolean
          version: string
        }
        Update: {
          amendment_type?: string
          created_at?: string
          effective_at?: string
          is_active?: boolean
          version?: string
        }
        Relationships: []
      }
      ticket_assignees: {
        Row: {
          created_at: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ticket_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_assignees_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "department_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_audit_log: {
        Row: {
          actor_id: string | null
          created_at: string
          field: string
          id: string
          new_value: string | null
          old_value: string | null
          ticket_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          ticket_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_audit_log_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "department_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_login_activity: {
        Row: {
          first_login_at: string | null
          last_seen_at: string | null
          login_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          first_login_at?: string | null
          last_seen_at?: string | null
          login_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          first_login_at?: string | null
          last_seen_at?: string | null
          login_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_login_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
          country_code: string | null
          created_at: string
          id: string
          path: string
          referrer: string | null
          region: string | null
          session_id: string
        }
        Insert: {
          clinic_id: string
          country_code?: string | null
          created_at?: string
          id?: string
          path?: string
          referrer?: string | null
          region?: string | null
          session_id: string
        }
        Update: {
          clinic_id?: string
          country_code?: string | null
          created_at?: string
          id?: string
          path?: string
          referrer?: string | null
          region?: string | null
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
      _rebuild_gbp_batches_from_clusters: { Args: never; Returns: undefined }
      can_access_clinic_department: {
        Args: {
          _clinic_id: string
          _department: Database["public"]["Enums"]["department_type"]
          _user_id: string
        }
        Returns: boolean
      }
      can_manage_clinic_logo: {
        Args: { _clinic_id: string; _user_id: string }
        Returns: boolean
      }
      client_set_content_approval: {
        Args: { _notes?: string; _status: string; _ticket_id: string }
        Returns: undefined
      }
      compute_ticket_rollup_status: {
        Args: { _ticket_id: string }
        Returns: Database["public"]["Enums"]["ticket_status"]
      }
      delete_clinic_by_id: { Args: { _clinic_id: string }; Returns: undefined }
      extract_city_from_address: { Args: { _address: string }; Returns: string }
      get_accessible_clinic_ids: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_client_login_summary: {
        Args: never
        Returns: {
          email: string
          first_login_at: string
          full_name: string
          last_seen_at: string
          login_count: number
          parent_user_id: string
          role: string
          user_id: string
        }[]
      }
      get_concierge_clinic_ids: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_cron_job_health: {
        Args: never
        Returns: {
          failures_24h: number
          jobname: string
          last_message: string
          last_run_at: string
          last_status: string
          runs_24h: number
        }[]
      }
      get_partner_clinic_ids: { Args: { _user_id: string }; Returns: string[] }
      get_sub_account_clinic_ids: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_team_activity_summary: {
        Args: never
        Returns: {
          calendars_created: number
          chat_messages: number
          comments_posted: number
          email: string
          first_login_at: string
          full_name: string
          is_online: boolean
          last_activity_at: string
          last_seen_at: string
          login_count: number
          posts_acted_on: number
          role: string
          team_role: string
          tickets_assigned: number
          tickets_completed: number
          tickets_in_progress: number
          tickets_voided: number
          user_id: string
        }[]
      }
      get_team_member_timeline: {
        Args: { _limit?: number; _offset?: number; _user_id: string }
        Returns: {
          clinic_id: string
          description: string
          event_at: string
          event_type: string
          metadata: Json
          ref_id: string
        }[]
      }
      get_ticket_user_directory: {
        Args: { _ticket_id: string }
        Returns: {
          full_name: string
          user_id: string
        }[]
      }
      get_ticket_visibility_departments: {
        Args: { _description: string; _ticket_type: string }
        Returns: Database["public"]["Enums"]["department_type"][]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_accepted_current_terms: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_clinic_dept_team_member: {
        Args: {
          _clinic_id: string
          _department: Database["public"]["Enums"]["department_type"]
          _user_id: string
        }
        Returns: boolean
      }
      is_clinic_team_member: {
        Args: { _clinic_id: string; _user_id: string }
        Returns: boolean
      }
      is_department_enabled_for_clinic: {
        Args: {
          _clinic_id: string
          _department: Database["public"]["Enums"]["department_type"]
        }
        Returns: boolean
      }
      is_department_member: {
        Args: {
          _department: Database["public"]["Enums"]["department_type"]
          _user_id: string
        }
        Returns: boolean
      }
      is_sub_account: { Args: { _user_id: string }; Returns: boolean }
      list_assignees_for_dept: {
        Args: {
          _clinic_id: string
          _department: Database["public"]["Enums"]["department_type"]
        }
        Returns: string[]
      }
      pick_assignee_for_dept: {
        Args: {
          _clinic_id: string
          _department: Database["public"]["Enums"]["department_type"]
        }
        Returns: string
      }
      populate_monthly_holidays: {
        Args: { _clinic_id: string; _month: number; _province: string }
        Returns: undefined
      }
      realtime_topic_authorized: { Args: { _topic: string }; Returns: boolean }
      rebuild_geo_clusters: { Args: never; Returns: undefined }
      record_cron_heartbeat: {
        Args: { _error?: string; _job_name: string; _status?: string }
        Returns: undefined
      }
      record_login_activity: { Args: never; Returns: undefined }
      slugify_city: { Args: { _city: string }; Returns: string }
      sub_account_hides_financials: {
        Args: { _user_id: string }
        Returns: boolean
      }
      touch_login_activity: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "concierge" | "client" | "sub_client"
      department_type: "website" | "seo" | "google_ads" | "social_media"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "todo" | "in_progress" | "done" | "cancelled"
      ticket_priority: "regular" | "urgent" | "emergency"
      ticket_status: "open" | "in_progress" | "completed" | "emergency" | "void"
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
      app_role: ["admin", "concierge", "client", "sub_client"],
      department_type: ["website", "seo", "google_ads", "social_media"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["todo", "in_progress", "done", "cancelled"],
      ticket_priority: ["regular", "urgent", "emergency"],
      ticket_status: ["open", "in_progress", "completed", "emergency", "void"],
    },
  },
} as const
