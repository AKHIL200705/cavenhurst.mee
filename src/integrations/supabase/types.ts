export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      contact_messages: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          message: string;
          name: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          message: string;
          name: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          message?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      customer_carts: {
        Row: {
          items: Json;
          updated_at: string;
          user_id: string;
          wishlist: Json;
        };
        Insert: {
          items?: Json;
          updated_at?: string;
          user_id: string;
          wishlist?: Json;
        };
        Update: {
          items?: Json;
          updated_at?: string;
          user_id?: string;
          wishlist?: Json;
        };
        Relationships: [];
      };
      customer_profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          updated_at?: string;
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
          user_id?: string;
          welcome_seen_at?: string;
        };
        Relationships: [];
      };
      newsletter_subscribers: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          color: string;
          id: string;
          image: string | null;
          name: string;
          order_id: string;
          price: number;
          product_slug: string;
          qty: number;
          size: string;
        };
        Insert: {
          color: string;
          id?: string;
          image?: string | null;
          name: string;
          order_id: string;
          price: number;
          product_slug: string;
          qty: number;
          size: string;
        };
        Update: {
          color?: string;
          id?: string;
          image?: string | null;
          name?: string;
          order_id?: string;
          price?: number;
          product_slug?: string;
          qty?: number;
          size?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          awb_number: string | null;
          courier_partner: string | null;
          created_at: string;
          customer_email: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          delivered_at: string | null;
          discount: number;
          id: string;
          items: Json;
          order_number: string | null;
          payment_method: string;
          payment_status: string;
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
          return_requested_at: string | null;
          shipmaxx_shipment_id: string | null;
          shipment_status: string;
          shipping: Json;
          shipping_fee: number;
          status: string;
          subtotal: number;
          taxes: number;
          total: number;
          tracking_data: Json;
          tracking_url: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          awb_number?: string | null;
          courier_partner?: string | null;
          created_at?: string;
          customer_email?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          delivered_at?: string | null;
          discount?: number;
          id?: string;
          items: Json;
          order_number?: string | null;
          payment_method?: string;
          payment_status?: string;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          return_requested_at?: string | null;
          shipmaxx_shipment_id?: string | null;
          shipment_status?: string;
          shipping?: Json;
          shipping_fee?: number;
          status?: string;
          subtotal?: number;
          taxes?: number;
          total: number;
          tracking_data?: Json;
          tracking_url?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          awb_number?: string | null;
          courier_partner?: string | null;
          created_at?: string;
          customer_email?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          delivered_at?: string | null;
          discount?: number;
          id?: string;
          items?: Json;
          order_number?: string | null;
          payment_method?: string;
          payment_status?: string;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          return_requested_at?: string | null;
          shipmaxx_shipment_id?: string | null;
          shipment_status?: string;
          shipping?: Json;
          shipping_fee?: number;
          status?: string;
          subtotal?: number;
          taxes?: number;
          total?: number;
          tracking_data?: Json;
          tracking_url?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          amount: number;
          amount_paise: number;
          created_at: string;
          currency: string;
          error_code: string | null;
          error_description: string | null;
          gateway: string;
          id: string;
          order_id: string;
          payload: Json;
          payment_method: string;
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
          razorpay_signature: string | null;
          status: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          amount: number;
          amount_paise: number;
          created_at?: string;
          currency?: string;
          error_code?: string | null;
          error_description?: string | null;
          gateway?: string;
          id?: string;
          order_id: string;
          payload?: Json;
          payment_method?: string;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_signature?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          amount?: number;
          amount_paise?: number;
          created_at?: string;
          currency?: string;
          error_code?: string | null;
          error_description?: string | null;
          gateway?: string;
          id?: string;
          order_id?: string;
          payload?: Json;
          payment_method?: string;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_signature?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      payment_webhook_events: {
        Row: {
          created_at: string;
          error: string | null;
          event_id: string;
          event_type: string;
          gateway: string;
          id: string;
          payload: Json;
          processed: boolean;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          event_id: string;
          event_type: string;
          gateway?: string;
          id?: string;
          payload: Json;
          processed?: boolean;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          event_id?: string;
          event_type?: string;
          gateway?: string;
          id?: string;
          payload?: Json;
          processed?: boolean;
        };
        Relationships: [];
      };
      product_categories: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          slug: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          category_slug: string | null;
          colors: Json;
          created_at: string;
          description: string | null;
          fabric: string | null;
          fit: string | null;
          id: string;
          images: string[];
          is_new: boolean;
          is_published: boolean;
          is_featured: boolean;
          views: number;
          mrp: number;
          name: string;
          price: number;
          rank: number;
          slug: string;
          sold: number;
          stock: Json;
          tags: string[];
          updated_at: string;
        };
        Insert: {
          category_slug?: string | null;
          colors?: Json;
          created_at?: string;
          description?: string | null;
          fabric?: string | null;
          fit?: string | null;
          id?: string;
          images?: string[];
          is_new?: boolean;
          is_published?: boolean;
          is_featured?: boolean;
          views?: number;
          mrp: number;
          name: string;
          price: number;
          rank?: number;
          slug: string;
          sold?: number;
          stock?: Json;
          tags?: string[];
          updated_at?: string;
        };
        Update: {
          category_slug?: string | null;
          colors?: Json;
          created_at?: string;
          description?: string | null;
          fabric?: string | null;
          fit?: string | null;
          id?: string;
          images?: string[];
          is_new?: boolean;
          is_published?: boolean;
          is_featured?: boolean;
          views?: number;
          mrp?: number;
          name?: string;
          price?: number;
          rank?: number;
          slug?: string;
          sold?: number;
          stock?: Json;
          tags?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      shipments: {
        Row: {
          awb_number: string | null;
          cod_amount: number;
          courier_partner: string | null;
          created_at: string;
          delivery_pincode: string;
          id: string;
          order_id: string;
          order_number: string;
          package_type: string | null;
          package_weight_grams: number;
          payment_mode: string;
          pickup_pincode: string;
          provider: string;
          raw_response: Json;
          shipmaxx_shipment_id: string | null;
          shipping_label_url: string | null;
          status: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          awb_number?: string | null;
          cod_amount?: number;
          courier_partner?: string | null;
          created_at?: string;
          delivery_pincode: string;
          id?: string;
          order_id: string;
          order_number: string;
          package_type?: string | null;
          package_weight_grams?: number;
          payment_mode?: string;
          pickup_pincode?: string;
          provider?: string;
          raw_response?: Json;
          shipmaxx_shipment_id?: string | null;
          shipping_label_url?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          awb_number?: string | null;
          cod_amount?: number;
          courier_partner?: string | null;
          created_at?: string;
          delivery_pincode?: string;
          id?: string;
          order_id?: string;
          order_number?: string;
          package_type?: string | null;
          package_weight_grams?: number;
          payment_mode?: string;
          pickup_pincode?: string;
          provider?: string;
          raw_response?: Json;
          shipmaxx_shipment_id?: string | null;
          shipping_label_url?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      shipping_addresses: {
        Row: {
          address_line1: string;
          address_line2: string | null;
          city: string;
          country: string;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          order_id: string;
          phone: string;
          pincode: string;
          state: string;
          user_id: string | null;
        };
        Insert: {
          address_line1: string;
          address_line2?: string | null;
          city: string;
          country?: string;
          created_at?: string;
          email: string;
          full_name: string;
          id?: string;
          order_id: string;
          phone: string;
          pincode: string;
          state: string;
          user_id?: string | null;
        };
        Update: {
          address_line1?: string;
          address_line2?: string | null;
          city?: string;
          country?: string;
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          order_id?: string;
          phone?: string;
          pincode?: string;
          state?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      shipping_settings: {
        Row: {
          cod_enabled: boolean;
          default_package_weight_grams: number;
          id: string;
          package_type: string;
          pickup_address_city: string | null;
          pickup_address_line1: string | null;
          pickup_address_name: string | null;
          pickup_address_state: string | null;
          pickup_phone: string | null;
          pickup_pincode: string;
          updated_at: string;
        };
        Insert: {
          cod_enabled?: boolean;
          default_package_weight_grams?: number;
          id?: string;
          package_type?: string;
          pickup_address_city?: string | null;
          pickup_address_line1?: string | null;
          pickup_address_name?: string | null;
          pickup_address_state?: string | null;
          pickup_phone?: string | null;
          pickup_pincode?: string;
          updated_at?: string;
        };
        Update: {
          cod_enabled?: boolean;
          default_package_weight_grams?: number;
          id?: string;
          package_type?: string;
          pickup_address_city?: string | null;
          pickup_address_line1?: string | null;
          pickup_address_name?: string | null;
          pickup_address_state?: string | null;
          pickup_phone?: string | null;
          pickup_pincode?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      shipping_tracking: {
        Row: {
          activity: string | null;
          awb_number: string;
          created_at: string;
          current_status: string;
          id: string;
          order_id: string | null;
          raw_data: Json;
          shipment_id: string | null;
          status_location: string | null;
          status_time: string | null;
        };
        Insert: {
          activity?: string | null;
          awb_number: string;
          created_at?: string;
          current_status: string;
          id?: string;
          order_id?: string | null;
          raw_data?: Json;
          shipment_id?: string | null;
          status_location?: string | null;
          status_time?: string | null;
        };
        Update: {
          activity?: string | null;
          awb_number?: string;
          created_at?: string;
          current_status?: string;
          id?: string;
          order_id?: string | null;
          raw_data?: Json;
          shipment_id?: string | null;
          status_location?: string | null;
          status_time?: string | null;
        };
        Relationships: [];
      };
      shipping_webhook_events: {
        Row: {
          awb_number: string | null;
          created_at: string;
          error: string | null;
          event_id: string;
          event_type: string;
          id: string;
          payload: Json;
          processed: boolean;
          provider: string;
        };
        Insert: {
          awb_number?: string | null;
          created_at?: string;
          error?: string | null;
          event_id: string;
          event_type: string;
          id?: string;
          payload: Json;
          processed?: boolean;
          provider?: string;
        };
        Update: {
          awb_number?: string | null;
          created_at?: string;
          error?: string | null;
          event_id?: string;
          event_type?: string;
          id?: string;
          payload?: Json;
          processed?: boolean;
          provider?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      coupons: {
        Row: {
          id: string;
          code: string;
          discount_type: "percentage" | "fixed";
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
          discount_type: "percentage" | "fixed";
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
          id?: string;
          code?: string;
          discount_type?: "percentage" | "fixed";
          discount_value?: number;
          min_order_value?: number;
          max_discount?: number | null;
          usage_limit?: number | null;
          times_used?: number;
          expires_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
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
          id?: string;
          order_id?: string;
          payment_id?: string | null;
          razorpay_payment_id?: string;
          razorpay_refund_id?: string | null;
          amount?: number;
          amount_paise?: number;
          currency?: string;
          reason?: string | null;
          status?: string;
          admin_user_id?: string | null;
          raw_response?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      inventory_movements: {
        Row: {
          id: string;
          product_id: string;
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
          product_id: string;
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
          id?: string;
          product_id?: string;
          product_slug?: string;
          size?: string;
          color?: string | null;
          change_qty?: number;
          new_stock?: number;
          reason?: string;
          reference_id?: string | null;
          admin_user_id?: string | null;
          created_at?: string;
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
          id?: string;
          admin_user_id?: string | null;
          admin_email?: string | null;
          action?: string;
          target_type?: string;
          target_id?: string;
          details?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      request_return: { Args: { _order_id: string }; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;
