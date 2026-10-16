// Development-only patch for review; never imported by production.
export function proposeExtendedCanDtc(source) {
const before = `            const countedSingleFrame = /^[0-7][0-9A-F]{2}$/i.test(String(packet?.ecu || ""))
              && Number.isInteger(frameLength) && frameLength >= 2 && frameLength <= 7
              && bytes[0] === frameLength && bytes.length >= frameLength + 1
              && [0x43, 0x47, 0x4A].includes(normalizedBytes[0]);
            if (countedSingleFrame) {`;
const after = `            const canId = /^(?:[0-7][0-9A-F]{2}|[01][0-9A-F]{7})$/i.test(String(packet?.ecu || ""));
            const singleFrame = Number.isInteger(frameLength) && frameLength >= 2 && frameLength <= 7
              && bytes[0] === frameLength && bytes.length >= frameLength + 1 && packet?.isoTp !== true;
            const assembledFrames = packet?.isoTp === true && packet?.incomplete !== true
              && packet?.sequenceError !== true && packet.frameCount >= 2
              && packet.expectedLength === normalizedBytes.length;
            const countedCan = canId && (singleFrame || packet?.isoTp === true)
              && [0x43, 0x47, 0x4A].includes(normalizedBytes[0]);
            if (countedCan) {`;
if (source.split(before).length !== 2) throw new Error("candidate_scope_changed");
return source.replace(before, after).replace(
  "let valid = normalizedBytes.length === 2 + count * 2;",
  "let valid = (singleFrame || assembledFrames) && normalizedBytes.length === 2 + count * 2;");
}
