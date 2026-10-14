// Test-only reconstruction of the previous defaults. Never imported by production assets.
export function restoreReadinessMissingFieldsLegacy(source) {
  const start = source.indexOf('  function normalizeReadinessSnapshot(input = {}) {');
  const end = source.indexOf('\n  function ', start + 1);
  if (start < 0 || end < 0) throw Error('readiness_function_boundary_missing');
  const body = source.slice(start, end);
  const before = 'statusKey === "unknown" || statusKey === "unparsed" || !statusKey';
  if (body.split(before).length !== 3) throw Error('readiness_missing_field_anchors_changed');
  return source.slice(0, start) + body.replaceAll(before, before.replace(' || !statusKey', '')) + source.slice(end);
}
