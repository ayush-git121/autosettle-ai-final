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
      audit_entries: {
        Row: {
          actor: string
          claim_id: string | null
          confidence: number | null
          created_at: string
          id: number
          input_summary: string | null
          internal: boolean
          output_summary: string | null
          rule: string | null
          step: string
        }
        Insert: {
          actor: string
          claim_id?: string | null
          confidence?: number | null
          created_at?: string
          id?: number
          input_summary?: string | null
          internal?: boolean
          output_summary?: string | null
          rule?: string | null
          step: string
        }
        Update: {
          actor?: string
          claim_id?: string | null
          confidence?: number | null
          created_at?: string
          id?: number
          input_summary?: string | null
          internal?: boolean
          output_summary?: string | null
          rule?: string | null
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_entries_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          assessment: Json | null
          created_at: string
          current_offer: number | null
          escalation_reasons: Json
          estimate: Json | null
          id: string
          incident_date: string
          limits: Json | null
          manipulation_attempts: number
          model_calls: number
          policy_number: string | null
          priority: string
          reference: string
          round: number
          settlement_amount: number | null
          status: string
          updated_at: string
        }
        Insert: {
          assessment?: Json | null
          created_at?: string
          current_offer?: number | null
          escalation_reasons?: Json
          estimate?: Json | null
          id?: string
          incident_date: string
          limits?: Json | null
          manipulation_attempts?: number
          model_calls?: number
          policy_number?: string | null
          priority?: string
          reference?: string
          round?: number
          settlement_amount?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          assessment?: Json | null
          created_at?: string
          current_offer?: number | null
          escalation_reasons?: Json
          estimate?: Json | null
          id?: string
          incident_date?: string
          limits?: Json | null
          manipulation_attempts?: number
          model_calls?: number
          policy_number?: string | null
          priority?: string
          reference?: string
          round?: number
          settlement_amount?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      media: {
        Row: {
          claim_id: string
          created_at: string
          detection: Json | null
          exif: Json | null
          id: string
          kind: string
          phash: string | null
          quality: Json | null
          source: string | null
          storage_path: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          detection?: Json | null
          exif?: Json | null
          id?: string
          kind?: string
          phash?: string | null
          quality?: Json | null
          source?: string | null
          storage_path: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          detection?: Json | null
          exif?: Json | null
          id?: string
          kind?: string
          phash?: string | null
          quality?: Json | null
          source?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          action: string | null
          amount: number | null
          claim_id: string
          content: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          action?: string | null
          amount?: number | null
          claim_id: string
          content: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          action?: string | null
          amount?: number | null
          claim_id?: string
          content?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      policies: {
        Row: {
          claims_this_year: number
          cover_type: string
          end_date: string
          idv: number
          make: string
          mobile: string
          model: string
          own_damage: boolean
          policy_number: string
          registration: string
          start_date: string
          year: number
          zero_dep: boolean
        }
        Insert: {
          claims_this_year?: number
          cover_type: string
          end_date: string
          idv?: number
          make: string
          mobile: string
          model: string
          own_damage?: boolean
          policy_number: string
          registration: string
          start_date: string
          year: number
          zero_dep?: boolean
        }
        Update: {
          claims_this_year?: number
          cover_type?: string
          end_date?: string
          idv?: number
          make?: string
          mobile?: string
          model?: string
          own_damage?: boolean
          policy_number?: string
          registration?: string
          start_date?: string
          year?: number
          zero_dep?: boolean
        }
        Relationships: []
      }
      repair_costs: {
        Row: {
          action: string
          id: number
          labour_cost: number
          material: string
          paint_cost: number
          part: string
          parts_cost: number
          segment: string
        }
        Insert: {
          action: string
          id?: number
          labour_cost: number
          material?: string
          paint_cost: number
          part: string
          parts_cost: number
          segment: string
        }
        Update: {
          action?: string
          id?: number
          labour_cost?: number
          material?: string
          paint_cost?: number
          part?: string
          parts_cost?: number
          segment?: string
        }
        Relationships: []
      }
      vehicle_segments: {
        Row: {
          make: string
          model: string
          segment: string
        }
        Insert: {
          make: string
          model: string
          segment: string
        }
        Update: {
          make?: string
          model?: string
          segment?: string
        }
        Relationships: []
      }
      verify_attempts: {
        Row: {
          failures: number
          key: string
          updated_at: string
        }
        Insert: {
          failures?: number
          key: string
          updated_at?: string
        }
        Update: {
          failures?: number
          key?: string
          updated_at?: string
        }
        Relationships: []
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
    Enums: {},
  },
} as const
