(function () {
  "use strict";

  const DTC_PATTERN = /\b[PCBU][0-9A-F]{4}\b/gi;
  const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/g;

  const policy = Object.freeze({
    mode: "read-only-import",
    transmitsVehicleCommands: false,
    storesRawInput: false,
    uploadsRawInput: false,
    blockedOperations: Object.freeze([
      "DTC消去",
      "アクティブテスト",
      "ECU書換え・コーディング",
      "学習値初期化",
      "セキュリティアクセス"
    ])
  });

  function getCapability() {
    return {
      secureContext: window.isSecureContext,
      webSerialSupported: "serial" in navigator,
      hardwareConnectionEnabled: false
    };
  }

  function extractDtcCodes(value) {
    const matches = String(value || "").toUpperCase().match(DTC_PATTERN) || [];
    return [...new Set(matches)];
  }

  function redactSensitiveText(value) {
    return String(value || "").replace(VIN_PATTERN, "[車台番号候補を非表示]");
  }

  function analyzeScannerText(value) {
    const raw = String(value || "");
    const redacted = redactSensitiveText(raw);

    return {
      codes: extractDtcCodes(redacted),
      hadSensitiveIdentifier: raw !== redacted,
      sourceLength: raw.length,
      retainedRawText: false
    };
  }

  window.ObdReadOnly = Object.freeze({
    policy,
    getCapability,
    extractDtcCodes,
    redactSensitiveText,
    analyzeScannerText
  });
})();
