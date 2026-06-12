(function () {
  "use strict";

  const DTC_PATTERN = /\b[PCBU][0-9A-F]{4}\b/gi;
  const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/g;
  const NUMBER_PATTERN = /[-+]?\d+(?:\.\d+)?/;

  const monitorDefinitions = Object.freeze([
    { id: "engine_speed", label: "エンジン回転数", unit: "rpm", category: "エンジン", aliases: ["engine rpm", "engine speed", "rpm", "エンジン回転数", "回転数"] },
    { id: "vehicle_speed", label: "車速", unit: "km/h", category: "走行", aliases: ["vehicle speed", "speed", "車速"] },
    { id: "coolant_temp", label: "冷却水温", unit: "°C", category: "温度", aliases: ["engine coolant temperature", "coolant temperature", "coolant temp", "ect", "冷却水温", "水温"] },
    { id: "intake_air_temp", label: "吸気温", unit: "°C", category: "温度", aliases: ["intake air temperature", "intake air temp", "iat", "吸気温"] },
    { id: "ambient_air_temp", label: "外気温", unit: "°C", category: "温度", aliases: ["ambient air temperature", "ambient temp", "外気温"] },
    { id: "calculated_load", label: "計算負荷値", unit: "%", category: "エンジン", aliases: ["calculated load", "engine load", "load", "計算負荷値", "エンジン負荷", "負荷"] },
    { id: "throttle_position", label: "スロットル開度", unit: "%", category: "吸気", aliases: ["absolute throttle position", "throttle position", "throttle", "tps", "スロットル開度"] },
    { id: "maf", label: "吸入空気量", unit: "g/s", category: "吸気", aliases: ["mass air flow", "air flow rate", "maf", "吸入空気量", "エアフロー"] },
    { id: "map", label: "インテークマニホールド絶対圧", unit: "kPa", category: "吸気", aliases: ["intake manifold absolute pressure", "manifold absolute pressure", "map", "インマニ絶対圧", "吸気管圧力"] },
    { id: "barometric_pressure", label: "大気圧", unit: "kPa", category: "吸気", aliases: ["barometric pressure", "baro", "大気圧"] },
    { id: "stft_b1", label: "短期燃料補正 バンク1", unit: "%", category: "燃料補正", aliases: ["short term fuel trim bank 1", "short fuel trim b1", "stft b1", "stft1", "短期燃料補正 b1", "短期燃料補正 バンク1"] },
    { id: "ltft_b1", label: "長期燃料補正 バンク1", unit: "%", category: "燃料補正", aliases: ["long term fuel trim bank 1", "long fuel trim b1", "ltft b1", "ltft1", "長期燃料補正 b1", "長期燃料補正 バンク1"] },
    { id: "stft_b2", label: "短期燃料補正 バンク2", unit: "%", category: "燃料補正", aliases: ["short term fuel trim bank 2", "short fuel trim b2", "stft b2", "stft2", "短期燃料補正 b2", "短期燃料補正 バンク2"] },
    { id: "ltft_b2", label: "長期燃料補正 バンク2", unit: "%", category: "燃料補正", aliases: ["long term fuel trim bank 2", "long fuel trim b2", "ltft b2", "ltft2", "長期燃料補正 b2", "長期燃料補正 バンク2"] },
    { id: "timing_advance", label: "点火時期進角", unit: "°", category: "点火", aliases: ["timing advance", "ignition timing", "点火時期進角", "点火時期"] },
    { id: "fuel_pressure", label: "燃圧", unit: "kPa", category: "燃料", aliases: ["fuel pressure", "燃圧"] },
    { id: "fuel_rail_pressure", label: "燃料レール圧", unit: "kPa", category: "燃料", aliases: ["fuel rail pressure", "rail pressure", "燃料レール圧", "コモンレール圧"] },
    { id: "control_module_voltage", label: "制御モジュール電圧", unit: "V", category: "電源", aliases: ["control module voltage", "module voltage", "battery voltage", "voltage", "制御モジュール電圧", "バッテリー電圧", "電圧"] },
    { id: "oxygen_sensor_voltage", label: "O2センサー電圧", unit: "V", category: "排気", aliases: ["oxygen sensor voltage", "o2 sensor voltage", "o2 voltage", "o2センサー電圧", "酸素センサー電圧"] },
    { id: "equivalence_ratio", label: "当量比", unit: "", category: "燃料補正", aliases: ["commanded equivalence ratio", "equivalence ratio", "lambda", "当量比", "ラムダ"] },
    { id: "engine_runtime", label: "エンジン始動後時間", unit: "s", category: "状態", aliases: ["time since engine start", "engine runtime", "run time", "エンジン始動後時間", "始動後時間"] }
  ].map((item) => Object.freeze({ ...item, aliases: Object.freeze(item.aliases) })));

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

  function normalizeMonitorLabel(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[（(].*?[）)]/g, "")
      .replace(/[_\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractMonitorValues(value) {
    const redacted = redactSensitiveText(value);
    const values = new Map();

    redacted.split(/\r?\n/).forEach((line, lineIndex) => {
      const separator = line.search(/[:：=＝,\t]/);
      if (separator < 1) return;

      const labelPart = normalizeMonitorLabel(line.slice(0, separator));
      const valuePart = line.slice(separator + 1);
      const numberMatch = valuePart.match(NUMBER_PATTERN);
      if (!numberMatch) return;

      const definition = monitorDefinitions.find((item) =>
        item.aliases.some((alias) => labelPart === normalizeMonitorLabel(alias))
      );
      if (!definition) return;

      const numericValue = Number(numberMatch[0]);
      if (!Number.isFinite(numericValue)) return;

      values.set(definition.id, {
        id: definition.id,
        label: definition.label,
        value: numericValue,
        unit: definition.unit,
        category: definition.category,
        sourceLine: lineIndex + 1
      });
    });

    return [...values.values()];
  }

  function analyzeScannerText(value) {
    const raw = String(value || "");
    const redacted = redactSensitiveText(raw);

    return {
      codes: extractDtcCodes(redacted),
      monitorValues: extractMonitorValues(redacted),
      hadSensitiveIdentifier: raw !== redacted,
      sourceLength: raw.length,
      retainedRawText: false
    };
  }

  window.ObdReadOnly = Object.freeze({
    policy,
    monitorDefinitions,
    getCapability,
    extractDtcCodes,
    extractMonitorValues,
    redactSensitiveText,
    analyzeScannerText
  });
})();
