(function () {
  "use strict";

  const DTC_PATTERN = /\b[PCBU][0-9A-F]{4}\b/gi;
  const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/g;
  const NUMBER_PATTERN = /[-+]?\d+(?:\.\d+)?/;

  const fallbackMonitorDefinitions = Object.freeze([
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
  let monitorDefinitions = fallbackMonitorDefinitions;

  const policy = Object.freeze({
    mode: "vehicle-connection-safety-gated",
    transmitsVehicleCommands: false,
    storesRawInput: false,
    uploadsRawInput: false,
    hardwareConnectionEnabled: false,
    connectionPreparationEnabled: true,
    blockedOperations: Object.freeze([
      "DTC消去",
      "学習値初期化",
      "アクティブテスト",
      "ECU書換え・コーディング",
      "セキュリティアクセス"
    ])
  });

  const vehicleOperationPlan = Object.freeze([
    Object.freeze({
      id: "connect_vehicle",
      label: "車両接続",
      state: "safety-gated",
      commandClass: "transport",
      currentAvailability: "準備中",
      goal: "利用者が選択したUSBシリアル機器に接続し、アダプター応答を確認する",
      requiredBeforeEnable: Object.freeze([
        "HTTPS環境とWeb Serial対応ブラウザの確認",
        "対応アダプター、通信速度、初期化手順の確認",
        "接続失敗、切断、タイムアウト時の安全終了",
        "通信ログから車台番号など不要な識別情報を保存しない確認"
      ])
    }),
    Object.freeze({
      id: "read_dtc",
      label: "DTC読取",
      state: "safety-gated",
      commandClass: "read",
      currentAvailability: "準備中",
      goal: "保存DTC、保留DTC、フリーズフレームを取得し、診断補助へ引き継ぐ",
      requiredBeforeEnable: Object.freeze([
        "読取専用コマンドの許可リスト化",
        "取得データの保存前確認とマスク処理",
        "同時DTC、発生順、フリーズフレームを消去前に保持",
        "未対応ECUや応答なしを異常と断定しない表示"
      ])
    }),
    Object.freeze({
      id: "live_monitor",
      label: "データモニター",
      state: "safety-gated",
      commandClass: "read",
      currentAvailability: "準備中",
      goal: "車両が返した対応PIDだけをリアルタイム表示し、診断フローの観察条件へつなぐ",
      requiredBeforeEnable: Object.freeze([
        "標準PIDの要求間隔と停止条件の確認",
        "未対応PIDや未取得値を推測補完しない表示",
        "冷間時、暖機後、症状再現時のスナップショット分離",
        "高電圧、燃料、ブレーキ、SRS系作業への注意表示"
      ])
    }),
    Object.freeze({
      id: "clear_dtc",
      label: "DTC消去",
      state: "blocked-until-safe",
      commandClass: "state-changing",
      currentAvailability: "安全検証完了まで無効",
      goal: "消去前保存、前提条件、利用者確認、実行ログ、失敗時復旧を揃えてから段階的に有効化する",
      requiredBeforeEnable: Object.freeze([
        "全システムスキャンとフリーズフレームの保存",
        "修理前後の比較ログ",
        "消去対象ECU、影響範囲、レディネス再設定の説明",
        "利用者の明示確認とキャンセル導線",
        "失敗時の復旧手順と再スキャン"
      ])
    })
  ]);

  const vehicleConnectionProfile = Object.freeze({
    interfaceType: "web-serial-obd-adapter",
    currentState: "safety-gated",
    transportEnabled: false,
    failClosed: true,
    adapterFamilies: Object.freeze(["ELM327互換", "STN系互換"]),
    baudRateCandidates: Object.freeze([38400, 115200, 9600]),
    privacyPolicy: "VINなど診断に不要な識別情報は保存しない",
    stopConditions: Object.freeze([
      "利用者が停止した",
      "通信タイムアウト",
      "アダプター応答なし",
      "ブラウザのシリアル接続が切断された"
    ])
  });

  const vehicleDamagePreventionInterlock = Object.freeze({
    name: "vehicle-damage-prevention",
    status: "enforced",
    failClosed: true,
    outboundTransportEnabled: false,
    allowsPhysicalVehicleCommands: false,
    defaultDecision: "block",
    blockedServiceModes: Object.freeze([
      "04",
      "08",
      "14",
      "27",
      "2E",
      "2F",
      "31",
      "34",
      "36",
      "3B",
      "3D"
    ]),
    preEnableChecklist: Object.freeze([
      "対象車両、年式、エンジン、ECU、通信プロトコルの適合確認",
      "バッテリー電圧、補機電源、通信安定性の確認",
      "消去前の全システムスキャン、フリーズフレーム、ライブデータ保存",
      "DTC消去、学習、作動要求、書込みの影響範囲と復旧手順の表示",
      "利用者の明示確認、キャンセル導線、実行ログ、再スキャンの実装",
      "高電圧、燃料、ブレーキ、SRS、高圧油圧など危険系統の強い警告"
    ])
  });

  const preparedVehicleRequests = Object.freeze([
    Object.freeze({
      id: "adapter_identity",
      group: "connection",
      label: "アダプター応答確認",
      service: "adapter",
      pid: null,
      stateChanging: false,
      currentAvailability: "準備中",
      requiresVehicleSupport: false,
      destination: "OBDアダプター",
      resultTarget: "接続状態",
      safetyGate: "送信無効",
      note: "実車通信前にアダプター応答、通信速度、タイムアウト処理を確認する"
    }),
    Object.freeze({
      id: "read_stored_dtc",
      group: "dtc",
      label: "保存DTC読取",
      service: "03",
      pid: null,
      stateChanging: false,
      currentAvailability: "準備中",
      requiresVehicleSupport: true,
      destination: "車両ECU",
      resultTarget: "診断補助DTC一覧",
      safetyGate: "送信無効",
      note: "取得できたコードだけを表示し、未応答ECUを故障と断定しない"
    }),
    Object.freeze({
      id: "read_pending_dtc",
      group: "dtc",
      label: "保留DTC読取",
      service: "07",
      pid: null,
      stateChanging: false,
      currentAvailability: "準備中",
      requiresVehicleSupport: true,
      destination: "車両ECU",
      resultTarget: "診断補助DTC一覧",
      safetyGate: "送信無効",
      note: "保存DTCと分けて扱い、発生条件はメーカー整備書で確認する"
    }),
    Object.freeze({
      id: "read_freeze_frame",
      group: "dtc",
      label: "フリーズフレーム取得",
      service: "02",
      pid: null,
      stateChanging: false,
      currentAvailability: "準備中",
      requiresVehicleSupport: true,
      destination: "車両ECU",
      resultTarget: "診断補助の発生時条件",
      safetyGate: "送信無効",
      note: "DTC消去前に保存し、冷間時、暖機後、症状再現時と混同しない"
    }),
    Object.freeze({
      id: "monitor_supported_pids",
      group: "live-data",
      label: "対応PID確認",
      service: "01",
      pid: "00",
      stateChanging: false,
      currentAvailability: "準備中",
      requiresVehicleSupport: true,
      destination: "車両ECU",
      resultTarget: "データモニター表示項目",
      safetyGate: "送信無効",
      note: "車両が対応を返したPIDだけを表示候補にする"
    }),
    Object.freeze({
      id: "monitor_core_values",
      group: "live-data",
      label: "主要ライブデータ取得",
      service: "01",
      pid: "supported-only",
      stateChanging: false,
      currentAvailability: "準備中",
      requiresVehicleSupport: true,
      destination: "車両ECU",
      resultTarget: "リアルタイムデータモニター",
      safetyGate: "送信無効",
      note: "回転数、車速、水温、燃料補正、電源電圧などを対応PIDの範囲で扱う"
    }),
    Object.freeze({
      id: "clear_dtc_request",
      group: "state-changing",
      label: "DTC消去要求",
      service: "04",
      pid: null,
      stateChanging: true,
      currentAvailability: "安全検証完了まで無効",
      requiresVehicleSupport: true,
      destination: "車両ECU",
      resultTarget: "DTCとレディネス状態",
      safetyGate: "強制拒否",
      note: "全システムスキャン、フリーズフレーム保存、利用者確認、再スキャンが揃うまで実行不可"
    })
  ]);

  const advancedInterfaceRoadmap = Object.freeze([
    Object.freeze({
      id: "web_serial_obd",
      phase: 1,
      label: "Web Serial / ELM327・STN",
      role: "汎用OBD2の読取系を先に確認する",
      currentAvailability: "準備中",
      requiresLocalBridge: false,
      vehicleCommandEnabled: false,
      capabilityScope: Object.freeze(["保存DTC読取", "保留DTC読取", "標準PID", "フリーズフレーム"]),
      requiredBeforeEnable: Object.freeze(["HTTPS", "対応ブラウザ", "アダプター識別", "読取コマンド許可リスト"])
    }),
    Object.freeze({
      id: "local_bridge",
      phase: 2,
      label: "ローカル通信ブリッジ",
      role: "ブラウザUIとPC側VCI通信を分離する",
      currentAvailability: "設計準備",
      requiresLocalBridge: true,
      vehicleCommandEnabled: false,
      capabilityScope: Object.freeze(["通信ログ", "VCI抽象化", "権限確認", "失敗時復旧"]),
      requiredBeforeEnable: Object.freeze(["ローカル署名", "明示的な起動確認", "通信ログ保存", "UIとの安全なAPI境界"])
    }),
    Object.freeze({
      id: "j2534_passthru",
      phase: 3,
      label: "J2534 Pass-Thru",
      role: "本格的なVCIとメーカー診断に近い通信へ広げる",
      currentAvailability: "ローカルブリッジ後",
      requiresLocalBridge: true,
      vehicleCommandEnabled: false,
      capabilityScope: Object.freeze(["VCI検出", "プロトコル選択", "メーカー固有読取", "全システムスキャン"]),
      requiredBeforeEnable: Object.freeze(["対応DLL確認", "VCI適合", "車両適合", "電源安定", "復旧手順"])
    }),
    Object.freeze({
      id: "uds_canfd",
      phase: 4,
      label: "UDS / CAN / CAN FD",
      role: "新しめの車両やメーカー固有DIDへ対応する",
      currentAvailability: "検証待ち",
      requiresLocalBridge: true,
      vehicleCommandEnabled: false,
      capabilityScope: Object.freeze(["DID読取", "ECU情報", "拡張DTC", "セッション管理"]),
      requiredBeforeEnable: Object.freeze(["診断セッション制御", "タイミング管理", "応答分割処理", "セキュリティアクセス遮断"])
    }),
    Object.freeze({
      id: "doip",
      phase: 5,
      label: "DoIP",
      role: "Ethernet診断車両への将来対応を分離して準備する",
      currentAvailability: "検証待ち",
      requiresLocalBridge: true,
      vehicleCommandEnabled: false,
      capabilityScope: Object.freeze(["車両検出", "ルーティング有効化", "UDS over IP", "通信監視"]),
      requiredBeforeEnable: Object.freeze(["ネットワーク分離", "接続先確認", "ルーティング制御", "タイムアウト復旧"])
    }),
    Object.freeze({
      id: "vci_sdk",
      phase: 6,
      label: "専用VCI SDK",
      role: "対応機器の公式SDKがある場合だけ個別に追加する",
      currentAvailability: "候補管理",
      requiresLocalBridge: true,
      vehicleCommandEnabled: false,
      capabilityScope: Object.freeze(["公式SDK連携", "機器別機能", "ライセンス確認", "配布管理"]),
      requiredBeforeEnable: Object.freeze(["SDK利用条件", "OS対応", "ライセンス", "サポート範囲", "責任境界"])
    })
  ]);

  const localBridgeContract = Object.freeze({
    id: "local_bridge_contract_v1",
    status: "draft-disabled",
    endpointOrigin: "http://127.0.0.1",
    endpointPortCandidates: Object.freeze([8765, 17653]),
    apiVersion: "v1",
    transport: "local-http-or-websocket",
    connectionEnabled: false,
    vehicleCommandEnabled: false,
    requiresUserLaunch: true,
    requiresPairingToken: true,
    allowedDirections: Object.freeze(["browser-to-local-bridge", "local-bridge-to-browser-status"]),
    allowedReadIntents: Object.freeze([
      "bridge_status",
      "list_vci",
      "adapter_identity",
      "read_stored_dtc",
      "read_pending_dtc",
      "read_freeze_frame",
      "read_supported_pids",
      "read_live_pid_snapshot"
    ]),
    blockedWriteIntents: Object.freeze([
      "clear_dtc",
      "routine_control",
      "input_output_control",
      "security_access",
      "write_data_by_identifier",
      "request_download",
      "ecu_reset"
    ]),
    requiredRequestFields: Object.freeze(["request_id", "api_version", "intent", "timestamp", "pairing_token"]),
    requiredResponseFields: Object.freeze(["request_id", "ok", "blocked", "would_transmit", "errors", "data"]),
    logPolicy: Object.freeze({
      storeRawFrames: false,
      redactIdentifiers: true,
      keepSessionSummary: true,
      userExportRequired: true
    })
  });

  const localBridgeResponseSchemas = Object.freeze([
    Object.freeze({
      intent: "bridge_status",
      label: "Bridge status",
      dataShape: Object.freeze(["bridge_version", "api_version", "status", "paired", "vci_connected", "vehicle_connected"]),
      safeDefault: Object.freeze({
        bridge_version: null,
        api_version: localBridgeContract.apiVersion,
        status: "not_connected",
        paired: false,
        vci_connected: false,
        vehicle_connected: false
      })
    }),
    Object.freeze({
      intent: "list_vci",
      label: "VCI list",
      dataShape: Object.freeze(["devices", "selected_device_id", "driver_status"]),
      safeDefault: Object.freeze({
        devices: Object.freeze([]),
        selected_device_id: null,
        driver_status: "not_checked"
      })
    }),
    Object.freeze({
      intent: "read_stored_dtc",
      label: "Stored DTC snapshot",
      dataShape: Object.freeze(["protocol", "ecu_responses", "dtcs", "captured_at"]),
      safeDefault: Object.freeze({
        protocol: null,
        ecu_responses: Object.freeze([]),
        dtcs: Object.freeze([]),
        captured_at: null
      })
    }),
    Object.freeze({
      intent: "read_live_pid_snapshot",
      label: "Live PID snapshot",
      dataShape: Object.freeze(["protocol", "supported_pids", "values", "captured_at"]),
      safeDefault: Object.freeze({
        protocol: null,
        supported_pids: Object.freeze([]),
        values: Object.freeze([]),
        captured_at: null
      })
    }),
    Object.freeze({
      intent: "session_summary",
      label: "Session summary",
      dataShape: Object.freeze(["started_at", "ended_at", "vehicle_profile", "warnings", "export_required"]),
      safeDefault: Object.freeze({
        started_at: null,
        ended_at: null,
        vehicle_profile: null,
        warnings: Object.freeze([]),
        export_required: true
      })
    })
  ]);
  let vehicleInterfaceCatalog = Object.freeze([]);
  let freezeFrameItemCatalog = Object.freeze([]);
  let readinessMonitorCatalog = Object.freeze([]);
  let ecuInfoItemCatalog = Object.freeze([]);

  function getCapability() {
    return {
      secureContext: window.isSecureContext,
      webSerialSupported: "serial" in navigator,
      hardwareConnectionEnabled: policy.hardwareConnectionEnabled,
      connectionPreparationEnabled: policy.connectionPreparationEnabled,
      monitorDefinitionCount: monitorDefinitions.length,
      freezeFrameItemCount: freezeFrameItemCatalog.length,
      readinessMonitorCount: readinessMonitorCatalog.length,
      ecuInfoItemCount: ecuInfoItemCatalog.length
    };
  }

  function getVehicleOperationPlan() {
    return vehicleOperationPlan.map((item) => ({
      ...item,
      requiredBeforeEnable: [...item.requiredBeforeEnable]
    }));
  }

  function getVehicleConnectionProfile() {
    return {
      ...vehicleConnectionProfile,
      adapterFamilies: [...vehicleConnectionProfile.adapterFamilies],
      baudRateCandidates: [...vehicleConnectionProfile.baudRateCandidates],
      stopConditions: [...vehicleConnectionProfile.stopConditions]
    };
  }

  function getVehicleDamagePreventionInterlock() {
    return {
      ...vehicleDamagePreventionInterlock,
      blockedServiceModes: [...vehicleDamagePreventionInterlock.blockedServiceModes],
      preEnableChecklist: [...vehicleDamagePreventionInterlock.preEnableChecklist]
    };
  }

  function getPreparedVehicleRequests() {
    return preparedVehicleRequests.map((item) => ({ ...item }));
  }

  function getAdvancedInterfaceRoadmap() {
    return advancedInterfaceRoadmap.map((item) => ({
      ...item,
      capabilityScope: [...item.capabilityScope],
      requiredBeforeEnable: [...item.requiredBeforeEnable]
    }));
  }

  function requestAdvancedInterface(interfaceId) {
    const item = advancedInterfaceRoadmap.find((entry) => entry.id === interfaceId);
    return {
      ok: false,
      interfaceId,
      label: item?.label || interfaceId || "unknown",
      blocked: true,
      wouldTransmit: false,
      vehicleCommandEnabled: false,
      reason: "高度な通信インターフェースは設計準備中です。実車への通信は有効化していません。"
    };
  }

  function getLocalBridgeContract() {
    return {
      ...localBridgeContract,
      endpointPortCandidates: [...localBridgeContract.endpointPortCandidates],
      allowedDirections: [...localBridgeContract.allowedDirections],
      allowedReadIntents: [...localBridgeContract.allowedReadIntents],
      blockedWriteIntents: [...localBridgeContract.blockedWriteIntents],
      requiredRequestFields: [...localBridgeContract.requiredRequestFields],
      requiredResponseFields: [...localBridgeContract.requiredResponseFields],
      logPolicy: { ...localBridgeContract.logPolicy }
    };
  }

  function getLocalBridgeResponseSchemas() {
    return localBridgeResponseSchemas.map((item) => ({
      ...item,
      dataShape: [...item.dataShape],
      safeDefault: cloneBridgeValue(item.safeDefault)
    }));
  }

  function configureVehicleInterfaceCatalog(rows) {
    if (!Array.isArray(rows)) return false;
    const normalized = rows
      .filter((item) => item && typeof item.id === "string" && typeof item.label === "string")
      .map((item) => Object.freeze({
        id: item.id,
        label: item.label,
        interfaceFamily: item.interface_family || "unknown",
        transport: item.transport || "unknown",
        primaryUse: item.primary_use || "",
        tooling: Object.freeze(Array.isArray(item.tooling) ? [...item.tooling] : []),
        readScopeCandidates: Object.freeze(Array.isArray(item.read_scope_candidates) ? [...item.read_scope_candidates] : []),
        writeScopeCandidates: Object.freeze(Array.isArray(item.write_scope_candidates) ? [...item.write_scope_candidates] : []),
        currentStatus: item.current_status || "候補管理",
        connectionEnabled: false,
        vehicleCommandEnabled: false,
        verificationRequired: Object.freeze(Array.isArray(item.verification_required) ? [...item.verification_required] : []),
        integrationNote: item.integration_note || "",
        confidence: item.confidence || "未検証",
        source: item.source || "",
        sourceUrl: item.source_url || null
      }));

    if (new Set(normalized.map((item) => item.id)).size !== normalized.length) return false;
    vehicleInterfaceCatalog = Object.freeze(normalized);
    return true;
  }

  function getVehicleInterfaceCatalog() {
    return vehicleInterfaceCatalog.map((item) => ({
      ...item,
      tooling: [...item.tooling],
      readScopeCandidates: [...item.readScopeCandidates],
      writeScopeCandidates: [...item.writeScopeCandidates],
      verificationRequired: [...item.verificationRequired]
    }));
  }

  function configureFreezeFrameItems(rows) {
    if (!Array.isArray(rows) || !rows.length) return false;
    const normalized = rows
      .filter((item) => item && typeof item.id === "string" && typeof item.monitor_id === "string")
      .map((item) => Object.freeze({
        id: item.id,
        monitorId: item.monitor_id,
        label: item.label || item.monitor_id,
        service: item.service || "02",
        pid: item.pid || null,
        priority: Number.isInteger(item.priority) ? item.priority : 999,
        purpose: item.purpose || "",
        interpretationNote: item.interpretation_note || "",
        serviceManualRequired: item.service_manual_required === true,
        source: item.source || "",
        sourceUrl: item.source_url || null
      }))
      .sort((a, b) => a.priority - b.priority);
    if (!normalized.length || new Set(normalized.map((item) => item.id)).size !== normalized.length) return false;
    freezeFrameItemCatalog = Object.freeze(normalized);
    return true;
  }

  function configureReadinessMonitors(rows) {
    if (!Array.isArray(rows) || !rows.length) return false;
    const normalized = rows
      .filter((item) => item && typeof item.id === "string" && typeof item.label === "string")
      .map((item) => Object.freeze({
        id: item.id,
        label: item.label,
        category: item.category || "状態",
        appliesTo: Object.freeze(Array.isArray(item.applies_to) ? [...item.applies_to] : []),
        statusValues: Object.freeze(Array.isArray(item.status_values) ? [...item.status_values] : []),
        diagnosticUse: item.diagnostic_use || "",
        notCompleteNote: item.not_complete_note || "",
        serviceManualRequired: item.service_manual_required === true,
        source: item.source || "",
        sourceUrl: item.source_url || null
      }));
    if (!normalized.length || new Set(normalized.map((item) => item.id)).size !== normalized.length) return false;
    readinessMonitorCatalog = Object.freeze(normalized);
    return true;
  }

  function getFreezeFrameItems() {
    return freezeFrameItemCatalog.map((item) => ({ ...item }));
  }

  function getReadinessMonitors() {
    return readinessMonitorCatalog.map((item) => ({
      ...item,
      appliesTo: [...item.appliesTo],
      statusValues: [...item.statusValues]
    }));
  }

  function configureEcuInfoItems(rows) {
    if (!Array.isArray(rows) || !rows.length) return false;
    const normalized = rows
      .filter((item) => item && typeof item.id === "string" && typeof item.info_type === "string")
      .map((item) => Object.freeze({
        id: item.id,
        label: item.label || item.id,
        service: item.service || "09",
        infoType: String(item.info_type).toUpperCase(),
        valueType: item.value_type || "text",
        privacyClass: item.privacy_class || "unknown",
        diagnosticUse: item.diagnostic_use || "",
        storagePolicy: item.storage_policy || "",
        serviceManualRequired: item.service_manual_required === true,
        source: item.source || "",
        sourceUrl: item.source_url || null
      }));
    if (!normalized.length || new Set(normalized.map((item) => item.id)).size !== normalized.length) return false;
    ecuInfoItemCatalog = Object.freeze(normalized);
    return true;
  }

  function getEcuInfoItems() {
    return ecuInfoItemCatalog.map((item) => ({ ...item }));
  }

  function cloneBridgeValue(value) {
    if (Array.isArray(value)) return value.map((item) => cloneBridgeValue(item));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneBridgeValue(item)]));
    }
    return value;
  }

  function createLocalBridgeBlockedResponse(intent = "unknown", errors = []) {
    const schema = localBridgeResponseSchemas.find((item) => item.intent === intent);
    return {
      request_id: null,
      ok: false,
      blocked: true,
      would_transmit: false,
      errors: errors.length ? [...errors] : ["local_bridge_disabled"],
      data: schema ? cloneBridgeValue(schema.safeDefault) : null
    };
  }

  function normalizeBridgeDtcSnapshot(response = {}) {
    const data = response && typeof response === "object" ? response.data || response : {};
    const dtcRows = Array.isArray(data.dtcs) ? data.dtcs : [];
    const ecuRows = Array.isArray(data.ecu_responses) ? data.ecu_responses : [];
    const codes = [...new Set(dtcRows.flatMap((row) => {
      if (typeof row === "string") return extractDtcCodes(row);
      if (!row || typeof row !== "object") return [];
      return extractDtcCodes(row.code || row.dtc || row.id || "");
    }))];

    return {
      source: "local_bridge",
      intent: "read_stored_dtc",
      ok: response.ok === true,
      blocked: response.blocked !== false,
      wouldTransmit: response.would_transmit === true,
      codes,
      dtcs: codes.map((code) => ({ code, source: "local_bridge" })),
      protocol: data.protocol || null,
      ecuResponses: ecuRows.map((row) => ({
        ecu: row?.ecu || row?.address || null,
        status: row?.status || "unknown",
        codeCount: Array.isArray(row?.dtcs) ? row.dtcs.length : null
      })),
      capturedAt: data.captured_at || null,
      retainedRawText: false
    };
  }

  function normalizeBridgeConnectionStatus(response = {}) {
    const data = response && typeof response === "object" ? response.data || response : {};
    const status = String(data.status || "not_connected");
    const paired = data.paired === true;
    const vciConnected = data.vci_connected === true;
    const vehicleConnected = data.vehicle_connected === true;
    let displayStatus = "準備中";
    let nextAction = "ローカルブリッジを起動しても、この画面からはまだ車両へ送信しません。";

    if (status === "not_connected") {
      displayStatus = "未接続";
      nextAction = "PC側ブリッジの起動とペアリング準備を確認します。";
    } else if (!paired) {
      displayStatus = "ペアリング待ち";
      nextAction = "ペアリングトークン確認後に読取系だけを評価します。";
    } else if (!vciConnected) {
      displayStatus = "VCI確認待ち";
      nextAction = "VCI一覧とドライバー状態を確認します。";
    } else if (!vehicleConnected) {
      displayStatus = "車両接続確認待ち";
      nextAction = "車両応答を取得する前に対応プロトコルと停止条件を確認します。";
    } else {
      displayStatus = "読取準備モデル";
      nextAction = "DTCとライブPIDを既存診断フローへ整形する準備だけを行います。";
    }

    return {
      source: "local_bridge",
      intent: "bridge_status",
      ok: response.ok === true,
      blocked: response.blocked !== false,
      wouldTransmit: response.would_transmit === true,
      bridgeVersion: data.bridge_version || null,
      apiVersion: data.api_version || localBridgeContract.apiVersion,
      status,
      displayStatus,
      paired,
      vciConnected,
      vehicleConnected,
      connectionEnabled: localBridgeContract.connectionEnabled,
      vehicleCommandEnabled: false,
      errors: Array.isArray(response.errors) ? [...response.errors] : [],
      nextAction,
      retainedRawText: false
    };
  }

  function normalizeBridgeVciList(response = {}) {
    const data = response && typeof response === "object" ? response.data || response : {};
    const devices = Array.isArray(data.devices) ? data.devices : [];
    const selectedDeviceId = data.selected_device_id || null;
    const normalizedDevices = devices.map((device, index) => {
      const id = String(device?.id || device?.device_id || `vci_${index + 1}`).slice(0, 80);
      return {
        id,
        label: String(device?.label || device?.name || `VCI ${index + 1}`).slice(0, 80),
        vendor: device?.vendor ? String(device.vendor).slice(0, 80) : null,
        driverStatus: device?.driver_status || data.driver_status || "unknown",
        connected: device?.connected === true,
        selected: selectedDeviceId ? id === selectedDeviceId : index === 0 && devices.length === 1,
        supportNote: "VCI識別情報は表示用に最小化し、シリアル番号などの生識別子は保持しません。"
      };
    });

    return {
      source: "local_bridge",
      intent: "list_vci",
      ok: response.ok === true,
      blocked: response.blocked !== false,
      wouldTransmit: response.would_transmit === true,
      driverStatus: data.driver_status || "not_checked",
      selectedDeviceId,
      devices: normalizedDevices,
      deviceCount: normalizedDevices.length,
      connectionEnabled: localBridgeContract.connectionEnabled,
      vehicleCommandEnabled: false,
      retainedRawText: false
    };
  }

  function normalizeBridgeLivePidSnapshot(response = {}) {
    const data = response && typeof response === "object" ? response.data || response : {};
    const values = Array.isArray(data.values) ? data.values : [];
    const monitorValues = values
      .map((row, index) => normalizeBridgePidValue(row, index))
      .filter(Boolean);

    return {
      source: "local_bridge",
      intent: "read_live_pid_snapshot",
      ok: response.ok === true,
      blocked: response.blocked !== false,
      wouldTransmit: response.would_transmit === true,
      protocol: data.protocol || null,
      supportedPids: Array.isArray(data.supported_pids) ? [...data.supported_pids] : [],
      capturedAt: data.captured_at || null,
      monitorValues,
      monitorInsights: analyzeMonitorValues(monitorValues),
      retainedRawText: false
    };
  }

  function normalizeBridgePidValue(row, index) {
    if (!row || typeof row !== "object") return null;
    const id = String(row.id || row.monitor_id || row.pid || "").trim();
    if (!id) return null;
    const definition = monitorDefinitions.find((item) => item.id === id)
      || monitorDefinitions.find((item) => item.pid === row.pid);
    if (!definition) return null;
    const valueType = definition?.valueType || (typeof row.value === "string" && !NUMBER_PATTERN.test(row.value) ? "text" : "number");
    const parsedValue = valueType === "text" ? String(row.value ?? "").slice(0, 160) : Number(row.value);
    if (valueType === "number" && !Number.isFinite(parsedValue)) return null;
    if (valueType === "text" && !parsedValue) return null;

    return {
      id: definition?.id || id,
      label: definition?.label || row.label || id,
      value: parsedValue,
      unit: definition?.unit || row.unit || "",
      category: definition?.category || row.category || "ブリッジ読取",
      valueType,
      service: definition?.service || row.service || null,
      pid: definition?.pid || row.pid || null,
      scope: definition?.scope || "local-bridge",
      supportNote: definition?.supportNote || "ローカルブリッジ応答を既存データモニター表示へ整形",
      sourceLine: index + 1
    };
  }

  function buildBridgeSessionSummary(parts = {}) {
    const dtcSnapshot = parts.dtcSnapshot?.codes ? parts.dtcSnapshot : normalizeBridgeDtcSnapshot(parts.dtcSnapshot);
    const livePidSnapshot = parts.livePidSnapshot?.monitorValues ? parts.livePidSnapshot : normalizeBridgeLivePidSnapshot(parts.livePidSnapshot);
    const connectionStatus = parts.connectionStatus?.displayStatus ? parts.connectionStatus : normalizeBridgeConnectionStatus(parts.connectionStatus);
    const vciList = parts.vciList?.devices ? parts.vciList : normalizeBridgeVciList(parts.vciList);
    const warnings = [];
    if (connectionStatus.blocked || vciList.blocked || dtcSnapshot.blocked || livePidSnapshot.blocked) warnings.push("local_bridge_disabled");
    if (dtcSnapshot.codes.length) warnings.push("confirm_dtc_with_service_manual");
    if (livePidSnapshot.monitorValues.length) warnings.push("compare_values_under_same_conditions");

    return {
      source: "local_bridge",
      startedAt: parts.startedAt || null,
      endedAt: parts.endedAt || null,
      vehicleProfile: parts.vehicleProfile || null,
      connectionStatus,
      vciDevices: vciList.devices,
      codes: dtcSnapshot.codes,
      monitorValues: livePidSnapshot.monitorValues,
      monitorInsights: livePidSnapshot.monitorInsights,
      warnings,
      exportRequired: true,
      retainedRawText: false,
      wouldTransmit: false
    };
  }

  function buildBridgeSessionExportPayload(parts = {}) {
    const summary = parts.codes && parts.monitorValues ? parts : buildBridgeSessionSummary(parts);
    return {
      schema_version: "bridge_session_export_v1",
      exported_at: parts.exportedAt || new Date().toISOString(),
      source: "local_bridge",
      connection_enabled: false,
      vehicle_command_enabled: false,
      retained_raw_frames: false,
      retained_raw_text: false,
      export_required: true,
      session: {
        started_at: summary.startedAt || null,
        ended_at: summary.endedAt || null,
        vehicle_profile: summary.vehicleProfile || null,
        connection_status: summary.connectionStatus || normalizeBridgeConnectionStatus(),
        vci_devices: summary.vciDevices || [],
        dtc_codes: summary.codes || [],
        monitor_values: summary.monitorValues || [],
        monitor_insights: summary.monitorInsights || [],
        warnings: [...new Set(summary.warnings || [])]
      },
      safety: {
        read_only_phase: true,
        blocked_write_intents: [...localBridgeContract.blockedWriteIntents],
        store_raw_frames: false
      }
    };
  }

  function buildBridgeDiagnosticImport(parts = {}) {
    const summary = parts.codes && parts.monitorValues ? parts : buildBridgeSessionSummary(parts);
    const exportPayload = buildBridgeSessionExportPayload(summary);
    const codes = Array.isArray(summary.codes) ? [...summary.codes] : [];
    const monitorValues = Array.isArray(summary.monitorValues) ? summary.monitorValues.map((item) => ({ ...item })) : [];
    const monitorInsights = Array.isArray(summary.monitorInsights) ? summary.monitorInsights.map((item) => ({ ...item })) : [];

    return {
      source: "local_bridge",
      importType: "bridge_diagnostic_snapshot",
      codes,
      monitorValues,
      monitorInsights,
      bridgeSession: {
        connectionStatus: summary.connectionStatus || normalizeBridgeConnectionStatus(),
        vciDevices: Array.isArray(summary.vciDevices) ? summary.vciDevices.map((item) => ({ ...item })) : [],
        warnings: [...new Set(summary.warnings || [])],
        exportRequired: true
      },
      exportPayload,
      hadSensitiveIdentifier: false,
      sourceLength: 0,
      retainedRawText: false,
      wouldTransmit: false,
      vehicleCommandEnabled: false
    };
  }

  function mergeDiagnosticInputs(input = {}) {
    const scannerAnalysis = analyzeScannerText(input.scannerText || "");
    const bridgeImport = input.bridgeImport?.importType === "bridge_diagnostic_snapshot"
      ? input.bridgeImport
      : input.bridgeParts
        ? buildBridgeDiagnosticImport(input.bridgeParts)
        : null;
    const monitorById = new Map();

    scannerAnalysis.monitorValues.forEach((item) => {
      monitorById.set(item.id, { ...item, source: "scanner_text" });
    });
    (bridgeImport?.monitorValues || []).forEach((item) => {
      monitorById.set(item.id, { ...item, source: "local_bridge" });
    });

    const monitorValues = [...monitorById.values()];
    const codes = [...new Set([
      ...scannerAnalysis.codes,
      ...(bridgeImport?.codes || [])
    ])];
    const monitorInsights = analyzeMonitorValues(monitorValues);

    return {
      source: bridgeImport ? "scanner_text_and_local_bridge" : "scanner_text",
      importType: "combined_diagnostic_inputs",
      codes,
      monitorValues,
      monitorInsights,
      bridgeSession: bridgeImport?.bridgeSession || null,
      bridgeExportPayload: bridgeImport?.exportPayload || null,
      hadSensitiveIdentifier: scannerAnalysis.hadSensitiveIdentifier,
      sourceLength: scannerAnalysis.sourceLength,
      retainedRawText: false,
      wouldTransmit: false,
      vehicleCommandEnabled: false
    };
  }

  function normalizeDtcSnapshot(input = {}) {
    const source = input.source || "diagnostic_core";
    const rawRows = Array.isArray(input.dtcs) ? input.dtcs : Array.isArray(input.codes) ? input.codes : [];
    const rows = rawRows.flatMap((row) => {
      if (typeof row === "string") {
        return extractDtcCodes(row).map((code) => ({ code }));
      }
      if (!row || typeof row !== "object") return [];
      const codes = extractDtcCodes(row.code || row.dtc || row.id || "");
      return codes.map((code) => ({
        code,
        status: row.status || row.kind || input.status || "unknown",
        ecu: row.ecu || row.ecu_id || row.address || null,
        freezeFrameAvailable: row.freeze_frame_available === true || row.freezeFrameAvailable === true
      }));
    });
    const byCode = new Map();
    rows.forEach((row) => {
      if (!byCode.has(row.code)) byCode.set(row.code, { ...row, source });
    });

    return {
      schemaVersion: "dtc_snapshot_v1",
      source,
      capturedAt: input.captured_at || input.capturedAt || null,
      protocol: input.protocol || null,
      codes: [...byCode.keys()],
      dtcs: [...byCode.values()],
      retainedRawText: false
    };
  }

  function normalizeFreezeFrameSnapshot(input = {}) {
    const source = input.source || "diagnostic_core";
    const rows = Array.isArray(input.values) ? input.values : Array.isArray(input.freeze_frame) ? input.freeze_frame : [];
    const monitorValues = rows
      .map((row, index) => normalizeBridgePidValue(row, index))
      .filter(Boolean)
      .map((item) => {
        const catalogItem = freezeFrameItemCatalog.find((entry) => entry.monitorId === item.id || entry.pid === item.pid);
        return {
          ...item,
          source: "freeze_frame",
          freezeFramePriority: catalogItem?.priority || null,
          interpretationNote: catalogItem?.interpretationNote || item.supportNote
        };
      });
    const expectedItems = freezeFrameItemCatalog.map((item) => ({
      id: item.id,
      monitorId: item.monitorId,
      label: item.label,
      pid: item.pid,
      priority: item.priority,
      captured: monitorValues.some((value) => value.id === item.monitorId || value.pid === item.pid),
      purpose: item.purpose,
      interpretationNote: item.interpretationNote
    }));
    const triggerCodes = extractDtcCodes([
      input.trigger_dtc,
      input.triggerDtc,
      input.freeze_dtc,
      input.freezeDtc,
      input.dtc
    ].filter(Boolean).join(" "));

    return {
      schemaVersion: "freeze_frame_snapshot_v1",
      source,
      capturedAt: input.captured_at || input.capturedAt || null,
      triggerDtc: triggerCodes[0] || null,
      monitorValues,
      expectedItems,
      capturedItemCount: monitorValues.length,
      expectedItemCount: expectedItems.length,
      monitorInsights: analyzeMonitorValues(monitorValues),
      retainedRawText: false
    };
  }

  function normalizeReadinessSnapshot(input = {}) {
    const source = input.source || "diagnostic_core";
    const monitors = Array.isArray(input) ? input : Array.isArray(input.monitors) ? input.monitors : [];
    const normalized = monitors.map((monitor, index) => {
      const id = String(monitor?.id || monitor?.name || `monitor_${index + 1}`).slice(0, 80);
      const catalogItem = readinessMonitorCatalog.find((entry) => entry.id === id);
      return {
        id,
        label: String(monitor?.label || catalogItem?.label || monitor?.name || `Monitor ${index + 1}`).slice(0, 120),
        category: catalogItem?.category || monitor?.category || "状態",
        supported: monitor?.supported !== false,
        complete: monitor?.complete === true,
        status: monitor?.status || (monitor?.complete === true ? "complete" : "not_complete"),
        diagnosticUse: catalogItem?.diagnosticUse || "",
        notCompleteNote: catalogItem?.notCompleteNote || ""
      };
    });
    const knownMonitors = readinessMonitorCatalog.map((item) => ({
      id: item.id,
      label: item.label,
      category: item.category,
      appliesTo: [...item.appliesTo],
      observed: normalized.some((monitor) => monitor.id === item.id)
    }));

    return {
      schemaVersion: "readiness_snapshot_v1",
      source,
      capturedAt: input.captured_at || input.capturedAt || null,
      milOn: input.mil_on === true || input.milOn === true,
      monitorCount: normalized.length,
      incompleteCount: normalized.filter((item) => item.supported && !item.complete).length,
      knownMonitorCount: knownMonitors.length,
      monitors: normalized,
      knownMonitors,
      retainedRawText: false
    };
  }

  function normalizeEcuResponseSummary(input = {}) {
    const source = input.source || "diagnostic_core";
    const rows = Array.isArray(input) ? input : Array.isArray(input.ecus) ? input.ecus : Array.isArray(input.ecu_responses) ? input.ecu_responses : [];
    return {
      schemaVersion: "ecu_response_summary_v1",
      source,
      capturedAt: input.captured_at || input.capturedAt || null,
      protocol: input.protocol || null,
      ecus: rows.map((row, index) => ({
        id: String(row?.id || row?.ecu || row?.address || `ecu_${index + 1}`).slice(0, 40),
        name: row?.name ? String(row.name).slice(0, 120) : null,
        address: row?.address || row?.ecu || null,
        status: row?.status || "unknown",
        dtcCount: Number.isInteger(row?.dtc_count) ? row.dtc_count : Array.isArray(row?.dtcs) ? row.dtcs.length : null,
        responseTimeMs: Number.isFinite(Number(row?.response_time_ms)) ? Number(row.response_time_ms) : null
      })),
      retainedRawText: false
    };
  }

  function normalizeEcuInfoSnapshot(input = {}) {
    const source = input.source || "diagnostic_core";
    const rows = Array.isArray(input.values) ? input.values : Array.isArray(input.ecu_info) ? input.ecu_info : [];
    const items = rows
      .map((row, index) => normalizeEcuInfoValue(row, index))
      .filter(Boolean);
    const expectedItems = ecuInfoItemCatalog.map((item) => ({
      id: item.id,
      label: item.label,
      service: item.service,
      infoType: item.infoType,
      privacyClass: item.privacyClass,
      captured: items.some((value) => value.id === item.id || value.infoType === item.infoType),
      diagnosticUse: item.diagnosticUse,
      storagePolicy: item.storagePolicy
    }));

    return {
      schemaVersion: "ecu_info_snapshot_v1",
      source,
      capturedAt: input.captured_at || input.capturedAt || null,
      protocol: input.protocol || null,
      itemCount: items.length,
      expectedItemCount: expectedItems.length,
      hadSensitiveIdentifier: items.some((item) => item.privacyClass === "sensitive_identifier" && item.detected === true),
      items,
      expectedItems,
      retainedRawText: false
    };
  }

  function normalizeOnboardMonitorSnapshot(input = {}) {
    const source = input.source || "diagnostic_core";
    const rows = Array.isArray(input.tests) ? input.tests : Array.isArray(input.values) ? input.values : [];
    const tests = rows
      .map((row, index) => {
        if (!row || typeof row !== "object") return null;
        const testId = String(row.test_id || row.testId || row.tid || row.mid || "").toUpperCase().replace(/^0X/, "").padStart(2, "0").slice(-2);
        const componentId = String(row.component_id || row.componentId || row.cid || "").toUpperCase().replace(/^0X/, "").padStart(2, "0").slice(-2);
        const value = Number(row.value);
        const min = Number(row.min);
        const max = Number(row.max);
        const hasLimits = Number.isFinite(min) && Number.isFinite(max);
        const passed = hasLimits && Number.isFinite(value) ? value >= min && value <= max : row.passed === true;
        if (!testId || !componentId || !Number.isFinite(value)) return null;
        return {
          testId,
          componentId,
          value,
          min: Number.isFinite(min) ? min : null,
          max: Number.isFinite(max) ? max : null,
          passed,
          status: hasLimits ? (passed ? "pass" : "fail") : "unknown",
          sourceIndex: index + 1,
          interpretationNote: "Mode 06 TID/CID meaning and units are vehicle-specific. Confirm the test item in the service manual."
        };
      })
      .filter(Boolean);

    return {
      schemaVersion: "onboard_monitor_snapshot_v1",
      source,
      capturedAt: input.captured_at || input.capturedAt || null,
      protocol: input.protocol || null,
      testCount: tests.length,
      failedCount: tests.filter((test) => test.status === "fail").length,
      unknownCount: tests.filter((test) => test.status === "unknown").length,
      tests,
      retainedRawText: false
    };
  }

  function normalizeEcuInfoValue(row, index) {
    if (!row || typeof row !== "object") return null;
    const infoType = String(row.info_type || row.infoType || "").toUpperCase();
    const catalogItem = ecuInfoItemCatalog.find((item) => item.id === row.id || item.infoType === infoType);
    const id = catalogItem?.id || String(row.id || `ecu_info_${index + 1}`).slice(0, 80);
    const privacyClass = catalogItem?.privacyClass || row.privacy_class || "unknown";
    const rawValue = row.value ?? row.text ?? row.data ?? "";
    const value = privacyClass === "sensitive_identifier"
      ? maskSensitiveIdentifier(rawValue)
      : sanitizeEcuInfoValue(rawValue);

    if (value === null || value === "") return null;
    return {
      id,
      label: catalogItem?.label || row.label || id,
      service: catalogItem?.service || row.service || "09",
      infoType: catalogItem?.infoType || infoType || null,
      value,
      valueType: catalogItem?.valueType || row.value_type || "text",
      privacyClass,
      detected: rawValue !== null && rawValue !== undefined && String(rawValue).length > 0,
      retainedRawValue: false,
      diagnosticUse: catalogItem?.diagnosticUse || "",
      storagePolicy: catalogItem?.storagePolicy || ""
    };
  }

  function sanitizeEcuInfoValue(value) {
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeEcuInfoValue(item)).filter((item) => item !== null && item !== "");
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeEcuInfoValue(item)]));
    }
    const text = String(value ?? "").trim();
    return text ? text.slice(0, 240) : "";
  }

  function maskSensitiveIdentifier(value) {
    const text = String(value ?? "").trim().toUpperCase();
    if (!text) return "";
    const redacted = redactSensitiveText(text);
    if (redacted !== text) return "[識別情報検出: 非保存]";
    return text.length > 6 ? `${text.slice(0, 3)}...${text.slice(-3)}` : "[識別情報検出: マスク済み]";
  }

  function parseObdHexBytes(value) {
    if (Array.isArray(value)) {
      return value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 0 && item <= 255);
    }
    const text = String(value || "")
      .replace(/\b(?:SEARCHING|BUS INIT|OK|NO DATA|STOPPED|ERROR|UNABLE TO CONNECT)\b/gi, " ")
      .replace(/[>:]/g, " ");
    return (text.match(/\b[0-9A-F]{2}\b/gi) || []).map((byte) => parseInt(byte, 16));
  }

  function decodeObdDtcResponse(input = {}) {
    const bytes = parseObdHexBytes(input.bytes || input.raw || input.response || input);
    const serviceByte = bytes.find((byte) => byte === 0x43 || byte === 0x47 || byte === 0x4A);
    if (serviceByte === undefined) {
      return normalizeDtcSnapshot({
        source: input.source || "obd_response_decoder",
        capturedAt: input.captured_at || input.capturedAt || null,
        protocol: input.protocol || null,
        dtcs: []
      });
    }
    const start = bytes.indexOf(serviceByte) + 1;
    const codes = [];
    for (let index = start; index + 1 < bytes.length; index += 2) {
      const high = bytes[index];
      const low = bytes[index + 1];
      if (high === 0 && low === 0) continue;
      codes.push(decodeDtcPair(high, low));
    }
    const status = serviceByte === 0x47 ? "pending" : serviceByte === 0x4A ? "permanent" : "stored";
    return normalizeDtcSnapshot({
      source: input.source || "obd_response_decoder",
      captured_at: input.captured_at || input.capturedAt || null,
      protocol: input.protocol || null,
      status,
      dtcs: [...new Set(codes)].map((code) => ({ code, status }))
    });
  }

  function mergeDtcSnapshots(...snapshots) {
    const rows = snapshots
      .filter((snapshot) => snapshot && Array.isArray(snapshot.dtcs))
      .flatMap((snapshot) => snapshot.dtcs.map((row) => ({ ...row, source: row.source || snapshot.source || "diagnostic_core" })));
    const byCodeAndStatus = new Map();
    rows.forEach((row) => {
      const key = `${row.code || ""}::${row.status || "unknown"}`;
      if (row.code && !byCodeAndStatus.has(key)) byCodeAndStatus.set(key, row);
    });
    const mergedRows = [...byCodeAndStatus.values()];
    return {
      schemaVersion: "dtc_snapshot_v1",
      source: "merged_dtc_snapshots",
      capturedAt: snapshots.find((item) => item?.capturedAt)?.capturedAt || null,
      protocol: snapshots.find((item) => item?.protocol)?.protocol || null,
      codes: [...new Set(mergedRows.map((row) => row.code))],
      dtcs: mergedRows,
      retainedRawText: false
    };
  }

  function decodeDtcPair(high, low) {
    const system = ["P", "C", "B", "U"][(high & 0xC0) >> 6];
    const first = ((high & 0x30) >> 4).toString(16).toUpperCase();
    const second = (high & 0x0F).toString(16).toUpperCase();
    const third = ((low & 0xF0) >> 4).toString(16).toUpperCase();
    const fourth = (low & 0x0F).toString(16).toUpperCase();
    return `${system}${first}${second}${third}${fourth}`;
  }

  function decodeSupportedPidResponse(input = {}) {
    const bytes = parseObdHexBytes(input.bytes || input.raw || input.response || input);
    const serviceIndex = bytes.findIndex((byte, index) => byte === 0x41 && Number.isInteger(bytes[index + 1]));
    if (serviceIndex < 0 || serviceIndex + 5 >= bytes.length) {
      return buildSupportedPidMatrix({ source: input.source || "obd_response_decoder", supportedPids: [] });
    }
    const basePid = bytes[serviceIndex + 1];
    const bitBytes = bytes.slice(serviceIndex + 2, serviceIndex + 6);
    const supportedPids = [];
    bitBytes.forEach((byte, byteIndex) => {
      for (let bit = 7; bit >= 0; bit--) {
        if (byte & (1 << bit)) {
          supportedPids.push((basePid + byteIndex * 8 + (8 - bit)).toString(16).toUpperCase().padStart(2, "0"));
        }
      }
    });
    return buildSupportedPidMatrix({
      source: input.source || "obd_response_decoder",
      captured_at: input.captured_at || input.capturedAt || null,
      supported_pids: supportedPids
    });
  }

  function decodeLivePidResponse(input = {}) {
    const bytes = parseObdHexBytes(input.bytes || input.raw || input.response || input);
    const values = [];
    for (let index = 0; index < bytes.length - 2; index++) {
      if (bytes[index] !== 0x41) continue;
      const pid = bytes[index + 1].toString(16).toUpperCase().padStart(2, "0");
      const decoded = decodeStandardPidValue(pid, bytes.slice(index + 2, index + 2 + getStandardPidPayloadLength(pid)));
      if (Array.isArray(decoded)) values.push(...decoded);
      else if (decoded) values.push(decoded);
    }
    return normalizeBridgeLivePidSnapshot({
      ok: true,
      blocked: false,
      would_transmit: false,
      data: {
        protocol: input.protocol || null,
        supported_pids: [],
        values,
        captured_at: input.captured_at || input.capturedAt || null
      }
    });
  }

  function decodeFreezeFrameResponse(input = {}) {
    const bytes = parseObdHexBytes(input.bytes || input.raw || input.response || input);
    const values = [];
    let triggerDtc = null;

    for (let index = 0; index < bytes.length - 2; index++) {
      if (bytes[index] !== 0x42) continue;
      const pid = bytes[index + 1].toString(16).toUpperCase().padStart(2, "0");
      const frameNumber = bytes[index + 2];
      const payload = bytes.slice(index + 3, index + 3 + getStandardPidPayloadLength(pid));
      if (pid === "02" && Number.isInteger(payload[0]) && Number.isInteger(payload[1])) {
        const decoded = decodeDtcPair(payload[0], payload[1]);
        if (decoded !== "P0000") triggerDtc = decoded;
        continue;
      }
      const decoded = decodeStandardPidValue(pid, payload);
      if (Array.isArray(decoded)) values.push(...decoded.map((item) => ({ ...item, freeze_frame_number: frameNumber })));
      else if (decoded) values.push({ ...decoded, freeze_frame_number: frameNumber });
    }

    return normalizeFreezeFrameSnapshot({
      source: input.source || "obd_response_decoder",
      captured_at: input.captured_at || input.capturedAt || null,
      protocol: input.protocol || null,
      trigger_dtc: triggerDtc,
      values
    });
  }

  function decodeEcuInfoResponse(input = {}) {
    const bytes = parseObdHexBytes(input.bytes || input.raw || input.response || input);
    const values = [];

    for (let index = 0; index < bytes.length - 2; index++) {
      if (bytes[index] !== 0x49) continue;
      const infoType = bytes[index + 1].toString(16).toUpperCase().padStart(2, "0");
      const nextSegment = bytes.findIndex((byte, nextIndex) => nextIndex > index && byte === 0x49);
      const end = nextSegment > index ? nextSegment : bytes.length;
      const payload = trimEcuInfoPayload(bytes.slice(index + 2, end));
      const catalogItem = ecuInfoItemCatalog.find((item) => item.infoType === infoType);
      if (!catalogItem) continue;
      values.push({
        id: catalogItem.id,
        info_type: infoType,
        value: decodeEcuInfoPayload(payload, catalogItem.valueType)
      });
    }

    return normalizeEcuInfoSnapshot({
      source: input.source || "obd_response_decoder",
      captured_at: input.captured_at || input.capturedAt || null,
      protocol: input.protocol || null,
      values
    });
  }

  function decodeReadinessResponse(input = {}) {
    const bytes = parseObdHexBytes(input.bytes || input.raw || input.response || input);
    const serviceIndex = bytes.findIndex((byte, index) => byte === 0x41 && bytes[index + 1] === 0x01);
    if (serviceIndex < 0 || serviceIndex + 5 >= bytes.length) {
      return normalizeReadinessSnapshot({
        source: input.source || "obd_response_decoder",
        captured_at: input.captured_at || input.capturedAt || null,
        monitors: []
      });
    }
    const a = bytes[serviceIndex + 2];
    const b = bytes[serviceIndex + 3];
    const c = bytes[serviceIndex + 4];
    const d = bytes[serviceIndex + 5];
    const compressionIgnition = (b & 0x08) !== 0;
    const monitorBits = compressionIgnition
      ? [
          ["misfire", b, 0x10, 0x40],
          ["fuel_system", b, 0x20, 0x80],
          ["comprehensive_component", c, 0x01, 0x10],
          ["nox_scr", c, 0x02, 0x20],
          ["boost_pressure", c, 0x04, 0x40],
          ["exhaust_gas_sensor", c, 0x08, 0x80],
          ["pm_filter", d, 0x01, 0x10],
          ["egr_vvt", d, 0x02, 0x20]
        ]
      : [
          ["misfire", b, 0x10, 0x40],
          ["fuel_system", b, 0x20, 0x80],
          ["comprehensive_component", c, 0x01, 0x10],
          ["catalyst", c, 0x02, 0x20],
          ["heated_catalyst", c, 0x04, 0x40],
          ["evaporative_system", c, 0x08, 0x80],
          ["secondary_air", d, 0x01, 0x10],
          ["oxygen_sensor", d, 0x02, 0x20],
          ["oxygen_sensor_heater", d, 0x04, 0x40],
          ["egr_vvt", d, 0x08, 0x80]
        ];
    const monitors = monitorBits.map(([id, byte, supportedBit, incompleteBit]) => {
      const supported = (byte & supportedBit) !== 0;
      const complete = supported ? (byte & incompleteBit) === 0 : false;
      return { id, supported, complete, status: supported ? (complete ? "complete" : "not_complete") : "not_supported" };
    });

    return normalizeReadinessSnapshot({
      source: input.source || "obd_response_decoder",
      captured_at: input.captured_at || input.capturedAt || null,
      mil_on: (a & 0x80) !== 0,
      monitors
    });
  }

  function decodeOnboardMonitorResponse(input = {}) {
    const bytes = parseObdHexBytes(input.bytes || input.raw || input.response || input);
    const tests = [];
    for (let index = 0; index < bytes.length - 8; index++) {
      if (bytes[index] !== 0x46) continue;
      const testId = bytes[index + 1].toString(16).toUpperCase().padStart(2, "0");
      const componentId = bytes[index + 2].toString(16).toUpperCase().padStart(2, "0");
      const value = (bytes[index + 3] * 256) + bytes[index + 4];
      const min = (bytes[index + 5] * 256) + bytes[index + 6];
      const max = (bytes[index + 7] * 256) + bytes[index + 8];
      tests.push({ test_id: testId, component_id: componentId, value, min, max });
      index += 8;
    }

    return normalizeOnboardMonitorSnapshot({
      source: input.source || "obd_response_decoder",
      captured_at: input.captured_at || input.capturedAt || null,
      protocol: input.protocol || null,
      tests
    });
  }

  function buildDecodedObdScanSession(input = {}) {
    const dtcSnapshot = input.dtcSnapshot?.schemaVersion
      ? input.dtcSnapshot
      : input.storedDtcResponse || input.pendingDtcResponse || input.permanentDtcResponse
        ? mergeDtcSnapshots(
            input.storedDtcResponse?.schemaVersion ? input.storedDtcResponse : decodeObdDtcResponse(input.storedDtcResponse || {}),
            input.pendingDtcResponse?.schemaVersion ? input.pendingDtcResponse : decodeObdDtcResponse(input.pendingDtcResponse || {}),
            input.permanentDtcResponse?.schemaVersion ? input.permanentDtcResponse : decodeObdDtcResponse(input.permanentDtcResponse || {})
          )
        : input.dtcResponse?.schemaVersion ? input.dtcResponse : decodeObdDtcResponse(input.dtcResponse || {});
    const livePidSnapshot = input.livePidResponse?.monitorValues ? input.livePidResponse : decodeLivePidResponse(input.livePidResponse || {});
    const freezeFrameSnapshot = input.freezeFrameResponse?.schemaVersion ? input.freezeFrameResponse : decodeFreezeFrameResponse(input.freezeFrameResponse || {});
    const readinessSnapshot = input.readinessResponse?.schemaVersion ? input.readinessResponse : decodeReadinessResponse(input.readinessResponse || {});
    const onboardMonitorSnapshot = input.onboardMonitorResponse?.schemaVersion ? input.onboardMonitorResponse : decodeOnboardMonitorResponse(input.onboardMonitorResponse || {});
    const ecuInfoSnapshot = input.ecuInfoResponse?.schemaVersion ? input.ecuInfoResponse : decodeEcuInfoResponse(input.ecuInfoResponse || {});
    const supportedPidMatrix = input.supportedPidResponse?.schemaVersion ? input.supportedPidResponse : decodeSupportedPidResponse(input.supportedPidResponse || {});
    return buildDiagnosticScanSession({
      source: "obd_response_decoder",
      session_id: input.session_id || input.sessionId || "decoded_obd_scan_session",
      started_at: input.started_at || input.startedAt || null,
      ended_at: input.ended_at || input.endedAt || null,
      vehicleProfile: input.vehicleProfile || input.vehicle_profile || null,
      dtcSnapshot,
      livePidSnapshot,
      freezeFrameSnapshot,
      readinessSnapshot,
      onboardMonitorSnapshot,
      ecuInfoSnapshot,
      supportedPidMatrix,
      ecus: input.ecus || []
    });
  }

  function normalizeObdLogLine(line) {
    return String(line || "")
      .replace(/\b(?:SEARCHING|BUS INIT|OK|NO DATA|STOPPED|ERROR|UNABLE TO CONNECT)\b/gi, " ")
      .replace(/^[>\s]+/, "")
      .trim();
  }

  function classifyObdResponseLines(value) {
    const raw = String(value || "");
    const redacted = redactSensitiveText(raw);
    const buckets = {
      storedDtcResponses: [],
      pendingDtcResponses: [],
      permanentDtcResponses: [],
      supportedPidResponses: [],
      livePidResponses: [],
      freezeFrameResponses: [],
      readinessResponses: [],
      onboardMonitorResponses: [],
      ecuInfoResponses: [],
      unknownResponses: []
    };

    redacted.split(/\r?\n/).forEach((line) => {
      const normalized = normalizeObdLogLine(line);
      if (!normalized) return;
      const bytes = parseObdHexBytes(normalized);
      if (!bytes.length) return;
      const positiveServices = [0x41, 0x42, 0x43, 0x46, 0x47, 0x49, 0x4A];
      const serviceIndex = bytes.findIndex((byte) => positiveServices.includes(byte));
      const serviceByte = serviceIndex >= 0 ? bytes[serviceIndex] : null;
      const hasPair = (first, second) => bytes.some((byte, index) => byte === first && bytes[index + 1] === second);
      const packet = { bytes, response: bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ") };

      if (serviceByte === 0x43) {
        buckets.storedDtcResponses.push(packet);
      } else if (serviceByte === 0x47) {
        buckets.pendingDtcResponses.push(packet);
      } else if (serviceByte === 0x4A) {
        buckets.permanentDtcResponses.push(packet);
      } else if (hasPair(0x41, 0x00) || hasPair(0x41, 0x20) || hasPair(0x41, 0x40) || hasPair(0x41, 0x60) || hasPair(0x41, 0x80)) {
        buckets.supportedPidResponses.push(packet);
      } else if (hasPair(0x41, 0x01)) {
        buckets.readinessResponses.push(packet);
      } else if (serviceByte === 0x41) {
        buckets.livePidResponses.push(packet);
      } else if (serviceByte === 0x42) {
        buckets.freezeFrameResponses.push(packet);
      } else if (serviceByte === 0x46) {
        buckets.onboardMonitorResponses.push(packet);
      } else if (serviceByte === 0x49) {
        buckets.ecuInfoResponses.push(packet);
      } else {
        buckets.unknownResponses.push(packet);
      }
    });

    const bucketCounts = Object.fromEntries(Object.entries(buckets).map(([key, rows]) => [key, rows.length]));
    return {
      schemaVersion: "obd_response_line_classification_v1",
      bucketCounts,
      responseBuckets: buckets,
      lineCount: raw ? raw.split(/\r?\n/).length : 0,
      hadSensitiveIdentifier: raw !== redacted,
      sourceLength: raw.length,
      retainedRawText: false,
      wouldTransmit: false,
      vehicleCommandEnabled: false
    };
  }

  function buildScanSessionFromObdText(value, options = {}) {
    const classified = classifyObdResponseLines(value);
    const firstOrEmpty = (bucketName) => classified.responseBuckets[bucketName]?.map((row) => row.response).join(" ") || "";
    const session = buildDecodedObdScanSession({
      session_id: options.session_id || options.sessionId || "obd_text_scan_session",
      started_at: options.started_at || options.startedAt || null,
      ended_at: options.ended_at || options.endedAt || null,
      vehicleProfile: options.vehicleProfile || options.vehicle_profile || null,
      storedDtcResponse: { raw: firstOrEmpty("storedDtcResponses"), protocol: options.protocol || null },
      pendingDtcResponse: { raw: firstOrEmpty("pendingDtcResponses"), protocol: options.protocol || null },
      permanentDtcResponse: { raw: firstOrEmpty("permanentDtcResponses"), protocol: options.protocol || null },
      supportedPidResponse: { raw: firstOrEmpty("supportedPidResponses"), protocol: options.protocol || null },
      livePidResponse: { raw: firstOrEmpty("livePidResponses"), protocol: options.protocol || null },
      freezeFrameResponse: { raw: firstOrEmpty("freezeFrameResponses"), protocol: options.protocol || null },
      readinessResponse: { raw: firstOrEmpty("readinessResponses"), protocol: options.protocol || null },
      onboardMonitorResponse: { raw: firstOrEmpty("onboardMonitorResponses"), protocol: options.protocol || null },
      ecuInfoResponse: { raw: firstOrEmpty("ecuInfoResponses"), protocol: options.protocol || null }
    });

    return {
      ...session,
      source: "obd_text_import",
      importClassification: {
        schemaVersion: classified.schemaVersion,
        bucketCounts: classified.bucketCounts,
        lineCount: classified.lineCount
      },
      hadSensitiveIdentifier: classified.hadSensitiveIdentifier || session.ecuInfoSnapshot?.hadSensitiveIdentifier === true,
      sourceLength: classified.sourceLength,
      retainedRawText: false,
      retainedRawFrames: false,
      wouldTransmit: false,
      vehicleCommandEnabled: false
    };
  }

  function trimEcuInfoPayload(payload) {
    const cleaned = [...payload];
    while (cleaned.length && (cleaned[0] === 0x00 || cleaned[0] <= 0x20)) cleaned.shift();
    return cleaned;
  }

  function decodeEcuInfoPayload(payload, valueType) {
    if (!payload.length) return "";
    const printable = payload.every((byte) => byte >= 0x20 && byte <= 0x7E);
    if (valueType === "counter_set" || !printable) {
      return payload.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
    }
    return payload.map((byte) => String.fromCharCode(byte)).join("").trim();
  }

  function decodeStandardPidValue(pid, dataBytes) {
    const definition = monitorDefinitions.find((item) => item.service === "01" && item.pid === pid);
    if (!definition) return null;
    const a = dataBytes[0];
    const b = dataBytes[1];
    const c = dataBytes[2];
    const d = dataBytes[3];
    if (!Number.isInteger(a)) return null;
    const word = () => Number.isInteger(b) ? (a * 256) + b : null;
    const signedWord = () => {
      const raw = word();
      return raw === null ? null : raw > 0x7FFF ? raw - 0x10000 : raw;
    };
    let value = null;
    if (["14", "15", "16", "17", "18", "19", "1A", "1B"].includes(pid)) return decodeOxygenSensorPid(pid, a, b);
    if (["34", "35", "38", "39"].includes(pid)) return decodeWideOxygenCurrentPid(pid, a, b, c, d);
    if (pid === "03") value = decodeFuelSystemStatus(a, b);
    else if (pid === "12") value = decodeSecondaryAirStatus(a);
    else if (pid === "1C") value = decodeObdStandard(a);
    else if (pid === "51") value = decodeFuelType(a);
    else if ([
      "04", "11", "2C", "2E", "2F", "45", "47", "48", "49", "4A", "4B", "4C", "52", "5A", "5B", "A5"
    ].includes(pid)) value = a * 100 / 255;
    else if (["05", "0F", "46"].includes(pid)) value = a - 40;
    else if (["06", "07", "08", "09", "2D"].includes(pid)) value = (a - 128) * 100 / 128;
    else if (pid === "0A") value = a * 3;
    else if (pid === "0B" || pid === "33") value = a;
    else if (pid === "0C" && Number.isInteger(b)) value = ((a * 256) + b) / 4;
    else if (pid === "0D") value = a;
    else if (pid === "0E") value = (a / 2) - 64;
    else if (pid === "10" && Number.isInteger(b)) value = ((a * 256) + b) / 100;

    else if (["1F", "21", "31", "4D", "4E"].includes(pid)) value = word();
    else if (pid === "22") value = word() === null ? null : word() * 0.079;
    else if (pid === "23") value = word() === null ? null : word() * 10;
    else if ([
      "24", "25", "26", "27", "28", "29", "2A", "2B", "44"
    ].includes(pid)) value = word() === null ? null : word() / 32768;
    else if (pid === "30") value = a;
    else if (pid === "32") value = signedWord() === null ? null : signedWord() / 4;
    else if (["3C", "3D", "3E", "3F"].includes(pid)) value = word() === null ? null : word() / 10 - 40;
    else if (pid === "43") value = word() === null ? null : word() * 100 / 255;
    else if (pid === "42" && Number.isInteger(b)) value = ((a * 256) + b) / 1000;
    else if (pid === "5C") value = a - 40;
    else if (pid === "5D") value = word() === null ? null : (word() - 26880) / 128;
    else if (pid === "5E") value = word() === null ? null : word() * 0.05;
    else if (["61", "62", "8E"].includes(pid)) value = a - 125;
    else if (pid === "63") value = word();
    else if (pid === "64") return decodeEnginePercentTorqueData(pid, dataBytes);
    else if (definition.valueType === "text") value = dataBytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
    if (value === null || (typeof value === "number" && !Number.isFinite(value))) return null;
    return {
      id: definition.id,
      pid,
      value: typeof value === "number" ? Number(value.toFixed(3)) : value,
      unit: definition.unit
    };
  }

  function getStandardPidPayloadLength(pid) {
    return pid === "64" ? 5 : 4;
  }

  function decodeOxygenSensorPid(pid, a, b) {
    const voltageDefinition = monitorDefinitions.find((item) => item.service === "01" && item.pid === pid && item.id.endsWith("_voltage"));
    const trimDefinition = monitorDefinitions.find((item) => item.service === "01" && item.pid === pid && item.id.endsWith("_stft"));
    const values = [];
    if (voltageDefinition) {
      values.push({
        id: voltageDefinition.id,
        pid,
        value: Number((a / 200).toFixed(3)),
        unit: voltageDefinition.unit
      });
    }
    if (trimDefinition && Number.isInteger(b)) {
      values.push({
        id: trimDefinition.id,
        pid,
        value: Number((((b - 128) * 100 / 128)).toFixed(3)),
        unit: trimDefinition.unit
      });
    }
    return values.length ? values : null;
  }

  function decodeWideOxygenCurrentPid(pid, a, b, c, d) {
    if (!Number.isInteger(b) || !Number.isInteger(c) || !Number.isInteger(d)) return null;
    const currentDefinition = monitorDefinitions.find((item) => item.service === "01" && item.pid === pid && item.id.endsWith("_current"));
    const ratioDefinition = monitorDefinitions.find((item) => item.service === "01" && item.pid === pid && item.id.endsWith("_current_ratio"));
    const values = [];
    if (ratioDefinition) {
      values.push({
        id: ratioDefinition.id,
        pid,
        value: Number((((a * 256) + b) / 32768).toFixed(3)),
        unit: ratioDefinition.unit
      });
    }
    if (currentDefinition) {
      values.push({
        id: currentDefinition.id,
        pid,
        value: Number((((c * 256) + d) / 256 - 128).toFixed(3)),
        unit: currentDefinition.unit
      });
    }
    return values.length ? values : null;
  }

  function decodeEnginePercentTorqueData(pid, dataBytes) {
    const ids = [
      "engine_percent_torque_idle",
      "engine_percent_torque_point1",
      "engine_percent_torque_point2",
      "engine_percent_torque_point3",
      "engine_percent_torque_point4"
    ];
    const values = [];
    ids.forEach((id, index) => {
      const byte = dataBytes[index];
      const definition = monitorDefinitions.find((item) => item.service === "01" && item.pid === pid && item.id === id);
      if (!definition || !Number.isInteger(byte)) return;
      values.push({
        id,
        pid,
        value: byte - 125,
        unit: definition.unit
      });
    });
    return values.length ? values : null;
  }

  function decodeFuelSystemStatus(a, b) {
    const labels = {
      0x00: "open_loop_not_ready",
      0x01: "closed_loop_using_oxygen_sensor",
      0x02: "open_loop_due_to_engine_load_or_deceleration",
      0x04: "open_loop_due_to_system_failure",
      0x08: "closed_loop_with_oxygen_sensor_fault",
      0x10: "open_loop_due_to_insufficient_temperature"
    };
    const bank1 = labels[a] || `unknown_0x${a.toString(16).toUpperCase().padStart(2, "0")}`;
    const bank2 = Number.isInteger(b) && b !== 0 ? labels[b] || `unknown_0x${b.toString(16).toUpperCase().padStart(2, "0")}` : null;
    return bank2 ? `${bank1};${bank2}` : bank1;
  }

  function decodeSecondaryAirStatus(a) {
    const labels = {
      0x01: "upstream",
      0x02: "downstream_of_catalytic_converter",
      0x04: "from_outside_or_off",
      0x08: "pump_commanded_on_for_diagnostics"
    };
    return labels[a] || `unknown_0x${a.toString(16).toUpperCase().padStart(2, "0")}`;
  }

  function decodeObdStandard(a) {
    const labels = {
      0x01: "obd_ii_california_arb",
      0x02: "obd_federal_epa",
      0x03: "obd_and_obd_ii",
      0x04: "obd_i",
      0x05: "not_obd_compliant",
      0x06: "eobd",
      0x07: "eobd_and_obd_ii",
      0x08: "eobd_and_obd",
      0x09: "eobd_obd_and_obd_ii",
      0x0A: "jobd",
      0x0B: "jobd_and_obd_ii",
      0x0C: "jobd_and_eobd",
      0x0D: "jobd_eobd_and_obd_ii",
      0x11: "engine_manufacturer_diagnostics",
      0x13: "heavy_duty_obd",
      0x14: "wwh_obd"
    };
    return labels[a] || `unknown_0x${a.toString(16).toUpperCase().padStart(2, "0")}`;
  }

  function decodeFuelType(a) {
    const labels = {
      0x01: "gasoline",
      0x02: "methanol",
      0x03: "ethanol",
      0x04: "diesel",
      0x05: "lpg",
      0x06: "cng",
      0x07: "propane",
      0x08: "electric",
      0x09: "bifuel_gasoline",
      0x0A: "bifuel_methanol",
      0x0B: "bifuel_ethanol",
      0x0C: "bifuel_lpg",
      0x0D: "bifuel_cng",
      0x0E: "bifuel_propane",
      0x0F: "bifuel_electric",
      0x10: "bifuel_electric_combustion",
      0x11: "hybrid_gasoline",
      0x12: "hybrid_ethanol",
      0x13: "hybrid_diesel",
      0x14: "hybrid_electric",
      0x15: "hybrid_mixed_fuel",
      0x16: "hybrid_regenerative",
      0x17: "bifuel_diesel"
    };
    return labels[a] || `unknown_0x${a.toString(16).toUpperCase().padStart(2, "0")}`;
  }

  function buildSupportedPidMatrix(input = {}) {
    const source = input.source || "diagnostic_core";
    const supportedRows = Array.isArray(input) ? input : Array.isArray(input.supported_pids) ? input.supported_pids : Array.isArray(input.supportedPids) ? input.supportedPids : [];
    const supported = new Set(supportedRows
      .map((pid) => String(pid).toUpperCase().replace(/^0X/, "").padStart(2, "0")));
    const items = monitorDefinitions
      .filter((definition) => definition.service === "01" && definition.pid)
      .map((definition) => ({
        id: definition.id,
        label: definition.label,
        service: definition.service,
        pid: definition.pid,
        unit: definition.unit,
        category: definition.category,
        supported: supported.has(String(definition.pid).toUpperCase()),
        scope: definition.scope,
        supportNote: definition.supportNote
      }));

    return {
      schemaVersion: "supported_pid_matrix_v1",
      source,
      capturedAt: input.captured_at || input.capturedAt || null,
      supportedPids: [...supported],
      supportedCount: items.filter((item) => item.supported).length,
      knownPidCount: items.length,
      items,
      retainedRawText: false
    };
  }

  function buildDiagnosticScanSession(input = {}) {
    const dtcSnapshot = input.dtcSnapshot?.schemaVersion ? input.dtcSnapshot : normalizeDtcSnapshot(input.dtcSnapshot || input);
    const livePidSnapshot = input.livePidSnapshot?.monitorValues ? input.livePidSnapshot : normalizeBridgeLivePidSnapshot(input.livePidSnapshot || input.livePids || {});
    const freezeFrameSnapshot = input.freezeFrameSnapshot?.schemaVersion ? input.freezeFrameSnapshot : normalizeFreezeFrameSnapshot(input.freezeFrameSnapshot || input.freezeFrame || {});
    const readinessSnapshot = input.readinessSnapshot?.schemaVersion ? input.readinessSnapshot : normalizeReadinessSnapshot(input.readinessSnapshot || input.readiness || {});
    const onboardMonitorSnapshot = input.onboardMonitorSnapshot?.schemaVersion ? input.onboardMonitorSnapshot : normalizeOnboardMonitorSnapshot(input.onboardMonitorSnapshot || input.onboardMonitor || {});
    const ecuResponseSummary = input.ecuResponseSummary?.schemaVersion ? input.ecuResponseSummary : normalizeEcuResponseSummary(input.ecuResponseSummary || input.ecus || {});
    const ecuInfoSnapshot = input.ecuInfoSnapshot?.schemaVersion ? input.ecuInfoSnapshot : normalizeEcuInfoSnapshot(input.ecuInfoSnapshot || input.ecuInfo || {});
    const supportedPidMatrix = input.supportedPidMatrix?.schemaVersion ? input.supportedPidMatrix : buildSupportedPidMatrix(input.supportedPidMatrix || input.supportedPids || {});
    const connectionStatus = input.connectionStatus?.displayStatus ? input.connectionStatus : normalizeBridgeConnectionStatus(input.connectionStatus || {});
    const vciList = input.vciList?.devices ? input.vciList : normalizeBridgeVciList(input.vciList || {});
    const warnings = [];
    if (dtcSnapshot.codes.length) warnings.push("save_before_clear");
    if (freezeFrameSnapshot.monitorValues.length) warnings.push("freeze_frame_available");
    if (readinessSnapshot.incompleteCount > 0) warnings.push("readiness_incomplete");
    if (onboardMonitorSnapshot.failedCount > 0) warnings.push("onboard_monitor_test_failed");
    if (ecuInfoSnapshot.hadSensitiveIdentifier) warnings.push("sensitive_identifier_redacted");
    if (livePidSnapshot.monitorValues.length) warnings.push("compare_live_data_conditions");

    return {
      schemaVersion: "scan_session_v1",
      source: input.source || "diagnostic_core",
      sessionId: String(input.session_id || input.sessionId || "local_scan_session").slice(0, 80),
      startedAt: input.started_at || input.startedAt || null,
      endedAt: input.ended_at || input.endedAt || null,
      vehicleProfile: input.vehicleProfile || input.vehicle_profile || null,
      connectionStatus,
      vciDevices: vciList.devices || [],
      ecuResponseSummary,
      dtcSnapshot,
      freezeFrameSnapshot,
      readinessSnapshot,
      onboardMonitorSnapshot,
      ecuInfoSnapshot,
      livePidSnapshot,
      supportedPidMatrix,
      warnings,
      retainedRawText: false,
      retainedRawFrames: false,
      wouldTransmit: false,
      vehicleCommandEnabled: false
    };
  }

  function evaluateLocalBridgeRequest(request = {}) {
    const intent = String(request.intent || "").trim();
    const isAllowedRead = localBridgeContract.allowedReadIntents.includes(intent);
    const isBlockedWrite = localBridgeContract.blockedWriteIntents.includes(intent);
    const missingFields = localBridgeContract.requiredRequestFields.filter((field) => !request[field]);

    return {
      ok: false,
      blocked: true,
      wouldTransmit: false,
      bridgeConnectionEnabled: localBridgeContract.connectionEnabled,
      vehicleCommandEnabled: false,
      intent,
      missingFields,
      knownReadIntent: isAllowedRead,
      blockedWriteIntent: isBlockedWrite,
      response: createLocalBridgeBlockedResponse(intent, missingFields.length ? ["missing_required_fields"] : []),
      reason: localBridgeContract.connectionEnabled
        ? "ローカルブリッジ契約は定義済みですが、この画面ではまだ送信しません。"
        : "ローカルブリッジは準備中です。PC側ブリッジや車両へ送信しません。"
    };
  }

  function requestPreparedVehicleRequest(requestId) {
    const request = preparedVehicleRequests.find((item) => item.id === requestId);
    const label = request?.label || requestId || "unknown";
    const service = request?.service || null;
    const blockedByMode = service ? vehicleDamagePreventionInterlock.blockedServiceModes.includes(service) : false;

    return {
      ok: false,
      requestId,
      label,
      blocked: true,
      wouldTransmit: false,
      failClosed: vehicleDamagePreventionInterlock.failClosed,
      stateChanging: Boolean(request?.stateChanging),
      reason: request?.stateChanging
        ? "安全検証が完了するまで、状態変更コマンドは常に拒否します。"
        : "接続検証中のため、この画面から車両やアダプターへ送信しません。",
      safetyGate: request?.safetyGate || "送信無効",
      blockedByMode
    };
  }

  function evaluateOutboundSafety(request = {}) {
    const service = String(request.service || "").toUpperCase();
    const isBlockedService = vehicleDamagePreventionInterlock.blockedServiceModes.includes(service);
    const isStateChanging = Boolean(request.stateChanging) || isBlockedService;

    return {
      ok: false,
      blocked: true,
      wouldTransmit: false,
      failClosed: true,
      stateChanging: isStateChanging,
      service,
      reason: isStateChanging
        ? "車両状態を変更する可能性があるため、安全ゲート中は送信しません。"
        : "安全ゲート中は読取系を含む全てのアウトバウンド送信を停止します。"
    };
  }

  function requestVehicleOperation(operationId) {
    const operation = vehicleOperationPlan.find((item) => item.id === operationId);
    const label = operation?.label || operationId || "unknown";

    return {
      ok: false,
      operationId,
      label,
      blocked: true,
      reason: "安全検証中のため、この画面から車両へコマンドは送信しません。",
      requiredBeforeEnable: operation ? [...operation.requiredBeforeEnable] : []
    };
  }

  function configureMonitorDefinitions(rows) {
    if (!Array.isArray(rows) || !rows.length) return false;

    const normalized = rows
      .filter((item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.label === "string" &&
        typeof item.category === "string" &&
        Array.isArray(item.aliases) &&
        item.aliases.length
      )
      .map((item) => Object.freeze({
        id: item.id,
        label: item.label,
        unit: typeof item.unit === "string" ? item.unit : "",
        category: item.category,
        valueType: item.value_type === "text" ? "text" : "number",
        service: item.service || null,
        pid: item.pid || null,
        scope: item.scope || "unknown",
        supportNote: item.support_note || "",
        aliases: Object.freeze([...item.aliases])
      }));

    if (!normalized.length || new Set(normalized.map((item) => item.id)).size !== normalized.length) {
      return false;
    }

    monitorDefinitions = Object.freeze(normalized);
    return true;
  }

  function getMonitorDefinitions() {
    return monitorDefinitions;
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
      const valuePart = line.slice(separator + 1).trim();

      const definition = monitorDefinitions.find((item) =>
        item.aliases.some((alias) => labelPart === normalizeMonitorLabel(alias))
      );
      if (!definition) return;

      let parsedValue;
      if (definition.valueType === "text") {
        parsedValue = valuePart.slice(0, 160);
        if (!parsedValue) return;
      } else {
        const numberMatch = valuePart.replace(/(\d),(?=\d{3}\b)/g, "$1").match(NUMBER_PATTERN);
        if (!numberMatch) return;
        parsedValue = Number(numberMatch[0]);
        if (!Number.isFinite(parsedValue)) return;
      }

      values.set(definition.id, {
        id: definition.id,
        label: definition.label,
        value: parsedValue,
        unit: definition.unit,
        category: definition.category,
        valueType: definition.valueType,
        service: definition.service,
        pid: definition.pid,
        scope: definition.scope,
        supportNote: definition.supportNote,
        sourceLine: lineIndex + 1
      });
    });

    return [...values.values()];
  }

  function analyzeScannerText(value) {
    const raw = String(value || "");
    const redacted = redactSensitiveText(raw);
    const monitorValues = extractMonitorValues(redacted);

    return {
      codes: extractDtcCodes(redacted),
      monitorValues,
      monitorInsights: analyzeMonitorValues(monitorValues),
      hadSensitiveIdentifier: raw !== redacted,
      sourceLength: raw.length,
      retainedRawText: false
    };
  }

  function analyzeMonitorValues(values = []) {
    const byId = new Map(values.map((item) => [item.id, item]));
    const insights = [];
    const numeric = (id) => {
      const item = byId.get(id);
      return item && item.valueType !== "text" && Number.isFinite(item.value) ? item.value : null;
    };
    const add = (level, title, detail, nextStep) => {
      insights.push({ level, title, detail, nextStep });
    };

    const rpm = numeric("engine_speed");
    const speed = numeric("vehicle_speed");
    const voltage = numeric("control_module_voltage");
    const coolant = numeric("coolant_temp");
    const intakeTemp = numeric("intake_air_temp");
    const stftB1 = numeric("stft_b1");
    const ltftB1 = numeric("ltft_b1");
    const stftB2 = numeric("stft_b2");
    const ltftB2 = numeric("ltft_b2");
    const map = numeric("map");
    const baro = numeric("barometric_pressure");

    if (values.length >= 2) {
      add(
        "info",
        "単独値ではなく相関で見る",
        "貼り付け値を複数項目として読めました。正常/異常の断定ではなく、同じ測定条件で再取得した値と比較してください。",
        "冷間時、暖機後、症状再現時を同じ項目構成で保存する"
      );
    }

    if (rpm !== null && speed !== null && rpm === 0 && speed === 0) {
      add(
        "info",
        "キーON停止中の可能性",
        "エンジン回転数と車速がどちらも0です。運転中データとキーON停止中データは分けて扱います。",
        "エンジン運転中、アイドル、負荷時の値を別スナップショットで確認する"
      );
    }

    if (voltage !== null && voltage < 11.5) {
      add(
        "caution",
        "電源電圧を優先確認",
        "制御モジュール電圧が低めです。通信DTCやセンサーDTCが電源影響で出る場合があります。",
        "バッテリー状態、充電電圧、電源/アース電圧降下をメーカー整備書の条件で確認する"
      );
    } else if (voltage !== null && rpm !== null && rpm > 500 && voltage < 12.5) {
      add(
        "caution",
        "運転中電圧の確認が必要",
        "エンジン運転中と思われる条件で制御モジュール電圧が低めです。充電系や電源経路を先に確認します。",
        "オルタネーター出力、ベルト、電源配線、アースを実測する"
      );
    } else if (voltage !== null && voltage > 15.2) {
      add(
        "caution",
        "過電圧側の確認が必要",
        "制御モジュール電圧が高めです。過電圧は制御モジュールやセンサー値に影響します。",
        "充電制御、バッテリー端子、電圧検出線をメーカー整備書で確認する"
      );
    }

    addFuelTrimInsight("バンク1", stftB1, ltftB1, add);
    addFuelTrimInsight("バンク2", stftB2, ltftB2, add);

    if (coolant !== null && intakeTemp !== null && Math.abs(coolant - intakeTemp) >= 35) {
      add(
        "info",
        "温度条件を分けて比較",
        "冷却水温と吸気温の差が大きいスナップショットです。冷間時か暖機後かで判断が変わります。",
        "冷間始動直後と完全暖機後を分け、温度センサー値の立ち上がりを比較する"
      );
    }

    if (rpm !== null && rpm > 500 && speed !== null && speed === 0 && map !== null && map >= 60) {
      add(
        "info",
        "吸気圧は負荷条件と比較",
        "停止アイドルと思われる条件でMAPが高めに見えます。断定せず、回転数、負荷、スロットル、標高/大気圧と合わせます。",
        baro !== null
          ? "大気圧、MAP、MAF、スロットル開度を同時に記録して吸気漏れ、EGR、バルブタイミング、圧縮を切り分ける"
          : "大気圧または同条件の基準値を追加で取得して比較する"
      );
    }

    if (!insights.length && values.length) {
      add(
        "info",
        "追加条件で比較",
        "読めた値だけでは相関ヒントは限定的です。値を正常/異常と断定せず、症状再現条件で同じ項目を再取得してください。",
        "DTC、フリーズフレーム、冷間/暖機後/再現時のライブデータを並べて確認する"
      );
    }

    return insights.slice(0, 6);
  }

  function addFuelTrimInsight(bankLabel, shortTrim, longTrim, add) {
    if (shortTrim === null || longTrim === null) return;
    const total = shortTrim + longTrim;
    const absoluteTotal = Math.abs(total);

    if (absoluteTotal >= 15) {
      add(
        "caution",
        `${bankLabel}の燃料補正合計が大きい`,
        `短期補正と長期補正の合計が約${total.toFixed(1)}%です。リーン/リッチの原因を断定せず、条件をそろえて確認します。`,
        total > 0
          ? "吸気漏れ、燃圧不足、MAF/MAP、排気漏れ、O2/A/Fセンサー、燃料品質を順に確認する"
          : "燃圧過多、インジェクター漏れ、EVAPパージ、MAF/MAP、O2/A/Fセンサーを順に確認する"
      );
    } else if (absoluteTotal >= 8) {
      add(
        "info",
        `${bankLabel}の燃料補正を継続観察`,
        `短期補正と長期補正の合計が約${total.toFixed(1)}%です。単発値ではなく、アイドル/2500rpm/負荷時で傾向を見ます。`,
        "同じ燃料トリム項目を運転条件別に記録し、MAF/MAP、O2/A/F、燃圧と照合する"
      );
    }
  }

  window.ObdReadOnly = Object.freeze({
    policy,
    configureMonitorDefinitions,
    configureVehicleInterfaceCatalog,
    configureFreezeFrameItems,
    configureReadinessMonitors,
    configureEcuInfoItems,
    getMonitorDefinitions,
    getVehicleInterfaceCatalog,
    getFreezeFrameItems,
    getReadinessMonitors,
    getEcuInfoItems,
    getVehicleOperationPlan,
    getVehicleConnectionProfile,
    getVehicleDamagePreventionInterlock,
    getPreparedVehicleRequests,
    getAdvancedInterfaceRoadmap,
    getLocalBridgeContract,
    getLocalBridgeResponseSchemas,
    requestVehicleOperation,
    requestPreparedVehicleRequest,
    requestAdvancedInterface,
    evaluateLocalBridgeRequest,
    createLocalBridgeBlockedResponse,
    normalizeBridgeConnectionStatus,
    normalizeBridgeVciList,
    normalizeBridgeDtcSnapshot,
    normalizeBridgeLivePidSnapshot,
    buildBridgeSessionSummary,
    buildBridgeSessionExportPayload,
    buildBridgeDiagnosticImport,
    mergeDiagnosticInputs,
    normalizeDtcSnapshot,
    normalizeFreezeFrameSnapshot,
    normalizeReadinessSnapshot,
    normalizeEcuResponseSummary,
    normalizeEcuInfoSnapshot,
    normalizeOnboardMonitorSnapshot,
    parseObdHexBytes,
    decodeObdDtcResponse,
    mergeDtcSnapshots,
    decodeSupportedPidResponse,
    decodeLivePidResponse,
    decodeFreezeFrameResponse,
    decodeEcuInfoResponse,
    decodeReadinessResponse,
    decodeOnboardMonitorResponse,
    buildDecodedObdScanSession,
    classifyObdResponseLines,
    buildScanSessionFromObdText,
    buildSupportedPidMatrix,
    buildDiagnosticScanSession,
    evaluateOutboundSafety,
    getCapability,
    extractDtcCodes,
    extractMonitorValues,
    analyzeMonitorValues,
    redactSensitiveText,
    analyzeScannerText
  });
})();
