-- ============================================================
-- Phase 1 Performance: Wrap auth.uid() + add hot-path indexes
-- ============================================================

-- 1) Rewrite all policies that use bare auth.uid() to use (SELECT auth.uid())
--    so Postgres caches the result once per query instead of re-evaluating per row.
DO $$
DECLARE
  p record;
  new_qual text;
  new_check text;
  sql_create text;
  roles_clause text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual LIKE '%auth.uid()%' AND qual NOT LIKE '%(SELECT auth.uid())%')
        OR (with_check LIKE '%auth.uid()%' AND with_check NOT LIKE '%(SELECT auth.uid())%')
      )
  LOOP
    new_qual  := p.qual;
    new_check := p.with_check;

    IF new_qual IS NOT NULL THEN
      new_qual := regexp_replace(new_qual, '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');
    END IF;
    IF new_check IS NOT NULL THEN
      new_check := regexp_replace(new_check, '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');
    END IF;

    roles_clause := array_to_string(
      ARRAY(SELECT quote_ident(r) FROM unnest(p.roles) AS r),
      ', '
    );

    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);

    sql_create := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      p.policyname, p.schemaname, p.tablename, p.permissive, p.cmd, roles_clause
    );

    IF new_qual IS NOT NULL THEN
      sql_create := sql_create || ' USING (' || new_qual || ')';
    END IF;
    IF new_check IS NOT NULL THEN
      sql_create := sql_create || ' WITH CHECK (' || new_check || ')';
    END IF;

    EXECUTE sql_create;
  END LOOP;
END $$;

-- 2) Indexes on heavy tables (FK + filter/sort columns)
-- department_tickets
CREATE INDEX IF NOT EXISTS idx_dept_tickets_clinic_id ON public.department_tickets(clinic_id);
CREATE INDEX IF NOT EXISTS idx_dept_tickets_status ON public.department_tickets(status);
CREATE INDEX IF NOT EXISTS idx_dept_tickets_department ON public.department_tickets(department);
CREATE INDEX IF NOT EXISTS idx_dept_tickets_assigned_to ON public.department_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_dept_tickets_created_by ON public.department_tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_dept_tickets_created_at ON public.department_tickets(created_at DESC);

-- ticket_audit_log
CREATE INDEX IF NOT EXISTS idx_ticket_audit_actor_created ON public.ticket_audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_audit_ticket ON public.ticket_audit_log(ticket_id);

-- department_ticket_assignments
CREATE INDEX IF NOT EXISTS idx_dta_assigned_status ON public.department_ticket_assignments(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_dta_ticket_id ON public.department_ticket_assignments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_dta_department ON public.department_ticket_assignments(department);

-- content_requests / content_posts / content_calendar
CREATE INDEX IF NOT EXISTS idx_content_requests_clinic ON public.content_requests(clinic_id);
CREATE INDEX IF NOT EXISTS idx_content_requests_concierge ON public.content_requests(created_by_concierge_id);
CREATE INDEX IF NOT EXISTS idx_content_posts_clinic_created ON public.content_posts(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_posts_created_by ON public.content_posts(created_by);
CREATE INDEX IF NOT EXISTS idx_content_posts_status ON public.content_posts(status);

-- post_comments / post_activity_log
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON public.post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_user_created ON public.post_comments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_activity_post ON public.post_activity_log(post_id);
CREATE INDEX IF NOT EXISTS idx_post_activity_actor_created ON public.post_activity_log(actor_id, created_at DESC);

-- department_chats
CREATE INDEX IF NOT EXISTS idx_dept_chats_clinic_dept_created ON public.department_chats(clinic_id, department, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dept_chats_user_created ON public.department_chats(user_id, created_at DESC);

-- sm2
CREATE INDEX IF NOT EXISTS idx_sm2_generations_clinic ON public.sm2_generations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_sm2_generations_triggered_by ON public.sm2_generations(triggered_by);
CREATE INDEX IF NOT EXISTS idx_sm2_posts_generation ON public.sm2_posts(generation_id);
CREATE INDEX IF NOT EXISTS idx_sm2_posts_clinic ON public.sm2_posts(clinic_id);

-- promotions / gbp / blog
CREATE INDEX IF NOT EXISTS idx_clinic_promotions_clinic ON public.clinic_promotions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_promotions_created_by ON public.clinic_promotions(created_by);
CREATE INDEX IF NOT EXISTS idx_gbp_history_clinic ON public.gbp_post_history(clinic_id);
CREATE INDEX IF NOT EXISTS idx_gbp_history_generated_by ON public.gbp_post_history(generated_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gbp_history_reviewed_by ON public.gbp_post_history(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_gbp_history_approved_by ON public.gbp_post_history(approved_by);
CREATE INDEX IF NOT EXISTS idx_blog_posts_clinic ON public.blog_posts(clinic_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_by ON public.blog_posts(marked_published_by);

-- analytics / website
CREATE INDEX IF NOT EXISTS idx_website_pageviews_clinic_created ON public.website_pageviews(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_clinic ON public.analytics(clinic_id);

-- user_roles (hot — has_role() lookup)
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON public.user_roles(user_id, role);

-- clinic team / sub accounts
CREATE INDEX IF NOT EXISTS idx_ctm_user ON public.clinic_team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_ctm_clinic ON public.clinic_team_members(clinic_id);
CREATE INDEX IF NOT EXISTS idx_sac_sub_account ON public.sub_account_clinics(sub_account_id);
CREATE INDEX IF NOT EXISTS idx_csa_sub_user ON public.client_sub_accounts(sub_user_id);
CREATE INDEX IF NOT EXISTS idx_clinics_owner ON public.clinics(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_clinics_concierge ON public.clinics(assigned_concierge_id);