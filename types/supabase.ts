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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      application_history: {
        Row: {
          application_method: string | null
          applied_at: string | null
          company_name: string
          company_slug: string | null
          cover_letter_url: string | null
          cv_url: string | null
          id: string
          job_title: string | null
          job_url: string
          url_hash: string | null
          user_id: string
        }
        Insert: {
          application_method?: string | null
          applied_at?: string | null
          company_name: string
          company_slug?: string | null
          cover_letter_url?: string | null
          cv_url?: string | null
          id?: string
          job_title?: string | null
          job_url: string
          url_hash?: string | null
          user_id: string
        }
        Update: {
          application_method?: string | null
          applied_at?: string | null
          company_name?: string
          company_slug?: string | null
          cover_letter_url?: string | null
          cv_url?: string | null
          id?: string
          job_title?: string | null
          job_url?: string
          url_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      auto_search_configs: {
        Row: {
          blacklist_companies: string[] | null
          blacklist_keywords: string[] | null
          created_at: string | null
          daily_count: number | null
          id: string
          keywords: string
          last_reset_at: string | null
          location: string | null
          max_applications_per_day: number | null
          salary_max: number | null
          salary_min: number | null
          status: string | null
          user_id: string
        }
        Insert: {
          blacklist_companies?: string[] | null
          blacklist_keywords?: string[] | null
          created_at?: string | null
          daily_count?: number | null
          id?: string
          keywords: string
          last_reset_at?: string | null
          location?: string | null
          max_applications_per_day?: number | null
          salary_max?: number | null
          salary_min?: number | null
          status?: string | null
          user_id: string
        }
        Update: {
          blacklist_companies?: string[] | null
          blacklist_keywords?: string[] | null
          created_at?: string | null
          daily_count?: number | null
          id?: string
          keywords?: string
          last_reset_at?: string | null
          location?: string | null
          max_applications_per_day?: number | null
          salary_max?: number | null
          salary_min?: number | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      company_research: {
        Row: {
          company_name: string
          expires_at: string | null
          id: string
          intel_data: Json | null
          job_id: string | null
          linkedin_activity: Json[] | null
          perplexity_citations: Json[] | null
          recent_news: Json[] | null
          researched_at: string | null
          suggested_quotes: Json[] | null
        }
        Insert: {
          company_name: string
          expires_at?: string | null
          id?: string
          intel_data?: Json | null
          job_id?: string | null
          linkedin_activity?: Json[] | null
          perplexity_citations?: Json[] | null
          recent_news?: Json[] | null
          researched_at?: string | null
          suggested_quotes?: Json[] | null
        }
        Update: {
          company_name?: string
          expires_at?: string | null
          id?: string
          intel_data?: Json | null
          job_id?: string | null
          linkedin_activity?: Json[] | null
          perplexity_citations?: Json[] | null
          recent_news?: Json[] | null
          researched_at?: string | null
          suggested_quotes?: Json[] | null
        }
        Relationships: [
          {
            foreignKeyName: "company_research_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_history: {
        Row: {
          consent_given: boolean
          consented_at: string | null
          document_type: string
          document_version: string
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string
        }
        Insert: {
          consent_given: boolean
          consented_at?: string | null
          document_type: string
          document_version: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id: string
        }
        Update: {
          consent_given?: boolean
          consented_at?: string | null
          document_type?: string
          document_version?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string | null
          document_type: string
          file_url_encrypted: string
          id: string
          metadata: Json | null
          pii_encrypted: Json
          user_id: string
          writing_style_embedding: string | null
        }
        Insert: {
          created_at?: string | null
          document_type: string
          file_url_encrypted: string
          id?: string
          metadata?: Json | null
          pii_encrypted: Json
          user_id: string
          writing_style_embedding?: string | null
        }
        Update: {
          created_at?: string | null
          document_type?: string
          file_url_encrypted?: string
          id?: string
          metadata?: Json | null
          pii_encrypted?: Json
          user_id?: string
          writing_style_embedding?: string | null
        }
        Relationships: []
      }
      form_selectors: {
        Row: {
          company_domain: string | null
          created_at: string | null
          css_selector: string
          failure_count: number | null
          field_name: string
          id: string
          last_verified_at: string | null
          platform_name: string
          success_count: number | null
          trust_score: number | null
          verified_by_user_id: string | null
        }
        Insert: {
          company_domain?: string | null
          created_at?: string | null
          css_selector: string
          failure_count?: number | null
          field_name: string
          id?: string
          last_verified_at?: string | null
          platform_name: string
          success_count?: number | null
          trust_score?: number | null
          verified_by_user_id?: string | null
        }
        Update: {
          company_domain?: string | null
          created_at?: string | null
          css_selector?: string
          failure_count?: number | null
          field_name?: string
          id?: string
          last_verified_at?: string | null
          platform_name?: string
          success_count?: number | null
          trust_score?: number | null
          verified_by_user_id?: string | null
        }
        Relationships: []
      }
      generation_logs: {
        Row: {
          company_relevance_score: number | null
          completion_tokens: number | null
          created_at: string | null
          generated_text: string | null
          id: string
          individuality_score: number | null
          issues: Json | null
          iteration: number
          job_id: string | null
          model_name: string
          model_version: string | null
          naturalness_score: number | null
          overall_score: number | null
          prompt_tokens: number | null
          style_match_score: number | null
          suggestions: Json | null
          user_id: string | null
        }
        Insert: {
          company_relevance_score?: number | null
          completion_tokens?: number | null
          created_at?: string | null
          generated_text?: string | null
          id?: string
          individuality_score?: number | null
          issues?: Json | null
          iteration: number
          job_id?: string | null
          model_name: string
          model_version?: string | null
          naturalness_score?: number | null
          overall_score?: number | null
          prompt_tokens?: number | null
          style_match_score?: number | null
          suggestions?: Json | null
          user_id?: string | null
        }
        Update: {
          company_relevance_score?: number | null
          completion_tokens?: number | null
          created_at?: string | null
          generated_text?: string | null
          id?: string
          individuality_score?: number | null
          issues?: Json | null
          iteration?: number
          job_id?: string | null
          model_name?: string
          model_version?: string | null
          naturalness_score?: number | null
          overall_score?: number | null
          prompt_tokens?: number | null
          style_match_score?: number | null
          suggestions?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      job_queue: {
        Row: {
          company_name: string | null
          company_slug: string | null
          cover_letter: string | null
          cover_letter_quality_score: number | null
          created_at: string | null
          description: string | null
          id: string
          job_title: string | null
          job_url: string
          location: string | null
          manual_review_required: boolean | null
          optimized_cv_url: string | null
          platform: string | null
          priority: string | null
          processed_at: string | null
          rejection_reason: string | null
          requirements: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          salary_range: string | null
          search_config_id: string | null
          snapshot_at: string | null
          snapshot_html: string | null
          status: string | null
          user_id: string
          user_profile_id: string
        }
        Insert: {
          company_name?: string | null
          company_slug?: string | null
          cover_letter?: string | null
          cover_letter_quality_score?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          job_title?: string | null
          job_url: string
          location?: string | null
          manual_review_required?: boolean | null
          optimized_cv_url?: string | null
          platform?: string | null
          priority?: string | null
          processed_at?: string | null
          rejection_reason?: string | null
          requirements?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          salary_range?: string | null
          search_config_id?: string | null
          snapshot_at?: string | null
          snapshot_html?: string | null
          status?: string | null
          user_id: string
          user_profile_id: string
        }
        Update: {
          company_name?: string | null
          company_slug?: string | null
          cover_letter?: string | null
          cover_letter_quality_score?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          job_title?: string | null
          job_url?: string
          location?: string | null
          manual_review_required?: boolean | null
          optimized_cv_url?: string | null
          platform?: string | null
          priority?: string | null
          processed_at?: string | null
          rejection_reason?: string | null
          requirements?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          salary_range?: string | null
          search_config_id?: string | null
          snapshot_at?: string | null
          snapshot_html?: string | null
          status?: string | null
          user_id?: string
          user_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_queue_search_config_id_fkey"
            columns: ["search_config_id"]
            isOneToOne: false
            referencedRelation: "auto_search_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_queue_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_version: {
        Row: {
          applied_at: string | null
          version: string
        }
        Insert: {
          applied_at?: string | null
          version: string
        }
        Update: {
          applied_at?: string | null
          version?: string
        }
        Relationships: []
      }
      search_trigger_queue: {
        Row: {
          config_id: string | null
          created_at: string | null
          error_message: string | null
          id: string
          processed_at: string | null
          scheduled_for: string | null
          status: string | null
        }
        Insert: {
          config_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          processed_at?: string | null
          scheduled_for?: string | null
          status?: string | null
        }
        Update: {
          config_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          processed_at?: string | null
          scheduled_for?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "search_trigger_queue_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "auto_search_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string | null
          encryption_key_version: number | null
          id: string
          onboarding_completed: boolean | null
          pii_encrypted: string
          preferred_cv_template: string | null
          subscription_tier: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          encryption_key_version?: number | null
          id: string
          onboarding_completed?: boolean | null
          pii_encrypted: string
          preferred_cv_template?: string | null
          subscription_tier?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          encryption_key_version?: number | null
          id?: string
          onboarding_completed?: boolean | null
          pii_encrypted?: string
          preferred_cv_template?: string | null
          subscription_tier?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_research: { Args: never; Returns: undefined }
      get_weekly_application_count: {
        Args: { p_user_id: string }
        Returns: number
      }
      reset_daily_counts: { Args: never; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      slugify: { Args: { text: string }; Returns: string }
      update_selector_trust: {
        Args: { selector_id: string; success: boolean }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
