// ============================================================================
// DANUBRA Hub — typy zo Supabase
// ============================================================================
// Generované z projektu eidkljfaeqvvegiponwl, prefiltrované len na `danubra_*`
// tabuľky, pohľady a funkcie. Archivované adlify tabuľky sú vynechané, aby
// sa v súbore dalo čítať.
//
// Nepíš do tohto súboru ručne. Po zmene schémy ho vygeneruj znova:
//   node danubra/tests/typegen-check.js     (overí, že súbor sedí so schémou)
//
// Používa sa cez JSDoc, bez build kroku:
//   /** @type {import('../types/supabase').Tables<'danubra_workers'>} */
// ============================================================================

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
      danubra_accommodations: {
        Row: {
          access_door_code: string | null
          access_key_location: string | null
          address: string | null
          amenities: string[] | null
          beds: number | null
          checkin_info: string | null
          checkout_info: string | null
          city: string
          country: string | null
          created_at: string
          created_by: string | null
          deposit_amount: number | null
          deposit_holder: string | null
          floor: string | null
          gate_code: string | null
          highway_distance_km: number | null
          house_rules: string | null
          id: string
          invoice_payment: boolean | null
          last_contact_at: string | null
          lat: number | null
          lng: number | null
          max_persons: number | null
          min_nights: number | null
          name: string
          notes: string | null
          owner_email: string | null
          owner_language: string | null
          owner_name: string | null
          owner_phone: string | null
          owner_whatsapp: boolean | null
          postal_code: string | null
          price_month: number | null
          price_per_bed_night: number | null
          price_week: number | null
          room_number: string | null
          rooms: number | null
          source: string | null
          type: string | null
          updated_at: string
          van_parking: boolean | null
          vat_regime: string | null
          verification_status: string | null
          wifi_password: string | null
          wifi_ssid: string | null
        }
        Insert: {
          access_door_code?: string | null
          access_key_location?: string | null
          address?: string | null
          amenities?: string[] | null
          beds?: number | null
          checkin_info?: string | null
          checkout_info?: string | null
          city: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          deposit_amount?: number | null
          deposit_holder?: string | null
          floor?: string | null
          gate_code?: string | null
          highway_distance_km?: number | null
          house_rules?: string | null
          id?: string
          invoice_payment?: boolean | null
          last_contact_at?: string | null
          lat?: number | null
          lng?: number | null
          max_persons?: number | null
          min_nights?: number | null
          name: string
          notes?: string | null
          owner_email?: string | null
          owner_language?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          owner_whatsapp?: boolean | null
          postal_code?: string | null
          price_month?: number | null
          price_per_bed_night?: number | null
          price_week?: number | null
          room_number?: string | null
          rooms?: number | null
          source?: string | null
          type?: string | null
          updated_at?: string
          van_parking?: boolean | null
          vat_regime?: string | null
          verification_status?: string | null
          wifi_password?: string | null
          wifi_ssid?: string | null
        }
        Update: {
          access_door_code?: string | null
          access_key_location?: string | null
          address?: string | null
          amenities?: string[] | null
          beds?: number | null
          checkin_info?: string | null
          checkout_info?: string | null
          city?: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          deposit_amount?: number | null
          deposit_holder?: string | null
          floor?: string | null
          gate_code?: string | null
          highway_distance_km?: number | null
          house_rules?: string | null
          id?: string
          invoice_payment?: boolean | null
          last_contact_at?: string | null
          lat?: number | null
          lng?: number | null
          max_persons?: number | null
          min_nights?: number | null
          name?: string
          notes?: string | null
          owner_email?: string | null
          owner_language?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          owner_whatsapp?: boolean | null
          postal_code?: string | null
          price_month?: number | null
          price_per_bed_night?: number | null
          price_week?: number | null
          room_number?: string | null
          rooms?: number | null
          source?: string | null
          type?: string | null
          updated_at?: string
          van_parking?: boolean | null
          vat_regime?: string | null
          verification_status?: string | null
          wifi_password?: string | null
          wifi_ssid?: string | null
        }
        Relationships: []
      }
      danubra_activities: {
        Row: {
          body: string | null
          channel_meta: Json | null
          created_at: string
          created_by: string | null
          direction: string | null
          done: boolean | null
          entity_id: string | null
          entity_type: string | null
          follow_up_at: string | null
          id: string
          recording_url: string | null
          source: string | null
          transcript: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          channel_meta?: Json | null
          created_at?: string
          created_by?: string | null
          direction?: string | null
          done?: boolean | null
          entity_id?: string | null
          entity_type?: string | null
          follow_up_at?: string | null
          id?: string
          recording_url?: string | null
          source?: string | null
          transcript?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          channel_meta?: Json | null
          created_at?: string
          created_by?: string | null
          direction?: string | null
          done?: boolean | null
          entity_id?: string | null
          entity_type?: string | null
          follow_up_at?: string | null
          id?: string
          recording_url?: string | null
          source?: string | null
          transcript?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      danubra_assignments: {
        Row: {
          accommodation_monthly: number | null
          accommodation_order_id: string | null
          charge_rate: number | null
          created_at: string
          created_by: string | null
          date_from: string
          date_to: string | null
          gross_monthly: number | null
          id: string
          notes: string | null
          per_diem_daily: number | null
          role: string | null
          status: string | null
          subcontract_id: string | null
          transport_monthly: number | null
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          accommodation_monthly?: number | null
          accommodation_order_id?: string | null
          charge_rate?: number | null
          created_at?: string
          created_by?: string | null
          date_from: string
          date_to?: string | null
          gross_monthly?: number | null
          id?: string
          notes?: string | null
          per_diem_daily?: number | null
          role?: string | null
          status?: string | null
          subcontract_id?: string | null
          transport_monthly?: number | null
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          accommodation_monthly?: number | null
          accommodation_order_id?: string | null
          charge_rate?: number | null
          created_at?: string
          created_by?: string | null
          date_from?: string
          date_to?: string | null
          gross_monthly?: number | null
          id?: string
          notes?: string | null
          per_diem_daily?: number | null
          role?: string | null
          status?: string | null
          subcontract_id?: string | null
          transport_monthly?: number | null
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "danubra_assignments_accommodation_order_id_fkey"
            columns: ["accommodation_order_id"]
            isOneToOne: false
            referencedRelation: "danubra_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danubra_assignments_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "danubra_subcontracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danubra_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "danubra_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_call_chips: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          hint: string | null
          id: string
          label: string
          last_used_at: string | null
          polarity: string
          segment: string
          source: string
          suggested_from: string | null
          trade_key: string | null
          updated_at: string
          use_count: number
          weight: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          hint?: string | null
          id?: string
          label: string
          last_used_at?: string | null
          polarity?: string
          segment: string
          source?: string
          suggested_from?: string | null
          trade_key?: string | null
          updated_at?: string
          use_count?: number
          weight?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          hint?: string | null
          id?: string
          label?: string
          last_used_at?: string | null
          polarity?: string
          segment?: string
          source?: string
          suggested_from?: string | null
          trade_key?: string | null
          updated_at?: string
          use_count?: number
          weight?: number
        }
        Relationships: []
      }
      danubra_call_recordings: {
        Row: {
          audio_bytes: number | null
          audio_mime: string | null
          audio_path: string | null
          audio_url: string | null
          consent_confirmed: boolean
          consent_id: string | null
          created_at: string
          created_by: string | null
          delete_after: string | null
          deleted_at: string | null
          direction: string | null
          duration_seconds: number | null
          error: string | null
          extraction: Json | null
          id: string
          language: string | null
          processed_at: string | null
          recorded_at: string | null
          source: string | null
          status: string
          subject_id: string | null
          subject_name: string | null
          subject_phone: string | null
          subject_type: string | null
          summary: string | null
          transcript: string | null
          transcript_provider: string | null
          updated_at: string
        }
        Insert: {
          audio_bytes?: number | null
          audio_mime?: string | null
          audio_path?: string | null
          audio_url?: string | null
          consent_confirmed?: boolean
          consent_id?: string | null
          created_at?: string
          created_by?: string | null
          delete_after?: string | null
          deleted_at?: string | null
          direction?: string | null
          duration_seconds?: number | null
          error?: string | null
          extraction?: Json | null
          id?: string
          language?: string | null
          processed_at?: string | null
          recorded_at?: string | null
          source?: string | null
          status?: string
          subject_id?: string | null
          subject_name?: string | null
          subject_phone?: string | null
          subject_type?: string | null
          summary?: string | null
          transcript?: string | null
          transcript_provider?: string | null
          updated_at?: string
        }
        Update: {
          audio_bytes?: number | null
          audio_mime?: string | null
          audio_path?: string | null
          audio_url?: string | null
          consent_confirmed?: boolean
          consent_id?: string | null
          created_at?: string
          created_by?: string | null
          delete_after?: string | null
          deleted_at?: string | null
          direction?: string | null
          duration_seconds?: number | null
          error?: string | null
          extraction?: Json | null
          id?: string
          language?: string | null
          processed_at?: string | null
          recorded_at?: string | null
          source?: string | null
          status?: string
          subject_id?: string | null
          subject_name?: string | null
          subject_phone?: string | null
          subject_type?: string | null
          summary?: string | null
          transcript?: string | null
          transcript_provider?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "danubra_call_recordings_consent_id_fkey"
            columns: ["consent_id"]
            isOneToOne: false
            referencedRelation: "danubra_consents"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_candidate_checks: {
        Row: {
          candidate_id: string
          checked: boolean
          checked_at: string | null
          checked_by: string | null
          created_at: string
          id: string
          item_index: number
          step_key: string
          updated_at: string
        }
        Insert: {
          candidate_id: string
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          item_index: number
          step_key: string
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          id?: string
          item_index?: number
          step_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "danubra_candidate_checks_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "danubra_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_candidate_chips: {
        Row: {
          candidate_id: string
          checked_at: string
          checked_by: string | null
          chip_id: string
          id: string
          label: string | null
          polarity: string | null
          segment: string | null
          weight: number | null
        }
        Insert: {
          candidate_id: string
          checked_at?: string
          checked_by?: string | null
          chip_id: string
          id?: string
          label?: string | null
          polarity?: string | null
          segment?: string | null
          weight?: number | null
        }
        Update: {
          candidate_id?: string
          checked_at?: string
          checked_by?: string | null
          chip_id?: string
          id?: string
          label?: string | null
          polarity?: string | null
          segment?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "danubra_candidate_chips_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "danubra_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danubra_candidate_chips_chip_id_fkey"
            columns: ["chip_id"]
            isOneToOne: false
            referencedRelation: "danubra_call_chips"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_candidate_notes: {
        Row: {
          author_name: string | null
          body: string
          candidate_id: string
          created_at: string
          created_by: string | null
          id: string
          step_key: string
        }
        Insert: {
          author_name?: string | null
          body: string
          candidate_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          step_key: string
        }
        Update: {
          author_name?: string | null
          body?: string
          candidate_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          step_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "danubra_candidate_notes_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "danubra_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_candidates: {
        Row: {
          available_from: string | null
          city: string | null
          converted_at: string | null
          converted_worker_id: string | null
          country: string | null
          created_at: string
          created_by: string | null
          crew_size: number | null
          driving_licence: boolean | null
          email: string | null
          expected_rate: number | null
          expected_start: string | null
          first_contact_at: string | null
          full_name: string
          german_level: string | null
          german_speaker: boolean | null
          has_car: boolean | null
          id: string
          language: string | null
          last_foreman: string | null
          last_site: string | null
          legal_form: string | null
          notes: string | null
          outcome: string | null
          outcome_reason: string | null
          own_tools: boolean | null
          phone: string | null
          plan_id: string | null
          profession: string | null
          received_at: string | null
          reference_checked: boolean | null
          referred_by: string | null
          reject_reason: string | null
          screening_done_at: string | null
          screening_score: number | null
          screening_verdict: string | null
          skill_level: string | null
          source: string | null
          source_detail: string | null
          status: string
          subcontract_id: string | null
          trade_license_status: string | null
          type: string
          updated_at: string
          whatsapp: boolean | null
        }
        Insert: {
          available_from?: string | null
          city?: string | null
          converted_at?: string | null
          converted_worker_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          crew_size?: number | null
          driving_licence?: boolean | null
          email?: string | null
          expected_rate?: number | null
          expected_start?: string | null
          first_contact_at?: string | null
          full_name: string
          german_level?: string | null
          german_speaker?: boolean | null
          has_car?: boolean | null
          id?: string
          language?: string | null
          last_foreman?: string | null
          last_site?: string | null
          legal_form?: string | null
          notes?: string | null
          outcome?: string | null
          outcome_reason?: string | null
          own_tools?: boolean | null
          phone?: string | null
          plan_id?: string | null
          profession?: string | null
          received_at?: string | null
          reference_checked?: boolean | null
          referred_by?: string | null
          reject_reason?: string | null
          screening_done_at?: string | null
          screening_score?: number | null
          screening_verdict?: string | null
          skill_level?: string | null
          source?: string | null
          source_detail?: string | null
          status?: string
          subcontract_id?: string | null
          trade_license_status?: string | null
          type?: string
          updated_at?: string
          whatsapp?: boolean | null
        }
        Update: {
          available_from?: string | null
          city?: string | null
          converted_at?: string | null
          converted_worker_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          crew_size?: number | null
          driving_licence?: boolean | null
          email?: string | null
          expected_rate?: number | null
          expected_start?: string | null
          first_contact_at?: string | null
          full_name?: string
          german_level?: string | null
          german_speaker?: boolean | null
          has_car?: boolean | null
          id?: string
          language?: string | null
          last_foreman?: string | null
          last_site?: string | null
          legal_form?: string | null
          notes?: string | null
          outcome?: string | null
          outcome_reason?: string | null
          own_tools?: boolean | null
          phone?: string | null
          plan_id?: string | null
          profession?: string | null
          received_at?: string | null
          reference_checked?: boolean | null
          referred_by?: string | null
          reject_reason?: string | null
          screening_done_at?: string | null
          screening_score?: number | null
          screening_verdict?: string | null
          skill_level?: string | null
          source?: string | null
          source_detail?: string | null
          status?: string
          subcontract_id?: string | null
          trade_license_status?: string | null
          type?: string
          updated_at?: string
          whatsapp?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "danubra_candidates_converted_worker_id_fkey"
            columns: ["converted_worker_id"]
            isOneToOne: false
            referencedRelation: "danubra_workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danubra_candidates_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "danubra_recruitment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danubra_candidates_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "danubra_workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danubra_candidates_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "danubra_subcontracts"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_checklist_items: {
        Row: {
          assignment_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          done: boolean | null
          done_at: string | null
          done_by: string | null
          id: string
          note: string | null
          required: boolean | null
          step_order: number
          title: string
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          done?: boolean | null
          done_at?: string | null
          done_by?: string | null
          id?: string
          note?: string | null
          required?: boolean | null
          step_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          done?: boolean | null
          done_at?: string | null
          done_by?: string | null
          id?: string
          note?: string | null
          required?: boolean | null
          step_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "danubra_checklist_items_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "danubra_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_clients: {
        Row: {
          company_id: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          language: string | null
          name: string
          notes: string | null
          phone: string | null
          retainer: boolean | null
          retainer_from: string | null
          retainer_rate: number | null
          retainer_to: string | null
          source: string | null
          type: string | null
          updated_at: string
          vat_id: string | null
          whatsapp: boolean | null
        }
        Insert: {
          company_id?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          language?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          retainer?: boolean | null
          retainer_from?: string | null
          retainer_rate?: number | null
          retainer_to?: string | null
          source?: string | null
          type?: string | null
          updated_at?: string
          vat_id?: string | null
          whatsapp?: boolean | null
        }
        Update: {
          company_id?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          language?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          retainer?: boolean | null
          retainer_from?: string | null
          retainer_rate?: number | null
          retainer_to?: string | null
          source?: string | null
          type?: string | null
          updated_at?: string
          vat_id?: string | null
          whatsapp?: boolean | null
        }
        Relationships: []
      }
      danubra_compliance: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string | null
          file_url: string | null
          id: string
          kind: string
          notes: string | null
          reference: string | null
          responsible: string | null
          scope: string
          status: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          file_url?: string | null
          id?: string
          kind: string
          notes?: string | null
          reference?: string | null
          responsible?: string | null
          scope: string
          status?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          file_url?: string | null
          id?: string
          kind?: string
          notes?: string | null
          reference?: string | null
          responsible?: string | null
          scope?: string
          status?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      danubra_consents: {
        Row: {
          created_at: string
          created_by: string | null
          evidence_note: string | null
          evidence_url: string | null
          granted: boolean
          granted_at: string | null
          id: string
          kind: string
          language: string | null
          method: string | null
          retention_until: string | null
          revoke_reason: string | null
          revoked_at: string | null
          subject_id: string | null
          subject_name: string | null
          subject_phone: string | null
          subject_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          evidence_note?: string | null
          evidence_url?: string | null
          granted?: boolean
          granted_at?: string | null
          id?: string
          kind?: string
          language?: string | null
          method?: string | null
          retention_until?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          subject_id?: string | null
          subject_name?: string | null
          subject_phone?: string | null
          subject_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          evidence_note?: string | null
          evidence_url?: string | null
          granted?: boolean
          granted_at?: string | null
          id?: string
          kind?: string
          language?: string | null
          method?: string | null
          retention_until?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          subject_id?: string | null
          subject_name?: string | null
          subject_phone?: string | null
          subject_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      danubra_documents: {
        Row: {
          created_at: string
          created_by: string | null
          file_url: string | null
          id: string
          language: string | null
          order_id: string | null
          payload: Json | null
          sent_at: string | null
          sent_channel: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_url?: string | null
          id?: string
          language?: string | null
          order_id?: string | null
          payload?: Json | null
          sent_at?: string | null
          sent_channel?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_url?: string | null
          id?: string
          language?: string | null
          order_id?: string | null
          payload?: Json | null
          sent_at?: string | null
          sent_channel?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "danubra_documents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "danubra_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_enums: {
        Row: {
          active: boolean
          created_at: string
          hint: string | null
          id: string
          key: string
          kind: string
          label_de: string | null
          label_sk: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          hint?: string | null
          id?: string
          key: string
          kind: string
          label_de?: string | null
          label_sk: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          hint?: string | null
          id?: string
          key?: string
          kind?: string
          label_de?: string | null
          label_sk?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      danubra_inquiries: {
        Row: {
          budget_per_bed: number | null
          channel: string | null
          client_id: string | null
          country: string | null
          created_at: string
          created_by: string | null
          date_from: string | null
          date_to: string | null
          first_response_at: string | null
          id: string
          lost_reason: string | null
          notes: string | null
          persons: number | null
          postal_code: string | null
          received_at: string | null
          requirements: string[] | null
          status: string | null
          target_city: string | null
          updated_at: string
          urgent: boolean | null
        }
        Insert: {
          budget_per_bed?: number | null
          channel?: string | null
          client_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          date_from?: string | null
          date_to?: string | null
          first_response_at?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          persons?: number | null
          postal_code?: string | null
          received_at?: string | null
          requirements?: string[] | null
          status?: string | null
          target_city?: string | null
          updated_at?: string
          urgent?: boolean | null
        }
        Update: {
          budget_per_bed?: number | null
          channel?: string | null
          client_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          date_from?: string | null
          date_to?: string | null
          first_response_at?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          persons?: number | null
          postal_code?: string | null
          received_at?: string | null
          requirements?: string[] | null
          status?: string | null
          target_city?: string | null
          updated_at?: string
          urgent?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "danubra_inquiries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "danubra_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_invoice_items: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          invoice_id: string | null
          quantity: number | null
          total: number | null
          unit: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          invoice_id?: string | null
          quantity?: number | null
          total?: number | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          invoice_id?: string | null
          quantity?: number | null
          total?: number | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "danubra_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "danubra_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_invoices: {
        Row: {
          billing_period_from: string | null
          billing_period_to: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          delivery_date: string | null
          due_date: string | null
          id: string
          invoice_number: string | null
          issue_date: string | null
          order_id: string | null
          paid_at: string | null
          pdf_url: string | null
          status: string | null
          total: number | null
          type: string | null
          updated_at: string
          vat_regime: string | null
        }
        Insert: {
          billing_period_from?: string | null
          billing_period_to?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          delivery_date?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          issue_date?: string | null
          order_id?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          status?: string | null
          total?: number | null
          type?: string | null
          updated_at?: string
          vat_regime?: string | null
        }
        Update: {
          billing_period_from?: string | null
          billing_period_to?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          delivery_date?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          issue_date?: string | null
          order_id?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          status?: string | null
          total?: number | null
          type?: string | null
          updated_at?: string
          vat_regime?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "danubra_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "danubra_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danubra_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "danubra_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_marketing_expenses: {
        Row: {
          amount: number | null
          channel: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          spent_at: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          channel?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          spent_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          channel?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          spent_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      danubra_marketing_listings: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          language: string | null
          listing_type: string | null
          performance_note: string | null
          platform: string | null
          published_at: string | null
          renew_at: string | null
          status: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          language?: string | null
          listing_type?: string | null
          performance_note?: string | null
          platform?: string | null
          published_at?: string | null
          renew_at?: string | null
          status?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          language?: string | null
          listing_type?: string | null
          performance_note?: string | null
          platform?: string | null
          published_at?: string | null
          renew_at?: string | null
          status?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      danubra_message_templates: {
        Row: {
          body: string | null
          channel: string | null
          created_at: string
          created_by: string | null
          id: string
          key: string | null
          language: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          channel?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          key?: string | null
          language?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          channel?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          key?: string | null
          language?: string | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      danubra_offer_variants: {
        Row: {
          accommodation_id: string | null
          created_at: string
          created_by: string | null
          id: string
          nights: number | null
          offer_id: string | null
          price_per_bed_night: number | null
          sort_order: number | null
          total_accommodation: number | null
          updated_at: string
        }
        Insert: {
          accommodation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nights?: number | null
          offer_id?: string | null
          price_per_bed_night?: number | null
          sort_order?: number | null
          total_accommodation?: number | null
          updated_at?: string
        }
        Update: {
          accommodation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nights?: number | null
          offer_id?: string | null
          price_per_bed_night?: number | null
          sort_order?: number | null
          total_accommodation?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "danubra_offer_variants_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "danubra_accommodations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danubra_offer_variants_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "danubra_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_offers: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          id: string
          inquiry_id: string | null
          language: string | null
          ongoing_service_enabled: boolean | null
          ongoing_service_rate: number | null
          sent_at: string | null
          sent_channel: string | null
          service_fee: number | null
          status: string | null
          updated_at: string
          urgent_surcharge: boolean | null
          valid_until: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inquiry_id?: string | null
          language?: string | null
          ongoing_service_enabled?: boolean | null
          ongoing_service_rate?: number | null
          sent_at?: string | null
          sent_channel?: string | null
          service_fee?: number | null
          status?: string | null
          updated_at?: string
          urgent_surcharge?: boolean | null
          valid_until?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inquiry_id?: string | null
          language?: string | null
          ongoing_service_enabled?: boolean | null
          ongoing_service_rate?: number | null
          sent_at?: string | null
          sent_channel?: string | null
          service_fee?: number | null
          status?: string | null
          updated_at?: string
          urgent_surcharge?: boolean | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "danubra_offers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "danubra_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danubra_offers_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "danubra_inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_order_extensions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          new_date_to: string | null
          order_id: string | null
          previous_date_to: string | null
          reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          new_date_to?: string | null
          order_id?: string | null
          previous_date_to?: string | null
          reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          new_date_to?: string | null
          order_id?: string | null
          previous_date_to?: string | null
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "danubra_order_extensions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "danubra_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_order_persons: {
        Row: {
          created_at: string
          created_by: string | null
          date_from: string | null
          date_to: string | null
          full_name: string | null
          id: string
          order_id: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_from?: string | null
          date_to?: string | null
          full_name?: string | null
          id?: string
          order_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_from?: string | null
          date_to?: string | null
          full_name?: string | null
          id?: string
          order_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "danubra_order_persons_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "danubra_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_order_requests: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          order_id: string | null
          priority: string | null
          reported_by: string | null
          resolution: string | null
          resolved_at: string | null
          status: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          order_id?: string | null
          priority?: string | null
          reported_by?: string | null
          resolution?: string | null
          resolved_at?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          order_id?: string | null
          priority?: string | null
          reported_by?: string | null
          resolution?: string | null
          resolved_at?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "danubra_order_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "danubra_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_order_service_periods: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          order_id: string | null
          pause_reason: string | null
          paused: boolean | null
          period_from: string
          period_to: string | null
          persons: number
          rate: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          order_id?: string | null
          pause_reason?: string | null
          paused?: boolean | null
          period_from: string
          period_to?: string | null
          persons: number
          rate: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          order_id?: string | null
          pause_reason?: string | null
          paused?: boolean | null
          period_from?: string
          period_to?: string | null
          persons?: number
          rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "danubra_order_service_periods_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "danubra_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_orders: {
        Row: {
          accepted_at: string | null
          accommodation_id: string | null
          cancellation_reason: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          date_from: string
          date_to: string
          fee_paid_at: string | null
          id: string
          inquiry_id: string | null
          nights: number | null
          notes: string | null
          offer_id: string | null
          ongoing_service_enabled: boolean | null
          ongoing_service_rate: number | null
          order_number: string | null
          owner_confirmed_at: string | null
          payment_method: string | null
          persons: number
          price_per_bed_night: number | null
          service_fee: number | null
          status: string
          terms_version: string | null
          total_accommodation: number | null
          updated_at: string
          urgent_surcharge: number | null
        }
        Insert: {
          accepted_at?: string | null
          accommodation_id?: string | null
          cancellation_reason?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          date_from: string
          date_to: string
          fee_paid_at?: string | null
          id?: string
          inquiry_id?: string | null
          nights?: number | null
          notes?: string | null
          offer_id?: string | null
          ongoing_service_enabled?: boolean | null
          ongoing_service_rate?: number | null
          order_number?: string | null
          owner_confirmed_at?: string | null
          payment_method?: string | null
          persons: number
          price_per_bed_night?: number | null
          service_fee?: number | null
          status?: string
          terms_version?: string | null
          total_accommodation?: number | null
          updated_at?: string
          urgent_surcharge?: number | null
        }
        Update: {
          accepted_at?: string | null
          accommodation_id?: string | null
          cancellation_reason?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          date_from?: string
          date_to?: string
          fee_paid_at?: string | null
          id?: string
          inquiry_id?: string | null
          nights?: number | null
          notes?: string | null
          offer_id?: string | null
          ongoing_service_enabled?: boolean | null
          ongoing_service_rate?: number | null
          order_number?: string | null
          owner_confirmed_at?: string | null
          payment_method?: string | null
          persons?: number
          price_per_bed_night?: number | null
          service_fee?: number | null
          status?: string
          terms_version?: string | null
          total_accommodation?: number | null
          updated_at?: string
          urgent_surcharge?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "danubra_orders_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "danubra_accommodations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danubra_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "danubra_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danubra_orders_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "danubra_inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danubra_orders_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "danubra_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_overrides: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          granted_at: string
          granted_by: string | null
          id: string
          reason: string
          revoked_at: string | null
          rule_key: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          reason: string
          revoked_at?: string | null
          rule_key: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          reason?: string
          revoked_at?: string | null
          rule_key?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      danubra_partners: {
        Row: {
          address: string | null
          city: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          created_by: string | null
          email: string | null
          factoring_eligible: boolean | null
          id: string
          is_construction: boolean | null
          language: string | null
          name: string
          notes: string | null
          payment_terms_days: number | null
          phone: string | null
          postal_code: string | null
          rating: string | null
          registration_no: string | null
          source: string | null
          updated_at: string
          ust_idnr: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          factoring_eligible?: boolean | null
          id?: string
          is_construction?: boolean | null
          language?: string | null
          name: string
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          postal_code?: string | null
          rating?: string | null
          registration_no?: string | null
          source?: string | null
          updated_at?: string
          ust_idnr?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          factoring_eligible?: boolean | null
          id?: string
          is_construction?: boolean | null
          language?: string | null
          name?: string
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          postal_code?: string | null
          rating?: string | null
          registration_no?: string | null
          source?: string | null
          updated_at?: string
          ust_idnr?: string | null
        }
        Relationships: []
      }
      danubra_promises: {
        Row: {
          confidence: number | null
          created_at: string
          created_by: string | null
          due_date: string | null
          fulfilled_at: string | null
          id: string
          kind: string
          note: string | null
          recording_id: string | null
          statement: string
          status: string
          subject_id: string | null
          subject_type: string | null
          updated_at: string
          value_date: string | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          fulfilled_at?: string | null
          id?: string
          kind: string
          note?: string | null
          recording_id?: string | null
          statement: string
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          updated_at?: string
          value_date?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          fulfilled_at?: string | null
          id?: string
          kind?: string
          note?: string | null
          recording_id?: string | null
          statement?: string
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          updated_at?: string
          value_date?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "danubra_promises_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "danubra_call_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_recruitment_plans: {
        Row: {
          accommodation_provided: boolean | null
          ad_text: string | null
          advance_possible: boolean | null
          budget: number | null
          channels: string[] | null
          city: string | null
          client_rate: number | null
          country: string | null
          created_at: string
          created_by: string | null
          deadline: string | null
          headcount: number
          id: string
          legal_form: string | null
          notes: string | null
          offer_rate: number | null
          skill_level: string | null
          start_date: string | null
          status: string
          step: number
          subcontract_id: string | null
          title: string
          trade_key: string | null
          transport_provided: boolean | null
          updated_at: string
        }
        Insert: {
          accommodation_provided?: boolean | null
          ad_text?: string | null
          advance_possible?: boolean | null
          budget?: number | null
          channels?: string[] | null
          city?: string | null
          client_rate?: number | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          headcount?: number
          id?: string
          legal_form?: string | null
          notes?: string | null
          offer_rate?: number | null
          skill_level?: string | null
          start_date?: string | null
          status?: string
          step?: number
          subcontract_id?: string | null
          title: string
          trade_key?: string | null
          transport_provided?: boolean | null
          updated_at?: string
        }
        Update: {
          accommodation_provided?: boolean | null
          ad_text?: string | null
          advance_possible?: boolean | null
          budget?: number | null
          channels?: string[] | null
          city?: string | null
          client_rate?: number | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          headcount?: number
          id?: string
          legal_form?: string | null
          notes?: string | null
          offer_rate?: number | null
          skill_level?: string | null
          start_date?: string | null
          status?: string
          step?: number
          subcontract_id?: string | null
          title?: string
          trade_key?: string | null
          transport_provided?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "danubra_recruitment_plans_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "danubra_subcontracts"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_screening_answers: {
        Row: {
          answer_text: string | null
          asked_at: string | null
          candidate_id: string | null
          created_at: string
          created_by: string | null
          flagged: boolean | null
          id: string
          note: string | null
          plan_id: string | null
          question_id: string | null
          rating: number | null
          updated_at: string
        }
        Insert: {
          answer_text?: string | null
          asked_at?: string | null
          candidate_id?: string | null
          created_at?: string
          created_by?: string | null
          flagged?: boolean | null
          id?: string
          note?: string | null
          plan_id?: string | null
          question_id?: string | null
          rating?: number | null
          updated_at?: string
        }
        Update: {
          answer_text?: string | null
          asked_at?: string | null
          candidate_id?: string | null
          created_at?: string
          created_by?: string | null
          flagged?: boolean | null
          id?: string
          note?: string | null
          plan_id?: string | null
          question_id?: string | null
          rating?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "danubra_screening_answers_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "danubra_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danubra_screening_answers_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "danubra_recruitment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danubra_screening_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "danubra_screening_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_screening_questions: {
        Row: {
          active: boolean | null
          code: string
          created_at: string
          good_answer: string | null
          id: string
          kind: string
          phase: string
          question_de: string | null
          question_sk: string
          red_flag_answer: string | null
          sort_order: number | null
          trade_key: string | null
          updated_at: string
          weight: number
        }
        Insert: {
          active?: boolean | null
          code: string
          created_at?: string
          good_answer?: string | null
          id?: string
          kind?: string
          phase?: string
          question_de?: string | null
          question_sk: string
          red_flag_answer?: string | null
          sort_order?: number | null
          trade_key?: string | null
          updated_at?: string
          weight?: number
        }
        Update: {
          active?: boolean | null
          code?: string
          created_at?: string
          good_answer?: string | null
          id?: string
          kind?: string
          phase?: string
          question_de?: string | null
          question_sk?: string
          red_flag_answer?: string | null
          sort_order?: number | null
          trade_key?: string | null
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      danubra_settings: {
        Row: {
          automations: Json | null
          created_at: string
          created_by: string | null
          id: string
          invoice_series: Json | null
          marketing: Json | null
          modules: Json | null
          order_series: Json | null
          pricing: Json | null
          recruiting: Json | null
          staffing: Json | null
          subcontract_series: Json | null
          supplier: Json | null
          updated_at: string
        }
        Insert: {
          automations?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_series?: Json | null
          marketing?: Json | null
          modules?: Json | null
          order_series?: Json | null
          pricing?: Json | null
          recruiting?: Json | null
          staffing?: Json | null
          subcontract_series?: Json | null
          supplier?: Json | null
          updated_at?: string
        }
        Update: {
          automations?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_series?: Json | null
          marketing?: Json | null
          modules?: Json | null
          order_series?: Json | null
          pricing?: Json | null
          recruiting?: Json | null
          staffing?: Json | null
          subcontract_series?: Json | null
          supplier?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      danubra_subcontract_accommodations: {
        Row: {
          accommodation_id: string | null
          address: string | null
          capacity: number | null
          city: string | null
          created_at: string
          created_by: string | null
          date_from: string | null
          date_to: string | null
          id: string
          maps_url: string | null
          name: string | null
          note: string | null
          occupied: number | null
          price_monthly: number | null
          subcontract_id: string | null
          updated_at: string
        }
        Insert: {
          accommodation_id?: string | null
          address?: string | null
          capacity?: number | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          date_from?: string | null
          date_to?: string | null
          id?: string
          maps_url?: string | null
          name?: string | null
          note?: string | null
          occupied?: number | null
          price_monthly?: number | null
          subcontract_id?: string | null
          updated_at?: string
        }
        Update: {
          accommodation_id?: string | null
          address?: string | null
          capacity?: number | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          date_from?: string | null
          date_to?: string | null
          id?: string
          maps_url?: string | null
          name?: string | null
          note?: string | null
          occupied?: number | null
          price_monthly?: number | null
          subcontract_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "danubra_subcontract_accommodations_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "danubra_accommodations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danubra_subcontract_accommodations_subcontract_id_fkey"
            columns: ["subcontract_id"]
            isOneToOne: false
            referencedRelation: "danubra_subcontracts"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_subcontracts: {
        Row: {
          billing_model: string | null
          charge_rate: number | null
          completed_at: string | null
          contract_number: string | null
          created_at: string
          created_by: string | null
          date_from: string | null
          date_to: string | null
          fixed_price: number | null
          freistellung_verified: boolean | null
          id: string
          notes: string | null
          partner_id: string | null
          scope: string | null
          site_address: string | null
          site_city: string | null
          site_name: string | null
          site_postal_code: string | null
          soka_relevant: boolean | null
          status: string
          title: string
          trade: string | null
          transport_note: string | null
          transport_provided: boolean | null
          unit_label: string | null
          updated_at: string
          won_at: string | null
          work_type: string
          zoll_reference: string | null
          zoll_reported_at: string | null
        }
        Insert: {
          billing_model?: string | null
          charge_rate?: number | null
          completed_at?: string | null
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          date_from?: string | null
          date_to?: string | null
          fixed_price?: number | null
          freistellung_verified?: boolean | null
          id?: string
          notes?: string | null
          partner_id?: string | null
          scope?: string | null
          site_address?: string | null
          site_city?: string | null
          site_name?: string | null
          site_postal_code?: string | null
          soka_relevant?: boolean | null
          status?: string
          title: string
          trade?: string | null
          transport_note?: string | null
          transport_provided?: boolean | null
          unit_label?: string | null
          updated_at?: string
          won_at?: string | null
          work_type?: string
          zoll_reference?: string | null
          zoll_reported_at?: string | null
        }
        Update: {
          billing_model?: string | null
          charge_rate?: number | null
          completed_at?: string | null
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          date_from?: string | null
          date_to?: string | null
          fixed_price?: number | null
          freistellung_verified?: boolean | null
          id?: string
          notes?: string | null
          partner_id?: string | null
          scope?: string | null
          site_address?: string | null
          site_city?: string | null
          site_name?: string | null
          site_postal_code?: string | null
          soka_relevant?: boolean | null
          status?: string
          title?: string
          trade?: string | null
          transport_note?: string | null
          transport_provided?: boolean | null
          unit_label?: string | null
          updated_at?: string
          won_at?: string | null
          work_type?: string
          zoll_reference?: string | null
          zoll_reported_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "danubra_subcontracts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "danubra_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_tasks: {
        Row: {
          assigned_name: string | null
          assigned_to: string | null
          created_at: string
          created_by: string | null
          description: string | null
          done_at: string | null
          due_date: string | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string | null
          id: string
          level: string | null
          postponed_to: string | null
          priority: string | null
          source: string | null
          source_field: string | null
          source_key: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_name?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          done_at?: string | null
          due_date?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          id?: string
          level?: string | null
          postponed_to?: string | null
          priority?: string | null
          source?: string | null
          source_field?: string | null
          source_key?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_name?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          done_at?: string | null
          due_date?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          id?: string
          level?: string | null
          postponed_to?: string | null
          priority?: string | null
          source?: string | null
          source_field?: string | null
          source_key?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      danubra_timesheets: {
        Row: {
          activity_type: string
          approved: boolean | null
          approved_at: string | null
          assignment_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          hours: number
          id: string
          invoiced_at: string | null
          updated_at: string
          work_date: string
          worker_id: string | null
        }
        Insert: {
          activity_type?: string
          approved?: boolean | null
          approved_at?: string | null
          assignment_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          hours: number
          id?: string
          invoiced_at?: string | null
          updated_at?: string
          work_date: string
          worker_id?: string | null
        }
        Update: {
          activity_type?: string
          approved?: boolean | null
          approved_at?: string | null
          assignment_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          hours?: number
          id?: string
          invoiced_at?: string | null
          updated_at?: string
          work_date?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "danubra_timesheets_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "danubra_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danubra_timesheets_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "danubra_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_trades: {
        Row: {
          active: boolean | null
          certificates: string[] | null
          created_at: string
          daily_output: string | null
          id: string
          key: string
          legal_note: string | null
          lohngruppe: string | null
          materials: string[] | null
          name_de: string | null
          name_sk: string
          pitch: string[] | null
          rate_client_max: number | null
          rate_client_min: number | null
          rate_worker_max: number | null
          rate_worker_min: number | null
          red_flags: string[] | null
          regulated: boolean | null
          sort_order: number | null
          summary: string | null
          tools: string[] | null
          updated_at: string
          work_scope: string[] | null
        }
        Insert: {
          active?: boolean | null
          certificates?: string[] | null
          created_at?: string
          daily_output?: string | null
          id?: string
          key: string
          legal_note?: string | null
          lohngruppe?: string | null
          materials?: string[] | null
          name_de?: string | null
          name_sk: string
          pitch?: string[] | null
          rate_client_max?: number | null
          rate_client_min?: number | null
          rate_worker_max?: number | null
          rate_worker_min?: number | null
          red_flags?: string[] | null
          regulated?: boolean | null
          sort_order?: number | null
          summary?: string | null
          tools?: string[] | null
          updated_at?: string
          work_scope?: string[] | null
        }
        Update: {
          active?: boolean | null
          certificates?: string[] | null
          created_at?: string
          daily_output?: string | null
          id?: string
          key?: string
          legal_note?: string | null
          lohngruppe?: string | null
          materials?: string[] | null
          name_de?: string | null
          name_sk?: string
          pitch?: string[] | null
          rate_client_max?: number | null
          rate_client_min?: number | null
          rate_worker_max?: number | null
          rate_worker_min?: number | null
          red_flags?: string[] | null
          regulated?: boolean | null
          sort_order?: number | null
          summary?: string | null
          tools?: string[] | null
          updated_at?: string
          work_scope?: string[] | null
        }
        Relationships: []
      }
      danubra_worker_documents: {
        Row: {
          created_at: string
          created_by: string | null
          file_url: string | null
          id: string
          kind: string
          notes: string | null
          reference: string | null
          status: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          worker_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_url?: string | null
          id?: string
          kind: string
          notes?: string | null
          reference?: string | null
          status?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          worker_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_url?: string | null
          id?: string
          kind?: string
          notes?: string | null
          reference?: string | null
          status?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "danubra_worker_documents_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "danubra_workers"
            referencedColumns: ["id"]
          },
        ]
      }
      danubra_workers: {
        Row: {
          address: string | null
          available_from: string | null
          bank_iban: string | null
          birth_date: string | null
          candidate_id: string | null
          city: string | null
          cooperating_since: string | null
          country: string | null
          created_at: string
          created_by: string | null
          driving_licence: boolean | null
          email: string | null
          employment_type: string | null
          full_name: string
          german_level: string | null
          gross_monthly: number | null
          hourly_cost: number | null
          hourly_gross: number | null
          id: string
          language: string | null
          languages: string[] | null
          legal_form: string | null
          notes: string | null
          own_tools: boolean | null
          per_diem_daily: number | null
          phone: string | null
          profession: string | null
          referred_by: string | null
          regulated_trade: boolean | null
          skill_level: string | null
          skills: string[] | null
          source: string | null
          status: string | null
          updated_at: string
          whatsapp: boolean | null
        }
        Insert: {
          address?: string | null
          available_from?: string | null
          bank_iban?: string | null
          birth_date?: string | null
          candidate_id?: string | null
          city?: string | null
          cooperating_since?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          driving_licence?: boolean | null
          email?: string | null
          employment_type?: string | null
          full_name: string
          german_level?: string | null
          gross_monthly?: number | null
          hourly_cost?: number | null
          hourly_gross?: number | null
          id?: string
          language?: string | null
          languages?: string[] | null
          legal_form?: string | null
          notes?: string | null
          own_tools?: boolean | null
          per_diem_daily?: number | null
          phone?: string | null
          profession?: string | null
          referred_by?: string | null
          regulated_trade?: boolean | null
          skill_level?: string | null
          skills?: string[] | null
          source?: string | null
          status?: string | null
          updated_at?: string
          whatsapp?: boolean | null
        }
        Update: {
          address?: string | null
          available_from?: string | null
          bank_iban?: string | null
          birth_date?: string | null
          candidate_id?: string | null
          city?: string | null
          cooperating_since?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          driving_licence?: boolean | null
          email?: string | null
          employment_type?: string | null
          full_name?: string
          german_level?: string | null
          gross_monthly?: number | null
          hourly_cost?: number | null
          hourly_gross?: number | null
          id?: string
          language?: string | null
          languages?: string[] | null
          legal_form?: string | null
          notes?: string | null
          own_tools?: boolean | null
          per_diem_daily?: number | null
          phone?: string | null
          profession?: string | null
          referred_by?: string | null
          regulated_trade?: boolean | null
          skill_level?: string | null
          skills?: string[] | null
          source?: string | null
          status?: string | null
          updated_at?: string
          whatsapp?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "danubra_workers_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "danubra_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "danubra_workers_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "danubra_workers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {}
    Functions: {
      danubra_chip_used: { Args: { p_chip: string }; Returns: undefined }
      danubra_next_number: { Args: { p_kind: string }; Returns: string }
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
