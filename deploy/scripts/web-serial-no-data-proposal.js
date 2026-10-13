// Historical 3.13.690 review-only transformation; applied to production in 3.13.691. Never imported by the application.
export function applyWebSerialNoDataProposal(source) {
  const before = 'if (!["07", "0A", "0202", "06", "0900"].includes(normalizedCommand)) return false;';
  if (source.split(before).length !== 2) throw new Error("unexpected_expected_empty_contract");
  return source.replace(before, 'if (!["0202", "06", "0900"].includes(normalizedCommand)) return false;');
}
