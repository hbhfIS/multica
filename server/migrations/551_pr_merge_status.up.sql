-- PR merge automation target (MUL-7726). The workspace setting
-- settings.pr_merge_status picks what merging every PR linked to an issue does:
-- "none", or the key of the status the issue moves to. Absent means Done.
--
-- Fork change: upstream also pins "none" on every workspace where some merged
-- link carried no closing keyword, because upstream's new rule moves an issue
-- on any merged link. This fork keeps close intent: a merge only moves an
-- issue when a merged link declared "Fixes MUL-1" (see pr_auto_complete.go),
-- which is exactly the behaviour before this migration. So the only workspaces
-- to pin are the ones that had turned the automation off:
--
--   * pr_auto_complete_enabled = false                         -> none
--   * anything else                                            -> left absent
--
-- Only workspaces without an explicit pr_merge_status are touched, so a replay
-- is harmless.
UPDATE workspace AS w
SET settings = w.settings || '{"pr_merge_status": "none"}'::jsonb
WHERE jsonb_typeof(w.settings) = 'object'
  AND NOT (w.settings ? 'pr_merge_status')
  AND w.settings->>'pr_auto_complete_enabled' = 'false';
