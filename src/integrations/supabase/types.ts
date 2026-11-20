export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      addresses: {
        Row: {
          id: string | null;
          customer_id: string | null;
          user_id: string | null;
          full_name: string | null;
          phone: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          country: string | null;
          address_type: string | null;
          is_default: boolean | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string | null;
          customer_id?: string | null;
          user_id?: string | null;
          full_name?: string | null;
          phone?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          country?: string | null;
          address_type?: string | null;
          is_default?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          customer_id?: string | null;
          user_id?: string | null;
          full_name?: string | null;
          phone?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          country?: string | null;
          address_type?: string | null;
          is_default?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      admin_audit_logs: {
        Row: {
          id: string;
          admin_user_id: string | null;
          admin_email: string | null;
          action: string;
          target_type: string;
          target_id: string;
          details: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_user_id?: string | null;
          admin_email?: string | null;
          action: string;
          target_type: string;
          target_id: string;
          details?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string | null;
          admin_user_id?: string | null;
          admin_email?: string | null;
          action?: string | null;
          target_type?: string | null;
          target_id?: string | null;
          details?: Json | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      admin_roles: {
        Row: {
          id: string;
          user_id: string | null;
          email: string;
          role: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          email: string;
          role?: string;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          user_id?: string | null;
          email?: string | null;
          role?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      admin_users: {
        Row: {
          id: string;
          auth_user_id: string | null;
          email: string;
          full_name: string;
          role: string;
          permissions: Json | null;
          is_active: boolean;
          last_login: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          email: string;
          full_name: string;
          role?: string;
          permissions?: Json | null;
          is_active?: boolean;
          last_login?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          auth_user_id?: string | null;
          email?: string | null;
          full_name?: string | null;
          role?: string | null;
          permissions?: Json | null;
          is_active?: boolean | null;
          last_login?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      admin_whitelist: {
        Row: {
          email: string;
          created_at: string | null;
        };
        Insert: {
          email: string;
          created_at?: string | null;
        };
        Update: {
          email?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      banners: {
        Row: {
          id: string;
          title: string;
          subtitle: string | null;
          image_url: string;
          link_url: string | null;
          button_text: string | null;
          placement: string;
          is_active: boolean;
          sort_order: number;
          start_date: string | null;
          end_date: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          subtitle?: string | null;
          image_url: string;
          link_url?: string | null;
          button_text?: string | null;
          placement?: string;
          is_active?: boolean;
          sort_order?: number;
          start_date?: string | null;
          end_date?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          title?: string | null;
          subtitle?: string | null;
          image_url?: string | null;
          link_url?: string | null;
          button_text?: string | null;
          placement?: string | null;
          is_active?: boolean | null;
          sort_order?: number | null;
          start_date?: string | null;
          end_date?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      cart_items: {
        Row: {
          id: string;
          cart_id: string;
          product_id: string;
          variant_id: string | null;
          quantity: number;
          unit_price: number;
          size: string | null;
          color: string | null;
          added_at: string | null;
          updated_at: string | null;
          product_slug: string | null;
        };
        Insert: {
          id?: string;
          cart_id: string;
          product_id: string;
          variant_id?: string | null;
          quantity?: number;
          unit_price?: number;
          size?: string | null;
          color?: string | null;
          added_at?: string | null;
          updated_at?: string | null;
          product_slug?: string | null;
        };
        Update: {
          id?: string | null;
          cart_id?: string | null;
          product_id?: string | null;
          variant_id?: string | null;
          quantity?: number | null;
          unit_price?: number | null;
          size?: string | null;
          color?: string | null;
          added_at?: string | null;
          updated_at?: string | null;
          product_slug?: string | null;
        };
        Relationships: [];
      };
      carts: {
        Row: {
          id: string;
          customer_id: string | null;
          customer_auth_uid: string | null;
          session_id: string | null;
          status: string;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          customer_id?: string | null;
          customer_auth_uid?: string | null;
          session_id?: string | null;
          status?: string;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          customer_id?: string | null;
          customer_auth_uid?: string | null;
          session_id?: string | null;
          status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string | null;
          slug: string | null;
          name: string | null;
          description: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string | null;
          slug?: string | null;
          name?: string | null;
          description?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          slug?: string | null;
          name?: string | null;
          description?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      contact_messages: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          email: string;
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          email: string;
          message: string;
          created_at?: string;
        };
        Update: {
          id?: string | null;
          user_id?: string | null;
          name?: string | null;
          email?: string | null;
          message?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      coupons: {
        Row: {
          id: string;
          code: string;
          discount_type: string;
          discount_value: number;
          min_order_value: number;
          max_discount: number | null;
          usage_limit: number | null;
          times_used: number;
          expires_at: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          discount_type: string;
          discount_value: number;
          min_order_value?: number;
          max_discount?: number | null;
          usage_limit?: number | null;
          times_used?: number;
          expires_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string | null;
          code?: string | null;
          discount_type?: string | null;
          discount_value?: number | null;
          min_order_value?: number | null;
          max_discount?: number | null;
          usage_limit?: number | null;
          times_used?: number | null;
          expires_at?: string | null;
          is_active?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      coupon_redemptions: {
        Row: {
          id: string;
          coupon_id: string;
          customer_id: string | null;
          order_id: string;
          discount_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          coupon_id: string;
          customer_id?: string | null;
          order_id: string;
          discount_amount?: number;
          created_at?: string;
        };
        Update: {
          id?: string | null;
          coupon_id?: string | null;
          customer_id?: string | null;
          order_id?: string | null;
          discount_amount?: number | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      customer_addresses: {
        Row: {
          id: string;
          customer_id: string | null;
          customer_auth_uid: string | null;
          address_type: string;
          is_default: boolean;
          full_name: string;
          phone: string;
          address_line1: string;
          address_line2: string | null;
          city: string;
          state: string;
          postal_code: string;
          country: string;
          landmark: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          customer_id?: string | null;
          customer_auth_uid?: string | null;
          address_type?: string;
          is_default?: boolean;
          full_name: string;
          phone: string;
          address_line1: string;
          address_line2?: string | null;
          city: string;
          state: string;
          postal_code: string;
          country?: string;
          landmark?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          customer_id?: string | null;
          customer_auth_uid?: string | null;
          address_type?: string | null;
          is_default?: boolean | null;
          full_name?: string | null;
          phone?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          country?: string | null;
          landmark?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      customer_auth_providers: {
        Row: {
          id: string;
          customer_id: string | null;
          provider: string;
          provider_uid: string;
          email: string | null;
          phone: string | null;
          metadata: Json | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          customer_id?: string | null;
          provider: string;
          provider_uid: string;
          email?: string | null;
          phone?: string | null;
          metadata?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          customer_id?: string | null;
          provider?: string | null;
          provider_uid?: string | null;
          email?: string | null;
          phone?: string | null;
          metadata?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      customer_carts: {
        Row: {
          user_id: string;
          items: Json;
          wishlist: Json;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          items?: Json;
          wishlist?: Json;
          updated_at?: string;
        };
        Update: {
          user_id?: string | null;
          items?: Json | null;
          wishlist?: Json | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      customer_profiles: {
        Row: {
          id: string;
          full_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string | null;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      customer_welcome: {
        Row: {
          user_id: string;
          welcome_seen_at: string;
        };
        Insert: {
          user_id: string;
          welcome_seen_at?: string;
        };
        Update: {
          user_id?: string | null;
          welcome_seen_at?: string | null;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          auth_provider_uid: string | null;
          full_name: string;
          email: string | null;
          phone: string | null;
          profile_image: string | null;
          account_status: string;
          registration_date: string | null;
          last_login: string | null;
          metadata: Json | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          auth_provider_uid?: string | null;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          profile_image?: string | null;
          account_status?: string;
          registration_date?: string | null;
          last_login?: string | null;
          metadata?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          auth_provider_uid?: string | null;
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
          profile_image?: string | null;
          account_status?: string | null;
          registration_date?: string | null;
          last_login?: string | null;
          metadata?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      inventory: {
        Row: {
          id: string;
          product_id: string;
          variant_id: string | null;
          sku: string | null;
          stock_quantity: number;
          reserved_quantity: number;
          safety_stock: number;
          reorder_point: number;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          product_id: string;
          variant_id?: string | null;
          sku?: string | null;
          stock_quantity?: number;
          reserved_quantity?: number;
          safety_stock?: number;
          reorder_point?: number;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          product_id?: string | null;
          variant_id?: string | null;
          sku?: string | null;
          stock_quantity?: number | null;
          reserved_quantity?: number | null;
          safety_stock?: number | null;
          reorder_point?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      inventory_movements: {
        Row: {
          id: string;
          product_id: string | null;
          product_slug: string;
          size: string;
          color: string | null;
          change_qty: number;
          new_stock: number;
          reason: string;
          reference_id: string | null;
          admin_user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id?: string | null;
          product_slug: string;
          size: string;
          color?: string | null;
          change_qty: number;
          new_stock: number;
          reason: string;
          reference_id?: string | null;
          admin_user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string | null;
          product_id?: string | null;
          product_slug?: string | null;
          size?: string | null;
          color?: string | null;
          change_qty?: number | null;
          new_stock?: number | null;
          reason?: string | null;
          reference_id?: string | null;
          admin_user_id?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      inventory_reservations: {
        Row: {
          id: string;
          order_id: string | null;
          variant_id: string;
          quantity: number;
          status: string;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id?: string | null;
          variant_id: string;
          quantity: number;
          status?: string;
          expires_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string | null;
          order_id?: string | null;
          variant_id?: string | null;
          quantity?: number | null;
          status?: string | null;
          expires_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      inventory_transactions: {
        Row: {
          id: string;
          product_id: string | null;
          variant_id: string | null;
          transaction_type: string;
          quantity: number;
          previous_quantity: number | null;
          new_quantity: number | null;
          reference_id: string | null;
          reason: string | null;
          created_by: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          product_id?: string | null;
          variant_id?: string | null;
          transaction_type: string;
          quantity: number;
          previous_quantity?: number | null;
          new_quantity?: number | null;
          reference_id?: string | null;
          reason?: string | null;
          created_by?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          product_id?: string | null;
          variant_id?: string | null;
          transaction_type?: string | null;
          quantity?: number | null;
          previous_quantity?: number | null;
          new_quantity?: number | null;
          reference_id?: string | null;
          reason?: string | null;
          created_by?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      newsletter_subscribers: {
        Row: {
          id: string;
          email: string;
          user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string | null;
          email?: string | null;
          user_id?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          customer_id: string | null;
          customer_auth_uid: string | null;
          title: string;
          message: string;
          type: string;
          link: string | null;
          is_read: boolean;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          customer_id?: string | null;
          customer_auth_uid?: string | null;
          title: string;
          message: string;
          type?: string;
          link?: string | null;
          is_read?: boolean;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          customer_id?: string | null;
          customer_auth_uid?: string | null;
          title?: string | null;
          message?: string | null;
          type?: string | null;
          link?: string | null;
          is_read?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      order_addresses: {
        Row: {
          id: string;
          order_id: string;
          address_type: string;
          full_name: string;
          phone: string;
          email: string | null;
          address_line1: string;
          address_line2: string | null;
          city: string;
          state: string;
          postal_code: string;
          country: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          address_type?: string;
          full_name: string;
          phone: string;
          email?: string | null;
          address_line1: string;
          address_line2?: string | null;
          city: string;
          state: string;
          postal_code: string;
          country?: string;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          order_id?: string | null;
          address_type?: string | null;
          full_name?: string | null;
          phone?: string | null;
          email?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          country?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_slug: string;
          name: string;
          size: string;
          color: string;
          price: number;
          qty: number;
          image: string | null;
          product_id: string | null;
          variant_id: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_slug: string;
          name: string;
          size: string;
          color: string;
          price: number;
          qty: number;
          image?: string | null;
          product_id?: string | null;
          variant_id?: string | null;
        };
        Update: {
          id?: string | null;
          order_id?: string | null;
          product_slug?: string | null;
          name?: string | null;
          size?: string | null;
          color?: string | null;
          price?: number | null;
          qty?: number | null;
          image?: string | null;
          product_id?: string | null;
          variant_id?: string | null;
        };
        Relationships: [];
      };
      order_status_history: {
        Row: {
          id: string;
          order_id: string;
          status: string;
          comment: string | null;
          changed_by: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          status: string;
          comment?: string | null;
          changed_by?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          order_id?: string | null;
          status?: string | null;
          comment?: string | null;
          changed_by?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          user_id: string | null;
          items: Json;
          total: number;
          created_at: string;
          order_number: string | null;
          customer_name: string | null;
          customer_email: string | null;
          customer_phone: string | null;
          subtotal: number | null;
          discount: number | null;
          shipping_fee: number | null;
          taxes: number | null;
          status: string;
          payment_method: string | null;
          payment_status: string | null;
          shipment_status: string | null;
          shipping: Json;
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
          shipmaxx_shipment_id: string | null;
          awb_number: string | null;
          courier_partner: string | null;
          tracking_url: string | null;
          tracking_data: Json | null;
          delivered_at: string | null;
          return_requested_at: string | null;
          updated_at: string;
          customer_id: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          items?: Json;
          total?: number;
          created_at?: string;
          order_number?: string | null;
          customer_name?: string | null;
          customer_email?: string | null;
          customer_phone?: string | null;
          subtotal?: number | null;
          discount?: number | null;
          shipping_fee?: number | null;
          taxes?: number | null;
          status?: string;
          payment_method?: string | null;
          payment_status?: string | null;
          shipment_status?: string | null;
          shipping?: Json;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          shipmaxx_shipment_id?: string | null;
          awb_number?: string | null;
          courier_partner?: string | null;
          tracking_url?: string | null;
          tracking_data?: Json | null;
          delivered_at?: string | null;
          return_requested_at?: string | null;
          updated_at?: string;
          customer_id?: string | null;
        };
        Update: {
          id?: string | null;
          user_id?: string | null;
          items?: Json | null;
          total?: number | null;
          created_at?: string | null;
          order_number?: string | null;
          customer_name?: string | null;
          customer_email?: string | null;
          customer_phone?: string | null;
          subtotal?: number | null;
          discount?: number | null;
          shipping_fee?: number | null;
          taxes?: number | null;
          status?: string | null;
          payment_method?: string | null;
          payment_status?: string | null;
          shipment_status?: string | null;
          shipping?: Json | null;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          shipmaxx_shipment_id?: string | null;
          awb_number?: string | null;
          courier_partner?: string | null;
          tracking_url?: string | null;
          tracking_data?: Json | null;
          delivered_at?: string | null;
          return_requested_at?: string | null;
          updated_at?: string | null;
          customer_id?: string | null;
        };
        Relationships: [];
      };
      payment_webhook_events: {
        Row: {
          id: string;
          event_id: string;
          event_type: string;
          gateway: string;
          payload: Json;
          processed: boolean | null;
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          event_type: string;
          gateway?: string;
          payload: Json;
          processed?: boolean | null;
          error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string | null;
          event_id?: string | null;
          event_type?: string | null;
          gateway?: string | null;
          payload?: Json | null;
          processed?: boolean | null;
          error?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      payment_webhooks: {
        Row: {
          id: string;
          event_id: string | null;
          event_type: string;
          gateway: string;
          payload: Json;
          status: string;
          error: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          event_id?: string | null;
          event_type: string;
          gateway?: string;
          payload: Json;
          status?: string;
          error?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          event_id?: string | null;
          event_type?: string | null;
          gateway?: string | null;
          payload?: Json | null;
          status?: string | null;
          error?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          order_id: string;
          user_id: string | null;
          gateway: string;
          payment_method: string;
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
          razorpay_signature: string | null;
          amount: number;
          amount_paise: number;
          currency: string;
          status: string;
          error_code: string | null;
          error_description: string | null;
          payload: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          user_id?: string | null;
          gateway?: string;
          payment_method?: string;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_signature?: string | null;
          amount: number;
          amount_paise: number;
          currency?: string;
          status?: string;
          error_code?: string | null;
          error_description?: string | null;
          payload?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string | null;
          order_id?: string | null;
          user_id?: string | null;
          gateway?: string | null;
          payment_method?: string | null;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_signature?: string | null;
          amount?: number | null;
          amount_paise?: number | null;
          currency?: string | null;
          status?: string | null;
          error_code?: string | null;
          error_description?: string | null;
          payload?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      product_categories: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string | null;
          slug?: string | null;
          name?: string | null;
          description?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      product_images: {
        Row: {
          id: string;
          product_id: string;
          image_url: string;
          alt_text: string | null;
          sort_order: number;
          is_primary: boolean;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          product_id: string;
          image_url: string;
          alt_text?: string | null;
          sort_order?: number;
          is_primary?: boolean;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          product_id?: string | null;
          image_url?: string | null;
          alt_text?: string | null;
          sort_order?: number | null;
          is_primary?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      product_reviews: {
        Row: {
          id: string;
          product_id: string;
          customer_id: string | null;
          customer_auth_uid: string | null;
          customer_name: string;
          rating: number;
          title: string | null;
          review_text: string;
          is_verified_purchase: boolean;
          status: string;
          helpful_votes: number;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          product_id: string;
          customer_id?: string | null;
          customer_auth_uid?: string | null;
          customer_name: string;
          rating: number;
          title?: string | null;
          review_text: string;
          is_verified_purchase?: boolean;
          status?: string;
          helpful_votes?: number;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          product_id?: string | null;
          customer_id?: string | null;
          customer_auth_uid?: string | null;
          customer_name?: string | null;
          rating?: number | null;
          title?: string | null;
          review_text?: string | null;
          is_verified_purchase?: boolean | null;
          status?: string | null;
          helpful_votes?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      product_variants: {
        Row: {
          id: string;
          product_id: string;
          sku: string | null;
          size: string;
          color: string;
          color_hex: string | null;
          stock_quantity: number;
          additional_price: number;
          is_available: boolean;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          product_id: string;
          sku?: string | null;
          size: string;
          color: string;
          color_hex?: string | null;
          stock_quantity?: number;
          additional_price?: number;
          is_available?: boolean;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          product_id?: string | null;
          sku?: string | null;
          size?: string | null;
          color?: string | null;
          color_hex?: string | null;
          stock_quantity?: number | null;
          additional_price?: number | null;
          is_available?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          slug: string;
          name: string;
          category_slug: string | null;
          category_id: string | null;
          price: number;
          mrp: number;
          fabric: string | null;
          fit: string | null;
          description: string | null;
          tags: string[] | null;
          colors: Json | null;
          stock: Json | null;
          images: string[] | null;
          is_new: boolean | null;
          is_published: boolean | null;
          is_featured: boolean | null;
          views: number | null;
          sold: number | null;
          rank: number | null;
          created_at: string;
          updated_at: string;
          sku: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          category_slug?: string | null;
          category_id?: string | null;
          price: number;
          mrp: number;
          fabric?: string | null;
          fit?: string | null;
          description?: string | null;
          tags?: string[] | null;
          colors?: Json | null;
          stock?: Json | null;
          images?: string[] | null;
          is_new?: boolean | null;
          is_published?: boolean | null;
          is_featured?: boolean | null;
          views?: number | null;
          sold?: number | null;
          rank?: number | null;
          created_at?: string;
          updated_at?: string;
          sku?: string | null;
        };
        Update: {
          id?: string | null;
          slug?: string | null;
          name?: string | null;
          category_slug?: string | null;
          category_id?: string | null;
          price?: number | null;
          mrp?: number | null;
          fabric?: string | null;
          fit?: string | null;
          description?: string | null;
          tags?: string[] | null;
          colors?: Json | null;
          stock?: Json | null;
          images?: string[] | null;
          is_new?: boolean | null;
          is_published?: boolean | null;
          is_featured?: boolean | null;
          views?: number | null;
          sold?: number | null;
          rank?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
          sku?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string | null;
          phone: string | null;
          full_name: string | null;
          avatar_url: string | null;
          auth_provider: string | null;
          account_status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          phone?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          auth_provider?: string | null;
          account_status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string | null;
          email?: string | null;
          phone?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          auth_provider?: string | null;
          account_status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      promotional_sections: {
        Row: {
          id: string;
          title: string;
          subtitle: string | null;
          section_type: string;
          content: Json;
          is_active: boolean;
          sort_order: number;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          subtitle?: string | null;
          section_type?: string;
          content?: Json;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          title?: string | null;
          subtitle?: string | null;
          section_type?: string | null;
          content?: Json | null;
          is_active?: boolean | null;
          sort_order?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      refunds: {
        Row: {
          id: string;
          order_id: string;
          payment_id: string | null;
          razorpay_payment_id: string;
          razorpay_refund_id: string | null;
          amount: number;
          amount_paise: number;
          currency: string;
          reason: string | null;
          status: string;
          admin_user_id: string | null;
          raw_response: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          payment_id?: string | null;
          razorpay_payment_id: string;
          razorpay_refund_id?: string | null;
          amount: number;
          amount_paise: number;
          currency?: string;
          reason?: string | null;
          status?: string;
          admin_user_id?: string | null;
          raw_response?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string | null;
          order_id?: string | null;
          payment_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_refund_id?: string | null;
          amount?: number | null;
          amount_paise?: number | null;
          currency?: string | null;
          reason?: string | null;
          status?: string | null;
          admin_user_id?: string | null;
          raw_response?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      return_items: {
        Row: {
          id: string;
          return_id: string;
          order_item_id: string | null;
          product_id: string | null;
          variant_id: string | null;
          quantity: number;
          reason: string | null;
          condition: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          return_id: string;
          order_item_id?: string | null;
          product_id?: string | null;
          variant_id?: string | null;
          quantity?: number;
          reason?: string | null;
          condition?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          return_id?: string | null;
          order_item_id?: string | null;
          product_id?: string | null;
          variant_id?: string | null;
          quantity?: number | null;
          reason?: string | null;
          condition?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      returns: {
        Row: {
          id: string;
          order_id: string;
          customer_id: string | null;
          customer_auth_uid: string | null;
          return_number: string;
          reason: string;
          status: string;
          refund_amount: number;
          pickup_address: Json | null;
          awb_number: string | null;
          courier_partner: string | null;
          admin_notes: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          customer_id?: string | null;
          customer_auth_uid?: string | null;
          return_number: string;
          reason: string;
          status?: string;
          refund_amount?: number;
          pickup_address?: Json | null;
          awb_number?: string | null;
          courier_partner?: string | null;
          admin_notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          order_id?: string | null;
          customer_id?: string | null;
          customer_auth_uid?: string | null;
          return_number?: string | null;
          reason?: string | null;
          status?: string | null;
          refund_amount?: number | null;
          pickup_address?: Json | null;
          awb_number?: string | null;
          courier_partner?: string | null;
          admin_notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string | null;
          product_id: string | null;
          customer_id: string | null;
          user_id: string | null;
          customer_name: string | null;
          rating: number | null;
          title: string | null;
          review_text: string | null;
          is_verified_purchase: boolean | null;
          status: string | null;
          helpful_votes: number | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string | null;
          product_id?: string | null;
          customer_id?: string | null;
          user_id?: string | null;
          customer_name?: string | null;
          rating?: number | null;
          title?: string | null;
          review_text?: string | null;
          is_verified_purchase?: boolean | null;
          status?: string | null;
          helpful_votes?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          product_id?: string | null;
          customer_id?: string | null;
          user_id?: string | null;
          customer_name?: string | null;
          rating?: number | null;
          title?: string | null;
          review_text?: string | null;
          is_verified_purchase?: boolean | null;
          status?: string | null;
          helpful_votes?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      shipment_tracking_events: {
        Row: {
          id: string;
          shipment_id: string | null;
          order_id: string | null;
          awb_number: string;
          status: string;
          location: string | null;
          details: string | null;
          event_time: string | null;
          raw_event: Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          shipment_id?: string | null;
          order_id?: string | null;
          awb_number: string;
          status: string;
          location?: string | null;
          details?: string | null;
          event_time?: string | null;
          raw_event?: Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string | null;
          shipment_id?: string | null;
          order_id?: string | null;
          awb_number?: string | null;
          status?: string | null;
          location?: string | null;
          details?: string | null;
          event_time?: string | null;
          raw_event?: Json | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      shipments: {
        Row: {
          id: string;
          order_id: string;
          user_id: string | null;
          provider: string;
          shipmaxx_shipment_id: string | null;
          order_number: string;
          awb_number: string | null;
          courier_partner: string | null;
          payment_mode: string;
          cod_amount: number | null;
          pickup_pincode: string;
          delivery_pincode: string;
          package_weight_grams: number | null;
          package_type: string | null;
          status: string;
          shipping_label_url: string | null;
          raw_response: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          user_id?: string | null;
          provider?: string;
          shipmaxx_shipment_id?: string | null;
          order_number: string;
          awb_number?: string | null;
          courier_partner?: string | null;
          payment_mode?: string;
          cod_amount?: number | null;
          pickup_pincode?: string;
          delivery_pincode: string;
          package_weight_grams?: number | null;
          package_type?: string | null;
          status?: string;
          shipping_label_url?: string | null;
          raw_response?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string | null;
          order_id?: string | null;
          user_id?: string | null;
          provider?: string | null;
          shipmaxx_shipment_id?: string | null;
          order_number?: string | null;
          awb_number?: string | null;
          courier_partner?: string | null;
          payment_mode?: string | null;
          cod_amount?: number | null;
          pickup_pincode?: string | null;
          delivery_pincode?: string | null;
          package_weight_grams?: number | null;
          package_type?: string | null;
          status?: string | null;
          shipping_label_url?: string | null;
          raw_response?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      shipping_addresses: {
        Row: {
          id: string;
          order_id: string;
          user_id: string | null;
          full_name: string;
          phone: string;
          email: string;
          address_line1: string;
          address_line2: string | null;
          city: string;
          state: string;
          pincode: string;
          country: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          user_id?: string | null;
          full_name: string;
          phone: string;
          email: string;
          address_line1: string;
          address_line2?: string | null;
          city: string;
          state: string;
          pincode: string;
          country?: string;
          created_at?: string;
        };
        Update: {
          id?: string | null;
          order_id?: string | null;
          user_id?: string | null;
          full_name?: string | null;
          phone?: string | null;
          email?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          pincode?: string | null;
          country?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      shipping_settings: {
        Row: {
          id: string;
          pickup_pincode: string;
          pickup_address_name: string | null;
          pickup_address_line1: string | null;
          pickup_address_city: string | null;
          pickup_address_state: string | null;
          pickup_phone: string | null;
          default_package_weight_grams: number;
          package_type: string;
          cod_enabled: boolean;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pickup_pincode?: string;
          pickup_address_name?: string | null;
          pickup_address_line1?: string | null;
          pickup_address_city?: string | null;
          pickup_address_state?: string | null;
          pickup_phone?: string | null;
          default_package_weight_grams?: number;
          package_type?: string;
          cod_enabled?: boolean;
          updated_at?: string;
        };
        Update: {
          id?: string | null;
          pickup_pincode?: string | null;
          pickup_address_name?: string | null;
          pickup_address_line1?: string | null;
          pickup_address_city?: string | null;
          pickup_address_state?: string | null;
          pickup_phone?: string | null;
          default_package_weight_grams?: number | null;
          package_type?: string | null;
          cod_enabled?: boolean | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      shipping_tracking: {
        Row: {
          id: string;
          shipment_id: string | null;
          order_id: string | null;
          awb_number: string;
          current_status: string;
          status_location: string | null;
          status_time: string | null;
          activity: string | null;
          raw_data: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shipment_id?: string | null;
          order_id?: string | null;
          awb_number: string;
          current_status: string;
          status_location?: string | null;
          status_time?: string | null;
          activity?: string | null;
          raw_data?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string | null;
          shipment_id?: string | null;
          order_id?: string | null;
          awb_number?: string | null;
          current_status?: string | null;
          status_location?: string | null;
          status_time?: string | null;
          activity?: string | null;
          raw_data?: Json | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      shipping_webhook_events: {
        Row: {
          id: string;
          event_id: string;
          provider: string;
          event_type: string;
          awb_number: string | null;
          payload: Json;
          processed: boolean | null;
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          provider?: string;
          event_type: string;
          awb_number?: string | null;
          payload: Json;
          processed?: boolean | null;
          error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string | null;
          event_id?: string | null;
          provider?: string | null;
          event_type?: string | null;
          awb_number?: string | null;
          payload?: Json | null;
          processed?: boolean | null;
          error?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      site_settings: {
        Row: {
          key: string;
          value: Json;
          description: string | null;
          updated_at: string | null;
        };
        Insert: {
          key: string;
          value: Json;
          description?: string | null;
          updated_at?: string | null;
        };
        Update: {
          key?: string | null;
          value?: Json | null;
          description?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role?: string;
          created_at?: string;
        };
        Update: {
          id?: string | null;
          user_id?: string | null;
          role?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      wishlist_items: {
        Row: {
          id: string;
          wishlist_id: string;
          product_id: string;
          added_at: string | null;
        };
        Insert: {
          id?: string;
          wishlist_id: string;
          product_id: string;
          added_at?: string | null;
        };
        Update: {
          id?: string | null;
          wishlist_id?: string | null;
          product_id?: string | null;
          added_at?: string | null;
        };
        Relationships: [];
      };
      wishlists: {
        Row: {
          id: string;
          customer_id: string | null;
          customer_auth_uid: string | null;
          session_id: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          customer_id?: string | null;
          customer_auth_uid?: string | null;
          session_id?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string | null;
          customer_id?: string | null;
          customer_auth_uid?: string | null;
          session_id?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;
type DefaultSchema = DatabaseWithoutInternals["public"];

export type Tables<TableName extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])> = (DefaultSchema["Tables"] & DefaultSchema["Views"])[TableName] extends { Row: infer R } ? R : never;
export type TablesInsert<TableName extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][TableName] extends { Insert: infer I } ? I : never;
export type TablesUpdate<TableName extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][TableName] extends { Update: infer U } ? U : never;
