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
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address: string
          created_at: string
          email: string | null
          footer_note: string | null
          id: string
          is_current: boolean
          logo_url: string | null
          name: string
          phone: string | null
          tagline: string | null
          updated_at: string
          updated_by: string | null
          vat_reg: string | null
        }
        Insert: {
          address?: string
          created_at?: string
          email?: string | null
          footer_note?: string | null
          id?: string
          is_current?: boolean
          logo_url?: string | null
          name?: string
          phone?: string | null
          tagline?: string | null
          updated_at?: string
          updated_by?: string | null
          vat_reg?: string | null
        }
        Update: {
          address?: string
          created_at?: string
          email?: string | null
          footer_note?: string | null
          id?: string
          is_current?: boolean
          logo_url?: string | null
          name?: string
          phone?: string | null
          tagline?: string | null
          updated_at?: string
          updated_by?: string | null
          vat_reg?: string | null
        }
        Relationships: []
      }
      customer_groups: {
        Row: {
          created_at: string
          created_by: string | null
          discount_pct: number
          id: string
          is_active: boolean
          is_default: boolean
          mode: string
          name: string
          selling_price_group_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          discount_pct?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          mode?: string
          name: string
          selling_price_group_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          discount_pct?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          mode?: string
          name?: string
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
          method: string
          note: string | null
          paid_on: string
          reference: string | null
          sale_id: string | null
          showroom_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          invoice_ref?: string | null
          method?: string
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
          method?: string
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
          created_by: string | null
          email: string | null
          group_id: string | null
          id: string
          is_active: boolean
          loyalty_points: number
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          loyalty_points?: number
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          loyalty_points?: number
          name?: string
          notes?: string | null
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
      employees: {
        Row: {
          attendance: number
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          note: string | null
          phone: string | null
          role: string
          salary: number
          showroom_id: string | null
          updated_at: string
        }
        Insert: {
          attendance?: number
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          note?: string | null
          phone?: string | null
          role?: string
          salary?: number
          showroom_id?: string | null
          updated_at?: string
        }
        Update: {
          attendance?: number
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          note?: string | null
          phone?: string | null
          role?: string
          salary?: number
          showroom_id?: string | null
          updated_at?: string
        }
        Relationships: [
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
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          expense_date: string
          id: string
          paid_by: string | null
          showroom_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          paid_by?: string | null
          showroom_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          paid_by?: string | null
          showroom_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_showroom_id_fkey"
            columns: ["showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_content: {
        Row: {
          content: Json
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content: Json
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: Json
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          customer_name: string
          customer_phone: string | null
          due_date: string | null
          id: string
          items: string
          note: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          showroom_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          total: number
          updated_at: string
        }
        Insert: {
          code?: string
          created_at?: string
          created_by?: string | null
          customer_name: string
          customer_phone?: string | null
          due_date?: string | null
          id?: string
          items: string
          note?: string | null
          order_type?: Database["public"]["Enums"]["order_type"]
          showroom_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          customer_name?: string
          customer_phone?: string | null
          due_date?: string | null
          id?: string
          items?: string
          note?: string | null
          order_type?: Database["public"]["Enums"]["order_type"]
          showroom_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total?: number
          updated_at?: string
        }
        Relationships: [
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
          description: string | null
          key: string
          label: string
          module: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          label: string
          module: string
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          label?: string
          module?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_stock: {
        Row: {
          id: string
          min_stock: number
          product_id: string
          quantity: number
          showroom_id: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          min_stock?: number
          product_id: string
          quantity?: number
          showroom_id?: string | null
          updated_at?: string
        }
        Update: {
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
      products: {
        Row: {
          barcode: string | null
          category: string | null
          cost: number
          created_at: string
          created_by: string | null
          expiry_date: string | null
          id: string
          image_url: string | null
          is_active: boolean
          mfg_date: string | null
          name: string
          price: number
          shelf_life_days: number | null
          sku: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          category?: string | null
          cost?: number
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          mfg_date?: string | null
          name: string
          price?: number
          shelf_life_days?: number | null
          sku?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          category?: string | null
          cost?: number
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          mfg_date?: string | null
          name?: string
          price?: number
          shelf_life_days?: number | null
          sku?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: []
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
          name: string
          price: number
          purchase_id: string
          qty: number
          unit: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          material_id?: string | null
          name: string
          price?: number
          purchase_id: string
          qty?: number
          unit?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string | null
          name?: string
          price?: number
          purchase_id?: string
          qty?: number
          unit?: string | null
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
          line_total: number
          material_id: string | null
          material_name: string
          qty: number
          return_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number
          material_id?: string | null
          material_name: string
          qty: number
          return_id: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          material_id?: string | null
          material_name?: string
          qty?: number
          return_id?: string
          unit_price?: number
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
          code: string
          created_at: string
          created_by: string | null
          id: string
          invoice_ref: string | null
          note: string | null
          purchase_id: string | null
          reason: Database["public"]["Enums"]["purchase_return_reason"]
          showroom_id: string | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_ref?: string | null
          note?: string | null
          purchase_id?: string | null
          reason?: Database["public"]["Enums"]["purchase_return_reason"]
          showroom_id?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_ref?: string | null
          note?: string | null
          purchase_id?: string | null
          reason?: Database["public"]["Enums"]["purchase_return_reason"]
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
          note: string | null
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
          note?: string | null
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
          note?: string | null
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
      raw_material_stock: {
        Row: {
          id: string
          material_id: string
          quantity: number
          showroom_id: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          material_id: string
          quantity?: number
          showroom_id?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          material_id?: string
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
          category: string | null
          cost: number
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          min_stock: number
          name: string
          sku: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          cost?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          min_stock?: number
          name: string
          sku?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          cost?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          min_stock?: number
          name?: string
          sku?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      raw_stock_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["raw_stock_move_kind"]
          material_id: string
          note: string | null
          qty: number
          ref_id: string | null
          ref_type: string | null
          showroom_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["raw_stock_move_kind"]
          material_id: string
          note?: string | null
          qty: number
          ref_id?: string | null
          ref_type?: string | null
          showroom_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["raw_stock_move_kind"]
          material_id?: string
          note?: string | null
          qty?: number
          ref_id?: string | null
          ref_type?: string | null
          showroom_id?: string | null
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
      recipes: {
        Row: {
          created_at: string
          id: string
          material_id: string
          product_id: string
          qty: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          product_id: string
          qty: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          product_id?: string
          qty?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
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
      role_permissions: {
        Row: {
          created_at: string
          permission_key: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_key: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
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
          product_name: string
          product_sku: string | null
          qty: number
          sale_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total: number
          product_id?: string | null
          product_name: string
          product_sku?: string | null
          qty: number
          sale_id: string
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          product_id?: string | null
          product_name?: string
          product_sku?: string | null
          qty?: number
          sale_id?: string
          unit_price?: number
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
      sale_return_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          product_id: string | null
          product_name: string
          qty: number
          return_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number
          product_id?: string | null
          product_name: string
          qty: number
          return_id: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          product_id?: string | null
          product_name?: string
          qty?: number
          return_id?: string
          unit_price?: number
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
        ]
      }
      sale_returns: {
        Row: {
          amount: number
          code: string
          created_at: string
          created_by: string | null
          customer_name: string | null
          id: string
          invoice_ref: string | null
          note: string | null
          reason: Database["public"]["Enums"]["sale_return_reason"]
          sale_id: string | null
          showroom_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          code: string
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          id?: string
          invoice_ref?: string | null
          note?: string | null
          reason?: Database["public"]["Enums"]["sale_return_reason"]
          sale_id?: string | null
          showroom_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          code?: string
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          id?: string
          invoice_ref?: string | null
          note?: string | null
          reason?: Database["public"]["Enums"]["sale_return_reason"]
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
          customer_name: string | null
          customer_phone: string | null
          discount: number
          due: number
          external_ref: string | null
          id: string
          note: string | null
          paid: number
          payment_mode: string
          showroom_id: string | null
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          cashier_id?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          due?: number
          external_ref?: string | null
          id?: string
          note?: string | null
          paid?: number
          payment_mode?: string
          showroom_id?: string | null
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          cashier_id?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          due?: number
          external_ref?: string | null
          id?: string
          note?: string | null
          paid?: number
          payment_mode?: string
          showroom_id?: string | null
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
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
          manager_name: string | null
          name: string
          phone: string | null
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
          manager_name?: string | null
          name: string
          phone?: string | null
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
          manager_name?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      stock_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["stock_move_kind"]
          note: string | null
          product_id: string
          qty: number
          ref_id: string | null
          ref_type: string | null
          showroom_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["stock_move_kind"]
          note?: string | null
          product_id: string
          qty: number
          ref_id?: string | null
          ref_type?: string | null
          showroom_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["stock_move_kind"]
          note?: string | null
          product_id?: string
          qty?: number
          ref_id?: string | null
          ref_type?: string | null
          showroom_id?: string | null
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
          method: string
          note: string | null
          paid_on: string
          purchase_id: string | null
          reference: string | null
          showroom_id: string | null
          supplier_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          note?: string | null
          paid_on?: string
          purchase_id?: string | null
          reference?: string | null
          showroom_id?: string | null
          supplier_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          note?: string | null
          paid_on?: string
          purchase_id?: string | null
          reference?: string | null
          showroom_id?: string | null
          supplier_id?: string
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
          category: string | null
          contact: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          contact?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: string | null
          contact?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transfer_items: {
        Row: {
          id: string
          product_id: string
          qty: number
          transfer_id: string
        }
        Insert: {
          id?: string
          product_id: string
          qty: number
          transfer_id: string
        }
        Update: {
          id?: string
          product_id?: string
          qty?: number
          transfer_id?: string
        }
        Relationships: [
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
          dest_showroom_id: string
          id: string
          note: string | null
          received_at: string | null
          received_by: string | null
          sent_at: string | null
          sent_by: string | null
          source_showroom_id: string | null
          status: Database["public"]["Enums"]["transfer_status"]
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          dest_showroom_id: string
          id?: string
          note?: string | null
          received_at?: string | null
          received_by?: string | null
          sent_at?: string | null
          sent_by?: string | null
          source_showroom_id?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          dest_showroom_id?: string
          id?: string
          note?: string | null
          received_at?: string | null
          received_by?: string | null
          sent_at?: string | null
          sent_by?: string | null
          source_showroom_id?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_dest_showroom_id_fkey"
            columns: ["dest_showroom_id"]
            isOneToOne: false
            referencedRelation: "showrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_source_showroom_id_fkey"
            columns: ["source_showroom_id"]
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
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          email: string
          language: string
          name: string
          phone: string | null
          software: Json
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string
          language?: string
          name?: string
          phone?: string | null
          software?: Json
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string
          language?: string
          name?: string
          phone?: string | null
          software?: Json
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_role_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          role_id: string
          showroom_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          role_id: string
          showroom_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          role_id?: string
          showroom_id?: string | null
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
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      commit_raw_stock_movement: {
        Args: {
          _kind: Database["public"]["Enums"]["raw_stock_move_kind"]
          _material_id: string
          _note?: string
          _qty: number
          _ref_id?: string
          _ref_type?: string
          _showroom_id: string
        }
        Returns: string
      }
      commit_stock_movement: {
        Args: {
          _kind: Database["public"]["Enums"]["stock_move_kind"]
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
      has_any_app_role: { Args: { _user_id: string }; Returns: boolean }
      has_permission: {
        Args: { _key: string; _showroom?: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      user_has_showroom_access: {
        Args: { _showroom: string; _user_id: string }
        Returns: boolean
      }
      user_showroom_ids: { Args: { _user_id: string }; Returns: string[] }
    }
    Enums: {
      app_role: "owner" | "admin" | "manager" | "employee" | "superadmin"
      order_status:
        | "Pending"
        | "In Production"
        | "Ready"
        | "Delivered"
        | "Cancelled"
      order_type: "Retail" | "Wholesale" | "Custom Cake" | "Online"
      purchase_return_reason:
        | "damaged"
        | "wrong_item"
        | "expired"
        | "overstock"
        | "quality"
        | "other"
      raw_stock_move_kind:
        | "purchase"
        | "adjustment"
        | "production_consume"
        | "return"
        | "transfer_in"
        | "transfer_out"
      sale_return_reason:
        | "damaged"
        | "wrong_item"
        | "customer_request"
        | "expired"
        | "other"
      stock_move_kind:
        | "production"
        | "transfer_in"
        | "transfer_out"
        | "sale"
        | "adjustment"
        | "return"
        | "purchase"
      transfer_status: "draft" | "sent" | "received" | "cancelled"
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
      app_role: ["owner", "admin", "manager", "employee", "superadmin"],
      order_status: [
        "Pending",
        "In Production",
        "Ready",
        "Delivered",
        "Cancelled",
      ],
      order_type: ["Retail", "Wholesale", "Custom Cake", "Online"],
      purchase_return_reason: [
        "damaged",
        "wrong_item",
        "expired",
        "overstock",
        "quality",
        "other",
      ],
      raw_stock_move_kind: [
        "purchase",
        "adjustment",
        "production_consume",
        "return",
        "transfer_in",
        "transfer_out",
      ],
      sale_return_reason: [
        "damaged",
        "wrong_item",
        "customer_request",
        "expired",
        "other",
      ],
      stock_move_kind: [
        "production",
        "transfer_in",
        "transfer_out",
        "sale",
        "adjustment",
        "return",
        "purchase",
      ],
      transfer_status: ["draft", "sent", "received", "cancelled"],
    },
  },
} as const
