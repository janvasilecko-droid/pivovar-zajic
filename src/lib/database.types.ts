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
      akce: {
        Row: {
          beer_id: string | null
          beer_name: string | null
          created_at: string | null
          entry_date: string
          equipment: Json | null
          id: string
          name: string
          note: string | null
          package_id: string | null
          package_label: string | null
          quantity_returned: number | null
          quantity_taken: number | null
          rating: number | null
          ready: boolean
          recommend: string | null
          revenue: number | null
          status: string
          updated_at: string
          who: string | null
        }
        Insert: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          entry_date?: string
          equipment?: Json | null
          id?: string
          name: string
          note?: string | null
          package_id?: string | null
          package_label?: string | null
          quantity_returned?: number | null
          quantity_taken?: number | null
          rating?: number | null
          ready?: boolean
          recommend?: string | null
          revenue?: number | null
          status?: string
          updated_at?: string
          who?: string | null
        }
        Update: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          entry_date?: string
          equipment?: Json | null
          id?: string
          name?: string
          note?: string | null
          package_id?: string | null
          package_label?: string | null
          quantity_returned?: number | null
          quantity_taken?: number | null
          rating?: number | null
          ready?: boolean
          recommend?: string | null
          revenue?: number | null
          status?: string
          updated_at?: string
          who?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "akce_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "akce_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      akce_items: {
        Row: {
          akce_id: string
          beer_id: string | null
          beer_name: string | null
          created_at: string | null
          id: string
          package_id: string | null
          package_label: string | null
          quantity_returned: number
          quantity_taken: number
        }
        Insert: {
          akce_id: string
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          id?: string
          package_id?: string | null
          package_label?: string | null
          quantity_returned?: number
          quantity_taken?: number
        }
        Update: {
          akce_id?: string
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          id?: string
          package_id?: string | null
          package_label?: string | null
          quantity_returned?: number
          quantity_taken?: number
        }
        Relationships: [
          {
            foreignKeyName: "akce_items_akce_id_fkey"
            columns: ["akce_id"]
            isOneToOne: false
            referencedRelation: "akce"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "akce_items_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "akce_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      allowed_emails: {
        Row: {
          created_at: string
          email: string
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          status?: string
        }
        Relationships: []
      }
      app_errors: {
        Row: {
          app_version: string | null
          created_at: string
          druh: string
          id: string
          obrazovka: string | null
          pocet: number
          stack: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          vyrizeno_at: string | null
          zprava: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          druh?: string
          id?: string
          obrazovka?: string | null
          pocet?: number
          stack?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          vyrizeno_at?: string | null
          zprava: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          druh?: string
          id?: string
          obrazovka?: string | null
          pocet?: number
          stack?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          vyrizeno_at?: string | null
          zprava?: string
        }
        Relationships: []
      }
      app_secrets: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          changed_at: string | null
          changed_by: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      beers: {
        Row: {
          beer_color: string | null
          color: string | null
          created_at: string | null
          degree: string | null
          id: string
          is_active: boolean
          name: string
          price_per_liter: number | null
          short_name: string | null
          sort_order: number
          trvanlivost_dni: number | null
        }
        Insert: {
          beer_color?: string | null
          color?: string | null
          created_at?: string | null
          degree?: string | null
          id?: string
          is_active?: boolean
          name: string
          price_per_liter?: number | null
          short_name?: string | null
          sort_order?: number
          trvanlivost_dni?: number | null
        }
        Update: {
          beer_color?: string | null
          color?: string | null
          created_at?: string | null
          degree?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price_per_liter?: number | null
          short_name?: string | null
          sort_order?: number
          trvanlivost_dni?: number | null
        }
        Relationships: []
      }
      bottle_sanitation_logs: {
        Row: {
          approved_by: string | null
          cela_cesta_na_louhu: boolean
          chemical_concentration: string | null
          chemical_contact_time: string | null
          chemical_name: string | null
          chemical_temperature: string | null
          created_at: string | null
          ctrl_co2_pressure: boolean
          ctrl_tightness: boolean
          ctrl_valve: boolean
          ctrl_visual: boolean
          eq_co2: boolean
          eq_coupler: boolean
          eq_hoses: boolean
          eq_pegas: boolean
          id: string
          louh: boolean
          mismatch_action: string | null
          mismatch_note: string | null
          note: string | null
          performed_by: string | null
          proc_circulation: boolean
          proc_disassembly: boolean
          proc_rinse_co2: boolean
          proc_rinse_water: boolean
          proplach_vodou: boolean
          prostory: boolean
          reason: string | null
          sanitation_date: string
          sanitation_time: string | null
          source: string | null
          step_times: Json
        }
        Insert: {
          approved_by?: string | null
          cela_cesta_na_louhu?: boolean
          chemical_concentration?: string | null
          chemical_contact_time?: string | null
          chemical_name?: string | null
          chemical_temperature?: string | null
          created_at?: string | null
          ctrl_co2_pressure?: boolean
          ctrl_tightness?: boolean
          ctrl_valve?: boolean
          ctrl_visual?: boolean
          eq_co2?: boolean
          eq_coupler?: boolean
          eq_hoses?: boolean
          eq_pegas?: boolean
          id?: string
          louh?: boolean
          mismatch_action?: string | null
          mismatch_note?: string | null
          note?: string | null
          performed_by?: string | null
          proc_circulation?: boolean
          proc_disassembly?: boolean
          proc_rinse_co2?: boolean
          proc_rinse_water?: boolean
          proplach_vodou?: boolean
          prostory?: boolean
          reason?: string | null
          sanitation_date: string
          sanitation_time?: string | null
          source?: string | null
          step_times?: Json
        }
        Update: {
          approved_by?: string | null
          cela_cesta_na_louhu?: boolean
          chemical_concentration?: string | null
          chemical_contact_time?: string | null
          chemical_name?: string | null
          chemical_temperature?: string | null
          created_at?: string | null
          ctrl_co2_pressure?: boolean
          ctrl_tightness?: boolean
          ctrl_valve?: boolean
          ctrl_visual?: boolean
          eq_co2?: boolean
          eq_coupler?: boolean
          eq_hoses?: boolean
          eq_pegas?: boolean
          id?: string
          louh?: boolean
          mismatch_action?: string | null
          mismatch_note?: string | null
          note?: string | null
          performed_by?: string | null
          proc_circulation?: boolean
          proc_disassembly?: boolean
          proc_rinse_co2?: boolean
          proc_rinse_water?: boolean
          proplach_vodou?: boolean
          prostory?: boolean
          reason?: string | null
          sanitation_date?: string
          sanitation_time?: string | null
          source?: string | null
          step_times?: Json
        }
        Relationships: []
      }
      bottling: {
        Row: {
          beer_id: string | null
          beer_name: string | null
          created_at: string | null
          created_by: string | null
          entry_date: string
          id: string
          kegs_used: number | null
          kegs_used_package_id: string | null
          note: string | null
          package_id: string | null
          package_label: string | null
          quantity: number
          source_volume_l: number | null
        }
        Insert: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date: string
          id?: string
          kegs_used?: number | null
          kegs_used_package_id?: string | null
          note?: string | null
          package_id?: string | null
          package_label?: string | null
          quantity?: number
          source_volume_l?: number | null
        }
        Update: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date?: string
          id?: string
          kegs_used?: number | null
          kegs_used_package_id?: string | null
          note?: string | null
          package_id?: string | null
          package_label?: string | null
          quantity?: number
          source_volume_l?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bottling_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bottling_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      bottling_line_maintenance_tasks: {
        Row: {
          assigned_operator: string | null
          created_at: string
          equipment_name: string
          id: string
          interval_days: number
          last_done_at: string
          next_due_at: string
          notes: string | null
          task_type: string
          updated_at: string
        }
        Insert: {
          assigned_operator?: string | null
          created_at?: string
          equipment_name: string
          id?: string
          interval_days?: number
          last_done_at: string
          next_due_at: string
          notes?: string | null
          task_type: string
          updated_at?: string
        }
        Update: {
          assigned_operator?: string | null
          created_at?: string
          equipment_name?: string
          id?: string
          interval_days?: number
          last_done_at?: string
          next_due_at?: string
          notes?: string | null
          task_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      bottling_plans: {
        Row: {
          beer_id: string | null
          created_at: string
          created_by: string | null
          id: string
          keg_pkg_id: string | null
          keg_qty: number
          note: string | null
          pkg_id: string | null
          pkg2_id: string | null
          pkg3_id: string | null
          planned_date: string
          qty: number
          qty2: number
          qty3: number
          status: string
          updated_at: string
        }
        Insert: {
          beer_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          keg_pkg_id?: string | null
          keg_qty?: number
          note?: string | null
          pkg_id?: string | null
          pkg2_id?: string | null
          pkg3_id?: string | null
          planned_date: string
          qty?: number
          qty2?: number
          qty3?: number
          status?: string
          updated_at?: string
        }
        Update: {
          beer_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          keg_pkg_id?: string | null
          keg_qty?: number
          note?: string | null
          pkg_id?: string | null
          pkg2_id?: string | null
          pkg3_id?: string | null
          planned_date?: string
          qty?: number
          qty2?: number
          qty3?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bottling_plans_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bottling_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bottling_plans_keg_pkg_id_fkey"
            columns: ["keg_pkg_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bottling_plans_pkg_id_fkey"
            columns: ["pkg_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bottling_plans_pkg2_id_fkey"
            columns: ["pkg2_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bottling_plans_pkg3_id_fkey"
            columns: ["pkg3_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          color: string
          created_at: string | null
          created_by: string | null
          description: string | null
          event_date: string
          id: string
          reminder: boolean
          reminder_time: string | null
          title: string
        }
        Insert: {
          color?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          event_date: string
          id?: string
          reminder?: boolean
          reminder_time?: string | null
          title: string
        }
        Update: {
          color?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          event_date?: string
          id?: string
          reminder?: boolean
          reminder_time?: string | null
          title?: string
        }
        Relationships: []
      }
      cellar_batch_mereni: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          measured_at: string
          poznamka: string | null
          stupnovitost: number | null
          teplota_c: number | null
          zapsal: string | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          measured_at?: string
          poznamka?: string | null
          stupnovitost?: number | null
          teplota_c?: number | null
          zapsal?: string | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          measured_at?: string
          poznamka?: string | null
          stupnovitost?: number | null
          teplota_c?: number | null
          zapsal?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cellar_batch_mereni_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "cellar_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      cellar_batches: {
        Row: {
          batch_number: string | null
          beer_id: string | null
          beer_name: string | null
          created_at: string | null
          fg: number | null
          finished_at: string | null
          id: string
          kvasnice_generace: number | null
          kvasnice_z_varky: string | null
          note: string | null
          og: number | null
          started_at: string | null
          tank_id: string | null
          tank_label: string | null
          volume_hl: number | null
        }
        Insert: {
          batch_number?: string | null
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          fg?: number | null
          finished_at?: string | null
          id?: string
          kvasnice_generace?: number | null
          kvasnice_z_varky?: string | null
          note?: string | null
          og?: number | null
          started_at?: string | null
          tank_id?: string | null
          tank_label?: string | null
          volume_hl?: number | null
        }
        Update: {
          batch_number?: string | null
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          fg?: number | null
          finished_at?: string | null
          id?: string
          kvasnice_generace?: number | null
          kvasnice_z_varky?: string | null
          note?: string | null
          og?: number | null
          started_at?: string | null
          tank_id?: string | null
          tank_label?: string | null
          volume_hl?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cellar_batches_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cellar_batches_kvasnice_z_varky_fkey"
            columns: ["kvasnice_z_varky"]
            isOneToOne: false
            referencedRelation: "cellar_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cellar_batches_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "cellar_tanks"
            referencedColumns: ["id"]
          },
        ]
      }
      cellar_tank_cycles: {
        Row: {
          beer_id: string | null
          beer_name: string | null
          created_at: string
          duration_hours: number | null
          ended_at: string
          id: string
          initial_volume_l: number
          keg_count: number
          kegged_volume_l: number
          loss_l: number
          loss_pct: number
          note: string | null
          started_at: string | null
          tank_id: string | null
          tank_label: string | null
        }
        Insert: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string
          duration_hours?: number | null
          ended_at?: string
          id?: string
          initial_volume_l?: number
          keg_count?: number
          kegged_volume_l?: number
          loss_l?: number
          loss_pct?: number
          note?: string | null
          started_at?: string | null
          tank_id?: string | null
          tank_label?: string | null
        }
        Update: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string
          duration_hours?: number | null
          ended_at?: string
          id?: string
          initial_volume_l?: number
          keg_count?: number
          kegged_volume_l?: number
          loss_l?: number
          loss_pct?: number
          note?: string | null
          started_at?: string | null
          tank_id?: string | null
          tank_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cellar_tank_cycles_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cellar_tank_cycles_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "cellar_tanks"
            referencedColumns: ["id"]
          },
        ]
      }
      cellar_tanks: {
        Row: {
          beer_type: string | null
          capacity_l: number
          created_at: string
          current_beer_id: string | null
          current_beer_name: string | null
          current_volume_l: number
          id: string
          initial_volume_l: number | null
          kegging_active: boolean
          kegging_date: string | null
          kegging_ended_at: string | null
          kegging_started_at: string | null
          label: string
          note: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          beer_type?: string | null
          capacity_l?: number
          created_at?: string
          current_beer_id?: string | null
          current_beer_name?: string | null
          current_volume_l?: number
          id?: string
          initial_volume_l?: number | null
          kegging_active?: boolean
          kegging_date?: string | null
          kegging_ended_at?: string | null
          kegging_started_at?: string | null
          label: string
          note?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          beer_type?: string | null
          capacity_l?: number
          created_at?: string
          current_beer_id?: string | null
          current_beer_name?: string | null
          current_volume_l?: number
          id?: string
          initial_volume_l?: number | null
          kegging_active?: boolean
          kegging_date?: string | null
          kegging_ended_at?: string | null
          kegging_started_at?: string | null
          label?: string
          note?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cellar_tanks_current_beer_id_fkey"
            columns: ["current_beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
        ]
      }
      cellar_transfers: {
        Row: {
          beer_id: string | null
          beer_name: string | null
          created_at: string
          from_tank_id: string | null
          id: string
          loss_l: number
          note: string | null
          to_tank_id: string | null
          transfer_date: string
          volume_l: number
        }
        Insert: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string
          from_tank_id?: string | null
          id?: string
          loss_l?: number
          note?: string | null
          to_tank_id?: string | null
          transfer_date?: string
          volume_l: number
        }
        Update: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string
          from_tank_id?: string | null
          id?: string
          loss_l?: number
          note?: string | null
          to_tank_id?: string | null
          transfer_date?: string
          volume_l?: number
        }
        Relationships: [
          {
            foreignKeyName: "cellar_transfers_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cellar_transfers_from_tank_id_fkey"
            columns: ["from_tank_id"]
            isOneToOne: false
            referencedRelation: "cellar_tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cellar_transfers_to_tank_id_fkey"
            columns: ["to_tank_id"]
            isOneToOne: false
            referencedRelation: "cellar_tanks"
            referencedColumns: ["id"]
          },
        ]
      }
      cenik_zmeny: {
        Row: {
          beer_id: string | null
          created_at: string
          druh: string
          id: string
          nova_cena: number | null
          package_id: string | null
          stara_cena: number | null
          zmenil: string | null
        }
        Insert: {
          beer_id?: string | null
          created_at?: string
          druh: string
          id?: string
          nova_cena?: number | null
          package_id?: string | null
          stara_cena?: number | null
          zmenil?: string | null
        }
        Update: {
          beer_id?: string | null
          created_at?: string
          druh?: string
          id?: string
          nova_cena?: number | null
          package_id?: string | null
          stara_cena?: number | null
          zmenil?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cenik_zmeny_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cenik_zmeny_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      checklisty_hotovo: {
        Row: {
          datum: string
          hodnota: string | null
          id: string
          polozka: string
          pracoviste: string
          splneno_at: string
          splnil: string | null
        }
        Insert: {
          datum: string
          hodnota?: string | null
          id?: string
          polozka: string
          pracoviste: string
          splneno_at?: string
          splnil?: string | null
        }
        Update: {
          datum?: string
          hodnota?: string | null
          id?: string
          polozka?: string
          pracoviste?: string
          splneno_at?: string
          splnil?: string | null
        }
        Relationships: []
      }
      edge_rate_limits: {
        Row: {
          bucket: string
          request_count: number
          user_id: string
          window_started_at: string
        }
        Insert: {
          bucket: string
          request_count?: number
          user_id: string
          window_started_at?: string
        }
        Update: {
          bucket?: string
          request_count?: number
          user_id?: string
          window_started_at?: string
        }
        Relationships: []
      }
      exkurze: {
        Row: {
          archivovano_mesic: string | null
          cas: string
          created_at: string
          datum: string
          id: string
          pocet_lidi: number
          poznamka: string | null
          pruvodce: string | null
          trzba: number | null
          updated_at: string
        }
        Insert: {
          archivovano_mesic?: string | null
          cas?: string
          created_at?: string
          datum: string
          id?: string
          pocet_lidi?: number
          poznamka?: string | null
          pruvodce?: string | null
          trzba?: number | null
          updated_at?: string
        }
        Update: {
          archivovano_mesic?: string | null
          cas?: string
          created_at?: string
          datum?: string
          id?: string
          pocet_lidi?: number
          poznamka?: string | null
          pruvodce?: string | null
          trzba?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      fasovani: {
        Row: {
          beer_id: string | null
          beer_name: string | null
          created_at: string
          entry_date: string
          id: string
          note: string | null
          package_id: string | null
          package_label: string | null
          quantity: number
          who: string | null
        }
        Insert: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          note?: string | null
          package_id?: string | null
          package_label?: string | null
          quantity?: number
          who?: string | null
        }
        Update: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          note?: string | null
          package_id?: string | null
          package_label?: string | null
          quantity?: number
          who?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fasovani_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fasovani_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      fasovani_private: {
        Row: {
          beer_id: string | null
          beer_name: string | null
          created_at: string
          entry_date: string
          id: string
          note: string | null
          package_id: string | null
          package_label: string | null
          quantity: number
          who: string | null
        }
        Insert: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          note?: string | null
          package_id?: string | null
          package_label?: string | null
          quantity?: number
          who?: string | null
        }
        Update: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          note?: string | null
          package_id?: string | null
          package_label?: string | null
          quantity?: number
          who?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fasovani_private_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fasovani_private_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_notes: {
        Row: {
          author_id: string
          author_name: string | null
          body: string | null
          category: string
          created_at: string
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string
          author_name?: string | null
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          author_name?: string | null
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      festival_equipment: {
        Row: {
          borrowed_at: string | null
          borrower_name: string | null
          borrower_phone: string | null
          category: string
          created_at: string | null
          created_by: string | null
          deposit_kic: number | null
          event_name: string | null
          expected_return_at: string | null
          id: string
          name: string
          serial_code: string
          status: string
          updated_at: string | null
        }
        Insert: {
          borrowed_at?: string | null
          borrower_name?: string | null
          borrower_phone?: string | null
          category?: string
          created_at?: string | null
          created_by?: string | null
          deposit_kic?: number | null
          event_name?: string | null
          expected_return_at?: string | null
          id?: string
          name: string
          serial_code?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          borrowed_at?: string | null
          borrower_name?: string | null
          borrower_phone?: string | null
          category?: string
          created_at?: string | null
          created_by?: string | null
          deposit_kic?: number | null
          event_name?: string | null
          expected_return_at?: string | null
          id?: string
          name?: string
          serial_code?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      festival_equipment_loans: {
        Row: {
          borrowed_at: string
          borrower_name: string
          borrower_phone: string | null
          created_at: string | null
          created_by: string | null
          deposit_kic: number | null
          deposit_returned: boolean
          equipment_id: string
          event_name: string | null
          expected_return_at: string | null
          id: string
          returned_at: string | null
        }
        Insert: {
          borrowed_at: string
          borrower_name: string
          borrower_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          deposit_kic?: number | null
          deposit_returned?: boolean
          equipment_id: string
          event_name?: string | null
          expected_return_at?: string | null
          id?: string
          returned_at?: string | null
        }
        Update: {
          borrowed_at?: string
          borrower_name?: string
          borrower_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          deposit_kic?: number | null
          deposit_returned?: boolean
          equipment_id?: string
          event_name?: string | null
          expected_return_at?: string | null
          id?: string
          returned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festival_equipment_loans_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "festival_equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          beer_id: string | null
          beer_name: string | null
          created_at: string | null
          created_by: string | null
          entry_date: string
          id: string
          note: string | null
          package_id: string | null
          package_label: string | null
          quantity: number
        }
        Insert: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date: string
          id?: string
          note?: string | null
          package_id?: string | null
          package_label?: string | null
          quantity?: number
        }
        Update: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date?: string
          id?: string
          note?: string | null
          package_id?: string | null
          package_label?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_adjustments: {
        Row: {
          beer_id: string | null
          beer_name: string | null
          created_at: string | null
          created_by: string | null
          entry_date: string
          id: string
          order_id: string | null
          package_id: string | null
          package_label: string | null
          quantity: number
          reason: string | null
        }
        Insert: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date: string
          id?: string
          order_id?: string | null
          package_id?: string | null
          package_label?: string | null
          quantity?: number
          reason?: string | null
        }
        Update: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date?: string
          id?: string
          order_id?: string | null
          package_id?: string | null
          package_label?: string | null
          quantity?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      keg_prefuk: {
        Row: {
          beer_id: string | null
          beer_name: string | null
          created_at: string | null
          created_by: string | null
          entry_date: string
          from_count: number
          from_package_id: string | null
          from_package_label: string | null
          id: string
          note: string | null
          to_count: number
          to_package_id: string | null
          to_package_label: string | null
        }
        Insert: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date: string
          from_count?: number
          from_package_id?: string | null
          from_package_label?: string | null
          id?: string
          note?: string | null
          to_count?: number
          to_package_id?: string | null
          to_package_label?: string | null
        }
        Update: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date?: string
          from_count?: number
          from_package_id?: string | null
          from_package_label?: string | null
          id?: string
          note?: string | null
          to_count?: number
          to_package_id?: string | null
          to_package_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "keg_prefuk_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keg_prefuk_from_package_id_fkey"
            columns: ["from_package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keg_prefuk_to_package_id_fkey"
            columns: ["to_package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      keg_returns: {
        Row: {
          created_at: string
          direction: string
          entry_date: string
          id: string
          note: string | null
          order_id: string | null
          package_id: string | null
          place_id: string | null
          place_name: string | null
          quantity: number
          recorded_by: string | null
          volume_l: number
        }
        Insert: {
          created_at?: string
          direction?: string
          entry_date: string
          id?: string
          note?: string | null
          order_id?: string | null
          package_id?: string | null
          place_id?: string | null
          place_name?: string | null
          quantity: number
          recorded_by?: string | null
          volume_l: number
        }
        Update: {
          created_at?: string
          direction?: string
          entry_date?: string
          id?: string
          note?: string | null
          order_id?: string | null
          package_id?: string | null
          place_id?: string | null
          place_name?: string | null
          quantity?: number
          recorded_by?: string | null
          volume_l?: number
        }
        Relationships: [
          {
            foreignKeyName: "keg_returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keg_returns_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keg_returns_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      keg_sanitation_logs: {
        Row: {
          approved_by: string | null
          created_at: string | null
          id: string
          note: string | null
          performed_by: string | null
          proc_end_coupler_heads_persteril_bucket: boolean
          proc_end_rinse_couplers_water: boolean
          proc_end_rinse_floors_cellar: boolean
          proc_end_rinse_floors_walls_bottlers: boolean
          proc_end_rinse_lines_water: boolean
          proc_end_rinse_valves_water: boolean
          proc_month_clean_brush_24h: boolean
          proc_month_disassemble_couplers: boolean
          proc_month_rinse_water: boolean
          proc_month_visual_clean: boolean
          proc_rinse_naoh_2_20: boolean
          proc_rinse_persteril_02_10: boolean
          proc_rinse_water_after_valves: boolean
          proc_rinse_water_before: boolean
          proc_scrub_valves_naoh_2_15: boolean
          proc_spray_valves_persteril_02_10: boolean
          reason: string | null
          sanitation_date: string
          sanitation_time: string | null
          source: string | null
          step_times: Json
        }
        Insert: {
          approved_by?: string | null
          created_at?: string | null
          id?: string
          note?: string | null
          performed_by?: string | null
          proc_end_coupler_heads_persteril_bucket?: boolean
          proc_end_rinse_couplers_water?: boolean
          proc_end_rinse_floors_cellar?: boolean
          proc_end_rinse_floors_walls_bottlers?: boolean
          proc_end_rinse_lines_water?: boolean
          proc_end_rinse_valves_water?: boolean
          proc_month_clean_brush_24h?: boolean
          proc_month_disassemble_couplers?: boolean
          proc_month_rinse_water?: boolean
          proc_month_visual_clean?: boolean
          proc_rinse_naoh_2_20?: boolean
          proc_rinse_persteril_02_10?: boolean
          proc_rinse_water_after_valves?: boolean
          proc_rinse_water_before?: boolean
          proc_scrub_valves_naoh_2_15?: boolean
          proc_spray_valves_persteril_02_10?: boolean
          reason?: string | null
          sanitation_date: string
          sanitation_time?: string | null
          source?: string | null
          step_times?: Json
        }
        Update: {
          approved_by?: string | null
          created_at?: string | null
          id?: string
          note?: string | null
          performed_by?: string | null
          proc_end_coupler_heads_persteril_bucket?: boolean
          proc_end_rinse_couplers_water?: boolean
          proc_end_rinse_floors_cellar?: boolean
          proc_end_rinse_floors_walls_bottlers?: boolean
          proc_end_rinse_lines_water?: boolean
          proc_end_rinse_valves_water?: boolean
          proc_month_clean_brush_24h?: boolean
          proc_month_disassemble_couplers?: boolean
          proc_month_rinse_water?: boolean
          proc_month_visual_clean?: boolean
          proc_rinse_naoh_2_20?: boolean
          proc_rinse_persteril_02_10?: boolean
          proc_rinse_water_after_valves?: boolean
          proc_rinse_water_before?: boolean
          proc_scrub_valves_naoh_2_15?: boolean
          proc_spray_valves_persteril_02_10?: boolean
          reason?: string | null
          sanitation_date?: string
          sanitation_time?: string | null
          source?: string | null
          step_times?: Json
        }
        Relationships: []
      }
      kegging: {
        Row: {
          beer_id: string | null
          beer_name: string | null
          cellar_tank_id: string | null
          created_at: string | null
          created_by: string | null
          entry_date: string
          id: string
          loss_l: number | null
          note: string | null
          order_item_id: string | null
          package_id: string | null
          package_label: string | null
          quantity: number
          source_volume_l: number | null
          tank_id: string | null
        }
        Insert: {
          beer_id?: string | null
          beer_name?: string | null
          cellar_tank_id?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date: string
          id?: string
          loss_l?: number | null
          note?: string | null
          order_item_id?: string | null
          package_id?: string | null
          package_label?: string | null
          quantity?: number
          source_volume_l?: number | null
          tank_id?: string | null
        }
        Update: {
          beer_id?: string | null
          beer_name?: string | null
          cellar_tank_id?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date?: string
          id?: string
          loss_l?: number | null
          note?: string | null
          order_item_id?: string | null
          package_id?: string | null
          package_label?: string | null
          quantity?: number
          source_volume_l?: number | null
          tank_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kegging_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kegging_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kegging_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      kegging_plan_checks: {
        Row: {
          beer_id: string
          day: string
          id: string
          package_id: string
          qty: number
          updated_at: string
          updated_by: string | null
          week_key: string
        }
        Insert: {
          beer_id: string
          day: string
          id?: string
          package_id: string
          qty?: number
          updated_at?: string
          updated_by?: string | null
          week_key: string
        }
        Update: {
          beer_id?: string
          day?: string
          id?: string
          package_id?: string
          qty?: number
          updated_at?: string
          updated_by?: string | null
          week_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "kegging_plan_checks_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kegging_plan_checks_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      kegging_tanks: {
        Row: {
          beer_id: string | null
          beer_name: string | null
          cellar_tank_id: string | null
          closed_at: string | null
          created_at: string
          id: string
          label: string | null
          note: string | null
          started_at: string
        }
        Insert: {
          beer_id?: string | null
          beer_name?: string | null
          cellar_tank_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          label?: string | null
          note?: string | null
          started_at?: string
        }
        Update: {
          beer_id?: string | null
          beer_name?: string | null
          cellar_tank_id?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          label?: string | null
          note?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kegging_tanks_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kegging_tanks_cellar_tank_id_fkey"
            columns: ["cellar_tank_id"]
            isOneToOne: false
            referencedRelation: "cellar_tanks"
            referencedColumns: ["id"]
          },
        ]
      }
      label_purchases: {
        Row: {
          beer_id: string | null
          beer_name: string
          created_at: string | null
          created_by: string | null
          entry_date: string
          id: string
          note: string | null
          quantity: number
        }
        Insert: {
          beer_id?: string | null
          beer_name: string
          created_at?: string | null
          created_by?: string | null
          entry_date: string
          id?: string
          note?: string | null
          quantity?: number
        }
        Update: {
          beer_id?: string | null
          beer_name?: string
          created_at?: string | null
          created_by?: string | null
          entry_date?: string
          id?: string
          note?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "label_purchases_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
        ]
      }
      logbook_entries: {
        Row: {
          created_at: string | null
          created_by: string | null
          driver: string
          entry_date: string
          fuel_liters: number | null
          id: string
          km_driven: number
          km_end: number
          km_start: number
          note: string | null
          purpose: string
          route_from: string
          route_to: string
          vehicle_id: string | null
          vehicle_name: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          driver: string
          entry_date: string
          fuel_liters?: number | null
          id?: string
          km_driven?: number
          km_end?: number
          km_start?: number
          note?: string | null
          purpose: string
          route_from: string
          route_to: string
          vehicle_id?: string | null
          vehicle_name: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          driver?: string
          entry_date?: string
          fuel_liters?: number | null
          id?: string
          km_driven?: number
          km_end?: number
          km_start?: number
          note?: string | null
          purpose?: string
          route_from?: string
          route_to?: string
          vehicle_id?: string | null
          vehicle_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "logbook_entries_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      merch_items: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          id: string
          min_alert_qty: number
          name: string
          sell_price_kic: number | null
          stock_qty: number
          unit_cost_kic: number
          updated_at: string | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          min_alert_qty?: number
          name: string
          sell_price_kic?: number | null
          stock_qty?: number
          unit_cost_kic?: number
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          min_alert_qty?: number
          name?: string
          sell_price_kic?: number | null
          stock_qty?: number
          unit_cost_kic?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      migrace_aplikovane: {
        Row: {
          aplikovano_at: string
          nazev: string
          poznamka: string | null
          zdroj: string | null
        }
        Insert: {
          aplikovano_at?: string
          nazev: string
          poznamka?: string | null
          zdroj?: string | null
        }
        Update: {
          aplikovano_at?: string
          nazev?: string
          poznamka?: string | null
          zdroj?: string | null
        }
        Relationships: []
      }
      notes: {
        Row: {
          body: string
          color: string
          created_at: string | null
          created_by: string | null
          id: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          body: string
          color?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          body?: string
          color?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      obal_nakupy: {
        Row: {
          created_at: string | null
          created_by: string | null
          entry_date: string
          id: string
          note: string | null
          package_label: string
          quantity: number
          zdroj: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          entry_date: string
          id?: string
          note?: string | null
          package_label: string
          quantity?: number
          zdroj?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          entry_date?: string
          id?: string
          note?: string | null
          package_label?: string
          quantity?: number
          zdroj?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          beer_id: string | null
          beer_name: string | null
          created_at: string | null
          delivery_day: string | null
          id: string
          is_bottled: boolean
          is_prepared: boolean
          order_id: string
          package_id: string | null
          package_label: string | null
          quantity: number
        }
        Insert: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          delivery_day?: string | null
          id?: string
          is_bottled?: boolean
          is_prepared?: boolean
          order_id: string
          package_id?: string | null
          package_label?: string | null
          quantity?: number
        }
        Update: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          delivery_day?: string | null
          id?: string
          is_bottled?: boolean
          is_prepared?: boolean
          order_id?: string
          package_id?: string | null
          package_label?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string | null
          created_by: string | null
          delivered_at: string | null
          delivery_date: string | null
          delivery_day: string | null
          id: string
          is_delivered: boolean
          is_packaged: boolean
          is_prepared: boolean
          note: string | null
          order_date: string
          place_id: string | null
          place_name: string | null
          signature_name: string | null
          signature_url: string | null
          source: string
          status: string
          whatsapp_message_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          delivered_at?: string | null
          delivery_date?: string | null
          delivery_day?: string | null
          id?: string
          is_delivered?: boolean
          is_packaged?: boolean
          is_prepared?: boolean
          note?: string | null
          order_date: string
          place_id?: string | null
          place_name?: string | null
          signature_name?: string | null
          signature_url?: string | null
          source?: string
          status?: string
          whatsapp_message_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          delivered_at?: string | null
          delivery_date?: string | null
          delivery_day?: string | null
          id?: string
          is_delivered?: boolean
          is_packaged?: boolean
          is_prepared?: boolean
          note?: string | null
          order_date?: string
          place_id?: string | null
          place_name?: string | null
          signature_name?: string | null
          signature_url?: string | null
          source?: string
          status?: string
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_whatsapp_message_id_fkey"
            columns: ["whatsapp_message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_incoming"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          code: string
          id: string
          kind: string
          label: string
          sort_order: number
          volume_l: number
        }
        Insert: {
          code: string
          id?: string
          kind: string
          label: string
          sort_order?: number
          volume_l: number
        }
        Update: {
          code?: string
          id?: string
          kind?: string
          label?: string
          sort_order?: number
          volume_l?: number
        }
        Relationships: []
      }
      parser_aliases: {
        Row: {
          alias_text: string
          beer_id: string | null
          created_at: string | null
          hit_count: number
          id: string
          package_id: string | null
          updated_at: string | null
        }
        Insert: {
          alias_text: string
          beer_id?: string | null
          created_at?: string | null
          hit_count?: number
          id?: string
          package_id?: string | null
          updated_at?: string | null
        }
        Update: {
          alias_text?: string
          beer_id?: string | null
          created_at?: string | null
          hit_count?: number
          id?: string
          package_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parser_aliases_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parser_aliases_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      place_aliases: {
        Row: {
          correct_name: string
          created_at: string | null
          hit_count: number
          id: string
          place_id: string | null
          updated_at: string | null
          wrong_name: string
        }
        Insert: {
          correct_name?: string
          created_at?: string | null
          hit_count?: number
          id?: string
          place_id?: string | null
          updated_at?: string | null
          wrong_name: string
        }
        Update: {
          correct_name?: string
          created_at?: string | null
          hit_count?: number
          id?: string
          place_id?: string | null
          updated_at?: string | null
          wrong_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_aliases_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          address: string | null
          contact_name: string | null
          created_at: string | null
          delivery_group: string | null
          email: string | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          note: string | null
          opening_hours: string | null
          phone: string | null
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          created_at?: string | null
          delivery_group?: string | null
          email?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          note?: string | null
          opening_hours?: string | null
          phone?: string | null
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          created_at?: string | null
          delivery_group?: string | null
          email?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          note?: string | null
          opening_hours?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      planovane_varky: {
        Row: {
          created_at: string
          datum_od: string
          dnu: number
          id: string
          objem_hl: number
          pivo: string
          poznamka: string | null
          tank_id: string
          updated_at: string
          vytvoril: string | null
        }
        Insert: {
          created_at?: string
          datum_od: string
          dnu?: number
          id?: string
          objem_hl?: number
          pivo?: string
          poznamka?: string | null
          tank_id: string
          updated_at?: string
          vytvoril?: string | null
        }
        Update: {
          created_at?: string
          datum_od?: string
          dnu?: number
          id?: string
          objem_hl?: number
          pivo?: string
          poznamka?: string | null
          tank_id?: string
          updated_at?: string
          vytvoril?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planovane_varky_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "cellar_tanks"
            referencedColumns: ["id"]
          },
        ]
      }
      price_list: {
        Row: {
          beer_id: string | null
          created_at: string
          currency: string
          id: string
          note: string | null
          package_id: string | null
          price_per_unit: number
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          beer_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          note?: string | null
          package_id?: string | null
          price_per_unit: number
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          beer_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          note?: string | null
          package_id?: string | null
          price_per_unit?: number
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_list_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          display_name: string | null
          home_layout: Json
          id: string
          password_set: boolean
          permissions: Json | null
          receive_vehicle_alerts: boolean
          role: string
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          home_layout?: Json
          id: string
          password_set?: boolean
          permissions?: Json | null
          receive_vehicle_alerts?: boolean
          role?: string
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          home_layout?: Json
          id?: string
          password_set?: boolean
          permissions?: Json | null
          receive_vehicle_alerts?: boolean
          role?: string
        }
        Relationships: []
      }
      push_odbery: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          p256dh: string
          posledni_chyba: string | null
          user_id: string | null
          zarizeni: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          p256dh: string
          posledni_chyba?: string | null
          user_id?: string | null
          zarizeni?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          p256dh?: string
          posledni_chyba?: string | null
          user_id?: string | null
          zarizeni?: string | null
        }
        Relationships: []
      }
      reminders: {
        Row: {
          acknowledged_by: string[]
          created_at: string | null
          created_by: string | null
          date_time: string
          display_mode: string
          id: string
          is_completed: boolean
          note: string | null
          target_emails: string[]
          target_role: string
          title: string
        }
        Insert: {
          acknowledged_by?: string[]
          created_at?: string | null
          created_by?: string | null
          date_time: string
          display_mode?: string
          id?: string
          is_completed?: boolean
          note?: string | null
          target_emails?: string[]
          target_role?: string
          title: string
        }
        Update: {
          acknowledged_by?: string[]
          created_at?: string | null
          created_by?: string | null
          date_time?: string
          display_mode?: string
          id?: string
          is_completed?: boolean
          note?: string | null
          target_emails?: string[]
          target_role?: string
          title?: string
        }
        Relationships: []
      }
      sanitation_logs: {
        Row: {
          chemical_name: string | null
          concentration_pct: number | null
          created_at: string | null
          duration_minutes: number | null
          id: string
          method: string
          method_label: string
          note: string | null
          performed_by: string | null
          sanitation_date: string
          sanitation_time: string | null
          tank_id: string | null
          tank_label: string
          temperature_c: number | null
        }
        Insert: {
          chemical_name?: string | null
          concentration_pct?: number | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          method: string
          method_label: string
          note?: string | null
          performed_by?: string | null
          sanitation_date: string
          sanitation_time?: string | null
          tank_id?: string | null
          tank_label: string
          temperature_c?: number | null
        }
        Update: {
          chemical_name?: string | null
          concentration_pct?: number | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          method?: string
          method_label?: string
          note?: string | null
          performed_by?: string | null
          sanitation_date?: string
          sanitation_time?: string | null
          tank_id?: string | null
          tank_label?: string
          temperature_c?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sanitation_logs_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "cellar_tanks"
            referencedColumns: ["id"]
          },
        ]
      }
      sdilene_poznamky: {
        Row: {
          autor: string | null
          created_at: string
          dulezite: boolean
          hotovo: boolean
          hotovo_at: string | null
          hotovo_kdo: string | null
          id: string
          text: string
          updated_at: string
        }
        Insert: {
          autor?: string | null
          created_at?: string
          dulezite?: boolean
          hotovo?: boolean
          hotovo_at?: string | null
          hotovo_kdo?: string | null
          id?: string
          text: string
          updated_at?: string
        }
        Update: {
          autor?: string | null
          created_at?: string
          dulezite?: boolean
          hotovo?: boolean
          hotovo_at?: string | null
          hotovo_kdo?: string | null
          id?: string
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      sklo_promo_entries: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          destination: string | null
          entry_date: string
          entry_type: string
          id: string
          item_name: string
          note: string | null
          quantity: number
          zdroj: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          destination?: string | null
          entry_date: string
          entry_type: string
          id?: string
          item_name: string
          note?: string | null
          quantity?: number
          zdroj?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          destination?: string | null
          entry_date?: string
          entry_type?: string
          id?: string
          item_name?: string
          note?: string | null
          quantity?: number
          zdroj?: string | null
        }
        Relationships: []
      }
      srotovani: {
        Row: {
          beer_id: string | null
          beer_name: string | null
          created_at: string | null
          entry_date: string
          id: string
          note: string | null
          weight_kg: number
        }
        Insert: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          entry_date: string
          id?: string
          note?: string | null
          weight_kg?: number
        }
        Update: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          entry_date?: string
          id?: string
          note?: string | null
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "srotovani_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_uprava_log: {
        Row: {
          created_at: string
          delta_l: number
          klic: string
          provedl: string | null
          tank_id: string
          zdroj: string | null
        }
        Insert: {
          created_at?: string
          delta_l: number
          klic: string
          provedl?: string | null
          tank_id: string
          zdroj?: string | null
        }
        Update: {
          created_at?: string
          delta_l?: number
          klic?: string
          provedl?: string | null
          tank_id?: string
          zdroj?: string | null
        }
        Relationships: []
      }
      tap_sanitation_logs: {
        Row: {
          approved_by: string | null
          created_at: string | null
          disassembly_time: string | null
          id: string
          louh_sanitation_time: string | null
          note: string | null
          performed_by: string | null
          reason: string | null
          sanitation_date: string
          sanitation_time: string | null
          source: string | null
          steps: Json
          tap_id: string
          tap_name: string | null
          visual_check_time: string | null
          water_rinse_time: string | null
        }
        Insert: {
          approved_by?: string | null
          created_at?: string | null
          disassembly_time?: string | null
          id?: string
          louh_sanitation_time?: string | null
          note?: string | null
          performed_by?: string | null
          reason?: string | null
          sanitation_date: string
          sanitation_time?: string | null
          source?: string | null
          steps?: Json
          tap_id: string
          tap_name?: string | null
          visual_check_time?: string | null
          water_rinse_time?: string | null
        }
        Update: {
          approved_by?: string | null
          created_at?: string | null
          disassembly_time?: string | null
          id?: string
          louh_sanitation_time?: string | null
          note?: string | null
          performed_by?: string | null
          reason?: string | null
          sanitation_date?: string
          sanitation_time?: string | null
          source?: string | null
          steps?: Json
          tap_id?: string
          tap_name?: string | null
          visual_check_time?: string | null
          water_rinse_time?: string | null
        }
        Relationships: []
      }
      tydenni_inventura: {
        Row: {
          beer_id: string | null
          beer_name: string | null
          created_at: string
          created_by: string | null
          id: string
          napocitano: number
          ocekavano: number
          package_id: string | null
          package_label: string | null
          poznamka: string | null
          rozdil: number
          tyden_do: string
          tyden_od: string
          updated_at: string
          vyreseno: string | null
        }
        Insert: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          napocitano?: number
          ocekavano?: number
          package_id?: string | null
          package_label?: string | null
          poznamka?: string | null
          rozdil?: number
          tyden_do: string
          tyden_od: string
          updated_at?: string
          vyreseno?: string | null
        }
        Update: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          napocitano?: number
          ocekavano?: number
          package_id?: string | null
          package_label?: string | null
          poznamka?: string | null
          rozdil?: number
          tyden_do?: string
          tyden_od?: string
          updated_at?: string
          vyreseno?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tydenni_inventura_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tydenni_inventura_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      user_app_versions: {
        Row: {
          created_at: string
          device_info: string | null
          id: string
          last_seen_at: string
          user_id: string
          version: string
        }
        Insert: {
          created_at?: string
          device_info?: string | null
          id?: string
          last_seen_at?: string
          user_id: string
          version: string
        }
        Update: {
          created_at?: string
          device_info?: string | null
          id?: string
          last_seen_at?: string
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_app_versions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          created_at: string
          highway_toll_valid_until: string | null
          id: string
          name: string
          note: string | null
          spz: string | null
          stk_valid_until: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          highway_toll_valid_until?: string | null
          id?: string
          name: string
          note?: string | null
          spz?: string | null
          stk_valid_until?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          highway_toll_valid_until?: string | null
          id?: string
          name?: string
          note?: string | null
          spz?: string | null
          stk_valid_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      vycepy: {
        Row: {
          aktivni: boolean
          created_at: string
          id: string
          kohouty_rozebrane: boolean
          nazev: string
          poradi: number
          posledni_oplach: string | null
          posledni_sanitace_louhem: string | null
          poznamka: string | null
          stav: string
          typ: string
          updated_at: string
        }
        Insert: {
          aktivni?: boolean
          created_at?: string
          id?: string
          kohouty_rozebrane?: boolean
          nazev: string
          poradi?: number
          posledni_oplach?: string | null
          posledni_sanitace_louhem?: string | null
          poznamka?: string | null
          stav?: string
          typ?: string
          updated_at?: string
        }
        Update: {
          aktivni?: boolean
          created_at?: string
          id?: string
          kohouty_rozebrane?: boolean
          nazev?: string
          poradi?: number
          posledni_oplach?: string | null
          posledni_sanitace_louhem?: string | null
          poznamka?: string | null
          stav?: string
          typ?: string
          updated_at?: string
        }
        Relationships: []
      }
      vycepy_rezervace: {
        Row: {
          created_at: string
          datum_do: string
          datum_od: string
          id: string
          kauce_czk: number | null
          odberatel: string
          order_id: string | null
          poznamka: string | null
          telefon: string | null
          updated_at: string
          vraceno: boolean
          vraceno_at: string | null
          vycep_id: string
          vycep_nazev: string | null
          vytvoril: string | null
        }
        Insert: {
          created_at?: string
          datum_do: string
          datum_od: string
          id?: string
          kauce_czk?: number | null
          odberatel?: string
          order_id?: string | null
          poznamka?: string | null
          telefon?: string | null
          updated_at?: string
          vraceno?: boolean
          vraceno_at?: string | null
          vycep_id: string
          vycep_nazev?: string | null
          vytvoril?: string | null
        }
        Update: {
          created_at?: string
          datum_do?: string
          datum_od?: string
          id?: string
          kauce_czk?: number | null
          odberatel?: string
          order_id?: string | null
          poznamka?: string | null
          telefon?: string | null
          updated_at?: string
          vraceno?: boolean
          vraceno_at?: string | null
          vycep_id?: string
          vycep_nazev?: string | null
          vytvoril?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vycepy_rezervace_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vycepy_rezervace_vycep_id_fkey"
            columns: ["vycep_id"]
            isOneToOne: false
            referencedRelation: "vycepy"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_incoming: {
        Row: {
          amends_message_id: string | null
          amends_order_id: string | null
          chat_id: string | null
          created_at: string | null
          error_message: string | null
          from_me: boolean
          id: string
          imported_at: string | null
          imported_order_id: string | null
          media_url: string | null
          message_text: string
          message_timestamp: string | null
          message_type: string | null
          parsed_delivery_date: string | null
          parsed_delivery_day: string | null
          parsed_items: Json | null
          parsed_note: string | null
          parsed_place_id: string | null
          parsed_place_name: string | null
          parsed_raw_text: string | null
          participant_name: string | null
          quoted_text: string | null
          readback_checked_at: string | null
          readback_checked_by: string | null
          readback_unmatched_count: number | null
          sender_name: string
          sender_number: string | null
          status: string
          webhook_id: string | null
          webhook_timestamp: string | null
        }
        Insert: {
          amends_message_id?: string | null
          amends_order_id?: string | null
          chat_id?: string | null
          created_at?: string | null
          error_message?: string | null
          from_me?: boolean
          id?: string
          imported_at?: string | null
          imported_order_id?: string | null
          media_url?: string | null
          message_text: string
          message_timestamp?: string | null
          message_type?: string | null
          parsed_delivery_date?: string | null
          parsed_delivery_day?: string | null
          parsed_items?: Json | null
          parsed_note?: string | null
          parsed_place_id?: string | null
          parsed_place_name?: string | null
          parsed_raw_text?: string | null
          participant_name?: string | null
          quoted_text?: string | null
          readback_checked_at?: string | null
          readback_checked_by?: string | null
          readback_unmatched_count?: number | null
          sender_name: string
          sender_number?: string | null
          status?: string
          webhook_id?: string | null
          webhook_timestamp?: string | null
        }
        Update: {
          amends_message_id?: string | null
          amends_order_id?: string | null
          chat_id?: string | null
          created_at?: string | null
          error_message?: string | null
          from_me?: boolean
          id?: string
          imported_at?: string | null
          imported_order_id?: string | null
          media_url?: string | null
          message_text?: string
          message_timestamp?: string | null
          message_type?: string | null
          parsed_delivery_date?: string | null
          parsed_delivery_day?: string | null
          parsed_items?: Json | null
          parsed_note?: string | null
          parsed_place_id?: string | null
          parsed_place_name?: string | null
          parsed_raw_text?: string | null
          participant_name?: string | null
          quoted_text?: string | null
          readback_checked_at?: string | null
          readback_checked_by?: string | null
          readback_unmatched_count?: number | null
          sender_name?: string
          sender_number?: string | null
          status?: string
          webhook_id?: string | null
          webhook_timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_incoming_amends_message_id_fkey"
            columns: ["amends_message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_incoming"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_incoming_amends_order_id_fkey"
            columns: ["amends_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_incoming_imported_order_id_fkey"
            columns: ["imported_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_incoming_parsed_place_id_fkey"
            columns: ["parsed_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_most_stav: {
        Row: {
          id: string
          naposledy: string
          poznamka: string | null
          pripojeno: boolean
          url: string | null
          verze: string | null
        }
        Insert: {
          id?: string
          naposledy?: string
          poznamka?: string | null
          pripojeno?: boolean
          url?: string | null
          verze?: string | null
        }
        Update: {
          id?: string
          naposledy?: string
          poznamka?: string | null
          pripojeno?: boolean
          url?: string | null
          verze?: string | null
        }
        Relationships: []
      }
      whatsapp_neodeslane: {
        Row: {
          chyba: string | null
          created_at: string
          id: string
          message_preview: string | null
          odeslano_at: string | null
          payload: Json
          pokusu: number
          posledni_pokus: string
          sender_name: string | null
          webhook_id: string
        }
        Insert: {
          chyba?: string | null
          created_at?: string
          id?: string
          message_preview?: string | null
          odeslano_at?: string | null
          payload: Json
          pokusu?: number
          posledni_pokus?: string
          sender_name?: string | null
          webhook_id: string
        }
        Update: {
          chyba?: string | null
          created_at?: string
          id?: string
          message_preview?: string | null
          odeslano_at?: string | null
          payload?: Json
          pokusu?: number
          posledni_pokus?: string
          sender_name?: string | null
          webhook_id?: string
        }
        Relationships: []
      }
      whatsapp_prijem_log: {
        Row: {
          chat_id: string | null
          created_at: string
          duvod: string | null
          id: string
          incoming_id: string | null
          message_preview: string | null
          message_timestamp: string | null
          sender_name: string | null
          vysledek: string
          webhook_id: string | null
        }
        Insert: {
          chat_id?: string | null
          created_at?: string
          duvod?: string | null
          id?: string
          incoming_id?: string | null
          message_preview?: string | null
          message_timestamp?: string | null
          sender_name?: string | null
          vysledek: string
          webhook_id?: string | null
        }
        Update: {
          chat_id?: string | null
          created_at?: string
          duvod?: string | null
          id?: string
          incoming_id?: string | null
          message_preview?: string | null
          message_timestamp?: string | null
          sender_name?: string | null
          vysledek?: string
          webhook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_prijem_log_incoming_id_fkey"
            columns: ["incoming_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_incoming"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_prikazy: {
        Row: {
          created_at: string
          id: string
          prikaz: string
          stav: string
          updated_at: string
          vysledek: string | null
          zadal: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          prikaz: string
          stav?: string
          updated_at?: string
          vysledek?: string | null
          zadal?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          prikaz?: string
          stav?: string
          updated_at?: string
          vysledek?: string | null
          zadal?: string | null
        }
        Relationships: []
      }
      whatsapp_rejected: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          chat_id: string | null
          created_at: string
          id: string
          message_preview: string | null
          message_timestamp: string | null
          sender_name: string
          sender_number: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          chat_id?: string | null
          created_at?: string
          id?: string
          message_preview?: string | null
          message_timestamp?: string | null
          sender_name: string
          sender_number?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          chat_id?: string | null
          created_at?: string
          id?: string
          message_preview?: string | null
          message_timestamp?: string | null
          sender_name?: string
          sender_number?: string | null
        }
        Relationships: []
      }
      whatsapp_senders: {
        Row: {
          chat_id: string | null
          created_at: string | null
          id: string
          sender_name: string
          sender_number: string | null
        }
        Insert: {
          chat_id?: string | null
          created_at?: string | null
          id?: string
          sender_name: string
          sender_number?: string | null
        }
        Update: {
          chat_id?: string | null
          created_at?: string | null
          id?: string
          sender_name?: string
          sender_number?: string | null
        }
        Relationships: []
      }
      whatsapp_session: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      writeoffs: {
        Row: {
          beer_id: string | null
          beer_name: string | null
          created_at: string | null
          created_by: string | null
          entry_date: string
          id: string
          package_id: string | null
          package_label: string | null
          quantity: number
          reason: string | null
          who: string | null
        }
        Insert: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date: string
          id?: string
          package_id?: string | null
          package_label?: string | null
          quantity?: number
          reason?: string | null
          who?: string | null
        }
        Update: {
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date?: string
          id?: string
          package_id?: string | null
          package_label?: string | null
          quantity?: number
          reason?: string | null
          who?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "writeoffs_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writeoffs_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      zadavani: {
        Row: {
          amount: number | null
          beer_id: string | null
          beer_name: string | null
          created_at: string | null
          created_by: string | null
          entry_date: string | null
          id: string
          note: string | null
          unit: string | null
        }
        Insert: {
          amount?: number | null
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date?: string | null
          id?: string
          note?: string | null
          unit?: string | null
        }
        Update: {
          amount?: number | null
          beer_id?: string | null
          beer_name?: string | null
          created_at?: string | null
          created_by?: string | null
          entry_date?: string | null
          id?: string
          note?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zadavani_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
        ]
      }
      zavoz_deductions: {
        Row: {
          beer_id: string | null
          created_at: string
          deduct_date: string
          id: string
          note: string | null
          order_id: string
          order_item_id: string | null
          package_id: string | null
          quantity: number
        }
        Insert: {
          beer_id?: string | null
          created_at?: string
          deduct_date: string
          id?: string
          note?: string | null
          order_id: string
          order_item_id?: string | null
          package_id?: string | null
          quantity: number
        }
        Update: {
          beer_id?: string | null
          created_at?: string
          deduct_date?: string
          id?: string
          note?: string | null
          order_id?: string
          order_item_id?: string | null
          package_id?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "zavoz_deductions_beer_id_fkey"
            columns: ["beer_id"]
            isOneToOne: false
            referencedRelation: "beers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zavoz_deductions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zavoz_deductions_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zavoz_deductions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      zavoz_ukoly_hotovo: {
        Row: {
          id: string
          klic: string
          order_id: string
          splneno_at: string
          splnil: string | null
        }
        Insert: {
          id?: string
          klic: string
          order_id: string
          splneno_at?: string
          splnil?: string | null
        }
        Update: {
          id?: string
          klic?: string
          order_id?: string
          splneno_at?: string
          splnil?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zavoz_ukoly_hotovo_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      zaznam_fotky: {
        Row: {
          cesta: string
          created_at: string
          created_by: string | null
          id: string
          popis: string | null
          typ: string
          zaznam_id: string
        }
        Insert: {
          cesta: string
          created_at?: string
          created_by?: string | null
          id?: string
          popis?: string | null
          typ: string
          zaznam_id: string
        }
        Update: {
          cesta?: string
          created_at?: string
          created_by?: string | null
          id?: string
          popis?: string | null
          typ?: string
          zaznam_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      whatsapp_prijem_denne: {
        Row: {
          chyba: number | null
          den: string | null
          doslo: number | null
          duplicita: number | null
          ulozeno: number | null
          zahozeno_filtr: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      adjust_tank_volume: {
        Args: { p_delta_l: number; p_tank_id: string }
        Returns: number
      }
      adjust_tank_volume_once: {
        Args: {
          p_delta_l: number
          p_klic: string
          p_tank_id: string
          p_zdroj?: string
        }
        Returns: string
      }
      claim_pending_whatsapp_messages: {
        Args: { p_limit?: number }
        Returns: {
          amends_message_id: string | null
          amends_order_id: string | null
          chat_id: string | null
          created_at: string | null
          error_message: string | null
          from_me: boolean
          id: string
          imported_at: string | null
          imported_order_id: string | null
          media_url: string | null
          message_text: string
          message_timestamp: string | null
          message_type: string | null
          parsed_delivery_date: string | null
          parsed_delivery_day: string | null
          parsed_items: Json | null
          parsed_note: string | null
          parsed_place_id: string | null
          parsed_place_name: string | null
          parsed_raw_text: string | null
          participant_name: string | null
          quoted_text: string | null
          readback_checked_at: string | null
          readback_checked_by: string | null
          readback_unmatched_count: number | null
          sender_name: string
          sender_number: string | null
          status: string
          webhook_id: string | null
          webhook_timestamp: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "whatsapp_incoming"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      close_all_open_tanks: { Args: never; Returns: undefined }
      close_inventory_month: {
        Args: {
          p_current_date: string
          p_current_rows: Json
          p_next_date: string
          p_next_rows: Json
        }
        Returns: number
      }
      consume_edge_rate_limit: {
        Args: {
          p_bucket: string
          p_limit: number
          p_user_id: string
          p_window_seconds: number
        }
        Returns: boolean
      }
      create_order_with_items: {
        Args: { p_items: Json; p_order: Json }
        Returns: string
      }
      merge_duplicate_order_items: {
        Args: {
          p_delete_ids: string[]
          p_keep_id: string
          p_target_quantity: number
        }
        Returns: undefined
      }
      posli_ranni_souhrn: { Args: never; Returns: undefined }
      posli_tydenni_ticho: { Args: never; Returns: undefined }
      process_zavoz_deductions_for_date: {
        Args: { p_date: string }
        Returns: number
      }
      pujc_vybaveni: {
        Args: {
          p_borrowed_at: string
          p_borrower_name: string
          p_borrower_phone: string
          p_deposit_kic: number
          p_equipment_id: string
          p_event_name: string
          p_expected_return_at: string
        }
        Returns: undefined
      }
      reconcile_zavoz_deduction_for_item: {
        Args: {
          p_beer_id: string
          p_order_item_id: string
          p_package_id: string
          p_quantity: number
        }
        Returns: undefined
      }
      replace_order_with_items: {
        Args: { p_items: Json; p_order: Json; p_order_id: string }
        Returns: undefined
      }
      run_today_zavoz_deductions: { Args: never; Returns: number }
      save_inventory_snapshot: {
        Args: { p_entry_date: string; p_rows: Json; p_snapshot_type: string }
        Returns: number
      }
      save_physical_inventory: {
        Args: { p_adjustments: Json; p_entry_date: string; p_rows: Json }
        Returns: number
      }
      set_order_status: {
        Args: { p_order_id: string; p_status: string }
        Returns: undefined
      }
      smaz_odpocty_polozky: {
        Args: { p_order_item_id: string }
        Returns: undefined
      }
      spust_migraci: {
        Args: { p_nazev: string; p_sql: string; p_zdroj?: string }
        Returns: Json
      }
      srovnat_odpocty_objednavky: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      srovnat_odpocty_objednavky_rucne: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      trigger_whatsapp_auto_parse: { Args: never; Returns: undefined }
      ucinny_den_zavozu: {
        Args: {
          p_delivery_date: string
          p_delivery_day: string
          p_order_date: string
        }
        Returns: string
      }
      user_can_edit_module: { Args: { p_module: string }; Returns: boolean }
      wake_whatsapp_bridge: { Args: never; Returns: undefined }
      whatsapp_norm: { Args: { s: string }; Returns: string }
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
