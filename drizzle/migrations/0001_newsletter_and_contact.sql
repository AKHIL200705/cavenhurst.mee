CREATE TABLE public.newsletter_subscribers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE CHECK (char_length(email) <= 255), user_id uuid, created_at timestamptz NOT NULL DEFAULT now());
GRANT INSERT ON public.newsletter_subscribers TO authenticated;
GRANT ALL ON public.newsletter_subscribers TO service_role;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users subscribe themselves" ON public.newsletter_subscribers FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE TABLE public.contact_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100), email text NOT NULL CHECK (char_length(email) <= 255), message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000), created_at timestamptz NOT NULL DEFAULT now());
GRANT INSERT ON public.contact_messages TO authenticated;
GRANT ALL ON public.contact_messages TO service_role;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users send messages" ON public.contact_messages FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());