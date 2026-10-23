-- SPENDLY-513: client read access for the Phase 3 screens.
--
-- The dashboard cash-flow chart's older months read v_cash_flow_by_month
-- (SPENDLY-510, golden-tested against calculateDashboardSummaries). The views
-- are security_invoker, so they read expenses/incomes as the caller and the
-- owner-only RLS policies (SPENDLY-505) still decide which rows count: a user
-- only ever sees totals over their own live rows. The two v_active_* views
-- are granted because v_cash_flow_by_month reads through them.
--
-- SELECT only. Every other view, and every server function, stays without a
-- client grant (tests/assert_security.sql checks the exact list).

grant select on public.v_active_expenses    to authenticated;
grant select on public.v_active_incomes     to authenticated;
grant select on public.v_cash_flow_by_month to authenticated;
