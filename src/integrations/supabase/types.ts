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
      app_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      cash_registers: {
        Row: {
          cashier_id: string | null
          closed_at: string | null
          closed_by: string | null
          closing_cash: number | null
          created_at: string
          difference: number | null
          expected_cash: number | null
          id: string
          note_close: string | null
          note_open: string | null
          opened_at: string
          opened_by: string | null
          opening_float: number
          showroom_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cashier_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          created_at?: string
          difference?: number | null
          expected_cash?: number | null
          id?: string
          note_close?: string | null
          note_open?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_float?: number
          showroom_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cashier_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          created_at?: string
          difference?: number | null
          expected_cash?: number | null
          id?: string
          note_close?: string | null
          note_open?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_float?: number
          showroom_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address: string | null
          created_at: string
          currency: string | null
          email: string | null
          footer_note: string | null
          id: string
          is_current: boolean
          logo_url: string | null
          name: string | null
          phone: string | null
          settings: Json
          tagline: string | null
          updated_at: string
          vat_reg: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          currency?: string | null
          email?: string | null
          footer_note?: string | null
          id?: string
          is_current?: boolean
          logo_url?: string | null
          name?: string | null
          phone?: string | null
          settings?: Json
          tagline?: string | null
          updated_at?: string
          vat_reg?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          currency?: string | null
          email?: string | null
          footer_note?: string | null
          id?: string
          is_current?: boolean
          logo_url?: string | null
          name?: string | null
          phone?: string | null
          settings?: Json
          tagline?: string | null
          updated_at?: string
          vat_reg?: string | null
        }
        Relationships: []
      }
      customer_groups: {
        Row: {
          created_at: string
          discount_pct: number
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          pricing_mode: string
          selling_price_group_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_pct?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          pricing_mode?: string
          selling_price_group_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_pct?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          pricing_mode?: string
          selling_price_group_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_groups_selling_price_group_id_fkey"
            columns: ["selling_price_group_id"]
            isOneToOne: false
            referencedRelation: "selling_price_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          invoice_ref: string | null
          method: string | null
          note: string | null
          paid_on: string
          reference: string | null
          sale_id: string | null
          showroom_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          invoice_ref?: string | null
          method?: string | null
          note?: string | null
          paid_on?: string
          reference?: string | null
          sale_id?: string | null
          showroom_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          invoice_ref?: string | null
          method?: string | null
          note?: string | null
          paid_on?: string
          reference?: string | null
          sale_id?: string | null
          showroom_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          avatar_url: string | null
          created_at: string
          email: string | null
          group_id: string | null
          id: string
          is_active: boolean
          loyalty_points: number
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          loyalty_points?: number
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          loyalty_points?: number
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "customer_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      damaged_ledger: {
        Row: {
          created_at: string
          id: string
          kind: string
          note: string | null
          product_id: string
          qty: number
          ref_id: string | null
          ref_type: string | null
          showroom_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          note?: string | null
          product_id: string
          qty: number
          ref_id?: string | null
          ref_type?: string | null
          showroom_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          product_id?: string
          qty?: number
          ref_id?: string | null
          ref_type?: string | null
          showroom_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "damaged_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damaged_ledger_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      damaged_stock: {
        Row: {
          id: string
          product_id: string
          quantity: number
          showroom_id: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          product_id: string
          quantity?: number
          showroom_id?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          quantity?: number
          showroom_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "damaged_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damaged_stock_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          attendance: number | null
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          designation: string | null
          email: string | null
          emergency_contact: string | null
          emergency_phone: string | null
          gender: string | null
          id: string
          is_active: boolean
          joining_date: string | null
          name: string
          national_id: string | null
          notes: string | null
          phone: string | null
          role: string | null
          role_id: string | null
          salary: number | null
          showroom_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          attendance?: number | null
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          designation?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          gender?: string | null
          id?: string
          is_active?: boolean
          joining_date?: string | null
          name: string
          national_id?: string | null
          notes?: string | null
          phone?: string | null
          role?: string | null
          role_id?: string | null
          salary?: number | null
          showroom_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          attendance?: number | null
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          designation?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          gender?: string | null
          id?: string
          is_active?: boolean
          joining_date?: string | null
          name?: string
          national_id?: string | null
          notes?: string | null
          phone?: string | null
          role?: string | null
          role_id?: string | null
          salary?: number | null
          showroom_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "app_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          expense_date: string
          id: string
          note: string | null
          showroom_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          note?: string | null
          showroom_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          note?: string | null
          showroom_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      held_sales: {
        Row: {
          cashier_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          discount: number
          id: string
          item_count: number
          items: Json
          label: string | null
          note: string | null
          showroom_id: string | null
          snapshot: Json
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          cashier_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          id?: string
          item_count?: number
          items?: Json
          label?: string | null
          note?: string | null
          showroom_id?: string | null
          snapshot?: Json
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          cashier_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          id?: string
          item_count?: number
          items?: Json
          label?: string | null
          note?: string | null
          showroom_id?: string | null
          snapshot?: Json
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "held_sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "held_sales_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_carousels: {
        Row: {
          created_at: string
          id: string
          image_url: string
          is_active: boolean
          link_url: string | null
          sort_order: number
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          is_active?: boolean
          link_url?: string | null
          sort_order?: number
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          is_active?: boolean
          link_url?: string | null
          sort_order?: number
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      landing_content: {
        Row: {
          content: Json
          created_at: string
          id: string
          is_current: boolean
          section: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          is_current?: boolean
          section?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          is_current?: boolean
          section?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          code: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          due_date: string | null
          id: string
          items: Json
          note: string | null
          order_type: string | null
          showroom_id: string | null
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          due_date?: string | null
          id?: string
          items?: Json
          note?: string | null
          order_type?: string | null
          showroom_id?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          due_date?: string | null
          id?: string
          items?: Json
          note?: string | null
          order_type?: string | null
          showroom_id?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          id: string
          label: string | null
          module: string | null
          permission_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          module?: string | null
          permission_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          module?: string | null
          permission_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_selling_prices: {
        Row: {
          created_at: string
          id: string
          price: number
          product_id: string
          selling_price_group_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          price?: number
          product_id: string
          selling_price_group_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          price?: number
          product_id?: string
          selling_price_group_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_selling_prices_price_group_id_fkey"
            columns: ["selling_price_group_id"]
            isOneToOne: false
            referencedRelation: "selling_price_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_selling_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_stock: {
        Row: {
          created_at: string
          id: string
          min_stock: number
          product_id: string
          quantity: number
          showroom_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_stock?: number
          product_id: string
          quantity?: number
          showroom_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          min_stock?: number
          product_id?: string
          quantity?: number
          showroom_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stock_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      production_overhead_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      production_overheads: {
        Row: {
          amount: number
          batch_id: string
          category_id: string
          created_at: string
          id: string
          note: string | null
          product_id: string | null
        }
        Insert: {
          amount: number
          batch_id: string
          category_id: string
          created_at?: string
          id?: string
          note?: string | null
          product_id?: string | null
        }
        Update: {
          amount?: number
          batch_id?: string
          category_id?: string
          created_at?: string
          id?: string
          note?: string | null
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_overheads_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "production_overhead_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_overheads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category: string | null
          category_id: string | null
          cost: number
          created_at: string
          description: string | null
          expiry_date: string | null
          id: string
          image_url: string | null
          is_active: boolean
          mfg_date: string | null
          name: string
          price: number
          shelf_life_days: number | null
          show_on_landing: boolean
          sku: string | null
          threshold: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          category?: string | null
          category_id?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          mfg_date?: string | null
          name: string
          price?: number
          shelf_life_days?: number | null
          show_on_landing?: boolean
          sku?: string | null
          threshold?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          category?: string | null
          category_id?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          mfg_date?: string | null
          name?: string
          price?: number
          shelf_life_days?: number | null
          show_on_landing?: boolean
          sku?: string | null
          threshold?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          created_at: string
          id: string
          material_id: string | null
          name: string | null
          price: number
          product_id: string | null
          purchase_id: string | null
          qty: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id?: string | null
          name?: string | null
          price?: number
          product_id?: string | null
          purchase_id?: string | null
          qty?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string | null
          name?: string | null
          price?: number
          product_id?: string | null
          purchase_id?: string | null
          qty?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_return_items: {
        Row: {
          created_at: string
          id: string
          material_id: string | null
          name: string | null
          price: number
          product_id: string | null
          qty: number
          return_id: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id?: string | null
          name?: string | null
          price?: number
          product_id?: string | null
          qty?: number
          return_id?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string | null
          name?: string | null
          price?: number
          product_id?: string | null
          qty?: number
          return_id?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_return_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "purchase_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_returns: {
        Row: {
          amount: number
          code: string | null
          created_at: string
          created_by: string | null
          id: string
          invoice_ref: string | null
          note: string | null
          purchase_id: string | null
          reason: string | null
          showroom_id: string | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_ref?: string | null
          note?: string | null
          purchase_id?: string | null
          reason?: string | null
          showroom_id?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_ref?: string | null
          note?: string | null
          purchase_id?: string | null
          reason?: string | null
          showroom_id?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_returns_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          category_id: string | null
          code: string | null
          created_at: string
          created_by: string | null
          discount: number
          due: number
          id: string
          paid: number
          payment: string | null
          purchase_date: string
          showroom_id: string | null
          status: string
          subtotal: number
          supplier_id: string | null
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          due?: number
          id?: string
          paid?: number
          payment?: string | null
          purchase_date?: string
          showroom_id?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          due?: number
          id?: string
          paid?: number
          payment?: string | null
          purchase_date?: string
          showroom_id?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "purchase_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_checks: {
        Row: {
          batch_id: string | null
          checked_at: string
          created_at: string
          id: string
          notes: string | null
          product_id: string | null
          result: string
          showroom_id: string | null
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          checked_at?: string
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          result?: string
          showroom_id?: string | null
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          checked_at?: string
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          result?: string
          showroom_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qc_checks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_checks_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_material_stock: {
        Row: {
          created_at: string
          id: string
          material_id: string
          min_stock: number
          quantity: number
          showroom_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          min_stock?: number
          quantity?: number
          showroom_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          min_stock?: number
          quantity?: number
          showroom_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_material_stock_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_material_stock_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_materials: {
        Row: {
          cost: number
          created_at: string
          id: string
          is_active: boolean
          min_stock: number
          name: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          cost?: number
          created_at?: string
          id?: string
          is_active?: boolean
          min_stock?: number
          name: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          cost?: number
          created_at?: string
          id?: string
          is_active?: boolean
          min_stock?: number
          name?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      raw_stock_ledger: {
        Row: {
          created_at: string
          id: string
          kind: string | null
          material_id: string | null
          note: string | null
          qty: number
          ref_id: string | null
          ref_type: string | null
          showroom_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string | null
          material_id?: string | null
          note?: string | null
          qty: number
          ref_id?: string | null
          ref_type?: string | null
          showroom_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string | null
          material_id?: string | null
          note?: string | null
          qty?: number
          ref_id?: string | null
          ref_type?: string | null
          showroom_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_stock_ledger_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_stock_ledger_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      recipe_overheads: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          id: string
          mode: string
          product_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category_id: string
          created_at?: string
          id?: string
          mode?: string
          product_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          id?: string
          mode?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_overheads_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "production_overhead_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_overheads_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          material_id: string
          product_id: string
          qty: number
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          material_id: string
          product_id: string
          qty?: number
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          material_id?: string
          product_id?: string
          qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "recipe_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      repurpose_queue: {
        Row: {
          converted_material_id: string | null
          created_at: string
          id: string
          note: string | null
          processed_at: string | null
          product_id: string
          qty: number
          source_showroom_id: string | null
          status: string
          transfer_id: string | null
          wastage_qty: number | null
          yield_qty: number | null
        }
        Insert: {
          converted_material_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          processed_at?: string | null
          product_id: string
          qty: number
          source_showroom_id?: string | null
          status?: string
          transfer_id?: string | null
          wastage_qty?: number | null
          yield_qty?: number | null
        }
        Update: {
          converted_material_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          processed_at?: string | null
          product_id?: string
          qty?: number
          source_showroom_id?: string | null
          status?: string
          transfer_id?: string | null
          wastage_qty?: number | null
          yield_qty?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "repurpose_queue_converted_material_id_fkey"
            columns: ["converted_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repurpose_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repurpose_queue_source_showroom_id_fkey"
            columns: ["source_showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repurpose_queue_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_key: string
          role_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_key: string
          role_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_key?: string
          role_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "app_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          product_id: string | null
          product_name: string | null
          product_sku: string | null
          qty: number
          sale_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number
          product_id?: string | null
          product_name?: string | null
          product_sku?: string | null
          qty?: number
          sale_id: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          product_id?: string | null
          product_name?: string | null
          product_sku?: string | null
          qty?: number
          sale_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          reference: string | null
          sale_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          method: string
          reference?: string | null
          sale_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          reference?: string | null
          sale_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_return_items: {
        Row: {
          condition: string | null
          created_at: string
          id: string
          line_total: number
          product_id: string | null
          product_name: string | null
          qty: number
          return_id: string | null
          sale_item_id: string | null
          updated_at: string
        }
        Insert: {
          condition?: string | null
          created_at?: string
          id?: string
          line_total?: number
          product_id?: string | null
          product_name?: string | null
          qty?: number
          return_id?: string | null
          sale_item_id?: string | null
          updated_at?: string
        }
        Update: {
          condition?: string | null
          created_at?: string
          id?: string
          line_total?: number
          product_id?: string | null
          product_name?: string | null
          qty?: number
          return_id?: string | null
          sale_item_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sale_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_returns: {
        Row: {
          amount: number
          code: string | null
          created_at: string
          created_by: string | null
          customer_name: string | null
          id: string
          invoice_ref: string | null
          note: string | null
          reason: string | null
          sale_id: string | null
          showroom_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          code?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          id?: string
          invoice_ref?: string | null
          note?: string | null
          reason?: string | null
          sale_id?: string | null
          showroom_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          code?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          id?: string
          invoice_ref?: string | null
          note?: string | null
          reason?: string | null
          sale_id?: string | null
          showroom_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          cashier_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          discount: number
          due: number
          external_ref: string | null
          id: string
          paid: number
          payment_mode: string | null
          register_id: string | null
          shipping: number
          showroom_id: string | null
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          cashier_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          due?: number
          external_ref?: string | null
          id?: string
          paid?: number
          payment_mode?: string | null
          register_id?: string | null
          shipping?: number
          showroom_id?: string | null
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          cashier_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          due?: number
          external_ref?: string | null
          id?: string
          paid?: number
          payment_mode?: string | null
          register_id?: string | null
          shipping?: number
          showroom_id?: string | null
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      selling_price_groups: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      showrooms: {
        Row: {
          address: string | null
          city: string | null
          code: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_factory: boolean | null
          manager_name: string | null
          name: string
          phone: string | null
          settings: Json
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_factory?: boolean | null
          manager_name?: string | null
          name: string
          phone?: string | null
          settings?: Json
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_factory?: boolean | null
          manager_name?: string | null
          name?: string
          phone?: string | null
          settings?: Json
          updated_at?: string
        }
        Relationships: []
      }
      stock_ledger: {
        Row: {
          created_at: string
          id: string
          kind: string | null
          note: string | null
          product_id: string | null
          qty: number
          ref_id: string | null
          ref_type: string | null
          showroom_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string | null
          note?: string | null
          product_id?: string | null
          qty: number
          ref_id?: string | null
          ref_type?: string | null
          showroom_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string | null
          note?: string | null
          product_id?: string | null
          qty?: number
          ref_id?: string | null
          ref_type?: string | null
          showroom_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          method: string | null
          note: string | null
          paid_on: string
          purchase_id: string | null
          reference: string | null
          showroom_id: string | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string | null
          note?: string | null
          paid_on?: string
          purchase_id?: string | null
          reference?: string | null
          showroom_id?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string | null
          note?: string | null
          paid_on?: string
          purchase_id?: string | null
          reference?: string | null
          showroom_id?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transfer_items: {
        Row: {
          created_at: string
          id: string
          material_id: string | null
          product_id: string | null
          qty: number
          transfer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id?: string | null
          product_id?: string | null
          qty?: number
          transfer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string | null
          product_id?: string | null
          qty?: number
          transfer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          dest_showroom_id: string | null
          id: string
          kind: string | null
          note: string | null
          received_at: string | null
          sent_at: string | null
          source_showroom_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          dest_showroom_id?: string | null
          id?: string
          kind?: string | null
          note?: string | null
          received_at?: string | null
          sent_at?: string | null
          source_showroom_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          dest_showroom_id?: string | null
          id?: string
          kind?: string | null
          note?: string | null
          received_at?: string | null
          sent_at?: string | null
          source_showroom_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_from_showroom_id_fkey"
            columns: ["source_showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_showroom_id_fkey"
            columns: ["dest_showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          short_name: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          short_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          email: string | null
          id: string
          language: string | null
          name: string | null
          phone: string | null
          software: Json
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string | null
          id?: string
          language?: string | null
          name?: string | null
          phone?: string | null
          software?: Json
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string | null
          id?: string
          language?: string | null
          name?: string | null
          phone?: string | null
          software?: Json
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_role_assignments: {
        Row: {
          created_at: string
          id: string
          role_id: string | null
          showroom_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_id?: string | null
          showroom_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role_id?: string | null
          showroom_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "app_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_role_assignments_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wastage_log: {
        Row: {
          created_at: string
          id: string
          logged_at: string
          material_id: string | null
          notes: string | null
          product_id: string | null
          qty: number
          reason: string | null
          ref_ledger_id: string | null
          showroom_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logged_at?: string
          material_id?: string | null
          notes?: string | null
          product_id?: string | null
          qty?: number
          reason?: string | null
          ref_ledger_id?: string | null
          showroom_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logged_at?: string
          material_id?: string | null
          notes?: string | null
          product_id?: string | null
          qty?: number
          reason?: string | null
          ref_ledger_id?: string | null
          showroom_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wastage_log_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wastage_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wastage_log_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          assigned_to: string | null
          batch_id: string | null
          batch_qty: number
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          planned_date: string | null
          product_id: string | null
          showroom_id: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          batch_id?: string | null
          batch_qty?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          planned_date?: string | null
          product_id?: string | null
          showroom_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          batch_id?: string | null
          batch_qty?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          planned_date?: string | null
          product_id?: string | null
          showroom_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      commit_damaged_movement: {
        Args: {
          _kind: string
          _note?: string
          _product_id: string
          _qty: number
          _ref_id?: string
          _ref_type?: string
          _showroom_id: string
        }
        Returns: string
      }
      commit_damaged_transfer_approve: {
        Args: { _transfer_id: string }
        Returns: undefined
      }
      commit_production_batch:
        | {
            Args: {
              _batch: number
              _ingredients: Json
              _product_id: string
              _showroom_id: string
            }
            Returns: string
          }
        | {
            Args: {
              _batch: number
              _ingredients: Json
              _overheads?: Json
              _product_id: string
              _showroom_id: string
            }
            Returns: string
          }
      commit_raw_stock_movement: {
        Args: {
          _kind: string
          _material_id: string
          _note?: string
          _qty: number
          _ref_id?: string
          _ref_type?: string
          _showroom_id: string
        }
        Returns: string
      }
      commit_repurpose: {
        Args: {
          _material_id: string
          _note?: string
          _queue_id: string
          _wastage_qty: number
          _yield_qty: number
        }
        Returns: undefined
      }
      commit_stock_movement: {
        Args: {
          _kind: string
          _note?: string
          _product_id: string
          _qty: number
          _ref_id?: string
          _ref_type?: string
          _showroom_id: string
        }
        Returns: string
      }
      find_user_id_by_email: { Args: { _email: string }; Returns: string }
      get_effective_invoice_settings: {
        Args: { _showroom_id: string }
        Returns: Json
      }
      get_invoice_bundle: { Args: { _sale_id: string }; Returns: Json }
      has_any_user: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_bootstrap_superadmin: { Args: { _user: string }; Returns: boolean }
      user_has_showroom_access: {
        Args: { _showroom: string; _user: string }
        Returns: boolean
      }
      user_is_global_admin: { Args: { _user: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "superadmin"
        | "owner"
        | "admin"
        | "manager"
        | "cashier"
        | "staff"
        | "employee"
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
        "superadmin",
        "owner",
        "admin",
        "manager",
        "cashier",
        "staff",
        "employee",
      ],
    },
  },
} as const
