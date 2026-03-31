# Fabrics and Colors Enterprise Playbook

## Scope
- Module: admin fabrics/colors, catalog filters, checkout customer, checkout representative.
- Primary objective: preserve data integrity and operational stability during progressive rollout of checkout v2 and enterprise hardening.

## Release order (no downtime)
1. Apply DB migration `055_checkout_v2_fabrics_enterprise_hardening.sql`.
2. Deploy application code with `CHECKOUT_V2_ENABLED=false`.
3. Validate smoke tests in production with legacy checkout path.
4. Enable `CHECKOUT_V2_ENABLED=true` only for controlled window.
5. Monitor metrics and logs for 24h before considering legacy path deprecation.

## Quick diagnostics
- Checkout v2 unavailable:
  - Symptom: error mentioning `client_create_order_atomic_v2` or `representative_create_order_atomic_v2`.
  - Action: confirm migration 055 applied and function grants present.
- Item unavailable at checkout:
  - Symptom: validation error for inactive variant/fabric/color.
  - Action: verify effective activity rule in `products`, `fabrics`, `fabric_colors`, `product_variants`.
- Admin bulk operation partial failures:
  - Symptom: structured response with blocked items.
  - Action: inspect item-level reason and resolve source data constraint.

## Rollback strategy
1. Set `CHECKOUT_V2_ENABLED=false`.
2. Redeploy configuration only (no schema rollback required).
3. Re-run checkout smoke tests (customer and representative).
4. Keep migration in place; legacy RPC remains compatible during transition.

## Incident checklist
1. Confirm affected flow: admin, catalog, customer checkout, representative checkout.
2. Capture request payload, profile/store id, and order/quote id when present.
3. Confirm current flag value `CHECKOUT_V2_ENABLED`.
4. Check admin audit table `admin_fabric_actions_audit` for related actions.
5. Check `orders` and `order_history` for v2 marker `[checkout_v2]`.
6. If needed, toggle flag to legacy path and stabilize operation.
7. Open post-incident task with root cause and preventive action.

## Post-release validation
1. Create/update/inactivate/delete fabric and color in admin.
2. Validate immediate effect in catalog and checkout availability.
3. Run customer checkout and representative checkout with valid items.
4. Attempt tampered payload (name/price/total) and confirm canonical DB calculation is preserved.
5. Verify bulk operations return structured partial results and actionable feedback.

## Operational metrics to monitor
- Checkout success rate (customer and representative).
- p95 latency for admin fabrics page and catalog product filtering.
- Rate of blocked bulk actions by reason.
- Frequency of fallback from v2 to legacy RPC during rollout window.

