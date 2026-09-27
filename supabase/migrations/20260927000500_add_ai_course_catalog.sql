-- Agent-scoped course catalog with fee details and WhatsApp-ready assets.
-- Used by the Message Centre AI for fee answers and brochure/creative sends.

CREATE TABLE IF NOT EXISTS public.ai_course_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  course_name text NOT NULL,
  fee_summary text NOT NULL DEFAULT '',
  fee_details text NOT NULL DEFAULT '',
  fee_amount numeric(12,2),
  fee_currency text NOT NULL DEFAULT 'SGD',
  keyword_aliases text[] NOT NULL DEFAULT '{}'::text[],
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_course_catalog_course_name_nonempty CHECK (length(trim(course_name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_course_catalog_agent_course_name_uidx
  ON public.ai_course_catalog (agent_id, lower(course_name));

CREATE INDEX IF NOT EXISTS ai_course_catalog_agent_active_sort_idx
  ON public.ai_course_catalog (agent_id, is_active, sort_order, created_at);

CREATE TABLE IF NOT EXISTS public.ai_course_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.ai_course_catalog(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('brochure', 'creative')),
  media_type text NOT NULL CHECK (media_type IN ('image', 'document')),
  bucket text NOT NULL DEFAULT 'course-assets',
  path text NOT NULL,
  url text NOT NULL,
  mime_type text,
  filename text,
  caption text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_course_assets_course_path_uidx
  ON public.ai_course_assets (course_id, path);

CREATE INDEX IF NOT EXISTS ai_course_assets_course_active_type_sort_idx
  ON public.ai_course_assets (course_id, is_active, asset_type, sort_order, created_at);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS ai_course_catalog_id uuid REFERENCES public.ai_course_catalog(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_course_asset_id uuid REFERENCES public.ai_course_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS messages_conversation_course_asset_idx
  ON public.messages (conversation_id, ai_course_asset_id, created_at DESC)
  WHERE ai_course_asset_id IS NOT NULL;

ALTER TABLE public.ai_course_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_course_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_course_catalog_select_authenticated ON public.ai_course_catalog;
CREATE POLICY ai_course_catalog_select_authenticated
  ON public.ai_course_catalog FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS ai_course_catalog_insert_authenticated ON public.ai_course_catalog;
CREATE POLICY ai_course_catalog_insert_authenticated
  ON public.ai_course_catalog FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS ai_course_catalog_update_authenticated ON public.ai_course_catalog;
CREATE POLICY ai_course_catalog_update_authenticated
  ON public.ai_course_catalog FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS ai_course_catalog_delete_authenticated ON public.ai_course_catalog;
CREATE POLICY ai_course_catalog_delete_authenticated
  ON public.ai_course_catalog FOR DELETE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS ai_course_assets_select_authenticated ON public.ai_course_assets;
CREATE POLICY ai_course_assets_select_authenticated
  ON public.ai_course_assets FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS ai_course_assets_insert_authenticated ON public.ai_course_assets;
CREATE POLICY ai_course_assets_insert_authenticated
  ON public.ai_course_assets FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS ai_course_assets_update_authenticated ON public.ai_course_assets;
CREATE POLICY ai_course_assets_update_authenticated
  ON public.ai_course_assets FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS ai_course_assets_delete_authenticated ON public.ai_course_assets;
CREATE POLICY ai_course_assets_delete_authenticated
  ON public.ai_course_assets FOR DELETE
  TO authenticated
  USING (true);
