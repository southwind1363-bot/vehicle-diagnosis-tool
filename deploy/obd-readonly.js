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
    status: "read-only-browser-enabled",
    endpointOrigin: "http://127.0.0.1",
    endpointPortCandidates: Object.freeze([8765, 17653]),
    apiVersion: "v1",
    transport: "local-http-or-websocket",
    connectionEnabled: true,
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
      "read_permanent_dtc",
      "read_freeze_frame",
      "read_supported_pids",
      "read_ecu_info",
      "read_onboard_monitor",
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
      intent: "adapter_identity",
      label: "Adapter identity",
      dataShape: Object.freeze(["adapter_name", "adapter_family", "firmware_version", "vehicle_command_enabled"]),
      safeDefault: Object.freeze({
        adapter_name: null,
        adapter_family: null,
        firmware_version: null,
        vehicle_command_enabled: false
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
      intent: "read_pending_dtc",
      label: "Pending DTC snapshot",
      dataShape: Object.freeze(["protocol", "ecu_responses", "dtcs", "captured_at"]),
      safeDefault: Object.freeze({
        protocol: null,
        ecu_responses: Object.freeze([]),
        dtcs: Object.freeze([]),
        captured_at: null
      })
    }),
    Object.freeze({
      intent: "read_permanent_dtc",
      label: "Permanent DTC snapshot",
      dataShape: Object.freeze(["protocol", "ecu_responses", "dtcs", "captured_at"]),
      safeDefault: Object.freeze({
        protocol: null,
        ecu_responses: Object.freeze([]),
        dtcs: Object.freeze([]),
        captured_at: null
      })
    }),
    Object.freeze({
      intent: "read_freeze_frame",
      label: "Freeze frame snapshot",
      dataShape: Object.freeze(["protocol", "trigger_dtc", "values", "captured_at"]),
      safeDefault: Object.freeze({
        protocol: null,
        trigger_dtc: null,
        values: Object.freeze([]),
        captured_at: null
      })
    }),
    Object.freeze({
      intent: "read_supported_pids",
      label: "Supported PID snapshot",
      dataShape: Object.freeze(["protocol", "supported_pids", "captured_at"]),
      safeDefault: Object.freeze({
        protocol: null,
        supported_pids: Object.freeze([]),
        captured_at: null
      })
    }),
    Object.freeze({
      intent: "read_ecu_info",
      label: "ECU information snapshot",
      dataShape: Object.freeze(["protocol", "values", "captured_at"]),
      safeDefault: Object.freeze({
        protocol: null,
        values: Object.freeze([]),
        captured_at: null
      })
    }),
    Object.freeze({
      intent: "read_onboard_monitor",
      label: "On-board monitor snapshot",
      dataShape: Object.freeze(["protocol", "tests", "captured_at"]),
      safeDefault: Object.freeze({
        protocol: null,
        tests: Object.freeze([]),
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
  const bridgeComputedPidDefinitions = Object.freeze({
    mil_status: Object.freeze({ id: "mil_status", label: "MIL status", unit: "boolean", category: "readiness", valueType: "boolean", pid: "01" }),
    stored_dtc_count: Object.freeze({ id: "stored_dtc_count", label: "Stored DTC count", unit: "count", category: "readiness", valueType: "number", pid: "01" }),
    readiness_status_byte_b: Object.freeze({ id: "readiness_status_byte_b", label: "Readiness byte B", unit: "raw", category: "readiness", valueType: "number", pid: "01" }),
    readiness_status_byte_c: Object.freeze({ id: "readiness_status_byte_c", label: "Readiness byte C", unit: "raw", category: "readiness", valueType: "number", pid: "01" }),
    readiness_status_byte_d: Object.freeze({ id: "readiness_status_byte_d", label: "Readiness byte D", unit: "raw", category: "readiness", valueType: "number", pid: "01" }),
    readiness_flag_count: Object.freeze({ id: "readiness_flag_count", label: "Readiness flag count", unit: "count", category: "readiness", valueType: "number", pid: "01" })
  });

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
        progressPercent: Number.isFinite(Number(item.progress_percent)) ? Math.max(0, Math.min(100, Math.round(Number(item.progress_percent)))) : 0,
        currentBasis: item.current_basis || "",
        nextBuild: item.next_build || "",
        etaTarget: item.eta_target || "時期未定",
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

  function readBridgeResponseSafety(response = {}) {
    return {
      ok: response.ok === true,
      blocked: response.blocked !== false && response.isBlocked !== false,
      wouldTransmit: response.would_transmit === true || response.wouldTransmit === true
    };
  }

  function readBridgeProtocol(data = {}) {
    return data.protocol || data.obd_protocol || data.communication_protocol || data.communicationProtocol || data.protocol_name || data.protocolName || data.bus_protocol || data.busProtocol || null;
  }

  function normalizeBridgeDtcSnapshot(response = {}) {
    const data = response && typeof response === "object" ? response.data || response : {};
    const safety = readBridgeResponseSafety(response);
    const dtcRows = Array.isArray(data.dtcs) ? data.dtcs : Array.isArray(data.dtc_codes) ? data.dtc_codes : Array.isArray(data.dtcCodes) ? data.dtcCodes : [];
    const ecuRows = Array.isArray(data.ecu_responses) ? data.ecu_responses : Array.isArray(data.ecuResponses) ? data.ecuResponses : [];
    const intent = ["read_stored_dtc", "read_pending_dtc", "read_permanent_dtc"].includes(response.intent)
      ? response.intent
      : ["read_stored_dtc", "read_pending_dtc", "read_permanent_dtc"].includes(data.intent)
        ? data.intent
        : "read_stored_dtc";
    const defaultStatus = intent === "read_pending_dtc" ? "pending" : intent === "read_permanent_dtc" ? "permanent" : "stored";
    const entries = dtcRows.flatMap((row) => {
      if (typeof row === "string") return extractDtcCodes(row).map((code) => ({ code, status: defaultStatus }));
      if (!row || typeof row !== "object") return [];
      return extractDtcCodes(row.code || row.dtc || row.id || "").map((code) => ({
        code,
        status: row.status || row.kind || defaultStatus
      }));
    });
    const seen = new Set();
    const dtcs = entries.filter((entry) => {
      const key = `${entry.code}::${entry.status}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const codes = [...new Set(dtcs.map((item) => item.code))];

    return {
      source: "local_bridge",
      intent,
      ok: safety.ok,
      blocked: safety.blocked,
      wouldTransmit: safety.wouldTransmit,
      codes,
      dtcs: dtcs.map((item) => ({ ...item, source: "local_bridge" })),
      protocol: readBridgeProtocol(data),
      ecuResponses: ecuRows.map((row) => ({
        ecu: row?.ecu || row?.address || null,
        status: row?.status || "unknown",
        codeCount: Array.isArray(row?.dtcs) ? row.dtcs.length : Array.isArray(row?.dtc_codes) ? row.dtc_codes.length : Number.isInteger(row?.dtc_count) ? row.dtc_count : null
      })),
      capturedAt: data.captured_at || data.capturedAt || null,
      retainedRawText: false
    };
  }

  function normalizeBridgeConnectionStatus(response = {}) {
    const data = response && typeof response === "object" ? response.data || response : {};
    const safety = readBridgeResponseSafety(response);
    const status = String(data.status || "not_connected");
    const paired = data.paired === true || data.is_paired === true || data.isPaired === true;
    const vciConnected = data.vci_connected === true || data.vciConnected === true || data.vci_ready === true || data.vciReady === true;
    const vehicleConnected = data.vehicle_connected === true || data.vehicleConnected === true || data.car_connected === true || data.carConnected === true;
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
      displayStatus = "車両読取確認待ち";
      nextAction = "車両応答を取得する前に対応プロトコルと停止条件を確認します。";
    } else {
      displayStatus = "読取準備モデル";
      nextAction = "DTCとライブPIDを既存診断フローへ整形する準備だけを行います。";
    }

    return {
      source: "local_bridge",
      intent: "bridge_status",
      ok: safety.ok,
      blocked: safety.blocked,
      wouldTransmit: safety.wouldTransmit,
      bridgeVersion: data.bridge_version || data.bridgeVersion || null,
      apiVersion: data.api_version || data.apiVersion || localBridgeContract.apiVersion,
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
    const safety = readBridgeResponseSafety(response);
    const devices = Array.isArray(response)
      ? response
      : Array.isArray(data)
        ? data
        : Array.isArray(data.devices)
      ? data.devices
      : Array.isArray(data.vci_devices)
        ? data.vci_devices
        : Array.isArray(data.items)
          ? data.items
          : [];
    const selectedDeviceId = data.selected_device_id || data.selectedDeviceId || data.selected_vci_id || data.selectedVciId || null;
    const normalizedDevices = devices.map((device, index) => {
      const id = String(device?.id || device?.device_id || device?.deviceId || `vci_${index + 1}`).slice(0, 80);
      return {
        id,
        label: String(device?.label || device?.name || `VCI ${index + 1}`).slice(0, 80),
        vendor: device?.vendor ? String(device.vendor).slice(0, 80) : null,
        driverStatus: device?.driver_status || device?.driverStatus || data.driver_status || data.driverStatus || "unknown",
        connected: device?.connected === true || device?.is_connected === true || device?.isConnected === true,
        selected: selectedDeviceId ? id === selectedDeviceId : index === 0 && devices.length === 1,
        supportNote: "VCI識別情報は表示用に最小化し、シリアル番号などの生識別子は保持しません。"
      };
    });

    return {
      source: "local_bridge",
      intent: "list_vci",
      ok: safety.ok,
      blocked: safety.blocked,
      wouldTransmit: safety.wouldTransmit,
      driverStatus: data.driver_status || data.driverStatus || "not_checked",
      selectedDeviceId,
      devices: normalizedDevices,
      deviceCount: normalizedDevices.length,
      connectionEnabled: localBridgeContract.connectionEnabled,
      vehicleCommandEnabled: false,
      retainedRawText: false
    };
  }

  function normalizeBridgeAdapterIdentity(response = {}) {
    const data = response && typeof response === "object" ? response.data || response : {};
    const safety = readBridgeResponseSafety(response);
    return {
      source: "local_bridge",
      intent: "adapter_identity",
      ok: safety.ok,
      blocked: safety.blocked,
      wouldTransmit: safety.wouldTransmit,
      adapterName: data.adapter_name ? String(data.adapter_name).slice(0, 80) : data.adapterName ? String(data.adapterName).slice(0, 80) : data.name ? String(data.name).slice(0, 80) : data.adapter ? String(data.adapter).slice(0, 80) : null,
      adapterFamily: data.adapter_family ? String(data.adapter_family).slice(0, 80) : data.adapterFamily ? String(data.adapterFamily).slice(0, 80) : data.family ? String(data.family).slice(0, 80) : null,
      firmwareVersion: data.firmware_version ? String(data.firmware_version).slice(0, 80) : data.firmwareVersion ? String(data.firmwareVersion).slice(0, 80) : data.firmware ? String(data.firmware).slice(0, 80) : data.version ? String(data.version).slice(0, 80) : null,
      vehicleCommandEnabled: false,
      retainedRawText: false
    };
  }

  function normalizeBridgeLivePidSnapshot(response = {}) {
    const data = response && typeof response === "object" ? response.data || response : {};
    const safety = readBridgeResponseSafety(response);
    const values = Array.isArray(data.values)
      ? data.values
      : Array.isArray(data.monitor_values)
        ? data.monitor_values
        : Array.isArray(data.monitorValues)
          ? data.monitorValues
          : Array.isArray(data.pid_values)
            ? data.pid_values
            : Array.isArray(data.pidValues)
              ? data.pidValues
              : Array.isArray(data.live_pid_values)
                ? data.live_pid_values
                : Array.isArray(data.livePidValues)
                  ? data.livePidValues
                  : Array.isArray(data.live_data)
                    ? data.live_data
                    : Array.isArray(data.liveData)
                      ? data.liveData
                      : Array.isArray(data.items)
                        ? data.items
                        : [];
    const monitorValues = values
      .map((row, index) => normalizeBridgePidValue(row, index))
      .filter(Boolean);

    return {
      source: "local_bridge",
      intent: "read_live_pid_snapshot",
      ok: safety.ok,
      blocked: safety.blocked,
      wouldTransmit: safety.wouldTransmit,
      protocol: readBridgeProtocol(data),
      supportedPids: collectBridgeSupportedPids(data),
      capturedAt: data.captured_at || data.capturedAt || null,
      monitorValues,
      monitorValueSummary: buildMonitorValueSummary(monitorValues),
      monitorInsights: analyzeMonitorValues(monitorValues),
      retainedRawText: false
    };
  }

  function collectBridgeSupportedPids(data = {}) {
    if (Array.isArray(data.supported_pids)) return data.supported_pids;
    if (Array.isArray(data.supportedPids)) return data.supportedPids;
    const text = data.supported_pid_list || data.supportedPidsText || data.supported_pids_text || "";
    return typeof text === "string" && text.trim()
      ? text.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean)
      : [];
  }

  function normalizeBridgeSupportedPidSnapshot(response = {}) {
    const data = response && typeof response === "object" ? response.data || response : {};
    const safety = readBridgeResponseSafety(response);
    const supportedPids = collectBridgeSupportedPids(data);
    return {
      ...buildSupportedPidMatrix({
      source: "local_bridge",
      captured_at: data.captured_at || data.capturedAt || data.timestamp || null,
      protocol: readBridgeProtocol(data),
      supported_pids: supportedPids
      }),
      intent: "read_supported_pids",
      ok: safety.ok,
      blocked: safety.blocked,
      wouldTransmit: safety.wouldTransmit
    };
  }

  function normalizeBridgeFreezeFrameSnapshot(response = {}) {
    const data = response && typeof response === "object" ? response.data || response : {};
    const safety = readBridgeResponseSafety(response);
    return {
      ...normalizeFreezeFrameSnapshot({
      source: "local_bridge",
      captured_at: data.captured_at || data.capturedAt || null,
      protocol: readBridgeProtocol(data),
      trigger_dtc: data.trigger_dtc || data.triggerDtc || data.trigger_code || data.triggerCode || data.dtc || null,
      values: Array.isArray(data.values)
        ? data.values
        : Array.isArray(data.freeze_frame_values)
          ? data.freeze_frame_values
          : Array.isArray(data.freezeFrameValues)
            ? data.freezeFrameValues
          : Array.isArray(data.freeze_frame_rows)
            ? data.freeze_frame_rows
            : Array.isArray(data.freezeFrameRows)
              ? data.freezeFrameRows
          : Array.isArray(data.monitor_values)
            ? data.monitor_values
            : Array.isArray(data.monitorValues)
              ? data.monitorValues
            : Array.isArray(data.pid_values)
              ? data.pid_values
              : Array.isArray(data.pidValues)
                ? data.pidValues
            : []
      }),
      intent: "read_freeze_frame",
      ok: safety.ok,
      blocked: safety.blocked,
      wouldTransmit: safety.wouldTransmit
    };
  }

  function normalizeBridgeReadinessSnapshot(response = {}) {
    const data = response && typeof response === "object" ? response.data || response : {};
    const safety = readBridgeResponseSafety(response);
    const readinessRowIdAliases = {
      milstatus: "mil_status",
      mil: "mil_status",
      monitorstatusmil: "monitor_status_mil",
      readinessstatusbyteb: "readiness_status_byte_b",
      readinessstatusbytec: "readiness_status_byte_c",
      readinessstatusbyted: "readiness_status_byte_d",
      statusbyteb: "readiness_status_byte_b",
      statusbytec: "readiness_status_byte_c",
      statusbyted: "readiness_status_byte_d"
    };
    const rows = Array.isArray(data.values)
      ? data.values
      : Array.isArray(data.monitor_values)
        ? data.monitor_values
        : Array.isArray(data.monitorValues)
          ? data.monitorValues
          : Array.isArray(data.readiness_values)
            ? data.readiness_values
            : Array.isArray(data.readinessValues)
              ? data.readinessValues
              : Array.isArray(data.readiness_rows)
                ? data.readiness_rows
                : Array.isArray(data.readinessRows)
                  ? data.readinessRows
              : Array.isArray(response.monitorValues)
                ? response.monitorValues
                : [
            data.mil_on !== undefined ? { id: "mil_status", value: data.mil_on } : null,
            data.milStatus !== undefined ? { id: "mil_status", value: data.milStatus } : null,
            data.mil !== undefined ? { id: "mil_status", value: data.mil } : null,
            data.readiness_status_byte_b !== undefined ? { id: "readiness_status_byte_b", value: data.readiness_status_byte_b } : null,
            data.readiness_status_byte_c !== undefined ? { id: "readiness_status_byte_c", value: data.readiness_status_byte_c } : null,
            data.readiness_status_byte_d !== undefined ? { id: "readiness_status_byte_d", value: data.readiness_status_byte_d } : null,
            data.readinessStatusByteB !== undefined ? { id: "readiness_status_byte_b", value: data.readinessStatusByteB } : null,
            data.readinessStatusByteC !== undefined ? { id: "readiness_status_byte_c", value: data.readinessStatusByteC } : null,
            data.readinessStatusByteD !== undefined ? { id: "readiness_status_byte_d", value: data.readinessStatusByteD } : null,
            data.status_byte_b !== undefined ? { id: "readiness_status_byte_b", value: data.status_byte_b } : null,
            data.status_byte_c !== undefined ? { id: "readiness_status_byte_c", value: data.status_byte_c } : null,
            data.status_byte_d !== undefined ? { id: "readiness_status_byte_d", value: data.status_byte_d } : null,
            data.statusByteB !== undefined ? { id: "readiness_status_byte_b", value: data.statusByteB } : null,
            data.statusByteC !== undefined ? { id: "readiness_status_byte_c", value: data.statusByteC } : null,
            data.statusByteD !== undefined ? { id: "readiness_status_byte_d", value: data.statusByteD } : null
          ].filter(Boolean);
    const withBridgeMetadata = (snapshot) => ({
      ...snapshot,
      intent: "readiness_snapshot",
      ok: safety.ok,
      blocked: safety.blocked,
      wouldTransmit: safety.wouldTransmit
    });
    const valueById = new Map(rows.filter((row) => row && typeof row === "object").map((row) => {
      const rowKey = String(
        row.id || row.name || row.label || row.monitor_id || row.monitorId || row.status_id || row.statusId || ""
      ).toLowerCase().replace(/[^a-z0-9]+/g, "");
      const mappedId = readinessRowIdAliases[rowKey] || row.id || row.name || row.label;
      return [mappedId, row.value ?? row.result ?? row.raw_value ?? row.rawValue ?? row.reading];
    }));
    const b = Number(valueById.get("readiness_status_byte_b"));
    const c = Number(valueById.get("readiness_status_byte_c"));
    const d = Number(valueById.get("readiness_status_byte_d"));
    if (![b, c, d].every(Number.isFinite)) {
      return withBridgeMetadata(normalizeReadinessSnapshot({
        source: "local_bridge",
        captured_at: data.captured_at || data.capturedAt || response.capturedAt || null,
        protocol: readBridgeProtocol(data),
        monitors: []
      }));
    }
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
    return withBridgeMetadata(normalizeReadinessSnapshot({
      source: "local_bridge",
      captured_at: data.captured_at || data.capturedAt || response.capturedAt || null,
      protocol: readBridgeProtocol(data),
      mil_on: valueById.get("mil_status") === true || valueById.get("monitor_status_mil") === "mil_on",
      monitors: monitorBits.map(([id, byte, supportedBit, incompleteBit]) => {
        const supported = (byte & supportedBit) !== 0;
        const complete = supported ? (byte & incompleteBit) === 0 : false;
        return { id, supported, complete, status: supported ? (complete ? "complete" : "not_complete") : "not_supported" };
      })
    }));
  }

  function normalizeBridgeEcuInfoSnapshot(response = {}) {
    const data = response && typeof response === "object" ? response.data || response : {};
    const safety = readBridgeResponseSafety(response);
    return {
      ...normalizeEcuInfoSnapshot({
        ...data,
        source: "local_bridge",
        captured_at: data.captured_at || data.capturedAt || null,
        protocol: readBridgeProtocol(data)
      }),
      intent: "read_ecu_info",
      ok: safety.ok,
      blocked: safety.blocked,
      wouldTransmit: safety.wouldTransmit
    };
  }

  function normalizeBridgeOnboardMonitorSnapshot(response = {}) {
    const data = response && typeof response === "object" ? response.data || response : {};
    const safety = readBridgeResponseSafety(response);
    return {
      ...normalizeOnboardMonitorSnapshot({
      source: "local_bridge",
      captured_at: data.captured_at || data.capturedAt || null,
      protocol: readBridgeProtocol(data),
      tests: Array.isArray(data.tests)
        ? data.tests
        : Array.isArray(data.values)
          ? data.values
          : Array.isArray(data.mode06_tests)
            ? data.mode06_tests
            : Array.isArray(data.mode06Tests)
              ? data.mode06Tests
            : Array.isArray(data.mode06_rows)
              ? data.mode06_rows
              : Array.isArray(data.mode06Rows)
                ? data.mode06Rows
            : Array.isArray(data.monitor_tests)
              ? data.monitor_tests
              : Array.isArray(data.monitorTests)
                ? data.monitorTests
                : Array.isArray(data.test_rows)
                  ? data.test_rows
                  : Array.isArray(data.testRows)
                    ? data.testRows
                : Array.isArray(data.onboard_monitor_tests)
                  ? data.onboard_monitor_tests
                  : Array.isArray(data.onboardMonitorTests)
                    ? data.onboardMonitorTests
                    : []
      }),
      intent: "read_onboard_monitor",
      ok: safety.ok,
      blocked: safety.blocked,
      wouldTransmit: safety.wouldTransmit
    };
  }

  function normalizeBridgePidValue(row, index) {
    if (!row || typeof row !== "object") return null;
    const labelAlias = row.label || row.name || row.monitor_label || row.monitorLabel || row.monitor_name || row.monitorName || row.displayLabel || row.display_label || null;
    const id = String(row.id || row.monitor_id || row.monitorId || row.sensor_id || row.sensorId || row.pid || row.code || row.pid_code || row.pidCode || row.pid_id || row.pidId || "").trim();
    const normalizedLabelAlias = labelAlias ? normalizeMonitorLabel(labelAlias) : "";
    const definition = monitorDefinitions.find((item) => item.id === id)
      || monitorDefinitions.find((item) => item.pid === row.pid || item.pid === row.code || item.pid === row.pid_code || item.pid === row.pidCode || item.pid === row.pid_id || item.pid === row.pidId)
      || (normalizedLabelAlias ? monitorDefinitions.find((item) => item.aliases.some((alias) => isMonitorLabelMatch(normalizedLabelAlias, alias))) : null)
      || bridgeComputedPidDefinitions[id];
    if (!definition) return null;
    const isUndecodedRaw = row.decoded === false;
    const rawValue = row.value ?? row.result ?? row.reading ?? row.current_value ?? row.currentValue ?? row.display_value ?? row.displayValue ?? row.raw_value ?? row.rawValue ?? row.value_raw ?? row.valueRaw ?? null;
    const valueType = definition?.valueType || row.value_type || row.valueType || (typeof rawValue === "string" && !NUMBER_PATTERN.test(rawValue) ? "text" : "number");
    const parsedValue = valueType === "boolean" ? rawValue === true : valueType === "text" || isUndecodedRaw ? String(rawValue ?? "").slice(0, 160) : Number(rawValue);
    if (valueType === "number" && !isUndecodedRaw && !Number.isFinite(parsedValue)) return null;
    if (valueType === "text" && !parsedValue) return null;
    if (isUndecodedRaw && !parsedValue) return null;

    return {
      id: definition?.id || id,
      label: definition?.label || row.label || row.name || id,
      value: parsedValue,
      unit: definition?.unit || row.unit || row.units || "",
      category: definition?.category || row.category || "ブリッジ読取",
      valueType: isUndecodedRaw ? "raw_hex" : valueType,
      service: definition?.service || row.service || null,
      pid: definition?.pid || row.pid || row.pid_code || row.pidCode || row.pid_id || row.pidId || null,
      scope: definition?.scope || "local-bridge",
      supportNote: definition?.supportNote || "ローカルブリッジ応答を既存データモニター表示へ整形",
      freezeFrameNumber: Number.isInteger(row.freeze_frame_number) ? row.freeze_frame_number : Number.isInteger(row.freezeFrameNumber) ? row.freezeFrameNumber : null,
      decoded: isUndecodedRaw ? false : true,
      note: isUndecodedRaw ? row.note || "未換算RAW値" : row.note || null,
      sourceLine: index + 1
    };
  }

  function buildMonitorValueSummary(values = []) {
    const rows = Array.isArray(values) ? values : [];
    const undecodedRawCount = rows.filter((item) => item?.decoded === false || item?.valueType === "raw_hex").length;
    const numericCount = rows.filter((item) => item?.valueType !== "text" && item?.valueType !== "raw_hex" && Number.isFinite(item?.value)).length;
    const textCount = rows.filter((item) => item?.valueType === "text").length;
    return {
      totalCount: rows.length,
      decodedCount: Math.max(0, rows.length - undecodedRawCount),
      undecodedRawCount,
      numericCount,
      textCount
    };
  }

  function buildReadoutCoverageSnapshot(input = {}) {
    const connectionStatusInput = input.connectionStatus || input.connection_status || input.connectionStatusResponse || input.connection_status_response || {};
    const vciDevicesInput = input.vciDevices || input.vci_devices || input.vciList || input.vci_list || input.listVciResponse || input.list_vci_response || [];
    const adapterIdentityInput = input.adapterIdentity || input.adapter_identity || input.adapterIdentityResponse || input.adapter_identity_response || {};
    const dtcSnapshotInput = input.dtcSnapshot || input.dtc_snapshot || {};
    const livePidSnapshotInput = input.livePidSnapshot || input.live_pid_snapshot || input.livePidResponse || input.live_pid_response || {};
    const freezeFrameSnapshotInput = input.freezeFrameSnapshot || input.freeze_frame_snapshot || input.freezeFrameResponse || input.freeze_frame_response || {};
    const readinessSnapshotInput = input.readinessSnapshot || input.readiness_snapshot || input.readinessResponse || input.readiness_response || {};
    const ecuInfoSnapshotInput = input.ecuInfoSnapshot || input.ecu_info_snapshot || input.ecuInfoResponse || input.ecu_info_response || {};
    const onboardMonitorSnapshotInput = input.onboardMonitorSnapshot || input.onboard_monitor_snapshot || input.onboardMonitorResponse || input.onboard_monitor_response || {};
    const supportedPidMatrixInput = input.supportedPidMatrix || input.supported_pid_matrix || input.supportedPidSnapshot || input.supported_pid_snapshot || input.supportedPidResponse || input.supported_pid_response || {};
    const hasConnectionStatusInput = hasObjectContent(connectionStatusInput);
    const hasAdapterIdentityInput = hasObjectContent(adapterIdentityInput);
    const hasDtcSnapshotInput = hasObjectContent(dtcSnapshotInput);
    const hasLivePidSnapshotInput = hasObjectContent(livePidSnapshotInput);
    const hasFreezeFrameSnapshotInput = hasObjectContent(freezeFrameSnapshotInput);
    const hasReadinessSnapshotInput = hasObjectContent(readinessSnapshotInput);
    const hasEcuInfoSnapshotInput = hasObjectContent(ecuInfoSnapshotInput);
    const hasOnboardMonitorSnapshotInput = hasObjectContent(onboardMonitorSnapshotInput);
    const hasSupportedPidMatrixInput = hasObjectContent(supportedPidMatrixInput);
    const includeInfrastructureInput = pickDefined(input.includeInfrastructure, input.include_infrastructure);
    const includeInfrastructure = includeInfrastructureInput === true
      ? true
      : includeInfrastructureInput === false
        ? false
        : hasConnectionStatusInput
          || (Array.isArray(vciDevicesInput) && vciDevicesInput.length > 0)
          || Boolean(vciDevicesInput?.devices?.length)
          || hasAdapterIdentityInput;
    const connectionStatus = hasConnectionStatusInput
      ? (connectionStatusInput?.displayStatus ? connectionStatusInput : normalizeBridgeConnectionStatus(connectionStatusInput))
      : null;
    const vciDevices = Array.isArray(vciDevicesInput)
      ? vciDevicesInput
      : (vciDevicesInput?.devices || normalizeBridgeVciList(vciDevicesInput).devices);
    const adapterIdentity = hasAdapterIdentityInput
      ? (adapterIdentityInput?.intent === "adapter_identity" ? adapterIdentityInput : normalizeBridgeAdapterIdentity(adapterIdentityInput))
      : null;
    const dtcSnapshot = hasDtcSnapshotInput
      ? (dtcSnapshotInput?.codes ? dtcSnapshotInput : normalizeBridgeDtcSnapshot(dtcSnapshotInput))
      : null;
    const livePidSnapshot = hasLivePidSnapshotInput
      ? (livePidSnapshotInput?.monitorValues
          ? livePidSnapshotInput
          : (livePidSnapshotInput?.raw || livePidSnapshotInput?.response || Array.isArray(livePidSnapshotInput?.bytes))
            ? decodeLivePidResponse(livePidSnapshotInput)
            : normalizeBridgeLivePidSnapshot(livePidSnapshotInput))
      : null;
    const freezeFrameSnapshot = hasFreezeFrameSnapshotInput
      ? (freezeFrameSnapshotInput?.schemaVersion ? freezeFrameSnapshotInput : normalizeBridgeFreezeFrameSnapshot(freezeFrameSnapshotInput))
      : null;
    const readinessSnapshot = hasReadinessSnapshotInput
      ? (readinessSnapshotInput?.schemaVersion ? readinessSnapshotInput : normalizeBridgeReadinessSnapshot(readinessSnapshotInput))
      : null;
    const ecuInfoSnapshot = hasEcuInfoSnapshotInput
      ? (ecuInfoSnapshotInput?.schemaVersion ? ecuInfoSnapshotInput : normalizeBridgeEcuInfoSnapshot(ecuInfoSnapshotInput))
      : null;
    const onboardMonitorSnapshot = hasOnboardMonitorSnapshotInput
      ? (onboardMonitorSnapshotInput?.schemaVersion ? onboardMonitorSnapshotInput : normalizeBridgeOnboardMonitorSnapshot(onboardMonitorSnapshotInput))
      : null;
    const supportedPidMatrix = hasSupportedPidMatrixInput
      ? (supportedPidMatrixInput?.schemaVersion
          ? supportedPidMatrixInput
          : (supportedPidMatrixInput?.raw || supportedPidMatrixInput?.response || Array.isArray(supportedPidMatrixInput?.bytes))
            ? decodeSupportedPidResponse(supportedPidMatrixInput)
            : normalizeBridgeSupportedPidSnapshot(supportedPidMatrixInput))
      : null;
    const items = [
      ...(includeInfrastructure ? [
      {
        id: "connection_status",
        label: "接続状態",
        available: Boolean(connectionStatus?.displayStatus),
        count: connectionStatus?.displayStatus ? 1 : 0
      },
      {
        id: "vci_devices",
        label: "VCI一覧",
        available: Array.isArray(vciDevices) && vciDevices.length > 0,
        count: Array.isArray(vciDevices) ? vciDevices.length : 0
      },
      {
        id: "adapter_identity",
        label: "アダプター情報",
        available: Boolean(adapterIdentity?.adapterName || adapterIdentity?.adapterFamily || adapterIdentity?.firmwareVersion),
        count: adapterIdentity?.adapterName || adapterIdentity?.adapterFamily || adapterIdentity?.firmwareVersion ? 1 : 0
      },
      ] : []),
      {
        id: "dtc_snapshot",
        label: "DTC",
        available: dtcSnapshot?.blocked === false || Array.isArray(dtcSnapshot?.codes),
        count: Array.isArray(dtcSnapshot?.codes) ? dtcSnapshot.codes.length : 0
      },
      {
        id: "live_pid_snapshot",
        label: "ライブPID",
        available: livePidSnapshot?.blocked === false || Array.isArray(livePidSnapshot?.monitorValues),
        count: Array.isArray(livePidSnapshot?.monitorValues) ? livePidSnapshot.monitorValues.length : 0
      },
      {
        id: "freeze_frame_snapshot",
        label: "フリーズフレーム",
        available: freezeFrameSnapshot?.blocked === false || Array.isArray(freezeFrameSnapshot?.monitorValues),
        count: Array.isArray(freezeFrameSnapshot?.monitorValues) ? freezeFrameSnapshot.monitorValues.length : 0
      },
      {
        id: "readiness_snapshot",
        label: "レディネス",
        available: readinessSnapshot?.blocked === false || Array.isArray(readinessSnapshot?.monitors),
        count: Array.isArray(readinessSnapshot?.monitors) ? readinessSnapshot.monitorCount || readinessSnapshot.monitors.length : 0
      },
      {
        id: "ecu_info_snapshot",
        label: "ECU情報",
        available: ecuInfoSnapshot?.blocked === false || Array.isArray(ecuInfoSnapshot?.items),
        count: Array.isArray(ecuInfoSnapshot?.items) ? ecuInfoSnapshot.itemCount || ecuInfoSnapshot.items.length : 0
      },
      {
        id: "onboard_monitor_snapshot",
        label: "Mode06",
        available: onboardMonitorSnapshot?.blocked === false || Array.isArray(onboardMonitorSnapshot?.tests),
        count: Array.isArray(onboardMonitorSnapshot?.tests) ? onboardMonitorSnapshot.testCount || onboardMonitorSnapshot.tests.length : 0
      },
      {
        id: "supported_pid_matrix",
        label: "対応PID",
        available: supportedPidMatrix?.blocked === false || Array.isArray(supportedPidMatrix?.supportedPids),
        count: Array.isArray(supportedPidMatrix?.supportedPids) ? supportedPidMatrix.supportedCount || supportedPidMatrix.supportedPids.length : 0
      }
    ].map((item) => Object.freeze({
      ...item,
      status: item.available ? (item.count > 0 ? "captured" : "empty") : "missing"
    }));
    const availableCount = items.filter((item) => item.available).length;
    const capturedItems = items.filter((item) => item.status === "captured");
    const emptyItems = items.filter((item) => item.status === "empty");
    const missingItems = items.filter((item) => !item.available);
    const pendingItems = [...emptyItems, ...missingItems];
    const capturedIds = capturedItems.map((item) => item.id);
    const capturedLabels = capturedItems.map((item) => item.label);
    const pendingIds = pendingItems.map((item) => item.id);
    const pendingLabels = pendingItems.map((item) => item.label);
    const nextPendingItem = pendingItems[0] || null;
    const nextEmptyItem = emptyItems[0] || null;
    const nextMissingItem = missingItems[0] || null;
    const recommendedNextItem = nextMissingItem || nextEmptyItem || null;
    const blockingReasonIds = [
      missingItems.length > 0 ? "missing_readouts" : null,
      emptyItems.length > 0 ? "empty_readouts" : null
    ].filter(Boolean);
    const blockingReasonById = {
      missing_readouts: { id: "missing_readouts", count: missingItems.length, readoutIds: missingItems.map((item) => item.id), readoutLabels: missingItems.map((item) => item.label) },
      empty_readouts: { id: "empty_readouts", count: emptyItems.length, readoutIds: emptyItems.map((item) => item.id), readoutLabels: emptyItems.map((item) => item.label) }
    };
    const primaryBlockingReasonId = blockingReasonIds[0] || null;
    const primaryBlockingReason = primaryBlockingReasonId ? blockingReasonById[primaryBlockingReasonId] : null;
    const itemById = items.reduce((byId, item) => {
      byId[item.id] = item;
      return byId;
    }, {});
    const itemsByStatus = {
      captured: capturedItems,
      empty: emptyItems,
      missing: missingItems
    };
    const coverageCompletionSummary = {
      schemaVersion: "readout_coverage_completion_v1",
      complete: pendingItems.length === 0,
      status: pendingItems.length === 0 ? "complete" : "collecting_readouts",
      analysisReady: pendingItems.length === 0,
      analysisBlocked: pendingItems.length > 0,
      blockingReasonIds,
      blockingReasonCount: blockingReasonIds.length,
      blockingReasonById,
      blockingReasonDetails: blockingReasonIds.map((id) => blockingReasonById[id]),
      primaryBlockingReasonId,
      primaryBlockingReason,
      primaryBlockingReadoutId: primaryBlockingReason?.readoutIds?.[0] || null,
      primaryBlockingReadoutLabel: primaryBlockingReason?.readoutLabels?.[0] || null,
      hasPendingReadouts: pendingItems.length > 0,
      hasMissingReadouts: missingItems.length > 0,
      hasEmptyReadouts: emptyItems.length > 0,
      requiredCount: items.length,
      capturedCount: capturedItems.length,
      emptyCount: emptyItems.length,
      missingCount: missingItems.length,
      pendingCount: pendingItems.length,
      capturedPercent: items.length > 0 ? Math.round((capturedItems.length / items.length) * 100) : 0,
      pendingPercent: items.length > 0 ? Math.round((pendingItems.length / items.length) * 100) : 0,
      nextPendingId: nextPendingItem?.id || null,
      nextPendingLabel: nextPendingItem?.label || null,
      nextPendingStatus: nextPendingItem?.status || null,
      nextEmptyId: nextEmptyItem?.id || null,
      nextEmptyLabel: nextEmptyItem?.label || null,
      nextMissingId: nextMissingItem?.id || null,
      nextMissingLabel: nextMissingItem?.label || null,
      recommendedNextReadoutId: recommendedNextItem?.id || null,
      recommendedNextReadoutLabel: recommendedNextItem?.label || null,
      recommendedNextReadoutStatus: recommendedNextItem?.status || null,
      recommendedNextReadoutReason: recommendedNextItem
        ? recommendedNextItem.status === "missing" ? "missing_readout" : "empty_readout"
        : null,
      capturedIds,
      pendingIds,
      emptyIds: emptyItems.map((item) => item.id),
      missingIds: missingItems.map((item) => item.id)
    };

    return {
      schemaVersion: "readout_coverage_v1",
      includeInfrastructure,
      totalCategories: items.length,
      availableCategories: availableCount,
      capturedCategories: capturedItems.length,
      emptyCategories: emptyItems.length,
      missingCategories: missingItems.length,
      capturedPercent: Math.round((capturedItems.length / items.length) * 100),
      progressPercent: Math.round((availableCount / items.length) * 100),
      items,
      itemById,
      itemsByStatus,
      completionSummary: coverageCompletionSummary,
      capturedIds,
      capturedLabels,
      pendingIds,
      pendingLabels,
      emptyIds: emptyItems.map((item) => item.id),
      emptyLabels: emptyItems.map((item) => item.label),
      missingIds: missingItems.map((item) => item.id),
      missingLabels: missingItems.map((item) => item.label)
    };
  }

  function buildCoreReadoutInventorySummary({
    readoutCoverage = null,
    dtcSnapshot = {},
    livePidSnapshot = {},
    freezeFrameSnapshot = {},
    readinessSnapshot = {},
    ecuInfoSnapshot = {},
    onboardMonitorSnapshot = {},
    supportedPidMatrix = {}
  } = {}) {
    const coverage = normalizeReadoutCoverageSnapshot(readoutCoverage || {});
    const countItems = (items) => Array.isArray(items) ? items.length : 0;
    const numericCount = (...values) => {
      for (const value of values) {
        if (Number.isFinite(Number(value))) return Math.max(0, Math.round(Number(value)));
      }
      return 0;
    };
    const definitions = [
      { id: "dtc_snapshot", count: countItems(dtcSnapshot?.codes), valueKey: "dtcCount" },
      { id: "live_pid_snapshot", count: countItems(livePidSnapshot?.monitorValues), valueKey: "livePidValueCount" },
      { id: "freeze_frame_snapshot", count: countItems(freezeFrameSnapshot?.monitorValues), valueKey: "freezeFrameValueCount" },
      { id: "readiness_snapshot", count: numericCount(readinessSnapshot?.monitorCount, countItems(readinessSnapshot?.monitors)), valueKey: "readinessMonitorCount" },
      { id: "ecu_info_snapshot", count: numericCount(ecuInfoSnapshot?.itemCount, countItems(ecuInfoSnapshot?.items)), valueKey: "ecuInfoItemCount" },
      { id: "onboard_monitor_snapshot", count: numericCount(onboardMonitorSnapshot?.testCount, countItems(onboardMonitorSnapshot?.tests)), valueKey: "onboardMonitorTestCount" },
      { id: "supported_pid_matrix", count: numericCount(supportedPidMatrix?.supportedCount, countItems(supportedPidMatrix?.supportedPids)), valueKey: "supportedPidCount" }
    ];
    const items = definitions.map((item) => {
      const coverageItem = coverage.itemById?.[item.id] || null;
      const status = item.count > 0 ? "captured" : coverageItem?.status || "missing";
      return {
        ...item,
        label: coverageItem?.label || item.id,
        status,
        captured: status === "captured",
        empty: status === "empty",
        missing: status === "missing"
      };
    });
    const itemById = items.reduce((byId, item) => {
      byId[item.id] = item;
      return byId;
    }, {});
    const countsById = items.reduce((counts, item) => {
      counts[item.id] = item.count;
      return counts;
    }, {});
    const capturedIds = items.filter((item) => item.captured).map((item) => item.id);
    const emptyIds = items.filter((item) => item.empty).map((item) => item.id);
    const missingIds = items.filter((item) => item.missing).map((item) => item.id);
    const pendingIds = [...missingIds, ...emptyIds];
    const attemptedIds = [...capturedIds, ...emptyIds];
    const nextPendingReadoutId = pendingIds[0] || null;
    const nextPendingReadout = nextPendingReadoutId ? itemById[nextPendingReadoutId] || null : null;
    const totalValueCount = items.reduce((total, item) => total + item.count, 0);
    const percent = (count) => items.length > 0 ? Math.round((count / items.length) * 100) : 0;
    return {
      schemaVersion: "core_readout_inventory_v1",
      totalReadoutCount: items.length,
      capturedReadoutCount: capturedIds.length,
      emptyReadoutCount: emptyIds.length,
      missingReadoutCount: missingIds.length,
      pendingReadoutCount: pendingIds.length,
      attemptedReadoutCount: attemptedIds.length,
      capturedReadoutPercent: percent(capturedIds.length),
      attemptedReadoutPercent: percent(attemptedIds.length),
      pendingReadoutPercent: percent(pendingIds.length),
      totalValueCount,
      countsById,
      itemById,
      itemsByStatus: {
        captured: items.filter((item) => item.captured),
        empty: items.filter((item) => item.empty),
        missing: items.filter((item) => item.missing)
      },
      items,
      capturedIds,
      emptyIds,
      missingIds,
      pendingIds,
      attemptedIds,
      nextPendingReadoutId,
      nextPendingReadoutStatus: nextPendingReadout?.status || null,
      nextPendingReadoutLabel: nextPendingReadout?.label || null,
      allReadoutsAttempted: missingIds.length === 0,
      valueCaptureComplete: pendingIds.length === 0,
      hasDtcCodes: countsById.dtc_snapshot > 0,
      hasLivePidValues: countsById.live_pid_snapshot > 0,
      hasFreezeFrameValues: countsById.freeze_frame_snapshot > 0,
      hasReadinessMonitors: countsById.readiness_snapshot > 0,
      hasEcuInfoItems: countsById.ecu_info_snapshot > 0,
      hasOnboardMonitorTests: countsById.onboard_monitor_snapshot > 0,
      hasSupportedPids: countsById.supported_pid_matrix > 0,
      readinessIncompleteCount: numericCount(readinessSnapshot?.incompleteCount),
      ecuInfoMissingKeyCount: numericCount(ecuInfoSnapshot?.keyItemSummary?.missingCount),
      rawPidUndecodedCount: numericCount(livePidSnapshot?.monitorValueSummary?.undecodedRawCount) + numericCount(freezeFrameSnapshot?.monitorValueSummary?.undecodedRawCount)
    };
  }

  function normalizeReadoutCoverageSnapshot(input = {}) {
    if (!input || typeof input !== "object") return buildReadoutCoverageSnapshot();
    const totalCategoriesInput = pickDefined(input.totalCategories, input.total_categories, input.requiredCount, input.required_count, input.totalCount, input.total_count, input.totalReadoutCount, input.total_readout_count);
    const availableCategoriesInput = pickDefined(input.availableCategories, input.available_categories, input.availableCount, input.available_count, input.attemptedCount, input.attempted_count, input.attemptedReadoutCount, input.attempted_readout_count);
    const capturedCategoriesInput = pickDefined(input.capturedCategories, input.captured_categories, input.capturedCount, input.captured_count, input.capturedReadoutCount, input.captured_readout_count);
    const emptyCategoriesInput = pickDefined(input.emptyCategories, input.empty_categories, input.emptyCount, input.empty_count, input.emptyReadoutCount, input.empty_readout_count);
    const missingCategoriesInput = pickDefined(input.missingCategories, input.missing_categories, input.missingCount, input.missing_count, input.missingReadoutCount, input.missing_readout_count);
    const totalCategories = Number.isFinite(Number(totalCategoriesInput)) ? Math.max(0, Math.round(Number(totalCategoriesInput))) : 0;
    const availableCategories = Number.isFinite(Number(availableCategoriesInput)) ? Math.max(0, Math.round(Number(availableCategoriesInput))) : 0;
    const capturedCategories = Number.isFinite(Number(capturedCategoriesInput)) ? Math.max(0, Math.round(Number(capturedCategoriesInput))) : 0;
    const emptyCategories = Number.isFinite(Number(emptyCategoriesInput)) ? Math.max(0, Math.round(Number(emptyCategoriesInput))) : 0;
    const missingCategories = Number.isFinite(Number(missingCategoriesInput)) ? Math.max(0, Math.round(Number(missingCategoriesInput))) : 0;
    const computedCapturedPercent = totalCategories > 0 ? Math.round((capturedCategories / totalCategories) * 100) : 0;
    const computedProgressPercent = totalCategories > 0 ? Math.round((availableCategories / totalCategories) * 100) : 0;
    const normalizedItems = Array.isArray(input.items) ? input.items.map((item) => (item && typeof item === "object" ? { ...item } : item)) : [];
    const itemById = normalizedItems.reduce((byId, item) => {
      if (item && typeof item === "object" && item.id) byId[item.id] = item;
      return byId;
    }, {});
    const itemsByStatus = ["captured", "empty", "missing"].reduce((byStatus, status) => {
      byStatus[status] = normalizedItems.filter((item) => item && typeof item === "object" && item.status === status);
      return byStatus;
    }, {});
    const capturedItems = itemsByStatus.captured || [];
    const pendingItems = [...(itemsByStatus.empty || []), ...(itemsByStatus.missing || [])];
    const emptyIdsInput = pickDefined(input.emptyIds, input.empty_ids, input.emptyReadoutIds, input.empty_readout_ids);
    const emptyLabelsInput = pickDefined(input.emptyLabels, input.empty_labels, input.emptyReadoutLabels, input.empty_readout_labels);
    const missingIdsInput = pickDefined(input.missingIds, input.missing_ids, input.missingReadoutIds, input.missing_readout_ids);
    const missingLabelsInput = pickDefined(input.missingLabels, input.missing_labels, input.missingReadoutLabels, input.missing_readout_labels);
    const capturedIdsInput = pickDefined(input.capturedIds, input.captured_ids, input.capturedReadoutIds, input.captured_readout_ids);
    const capturedLabelsInput = pickDefined(input.capturedLabels, input.captured_labels, input.capturedReadoutLabels, input.captured_readout_labels);
    const pendingIdsInput = pickDefined(input.pendingIds, input.pending_ids, input.pendingReadoutIds, input.pending_readout_ids);
    const pendingLabelsInput = pickDefined(input.pendingLabels, input.pending_labels, input.pendingReadoutLabels, input.pending_readout_labels);
    const normalizedEmptyIds = Array.isArray(emptyIdsInput) ? [...emptyIdsInput] : [];
    const normalizedEmptyLabels = Array.isArray(emptyLabelsInput) ? [...emptyLabelsInput] : [];
    const normalizedMissingIds = Array.isArray(missingIdsInput) ? [...missingIdsInput] : [];
    const normalizedMissingLabels = Array.isArray(missingLabelsInput) ? [...missingLabelsInput] : [];
    const normalizedCapturedIds = Array.isArray(capturedIdsInput) ? [...capturedIdsInput] : capturedItems.map((item) => item.id);
    const normalizedCapturedLabels = Array.isArray(capturedLabelsInput) ? [...capturedLabelsInput] : capturedItems.map((item) => item.label);
    const normalizedPendingIds = Array.isArray(pendingIdsInput) ? [...pendingIdsInput] : [...normalizedEmptyIds, ...normalizedMissingIds].length > 0 ? [...normalizedEmptyIds, ...normalizedMissingIds] : pendingItems.map((item) => item.id);
    const normalizedPendingLabels = Array.isArray(pendingLabelsInput) ? [...pendingLabelsInput] : [...normalizedEmptyLabels, ...normalizedMissingLabels].length > 0 ? [...normalizedEmptyLabels, ...normalizedMissingLabels] : pendingItems.map((item) => item.label);
    const normalizedNextPendingId = normalizedPendingIds[0] || null;
    const normalizedNextPendingItem = normalizedNextPendingId ? itemById[normalizedNextPendingId] || null : null;
    const normalizedNextPendingStatus = normalizedNextPendingItem?.status
      || (normalizedNextPendingId && normalizedEmptyIds.includes(normalizedNextPendingId) ? "empty" : null)
      || (normalizedNextPendingId && normalizedMissingIds.includes(normalizedNextPendingId) ? "missing" : null);
    const normalizedNextEmptyId = normalizedEmptyIds[0] || null;
    const normalizedNextMissingId = normalizedMissingIds[0] || null;
    const normalizedNextEmptyItem = normalizedNextEmptyId ? itemById[normalizedNextEmptyId] || null : null;
    const normalizedNextMissingItem = normalizedNextMissingId ? itemById[normalizedNextMissingId] || null : null;
    const normalizedRecommendedNextReadoutId = normalizedNextMissingId || normalizedNextEmptyId || null;
    const normalizedRecommendedNextReadoutItem = normalizedRecommendedNextReadoutId ? itemById[normalizedRecommendedNextReadoutId] || null : null;
    const normalizedRecommendedNextReadoutStatus = normalizedRecommendedNextReadoutItem?.status
      || (normalizedRecommendedNextReadoutId && normalizedMissingIds.includes(normalizedRecommendedNextReadoutId) ? "missing" : null)
      || (normalizedRecommendedNextReadoutId && normalizedEmptyIds.includes(normalizedRecommendedNextReadoutId) ? "empty" : null);
    const normalizedBlockingReasonIds = [
      normalizedMissingIds.length > 0 ? "missing_readouts" : null,
      normalizedEmptyIds.length > 0 ? "empty_readouts" : null
    ].filter(Boolean);
    const normalizedBlockingReasonById = {
      missing_readouts: { id: "missing_readouts", count: normalizedMissingIds.length, readoutIds: normalizedMissingIds, readoutLabels: normalizedMissingLabels },
      empty_readouts: { id: "empty_readouts", count: normalizedEmptyIds.length, readoutIds: normalizedEmptyIds, readoutLabels: normalizedEmptyLabels }
    };
    const normalizedPrimaryBlockingReasonId = normalizedBlockingReasonIds[0] || null;
    const normalizedPrimaryBlockingReason = normalizedPrimaryBlockingReasonId ? normalizedBlockingReasonById[normalizedPrimaryBlockingReasonId] : null;
    const completionSummaryInput = pickDefined(input.completionSummary, input.completion_summary, {});
    const coverageCompletionSummary = {
      ...(completionSummaryInput && typeof completionSummaryInput === "object" ? completionSummaryInput : {}),
      schemaVersion: "readout_coverage_completion_v1",
      complete: normalizedPendingIds.length === 0,
      status: normalizedPendingIds.length === 0 ? "complete" : "collecting_readouts",
      analysisReady: normalizedPendingIds.length === 0,
      analysisBlocked: normalizedPendingIds.length > 0,
      blockingReasonIds: normalizedBlockingReasonIds,
      blockingReasonCount: normalizedBlockingReasonIds.length,
      blockingReasonById: normalizedBlockingReasonById,
      blockingReasonDetails: normalizedBlockingReasonIds.map((id) => normalizedBlockingReasonById[id]),
      primaryBlockingReasonId: normalizedPrimaryBlockingReasonId,
      primaryBlockingReason: normalizedPrimaryBlockingReason,
      primaryBlockingReadoutId: normalizedPrimaryBlockingReason?.readoutIds?.[0] || null,
      primaryBlockingReadoutLabel: normalizedPrimaryBlockingReason?.readoutLabels?.[0] || null,
      hasPendingReadouts: normalizedPendingIds.length > 0,
      hasMissingReadouts: normalizedMissingIds.length > 0,
      hasEmptyReadouts: normalizedEmptyIds.length > 0,
      requiredCount: totalCategories,
      capturedCount: capturedCategories,
      emptyCount: emptyCategories,
      missingCount: missingCategories,
      pendingCount: normalizedPendingIds.length,
      capturedPercent: computedCapturedPercent,
      pendingPercent: totalCategories > 0 ? Math.round((normalizedPendingIds.length / totalCategories) * 100) : 0,
      nextPendingId: normalizedNextPendingId,
      nextPendingLabel: normalizedPendingLabels[0] || normalizedNextPendingItem?.label || null,
      nextPendingStatus: normalizedNextPendingStatus,
      nextEmptyId: normalizedNextEmptyId,
      nextEmptyLabel: normalizedEmptyLabels[0] || normalizedNextEmptyItem?.label || null,
      nextMissingId: normalizedNextMissingId,
      nextMissingLabel: normalizedMissingLabels[0] || normalizedNextMissingItem?.label || null,
      recommendedNextReadoutId: normalizedRecommendedNextReadoutId,
      recommendedNextReadoutLabel: normalizedRecommendedNextReadoutStatus === "missing"
        ? normalizedMissingLabels[0] || normalizedRecommendedNextReadoutItem?.label || null
        : normalizedEmptyLabels[0] || normalizedRecommendedNextReadoutItem?.label || null,
      recommendedNextReadoutStatus: normalizedRecommendedNextReadoutStatus,
      recommendedNextReadoutReason: normalizedRecommendedNextReadoutStatus
        ? normalizedRecommendedNextReadoutStatus === "missing" ? "missing_readout" : "empty_readout"
        : null,
      capturedIds: normalizedCapturedIds,
      pendingIds: normalizedPendingIds,
      emptyIds: normalizedEmptyIds,
      missingIds: normalizedMissingIds
    };
    return {
      ...input,
      schemaVersion: input.schemaVersion || input.schema_version || "readout_coverage_v1",
      includeInfrastructure: pickDefined(input.includeInfrastructure, input.include_infrastructure) === true,
      totalCategories,
      availableCategories,
      capturedCategories,
      emptyCategories,
      missingCategories,
      capturedPercent: Number.isFinite(Number(pickDefined(input.capturedPercent, input.captured_percent))) ? Math.max(0, Math.min(100, Math.round(Number(pickDefined(input.capturedPercent, input.captured_percent))))) : computedCapturedPercent,
      progressPercent: Number.isFinite(Number(pickDefined(input.progressPercent, input.progress_percent))) ? Math.max(0, Math.min(100, Math.round(Number(pickDefined(input.progressPercent, input.progress_percent))))) : computedProgressPercent,
      items: normalizedItems,
      itemById,
      itemsByStatus,
      completionSummary: coverageCompletionSummary,
      capturedIds: normalizedCapturedIds,
      capturedLabels: normalizedCapturedLabels,
      pendingIds: normalizedPendingIds,
      pendingLabels: normalizedPendingLabels,
      emptyIds: normalizedEmptyIds,
      emptyLabels: normalizedEmptyLabels,
      missingIds: normalizedMissingIds,
      missingLabels: normalizedMissingLabels
    };
  }

  function normalizeVehicleApplicabilitySnapshot(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const candidateRanges = Array.isArray(source.candidateRanges) ? source.candidateRanges : Array.isArray(source.candidate_ranges) ? source.candidate_ranges : Array.isArray(source.candidates) ? source.candidates : [];
    const applicableRanges = Array.isArray(source.applicableRanges) ? source.applicableRanges : Array.isArray(source.applicable_ranges) ? source.applicable_ranges : Array.isArray(source.matchedRanges) ? source.matchedRanges : Array.isArray(source.matched_ranges) ? source.matched_ranges : [];
    const supportedEngineCodes = Array.isArray(source.supportedEngineCodes) ? source.supportedEngineCodes : Array.isArray(source.supported_engine_codes) ? source.supported_engine_codes : Array.isArray(source.engineCodes) ? source.engineCodes : Array.isArray(source.engine_codes) ? source.engine_codes : [];
    const toCount = (...values) => {
      for (const value of values) {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric >= 0) return numeric;
      }
      return 0;
    };
    const maker = source.maker || source.make || source.manufacturer || source.brand || source.oem || null;
    const model = source.model || source.modelName || source.model_name || source.vehicleModel || source.vehicle_model || null;
    const modelCode = source.modelCode || source.model_code || source.chassisCode || source.chassis_code || source.frameCode || source.frame_code || null;
    const year = source.year || source.modelYear || source.model_year || source.registrationYear || source.registration_year || null;
    const engineCode = source.engineCode || source.engine_code || source.engine || source.engineModel || source.engine_model || null;
    const catalogMatched = source.catalogMatched === true || source.catalog_matched === true || source.catalogMatch === true || source.catalog_match === true || source.matched === true;
    const yearMatched = source.yearMatched === true || source.year_matched === true || source.yearMatch === true || source.year_match === true;
    const engineMatched = source.engineMatched === true || source.engine_matched === true || source.engineMatch === true || source.engine_match === true;
    const modelCodeMatched = source.modelCodeMatched === true || source.model_code_matched === true || source.modelCodeMatch === true || source.model_code_match === true;
    const candidateRangeCount = toCount(source.candidateRangeCount, source.candidate_range_count, candidateRanges.length);
    const applicableRangeCount = toCount(source.applicableRangeCount, source.applicable_range_count, applicableRanges.length);
    const supportedEngineCodeCount = toCount(source.supportedEngineCodeCount, source.supported_engine_code_count, supportedEngineCodes.length);
    const providedStatus = typeof source.status === "string" ? source.status.trim() : typeof source.applicabilityStatus === "string" ? source.applicabilityStatus.trim() : typeof source.applicability_status === "string" ? source.applicability_status.trim() : "";
    const summaryLabel = source.summaryLabel || source.summary_label || source.displayLabel || source.display_label || source.summary || source.label || null;
    let status = providedStatus;
    if (!status) {
      if (!maker && !model && !modelCode && !year && !engineCode) {
        status = "unknown";
      } else if (!catalogMatched) {
        status = "unlisted";
      } else if ((!year || yearMatched) && (!engineCode || engineMatched) && (!modelCode || modelCodeMatched)) {
        status = "matched";
      } else {
        status = "partial";
      }
    }
    return {
      schemaVersion: "vehicle_applicability_v1",
      maker,
      model,
      modelCode,
      year,
      engineCode,
      catalogMatched,
      yearMatched,
      engineMatched,
      modelCodeMatched,
      candidateRangeCount,
      applicableRangeCount,
      supportedEngineCodeCount,
      status,
      summaryLabel
    };
  }

  function appendVehicleApplicabilityWarnings(warnings, applicability = {}) {
    if (!hasObjectContent(applicability)) return;
    const normalized = applicability?.schemaVersion === "vehicle_applicability_v1"
      ? applicability
      : normalizeVehicleApplicabilitySnapshot(applicability || {});
    if (normalized.status === "partial") {
      warnings.push("vehicle_applicability_partial");
    } else if (normalized.status === "unlisted") {
      warnings.push("vehicle_applicability_unlisted");
    } else if (normalized.status === "manual") {
      warnings.push("vehicle_profile_manual");
    }
  }

  function hasObjectContent(value) {
    return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
  }

  function buildNextReadoutCandidates(readoutCoverage = null, vehicleApplicability = null, ecuInfoSnapshot = null, dtcSnapshot = null, supportedPidMatrix = null) {
    const normalizedCoverage = normalizeReadoutCoverageSnapshot(readoutCoverage || {});
    const applicability = normalizeVehicleApplicabilitySnapshot(vehicleApplicability || {});
    const priorityById = {
      dtc_snapshot: 100,
      freeze_frame_snapshot: 95,
      readiness_snapshot: 90,
      ecu_info_snapshot: 85,
      live_pid_snapshot: 80,
      supported_pid_matrix: 75,
      onboard_monitor_snapshot: 70,
      connection_status: 40,
      vci_devices: 35,
      adapter_identity: 30
    };
    const applicabilityNeedsVehicleConfirmation = applicability.status === "partial"
      || applicability.status === "unlisted"
      || applicability.status === "manual";
    return (normalizedCoverage.items || [])
      .filter((item) => item && typeof item === "object" && (item.status === "missing" || item.status === "empty"))
      .map((item) => {
        let reason = item.status === "missing"
          ? "未読取のため次候補"
          : "読取応答が空のため再確認候補";
        if (item.id === "ecu_info_snapshot" && applicability.status === "manual") {
          reason = "車両適合確認のため再確認候補";
        } else if (item.id === "ecu_info_snapshot" && applicability.status === "unlisted") {
          reason = "車種未掲載確認のため再確認候補";
        } else if (item.id === "ecu_info_snapshot" && Number(ecuInfoSnapshot?.keyItemSummary?.missingCount || 0) > 0) {
          reason = "主要ECU情報不足のため再確認候補";
        } else if (item.id === "ecu_info_snapshot" && ecuInfoSnapshot && ecuInfoSnapshot.supportInfoTypesCaptured === false) {
          reason = "対応ECU情報不足のため再確認候補";
        } else if (
          item.id === "freeze_frame_snapshot"
          && applicability.status !== "partial"
          && applicability.status !== "manual"
          && applicability.status !== "unlisted"
          && Array.isArray(dtcSnapshot?.codes)
          && dtcSnapshot.codes.length > 0
        ) {
          reason = "DTC確定のため再確認候補";
        } else if (
          item.id === "readiness_snapshot"
          && applicability.status !== "partial"
          && applicability.status !== "manual"
          && applicability.status !== "unlisted"
          && Array.isArray(dtcSnapshot?.codes)
          && dtcSnapshot.codes.length > 0
        ) {
          reason = "判定状態確認のため再確認候補";
        } else if (
          item.id === "supported_pid_matrix"
          && applicability.status !== "partial"
          && applicability.status !== "manual"
          && applicability.status !== "unlisted"
        ) {
          reason = "対応PID確認のため再確認候補";
        } else if (
          item.id === "live_pid_snapshot"
          && applicability.status !== "partial"
          && applicability.status !== "manual"
          && applicability.status !== "unlisted"
          && Array.isArray(supportedPidMatrix?.supportedPids)
          && supportedPidMatrix.supportedPids.length > 0
        ) {
          reason = "対応PID実測確認のため再確認候補";
        }
        return {
          id: item.id || "",
          label: item.label || item.id || "",
          status: item.status,
          priority: item.id === "ecu_info_snapshot" && (applicability.status === "manual" || applicability.status === "unlisted")
            ? 102
            : item.id === "ecu_info_snapshot" && applicability.status === "partial"
              ? 92
            : (priorityById[item.id] || 10),
          reason,
          applicabilityStatus: applicability.status || null
        };
      })
      .sort((left, right) => {
        if ((applicability.status === "manual" || applicability.status === "unlisted") && left.id !== right.id) {
          if (left.id === "ecu_info_snapshot") return -1;
          if (right.id === "ecu_info_snapshot") return 1;
        }
        if ((right.priority || 0) !== (left.priority || 0)) return (right.priority || 0) - (left.priority || 0);
        if (left.status !== right.status) return left.status === "missing" ? -1 : 1;
        return String(left.label || "").localeCompare(String(right.label || ""), "ja");
      })
      .slice(0, 5);
  }

  function resolveNextReadoutCandidates({
    explicitCandidates = [],
    readoutCoverage = null,
    vehicleApplicability = null,
    ecuInfoSnapshot = null,
    dtcSnapshot = null,
    supportedPidMatrix = null
  } = {}) {
    return normalizeNextReadoutCandidates(
      Array.isArray(explicitCandidates) && explicitCandidates.length
        ? explicitCandidates
        : buildNextReadoutCandidates(readoutCoverage, vehicleApplicability || {}, ecuInfoSnapshot, dtcSnapshot, supportedPidMatrix)
    );
  }

  function buildReadOnlyNextReadoutRequest(nextReadoutSummary = null) {
    if (!nextReadoutSummary || typeof nextReadoutSummary !== "object" || !nextReadoutSummary.id) return null;
    const requestByReadoutId = {
      dtc_snapshot: { bridgeIntent: "read_stored_dtc", serviceMode: "03", pid: null },
      freeze_frame_snapshot: { bridgeIntent: "read_freeze_frame", serviceMode: "02", pid: null },
      readiness_snapshot: { bridgeIntent: "read_live_pid_snapshot", serviceMode: "01", pid: "01" },
      ecu_info_snapshot: { bridgeIntent: "read_ecu_info", serviceMode: "09", pid: null },
      onboard_monitor_snapshot: { bridgeIntent: "read_onboard_monitor", serviceMode: "06", pid: null },
      supported_pid_matrix: { bridgeIntent: "read_supported_pids", serviceMode: "01", pid: "00" },
      live_pid_snapshot: { bridgeIntent: "read_live_pid_snapshot", serviceMode: "01", pid: "supported-only" }
    };
    const request = requestByReadoutId[nextReadoutSummary.id] || null;
    return {
      schemaVersion: "read_only_next_readout_request_v1",
      schema_version: "read_only_next_readout_request_v1",
      readoutId: nextReadoutSummary.id,
      readout_id: nextReadoutSummary.id,
      label: nextReadoutSummary.label || nextReadoutSummary.id,
      status: nextReadoutSummary.status || null,
      bridgeIntent: request?.bridgeIntent || null,
      bridge_intent: request?.bridgeIntent || null,
      serviceMode: request?.serviceMode || null,
      service_mode: request?.serviceMode || null,
      pid: request?.pid || null,
      executionEnabled: false,
      execution_enabled: false,
      readOnly: true,
      read_only: true,
      retainedRawText: false,
      retained_raw_text: false,
      wouldTransmit: false,
      would_transmit: false,
      vehicleCommandEnabled: false,
      vehicle_command_enabled: false,
      requiresUserAction: true,
      requires_user_action: true
    };
  }

  function buildReadoutRequestPlanSafetySummary(entries = [], unmappedRequestIds = []) {
    const safeEntries = Array.isArray(entries) ? entries : [];
    const safeUnmappedRequestIds = Array.isArray(unmappedRequestIds) ? unmappedRequestIds : [];
    const totalCount = safeEntries.length;
    const unmappedCount = safeUnmappedRequestIds.length;
    const mappedCount = Math.max(0, totalCount - unmappedCount);
    const readRequestId = (item) => item?.readoutId || item?.readout_id || item?.id || null;
    const readReadOnlyFlag = (item) => pickDefined(item?.readOnly, item?.read_only) === true;
    const readTransmittingFlag = (item) => pickDefined(item?.wouldTransmit, item?.would_transmit) === true
      || pickDefined(item?.vehicleCommandEnabled, item?.vehicle_command_enabled) === true
      || pickDefined(item?.executionEnabled, item?.execution_enabled) === true;
    const allReadOnly = safeEntries.every((item) => readReadOnlyFlag(item));
    const allNonTransmitting = safeEntries.every((item) => !readTransmittingFlag(item));
    const nonReadOnlyRequestIds = safeEntries
      .filter((item) => !readReadOnlyFlag(item))
      .map((item) => readRequestId(item))
      .filter(Boolean);
    const transmittingRequestIds = safeEntries
      .filter((item) => readTransmittingFlag(item))
      .map((item) => readRequestId(item))
      .filter(Boolean);
    const blockedReasonIds = [
      ...(unmappedCount > 0 ? ["unmapped_readout_requests"] : []),
      ...(nonReadOnlyRequestIds.length ? ["non_read_only_requests"] : []),
      ...(transmittingRequestIds.length ? ["transmitting_requests"] : [])
    ];
    const safeForBridgePlanning = blockedReasonIds.length === 0;
    const blockedReasonById = {
      unmapped_readout_requests: { count: unmappedCount, readoutIds: [...safeUnmappedRequestIds] },
      non_read_only_requests: { count: nonReadOnlyRequestIds.length, readoutIds: [...nonReadOnlyRequestIds] },
      transmitting_requests: { count: transmittingRequestIds.length, readoutIds: [...transmittingRequestIds] }
    };
    return {
      mappedPercent: totalCount ? Math.round((mappedCount / totalCount) * 100) : 100,
      mapped_percent: totalCount ? Math.round((mappedCount / totalCount) * 100) : 100,
      unmappedPercent: totalCount ? Math.round((unmappedCount / totalCount) * 100) : 0,
      unmapped_percent: totalCount ? Math.round((unmappedCount / totalCount) * 100) : 0,
      hasUnmappedRequests: unmappedCount > 0,
      has_unmapped_requests: unmappedCount > 0,
      mappingStatus: unmappedCount > 0 ? "partial" : "mapped",
      mapping_status: unmappedCount > 0 ? "partial" : "mapped",
      allReadOnly,
      all_read_only: allReadOnly,
      allNonTransmitting,
      all_non_transmitting: allNonTransmitting,
      safeForBridgePlanning,
      safe_for_bridge_planning: safeForBridgePlanning,
      nonReadOnlyRequestIds,
      non_read_only_request_ids: nonReadOnlyRequestIds,
      transmittingRequestIds,
      transmitting_request_ids: transmittingRequestIds,
      blockedReasonIds,
      blocked_reason_ids: blockedReasonIds,
      blockedReasonById,
      blocked_reason_by_id: blockedReasonById
    };
  }

  function buildReadoutRequestPlanGateActionQueue(blockedReasonIds = [], blockedReasonById = {}) {
    const actionIdByReasonId = {
      unmapped_readout_requests: "map_readout_request",
      non_read_only_requests: "require_read_only_request",
      transmitting_requests: "block_transmitting_request"
    };
    const actionLabelByReasonId = {
      unmapped_readout_requests: "Map readout request before bridge planning",
      non_read_only_requests: "Keep readout request read-only",
      transmitting_requests: "Block transmitting request before planning"
    };
    return (Array.isArray(blockedReasonIds) ? blockedReasonIds : [])
      .map((reasonId, index) => {
        const detail = blockedReasonById && typeof blockedReasonById === "object" ? blockedReasonById[reasonId] : null;
        const readoutIds = Array.isArray(detail?.readoutIds) ? detail.readoutIds.filter(Boolean) : [];
        return {
          id: actionIdByReasonId[reasonId] || "review_readout_request_plan",
          reasonId,
          reason_id: reasonId,
          label: actionLabelByReasonId[reasonId] || "Review readout request plan",
          priority: index + 1,
          count: Number.isFinite(Number(detail?.count)) ? Number(detail.count) : readoutIds.length,
          readoutIds: [...readoutIds],
          readout_ids: [...readoutIds],
          readOnly: true,
          read_only: true,
          executionEnabled: false,
          execution_enabled: false,
          wouldTransmit: false,
          would_transmit: false,
          vehicleCommandEnabled: false,
          vehicle_command_enabled: false
        };
      });
  }

  function buildReadoutRequestPlanSummary(plan = {}, gateSummary = {}, nextReadoutRequest = null) {
    const safePlan = plan && typeof plan === "object" ? plan : {};
    const safeGateSummary = gateSummary && typeof gateSummary === "object" ? gateSummary : {};
    const nextRequest = safePlan.nextRequest || safePlan.next_request || nextReadoutRequest || null;
    const totalCountInput = pickDefined(safePlan.totalCount, safePlan.total_count, safePlan.requestCount, safePlan.request_count);
    const mappedCountInput = pickDefined(safePlan.mappedCount, safePlan.mapped_count);
    const unmappedCountInput = pickDefined(safePlan.unmappedCount, safePlan.unmapped_count);
    const mappedPercentInput = pickDefined(safePlan.mappedPercent, safePlan.mapped_percent);
    const unmappedPercentInput = pickDefined(safePlan.unmappedPercent, safePlan.unmapped_percent);
    const blockedReasonCountInput = pickDefined(safeGateSummary.blockedReasonCount, safeGateSummary.blocked_reason_count);
    const gateBlockedReasonIds = pickDefined(safeGateSummary.blockedReasonIds, safeGateSummary.blocked_reason_ids);
    const planBlockedReasonIds = pickDefined(safePlan.blockedReasonIds, safePlan.blocked_reason_ids);
    const totalCount = Number.isFinite(Number(totalCountInput)) ? Number(totalCountInput) : 0;
    const mappedCount = Number.isFinite(Number(mappedCountInput)) ? Number(mappedCountInput) : 0;
    const unmappedCount = Number.isFinite(Number(unmappedCountInput)) ? Number(unmappedCountInput) : 0;
    const safeForBridgePlanning = pickDefined(safePlan.safeForBridgePlanning, safePlan.safe_for_bridge_planning) === true;
    return {
      schemaVersion: "readout_request_plan_summary_v1",
      state: safeGateSummary.state || (totalCount === 0 ? "idle" : safeForBridgePlanning ? "ready" : "blocked"),
      ready: safeGateSummary.ready === true || (totalCount > 0 && safeForBridgePlanning),
      blocked: safeGateSummary.blocked === true || (totalCount > 0 && !safeForBridgePlanning),
      totalCount,
      mappedCount,
      unmappedCount,
      mappedPercent: Number.isFinite(Number(mappedPercentInput)) ? Number(mappedPercentInput) : 0,
      unmappedPercent: Number.isFinite(Number(unmappedPercentInput)) ? Number(unmappedPercentInput) : 0,
      mappingStatus: safePlan.mappingStatus || safePlan.mapping_status || "unknown",
      safeForBridgePlanning,
      blockedReasonCount: Number.isFinite(Number(blockedReasonCountInput)) ? Number(blockedReasonCountInput) : 0,
      blockedReasonIds: Array.isArray(gateBlockedReasonIds) ? [...gateBlockedReasonIds] : Array.isArray(planBlockedReasonIds) ? [...planBlockedReasonIds] : [],
      nextBlockedReasonId: safeGateSummary.nextBlockedReasonId || safeGateSummary.next_blocked_reason_id || null,
      nextRequestId: nextRequest?.readoutId || nextRequest?.readout_id || null,
      nextBridgeIntent: nextRequest?.bridgeIntent || nextRequest?.bridge_intent || null,
      nextServiceMode: nextRequest?.serviceMode || nextRequest?.service_mode || null,
      nextExecutionEnabled: pickDefined(nextRequest?.executionEnabled, nextRequest?.execution_enabled) === true,
      actionRequired: pickDefined(safeGateSummary.actionRequired, safeGateSummary.action_required) === true,
      nextActionId: safeGateSummary.nextActionId || safeGateSummary.next_action_id || null,
      readOnly: true,
      wouldTransmit: false,
      vehicleCommandEnabled: false
    };
  }

  function buildBridgeSessionSummary(parts = {}) {
    parts = getBridgeSummaryInput(parts);
    const metadataOverrides = getSessionMetadataOverrides(parts);
    const dtcSnapshotInput = parts.dtcSnapshot || parts.dtc_snapshot;
    const livePidSnapshotInput = parts.livePidSnapshot || parts.live_pid_snapshot || parts.livePidResponse || parts.live_pid_response;
    const freezeFrameSnapshotInput = parts.freezeFrameSnapshot || parts.freeze_frame_snapshot || parts.freezeFrameResponse || parts.freeze_frame_response;
    const supportedPidMatrixInput = parts.supportedPidMatrix || parts.supported_pid_matrix || parts.supportedPidSnapshot || parts.supported_pid_snapshot || parts.supportedPidResponse || parts.supported_pid_response;
    const readinessSnapshotInput = parts.readinessSnapshot || parts.readiness_snapshot || parts.readinessResponse || parts.readiness_response || parts.livePidResponse || parts.live_pid_response;
    const ecuInfoSnapshotInput = parts.ecuInfoSnapshot || parts.ecu_info_snapshot || parts.ecuInfoResponse || parts.ecu_info_response;
    const onboardMonitorSnapshotInput = parts.onboardMonitorSnapshot || parts.onboard_monitor_snapshot || parts.onboardMonitorResponse || parts.onboard_monitor_response;
    const ecuResponseSummaryInput = parts.ecuResponseSummary || parts.ecu_response_summary || parts.ecuResponseSummaryResponse || parts.ecu_response_summary_response;
    const readoutCoverageInput = getReadoutCoverageInput(parts);
    const dtcSnapshot = dtcSnapshotInput?.codes ? dtcSnapshotInput : normalizeBridgeDtcSnapshot(dtcSnapshotInput);
    const livePidResponseInput = livePidSnapshotInput && typeof livePidSnapshotInput === "object" && !Array.isArray(livePidSnapshotInput)
      ? (livePidSnapshotInput.data && typeof livePidSnapshotInput.data === "object"
          ? {
            ...livePidSnapshotInput.data,
            protocol: livePidSnapshotInput.data.protocol || livePidSnapshotInput.data.obd_protocol || livePidSnapshotInput.protocol || livePidSnapshotInput.obd_protocol || parts.protocol || parts.obd_protocol || null,
            captured_at: livePidSnapshotInput.data.captured_at || livePidSnapshotInput.data.capturedAt || livePidSnapshotInput.captured_at || livePidSnapshotInput.capturedAt || null
          }
          : livePidSnapshotInput)
      : livePidSnapshotInput;
    const livePidSnapshot = livePidSnapshotInput?.monitorValues
      ? livePidSnapshotInput
      : (livePidResponseInput?.raw || livePidResponseInput?.response || Array.isArray(livePidResponseInput?.bytes))
        ? decodeLivePidResponse(livePidResponseInput)
        : normalizeBridgeLivePidSnapshot(livePidSnapshotInput);
    const supportedPidResponseInput = supportedPidMatrixInput && typeof supportedPidMatrixInput === "object" && !Array.isArray(supportedPidMatrixInput)
      ? (supportedPidMatrixInput.data && typeof supportedPidMatrixInput.data === "object"
          ? {
            ...supportedPidMatrixInput.data,
            protocol: supportedPidMatrixInput.data.protocol || supportedPidMatrixInput.data.obd_protocol || supportedPidMatrixInput.protocol || supportedPidMatrixInput.obd_protocol || parts.protocol || parts.obd_protocol || null,
            captured_at: supportedPidMatrixInput.data.captured_at || supportedPidMatrixInput.data.capturedAt || supportedPidMatrixInput.captured_at || supportedPidMatrixInput.capturedAt || null
          }
          : supportedPidMatrixInput)
      : supportedPidMatrixInput;
    const readinessResponseInput = readinessSnapshotInput && typeof readinessSnapshotInput === "object" && !Array.isArray(readinessSnapshotInput)
      ? (readinessSnapshotInput.data && typeof readinessSnapshotInput.data === "object"
          ? {
            ...readinessSnapshotInput.data,
            protocol: readinessSnapshotInput.data.protocol || readinessSnapshotInput.data.obd_protocol || readinessSnapshotInput.protocol || readinessSnapshotInput.obd_protocol || parts.protocol || parts.obd_protocol || null,
            captured_at: readinessSnapshotInput.data.captured_at || readinessSnapshotInput.data.capturedAt || readinessSnapshotInput.captured_at || readinessSnapshotInput.capturedAt || null
          }
          : readinessSnapshotInput)
      : readinessSnapshotInput;
    const freezeFrameResponseInput = freezeFrameSnapshotInput && typeof freezeFrameSnapshotInput === "object" && !Array.isArray(freezeFrameSnapshotInput)
      ? (freezeFrameSnapshotInput.data && typeof freezeFrameSnapshotInput.data === "object"
          ? {
            ...freezeFrameSnapshotInput.data,
            protocol: freezeFrameSnapshotInput.data.protocol || freezeFrameSnapshotInput.data.obd_protocol || freezeFrameSnapshotInput.protocol || freezeFrameSnapshotInput.obd_protocol || parts.protocol || parts.obd_protocol || null,
            captured_at: freezeFrameSnapshotInput.data.captured_at || freezeFrameSnapshotInput.data.capturedAt || freezeFrameSnapshotInput.captured_at || freezeFrameSnapshotInput.capturedAt || null
          }
          : freezeFrameSnapshotInput)
      : freezeFrameSnapshotInput;
    const onboardMonitorResponseInput = onboardMonitorSnapshotInput && typeof onboardMonitorSnapshotInput === "object" && !Array.isArray(onboardMonitorSnapshotInput)
      ? (onboardMonitorSnapshotInput.data && typeof onboardMonitorSnapshotInput.data === "object"
          ? {
            ...onboardMonitorSnapshotInput.data,
            protocol: onboardMonitorSnapshotInput.data.protocol || onboardMonitorSnapshotInput.data.obd_protocol || onboardMonitorSnapshotInput.protocol || onboardMonitorSnapshotInput.obd_protocol || parts.protocol || parts.obd_protocol || null,
            captured_at: onboardMonitorSnapshotInput.data.captured_at || onboardMonitorSnapshotInput.data.capturedAt || onboardMonitorSnapshotInput.captured_at || onboardMonitorSnapshotInput.capturedAt || null
          }
          : onboardMonitorSnapshotInput)
      : onboardMonitorSnapshotInput;
    const ecuInfoResponseInput = ecuInfoSnapshotInput && typeof ecuInfoSnapshotInput === "object" && !Array.isArray(ecuInfoSnapshotInput)
      ? (ecuInfoSnapshotInput.data && typeof ecuInfoSnapshotInput.data === "object"
          ? {
            ...ecuInfoSnapshotInput.data,
            protocol: ecuInfoSnapshotInput.data.protocol || ecuInfoSnapshotInput.data.obd_protocol || ecuInfoSnapshotInput.protocol || ecuInfoSnapshotInput.obd_protocol || parts.protocol || parts.obd_protocol || null,
            captured_at: ecuInfoSnapshotInput.data.captured_at || ecuInfoSnapshotInput.data.capturedAt || ecuInfoSnapshotInput.captured_at || ecuInfoSnapshotInput.capturedAt || null
          }
          : ecuInfoSnapshotInput)
      : ecuInfoSnapshotInput;
    const freezeFrameSnapshot = freezeFrameSnapshotInput?.schemaVersion
      ? freezeFrameSnapshotInput
      : (freezeFrameResponseInput?.raw || freezeFrameResponseInput?.response || Array.isArray(freezeFrameResponseInput?.bytes))
        ? decodeFreezeFrameResponse(freezeFrameResponseInput)
        : normalizeBridgeFreezeFrameSnapshot(freezeFrameSnapshotInput || {});
    const supportedPidMatrix = supportedPidMatrixInput?.schemaVersion
      ? supportedPidMatrixInput
      : (supportedPidResponseInput?.raw || supportedPidResponseInput?.response || Array.isArray(supportedPidResponseInput?.bytes))
        ? decodeSupportedPidResponse(supportedPidResponseInput)
        : normalizeBridgeSupportedPidSnapshot(supportedPidMatrixInput || { data: { supported_pids: livePidSnapshot.supportedPids || [] } });
    const readinessSnapshot = readinessSnapshotInput?.schemaVersion
      ? readinessSnapshotInput
      : (readinessResponseInput?.raw || readinessResponseInput?.response || Array.isArray(readinessResponseInput?.bytes))
        ? decodeReadinessResponse(readinessResponseInput)
        : (Array.isArray(readinessSnapshotInput?.monitors)
            || Number.isFinite(Number(readinessSnapshotInput?.incompleteCount))
            || Number.isFinite(Number(readinessSnapshotInput?.knownMonitorCount)))
          ? normalizeReadinessSnapshot(readinessSnapshotInput)
        : normalizeBridgeReadinessSnapshot(readinessSnapshotInput || livePidSnapshot);
    const ecuInfoSnapshot = ecuInfoSnapshotInput?.schemaVersion
      ? ecuInfoSnapshotInput
      : (ecuInfoResponseInput?.raw || ecuInfoResponseInput?.response || Array.isArray(ecuInfoResponseInput?.bytes))
        ? decodeEcuInfoResponse(ecuInfoResponseInput)
        : normalizeBridgeEcuInfoSnapshot(ecuInfoSnapshotInput || {});
    const onboardMonitorSnapshot = onboardMonitorSnapshotInput?.schemaVersion
      ? onboardMonitorSnapshotInput
      : (onboardMonitorResponseInput?.raw || onboardMonitorResponseInput?.response || Array.isArray(onboardMonitorResponseInput?.bytes))
        ? decodeOnboardMonitorResponse(onboardMonitorResponseInput)
        : normalizeBridgeOnboardMonitorSnapshot(onboardMonitorSnapshotInput || {});
    const ecuResponseSummary = ecuResponseSummaryInput?.schemaVersion
      ? ecuResponseSummaryInput
      : normalizeEcuResponseSummary(ecuResponseSummaryInput || {
        source: "local_bridge",
        captured_at: dtcSnapshot.capturedAt || null,
        protocol: dtcSnapshot.protocol || dtcSnapshot.obd_protocol || parts.protocol || parts.obd_protocol || null,
        ecu_responses: (dtcSnapshot.ecuResponses || []).map((row) => ({
          address: row.ecu || null,
          status: row.status || "unknown",
          dtc_count: Number.isInteger(row.codeCount) ? row.codeCount : null,
          services: ["03"]
        }))
      });
    const connectionStatusInput = parts.connectionStatus || parts.connection_status || parts.connectionStatusResponse || parts.connection_status_response || {};
    const vciListInput = parts.vciList || parts.vci_list || parts.vciDevices || parts.vci_devices || parts.listVciResponse || parts.list_vci_response || {};
    const adapterIdentityInput = parts.adapterIdentity || parts.adapter_identity || parts.adapterIdentityResponse || parts.adapter_identity_response || {};
    const {
      connectionStatus,
      vciList,
      adapterIdentity,
      hasBridgeInfrastructureContext
    } = resolveBridgeInfrastructureInputs({
      connectionStatusInput,
      vciDevicesInput: vciListInput,
      adapterIdentityInput,
      nestedSession: parts.bridgeSession || parts.bridge_session
    });
    const hasReadinessSnapshotInput = hasObjectContent(readinessSnapshotInput);
    const hasEcuInfoSnapshotInput = hasObjectContent(ecuInfoSnapshotInput);
    const hasOnboardMonitorSnapshotInput = hasObjectContent(onboardMonitorSnapshotInput);
    const hasBridgeSnapshotContext = hasBridgeInfrastructureContext
      || hasObjectContent(dtcSnapshotInput)
      || hasObjectContent(livePidSnapshotInput);
    const warnings = [];
    if (hasBridgeSnapshotContext && (connectionStatus.blocked || vciList.blocked || dtcSnapshot.blocked || livePidSnapshot.blocked)) warnings.push("local_bridge_disabled");
    appendCommonCoreWarnings(warnings, {
      dtcWarning: "confirm_dtc_with_service_manual",
      hasDtcCodes: dtcSnapshot.codes.length > 0,
      freezeFrameSnapshot,
      hasReadinessSnapshotInput,
      readinessSnapshot,
      hasOnboardMonitorSnapshotInput,
      onboardMonitorSnapshot,
      hasEcuInfoSnapshotInput,
      ecuInfoSnapshot,
      liveDataWarning: "compare_values_under_same_conditions",
      hasLiveData: livePidSnapshot.monitorValues.length > 0,
      rawPidUndecodedCount: (livePidSnapshot.monitorValueSummary?.undecodedRawCount || 0) + (freezeFrameSnapshot.monitorValueSummary?.undecodedRawCount || 0),
      vehicleApplicability: metadataOverrides.vehicleApplicability || {}
    });
    const resolvedMetadata = buildResolvedSessionMetadata({ metadataOverrides, ecuInfoSnapshot });
    const { protocol, capturedAt } = resolveSessionTemporalContext({
      input: parts,
      dtcSnapshot,
      livePidSnapshot,
      freezeFrameSnapshot,
      readinessSnapshot,
      ecuInfoSnapshot,
      onboardMonitorSnapshot,
      ecuResponseSummary,
      supportedPidMatrix
    });
    const derivedReadoutCoverage = buildReadoutCoverageSnapshot({
      includeInfrastructure: hasBridgeInfrastructureContext,
      connectionStatus,
      vciDevices: vciList.devices,
      adapterIdentity,
      dtcSnapshot,
      livePidSnapshot,
      freezeFrameSnapshot,
      readinessSnapshot,
      ecuInfoSnapshot,
      onboardMonitorSnapshot,
      supportedPidMatrix
    });
    const readoutCoverage = resolveReadoutCoverageSnapshot(readoutCoverageInput, derivedReadoutCoverage);
    const coreReadoutInventorySummary = buildCoreReadoutInventorySummary({
      readoutCoverage,
      dtcSnapshot,
      livePidSnapshot,
      freezeFrameSnapshot,
      readinessSnapshot,
      ecuInfoSnapshot,
      onboardMonitorSnapshot,
      supportedPidMatrix
    });
    appendBridgeReadoutCoverageWarnings(warnings, { hasBridgeInfrastructureContext, readoutCoverage });
    const explicitNextReadoutCandidates = metadataOverrides.nextReadoutCandidates || [];
    const resolvedNextReadoutCandidates = resolveNextReadoutCandidates({
      explicitCandidates: explicitNextReadoutCandidates,
      readoutCoverage,
      vehicleApplicability: resolvedMetadata.vehicleApplicability,
      ecuInfoSnapshot,
      dtcSnapshot,
      supportedPidMatrix
    });
    const coreSessionStatus = buildCoreSessionStatus({
      readoutCoverage,
      vehicleApplicability: resolvedMetadata.vehicleApplicability,
      dtcSnapshot,
      freezeFrameSnapshot,
      readinessSnapshot,
      ecuInfoSnapshot,
      onboardMonitorSnapshot,
      livePidSnapshot,
      supportedPidMatrix,
      warnings,
      nextReadoutCandidates: resolvedNextReadoutCandidates
    });
    const diagnosticFlowSummary = buildDiagnosticFlowSummary(coreSessionStatus);
    const readoutCompletionSummary = coreSessionStatus.readoutCompletionSummary || null;
    const analysisReadinessSummary = coreSessionStatus.analysisReadinessSummary || null;
    const readoutRequestPlanGateSummary = coreSessionStatus.readoutRequestPlanGateSummary || analysisReadinessSummary?.readoutRequestPlanGateSummary || diagnosticFlowSummary.readoutRequestPlanGateSummary || null;
    const importedReadoutQualityReviewRequestPlanSummary = parts.importedReadoutQualityReviewRequestPlanSummary
      || parts.imported_readout_quality_review_request_plan_summary
      || null;

    return {
      source: parts.source || parts.source_type || "local_bridge",
      source_type: parts.source_type || parts.source || "local_bridge",
      startedAt: parts.startedAt || parts.started_at || null,
      endedAt: parts.endedAt || parts.ended_at || null,
      capturedAt,
      protocol,
      obd_protocol: protocol,
      vehicleProfile: resolvedMetadata.vehicleProfile,
      vehicleApplicability: resolvedMetadata.vehicleApplicability,
      connectionStatus,
      vciDevices: vciList.devices,
      adapterIdentity,
      codes: dtcSnapshot.codes,
      ecuResponseSummary,
      supportedPidMatrix,
      readinessSnapshot,
      ecuInfoSnapshot,
      onboardMonitorSnapshot,
      readoutCoverage,
      coreReadoutInventorySummary,
      monitorValues: livePidSnapshot.monitorValues,
      monitorValueSummary: resolveMonitorValueSummary(livePidSnapshot.monitorValues, livePidSnapshot.monitorValueSummary),
      monitorInsights: livePidSnapshot.monitorInsights,
      toolHints: resolvedMetadata.toolHints,
      freezeFrameSnapshot,
      warnings,
      nextReadoutCandidates: resolvedNextReadoutCandidates,
      coreSessionStatus,
      diagnosticFlowSummary,
      readoutCompletionSummary,
      analysisReadinessSummary,
      importedReadoutQualityReviewRequestPlanSummary,
      imported_readout_quality_review_request_plan_summary: importedReadoutQualityReviewRequestPlanSummary,
      readoutRequestPlanGateSummary,
      hadSensitiveIdentifier: resolvedMetadata.hadSensitiveIdentifier,
      sourceLength: resolvedMetadata.sourceLength,
      ...buildReadOnlyFlags({
        exportRequired: true,
        retainedRawText: false,
        wouldTransmit: false
      })
    };
  }

  function hasBridgeSummaryContent(parts = {}) {
    return Boolean(
      Array.isArray(parts.codes)
      || Array.isArray(parts.dtc_codes)
      || Array.isArray(parts.dtcCodes)
      || Array.isArray(parts.monitorValues)
      || Array.isArray(parts.monitor_values)
      || Array.isArray(parts.monitorInsights)
      || Array.isArray(parts.monitor_insights)
      || parts.monitorValueSummary
      || parts.monitor_value_summary
      || parts.readoutCoverage
      || parts.readout_coverage
      || parts.readoutCoverageResponse
      || parts.readout_coverage_response
      || parts.importClassification
      || parts.import_classification
      || Array.isArray(parts.warningFlags)
      || Array.isArray(parts.warning_flags)
      || parts.capturedAt
      || parts.captured_at
    );
  }

  function hasBridgeSummaryMetadata(parts = {}) {
    return Boolean(
      parts.vehicleProfile
      || parts.vehicle_profile
      || parts.vehicleApplicability
      || parts.vehicle_applicability
      || parts.connectionStatus
      || parts.connection_status
      || parts.connectionStatusResponse
      || parts.connection_status_response
      || parts.adapterIdentity
      || parts.adapter_identity
      || parts.adapterIdentityResponse
      || parts.adapter_identity_response
      || parts.ecuResponseSummary
      || parts.ecu_response_summary
      || parts.ecuResponseSummaryResponse
      || parts.ecu_response_summary_response
      || parts.dtcSnapshot
      || parts.dtc_snapshot
      || parts.livePidSnapshot
      || parts.live_pid_snapshot
      || parts.livePidResponse
      || parts.live_pid_response
      || parts.supportedPidMatrix
      || parts.supported_pid_matrix
      || parts.supportedPidSnapshot
      || parts.supported_pid_snapshot
      || parts.supportedPidResponse
      || parts.supported_pid_response
      || parts.freezeFrameSnapshot
      || parts.freeze_frame_snapshot
      || parts.freezeFrameResponse
      || parts.freeze_frame_response
      || parts.readinessSnapshot
      || parts.readiness_snapshot
      || parts.readinessResponse
      || parts.readiness_response
      || parts.ecuInfoSnapshot
      || parts.ecu_info_snapshot
      || parts.ecuInfoResponse
      || parts.ecu_info_response
      || parts.onboardMonitorSnapshot
      || parts.onboard_monitor_snapshot
      || parts.onboardMonitorResponse
      || parts.onboard_monitor_response
      || Array.isArray(parts.vciDevices)
      || Array.isArray(parts.vci_devices)
      || parts.vciList
      || parts.vci_list
      || parts.listVciResponse
      || parts.list_vci_response
      || parts.startedAt
      || parts.started_at
      || parts.endedAt
      || parts.ended_at
      || parts.capturedAt
      || parts.captured_at
      || parts.protocol
      ||
      Array.isArray(parts.nextReadoutCandidates)
      || Array.isArray(parts.next_readout_candidates)
      || Array.isArray(parts.toolHints)
      || Array.isArray(parts.tool_hints)
      || Array.isArray(parts.warnings)
      || parts.hadSensitiveIdentifier === true
      || parts.had_sensitive_identifier === true
      || Number.isFinite(Number(parts.sourceLength))
      || Number.isFinite(Number(parts.source_length))
    );
  }

  function getBridgeSummaryInput(parts = {}) {
    const nested = parts.bridgeSession || parts.bridge_session || parts.session || null;
    if (!nested || typeof nested !== "object") return parts;
    const mergedMetadata = mergeNestedSessionMetadata(parts, nested);
    return {
      ...nested,
      ...parts,
      source: parts.source || parts.source_type || nested.source || nested.source_type || "local_bridge",
      source_type: parts.source_type || parts.source || nested.source_type || nested.source || "local_bridge",
      startedAt: parts.startedAt || parts.started_at || nested.startedAt || nested.started_at || null,
      endedAt: parts.endedAt || parts.ended_at || nested.endedAt || nested.ended_at || null,
      captured_at: parts.captured_at || parts.capturedAt || nested.captured_at || nested.capturedAt || null,
      capturedAt: parts.capturedAt || parts.captured_at || nested.capturedAt || nested.captured_at || null,
      protocol: parts.protocol || parts.obd_protocol || nested.protocol || nested.obd_protocol || null,
      obd_protocol: parts.obd_protocol || parts.protocol || nested.obd_protocol || nested.protocol || null,
      ...mergedMetadata
    };
  }

  function normalizeBridgeSummaryAliases(parts = {}) {
    const metadataOverrides = getSessionMetadataOverrides(parts);
    const connectionStatusInput = parts.connectionStatus || parts.connection_status || parts.connectionStatusResponse || parts.connection_status_response || {};
    const vciDevicesInput = parts.vciDevices || parts.vci_devices || parts.vciList || parts.vci_list || parts.listVciResponse || parts.list_vci_response || [];
    const adapterIdentityInput = parts.adapterIdentity || parts.adapter_identity || parts.adapterIdentityResponse || parts.adapter_identity_response || {};
    const livePidSnapshotInput = parts.livePidSnapshot || parts.live_pid_snapshot || parts.livePidResponse || parts.live_pid_response;
    const supportedPidMatrixInput = parts.supportedPidMatrix || parts.supported_pid_matrix || parts.supportedPidSnapshot || parts.supported_pid_snapshot || parts.supportedPidResponse || parts.supported_pid_response;
    const freezeFrameSnapshotInput = parts.freezeFrameSnapshot || parts.freeze_frame_snapshot || parts.freezeFrameResponse || parts.freeze_frame_response;
    const readinessSnapshotInput = parts.readinessSnapshot || parts.readiness_snapshot || parts.readinessResponse || parts.readiness_response || parts.livePidResponse || parts.live_pid_response;
    const ecuInfoSnapshotInput = parts.ecuInfoSnapshot || parts.ecu_info_snapshot || parts.ecuInfoResponse || parts.ecu_info_response;
    const onboardMonitorSnapshotInput = parts.onboardMonitorSnapshot || parts.onboard_monitor_snapshot || parts.onboardMonitorResponse || parts.onboard_monitor_response;
    const codesInput = parts.codes || parts.dtc_codes || parts.dtcCodes || [];
    const monitorValuesInput = parts.monitorValues || parts.monitor_values || [];
    const monitorInsightsInput = parts.monitorInsights || parts.monitor_insights || [];
    const nextReadoutCandidatesInput = metadataOverrides.nextReadoutCandidates || [];
    const warningsInput = metadataOverrides.warnings || [];
    const importClassificationInput = metadataOverrides.importClassification;
    const {
      connectionStatus,
      vciList: normalizedVciList,
      adapterIdentity,
      hasBridgeInfrastructureContext
    } = resolveBridgeInfrastructureInputs({
      connectionStatusInput,
      vciDevicesInput,
      adapterIdentityInput,
      nestedSession: parts.bridgeSession || parts.bridge_session || parts.session,
      allowVciArray: true
    });
    const ecuResponseSummary = (parts.ecuResponseSummary || parts.ecu_response_summary || parts.ecuResponseSummaryResponse || parts.ecu_response_summary_response)?.schemaVersion
      ? (parts.ecuResponseSummary || parts.ecu_response_summary || parts.ecuResponseSummaryResponse || parts.ecu_response_summary_response)
      : normalizeEcuResponseSummary(parts.ecuResponseSummary || parts.ecu_response_summary || parts.ecuResponseSummaryResponse || parts.ecu_response_summary_response || { source: "local_bridge" });
    const supportedPidMatrix = supportedPidMatrixInput?.schemaVersion
      ? supportedPidMatrixInput
      : normalizeBridgeSupportedPidSnapshot(supportedPidMatrixInput || { data: { supported_pids: [] } });
    const readinessSnapshot = readinessSnapshotInput?.schemaVersion
      ? readinessSnapshotInput
      : normalizeBridgeReadinessSnapshot(readinessSnapshotInput || {});
    const ecuInfoSnapshot = ecuInfoSnapshotInput?.schemaVersion
      ? ecuInfoSnapshotInput
      : normalizeBridgeEcuInfoSnapshot(ecuInfoSnapshotInput || {});
    const onboardMonitorSnapshot = onboardMonitorSnapshotInput?.schemaVersion
      ? onboardMonitorSnapshotInput
      : normalizeBridgeOnboardMonitorSnapshot(onboardMonitorSnapshotInput || {});
    const freezeFrameSnapshot = freezeFrameSnapshotInput?.schemaVersion
      ? freezeFrameSnapshotInput
      : normalizeBridgeFreezeFrameSnapshot(freezeFrameSnapshotInput || {});
    const livePidResponseInput = livePidSnapshotInput && typeof livePidSnapshotInput === "object" && !Array.isArray(livePidSnapshotInput)
      ? (livePidSnapshotInput.data && typeof livePidSnapshotInput.data === "object"
          ? {
            ...livePidSnapshotInput.data,
            protocol: livePidSnapshotInput.data.protocol || livePidSnapshotInput.protocol || null,
            captured_at: livePidSnapshotInput.data.captured_at || livePidSnapshotInput.data.capturedAt || livePidSnapshotInput.captured_at || livePidSnapshotInput.capturedAt || null
          }
          : livePidSnapshotInput)
      : livePidSnapshotInput;
    const livePidSnapshot = livePidSnapshotInput?.monitorValues
      ? livePidSnapshotInput
      : (livePidResponseInput?.raw || livePidResponseInput?.response || Array.isArray(livePidResponseInput?.bytes))
        ? decodeLivePidResponse(livePidResponseInput)
        : normalizeBridgeLivePidSnapshot(livePidSnapshotInput);
    const monitorValues = Array.isArray(monitorValuesInput) && monitorValuesInput.length
      ? monitorValuesInput.map((item) => (item && typeof item === "object" ? { ...item } : item))
      : Array.isArray(livePidSnapshot.monitorValues)
        ? livePidSnapshot.monitorValues.map((item) => (item && typeof item === "object" ? { ...item } : item))
        : [];
    const monitorValueSummary = parts.monitorValueSummary || parts.monitor_value_summary || livePidSnapshot.monitorValueSummary || buildMonitorValueSummary(monitorValues);
    const monitorInsights = Array.isArray(monitorInsightsInput)
      ? monitorInsightsInput.map((item) => (item && typeof item === "object" ? { ...item } : item))
      : [];
    const hasReadinessSnapshotInput = hasObjectContent(readinessSnapshotInput);
    const hasEcuInfoSnapshotInput = hasObjectContent(ecuInfoSnapshotInput);
    const hasOnboardMonitorSnapshotInput = hasObjectContent(onboardMonitorSnapshotInput);
    const dtcSnapshot = { blocked: false, codes: Array.isArray(codesInput) ? codesInput : [] };
    const derivedReadoutCoverage = buildReadoutCoverageSnapshot({
      includeInfrastructure: hasBridgeInfrastructureContext,
      connectionStatus,
      vciDevices: normalizedVciList.devices,
      adapterIdentity,
      dtcSnapshot,
      livePidSnapshot: { blocked: false, monitorValues, supportedPids: supportedPidMatrix.supportedPids || [], monitorValueSummary },
      freezeFrameSnapshot,
      readinessSnapshot,
      ecuInfoSnapshot,
      onboardMonitorSnapshot,
      supportedPidMatrix
    });
    const derivedWarnings = [];
    if (hasBridgeInfrastructureContext && (connectionStatus.blocked || normalizedVciList.blocked)) derivedWarnings.push("local_bridge_disabled");
    appendCommonCoreWarnings(derivedWarnings, {
      dtcWarning: "confirm_dtc_with_service_manual",
      hasDtcCodes: Array.isArray(codesInput) && codesInput.length > 0,
      freezeFrameSnapshot,
      hasReadinessSnapshotInput,
      readinessSnapshot,
      hasOnboardMonitorSnapshotInput,
      onboardMonitorSnapshot,
      hasEcuInfoSnapshotInput,
      ecuInfoSnapshot,
      liveDataWarning: "compare_values_under_same_conditions",
      hasLiveData: (monitorValueSummary?.totalCount || 0) > 0,
      rawPidUndecodedCount: (monitorValueSummary?.undecodedRawCount || 0) + (freezeFrameSnapshot.monitorValueSummary?.undecodedRawCount || 0),
      vehicleApplicability: metadataOverrides.vehicleApplicability || {}
    });
    appendBridgeReadoutCoverageWarnings(derivedWarnings, {
      hasBridgeInfrastructureContext,
      readoutCoverage: derivedReadoutCoverage
    });
    const resolvedMetadata = buildResolvedSessionMetadata({ metadataOverrides, ecuInfoSnapshot });
    const readoutRequestPlanGateSummary = parts.readoutRequestPlanGateSummary
      || parts.readout_request_plan_gate_summary
      || parts.coreSessionStatus?.readoutRequestPlanGateSummary
      || parts.core_session_status?.readoutRequestPlanGateSummary
      || parts.coreSessionStatus?.readout_request_plan_gate_summary
      || parts.core_session_status?.readout_request_plan_gate_summary
      || parts.analysisReadinessSummary?.readoutRequestPlanGateSummary
      || parts.analysis_readiness_summary?.readoutRequestPlanGateSummary
      || parts.analysisReadinessSummary?.readout_request_plan_gate_summary
      || parts.analysis_readiness_summary?.readout_request_plan_gate_summary
      || parts.diagnosticFlowSummary?.readoutRequestPlanGateSummary
      || parts.diagnostic_flow_summary?.readoutRequestPlanGateSummary
      || parts.diagnosticFlowSummary?.readout_request_plan_gate_summary
      || parts.diagnostic_flow_summary?.readout_request_plan_gate_summary
      || null;
    const importedReadoutQualityReviewRequestPlanSummary = parts.importedReadoutQualityReviewRequestPlanSummary
      || parts.imported_readout_quality_review_request_plan_summary
      || null;
    return {
      source: parts.source || parts.source_type || "local_bridge",
      source_type: parts.source_type || parts.source || "local_bridge",
      startedAt: parts.startedAt || parts.started_at || null,
      endedAt: parts.endedAt || parts.ended_at || null,
      capturedAt: parts.capturedAt || parts.captured_at || null,
      protocol: parts.protocol || parts.obd_protocol || null,
      obd_protocol: parts.obd_protocol || parts.protocol || null,
      vehicleProfile: resolvedMetadata.vehicleProfile,
      vehicleApplicability: resolvedMetadata.vehicleApplicability,
      connectionStatus,
      vciDevices: normalizedVciList.devices,
      adapterIdentity,
      codes: Array.isArray(codesInput)
        ? codesInput.map((item) => (item && typeof item === "object" ? { ...item } : item))
        : [],
      ecuResponseSummary,
      supportedPidMatrix,
      readinessSnapshot,
      ecuInfoSnapshot,
      onboardMonitorSnapshot,
      readoutCoverage: resolveReadoutCoverageSnapshot(
        getReadoutCoverageInput(parts),
        derivedReadoutCoverage
      ),
      freezeFrameSnapshot,
      monitorValues,
      monitorValueSummary,
      monitorInsights,
      importClassification: resolveImportClassification(importClassificationInput),
      toolHints: resolvedMetadata.toolHints,
      warnings: resolveWarningList(Array.isArray(warningsInput) && warningsInput.length ? warningsInput : derivedWarnings),
      nextReadoutCandidates: normalizeNextReadoutCandidates(
        Array.isArray(nextReadoutCandidatesInput) && nextReadoutCandidatesInput.length
          ? nextReadoutCandidatesInput
          : buildNextReadoutCandidates(
            getReadoutCoverageInput(parts) || derivedReadoutCoverage,
            metadataOverrides.vehicleApplicability || {},
            ecuInfoSnapshot,
            dtcSnapshot,
            supportedPidMatrix
          )
      ),
      readoutRequestPlanGateSummary,
      importedReadoutQualityReviewRequestPlanSummary,
      imported_readout_quality_review_request_plan_summary: importedReadoutQualityReviewRequestPlanSummary,
      hadSensitiveIdentifier: resolvedMetadata.hadSensitiveIdentifier,
      sourceLength: resolvedMetadata.sourceLength,
      ...buildReadOnlyFlags({
        exportRequired: true,
        retainedRawText: false,
        wouldTransmit: false
      })
    };
  }

  function cloneBridgeArrayItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map((item) => (item && typeof item === "object" ? { ...item } : item));
  }

  function normalizeNextReadoutCandidates(items) {
    return cloneBridgeArrayItems(items)
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        ...item,
        id: String(pickDefined(item.id, item.readout_id, item.readoutId, "") || ""),
        label: pickDefined(item.label, item.displayLabel, item.display_label, item.name, item.id, item.readout_id, item.readoutId, "") || "",
        status: typeof item.status === "string" ? item.status : "missing",
        priority: Number.isFinite(Number(pickDefined(item.priority, item.sort_order, item.sortOrder)))
          ? Math.round(Number(pickDefined(item.priority, item.sort_order, item.sortOrder)))
          : 0,
        reason: pickDefined(item.reason, item.reason_label, item.reasonLabel, "") || "",
        applicabilityStatus: pickDefined(item.applicabilityStatus, item.applicability_status, item.vehicleApplicabilityStatus, item.vehicle_applicability_status, null)
      }))
      .sort((left, right) => {
        const rightPriority = Number.isFinite(right?.priority) ? right.priority : 0;
        const leftPriority = Number.isFinite(left?.priority) ? left.priority : 0;
        if (rightPriority !== leftPriority) return rightPriority - leftPriority;
        if (left?.status !== right?.status) return left?.status === "missing" ? -1 : 1;
        return String(left?.label || left?.id || "").localeCompare(String(right?.label || right?.id || ""), "ja");
      });
  }

  function pickDefined(...values) {
    for (const value of values) {
      if (value !== undefined) return value;
    }
    return undefined;
  }

  function detectBridgeInfrastructureContext({
    connectionStatusInput = {},
    vciDevicesInput = {},
    adapterIdentityInput = {},
    nestedSession = null,
    readoutCoverageInput = null,
    honorCoverageOverride = false
  } = {}) {
    const explicitIncludeInfrastructureValue = pickDefined(
      readoutCoverageInput?.includeInfrastructure,
      readoutCoverageInput?.include_infrastructure
    );
    if (honorCoverageOverride && typeof explicitIncludeInfrastructureValue === "boolean") {
      return explicitIncludeInfrastructureValue;
    }
    return hasObjectContent(connectionStatusInput)
      || hasObjectContent(adapterIdentityInput)
      || (Array.isArray(vciDevicesInput) && vciDevicesInput.length > 0)
      || Boolean(vciDevicesInput?.devices?.length)
      || Boolean(nestedSession);
  }

  function resolveBridgeInfrastructureInputs({
    connectionStatusInput = {},
    vciDevicesInput = {},
    adapterIdentityInput = {},
    nestedSession = null,
    readoutCoverageInput = null,
    honorCoverageOverride = false,
    allowVciArray = false
  } = {}) {
    const connectionStatus = connectionStatusInput?.displayStatus
      ? connectionStatusInput
      : normalizeBridgeConnectionStatus(connectionStatusInput);
    const vciList = allowVciArray && Array.isArray(vciDevicesInput)
      ? { devices: vciDevicesInput, blocked: false }
      : (vciDevicesInput?.devices
        ? { ...vciDevicesInput, blocked: false }
        : normalizeBridgeVciList(vciDevicesInput));
    const adapterIdentity = adapterIdentityInput?.intent === "adapter_identity"
      ? adapterIdentityInput
      : normalizeBridgeAdapterIdentity(adapterIdentityInput);

    return {
      connectionStatus,
      vciList,
      adapterIdentity,
      hasBridgeInfrastructureContext: detectBridgeInfrastructureContext({
        connectionStatusInput,
        vciDevicesInput,
        adapterIdentityInput,
        nestedSession,
        readoutCoverageInput,
        honorCoverageOverride
      })
    };
  }

  function resolveSessionTemporalContext({
    input = {},
    dtcSnapshot = {},
    livePidSnapshot = {},
    freezeFrameSnapshot = {},
    readinessSnapshot = {},
    ecuInfoSnapshot = {},
    onboardMonitorSnapshot = {},
    ecuResponseSummary = {},
    supportedPidMatrix = {}
  } = {}) {
    return {
      protocol: input.protocol
        || input.obd_protocol
        || input.communicationProtocol
        || input.communication_protocol
        || input.protocolName
        || input.protocol_name
        || dtcSnapshot.protocol
        || dtcSnapshot.obd_protocol
        || dtcSnapshot.communicationProtocol
        || dtcSnapshot.communication_protocol
        || livePidSnapshot.protocol
        || livePidSnapshot.obd_protocol
        || livePidSnapshot.communicationProtocol
        || livePidSnapshot.communication_protocol
        || freezeFrameSnapshot.protocol
        || freezeFrameSnapshot.obd_protocol
        || freezeFrameSnapshot.communicationProtocol
        || freezeFrameSnapshot.communication_protocol
        || readinessSnapshot.protocol
        || readinessSnapshot.obd_protocol
        || readinessSnapshot.communicationProtocol
        || readinessSnapshot.communication_protocol
        || ecuInfoSnapshot.protocol
        || ecuInfoSnapshot.obd_protocol
        || ecuInfoSnapshot.communicationProtocol
        || ecuInfoSnapshot.communication_protocol
        || onboardMonitorSnapshot.protocol
        || onboardMonitorSnapshot.obd_protocol
        || onboardMonitorSnapshot.communicationProtocol
        || onboardMonitorSnapshot.communication_protocol
        || ecuResponseSummary.protocol
        || ecuResponseSummary.obd_protocol
        || ecuResponseSummary.communicationProtocol
        || ecuResponseSummary.communication_protocol
        || supportedPidMatrix.protocol
        || supportedPidMatrix.obd_protocol
        || supportedPidMatrix.communicationProtocol
        || supportedPidMatrix.communication_protocol
        || null,
      capturedAt: input.capturedAt
        || input.captured_at
        || input.timestamp
        || input.capturedTimestamp
        || input.captured_timestamp
        || dtcSnapshot.capturedAt
        || dtcSnapshot.captured_at
        || dtcSnapshot.timestamp
        || livePidSnapshot.capturedAt
        || livePidSnapshot.captured_at
        || livePidSnapshot.timestamp
        || freezeFrameSnapshot.capturedAt
        || freezeFrameSnapshot.captured_at
        || freezeFrameSnapshot.timestamp
        || readinessSnapshot.capturedAt
        || readinessSnapshot.captured_at
        || readinessSnapshot.timestamp
        || ecuInfoSnapshot.capturedAt
        || ecuInfoSnapshot.captured_at
        || ecuInfoSnapshot.timestamp
        || onboardMonitorSnapshot.capturedAt
        || onboardMonitorSnapshot.captured_at
        || onboardMonitorSnapshot.timestamp
        || ecuResponseSummary.capturedAt
        || ecuResponseSummary.captured_at
        || ecuResponseSummary.timestamp
        || supportedPidMatrix.capturedAt
        || supportedPidMatrix.captured_at
        || supportedPidMatrix.timestamp
        || null
    };
  }

  function appendBridgeReadoutCoverageWarnings(warnings, {
    hasBridgeInfrastructureContext = false,
    readoutCoverage = null
  } = {}) {
    if (!hasBridgeInfrastructureContext || !readoutCoverage) return;
    if (readoutCoverage.missingCategories > 0) warnings.push("bridge_readout_incomplete");
    if (readoutCoverage.emptyCategories > 0) warnings.push("bridge_readout_empty_sections");
  }

  function appendCommonCoreWarnings(warnings, {
    dtcWarning = null,
    hasDtcCodes = false,
    freezeFrameSnapshot = {},
    hasReadinessSnapshotInput = false,
    readinessSnapshot = {},
    hasOnboardMonitorSnapshotInput = false,
    onboardMonitorSnapshot = {},
    hasEcuInfoSnapshotInput = false,
    ecuInfoSnapshot = {},
    liveDataWarning = null,
    hasLiveData = false,
    rawPidUndecodedCount = 0,
    vehicleApplicability = {}
  } = {}) {
    if (dtcWarning && hasDtcCodes) warnings.push(dtcWarning);
    if ((freezeFrameSnapshot.monitorValues || []).length) warnings.push("freeze_frame_available");
    if (hasReadinessSnapshotInput && readinessSnapshot.incompleteCount > 0) warnings.push("readiness_incomplete");
    if (hasOnboardMonitorSnapshotInput && onboardMonitorSnapshot.failedCount > 0) warnings.push("onboard_monitor_test_failed");
    if (hasEcuInfoSnapshotInput && ecuInfoSnapshot.keyItemSummary?.missingCount > 0) warnings.push("mode09_key_items_missing");
    if (hasEcuInfoSnapshotInput && ecuInfoSnapshot.supportInfoTypesCaptured === false) warnings.push("mode09_supported_types_unknown");
    if (liveDataWarning && hasLiveData) warnings.push(liveDataWarning);
    if (rawPidUndecodedCount > 0) warnings.push("raw_pid_values_need_conversion");
    appendVehicleApplicabilityWarnings(warnings, vehicleApplicability || {});
  }

  function buildResolvedSessionMetadata({
    metadataOverrides = {},
    ecuInfoSnapshot = {}
  } = {}) {
    return {
      vehicleProfile: metadataOverrides.vehicleProfile,
      vehicleApplicability: normalizeVehicleApplicabilitySnapshot(metadataOverrides.vehicleApplicability || {}),
      toolHints: mergeUniqueStrings(metadataOverrides.toolHints),
      hadSensitiveIdentifier: ecuInfoSnapshot.hadSensitiveIdentifier === true
        || metadataOverrides.hadSensitiveIdentifier === true,
      sourceLength: Number.isFinite(Number(metadataOverrides.sourceLength))
        ? Math.max(0, Math.round(Number(metadataOverrides.sourceLength)))
        : 0
    };
  }

  function buildCoreSessionStatus({
    readoutCoverage = null,
    vehicleApplicability = null,
    dtcSnapshot = null,
    freezeFrameSnapshot = null,
    readinessSnapshot = null,
    ecuInfoSnapshot = null,
    onboardMonitorSnapshot = null,
    livePidSnapshot = null,
    supportedPidMatrix = null,
    warnings = [],
    nextReadoutCandidates = []
  } = {}) {
    const applicability = normalizeVehicleApplicabilitySnapshot(vehicleApplicability || {});
    const normalizedCoverage = normalizeReadoutCoverageSnapshot(readoutCoverage || {});
    const isCapturedReadout = (snapshot, key) => (
      Boolean(snapshot?.capturedAt)
      || (Array.isArray(snapshot?.[key]) && snapshot[key].length > 0)
    );
    const coverageItems = (normalizedCoverage.items || [])
      .filter((item) => item && typeof item.id === "string");
    const coverageStatusById = new Map(coverageItems.map((item) => [item.id, item.status]));
    const coverageLabelById = new Map(coverageItems.map((item) => [item.id, item.label || item.id]));
    const isCoverageCapturedReadout = (id) => coverageStatusById.get(id) === "captured";
    const fallbackPriorityById = {
      dtc_snapshot: 100,
      freeze_frame_snapshot: 95,
      readiness_snapshot: 90,
      ecu_info_snapshot: 85,
      live_pid_snapshot: 80,
      supported_pid_matrix: 75,
      onboard_monitor_snapshot: 70
    };
    const requiredReadouts = [
      { id: "dtc_snapshot", captured: isCapturedReadout(dtcSnapshot, "codes") || isCoverageCapturedReadout("dtc_snapshot") },
      { id: "freeze_frame_snapshot", captured: isCapturedReadout(freezeFrameSnapshot, "monitorValues") || isCoverageCapturedReadout("freeze_frame_snapshot") },
      { id: "readiness_snapshot", captured: isCapturedReadout(readinessSnapshot, "monitors") || isCoverageCapturedReadout("readiness_snapshot") },
      { id: "ecu_info_snapshot", captured: isCapturedReadout(ecuInfoSnapshot, "items") || isCoverageCapturedReadout("ecu_info_snapshot") },
      { id: "onboard_monitor_snapshot", captured: isCapturedReadout(onboardMonitorSnapshot, "tests") || isCoverageCapturedReadout("onboard_monitor_snapshot") },
      { id: "supported_pid_matrix", captured: isCapturedReadout(supportedPidMatrix, "supportedPids") || isCoverageCapturedReadout("supported_pid_matrix") },
      { id: "live_pid_snapshot", captured: isCapturedReadout(livePidSnapshot, "monitorValues") || isCoverageCapturedReadout("live_pid_snapshot") }
    ];
    const requiredReadoutIds = requiredReadouts.map((item) => item.id);
    const capturedReadoutIds = requiredReadouts.filter((item) => item.captured).map((item) => item.id);
    const coverageEmptyReadoutIds = (normalizedCoverage.items || [])
      .filter((item) => item && item.status === "empty" && typeof item.id === "string")
      .map((item) => item.id);
    const emptyReadoutIds = [
      ...new Set([
        ...(Array.isArray(normalizedCoverage.emptyIds) ? normalizedCoverage.emptyIds : []),
        ...coverageEmptyReadoutIds
      ])
    ].filter((item) => requiredReadouts.some((readout) => readout.id === item) && !isCoverageCapturedReadout(item));
    const remainingReadoutIds = requiredReadouts
      .filter((item) => !item.captured && !emptyReadoutIds.includes(item.id))
      .map((item) => item.id);
    const pendingReadoutIds = [...remainingReadoutIds, ...emptyReadoutIds];
    const readoutStates = requiredReadouts.map((item) => ({
      id: item.id,
      label: coverageLabelById.get(item.id) || item.id,
      priority: fallbackPriorityById[item.id] || 0,
      status: item.captured ? "captured" : emptyReadoutIds.includes(item.id) ? "empty" : "missing"
    }));
    const readoutStateById = Object.fromEntries(readoutStates.map((item) => [item.id, { ...item }]));
    const pendingReadoutStates = pendingReadoutIds
      .map((id) => readoutStateById[id])
      .filter(Boolean)
      .map((item) => ({ ...item }));
    const pendingReadoutStateById = Object.fromEntries(pendingReadoutStates.map((item) => [item.id, { ...item }]));
    const pendingReadoutQueue = pendingReadoutStates.map((item, index) => ({
      ...item,
      position: index + 1,
      isNext: index === 0
    }));
    const pendingReadoutQueueById = Object.fromEntries(pendingReadoutQueue.map((item) => [item.id, { ...item }]));
    const nextPendingReadoutId = pendingReadoutIds[0] || null;
    const nextPendingReadoutState = nextPendingReadoutId ? pendingReadoutStateById[nextPendingReadoutId] || null : null;
    const pendingReadoutQueueSummary = {
      totalCount: pendingReadoutQueue.length,
      hasPendingReadouts: pendingReadoutQueue.length > 0,
      nextReadoutId: nextPendingReadoutId,
      nextReadoutLabel: nextPendingReadoutState?.label || null,
      nextReadoutStatus: nextPendingReadoutState?.status || null,
      pendingPercent: readoutStates.length
        ? Math.round((pendingReadoutQueue.length / readoutStates.length) * 100)
        : 0,
      remainingAfterNextCount: Math.max(0, pendingReadoutQueue.length - 1)
    };
    const readoutStatesByStatus = {
      captured: readoutStates.filter((item) => item.status === "captured").map((item) => ({ ...item })),
      empty: readoutStates.filter((item) => item.status === "empty").map((item) => ({ ...item })),
      missing: readoutStates.filter((item) => item.status === "missing").map((item) => ({ ...item }))
    };
    const capturedReadoutPercent = readoutStates.length
      ? Math.round((capturedReadoutIds.length / readoutStates.length) * 100)
      : 0;
    const readoutStateSummary = {
      totalCount: readoutStates.length,
      capturedCount: capturedReadoutIds.length,
      emptyCount: emptyReadoutIds.length,
      missingCount: remainingReadoutIds.length,
      pendingCount: pendingReadoutIds.length,
      openCount: pendingReadoutIds.length,
      capturedPercent: capturedReadoutPercent,
      pendingPercent: pendingReadoutQueueSummary.pendingPercent,
      attemptedCount: capturedReadoutIds.length + emptyReadoutIds.length,
      attemptedPercent: readoutStates.length
        ? Math.round(((capturedReadoutIds.length + emptyReadoutIds.length) / readoutStates.length) * 100)
        : 0
    };
    const blockingWarningIds = resolveWarningList(warnings).filter((warning) => (
      warning === "bridge_readout_incomplete"
      || warning === "bridge_readout_empty_sections"
      || warning === "vehicle_profile_manual"
      || warning === "vehicle_applicability_manual_confirmation"
      || warning === "vehicle_applicability_unlisted"
      || warning === "vehicle_unlisted_confirm_vehicle_profile"
    ));
    const fallbackCandidateIds = Array.isArray(remainingReadoutIds) && remainingReadoutIds.length
      ? [...remainingReadoutIds]
      : (Array.isArray(emptyReadoutIds) ? [...emptyReadoutIds] : []);
    const fallbackNextRecommendedReadoutId = fallbackCandidateIds
      .sort((left, right) => {
        if ((applicability.status === "manual" || applicability.status === "unlisted") && left !== right) {
          if (left === "ecu_info_snapshot") return -1;
          if (right === "ecu_info_snapshot") return 1;
        }
        return (fallbackPriorityById[right] || 0) - (fallbackPriorityById[left] || 0);
      })[0] || null;
    const nextReadoutCandidate = nextReadoutCandidates[0] ? { ...nextReadoutCandidates[0] } : null;
    const nextRecommendedReadoutId = nextReadoutCandidate?.id || fallbackNextRecommendedReadoutId;
    const nextReadoutSource = nextReadoutCandidate
      ? "explicit_candidate"
      : fallbackNextRecommendedReadoutId
        ? "fallback_state"
        : null;
    const nextReadoutState = readoutStates.find((item) => item.id === nextRecommendedReadoutId) || null;
    const nextReadoutQueueEntry = nextRecommendedReadoutId
      ? pendingReadoutQueueById[nextRecommendedReadoutId] || null
      : null;
    const nextReadoutSummary = nextRecommendedReadoutId ? {
      id: nextRecommendedReadoutId,
      label: nextReadoutState?.label || nextReadoutCandidate?.label || nextRecommendedReadoutId,
      status: nextReadoutState?.status || null,
      source: nextReadoutSource,
      priority: nextReadoutState?.priority ?? nextReadoutCandidate?.priority ?? null,
      queuePosition: nextReadoutQueueEntry?.position || null,
      isPending: pendingReadoutIds.includes(nextRecommendedReadoutId),
      isMissing: remainingReadoutIds.includes(nextRecommendedReadoutId),
      isEmpty: emptyReadoutIds.includes(nextRecommendedReadoutId)
    } : null;
    const nextReadoutRequest = buildReadOnlyNextReadoutRequest(nextReadoutSummary);
    if (nextReadoutSummary && nextReadoutRequest) {
      nextReadoutSummary.readoutRequest = nextReadoutRequest;
    }
    const pendingReadoutRequestQueue = pendingReadoutQueue
      .map((item) => {
        const request = buildReadOnlyNextReadoutRequest(item);
        return request ? {
          ...request,
          queuePosition: item.position,
          isNext: item.isNext === true
        } : null;
      })
      .filter(Boolean);
    const pendingReadoutRequestQueueById = Object.fromEntries(pendingReadoutRequestQueue.map((item) => [item.readoutId, { ...item }]));
    const pendingReadoutRequestPlanEntries = nextReadoutRequest && !pendingReadoutRequestQueue.some((item) => item.readoutId === nextReadoutRequest.readoutId)
      ? [{ ...nextReadoutRequest, queuePosition: nextReadoutSummary?.queuePosition || null, isNext: false, isRecommended: true }, ...pendingReadoutRequestQueue]
      : pendingReadoutRequestQueue;
    const mappedPendingReadoutRequests = pendingReadoutRequestPlanEntries.filter((item) => Boolean(item.bridgeIntent));
    const unmappedPendingReadoutRequestIds = pendingReadoutRequestPlanEntries
      .filter((item) => !item.bridgeIntent)
      .map((item) => item.readoutId);
    const readoutRequestPlanSafetySummary = buildReadoutRequestPlanSafetySummary(pendingReadoutRequestPlanEntries, unmappedPendingReadoutRequestIds);
    const pendingReadoutRequestPlan = {
      schemaVersion: "read_only_readout_request_plan_v1",
      schema_version: "read_only_readout_request_plan_v1",
      totalCount: pendingReadoutRequestPlanEntries.length,
      total_count: pendingReadoutRequestPlanEntries.length,
      mappedCount: mappedPendingReadoutRequests.length,
      mapped_count: mappedPendingReadoutRequests.length,
      unmappedCount: unmappedPendingReadoutRequestIds.length,
      unmapped_count: unmappedPendingReadoutRequestIds.length,
      allMapped: unmappedPendingReadoutRequestIds.length === 0,
      all_mapped: unmappedPendingReadoutRequestIds.length === 0,
      ...readoutRequestPlanSafetySummary,
      unmappedRequestIds: [...unmappedPendingReadoutRequestIds],
      unmapped_request_ids: [...unmappedPendingReadoutRequestIds],
      nextRequest: nextReadoutRequest || pendingReadoutRequestPlanEntries.find((item) => item.isNext) || pendingReadoutRequestPlanEntries[0] || null,
      next_request: nextReadoutRequest || pendingReadoutRequestPlanEntries.find((item) => item.isNext) || pendingReadoutRequestPlanEntries[0] || null,
      requestIds: pendingReadoutRequestPlanEntries.map((item) => item.readoutId),
      request_ids: pendingReadoutRequestPlanEntries.map((item) => item.readoutId),
      bridgeIntents: [...new Set(mappedPendingReadoutRequests.map((item) => item.bridgeIntent))],
      bridge_intents: [...new Set(mappedPendingReadoutRequests.map((item) => item.bridgeIntent))],
      executionEnabled: false,
      execution_enabled: false,
      readOnly: true,
      read_only: true,
      retainedRawText: false,
      retained_raw_text: false,
      wouldTransmit: false,
      would_transmit: false,
      vehicleCommandEnabled: false,
      vehicle_command_enabled: false
    };
    const requestPlanBlockedReasonIds = Array.isArray(pendingReadoutRequestPlan.blockedReasonIds)
      ? [...pendingReadoutRequestPlan.blockedReasonIds]
      : [];
    const requestPlanBlockedReasonById = pendingReadoutRequestPlan.blockedReasonById && typeof pendingReadoutRequestPlan.blockedReasonById === "object"
      ? { ...pendingReadoutRequestPlan.blockedReasonById }
      : {};
    const readoutRequestPlanGateActionQueue = buildReadoutRequestPlanGateActionQueue(requestPlanBlockedReasonIds, requestPlanBlockedReasonById);
    const readoutRequestPlanGateActionQueueById = Object.fromEntries(readoutRequestPlanGateActionQueue.map((item) => [item.id, { ...item }]));
    const readoutRequestPlanGateActionQueueByReasonId = Object.fromEntries(readoutRequestPlanGateActionQueue.map((item) => [item.reasonId, { ...item }]));
    const readoutRequestPlanGateActionQueueByReadoutId = Object.fromEntries(readoutRequestPlanGateActionQueue.flatMap((item) => (Array.isArray(item.readoutIds) ? item.readoutIds : []).map((readoutId) => [readoutId, { ...item }])));
    const readoutRequestPlanGateActionIds = readoutRequestPlanGateActionQueue.map((item) => item.id).filter(Boolean);
    const readoutRequestPlanGateActionReasonIds = readoutRequestPlanGateActionQueue.map((item) => item.reasonId).filter(Boolean);
    const readoutRequestPlanGateActionReadoutIds = [...new Set(readoutRequestPlanGateActionQueue.flatMap((item) => Array.isArray(item.readoutIds) ? item.readoutIds : []).filter(Boolean))];
    const readoutRequestPlanGateActionSummary = {
      actionRequired: readoutRequestPlanGateActionQueue.length > 0,
      action_required: readoutRequestPlanGateActionQueue.length > 0,
      actionCount: readoutRequestPlanGateActionQueue.length,
      action_count: readoutRequestPlanGateActionQueue.length,
      reasonCount: readoutRequestPlanGateActionReasonIds.length,
      reason_count: readoutRequestPlanGateActionReasonIds.length,
      readoutCount: readoutRequestPlanGateActionReadoutIds.length,
      readout_count: readoutRequestPlanGateActionReadoutIds.length,
      actionIds: [...readoutRequestPlanGateActionIds],
      action_ids: [...readoutRequestPlanGateActionIds],
      reasonIds: [...readoutRequestPlanGateActionReasonIds],
      reason_ids: [...readoutRequestPlanGateActionReasonIds],
      readoutIds: [...readoutRequestPlanGateActionReadoutIds],
      readout_ids: [...readoutRequestPlanGateActionReadoutIds],
      nextActionId: readoutRequestPlanGateActionQueue[0]?.id || null,
      next_action_id: readoutRequestPlanGateActionQueue[0]?.id || null,
      nextActionReasonId: readoutRequestPlanGateActionQueue[0]?.reasonId || null,
      next_action_reason_id: readoutRequestPlanGateActionQueue[0]?.reasonId || null,
      nextActionReadoutIds: readoutRequestPlanGateActionQueue[0]?.readoutIds ? [...readoutRequestPlanGateActionQueue[0].readoutIds] : [],
      next_action_readout_ids: readoutRequestPlanGateActionQueue[0]?.readoutIds ? [...readoutRequestPlanGateActionQueue[0].readoutIds] : [],
      readOnly: true,
      read_only: true,
      wouldTransmit: false,
      would_transmit: false,
      vehicleCommandEnabled: false,
      vehicle_command_enabled: false
    };
    const readoutRequestPlanGateSummary = {
      schemaVersion: "readout_request_plan_gate_v1",
      schema_version: "readout_request_plan_gate_v1",
      state: pendingReadoutRequestPlan.totalCount === 0 ? "idle" : requestPlanBlockedReasonIds.length ? "blocked" : "ready",
      ready: requestPlanBlockedReasonIds.length === 0,
      blocked: requestPlanBlockedReasonIds.length > 0,
      blockedReasonCount: requestPlanBlockedReasonIds.length,
      blocked_reason_count: requestPlanBlockedReasonIds.length,
      blockedReasonIds: [...requestPlanBlockedReasonIds],
      blocked_reason_ids: [...requestPlanBlockedReasonIds],
      blockedReasonById: requestPlanBlockedReasonById,
      blocked_reason_by_id: requestPlanBlockedReasonById,
      nextBlockedReasonId: requestPlanBlockedReasonIds[0] || null,
      next_blocked_reason_id: requestPlanBlockedReasonIds[0] || null,
      actionRequired: readoutRequestPlanGateActionQueue.length > 0,
      action_required: readoutRequestPlanGateActionQueue.length > 0,
      actionCount: readoutRequestPlanGateActionQueue.length,
      action_count: readoutRequestPlanGateActionQueue.length,
      actionIds: [...readoutRequestPlanGateActionIds],
      action_ids: [...readoutRequestPlanGateActionIds],
      actionReasonIds: [...readoutRequestPlanGateActionReasonIds],
      action_reason_ids: [...readoutRequestPlanGateActionReasonIds],
      actionReadoutIds: [...readoutRequestPlanGateActionReadoutIds],
      action_readout_ids: [...readoutRequestPlanGateActionReadoutIds],
      actionSummary: readoutRequestPlanGateActionSummary,
      action_summary: readoutRequestPlanGateActionSummary,
      actionQueue: readoutRequestPlanGateActionQueue,
      action_queue: readoutRequestPlanGateActionQueue,
      actionQueueById: readoutRequestPlanGateActionQueueById,
      action_queue_by_id: readoutRequestPlanGateActionQueueById,
      actionQueueByReasonId: readoutRequestPlanGateActionQueueByReasonId,
      action_queue_by_reason_id: readoutRequestPlanGateActionQueueByReasonId,
      actionQueueByReadoutId: readoutRequestPlanGateActionQueueByReadoutId,
      action_queue_by_readout_id: readoutRequestPlanGateActionQueueByReadoutId,
      nextAction: readoutRequestPlanGateActionQueue[0] ? { ...readoutRequestPlanGateActionQueue[0] } : null,
      next_action: readoutRequestPlanGateActionQueue[0] ? { ...readoutRequestPlanGateActionQueue[0] } : null,
      nextActionId: readoutRequestPlanGateActionQueue[0]?.id || null,
      next_action_id: readoutRequestPlanGateActionQueue[0]?.id || null,
      nextActionReasonId: readoutRequestPlanGateActionQueue[0]?.reasonId || null,
      next_action_reason_id: readoutRequestPlanGateActionQueue[0]?.reasonId || null,
      nextActionReadoutIds: readoutRequestPlanGateActionQueue[0]?.readoutIds ? [...readoutRequestPlanGateActionQueue[0].readoutIds] : [],
      next_action_readout_ids: readoutRequestPlanGateActionQueue[0]?.readoutIds ? [...readoutRequestPlanGateActionQueue[0].readoutIds] : [],
      totalCount: pendingReadoutRequestPlan.totalCount,
      total_count: pendingReadoutRequestPlan.totalCount,
      mappedCount: pendingReadoutRequestPlan.mappedCount,
      mapped_count: pendingReadoutRequestPlan.mappedCount,
      unmappedCount: pendingReadoutRequestPlan.unmappedCount,
      unmapped_count: pendingReadoutRequestPlan.unmappedCount,
      safeForBridgePlanning: pendingReadoutRequestPlan.safeForBridgePlanning === true,
      safe_for_bridge_planning: pendingReadoutRequestPlan.safeForBridgePlanning === true,
      executionEnabled: false,
      execution_enabled: false,
      readOnly: true,
      read_only: true,
      wouldTransmit: false,
      would_transmit: false,
      vehicleCommandEnabled: false,
      vehicle_command_enabled: false
    };
    const readoutRequestPlanSummary = buildReadoutRequestPlanSummary(pendingReadoutRequestPlan, readoutRequestPlanGateSummary, nextReadoutRequest);
    Object.assign(pendingReadoutQueueSummary, {
      recommendedReadoutId: nextReadoutSummary?.id || null,
      recommendedReadoutLabel: nextReadoutSummary?.label || null,
      recommendedReadoutStatus: nextReadoutSummary?.status || null,
      recommendedReadoutSource: nextReadoutSummary?.source || null,
      recommendedReadoutQueuePosition: nextReadoutSummary?.queuePosition || null,
      recommendedReadoutIsPending: nextReadoutSummary?.isPending === true
    });
    const directCompletionPercent = Math.round((capturedReadoutIds.length / requiredReadouts.length) * 100);
    const completionPercent = normalizedCoverage.totalCategories > 0
      ? Math.max(directCompletionPercent, normalizedCoverage.capturedPercent)
      : directCompletionPercent;
    const readoutProgressSummary = {
      requiredCount: requiredReadoutIds.length,
      capturedCount: capturedReadoutIds.length,
      attemptedCount: readoutStateSummary.attemptedCount,
      pendingCount: pendingReadoutIds.length,
      openCount: pendingReadoutIds.length,
      capturedPercent: readoutStateSummary.capturedPercent,
      attemptedPercent: readoutStateSummary.attemptedPercent,
      pendingPercent: readoutStateSummary.pendingPercent,
      completionPercent
    };
    const readoutCompletionSummary = {
      complete: pendingReadoutIds.length === 0,
      hasAnyReadout: capturedReadoutIds.length > 0 || emptyReadoutIds.length > 0,
      hasCapturedReadouts: capturedReadoutIds.length > 0,
      hasMissingReadouts: remainingReadoutIds.length > 0,
      hasEmptyReadouts: emptyReadoutIds.length > 0,
      requiredCount: requiredReadoutIds.length,
      capturedCount: capturedReadoutIds.length,
      missingCount: remainingReadoutIds.length,
      emptyCount: emptyReadoutIds.length,
      pendingCount: pendingReadoutIds.length,
      requiredIds: [...requiredReadoutIds],
      capturedIds: [...capturedReadoutIds],
      missingIds: [...remainingReadoutIds],
      emptyIds: [...emptyReadoutIds],
      pendingIds: [...pendingReadoutIds],
      completionPercent
    };
    const analysisBlockers = [
      ...(remainingReadoutIds.length ? ["missing_readouts"] : []),
      ...(emptyReadoutIds.length ? ["empty_readouts"] : []),
      ...(blockingWarningIds.length ? ["blocking_warnings"] : [])
    ];
    const analysisBlockerById = {
      missing_readouts: { count: remainingReadoutIds.length, readoutIds: [...remainingReadoutIds] },
      empty_readouts: { count: emptyReadoutIds.length, readoutIds: [...emptyReadoutIds] },
      blocking_warnings: { count: blockingWarningIds.length, warningIds: [...blockingWarningIds] }
    };
    const primaryBlockingReasonId = analysisBlockers[0] || null;
    const primaryBlockingReason = primaryBlockingReasonId ? analysisBlockerById[primaryBlockingReasonId] || null : null;
    const primaryBlockingReadoutId = primaryBlockingReason?.readoutIds?.[0] || null;
    const primaryBlockingReadoutLabel = primaryBlockingReadoutId
      ? readoutStateById[primaryBlockingReadoutId]?.label || coverageLabelById.get(primaryBlockingReadoutId) || primaryBlockingReadoutId
      : null;
    const primaryBlockingReadoutState = primaryBlockingReadoutId ? readoutStateById[primaryBlockingReadoutId] || null : null;
    const primaryBlockingReadoutRequest = primaryBlockingReadoutId
      ? buildReadOnlyNextReadoutRequest({
        id: primaryBlockingReadoutId,
        label: primaryBlockingReadoutLabel || primaryBlockingReadoutId,
        status: primaryBlockingReadoutState?.status || null,
        source: "primary_blocker"
      })
      : null;
    const primaryBlockingSummary = primaryBlockingReasonId ? {
      schemaVersion: "primary_readout_blocker_v1",
      reasonId: primaryBlockingReasonId,
      reason: primaryBlockingReason,
      readoutId: primaryBlockingReadoutId,
      readoutLabel: primaryBlockingReadoutLabel,
      readoutStatus: primaryBlockingReadoutState?.status || null,
      request: primaryBlockingReadoutRequest,
      bridgeIntent: primaryBlockingReadoutRequest?.bridgeIntent || null,
      serviceMode: primaryBlockingReadoutRequest?.serviceMode || null,
      requestMapped: Boolean(primaryBlockingReadoutRequest?.bridgeIntent),
      executionEnabled: primaryBlockingReadoutRequest?.executionEnabled === true,
      readOnly: primaryBlockingReadoutRequest ? primaryBlockingReadoutRequest.readOnly !== false : true,
      wouldTransmit: primaryBlockingReadoutRequest?.wouldTransmit === true,
      vehicleCommandEnabled: primaryBlockingReadoutRequest?.vehicleCommandEnabled === true
    } : null;
    Object.assign(readoutCompletionSummary, {
      primaryBlockingReasonId,
      primaryBlockingReason,
      primaryBlockingReadoutId,
      primaryBlockingReadoutLabel,
      primaryBlockingReadoutRequest,
      primaryBlockingSummary
    });
    const analysisBlockerSummary = {
      totalCount: analysisBlockers.length,
      missingReadoutCount: remainingReadoutIds.length,
      emptyReadoutCount: emptyReadoutIds.length,
      blockingWarningCount: blockingWarningIds.length
    };
    const vehicleApplicabilityBlockingWarningIds = [
      "vehicle_profile_manual",
      "vehicle_applicability_manual_confirmation",
      "vehicle_applicability_unlisted",
      "vehicle_unlisted_confirm_vehicle_profile"
    ];
    const vehicleApplicabilityBlocking = blockingWarningIds.some((warning) => vehicleApplicabilityBlockingWarningIds.includes(warning));
    const vehicleApplicabilityNeedsReview = applicability.status === "partial"
      || applicability.status === "manual"
      || applicability.status === "unlisted";
    const readCount = (...values) => {
      for (const value of values) {
        if (Number.isFinite(Number(value))) return Math.max(0, Math.round(Number(value)));
      }
      return 0;
    };
    const rawPidUndecodedCount = readCount(livePidSnapshot?.monitorValueSummary?.undecodedRawCount)
      + readCount(freezeFrameSnapshot?.monitorValueSummary?.undecodedRawCount);
    const readinessIncompleteCount = readCount(readinessSnapshot?.incompleteCount);
    const ecuInfoMissingKeyCount = readCount(ecuInfoSnapshot?.keyItemSummary?.missingCount);
    const onboardMonitorFailedCount = readCount(onboardMonitorSnapshot?.failedCount);
    const readoutQualityIssues = [
      rawPidUndecodedCount > 0 ? { id: "raw_pid_values_need_conversion", count: rawPidUndecodedCount, severity: "review" } : null,
      readinessIncompleteCount > 0 ? { id: "readiness_incomplete", count: readinessIncompleteCount, severity: "review" } : null,
      ecuInfoMissingKeyCount > 0 ? { id: "mode09_key_items_missing", count: ecuInfoMissingKeyCount, severity: "review" } : null,
      onboardMonitorFailedCount > 0 ? { id: "onboard_monitor_test_failed", count: onboardMonitorFailedCount, severity: "review" } : null
    ].filter(Boolean);
    const readoutQualitySummary = {
      schemaVersion: "readout_quality_summary_v1",
      issueCount: readoutQualityIssues.length,
      issueIds: readoutQualityIssues.map((item) => item.id),
      issues: readoutQualityIssues,
      reviewRequired: readoutQualityIssues.length > 0,
      readyForInterpretation: readoutQualityIssues.length === 0,
      rawPidUndecodedCount,
      readinessIncompleteCount,
      ecuInfoMissingKeyCount,
      onboardMonitorFailedCount
    };
    const analysisChecklist = [
      {
        id: "required_readouts",
        label: "Required core readouts",
        state: pendingReadoutIds.length > 0 ? "pending" : "complete",
        complete: pendingReadoutIds.length === 0,
        blocking: pendingReadoutIds.length > 0,
        requiredCount: requiredReadoutIds.length,
        capturedCount: capturedReadoutIds.length,
        missingCount: remainingReadoutIds.length,
        emptyCount: emptyReadoutIds.length,
        pendingCount: pendingReadoutIds.length
      },
      {
        id: "blocking_warnings",
        label: "Blocking warnings",
        state: blockingWarningIds.length > 0 ? "blocked" : "complete",
        complete: blockingWarningIds.length === 0,
        blocking: blockingWarningIds.length > 0,
        warningCount: blockingWarningIds.length,
        warningIds: [...blockingWarningIds]
      },
      {
        id: "readout_quality",
        label: "Readout quality",
        state: readoutQualitySummary.reviewRequired ? "review" : "complete",
        complete: !readoutQualitySummary.reviewRequired,
        blocking: false,
        issueCount: readoutQualitySummary.issueCount,
        issueIds: [...readoutQualitySummary.issueIds],
        rawPidUndecodedCount,
        readinessIncompleteCount,
        ecuInfoMissingKeyCount,
        onboardMonitorFailedCount
      },
      {
        id: "vehicle_applicability",
        label: "Vehicle applicability",
        state: vehicleApplicabilityBlocking ? "blocked" : vehicleApplicabilityNeedsReview ? "review" : "complete",
        complete: !vehicleApplicabilityNeedsReview,
        blocking: vehicleApplicabilityBlocking,
        applicabilityStatus: applicability.status || "unknown",
        candidateRangeCount: applicability.candidateRangeCount || 0,
        applicableRangeCount: applicability.applicableRangeCount || 0,
        supportedEngineCodeCount: applicability.supportedEngineCodeCount || 0
      }
    ];
    const analysisChecklistById = Object.fromEntries(analysisChecklist.map((item) => [item.id, { ...item }]));
    const analysisChecklistSummary = {
      totalCount: analysisChecklist.length,
      completeCount: analysisChecklist.filter((item) => item.complete).length,
      blockingCount: analysisChecklist.filter((item) => item.blocking).length,
      reviewCount: analysisChecklist.filter((item) => item.state === "review").length,
      pendingCount: analysisChecklist.filter((item) => item.state === "pending").length,
      blockedIds: analysisChecklist.filter((item) => item.blocking).map((item) => item.id),
      reviewIds: analysisChecklist.filter((item) => item.state === "review").map((item) => item.id),
      ready: analysisBlockers.length === 0
    };
    const readyForAnalysis = analysisBlockers.length === 0;
    const hasReadoutProgress = capturedReadoutIds.length > 0
      || emptyReadoutIds.length > 0
      || normalizedCoverage.availableCategories > 0;
    const coreStatus = readyForAnalysis ? "analysis_ready" : hasReadoutProgress ? "collecting_readouts" : "not_started";
    const coreWorkflowSummary = {
      currentStep: readyForAnalysis ? "analysis" : hasReadoutProgress ? "readout_collection" : "readout_start",
      status: coreStatus,
      nextAction: readyForAnalysis ? "start_analysis" : nextReadoutSummary ? "collect_next_readout" : "start_core_readouts",
      nextReadoutId: nextReadoutSummary?.id || null,
      nextReadoutLabel: nextReadoutSummary?.label || null,
      nextReadoutStatus: nextReadoutSummary?.status || null,
      nextReadoutSource: nextReadoutSummary?.source || null,
      nextReadoutQueuePosition: nextReadoutSummary?.queuePosition || null,
      readyForAnalysis,
      completionPercent: readoutProgressSummary.completionPercent,
      blockerCount: analysisBlockers.length,
      pendingReadoutCount: readoutProgressSummary.pendingCount,
      primaryBlockingReasonId,
      primaryBlockingReadoutId,
      primaryBlockingReadoutLabel,
      primaryBlockingReadoutRequest,
      primaryBlockingSummary
    };
    const analysisReadinessSummary = {
      ready: readyForAnalysis,
      status: coreStatus,
      blockerCount: analysisBlockers.length,
      blockerIds: [...analysisBlockers],
      blockerSummary: analysisBlockerSummary,
      blockersById: analysisBlockerById,
      checklist: analysisChecklist,
      checklistById: analysisChecklistById,
      checklistSummary: analysisChecklistSummary,
      readoutRequestPlanGateSummary,
      readoutQualitySummary,
      missingReadoutCount: analysisBlockerSummary.missingReadoutCount,
      emptyReadoutCount: analysisBlockerSummary.emptyReadoutCount,
      blockingWarningCount: analysisBlockerSummary.blockingWarningCount,
      readoutQualityIssueCount: readoutQualitySummary.issueCount,
      primaryBlockingReasonId,
      primaryBlockingReason,
      primaryBlockingReadoutId,
      primaryBlockingReadoutLabel,
      primaryBlockingReadoutRequest,
      primaryBlockingSummary,
      pendingReadoutCount: readoutProgressSummary.pendingCount,
      completionPercent: readoutProgressSummary.completionPercent,
      nextReadoutId: nextReadoutSummary?.id || null,
      nextReadoutLabel: nextReadoutSummary?.label || null,
      nextReadoutStatus: nextReadoutSummary?.status || null,
      nextReadoutSource: nextReadoutSummary?.source || null,
      nextReadoutQueuePosition: nextReadoutSummary?.queuePosition || null
    };
    return {
      schemaVersion: "core_session_status_v1",
      stage: "diagnostic_core",
      status: coreStatus,
      completionPercent,
      applicabilityStatus: applicability.status || "unknown",
      includeInfrastructure: normalizedCoverage.includeInfrastructure === true,
      requiredReadoutIds,
      capturedReadoutIds,
      missingReadoutIds: remainingReadoutIds,
      remainingReadoutIds,
      emptyReadoutIds,
      pendingReadoutIds,
      pendingReadoutStates,
      pendingReadoutStateById,
      pendingReadoutQueue,
      pendingReadoutQueueById,
      pendingReadoutQueueSummary,
      pendingReadoutRequestQueue,
      pendingReadoutRequestQueueById,
      pendingReadoutRequestPlan,
      readoutRequestPlanGateSummary,
      readoutRequestPlanSummary,
      readoutQualitySummary,
      nextPendingReadoutId,
      nextPendingReadoutState,
      readoutStates,
      readoutStateById,
      readoutStatesByStatus,
      readoutStateSummary,
      readoutProgressSummary,
      readoutCompletionSummary,
      coreWorkflowSummary,
      nextReadoutCandidate,
      nextRecommendedReadoutId,
      nextReadoutSource,
      nextReadoutState,
      nextReadoutSummary,
      nextReadoutRequest,
      analysisBlockers,
      analysisBlockerById,
      analysisBlockerSummary,
      primaryBlockingReasonId,
      primaryBlockingReason,
      primaryBlockingReadoutId,
      primaryBlockingReadoutLabel,
      primaryBlockingReadoutRequest,
      primaryBlockingSummary,
      analysisChecklist,
      analysisChecklistById,
      analysisChecklistSummary,
      analysisReadinessSummary,
      blockingWarningIds,
      readyForAnalysis
    };
  }

  function buildDiagnosticFlowSummary(coreSessionStatus = {}) {
    const workflow = coreSessionStatus?.coreWorkflowSummary || coreSessionStatus?.core_workflow_summary || {};
    const readiness = coreSessionStatus?.analysisReadinessSummary || coreSessionStatus?.analysis_readiness_summary || {};
    const progress = coreSessionStatus?.readoutProgressSummary || coreSessionStatus?.readout_progress_summary || {};
    const completion = coreSessionStatus?.readoutCompletionSummary || coreSessionStatus?.readout_completion_summary || {};
    const queueSummary = coreSessionStatus?.pendingReadoutQueueSummary || coreSessionStatus?.pending_readout_queue_summary || {};
    const checklistSummary = coreSessionStatus?.analysisChecklistSummary || coreSessionStatus?.analysis_checklist_summary || readiness.checklistSummary || readiness.checklist_summary || {};
    const checklistById = coreSessionStatus?.analysisChecklistById || coreSessionStatus?.analysis_checklist_by_id || readiness.checklistById || readiness.checklist_by_id || {};
    const checklistItems = Array.isArray(coreSessionStatus?.analysisChecklist)
      ? coreSessionStatus.analysisChecklist
      : Array.isArray(coreSessionStatus?.analysis_checklist)
        ? coreSessionStatus.analysis_checklist
      : Array.isArray(readiness.checklist)
        ? readiness.checklist
        : Object.values(checklistById || {});
    const diagnosticChecklist = checklistItems
      .filter((item) => item && typeof item === "object")
      .map((item) => ({ ...item }));
    const diagnosticChecklistById = {
      ...Object.fromEntries(
        Object.entries(checklistById || {})
          .filter(([, item]) => item && typeof item === "object")
          .map(([id, item]) => [id, { ...item }])
      )
    };
    diagnosticChecklist.forEach((item) => {
      if (item.id && !diagnosticChecklistById[item.id]) diagnosticChecklistById[item.id] = { ...item };
    });
    const vehicleApplicabilityChecklist = diagnosticChecklistById.vehicle_applicability || null;
    const readoutQualitySummary = coreSessionStatus?.readoutQualitySummary || coreSessionStatus?.readout_quality_summary || readiness.readoutQualitySummary || readiness.readout_quality_summary || {};
    const readoutQualityChecklist = diagnosticChecklistById.readout_quality || null;
    const applicabilityStatus = coreSessionStatus?.applicabilityStatus || coreSessionStatus?.applicability_status || vehicleApplicabilityChecklist?.applicabilityStatus || vehicleApplicabilityChecklist?.applicability_status || "unknown";
    const vehicleApplicabilityReviewRequired = vehicleApplicabilityChecklist?.state === "review"
      || applicabilityStatus === "partial"
      || applicabilityStatus === "manual"
      || applicabilityStatus === "unlisted";
    const toSnakeField = (field) => String(field || "").replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
    const readAliasValue = (source, field) => source && typeof source === "object" ? pickDefined(source[field], source[toSnakeField(field)]) : undefined;
    const readAliasList = (source, field) => {
      const value = readAliasValue(source, field);
      return Array.isArray(value) ? [...value] : [];
    };
    const checklistBlockedIds = readAliasList(checklistSummary, "blockedIds");
    const checklistReviewIds = readAliasList(checklistSummary, "reviewIds");
    const vehicleApplicabilityBlocking = vehicleApplicabilityChecklist?.blocking === true
      || checklistBlockedIds.includes("vehicle_applicability");
    const readCount = (field, fallbackIds = []) => Number.isFinite(Number(readAliasValue(completion, field)))
      ? Number(readAliasValue(completion, field))
      : Array.isArray(fallbackIds) ? fallbackIds.length : 0;
    const readChecklistCount = (field, fallbackIds = []) => Number.isFinite(Number(readAliasValue(checklistSummary, field)))
      ? Number(readAliasValue(checklistSummary, field))
      : Array.isArray(fallbackIds) ? fallbackIds.length : 0;
    const readyForAnalysisInput = pickDefined(coreSessionStatus?.readyForAnalysis, coreSessionStatus?.ready_for_analysis);
    const readyForAnalysis = typeof readyForAnalysisInput === "boolean"
      ? readyForAnalysisInput
      : readiness.ready === true;
    const pendingReadoutCount = Number.isFinite(Number(readAliasValue(progress, "pendingCount")))
      ? Number(readAliasValue(progress, "pendingCount"))
      : readCount("pendingCount", coreSessionStatus?.pendingReadoutIds || coreSessionStatus?.pending_readout_ids);
    const blockingReasonIds = Array.isArray(readiness.blockerIds)
      ? [...readiness.blockerIds]
      : Array.isArray(coreSessionStatus?.analysisBlockers) ? [...coreSessionStatus.analysisBlockers] : Array.isArray(coreSessionStatus?.analysis_blockers) ? [...coreSessionStatus.analysis_blockers] : [];
    const primaryBlockingReasonId = readiness.primaryBlockingReasonId
      || completion.primaryBlockingReasonId
      || coreSessionStatus?.primaryBlockingReasonId
      || coreSessionStatus?.primary_blocking_reason_id
      || blockingReasonIds[0]
      || null;
    const primaryBlockingReason = readiness.primaryBlockingReason
      || completion.primaryBlockingReason
      || coreSessionStatus?.primaryBlockingReason
      || coreSessionStatus?.primary_blocking_reason
      || (primaryBlockingReasonId && coreSessionStatus?.analysisBlockerById ? coreSessionStatus.analysisBlockerById[primaryBlockingReasonId] : null)
      || null;
    const primaryBlockingReadoutId = readiness.primaryBlockingReadoutId
      || completion.primaryBlockingReadoutId
      || coreSessionStatus?.primaryBlockingReadoutId
      || coreSessionStatus?.primary_blocking_readout_id
      || primaryBlockingReason?.readoutIds?.[0]
      || null;
    const primaryBlockingReadoutLabel = readiness.primaryBlockingReadoutLabel
      || completion.primaryBlockingReadoutLabel
      || coreSessionStatus?.primaryBlockingReadoutLabel
      || coreSessionStatus?.primary_blocking_readout_label
      || (primaryBlockingReadoutId && coreSessionStatus?.readoutStateById ? coreSessionStatus.readoutStateById[primaryBlockingReadoutId]?.label : null)
      || primaryBlockingReadoutId
      || null;
    const normalizeReadoutRequestEntry = (item) => {
      if (!item || typeof item !== "object") return item;
      return {
        ...item,
        readoutId: item.readoutId || item.readout_id || item.id || null,
        bridgeIntent: item.bridgeIntent || item.bridge_intent || null,
        serviceMode: item.serviceMode || item.service_mode || null,
        executionEnabled: pickDefined(item.executionEnabled, item.execution_enabled) === true,
        readOnly: pickDefined(item.readOnly, item.read_only) === true,
        wouldTransmit: pickDefined(item.wouldTransmit, item.would_transmit) === true,
        vehicleCommandEnabled: pickDefined(item.vehicleCommandEnabled, item.vehicle_command_enabled) === true
      };
    };
    const primaryBlockingReadoutRequest = normalizeReadoutRequestEntry(readiness.primaryBlockingReadoutRequest
      || completion.primaryBlockingReadoutRequest
      || coreSessionStatus?.primaryBlockingReadoutRequest
      || coreSessionStatus?.primary_blocking_readout_request
      || null);
    const primaryBlockingSummary = readiness.primaryBlockingSummary
      || completion.primaryBlockingSummary
      || coreSessionStatus?.primaryBlockingSummary
      || coreSessionStatus?.primary_blocking_summary
      || (primaryBlockingReasonId ? {
        schemaVersion: "primary_readout_blocker_v1",
        reasonId: primaryBlockingReasonId,
        reason: primaryBlockingReason,
        readoutId: primaryBlockingReadoutId,
        readoutLabel: primaryBlockingReadoutLabel,
        request: primaryBlockingReadoutRequest,
        bridgeIntent: primaryBlockingReadoutRequest?.bridgeIntent || null,
        serviceMode: primaryBlockingReadoutRequest?.serviceMode || null,
        requestMapped: Boolean(primaryBlockingReadoutRequest?.bridgeIntent),
        executionEnabled: primaryBlockingReadoutRequest?.executionEnabled === true,
        readOnly: primaryBlockingReadoutRequest ? primaryBlockingReadoutRequest.readOnly !== false : true,
        wouldTransmit: primaryBlockingReadoutRequest?.wouldTransmit === true,
        vehicleCommandEnabled: primaryBlockingReadoutRequest?.vehicleCommandEnabled === true
      } : null);
    const nextReadoutSummary = coreSessionStatus?.nextReadoutSummary || coreSessionStatus?.next_readout_summary || null;
    const nextReadoutRequest = normalizeReadoutRequestEntry(coreSessionStatus?.nextReadoutRequest || coreSessionStatus?.next_readout_request || nextReadoutSummary?.readoutRequest || nextReadoutSummary?.readout_request || null);
    const pendingReadoutRequestQueueInput = Array.isArray(coreSessionStatus?.pendingReadoutRequestQueue)
      ? coreSessionStatus.pendingReadoutRequestQueue
      : Array.isArray(coreSessionStatus?.pending_readout_request_queue)
        ? coreSessionStatus.pending_readout_request_queue
      : [];
    const pendingReadoutRequestQueue = pendingReadoutRequestQueueInput.map((item) => normalizeReadoutRequestEntry(item)).filter((item) => item && typeof item === "object");
    const mappedPendingReadoutRequests = pendingReadoutRequestQueue.filter((item) => Boolean(item.bridgeIntent));
    const unmappedPendingReadoutRequestIds = pendingReadoutRequestQueue
      .filter((item) => !item.bridgeIntent)
      .map((item) => item.readoutId);
    const fallbackReadoutRequestPlanSafetySummary = buildReadoutRequestPlanSafetySummary(pendingReadoutRequestQueue, unmappedPendingReadoutRequestIds);
    const pendingReadoutRequestPlan = coreSessionStatus?.pendingReadoutRequestPlan || coreSessionStatus?.pending_readout_request_plan || {
      schemaVersion: "read_only_readout_request_plan_v1",
      totalCount: pendingReadoutRequestQueue.length,
      mappedCount: mappedPendingReadoutRequests.length,
      unmappedCount: unmappedPendingReadoutRequestIds.length,
      allMapped: unmappedPendingReadoutRequestIds.length === 0,
      ...fallbackReadoutRequestPlanSafetySummary,
      unmappedRequestIds: [...unmappedPendingReadoutRequestIds],
      nextRequest: pendingReadoutRequestQueue.find((item) => item.isNext) || pendingReadoutRequestQueue[0] || null,
      requestIds: pendingReadoutRequestQueue.map((item) => item.readoutId),
      bridgeIntents: [...new Set(mappedPendingReadoutRequests.map((item) => item.bridgeIntent))],
      executionEnabled: false,
      readOnly: true,
      wouldTransmit: false,
      vehicleCommandEnabled: false
    };
    const fallbackRequestPlanBlockedReasonIds = Array.isArray(pendingReadoutRequestPlan?.blockedReasonIds) ? [...pendingReadoutRequestPlan.blockedReasonIds] : [];
    const fallbackRequestPlanBlockedReasonById = pendingReadoutRequestPlan?.blockedReasonById && typeof pendingReadoutRequestPlan.blockedReasonById === "object" ? { ...pendingReadoutRequestPlan.blockedReasonById } : {};
    const fallbackRequestPlanGateActionQueue = buildReadoutRequestPlanGateActionQueue(fallbackRequestPlanBlockedReasonIds, fallbackRequestPlanBlockedReasonById);
    const fallbackRequestPlanGateActionQueueById = Object.fromEntries(fallbackRequestPlanGateActionQueue.map((item) => [item.id, { ...item }]));
    const fallbackRequestPlanGateActionQueueByReasonId = Object.fromEntries(fallbackRequestPlanGateActionQueue.map((item) => [item.reasonId, { ...item }]));
    const fallbackRequestPlanGateActionQueueByReadoutId = Object.fromEntries(fallbackRequestPlanGateActionQueue.flatMap((item) => (Array.isArray(item.readoutIds) ? item.readoutIds : []).map((readoutId) => [readoutId, { ...item }])));
    const fallbackRequestPlanGateActionIds = fallbackRequestPlanGateActionQueue.map((item) => item.id).filter(Boolean);
    const fallbackRequestPlanGateActionReasonIds = fallbackRequestPlanGateActionQueue.map((item) => item.reasonId).filter(Boolean);
    const fallbackRequestPlanGateActionReadoutIds = [...new Set(fallbackRequestPlanGateActionQueue.flatMap((item) => Array.isArray(item.readoutIds) ? item.readoutIds : []).filter(Boolean))];
    const fallbackRequestPlanGateActionSummary = {
      actionRequired: fallbackRequestPlanGateActionQueue.length > 0,
      action_required: fallbackRequestPlanGateActionQueue.length > 0,
      actionCount: fallbackRequestPlanGateActionQueue.length,
      action_count: fallbackRequestPlanGateActionQueue.length,
      reasonCount: fallbackRequestPlanGateActionReasonIds.length,
      reason_count: fallbackRequestPlanGateActionReasonIds.length,
      readoutCount: fallbackRequestPlanGateActionReadoutIds.length,
      readout_count: fallbackRequestPlanGateActionReadoutIds.length,
      actionIds: [...fallbackRequestPlanGateActionIds],
      action_ids: [...fallbackRequestPlanGateActionIds],
      reasonIds: [...fallbackRequestPlanGateActionReasonIds],
      reason_ids: [...fallbackRequestPlanGateActionReasonIds],
      readoutIds: [...fallbackRequestPlanGateActionReadoutIds],
      readout_ids: [...fallbackRequestPlanGateActionReadoutIds],
      nextActionId: fallbackRequestPlanGateActionQueue[0]?.id || null,
      next_action_id: fallbackRequestPlanGateActionQueue[0]?.id || null,
      nextActionReasonId: fallbackRequestPlanGateActionQueue[0]?.reasonId || null,
      next_action_reason_id: fallbackRequestPlanGateActionQueue[0]?.reasonId || null,
      nextActionReadoutIds: fallbackRequestPlanGateActionQueue[0]?.readoutIds ? [...fallbackRequestPlanGateActionQueue[0].readoutIds] : [],
      next_action_readout_ids: fallbackRequestPlanGateActionQueue[0]?.readoutIds ? [...fallbackRequestPlanGateActionQueue[0].readoutIds] : [],
      readOnly: true,
      read_only: true,
      wouldTransmit: false,
      would_transmit: false,
      vehicleCommandEnabled: false,
      vehicle_command_enabled: false
    };
    const readoutRequestPlanGateSummary = coreSessionStatus?.readoutRequestPlanGateSummary || coreSessionStatus?.readout_request_plan_gate_summary || readiness.readoutRequestPlanGateSummary || readiness.readout_request_plan_gate_summary || {
      schemaVersion: "readout_request_plan_gate_v1",
      schema_version: "readout_request_plan_gate_v1",
      state: pendingReadoutRequestPlan.totalCount === 0 ? "idle" : pendingReadoutRequestPlan?.safeForBridgePlanning === true ? "ready" : "blocked",
      ready: pendingReadoutRequestPlan?.safeForBridgePlanning === true,
      blocked: pendingReadoutRequestPlan?.safeForBridgePlanning !== true && Number(pendingReadoutRequestPlan.totalCount || 0) > 0,
      blockedReasonCount: fallbackRequestPlanBlockedReasonIds.length,
      blocked_reason_count: fallbackRequestPlanBlockedReasonIds.length,
      blockedReasonIds: [...fallbackRequestPlanBlockedReasonIds],
      blocked_reason_ids: [...fallbackRequestPlanBlockedReasonIds],
      blockedReasonById: fallbackRequestPlanBlockedReasonById,
      blocked_reason_by_id: fallbackRequestPlanBlockedReasonById,
      nextBlockedReasonId: fallbackRequestPlanBlockedReasonIds[0] || null,
      next_blocked_reason_id: fallbackRequestPlanBlockedReasonIds[0] || null,
      actionRequired: fallbackRequestPlanGateActionQueue.length > 0,
      action_required: fallbackRequestPlanGateActionQueue.length > 0,
      actionCount: fallbackRequestPlanGateActionQueue.length,
      action_count: fallbackRequestPlanGateActionQueue.length,
      actionIds: [...fallbackRequestPlanGateActionIds],
      action_ids: [...fallbackRequestPlanGateActionIds],
      actionReasonIds: [...fallbackRequestPlanGateActionReasonIds],
      action_reason_ids: [...fallbackRequestPlanGateActionReasonIds],
      actionReadoutIds: [...fallbackRequestPlanGateActionReadoutIds],
      action_readout_ids: [...fallbackRequestPlanGateActionReadoutIds],
      actionSummary: fallbackRequestPlanGateActionSummary,
      action_summary: fallbackRequestPlanGateActionSummary,
      actionQueue: fallbackRequestPlanGateActionQueue,
      action_queue: fallbackRequestPlanGateActionQueue,
      actionQueueById: fallbackRequestPlanGateActionQueueById,
      action_queue_by_id: fallbackRequestPlanGateActionQueueById,
      actionQueueByReasonId: fallbackRequestPlanGateActionQueueByReasonId,
      action_queue_by_reason_id: fallbackRequestPlanGateActionQueueByReasonId,
      actionQueueByReadoutId: fallbackRequestPlanGateActionQueueByReadoutId,
      action_queue_by_readout_id: fallbackRequestPlanGateActionQueueByReadoutId,
      nextAction: fallbackRequestPlanGateActionQueue[0] ? { ...fallbackRequestPlanGateActionQueue[0] } : null,
      next_action: fallbackRequestPlanGateActionQueue[0] ? { ...fallbackRequestPlanGateActionQueue[0] } : null,
      nextActionId: fallbackRequestPlanGateActionQueue[0]?.id || null,
      next_action_id: fallbackRequestPlanGateActionQueue[0]?.id || null,
      nextActionReasonId: fallbackRequestPlanGateActionQueue[0]?.reasonId || null,
      next_action_reason_id: fallbackRequestPlanGateActionQueue[0]?.reasonId || null,
      nextActionReadoutIds: fallbackRequestPlanGateActionQueue[0]?.readoutIds ? [...fallbackRequestPlanGateActionQueue[0].readoutIds] : [],
      next_action_readout_ids: fallbackRequestPlanGateActionQueue[0]?.readoutIds ? [...fallbackRequestPlanGateActionQueue[0].readoutIds] : [],
      totalCount: Number.isFinite(Number(pendingReadoutRequestPlan?.totalCount)) ? Number(pendingReadoutRequestPlan.totalCount) : 0,
      total_count: Number.isFinite(Number(pendingReadoutRequestPlan?.totalCount)) ? Number(pendingReadoutRequestPlan.totalCount) : 0,
      mappedCount: Number.isFinite(Number(pendingReadoutRequestPlan?.mappedCount)) ? Number(pendingReadoutRequestPlan.mappedCount) : 0,
      mapped_count: Number.isFinite(Number(pendingReadoutRequestPlan?.mappedCount)) ? Number(pendingReadoutRequestPlan.mappedCount) : 0,
      unmappedCount: Number.isFinite(Number(pendingReadoutRequestPlan?.unmappedCount)) ? Number(pendingReadoutRequestPlan.unmappedCount) : 0,
      unmapped_count: Number.isFinite(Number(pendingReadoutRequestPlan?.unmappedCount)) ? Number(pendingReadoutRequestPlan.unmappedCount) : 0,
      safeForBridgePlanning: pendingReadoutRequestPlan?.safeForBridgePlanning === true,
      safe_for_bridge_planning: pendingReadoutRequestPlan?.safeForBridgePlanning === true,
      executionEnabled: false,
      execution_enabled: false,
      readOnly: true,
      read_only: true,
      wouldTransmit: false,
      would_transmit: false,
      vehicleCommandEnabled: false,
      vehicle_command_enabled: false
    };
    const readoutRequestPlanSummary = coreSessionStatus?.readoutRequestPlanSummary || coreSessionStatus?.readout_request_plan_summary || buildReadoutRequestPlanSummary(pendingReadoutRequestPlan, readoutRequestPlanGateSummary, nextReadoutRequest);
    return {
      schemaVersion: "diagnostic_flow_summary_v1",
      stage: coreSessionStatus?.stage || "diagnostic_core",
      status: readAliasValue(coreSessionStatus, "status") || readAliasValue(workflow, "status") || "not_started",
      currentStep: readAliasValue(workflow, "currentStep") || null,
      nextAction: readAliasValue(workflow, "nextAction") || null,
      nextReadoutId: readAliasValue(workflow, "nextReadoutId") || readAliasValue(readiness, "nextReadoutId") || readAliasValue(coreSessionStatus, "nextRecommendedReadoutId") || null,
      nextReadoutLabel: readAliasValue(workflow, "nextReadoutLabel") || readAliasValue(readiness, "nextReadoutLabel") || coreSessionStatus?.nextReadoutSummary?.label || coreSessionStatus?.next_readout_summary?.label || null,
      nextReadoutStatus: readAliasValue(workflow, "nextReadoutStatus") || readAliasValue(readiness, "nextReadoutStatus") || coreSessionStatus?.nextReadoutState?.status || coreSessionStatus?.next_readout_state?.status || null,
      nextReadoutSource: readAliasValue(workflow, "nextReadoutSource") || readAliasValue(readiness, "nextReadoutSource") || readAliasValue(coreSessionStatus, "nextReadoutSource") || null,
      nextReadoutQueuePosition: readAliasValue(workflow, "nextReadoutQueuePosition") || readAliasValue(readiness, "nextReadoutQueuePosition") || coreSessionStatus?.nextReadoutSummary?.queuePosition || coreSessionStatus?.next_readout_summary?.queue_position || null,
      nextReadoutRequest,
      nextReadoutBridgeIntent: nextReadoutRequest?.bridgeIntent || null,
      nextReadoutServiceMode: nextReadoutRequest?.serviceMode || null,
      nextReadoutExecutionEnabled: nextReadoutRequest?.executionEnabled === true,
      pendingReadoutRequestCount: pendingReadoutRequestQueue.length,
      pending_readout_request_count: pendingReadoutRequestQueue.length,
      pendingReadoutRequestQueue,
      pending_readout_request_queue: pendingReadoutRequestQueue,
      pendingReadoutRequestNext: pendingReadoutRequestQueue.find((item) => item.isNext) || pendingReadoutRequestQueue[0] || null,
      pending_readout_request_next: pendingReadoutRequestQueue.find((item) => item.isNext) || pendingReadoutRequestQueue[0] || null,
      pendingReadoutRequestPlan,
      pending_readout_request_plan: pendingReadoutRequestPlan,
      readoutRequestPlanGateSummary,
      readout_request_plan_gate_summary: readoutRequestPlanGateSummary,
      readoutRequestPlanSummary,
      readout_request_plan_summary: readoutRequestPlanSummary,
      requestPlanMappedCount: Number.isFinite(Number(pendingReadoutRequestPlan?.mappedCount)) ? Number(pendingReadoutRequestPlan.mappedCount) : 0,
      request_plan_mapped_count: Number.isFinite(Number(pendingReadoutRequestPlan?.mappedCount)) ? Number(pendingReadoutRequestPlan.mappedCount) : 0,
      requestPlanUnmappedCount: Number.isFinite(Number(pendingReadoutRequestPlan?.unmappedCount)) ? Number(pendingReadoutRequestPlan.unmappedCount) : 0,
      request_plan_unmapped_count: Number.isFinite(Number(pendingReadoutRequestPlan?.unmappedCount)) ? Number(pendingReadoutRequestPlan.unmappedCount) : 0,
      requestPlanMappedPercent: Number.isFinite(Number(pendingReadoutRequestPlan?.mappedPercent)) ? Number(pendingReadoutRequestPlan.mappedPercent) : 0,
      request_plan_mapped_percent: Number.isFinite(Number(pendingReadoutRequestPlan?.mappedPercent)) ? Number(pendingReadoutRequestPlan.mappedPercent) : 0,
      requestPlanHasUnmappedRequests: pendingReadoutRequestPlan?.hasUnmappedRequests === true,
      request_plan_has_unmapped_requests: pendingReadoutRequestPlan?.hasUnmappedRequests === true,
      requestPlanMappingStatus: pendingReadoutRequestPlan?.mappingStatus || "unknown",
      request_plan_mapping_status: pendingReadoutRequestPlan?.mappingStatus || "unknown",
      requestPlanAllReadOnly: pendingReadoutRequestPlan?.allReadOnly === true,
      request_plan_all_read_only: pendingReadoutRequestPlan?.allReadOnly === true,
      requestPlanAllNonTransmitting: pendingReadoutRequestPlan?.allNonTransmitting === true,
      request_plan_all_non_transmitting: pendingReadoutRequestPlan?.allNonTransmitting === true,
      requestPlanSafeForBridgePlanning: pendingReadoutRequestPlan?.safeForBridgePlanning === true,
      request_plan_safe_for_bridge_planning: pendingReadoutRequestPlan?.safeForBridgePlanning === true,
      requestPlanBlockedReasonIds: Array.isArray(pendingReadoutRequestPlan?.blockedReasonIds) ? [...pendingReadoutRequestPlan.blockedReasonIds] : [],
      request_plan_blocked_reason_ids: Array.isArray(pendingReadoutRequestPlan?.blockedReasonIds) ? [...pendingReadoutRequestPlan.blockedReasonIds] : [],
      requestPlanBlockedReasonById: pendingReadoutRequestPlan?.blockedReasonById && typeof pendingReadoutRequestPlan.blockedReasonById === "object" ? { ...pendingReadoutRequestPlan.blockedReasonById } : {},
      request_plan_blocked_reason_by_id: pendingReadoutRequestPlan?.blockedReasonById && typeof pendingReadoutRequestPlan.blockedReasonById === "object" ? { ...pendingReadoutRequestPlan.blockedReasonById } : {},
      requestPlanGateState: readAliasValue(readoutRequestPlanGateSummary, "state") || "unknown",
      request_plan_gate_state: readAliasValue(readoutRequestPlanGateSummary, "state") || "unknown",
      requestPlanGateReady: readAliasValue(readoutRequestPlanGateSummary, "ready") === true,
      request_plan_gate_ready: readAliasValue(readoutRequestPlanGateSummary, "ready") === true,
      requestPlanGateBlocked: readAliasValue(readoutRequestPlanGateSummary, "blocked") === true,
      request_plan_gate_blocked: readAliasValue(readoutRequestPlanGateSummary, "blocked") === true,
      requestPlanGateBlockedReasonCount: Number.isFinite(Number(readAliasValue(readoutRequestPlanGateSummary, "blockedReasonCount"))) ? Number(readAliasValue(readoutRequestPlanGateSummary, "blockedReasonCount")) : 0,
      request_plan_gate_blocked_reason_count: Number.isFinite(Number(readAliasValue(readoutRequestPlanGateSummary, "blockedReasonCount"))) ? Number(readAliasValue(readoutRequestPlanGateSummary, "blockedReasonCount")) : 0,
      requestPlanNextBlockedReasonId: readAliasValue(readoutRequestPlanGateSummary, "nextBlockedReasonId") || null,
      request_plan_next_blocked_reason_id: readAliasValue(readoutRequestPlanGateSummary, "nextBlockedReasonId") || null,
      requestPlanGateActionRequired: readAliasValue(readoutRequestPlanGateSummary, "actionRequired") === true,
      request_plan_gate_action_required: readAliasValue(readoutRequestPlanGateSummary, "actionRequired") === true,
      requestPlanGateActionCount: Number.isFinite(Number(readAliasValue(readoutRequestPlanGateSummary, "actionCount"))) ? Number(readAliasValue(readoutRequestPlanGateSummary, "actionCount")) : 0,
      request_plan_gate_action_count: Number.isFinite(Number(readAliasValue(readoutRequestPlanGateSummary, "actionCount"))) ? Number(readAliasValue(readoutRequestPlanGateSummary, "actionCount")) : 0,
      requestPlanGateActionIds: readAliasList(readoutRequestPlanGateSummary, "actionIds"),
      request_plan_gate_action_ids: readAliasList(readoutRequestPlanGateSummary, "actionIds"),
      requestPlanGateActionReasonIds: readAliasList(readoutRequestPlanGateSummary, "actionReasonIds"),
      request_plan_gate_action_reason_ids: readAliasList(readoutRequestPlanGateSummary, "actionReasonIds"),
      requestPlanGateActionReadoutIds: readAliasList(readoutRequestPlanGateSummary, "actionReadoutIds"),
      request_plan_gate_action_readout_ids: readAliasList(readoutRequestPlanGateSummary, "actionReadoutIds"),
      requestPlanGateActionSummary: readAliasValue(readoutRequestPlanGateSummary, "actionSummary") && typeof readAliasValue(readoutRequestPlanGateSummary, "actionSummary") === "object" ? { ...readAliasValue(readoutRequestPlanGateSummary, "actionSummary") } : null,
      request_plan_gate_action_summary: readAliasValue(readoutRequestPlanGateSummary, "actionSummary") && typeof readAliasValue(readoutRequestPlanGateSummary, "actionSummary") === "object" ? { ...readAliasValue(readoutRequestPlanGateSummary, "actionSummary") } : null,
      requestPlanGateNextAction: readAliasValue(readoutRequestPlanGateSummary, "nextAction") && typeof readAliasValue(readoutRequestPlanGateSummary, "nextAction") === "object" ? { ...readAliasValue(readoutRequestPlanGateSummary, "nextAction") } : null,
      request_plan_gate_next_action: readAliasValue(readoutRequestPlanGateSummary, "nextAction") && typeof readAliasValue(readoutRequestPlanGateSummary, "nextAction") === "object" ? { ...readAliasValue(readoutRequestPlanGateSummary, "nextAction") } : null,
      requestPlanGateNextActionId: readAliasValue(readoutRequestPlanGateSummary, "nextActionId") || null,
      request_plan_gate_next_action_id: readAliasValue(readoutRequestPlanGateSummary, "nextActionId") || null,
      requestPlanGateNextActionReasonId: readAliasValue(readoutRequestPlanGateSummary, "nextActionReasonId") || null,
      request_plan_gate_next_action_reason_id: readAliasValue(readoutRequestPlanGateSummary, "nextActionReasonId") || null,
      requestPlanGateNextActionReadoutIds: readAliasList(readoutRequestPlanGateSummary, "nextActionReadoutIds"),
      request_plan_gate_next_action_readout_ids: readAliasList(readoutRequestPlanGateSummary, "nextActionReadoutIds"),
      requestPlanGateActionQueue: Array.isArray(readAliasValue(readoutRequestPlanGateSummary, "actionQueue")) ? readAliasValue(readoutRequestPlanGateSummary, "actionQueue").map((item) => ({ ...item })) : [],
      request_plan_gate_action_queue: Array.isArray(readAliasValue(readoutRequestPlanGateSummary, "actionQueue")) ? readAliasValue(readoutRequestPlanGateSummary, "actionQueue").map((item) => ({ ...item })) : [],
      requestPlanGateActionByReasonId: readAliasValue(readoutRequestPlanGateSummary, "actionQueueByReasonId") && typeof readAliasValue(readoutRequestPlanGateSummary, "actionQueueByReasonId") === "object" ? { ...readAliasValue(readoutRequestPlanGateSummary, "actionQueueByReasonId") } : {},
      request_plan_gate_action_by_reason_id: readAliasValue(readoutRequestPlanGateSummary, "actionQueueByReasonId") && typeof readAliasValue(readoutRequestPlanGateSummary, "actionQueueByReasonId") === "object" ? { ...readAliasValue(readoutRequestPlanGateSummary, "actionQueueByReasonId") } : {},
      requestPlanGateActionByReadoutId: readAliasValue(readoutRequestPlanGateSummary, "actionQueueByReadoutId") && typeof readAliasValue(readoutRequestPlanGateSummary, "actionQueueByReadoutId") === "object" ? { ...readAliasValue(readoutRequestPlanGateSummary, "actionQueueByReadoutId") } : {},
      request_plan_gate_action_by_readout_id: readAliasValue(readoutRequestPlanGateSummary, "actionQueueByReadoutId") && typeof readAliasValue(readoutRequestPlanGateSummary, "actionQueueByReadoutId") === "object" ? { ...readAliasValue(readoutRequestPlanGateSummary, "actionQueueByReadoutId") } : {},
      analysisChecklist: diagnosticChecklist,
      analysisChecklistById: diagnosticChecklistById,
      analysisChecklistSummary: checklistSummary && typeof checklistSummary === "object" ? { ...checklistSummary } : {},
      requiredReadoutsChecklist: diagnosticChecklistById.required_readouts || null,
      blockingWarningsChecklist: diagnosticChecklistById.blocking_warnings || null,
      readoutQualityChecklist,
      readoutQualitySummary: readoutQualitySummary && typeof readoutQualitySummary === "object" ? { ...readoutQualitySummary } : {},
      readoutQualityReviewRequired: pickDefined(readoutQualitySummary?.reviewRequired, readoutQualitySummary?.review_required) === true || readoutQualityChecklist?.state === "review",
      readoutQualityIssueCount: Number.isFinite(Number(readAliasValue(readoutQualitySummary, "issueCount"))) ? Number(readAliasValue(readoutQualitySummary, "issueCount")) : 0,
      readoutQualityIssueIds: readAliasList(readoutQualitySummary, "issueIds"),
      rawPidUndecodedCount: Number.isFinite(Number(readAliasValue(readoutQualitySummary, "rawPidUndecodedCount"))) ? Number(readAliasValue(readoutQualitySummary, "rawPidUndecodedCount")) : 0,
      readinessIncompleteCount: Number.isFinite(Number(readAliasValue(readoutQualitySummary, "readinessIncompleteCount"))) ? Number(readAliasValue(readoutQualitySummary, "readinessIncompleteCount")) : 0,
      ecuInfoMissingKeyCount: Number.isFinite(Number(readAliasValue(readoutQualitySummary, "ecuInfoMissingKeyCount"))) ? Number(readAliasValue(readoutQualitySummary, "ecuInfoMissingKeyCount")) : 0,
      onboardMonitorFailedCount: Number.isFinite(Number(readAliasValue(readoutQualitySummary, "onboardMonitorFailedCount"))) ? Number(readAliasValue(readoutQualitySummary, "onboardMonitorFailedCount")) : 0,
      vehicleApplicabilityChecklist: diagnosticChecklistById.vehicle_applicability || null,
      pendingQueueNextReadoutId: readAliasValue(queueSummary, "nextReadoutId") || readAliasValue(coreSessionStatus, "nextPendingReadoutId") || null,
      pendingQueueNextReadoutStatus: readAliasValue(queueSummary, "nextReadoutStatus") || coreSessionStatus?.nextPendingReadoutState?.status || coreSessionStatus?.next_pending_readout_state?.status || null,
      recommendedReadoutId: readAliasValue(queueSummary, "recommendedReadoutId") || readAliasValue(coreSessionStatus, "nextRecommendedReadoutId") || null,
      recommendedReadoutStatus: readAliasValue(queueSummary, "recommendedReadoutStatus") || coreSessionStatus?.nextReadoutSummary?.status || coreSessionStatus?.next_readout_summary?.status || null,
      recommendedReadoutSource: readAliasValue(queueSummary, "recommendedReadoutSource") || readAliasValue(coreSessionStatus, "nextReadoutSource") || null,
      recommendedReadoutQueuePosition: readAliasValue(queueSummary, "recommendedReadoutQueuePosition") || coreSessionStatus?.nextReadoutSummary?.queuePosition || coreSessionStatus?.next_readout_summary?.queue_position || null,
      recommendedReadoutIsPending: readAliasValue(queueSummary, "recommendedReadoutIsPending") === true,
      readyForAnalysis,
      canStartAnalysis: readyForAnalysis,
      analysisBlocked: !readyForAnalysis,
      applicabilityStatus,
      vehicleApplicabilityReviewRequired,
      vehicleApplicabilityBlocking,
      blockingReasonIds,
      primaryBlockingReasonId,
      primaryBlockingReason,
      primaryBlockingReadoutId,
      primaryBlockingReadoutLabel,
      primaryBlockingReadoutRequest,
      primaryBlockingSummary,
      primaryBlockingReadoutBridgeIntent: primaryBlockingReadoutRequest?.bridgeIntent || null,
      primaryBlockingReadoutServiceMode: primaryBlockingReadoutRequest?.serviceMode || null,
      primaryBlockingReadoutExecutionEnabled: primaryBlockingReadoutRequest?.executionEnabled === true,
      primaryBlockingReadoutWouldTransmit: primaryBlockingReadoutRequest?.wouldTransmit === true,
      readoutCollectionRequired: pendingReadoutCount > 0,
      completionPercent: Number.isFinite(Number(pickDefined(coreSessionStatus?.completionPercent, coreSessionStatus?.completion_percent)))
        ? Number(pickDefined(coreSessionStatus.completionPercent, coreSessionStatus.completion_percent))
        : Number(readAliasValue(progress, "completionPercent")) || 0,
      requiredReadoutCount: readCount("requiredCount", coreSessionStatus?.requiredReadoutIds || coreSessionStatus?.required_readout_ids),
      capturedReadoutCount: readCount("capturedCount", coreSessionStatus?.capturedReadoutIds || coreSessionStatus?.captured_readout_ids),
      missingReadoutCount: readCount("missingCount", coreSessionStatus?.missingReadoutIds || coreSessionStatus?.missing_readout_ids || coreSessionStatus?.remainingReadoutIds || coreSessionStatus?.remaining_readout_ids),
      emptyReadoutCount: readCount("emptyCount", coreSessionStatus?.emptyReadoutIds || coreSessionStatus?.empty_readout_ids),
      pendingReadoutCount,
      checklistTotalCount: readChecklistCount("totalCount"),
      checklistCompleteCount: readChecklistCount("completeCount"),
      checklistBlockingCount: readChecklistCount("blockingCount", checklistBlockedIds),
      checklistReviewCount: readChecklistCount("reviewCount", checklistReviewIds),
      checklistPendingCount: readChecklistCount("pendingCount"),
      checklistBlockedIds,
      checklistReviewIds,
      blockerCount: Number.isFinite(Number(readAliasValue(readiness, "blockerCount")))
        ? Number(readAliasValue(readiness, "blockerCount"))
        : Array.isArray(coreSessionStatus?.analysisBlockers) ? coreSessionStatus.analysisBlockers.length : 0
    };
  }

  function buildImportedCoreComparisonSummary(importedCoreSessionStatus = null, currentCoreSessionStatus = {}) {
    if (!importedCoreSessionStatus || typeof importedCoreSessionStatus !== "object") return null;
    const importedFlow = buildDiagnosticFlowSummary(importedCoreSessionStatus);
    const currentFlow = buildDiagnosticFlowSummary(currentCoreSessionStatus || {});
    const importedPendingCount = Array.isArray(importedCoreSessionStatus.pendingReadoutIds)
      ? importedCoreSessionStatus.pendingReadoutIds.length
      : importedFlow.pendingReadoutCount;
    const currentPendingCount = Array.isArray(currentCoreSessionStatus?.pendingReadoutIds)
      ? currentCoreSessionStatus.pendingReadoutIds.length
      : currentFlow.pendingReadoutCount;
    const toSnakeField = (field) => String(field || "").replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
    const readAliasValue = (summary, field) => summary && typeof summary === "object" ? pickDefined(summary[field], summary[toSnakeField(field)]) : undefined;
    const readFlowCount = (summary, field) => Number.isFinite(Number(readAliasValue(summary, field))) ? Number(readAliasValue(summary, field)) : 0;
    const importedRequiredCount = Number.isFinite(Number(importedFlow.requiredReadoutCount)) ? Number(importedFlow.requiredReadoutCount) : 0;
    const currentRequiredCount = Number.isFinite(Number(currentFlow.requiredReadoutCount)) ? Number(currentFlow.requiredReadoutCount) : 0;
    const importedCapturedCount = Number.isFinite(Number(importedFlow.capturedReadoutCount)) ? Number(importedFlow.capturedReadoutCount) : 0;
    const currentCapturedCount = Number.isFinite(Number(currentFlow.capturedReadoutCount)) ? Number(currentFlow.capturedReadoutCount) : 0;
    const importedMissingCount = Number.isFinite(Number(importedFlow.missingReadoutCount)) ? Number(importedFlow.missingReadoutCount) : 0;
    const currentMissingCount = Number.isFinite(Number(currentFlow.missingReadoutCount)) ? Number(currentFlow.missingReadoutCount) : 0;
    const importedEmptyCount = Number.isFinite(Number(importedFlow.emptyReadoutCount)) ? Number(importedFlow.emptyReadoutCount) : 0;
    const currentEmptyCount = Number.isFinite(Number(currentFlow.emptyReadoutCount)) ? Number(currentFlow.emptyReadoutCount) : 0;
    const importedBlockerCount = Number.isFinite(Number(importedFlow.blockerCount)) ? Number(importedFlow.blockerCount) : 0;
    const currentBlockerCount = Number.isFinite(Number(currentFlow.blockerCount)) ? Number(currentFlow.blockerCount) : 0;
    const importedChecklistCompleteCount = readFlowCount(importedFlow, "checklistCompleteCount");
    const currentChecklistCompleteCount = readFlowCount(currentFlow, "checklistCompleteCount");
    const importedChecklistBlockingCount = readFlowCount(importedFlow, "checklistBlockingCount");
    const currentChecklistBlockingCount = readFlowCount(currentFlow, "checklistBlockingCount");
    const importedChecklistPendingCount = readFlowCount(importedFlow, "checklistPendingCount");
    const currentChecklistPendingCount = readFlowCount(currentFlow, "checklistPendingCount");
    const readStringList = (summary = {}, field) => (Array.isArray(readAliasValue(summary, field)) ? readAliasValue(summary, field).filter(Boolean).map(String).sort() : []);
    const importedChecklistBlockedIds = readStringList(importedFlow, "checklistBlockedIds");
    const currentChecklistBlockedIds = readStringList(currentFlow, "checklistBlockedIds");
    const importedChecklistReviewIds = readStringList(importedFlow, "checklistReviewIds");
    const currentChecklistReviewIds = readStringList(currentFlow, "checklistReviewIds");
    const diffIds = (left = [], right = []) => left.filter((id) => !right.includes(id));
    const importedVehicleApplicabilityChecklistState = importedFlow.vehicleApplicabilityChecklist?.state || null;
    const currentVehicleApplicabilityChecklistState = currentFlow.vehicleApplicabilityChecklist?.state || null;
    const readRequestPlan = (flow = {}) => {
      const plan = flow.pendingReadoutRequestPlan || flow.pending_readout_request_plan;
      return plan && typeof plan === "object" ? plan : {};
    };
    const readRequestPlanSummary = (flow = {}) => {
      const summary = flow.readoutRequestPlanSummary || flow.readout_request_plan_summary;
      return summary && typeof summary === "object" ? summary : {};
    };
    const importedRequestPlan = readRequestPlan(importedFlow);
    const currentRequestPlan = readRequestPlan(currentFlow);
    const importedRequestPlanSummary = readRequestPlanSummary(importedFlow);
    const currentRequestPlanSummary = readRequestPlanSummary(currentFlow);
    const importedRequestPlanCount = readFlowCount(importedRequestPlan, "totalCount");
    const currentRequestPlanCount = readFlowCount(currentRequestPlan, "totalCount");
    const importedRequestPlanMappedCount = readFlowCount(importedRequestPlan, "mappedCount");
    const currentRequestPlanMappedCount = readFlowCount(currentRequestPlan, "mappedCount");
    const importedRequestPlanUnmappedCount = readFlowCount(importedRequestPlan, "unmappedCount");
    const currentRequestPlanUnmappedCount = readFlowCount(currentRequestPlan, "unmappedCount");
    const readSortedStringList = (value) => (Array.isArray(value) ? value.filter(Boolean).map(String).sort() : []);
    const importedRequestPlanIds = readSortedStringList(pickDefined(importedRequestPlan.requestIds, importedRequestPlan.request_ids));
    const currentRequestPlanIds = readSortedStringList(pickDefined(currentRequestPlan.requestIds, currentRequestPlan.request_ids));
    const importedRequestPlanIntents = readSortedStringList(pickDefined(importedRequestPlan.bridgeIntents, importedRequestPlan.bridge_intents));
    const currentRequestPlanIntents = readSortedStringList(pickDefined(currentRequestPlan.bridgeIntents, currentRequestPlan.bridge_intents));
    const toSingletonIdList = (value) => value ? [String(value)] : [];
    const importedRequestPlanNextRequestIds = toSingletonIdList(pickDefined(importedRequestPlanSummary.nextRequestId, importedRequestPlanSummary.next_request_id));
    const currentRequestPlanNextRequestIds = toSingletonIdList(pickDefined(currentRequestPlanSummary.nextRequestId, currentRequestPlanSummary.next_request_id));
    const importedRequestPlanNextBridgeIntents = toSingletonIdList(pickDefined(importedRequestPlanSummary.nextBridgeIntent, importedRequestPlanSummary.next_bridge_intent));
    const currentRequestPlanNextBridgeIntents = toSingletonIdList(pickDefined(currentRequestPlanSummary.nextBridgeIntent, currentRequestPlanSummary.next_bridge_intent));
    const readPrimaryBlocker = (flow = {}) => {
      const blocker = flow.primaryBlockingSummary || flow.primary_blocking_summary;
      return blocker && typeof blocker === "object" ? blocker : {};
    };
    const importedPrimaryBlocker = readPrimaryBlocker(importedFlow);
    const currentPrimaryBlocker = readPrimaryBlocker(currentFlow);
    const importedPrimaryBlockingReasonId = pickDefined(importedPrimaryBlocker.reasonId, importedPrimaryBlocker.reason_id, importedFlow.primaryBlockingReasonId, importedFlow.primary_blocking_reason_id, null);
    const currentPrimaryBlockingReasonId = pickDefined(currentPrimaryBlocker.reasonId, currentPrimaryBlocker.reason_id, currentFlow.primaryBlockingReasonId, currentFlow.primary_blocking_reason_id, null);
    const importedPrimaryBlockingReadoutId = pickDefined(importedPrimaryBlocker.readoutId, importedPrimaryBlocker.readout_id, importedFlow.primaryBlockingReadoutId, importedFlow.primary_blocking_readout_id, null);
    const currentPrimaryBlockingReadoutId = pickDefined(currentPrimaryBlocker.readoutId, currentPrimaryBlocker.readout_id, currentFlow.primaryBlockingReadoutId, currentFlow.primary_blocking_readout_id, null);
    const importedPrimaryBlockingBridgeIntent = pickDefined(importedPrimaryBlocker.bridgeIntent, importedPrimaryBlocker.bridge_intent, importedFlow.primaryBlockingReadoutBridgeIntent, importedFlow.primary_blocking_readout_bridge_intent, null);
    const currentPrimaryBlockingBridgeIntent = pickDefined(currentPrimaryBlocker.bridgeIntent, currentPrimaryBlocker.bridge_intent, currentFlow.primaryBlockingReadoutBridgeIntent, currentFlow.primary_blocking_readout_bridge_intent, null);
    const importedPrimaryBlockingReasonIds = toSingletonIdList(importedPrimaryBlockingReasonId);
    const currentPrimaryBlockingReasonIds = toSingletonIdList(currentPrimaryBlockingReasonId);
    const importedPrimaryBlockingReadoutIds = toSingletonIdList(importedPrimaryBlockingReadoutId);
    const currentPrimaryBlockingReadoutIds = toSingletonIdList(currentPrimaryBlockingReadoutId);
    const importedPrimaryBlockingBridgeIntents = toSingletonIdList(importedPrimaryBlockingBridgeIntent);
    const currentPrimaryBlockingBridgeIntents = toSingletonIdList(currentPrimaryBlockingBridgeIntent);
    const importedStatus = readAliasValue(importedFlow, "status") || null;
    const currentStatus = readAliasValue(currentFlow, "status") || null;
    const importedCompletionPercent = Number.isFinite(Number(readAliasValue(importedFlow, "completionPercent"))) ? Number(readAliasValue(importedFlow, "completionPercent")) : 0;
    const currentCompletionPercent = Number.isFinite(Number(readAliasValue(currentFlow, "completionPercent"))) ? Number(readAliasValue(currentFlow, "completionPercent")) : 0;
    const importedReadyForAnalysis = readAliasValue(importedFlow, "readyForAnalysis") === true;
    const currentReadyForAnalysis = readAliasValue(currentFlow, "readyForAnalysis") === true;
    const importedNextReadoutId = readAliasValue(importedFlow, "nextReadoutId") || null;
    const currentNextReadoutId = readAliasValue(currentFlow, "nextReadoutId") || null;
    const importedNextReadoutLabel = readAliasValue(importedFlow, "nextReadoutLabel") || null;
    const currentNextReadoutLabel = readAliasValue(currentFlow, "nextReadoutLabel") || null;
    const importedNextReadoutSource = readAliasValue(importedFlow, "nextReadoutSource") || null;
    const currentNextReadoutSource = readAliasValue(currentFlow, "nextReadoutSource") || null;
    const importedNextReadoutQueuePosition = readAliasValue(importedFlow, "nextReadoutQueuePosition") || null;
    const currentNextReadoutQueuePosition = readAliasValue(currentFlow, "nextReadoutQueuePosition") || null;
    const importedPendingQueueNextReadoutId = readAliasValue(importedFlow, "pendingQueueNextReadoutId") || null;
    const currentPendingQueueNextReadoutId = readAliasValue(currentFlow, "pendingQueueNextReadoutId") || null;
    const importedRecommendedReadoutId = readAliasValue(importedFlow, "recommendedReadoutId") || null;
    const currentRecommendedReadoutId = readAliasValue(currentFlow, "recommendedReadoutId") || null;
    const importedRecommendedReadoutSource = readAliasValue(importedFlow, "recommendedReadoutSource") || null;
    const currentRecommendedReadoutSource = readAliasValue(currentFlow, "recommendedReadoutSource") || null;
    const importedRecommendedReadoutQueuePosition = readAliasValue(importedFlow, "recommendedReadoutQueuePosition") || null;
    const currentRecommendedReadoutQueuePosition = readAliasValue(currentFlow, "recommendedReadoutQueuePosition") || null;
    return {
      schemaVersion: "imported_core_comparison_v1",
      importedStatus,
      currentStatus,
      statusChanged: importedStatus !== currentStatus,
      importedCompletionPercent,
      currentCompletionPercent,
      completionDelta: currentCompletionPercent - importedCompletionPercent,
      importedReadyForAnalysis,
      currentReadyForAnalysis,
      readyForAnalysisChanged: importedReadyForAnalysis !== currentReadyForAnalysis,
      importedNextReadoutId,
      currentNextReadoutId,
      nextReadoutChanged: importedNextReadoutId !== currentNextReadoutId,
      importedNextReadoutLabel,
      currentNextReadoutLabel,
      importedNextReadoutSource,
      currentNextReadoutSource,
      importedNextReadoutQueuePosition,
      currentNextReadoutQueuePosition,
      nextReadoutDetailsChanged: importedNextReadoutLabel !== currentNextReadoutLabel
        || importedNextReadoutSource !== currentNextReadoutSource
        || importedNextReadoutQueuePosition !== currentNextReadoutQueuePosition,
      importedPendingQueueNextReadoutId,
      currentPendingQueueNextReadoutId,
      pendingQueueNextReadoutChanged: importedPendingQueueNextReadoutId !== currentPendingQueueNextReadoutId,
      importedRecommendedReadoutId,
      currentRecommendedReadoutId,
      recommendedReadoutChanged: importedRecommendedReadoutId !== currentRecommendedReadoutId,
      importedRecommendedReadoutSource,
      currentRecommendedReadoutSource,
      importedRecommendedReadoutQueuePosition,
      currentRecommendedReadoutQueuePosition,
      recommendedReadoutDetailsChanged: importedRecommendedReadoutSource !== currentRecommendedReadoutSource
        || importedRecommendedReadoutQueuePosition !== currentRecommendedReadoutQueuePosition,
      importedRequiredReadoutCount: importedRequiredCount,
      currentRequiredReadoutCount: currentRequiredCount,
      requiredReadoutDelta: currentRequiredCount - importedRequiredCount,
      importedCapturedReadoutCount: importedCapturedCount,
      currentCapturedReadoutCount: currentCapturedCount,
      capturedReadoutDelta: currentCapturedCount - importedCapturedCount,
      importedMissingReadoutCount: importedMissingCount,
      currentMissingReadoutCount: currentMissingCount,
      missingReadoutDelta: currentMissingCount - importedMissingCount,
      importedEmptyReadoutCount: importedEmptyCount,
      currentEmptyReadoutCount: currentEmptyCount,
      emptyReadoutDelta: currentEmptyCount - importedEmptyCount,
      importedBlockerCount,
      currentBlockerCount,
      blockerCountDelta: currentBlockerCount - importedBlockerCount,
      importedPrimaryBlockingReasonId,
      currentPrimaryBlockingReasonId,
      primaryBlockingReasonChanged: importedPrimaryBlockingReasonId !== currentPrimaryBlockingReasonId,
      primaryBlockingReasonAddedIds: diffIds(currentPrimaryBlockingReasonIds, importedPrimaryBlockingReasonIds),
      primaryBlockingReasonRemovedIds: diffIds(importedPrimaryBlockingReasonIds, currentPrimaryBlockingReasonIds),
      importedPrimaryBlockingReadoutId,
      currentPrimaryBlockingReadoutId,
      primaryBlockingReadoutChanged: importedPrimaryBlockingReadoutId !== currentPrimaryBlockingReadoutId,
      primaryBlockingReadoutAddedIds: diffIds(currentPrimaryBlockingReadoutIds, importedPrimaryBlockingReadoutIds),
      primaryBlockingReadoutRemovedIds: diffIds(importedPrimaryBlockingReadoutIds, currentPrimaryBlockingReadoutIds),
      importedPrimaryBlockingBridgeIntent,
      currentPrimaryBlockingBridgeIntent,
      primaryBlockingBridgeIntentChanged: importedPrimaryBlockingBridgeIntent !== currentPrimaryBlockingBridgeIntent,
      primaryBlockingBridgeIntentAddedIds: diffIds(currentPrimaryBlockingBridgeIntents, importedPrimaryBlockingBridgeIntents),
      primaryBlockingBridgeIntentRemovedIds: diffIds(importedPrimaryBlockingBridgeIntents, currentPrimaryBlockingBridgeIntents),
      primaryBlockingChanged: importedPrimaryBlockingReasonId !== currentPrimaryBlockingReasonId
        || importedPrimaryBlockingReadoutId !== currentPrimaryBlockingReadoutId
        || importedPrimaryBlockingBridgeIntent !== currentPrimaryBlockingBridgeIntent,
      importedChecklistCompleteCount,
      currentChecklistCompleteCount,
      checklistCompleteDelta: currentChecklistCompleteCount - importedChecklistCompleteCount,
      importedChecklistBlockingCount,
      currentChecklistBlockingCount,
      checklistBlockingDelta: currentChecklistBlockingCount - importedChecklistBlockingCount,
      importedChecklistPendingCount,
      currentChecklistPendingCount,
      checklistPendingDelta: currentChecklistPendingCount - importedChecklistPendingCount,
      importedChecklistBlockedIds: [...importedChecklistBlockedIds],
      currentChecklistBlockedIds: [...currentChecklistBlockedIds],
      checklistBlockedIdsChanged: importedChecklistBlockedIds.join("|") !== currentChecklistBlockedIds.join("|"),
      checklistBlockedAddedIds: diffIds(currentChecklistBlockedIds, importedChecklistBlockedIds),
      checklistBlockedRemovedIds: diffIds(importedChecklistBlockedIds, currentChecklistBlockedIds),
      importedChecklistReviewIds: [...importedChecklistReviewIds],
      currentChecklistReviewIds: [...currentChecklistReviewIds],
      checklistReviewIdsChanged: importedChecklistReviewIds.join("|") !== currentChecklistReviewIds.join("|"),
      checklistReviewAddedIds: diffIds(currentChecklistReviewIds, importedChecklistReviewIds),
      checklistReviewRemovedIds: diffIds(importedChecklistReviewIds, currentChecklistReviewIds),
      importedVehicleApplicabilityChecklistState,
      currentVehicleApplicabilityChecklistState,
      vehicleApplicabilityChecklistChanged: importedVehicleApplicabilityChecklistState !== currentVehicleApplicabilityChecklistState,
      importedRequestPlanCount,
      currentRequestPlanCount,
      requestPlanCountDelta: currentRequestPlanCount - importedRequestPlanCount,
      importedRequestPlanMappedCount,
      currentRequestPlanMappedCount,
      requestPlanMappedDelta: currentRequestPlanMappedCount - importedRequestPlanMappedCount,
      importedRequestPlanUnmappedCount,
      currentRequestPlanUnmappedCount,
      requestPlanUnmappedDelta: currentRequestPlanUnmappedCount - importedRequestPlanUnmappedCount,
      requestPlanMappingChanged: importedRequestPlanMappedCount !== currentRequestPlanMappedCount
        || importedRequestPlanUnmappedCount !== currentRequestPlanUnmappedCount,
      importedRequestPlanBridgeIntents: [...importedRequestPlanIntents],
      currentRequestPlanBridgeIntents: [...currentRequestPlanIntents],
      requestPlanBridgeIntentsChanged: importedRequestPlanIntents.join("|") !== currentRequestPlanIntents.join("|"),
      importedRequestPlanIds: [...importedRequestPlanIds],
      currentRequestPlanIds: [...currentRequestPlanIds],
      requestPlanIdsChanged: importedRequestPlanIds.join("|") !== currentRequestPlanIds.join("|"),
      requestPlanAddedIds: diffIds(currentRequestPlanIds, importedRequestPlanIds),
      requestPlanRemovedIds: diffIds(importedRequestPlanIds, currentRequestPlanIds),
      requestPlanBridgeIntentAddedIds: diffIds(currentRequestPlanIntents, importedRequestPlanIntents),
      requestPlanBridgeIntentRemovedIds: diffIds(importedRequestPlanIntents, currentRequestPlanIntents),
      importedRequestPlanState: importedRequestPlanSummary.state || null,
      currentRequestPlanState: currentRequestPlanSummary.state || null,
      requestPlanStateChanged: (importedRequestPlanSummary.state || null) !== (currentRequestPlanSummary.state || null),
      importedRequestPlanNextRequestId: pickDefined(importedRequestPlanSummary.nextRequestId, importedRequestPlanSummary.next_request_id, null),
      currentRequestPlanNextRequestId: pickDefined(currentRequestPlanSummary.nextRequestId, currentRequestPlanSummary.next_request_id, null),
      requestPlanNextRequestChanged: pickDefined(importedRequestPlanSummary.nextRequestId, importedRequestPlanSummary.next_request_id, null) !== pickDefined(currentRequestPlanSummary.nextRequestId, currentRequestPlanSummary.next_request_id, null),
      requestPlanNextRequestAddedIds: diffIds(currentRequestPlanNextRequestIds, importedRequestPlanNextRequestIds),
      requestPlanNextRequestRemovedIds: diffIds(importedRequestPlanNextRequestIds, currentRequestPlanNextRequestIds),
      importedRequestPlanNextBridgeIntent: pickDefined(importedRequestPlanSummary.nextBridgeIntent, importedRequestPlanSummary.next_bridge_intent, null),
      currentRequestPlanNextBridgeIntent: pickDefined(currentRequestPlanSummary.nextBridgeIntent, currentRequestPlanSummary.next_bridge_intent, null),
      requestPlanNextBridgeIntentChanged: pickDefined(importedRequestPlanSummary.nextBridgeIntent, importedRequestPlanSummary.next_bridge_intent, null) !== pickDefined(currentRequestPlanSummary.nextBridgeIntent, currentRequestPlanSummary.next_bridge_intent, null),
      requestPlanNextBridgeIntentAddedIds: diffIds(currentRequestPlanNextBridgeIntents, importedRequestPlanNextBridgeIntents),
      requestPlanNextBridgeIntentRemovedIds: diffIds(importedRequestPlanNextBridgeIntents, currentRequestPlanNextBridgeIntents),
      importedPendingReadoutCount: importedPendingCount,
      currentPendingReadoutCount: currentPendingCount,
      pendingReadoutDelta: currentPendingCount - importedPendingCount
    };
  }

  function buildImportedDiagnosticFlowComparisonSummary(importedDiagnosticFlowSummary = null, currentDiagnosticFlowSummary = {}) {
    if (!importedDiagnosticFlowSummary || typeof importedDiagnosticFlowSummary !== "object") return null;
    const currentFlow = currentDiagnosticFlowSummary && typeof currentDiagnosticFlowSummary === "object"
      ? currentDiagnosticFlowSummary
      : {};
    const toSnakeField = (field) => String(field || "").replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
    const readAliasValue = (summary, field) => summary && typeof summary === "object" ? pickDefined(summary[field], summary[toSnakeField(field)]) : undefined;
    const importedCompletion = Number.isFinite(Number(readAliasValue(importedDiagnosticFlowSummary, "completionPercent")))
      ? Number(readAliasValue(importedDiagnosticFlowSummary, "completionPercent"))
      : 0;
    const currentCompletion = Number.isFinite(Number(readAliasValue(currentFlow, "completionPercent")))
      ? Number(readAliasValue(currentFlow, "completionPercent"))
      : 0;
    const readFlowCount = (summary, field) => Number.isFinite(Number(readAliasValue(summary, field))) ? Number(readAliasValue(summary, field)) : 0;
    const importedRequiredCount = readFlowCount(importedDiagnosticFlowSummary, "requiredReadoutCount");
    const currentRequiredCount = readFlowCount(currentFlow, "requiredReadoutCount");
    const importedCapturedCount = readFlowCount(importedDiagnosticFlowSummary, "capturedReadoutCount");
    const currentCapturedCount = readFlowCount(currentFlow, "capturedReadoutCount");
    const importedMissingCount = readFlowCount(importedDiagnosticFlowSummary, "missingReadoutCount");
    const currentMissingCount = readFlowCount(currentFlow, "missingReadoutCount");
    const importedEmptyCount = readFlowCount(importedDiagnosticFlowSummary, "emptyReadoutCount");
    const currentEmptyCount = readFlowCount(currentFlow, "emptyReadoutCount");
    const importedPendingCount = readFlowCount(importedDiagnosticFlowSummary, "pendingReadoutCount");
    const currentPendingCount = readFlowCount(currentFlow, "pendingReadoutCount");
    const importedBlockerCount = readFlowCount(importedDiagnosticFlowSummary, "blockerCount");
    const currentBlockerCount = readFlowCount(currentFlow, "blockerCount");
    const importedChecklistCompleteCount = readFlowCount(importedDiagnosticFlowSummary, "checklistCompleteCount");
    const currentChecklistCompleteCount = readFlowCount(currentFlow, "checklistCompleteCount");
    const importedChecklistBlockingCount = readFlowCount(importedDiagnosticFlowSummary, "checklistBlockingCount");
    const currentChecklistBlockingCount = readFlowCount(currentFlow, "checklistBlockingCount");
    const importedChecklistPendingCount = readFlowCount(importedDiagnosticFlowSummary, "checklistPendingCount");
    const currentChecklistPendingCount = readFlowCount(currentFlow, "checklistPendingCount");
    const readStringList = (summary = {}, field) => (Array.isArray(readAliasValue(summary, field)) ? readAliasValue(summary, field).filter(Boolean).map(String).sort() : []);
    const importedChecklistBlockedIds = readStringList(importedDiagnosticFlowSummary, "checklistBlockedIds");
    const currentChecklistBlockedIds = readStringList(currentFlow, "checklistBlockedIds");
    const importedChecklistReviewIds = readStringList(importedDiagnosticFlowSummary, "checklistReviewIds");
    const currentChecklistReviewIds = readStringList(currentFlow, "checklistReviewIds");
    const diffIds = (left = [], right = []) => left.filter((id) => !right.includes(id));
    const importedVehicleApplicabilityChecklistState = importedDiagnosticFlowSummary.vehicleApplicabilityChecklist?.state || null;
    const currentVehicleApplicabilityChecklistState = currentFlow.vehicleApplicabilityChecklist?.state || null;
    const readRequestPlan = (flow = {}) => {
      const plan = flow.pendingReadoutRequestPlan || flow.pending_readout_request_plan;
      return plan && typeof plan === "object" ? plan : {};
    };
    const readRequestPlanSummary = (flow = {}) => {
      const summary = flow.readoutRequestPlanSummary || flow.readout_request_plan_summary;
      return summary && typeof summary === "object" ? summary : {};
    };
    const importedRequestPlan = readRequestPlan(importedDiagnosticFlowSummary);
    const currentRequestPlan = readRequestPlan(currentFlow);
    const importedRequestPlanSummary = readRequestPlanSummary(importedDiagnosticFlowSummary);
    const currentRequestPlanSummary = readRequestPlanSummary(currentFlow);
    const importedRequestPlanCount = readFlowCount(importedRequestPlan, "totalCount");
    const currentRequestPlanCount = readFlowCount(currentRequestPlan, "totalCount");
    const importedRequestPlanMappedCount = readFlowCount(importedRequestPlan, "mappedCount");
    const currentRequestPlanMappedCount = readFlowCount(currentRequestPlan, "mappedCount");
    const importedRequestPlanUnmappedCount = readFlowCount(importedRequestPlan, "unmappedCount");
    const currentRequestPlanUnmappedCount = readFlowCount(currentRequestPlan, "unmappedCount");
    const readSortedStringList = (value) => (Array.isArray(value) ? value.filter(Boolean).map(String).sort() : []);
    const importedRequestPlanIds = readSortedStringList(pickDefined(importedRequestPlan.requestIds, importedRequestPlan.request_ids));
    const currentRequestPlanIds = readSortedStringList(pickDefined(currentRequestPlan.requestIds, currentRequestPlan.request_ids));
    const importedRequestPlanIntents = readSortedStringList(pickDefined(importedRequestPlan.bridgeIntents, importedRequestPlan.bridge_intents));
    const currentRequestPlanIntents = readSortedStringList(pickDefined(currentRequestPlan.bridgeIntents, currentRequestPlan.bridge_intents));
    const toSingletonIdList = (value) => value ? [String(value)] : [];
    const importedRequestPlanNextRequestIds = toSingletonIdList(pickDefined(importedRequestPlanSummary.nextRequestId, importedRequestPlanSummary.next_request_id));
    const currentRequestPlanNextRequestIds = toSingletonIdList(pickDefined(currentRequestPlanSummary.nextRequestId, currentRequestPlanSummary.next_request_id));
    const importedRequestPlanNextBridgeIntents = toSingletonIdList(pickDefined(importedRequestPlanSummary.nextBridgeIntent, importedRequestPlanSummary.next_bridge_intent));
    const currentRequestPlanNextBridgeIntents = toSingletonIdList(pickDefined(currentRequestPlanSummary.nextBridgeIntent, currentRequestPlanSummary.next_bridge_intent));
    const readPrimaryBlocker = (flow = {}) => {
      const blocker = flow.primaryBlockingSummary || flow.primary_blocking_summary;
      return blocker && typeof blocker === "object" ? blocker : {};
    };
    const importedPrimaryBlocker = readPrimaryBlocker(importedDiagnosticFlowSummary);
    const currentPrimaryBlocker = readPrimaryBlocker(currentFlow);
    const importedPrimaryBlockingReasonId = pickDefined(importedPrimaryBlocker.reasonId, importedPrimaryBlocker.reason_id, importedDiagnosticFlowSummary.primaryBlockingReasonId, importedDiagnosticFlowSummary.primary_blocking_reason_id, null);
    const currentPrimaryBlockingReasonId = pickDefined(currentPrimaryBlocker.reasonId, currentPrimaryBlocker.reason_id, currentFlow.primaryBlockingReasonId, currentFlow.primary_blocking_reason_id, null);
    const importedPrimaryBlockingReadoutId = pickDefined(importedPrimaryBlocker.readoutId, importedPrimaryBlocker.readout_id, importedDiagnosticFlowSummary.primaryBlockingReadoutId, importedDiagnosticFlowSummary.primary_blocking_readout_id, null);
    const currentPrimaryBlockingReadoutId = pickDefined(currentPrimaryBlocker.readoutId, currentPrimaryBlocker.readout_id, currentFlow.primaryBlockingReadoutId, currentFlow.primary_blocking_readout_id, null);
    const importedPrimaryBlockingBridgeIntent = pickDefined(importedPrimaryBlocker.bridgeIntent, importedPrimaryBlocker.bridge_intent, importedDiagnosticFlowSummary.primaryBlockingReadoutBridgeIntent, importedDiagnosticFlowSummary.primary_blocking_readout_bridge_intent, null);
    const currentPrimaryBlockingBridgeIntent = pickDefined(currentPrimaryBlocker.bridgeIntent, currentPrimaryBlocker.bridge_intent, currentFlow.primaryBlockingReadoutBridgeIntent, currentFlow.primary_blocking_readout_bridge_intent, null);
    const importedPrimaryBlockingReasonIds = toSingletonIdList(importedPrimaryBlockingReasonId);
    const currentPrimaryBlockingReasonIds = toSingletonIdList(currentPrimaryBlockingReasonId);
    const importedPrimaryBlockingReadoutIds = toSingletonIdList(importedPrimaryBlockingReadoutId);
    const currentPrimaryBlockingReadoutIds = toSingletonIdList(currentPrimaryBlockingReadoutId);
    const importedPrimaryBlockingBridgeIntents = toSingletonIdList(importedPrimaryBlockingBridgeIntent);
    const currentPrimaryBlockingBridgeIntents = toSingletonIdList(currentPrimaryBlockingBridgeIntent);
    const importedStatus = readAliasValue(importedDiagnosticFlowSummary, "status") || null;
    const currentStatus = readAliasValue(currentFlow, "status") || null;
    const importedNextReadoutId = readAliasValue(importedDiagnosticFlowSummary, "nextReadoutId") || null;
    const currentNextReadoutId = readAliasValue(currentFlow, "nextReadoutId") || null;
    const importedNextReadoutLabel = readAliasValue(importedDiagnosticFlowSummary, "nextReadoutLabel") || null;
    const currentNextReadoutLabel = readAliasValue(currentFlow, "nextReadoutLabel") || null;
    const importedNextReadoutSource = readAliasValue(importedDiagnosticFlowSummary, "nextReadoutSource") || null;
    const currentNextReadoutSource = readAliasValue(currentFlow, "nextReadoutSource") || null;
    const importedNextReadoutQueuePosition = readAliasValue(importedDiagnosticFlowSummary, "nextReadoutQueuePosition") || null;
    const currentNextReadoutQueuePosition = readAliasValue(currentFlow, "nextReadoutQueuePosition") || null;
    const importedReadyForAnalysis = readAliasValue(importedDiagnosticFlowSummary, "readyForAnalysis") === true;
    const currentReadyForAnalysis = readAliasValue(currentFlow, "readyForAnalysis") === true;
    return {
      schemaVersion: "imported_diagnostic_flow_comparison_v1",
      importedStatus,
      currentStatus,
      statusChanged: importedStatus !== currentStatus,
      importedCompletionPercent: importedCompletion,
      currentCompletionPercent: currentCompletion,
      completionDelta: currentCompletion - importedCompletion,
      importedNextReadoutId,
      currentNextReadoutId,
      nextReadoutChanged: importedNextReadoutId !== currentNextReadoutId,
      importedNextReadoutLabel,
      currentNextReadoutLabel,
      importedNextReadoutSource,
      currentNextReadoutSource,
      importedNextReadoutQueuePosition,
      currentNextReadoutQueuePosition,
      nextReadoutDetailsChanged: importedNextReadoutLabel !== currentNextReadoutLabel
        || importedNextReadoutSource !== currentNextReadoutSource
        || importedNextReadoutQueuePosition !== currentNextReadoutQueuePosition,
      importedReadyForAnalysis,
      currentReadyForAnalysis,
      readyForAnalysisChanged: importedReadyForAnalysis !== currentReadyForAnalysis,
      importedRequiredReadoutCount: importedRequiredCount,
      currentRequiredReadoutCount: currentRequiredCount,
      requiredReadoutDelta: currentRequiredCount - importedRequiredCount,
      importedCapturedReadoutCount: importedCapturedCount,
      currentCapturedReadoutCount: currentCapturedCount,
      capturedReadoutDelta: currentCapturedCount - importedCapturedCount,
      importedMissingReadoutCount: importedMissingCount,
      currentMissingReadoutCount: currentMissingCount,
      missingReadoutDelta: currentMissingCount - importedMissingCount,
      importedEmptyReadoutCount: importedEmptyCount,
      currentEmptyReadoutCount: currentEmptyCount,
      emptyReadoutDelta: currentEmptyCount - importedEmptyCount,
      importedBlockerCount,
      currentBlockerCount,
      blockerCountDelta: currentBlockerCount - importedBlockerCount,
      importedPrimaryBlockingReasonId,
      currentPrimaryBlockingReasonId,
      primaryBlockingReasonChanged: importedPrimaryBlockingReasonId !== currentPrimaryBlockingReasonId,
      primaryBlockingReasonAddedIds: diffIds(currentPrimaryBlockingReasonIds, importedPrimaryBlockingReasonIds),
      primaryBlockingReasonRemovedIds: diffIds(importedPrimaryBlockingReasonIds, currentPrimaryBlockingReasonIds),
      importedPrimaryBlockingReadoutId,
      currentPrimaryBlockingReadoutId,
      primaryBlockingReadoutChanged: importedPrimaryBlockingReadoutId !== currentPrimaryBlockingReadoutId,
      primaryBlockingReadoutAddedIds: diffIds(currentPrimaryBlockingReadoutIds, importedPrimaryBlockingReadoutIds),
      primaryBlockingReadoutRemovedIds: diffIds(importedPrimaryBlockingReadoutIds, currentPrimaryBlockingReadoutIds),
      importedPrimaryBlockingBridgeIntent,
      currentPrimaryBlockingBridgeIntent,
      primaryBlockingBridgeIntentChanged: importedPrimaryBlockingBridgeIntent !== currentPrimaryBlockingBridgeIntent,
      primaryBlockingBridgeIntentAddedIds: diffIds(currentPrimaryBlockingBridgeIntents, importedPrimaryBlockingBridgeIntents),
      primaryBlockingBridgeIntentRemovedIds: diffIds(importedPrimaryBlockingBridgeIntents, currentPrimaryBlockingBridgeIntents),
      primaryBlockingChanged: importedPrimaryBlockingReasonId !== currentPrimaryBlockingReasonId
        || importedPrimaryBlockingReadoutId !== currentPrimaryBlockingReadoutId
        || importedPrimaryBlockingBridgeIntent !== currentPrimaryBlockingBridgeIntent,
      importedChecklistCompleteCount,
      currentChecklistCompleteCount,
      checklistCompleteDelta: currentChecklistCompleteCount - importedChecklistCompleteCount,
      importedChecklistBlockingCount,
      currentChecklistBlockingCount,
      checklistBlockingDelta: currentChecklistBlockingCount - importedChecklistBlockingCount,
      importedChecklistPendingCount,
      currentChecklistPendingCount,
      checklistPendingDelta: currentChecklistPendingCount - importedChecklistPendingCount,
      importedChecklistBlockedIds: [...importedChecklistBlockedIds],
      currentChecklistBlockedIds: [...currentChecklistBlockedIds],
      checklistBlockedIdsChanged: importedChecklistBlockedIds.join("|") !== currentChecklistBlockedIds.join("|"),
      checklistBlockedAddedIds: diffIds(currentChecklistBlockedIds, importedChecklistBlockedIds),
      checklistBlockedRemovedIds: diffIds(importedChecklistBlockedIds, currentChecklistBlockedIds),
      importedChecklistReviewIds: [...importedChecklistReviewIds],
      currentChecklistReviewIds: [...currentChecklistReviewIds],
      checklistReviewIdsChanged: importedChecklistReviewIds.join("|") !== currentChecklistReviewIds.join("|"),
      checklistReviewAddedIds: diffIds(currentChecklistReviewIds, importedChecklistReviewIds),
      checklistReviewRemovedIds: diffIds(importedChecklistReviewIds, currentChecklistReviewIds),
      importedVehicleApplicabilityChecklistState,
      currentVehicleApplicabilityChecklistState,
      vehicleApplicabilityChecklistChanged: importedVehicleApplicabilityChecklistState !== currentVehicleApplicabilityChecklistState,
      importedRequestPlanCount,
      currentRequestPlanCount,
      requestPlanCountDelta: currentRequestPlanCount - importedRequestPlanCount,
      importedRequestPlanMappedCount,
      currentRequestPlanMappedCount,
      requestPlanMappedDelta: currentRequestPlanMappedCount - importedRequestPlanMappedCount,
      importedRequestPlanUnmappedCount,
      currentRequestPlanUnmappedCount,
      requestPlanUnmappedDelta: currentRequestPlanUnmappedCount - importedRequestPlanUnmappedCount,
      requestPlanMappingChanged: importedRequestPlanMappedCount !== currentRequestPlanMappedCount
        || importedRequestPlanUnmappedCount !== currentRequestPlanUnmappedCount,
      importedRequestPlanBridgeIntents: [...importedRequestPlanIntents],
      currentRequestPlanBridgeIntents: [...currentRequestPlanIntents],
      requestPlanBridgeIntentsChanged: importedRequestPlanIntents.join("|") !== currentRequestPlanIntents.join("|"),
      importedRequestPlanIds: [...importedRequestPlanIds],
      currentRequestPlanIds: [...currentRequestPlanIds],
      requestPlanIdsChanged: importedRequestPlanIds.join("|") !== currentRequestPlanIds.join("|"),
      requestPlanAddedIds: diffIds(currentRequestPlanIds, importedRequestPlanIds),
      requestPlanRemovedIds: diffIds(importedRequestPlanIds, currentRequestPlanIds),
      requestPlanBridgeIntentAddedIds: diffIds(currentRequestPlanIntents, importedRequestPlanIntents),
      requestPlanBridgeIntentRemovedIds: diffIds(importedRequestPlanIntents, currentRequestPlanIntents),
      importedRequestPlanState: importedRequestPlanSummary.state || null,
      currentRequestPlanState: currentRequestPlanSummary.state || null,
      requestPlanStateChanged: (importedRequestPlanSummary.state || null) !== (currentRequestPlanSummary.state || null),
      importedRequestPlanNextRequestId: pickDefined(importedRequestPlanSummary.nextRequestId, importedRequestPlanSummary.next_request_id, null),
      currentRequestPlanNextRequestId: pickDefined(currentRequestPlanSummary.nextRequestId, currentRequestPlanSummary.next_request_id, null),
      requestPlanNextRequestChanged: pickDefined(importedRequestPlanSummary.nextRequestId, importedRequestPlanSummary.next_request_id, null) !== pickDefined(currentRequestPlanSummary.nextRequestId, currentRequestPlanSummary.next_request_id, null),
      requestPlanNextRequestAddedIds: diffIds(currentRequestPlanNextRequestIds, importedRequestPlanNextRequestIds),
      requestPlanNextRequestRemovedIds: diffIds(importedRequestPlanNextRequestIds, currentRequestPlanNextRequestIds),
      importedRequestPlanNextBridgeIntent: pickDefined(importedRequestPlanSummary.nextBridgeIntent, importedRequestPlanSummary.next_bridge_intent, null),
      currentRequestPlanNextBridgeIntent: pickDefined(currentRequestPlanSummary.nextBridgeIntent, currentRequestPlanSummary.next_bridge_intent, null),
      requestPlanNextBridgeIntentChanged: pickDefined(importedRequestPlanSummary.nextBridgeIntent, importedRequestPlanSummary.next_bridge_intent, null) !== pickDefined(currentRequestPlanSummary.nextBridgeIntent, currentRequestPlanSummary.next_bridge_intent, null),
      requestPlanNextBridgeIntentAddedIds: diffIds(currentRequestPlanNextBridgeIntents, importedRequestPlanNextBridgeIntents),
      requestPlanNextBridgeIntentRemovedIds: diffIds(importedRequestPlanNextBridgeIntents, currentRequestPlanNextBridgeIntents),
      importedPendingReadoutCount: importedPendingCount,
      currentPendingReadoutCount: currentPendingCount,
      pendingReadoutDelta: currentPendingCount - importedPendingCount
    };
  }

  function buildImportedReadoutCompletionComparisonSummary(importedReadoutCompletionSummary = null, currentReadoutCompletionSummary = {}) {
    if (!importedReadoutCompletionSummary || typeof importedReadoutCompletionSummary !== "object") return null;
    const currentSummary = currentReadoutCompletionSummary && typeof currentReadoutCompletionSummary === "object"
      ? currentReadoutCompletionSummary
      : {};
    const importedPendingIds = Array.isArray(importedReadoutCompletionSummary.pendingIds) ? importedReadoutCompletionSummary.pendingIds : [];
    const currentPendingIds = Array.isArray(currentSummary.pendingIds) ? currentSummary.pendingIds : [];
    const importedEmptyIds = Array.isArray(importedReadoutCompletionSummary.emptyIds) ? importedReadoutCompletionSummary.emptyIds : [];
    const currentEmptyIds = Array.isArray(currentSummary.emptyIds) ? currentSummary.emptyIds : [];
    const readCount = (summary, ids, field) => Number.isFinite(Number(summary?.[field])) ? Number(summary[field]) : ids.length;
    const importedRequiredIds = Array.isArray(importedReadoutCompletionSummary.requiredIds) ? importedReadoutCompletionSummary.requiredIds : [];
    const currentRequiredIds = Array.isArray(currentSummary.requiredIds) ? currentSummary.requiredIds : [];
    const importedCapturedIds = Array.isArray(importedReadoutCompletionSummary.capturedIds) ? importedReadoutCompletionSummary.capturedIds : [];
    const currentCapturedIds = Array.isArray(currentSummary.capturedIds) ? currentSummary.capturedIds : [];
    const importedMissingIds = Array.isArray(importedReadoutCompletionSummary.missingIds) ? importedReadoutCompletionSummary.missingIds : [];
    const currentMissingIds = Array.isArray(currentSummary.missingIds) ? currentSummary.missingIds : [];
    const importedRequiredCount = readCount(importedReadoutCompletionSummary, importedRequiredIds, "requiredCount");
    const currentRequiredCount = readCount(currentSummary, currentRequiredIds, "requiredCount");
    const importedCapturedCount = readCount(importedReadoutCompletionSummary, importedCapturedIds, "capturedCount");
    const currentCapturedCount = readCount(currentSummary, currentCapturedIds, "capturedCount");
    const importedMissingCount = readCount(importedReadoutCompletionSummary, importedMissingIds, "missingCount");
    const currentMissingCount = readCount(currentSummary, currentMissingIds, "missingCount");
    const importedPendingCount = readCount(importedReadoutCompletionSummary, importedPendingIds, "pendingCount");
    const currentPendingCount = readCount(currentSummary, currentPendingIds, "pendingCount");
    const importedEmptyCount = readCount(importedReadoutCompletionSummary, importedEmptyIds, "emptyCount");
    const currentEmptyCount = readCount(currentSummary, currentEmptyIds, "emptyCount");
    const normalizeIds = (ids = []) => (Array.isArray(ids) ? ids.filter(Boolean).map(String).sort() : []);
    const normalizedImportedRequiredIds = normalizeIds(importedRequiredIds);
    const normalizedCurrentRequiredIds = normalizeIds(currentRequiredIds);
    const normalizedImportedCapturedIds = normalizeIds(importedCapturedIds);
    const normalizedCurrentCapturedIds = normalizeIds(currentCapturedIds);
    const normalizedImportedMissingIds = normalizeIds(importedMissingIds);
    const normalizedCurrentMissingIds = normalizeIds(currentMissingIds);
    const normalizedImportedPendingIds = normalizeIds(importedPendingIds);
    const normalizedCurrentPendingIds = normalizeIds(currentPendingIds);
    const normalizedImportedEmptyIds = normalizeIds(importedEmptyIds);
    const normalizedCurrentEmptyIds = normalizeIds(currentEmptyIds);
    const diffIds = (left = [], right = []) => left.filter((id) => !right.includes(id));
    return {
      schemaVersion: "imported_readout_completion_comparison_v1",
      importedComplete: importedReadoutCompletionSummary.complete === true,
      currentComplete: currentSummary.complete === true,
      completeChanged: (importedReadoutCompletionSummary.complete === true) !== (currentSummary.complete === true),
      importedRequiredCount,
      currentRequiredCount,
      requiredCountDelta: currentRequiredCount - importedRequiredCount,
      importedRequiredIds: [...normalizedImportedRequiredIds],
      currentRequiredIds: [...normalizedCurrentRequiredIds],
      requiredIdsChanged: normalizedImportedRequiredIds.join("|") !== normalizedCurrentRequiredIds.join("|"),
      requiredAddedIds: diffIds(normalizedCurrentRequiredIds, normalizedImportedRequiredIds),
      requiredRemovedIds: diffIds(normalizedImportedRequiredIds, normalizedCurrentRequiredIds),
      importedCapturedCount,
      currentCapturedCount,
      capturedCountDelta: currentCapturedCount - importedCapturedCount,
      importedCapturedIds: [...normalizedImportedCapturedIds],
      currentCapturedIds: [...normalizedCurrentCapturedIds],
      capturedIdsChanged: normalizedImportedCapturedIds.join("|") !== normalizedCurrentCapturedIds.join("|"),
      capturedAddedIds: diffIds(normalizedCurrentCapturedIds, normalizedImportedCapturedIds),
      capturedRemovedIds: diffIds(normalizedImportedCapturedIds, normalizedCurrentCapturedIds),
      importedMissingCount,
      currentMissingCount,
      missingCountDelta: currentMissingCount - importedMissingCount,
      importedMissingIds: [...normalizedImportedMissingIds],
      currentMissingIds: [...normalizedCurrentMissingIds],
      missingIdsChanged: normalizedImportedMissingIds.join("|") !== normalizedCurrentMissingIds.join("|"),
      missingAddedIds: diffIds(normalizedCurrentMissingIds, normalizedImportedMissingIds),
      missingRemovedIds: diffIds(normalizedImportedMissingIds, normalizedCurrentMissingIds),
      importedPendingCount,
      currentPendingCount,
      pendingCountDelta: currentPendingCount - importedPendingCount,
      importedPendingIds: [...normalizedImportedPendingIds],
      currentPendingIds: [...normalizedCurrentPendingIds],
      pendingIdsChanged: normalizedImportedPendingIds.join("|") !== normalizedCurrentPendingIds.join("|"),
      pendingAddedIds: diffIds(normalizedCurrentPendingIds, normalizedImportedPendingIds),
      pendingRemovedIds: diffIds(normalizedImportedPendingIds, normalizedCurrentPendingIds),
      importedEmptyCount,
      currentEmptyCount,
      emptyCountDelta: currentEmptyCount - importedEmptyCount,
      importedEmptyIds: [...normalizedImportedEmptyIds],
      currentEmptyIds: [...normalizedCurrentEmptyIds],
      emptyIdsChanged: normalizedImportedEmptyIds.join("|") !== normalizedCurrentEmptyIds.join("|"),
      emptyAddedIds: diffIds(normalizedCurrentEmptyIds, normalizedImportedEmptyIds),
      emptyRemovedIds: diffIds(normalizedImportedEmptyIds, normalizedCurrentEmptyIds)
    };
  }

  function buildImportedCoreReadoutInventoryComparisonSummary(importedInventory = null, currentInventory = {}) {
    if (!importedInventory || typeof importedInventory !== "object") return null;
    const currentSummary = currentInventory && typeof currentInventory === "object" ? currentInventory : {};
    const aliasMap = {
      attemptedIds: ["attempted_ids"],
      attemptedReadoutCount: ["attempted_readout_count", "attempted_count"],
      capturedIds: ["captured_ids"],
      capturedReadoutCount: ["captured_readout_count", "captured_count"],
      countsById: ["counts_by_id"],
      ecuInfoMissingKeyCount: ["ecu_info_missing_key_count", "mode09_key_items_missing_count"],
      emptyIds: ["empty_ids"],
      emptyReadoutCount: ["empty_readout_count", "empty_count"],
      missingIds: ["missing_ids"],
      missingReadoutCount: ["missing_readout_count", "missing_count"],
      nextPendingReadoutId: ["next_pending_readout_id"],
      onboardMonitorFailedCount: ["onboard_monitor_failed_count"],
      pendingIds: ["pending_ids"],
      pendingReadoutCount: ["pending_readout_count", "pending_count"],
      rawPidUndecodedCount: ["raw_pid_undecoded_count", "raw_pid_values_need_conversion_count"],
      readinessIncompleteCount: ["readiness_incomplete_count"],
      totalValueCount: ["total_value_count"]
    };
    const readField = (summary = {}, field) => {
      if (!summary || typeof summary !== "object") return undefined;
      const aliases = [field, ...(aliasMap[field] || [])];
      for (const alias of aliases) {
        if (summary[alias] !== undefined) return summary[alias];
      }
      return undefined;
    };
    const readCount = (summary, field, idsField = null) => {
      const value = readField(summary, field);
      if (Number.isFinite(Number(value))) return Number(value);
      const ids = idsField ? readField(summary, idsField) : null;
      return Array.isArray(ids) ? ids.length : 0;
    };
    const readIds = (summary, field) => Array.isArray(readField(summary, field))
      ? [...new Set(readField(summary, field).filter(Boolean).map(String))].sort()
      : [];
    const readCountsById = (summary = {}) => readField(summary, "countsById") && typeof readField(summary, "countsById") === "object"
      ? { ...readField(summary, "countsById") }
      : {};
    const importedCountsById = readCountsById(importedInventory);
    const currentCountsById = readCountsById(currentSummary);
    const valueCountIds = [...new Set([...Object.keys(importedCountsById), ...Object.keys(currentCountsById)])].sort();
    const valueCountDeltaById = valueCountIds.reduce((byId, id) => {
      const importedCount = Number.isFinite(Number(importedCountsById[id])) ? Number(importedCountsById[id]) : 0;
      const currentCount = Number.isFinite(Number(currentCountsById[id])) ? Number(currentCountsById[id]) : 0;
      byId[id] = currentCount - importedCount;
      return byId;
    }, {});
    const changedValueCountIds = valueCountIds.filter((id) => valueCountDeltaById[id] !== 0);
    const diffIds = (left = [], right = []) => left.filter((id) => !right.includes(id));
    const importedCapturedIds = readIds(importedInventory, "capturedIds");
    const currentCapturedIds = readIds(currentSummary, "capturedIds");
    const importedEmptyIds = readIds(importedInventory, "emptyIds");
    const currentEmptyIds = readIds(currentSummary, "emptyIds");
    const importedMissingIds = readIds(importedInventory, "missingIds");
    const currentMissingIds = readIds(currentSummary, "missingIds");
    const importedPendingIds = readIds(importedInventory, "pendingIds");
    const currentPendingIds = readIds(currentSummary, "pendingIds");
    const importedAttemptedIds = readIds(importedInventory, "attemptedIds");
    const currentAttemptedIds = readIds(currentSummary, "attemptedIds");
    const importedTotalValueCount = readCount(importedInventory, "totalValueCount");
    const currentTotalValueCount = readCount(currentSummary, "totalValueCount");
    const importedCapturedReadoutCount = readCount(importedInventory, "capturedReadoutCount", "capturedIds");
    const currentCapturedReadoutCount = readCount(currentSummary, "capturedReadoutCount", "capturedIds");
    const importedEmptyReadoutCount = readCount(importedInventory, "emptyReadoutCount", "emptyIds");
    const currentEmptyReadoutCount = readCount(currentSummary, "emptyReadoutCount", "emptyIds");
    const importedMissingReadoutCount = readCount(importedInventory, "missingReadoutCount", "missingIds");
    const currentMissingReadoutCount = readCount(currentSummary, "missingReadoutCount", "missingIds");
    const importedPendingReadoutCount = readCount(importedInventory, "pendingReadoutCount", "pendingIds");
    const currentPendingReadoutCount = readCount(currentSummary, "pendingReadoutCount", "pendingIds");
    const importedAttemptedReadoutCount = readCount(importedInventory, "attemptedReadoutCount", "attemptedIds");
    const currentAttemptedReadoutCount = readCount(currentSummary, "attemptedReadoutCount", "attemptedIds");
    return {
      schemaVersion: "imported_core_readout_inventory_comparison_v1",
      importedTotalValueCount,
      currentTotalValueCount,
      totalValueCountDelta: currentTotalValueCount - importedTotalValueCount,
      importedCapturedReadoutCount,
      currentCapturedReadoutCount,
      capturedReadoutDelta: currentCapturedReadoutCount - importedCapturedReadoutCount,
      importedEmptyReadoutCount,
      currentEmptyReadoutCount,
      emptyReadoutDelta: currentEmptyReadoutCount - importedEmptyReadoutCount,
      importedMissingReadoutCount,
      currentMissingReadoutCount,
      missingReadoutDelta: currentMissingReadoutCount - importedMissingReadoutCount,
      importedPendingReadoutCount,
      currentPendingReadoutCount,
      pendingReadoutDelta: currentPendingReadoutCount - importedPendingReadoutCount,
      importedAttemptedReadoutCount,
      currentAttemptedReadoutCount,
      attemptedReadoutDelta: currentAttemptedReadoutCount - importedAttemptedReadoutCount,
      importedCapturedIds,
      currentCapturedIds,
      capturedIdsChanged: importedCapturedIds.join("|") !== currentCapturedIds.join("|"),
      capturedAddedIds: diffIds(currentCapturedIds, importedCapturedIds),
      capturedRemovedIds: diffIds(importedCapturedIds, currentCapturedIds),
      importedEmptyIds,
      currentEmptyIds,
      emptyIdsChanged: importedEmptyIds.join("|") !== currentEmptyIds.join("|"),
      emptyAddedIds: diffIds(currentEmptyIds, importedEmptyIds),
      emptyRemovedIds: diffIds(importedEmptyIds, currentEmptyIds),
      importedMissingIds,
      currentMissingIds,
      missingIdsChanged: importedMissingIds.join("|") !== currentMissingIds.join("|"),
      missingAddedIds: diffIds(currentMissingIds, importedMissingIds),
      missingRemovedIds: diffIds(importedMissingIds, currentMissingIds),
      importedPendingIds,
      currentPendingIds,
      pendingIdsChanged: importedPendingIds.join("|") !== currentPendingIds.join("|"),
      pendingAddedIds: diffIds(currentPendingIds, importedPendingIds),
      pendingRemovedIds: diffIds(importedPendingIds, currentPendingIds),
      importedAttemptedIds,
      currentAttemptedIds,
      attemptedIdsChanged: importedAttemptedIds.join("|") !== currentAttemptedIds.join("|"),
      attemptedAddedIds: diffIds(currentAttemptedIds, importedAttemptedIds),
      attemptedRemovedIds: diffIds(importedAttemptedIds, currentAttemptedIds),
      importedNextPendingReadoutId: readField(importedInventory, "nextPendingReadoutId") || null,
      currentNextPendingReadoutId: readField(currentSummary, "nextPendingReadoutId") || null,
      nextPendingReadoutChanged: (readField(importedInventory, "nextPendingReadoutId") || null) !== (readField(currentSummary, "nextPendingReadoutId") || null),
      importedCountsById,
      currentCountsById,
      valueCountDeltaById,
      changedValueCountIds,
      valueCountsChanged: changedValueCountIds.length > 0,
      readinessIncompleteDelta: readCount(currentSummary, "readinessIncompleteCount") - readCount(importedInventory, "readinessIncompleteCount"),
      ecuInfoMissingKeyDelta: readCount(currentSummary, "ecuInfoMissingKeyCount") - readCount(importedInventory, "ecuInfoMissingKeyCount"),
      rawPidUndecodedDelta: readCount(currentSummary, "rawPidUndecodedCount") - readCount(importedInventory, "rawPidUndecodedCount")
    };
  }

  function buildImportedAnalysisReadinessComparisonSummary(importedAnalysisReadinessSummary = null, currentAnalysisReadinessSummary = {}) {
    if (!importedAnalysisReadinessSummary || typeof importedAnalysisReadinessSummary !== "object") return null;
    const currentSummary = currentAnalysisReadinessSummary && typeof currentAnalysisReadinessSummary === "object"
      ? currentAnalysisReadinessSummary
      : {};
    const toSnakeField = (field) => String(field || "").replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
    const readAliasValue = (summary, field) => summary && typeof summary === "object" ? pickDefined(summary[field], summary[toSnakeField(field)]) : undefined;
    const readStringList = (summary = {}, field) => (Array.isArray(readAliasValue(summary, field)) ? readAliasValue(summary, field).filter(Boolean).map(String).sort() : []);
    const readCount = (summary, countField, idsField = null) => {
      const value = readAliasValue(summary, countField);
      if (Number.isFinite(Number(value))) return Number(value);
      return idsField ? readStringList(summary, idsField).length : 0;
    };
    const importedBlockerCount = readCount(importedAnalysisReadinessSummary, "blockerCount", "blockerIds");
    const currentBlockerCount = readCount(currentSummary, "blockerCount", "blockerIds");
    const importedPendingCount = readCount(importedAnalysisReadinessSummary, "pendingReadoutCount", "pendingReadoutIds");
    const currentPendingCount = readCount(currentSummary, "pendingReadoutCount", "pendingReadoutIds");
    const importedCompletion = Number.isFinite(Number(readAliasValue(importedAnalysisReadinessSummary, "completionPercent")))
      ? Number(readAliasValue(importedAnalysisReadinessSummary, "completionPercent"))
      : 0;
    const currentCompletion = Number.isFinite(Number(readAliasValue(currentSummary, "completionPercent")))
      ? Number(readAliasValue(currentSummary, "completionPercent"))
      : 0;
    const readChecklistSummary = (summary = {}) => readAliasValue(summary, "checklistSummary") || {};
    const readChecklistIds = (summary = {}, field) => readStringList(readChecklistSummary(summary), field);
    const importedChecklistBlockedIds = readChecklistIds(importedAnalysisReadinessSummary, "blockedIds");
    const currentChecklistBlockedIds = readChecklistIds(currentSummary, "blockedIds");
    const importedChecklistReviewIds = readChecklistIds(importedAnalysisReadinessSummary, "reviewIds");
    const currentChecklistReviewIds = readChecklistIds(currentSummary, "reviewIds");
    const diffIds = (left = [], right = []) => left.filter((id) => !right.includes(id));
    const importedChecklistById = readAliasValue(importedAnalysisReadinessSummary, "checklistById") || {};
    const currentChecklistById = readAliasValue(currentSummary, "checklistById") || {};
    const importedVehicleApplicabilityChecklistState = importedChecklistById.vehicle_applicability?.state || importedChecklistById.vehicleApplicability?.state || null;
    const currentVehicleApplicabilityChecklistState = currentChecklistById.vehicle_applicability?.state || currentChecklistById.vehicleApplicability?.state || null;
    const importedReady = readAliasValue(importedAnalysisReadinessSummary, "ready") === true;
    const currentReady = readAliasValue(currentSummary, "ready") === true;
    const importedStatus = readAliasValue(importedAnalysisReadinessSummary, "status") || null;
    const currentStatus = readAliasValue(currentSummary, "status") || null;
    const importedNextReadoutId = readAliasValue(importedAnalysisReadinessSummary, "nextReadoutId") || null;
    const currentNextReadoutId = readAliasValue(currentSummary, "nextReadoutId") || null;
    const importedNextReadoutLabel = readAliasValue(importedAnalysisReadinessSummary, "nextReadoutLabel") || null;
    const currentNextReadoutLabel = readAliasValue(currentSummary, "nextReadoutLabel") || null;
    const importedNextReadoutSource = readAliasValue(importedAnalysisReadinessSummary, "nextReadoutSource") || null;
    const currentNextReadoutSource = readAliasValue(currentSummary, "nextReadoutSource") || null;
    const importedNextReadoutQueuePosition = readAliasValue(importedAnalysisReadinessSummary, "nextReadoutQueuePosition") || null;
    const currentNextReadoutQueuePosition = readAliasValue(currentSummary, "nextReadoutQueuePosition") || null;
    return {
      schemaVersion: "imported_analysis_readiness_comparison_v1",
      importedReady,
      currentReady,
      readyChanged: importedReady !== currentReady,
      importedStatus,
      currentStatus,
      statusChanged: importedStatus !== currentStatus,
      importedCompletionPercent: importedCompletion,
      currentCompletionPercent: currentCompletion,
      completionDelta: currentCompletion - importedCompletion,
      importedBlockerCount,
      currentBlockerCount,
      blockerCountDelta: currentBlockerCount - importedBlockerCount,
      importedPendingReadoutCount: importedPendingCount,
      currentPendingReadoutCount: currentPendingCount,
      pendingReadoutDelta: currentPendingCount - importedPendingCount,
      importedChecklistBlockedIds: [...importedChecklistBlockedIds],
      currentChecklistBlockedIds: [...currentChecklistBlockedIds],
      checklistBlockedIdsChanged: importedChecklistBlockedIds.join("|") !== currentChecklistBlockedIds.join("|"),
      checklistBlockedAddedIds: diffIds(currentChecklistBlockedIds, importedChecklistBlockedIds),
      checklistBlockedRemovedIds: diffIds(importedChecklistBlockedIds, currentChecklistBlockedIds),
      importedChecklistReviewIds: [...importedChecklistReviewIds],
      currentChecklistReviewIds: [...currentChecklistReviewIds],
      checklistReviewIdsChanged: importedChecklistReviewIds.join("|") !== currentChecklistReviewIds.join("|"),
      checklistReviewAddedIds: diffIds(currentChecklistReviewIds, importedChecklistReviewIds),
      checklistReviewRemovedIds: diffIds(importedChecklistReviewIds, currentChecklistReviewIds),
      importedVehicleApplicabilityChecklistState,
      currentVehicleApplicabilityChecklistState,
      vehicleApplicabilityChecklistChanged: importedVehicleApplicabilityChecklistState !== currentVehicleApplicabilityChecklistState,
      importedNextReadoutId,
      currentNextReadoutId,
      nextReadoutChanged: importedNextReadoutId !== currentNextReadoutId,
      importedNextReadoutLabel,
      currentNextReadoutLabel,
      importedNextReadoutSource,
      currentNextReadoutSource,
      importedNextReadoutQueuePosition,
      currentNextReadoutQueuePosition,
      nextReadoutDetailsChanged: importedNextReadoutLabel !== currentNextReadoutLabel
        || importedNextReadoutSource !== currentNextReadoutSource
        || importedNextReadoutQueuePosition !== currentNextReadoutQueuePosition
    };
  }

  function buildImportedReadoutQualityComparisonSummary(importedQualitySummary = null, currentQualitySummary = {}) {
    if (!importedQualitySummary || typeof importedQualitySummary !== "object") return null;
    const currentSummary = currentQualitySummary && typeof currentQualitySummary === "object" ? currentQualitySummary : {};
    const toSnakeField = (field) => String(field || "").replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
    const readAliasValue = (summary = {}, field) => summary && typeof summary === "object" ? pickDefined(summary[field], summary[toSnakeField(field)]) : undefined;
    const readFlag = (summary = {}, field) => readAliasValue(summary, field) === true;
    const readCount = (summary = {}, field, fallbackIds = []) => Number.isFinite(Number(readAliasValue(summary, field))) ? Number(readAliasValue(summary, field)) : fallbackIds.length;
    const readIds = (summary = {}, field) => Array.isArray(readAliasValue(summary, field))
      ? [...new Set(readAliasValue(summary, field).filter(Boolean).map(String))].sort()
      : [];
    const importedIssueIds = readIds(importedQualitySummary, "issueIds");
    const currentIssueIds = readIds(currentSummary, "issueIds");
    const diffIds = (left = [], right = []) => left.filter((id) => !right.includes(id));
    const issueFieldDeltas = {
      raw_pid_values_need_conversion: readCount(currentSummary, "rawPidUndecodedCount") - readCount(importedQualitySummary, "rawPidUndecodedCount"),
      readiness_incomplete: readCount(currentSummary, "readinessIncompleteCount") - readCount(importedQualitySummary, "readinessIncompleteCount"),
      mode09_key_items_missing: readCount(currentSummary, "ecuInfoMissingKeyCount") - readCount(importedQualitySummary, "ecuInfoMissingKeyCount"),
      onboard_monitor_test_failed: readCount(currentSummary, "onboardMonitorFailedCount") - readCount(importedQualitySummary, "onboardMonitorFailedCount")
    };
    const changedIssueCountIds = Object.entries(issueFieldDeltas)
      .filter(([, delta]) => delta !== 0)
      .map(([id]) => id)
      .sort();
    const issueReviewReadoutMap = {
      raw_pid_values_need_conversion: "live_pid_snapshot",
      readiness_incomplete: "readiness_snapshot",
      mode09_key_items_missing: "ecu_info_snapshot",
      onboard_monitor_test_failed: "onboard_monitor_snapshot"
    };
    const issueAddedIds = diffIds(currentIssueIds, importedIssueIds);
    const issueRemovedIds = diffIds(importedIssueIds, currentIssueIds);
    const reviewIssueIds = [...new Set([
      ...issueAddedIds,
      ...issueRemovedIds,
      ...changedIssueCountIds,
      ...(readFlag(importedQualitySummary, "reviewRequired") !== readFlag(currentSummary, "reviewRequired") ? currentIssueIds : [])
    ].filter(Boolean))].sort();
    const reviewTargetReadoutIds = [...new Set(reviewIssueIds.map((id) => issueReviewReadoutMap[id]).filter(Boolean))];
    const primaryReviewTargetReadoutId = reviewTargetReadoutIds[0] || null;
    const reviewActionSummary = {
      schemaVersion: "readout_quality_review_action_v1",
      actionId: "review_readout_quality_change",
      actionRequired: reviewTargetReadoutIds.length > 0 || changedIssueCountIds.length > 0 || importedIssueIds.join("|") !== currentIssueIds.join("|"),
      reasonIds: reviewIssueIds,
      readoutIds: reviewTargetReadoutIds,
      primaryReadoutId: primaryReviewTargetReadoutId,
      vehicleCommandEnabled: false,
      wouldTransmit: false
    };
    return {
      schemaVersion: "imported_readout_quality_comparison_v1",
      importedReviewRequired: readFlag(importedQualitySummary, "reviewRequired"),
      currentReviewRequired: readFlag(currentSummary, "reviewRequired"),
      reviewRequiredChanged: readFlag(importedQualitySummary, "reviewRequired") !== readFlag(currentSummary, "reviewRequired"),
      importedReadyForInterpretation: readFlag(importedQualitySummary, "readyForInterpretation"),
      currentReadyForInterpretation: readFlag(currentSummary, "readyForInterpretation"),
      readyForInterpretationChanged: readFlag(importedQualitySummary, "readyForInterpretation") !== readFlag(currentSummary, "readyForInterpretation"),
      importedIssueCount: readCount(importedQualitySummary, "issueCount", importedIssueIds),
      currentIssueCount: readCount(currentSummary, "issueCount", currentIssueIds),
      issueCountDelta: readCount(currentSummary, "issueCount", currentIssueIds) - readCount(importedQualitySummary, "issueCount", importedIssueIds),
      importedIssueIds,
      currentIssueIds,
      issueIdsChanged: importedIssueIds.join("|") !== currentIssueIds.join("|"),
      issueAddedIds,
      issueRemovedIds,
      issueFieldDeltas,
      changedIssueCountIds,
      issueCountsChanged: changedIssueCountIds.length > 0,
      reviewIssueIds,
      reviewTargetReadoutIds,
      primaryReviewTargetReadoutId,
      reviewActionSummary,
      rawPidUndecodedDelta: issueFieldDeltas.raw_pid_values_need_conversion,
      readinessIncompleteDelta: issueFieldDeltas.readiness_incomplete,
      ecuInfoMissingKeyDelta: issueFieldDeltas.mode09_key_items_missing,
      onboardMonitorFailedDelta: issueFieldDeltas.onboard_monitor_test_failed
    };
  }

  function buildImportedReadoutRequestPlanGateComparisonSummary(importedGateSummary = null, currentGateSummary = {}) {
    if (!importedGateSummary || typeof importedGateSummary !== "object") return null;
    const currentSummary = currentGateSummary && typeof currentGateSummary === "object" ? currentGateSummary : {};
    const toSnakeField = (field) => String(field || "").replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
    const readAliasValue = (summary = {}, field) => summary && typeof summary === "object" ? pickDefined(summary[field], summary[toSnakeField(field)]) : undefined;
    const readCount = (summary, field) => Number.isFinite(Number(readAliasValue(summary, field))) ? Number(readAliasValue(summary, field)) : 0;
    const readFlag = (summary = {}, field) => readAliasValue(summary, field) === true;
    const importedBlockedReasonIds = Array.isArray(readAliasValue(importedGateSummary, "blockedReasonIds")) ? readAliasValue(importedGateSummary, "blockedReasonIds") : [];
    const currentBlockedReasonIds = Array.isArray(readAliasValue(currentSummary, "blockedReasonIds")) ? readAliasValue(currentSummary, "blockedReasonIds") : [];
    const importedActionQueue = Array.isArray(readAliasValue(importedGateSummary, "actionQueue")) ? readAliasValue(importedGateSummary, "actionQueue") : [];
    const currentActionQueue = Array.isArray(readAliasValue(currentSummary, "actionQueue")) ? readAliasValue(currentSummary, "actionQueue") : [];
    const importedActionSummaryInput = readAliasValue(importedGateSummary, "actionSummary");
    const currentActionSummaryInput = readAliasValue(currentSummary, "actionSummary");
    const importedActionSummary = importedActionSummaryInput && typeof importedActionSummaryInput === "object" ? importedActionSummaryInput : {};
    const currentActionSummary = currentActionSummaryInput && typeof currentActionSummaryInput === "object" ? currentActionSummaryInput : {};
    const readActionCount = (summary = {}, queue = [], field = "actionCount") => Number.isFinite(Number(readAliasValue(readAliasValue(summary, "actionSummary"), field)))
      ? Number(readAliasValue(readAliasValue(summary, "actionSummary"), field))
      : queue.length;
    const readActionIds = (summary = {}, queue = []) => Array.isArray(readAliasValue(summary, "actionIds"))
      ? readAliasValue(summary, "actionIds").filter(Boolean)
      : Array.isArray(readAliasValue(readAliasValue(summary, "actionSummary"), "actionIds"))
        ? readAliasValue(readAliasValue(summary, "actionSummary"), "actionIds").filter(Boolean)
      : queue.map((item) => item?.id).filter(Boolean);
    const readActionReasonIds = (summary = {}, queue = []) => Array.isArray(readAliasValue(summary, "actionReasonIds"))
      ? readAliasValue(summary, "actionReasonIds").filter(Boolean)
      : Array.isArray(readAliasValue(readAliasValue(summary, "actionSummary"), "reasonIds"))
        ? readAliasValue(readAliasValue(summary, "actionSummary"), "reasonIds").filter(Boolean)
      : queue.map((item) => item?.reasonId || item?.reason_id).filter(Boolean);
    const readActionReadoutIds = (summary = {}, queue = []) => Array.isArray(readAliasValue(summary, "actionReadoutIds"))
      ? readAliasValue(summary, "actionReadoutIds").filter(Boolean)
      : Array.isArray(readAliasValue(readAliasValue(summary, "actionSummary"), "readoutIds"))
        ? readAliasValue(readAliasValue(summary, "actionSummary"), "readoutIds").filter(Boolean)
      : [...new Set(queue.flatMap((item) => {
        const ids = item?.readoutIds || item?.readout_ids;
        return Array.isArray(ids) ? ids : [];
      }).filter(Boolean))];
    const normalizeIds = (ids = []) => (Array.isArray(ids) ? [...new Set(ids.filter(Boolean).map(String))].sort() : []);
    const diffIds = (left = [], right = []) => left.filter((id) => !right.includes(id));
    const importedActionIds = readActionIds(importedGateSummary, importedActionQueue);
    const currentActionIds = readActionIds(currentSummary, currentActionQueue);
    const importedActionReasonIds = readActionReasonIds(importedGateSummary, importedActionQueue);
    const currentActionReasonIds = readActionReasonIds(currentSummary, currentActionQueue);
    const importedActionReadoutIds = readActionReadoutIds(importedGateSummary, importedActionQueue);
    const currentActionReadoutIds = readActionReadoutIds(currentSummary, currentActionQueue);
    const normalizedImportedBlockedReasonIds = normalizeIds(importedBlockedReasonIds);
    const normalizedCurrentBlockedReasonIds = normalizeIds(currentBlockedReasonIds);
    const normalizedImportedActionIds = normalizeIds(importedActionIds);
    const normalizedCurrentActionIds = normalizeIds(currentActionIds);
    const normalizedImportedActionReasonIds = normalizeIds(importedActionReasonIds);
    const normalizedCurrentActionReasonIds = normalizeIds(currentActionReasonIds);
    const normalizedImportedActionReadoutIds = normalizeIds(importedActionReadoutIds);
    const normalizedCurrentActionReadoutIds = normalizeIds(currentActionReadoutIds);
    const importedActionSummaryCount = readActionCount(importedGateSummary, importedActionQueue, "actionCount");
    const currentActionSummaryCount = readActionCount(currentSummary, currentActionQueue, "actionCount");
    const importedActionSummaryReasonCount = readActionCount(importedGateSummary, importedActionQueue, "reasonCount");
    const currentActionSummaryReasonCount = readActionCount(currentSummary, currentActionQueue, "reasonCount");
    const importedActionSummaryReadoutCount = readActionCount(importedGateSummary, importedActionQueue, "readoutCount");
    const currentActionSummaryReadoutCount = readActionCount(currentSummary, currentActionQueue, "readoutCount");
    return {
      schemaVersion: "imported_readout_request_plan_gate_comparison_v1",
      importedState: importedGateSummary.state || null,
      currentState: currentSummary.state || null,
      stateChanged: (importedGateSummary.state || null) !== (currentSummary.state || null),
      importedReady: readFlag(importedGateSummary, "ready"),
      currentReady: readFlag(currentSummary, "ready"),
      readyChanged: readFlag(importedGateSummary, "ready") !== readFlag(currentSummary, "ready"),
      importedBlocked: readFlag(importedGateSummary, "blocked"),
      currentBlocked: readFlag(currentSummary, "blocked"),
      blockedChanged: readFlag(importedGateSummary, "blocked") !== readFlag(currentSummary, "blocked"),
      importedSafeForBridgePlanning: readFlag(importedGateSummary, "safeForBridgePlanning"),
      currentSafeForBridgePlanning: readFlag(currentSummary, "safeForBridgePlanning"),
      safeForBridgePlanningChanged: readFlag(importedGateSummary, "safeForBridgePlanning") !== readFlag(currentSummary, "safeForBridgePlanning"),
      importedNextBlockedReasonId: readAliasValue(importedGateSummary, "nextBlockedReasonId") || null,
      currentNextBlockedReasonId: readAliasValue(currentSummary, "nextBlockedReasonId") || null,
      nextBlockedReasonChanged: (readAliasValue(importedGateSummary, "nextBlockedReasonId") || null) !== (readAliasValue(currentSummary, "nextBlockedReasonId") || null),
      importedActionRequired: readFlag(importedGateSummary, "actionRequired"),
      currentActionRequired: readFlag(currentSummary, "actionRequired"),
      actionRequiredChanged: readFlag(importedGateSummary, "actionRequired") !== readFlag(currentSummary, "actionRequired"),
      importedNextActionId: readAliasValue(importedGateSummary, "nextActionId") || readAliasValue(importedActionSummary, "nextActionId") || null,
      currentNextActionId: readAliasValue(currentSummary, "nextActionId") || readAliasValue(currentActionSummary, "nextActionId") || null,
      nextActionChanged: (readAliasValue(importedGateSummary, "nextActionId") || readAliasValue(importedActionSummary, "nextActionId") || null) !== (readAliasValue(currentSummary, "nextActionId") || readAliasValue(currentActionSummary, "nextActionId") || null),
      importedTotalCount: readCount(importedGateSummary, "totalCount"),
      currentTotalCount: readCount(currentSummary, "totalCount"),
      totalCountDelta: readCount(currentSummary, "totalCount") - readCount(importedGateSummary, "totalCount"),
      importedMappedCount: readCount(importedGateSummary, "mappedCount"),
      currentMappedCount: readCount(currentSummary, "mappedCount"),
      mappedCountDelta: readCount(currentSummary, "mappedCount") - readCount(importedGateSummary, "mappedCount"),
      importedUnmappedCount: readCount(importedGateSummary, "unmappedCount"),
      currentUnmappedCount: readCount(currentSummary, "unmappedCount"),
      unmappedCountDelta: readCount(currentSummary, "unmappedCount") - readCount(importedGateSummary, "unmappedCount"),
      importedBlockedReasonIds: [...importedBlockedReasonIds],
      currentBlockedReasonIds: [...currentBlockedReasonIds],
      importedBlockedReasonCount: Number.isFinite(Number(readAliasValue(importedGateSummary, "blockedReasonCount"))) ? Number(readAliasValue(importedGateSummary, "blockedReasonCount")) : importedBlockedReasonIds.length,
      currentBlockedReasonCount: Number.isFinite(Number(readAliasValue(currentSummary, "blockedReasonCount"))) ? Number(readAliasValue(currentSummary, "blockedReasonCount")) : currentBlockedReasonIds.length,
      blockedReasonCountDelta: (Number.isFinite(Number(readAliasValue(currentSummary, "blockedReasonCount"))) ? Number(readAliasValue(currentSummary, "blockedReasonCount")) : currentBlockedReasonIds.length)
        - (Number.isFinite(Number(readAliasValue(importedGateSummary, "blockedReasonCount"))) ? Number(readAliasValue(importedGateSummary, "blockedReasonCount")) : importedBlockedReasonIds.length),
      blockedReasonIdsChanged: importedBlockedReasonIds.join("|") !== currentBlockedReasonIds.join("|"),
      blockedReasonAddedIds: diffIds(normalizedCurrentBlockedReasonIds, normalizedImportedBlockedReasonIds),
      blockedReasonRemovedIds: diffIds(normalizedImportedBlockedReasonIds, normalizedCurrentBlockedReasonIds),
      importedActionIds: [...importedActionIds],
      currentActionIds: [...currentActionIds],
      actionIdsChanged: importedActionIds.join("|") !== currentActionIds.join("|"),
      actionAddedIds: diffIds(normalizedCurrentActionIds, normalizedImportedActionIds),
      actionRemovedIds: diffIds(normalizedImportedActionIds, normalizedCurrentActionIds),
      importedActionReasonIds: [...importedActionReasonIds],
      currentActionReasonIds: [...currentActionReasonIds],
      actionReasonIdsChanged: importedActionReasonIds.join("|") !== currentActionReasonIds.join("|"),
      actionReasonAddedIds: diffIds(normalizedCurrentActionReasonIds, normalizedImportedActionReasonIds),
      actionReasonRemovedIds: diffIds(normalizedImportedActionReasonIds, normalizedCurrentActionReasonIds),
      importedActionReadoutIds: [...importedActionReadoutIds],
      currentActionReadoutIds: [...currentActionReadoutIds],
      actionReadoutIdsChanged: importedActionReadoutIds.join("|") !== currentActionReadoutIds.join("|"),
      actionReadoutAddedIds: diffIds(normalizedCurrentActionReadoutIds, normalizedImportedActionReadoutIds),
      actionReadoutRemovedIds: diffIds(normalizedImportedActionReadoutIds, normalizedCurrentActionReadoutIds),
      importedActionSummaryCount,
      currentActionSummaryCount,
      actionSummaryCountDelta: currentActionSummaryCount - importedActionSummaryCount,
      importedActionSummaryReasonCount,
      currentActionSummaryReasonCount,
      actionSummaryReasonCountDelta: currentActionSummaryReasonCount - importedActionSummaryReasonCount,
      importedActionSummaryReadoutCount,
      currentActionSummaryReadoutCount,
      actionSummaryReadoutCountDelta: currentActionSummaryReadoutCount - importedActionSummaryReadoutCount,
      importedActionQueueCount: importedActionQueue.length,
      currentActionQueueCount: currentActionQueue.length,
      actionQueueCountDelta: currentActionQueue.length - importedActionQueue.length
    };
  }

  function buildImportedSessionComparisonSummary({
    coreComparison = null,
    diagnosticFlowComparison = null,
    readoutCompletionComparison = null,
    analysisReadinessComparison = null,
    readoutQualityComparison = null,
    readoutRequestPlanGateComparison = null,
    coreReadoutInventoryComparison = null
  } = {}) {
    const sectionInputs = [
      { id: "core_session_status", comparison: coreComparison },
      { id: "diagnostic_flow_summary", comparison: diagnosticFlowComparison },
      { id: "readout_completion_summary", comparison: readoutCompletionComparison },
      { id: "analysis_readiness_summary", comparison: analysisReadinessComparison },
      { id: "readout_quality_summary", comparison: readoutQualityComparison },
      { id: "readout_request_plan_gate_summary", comparison: readoutRequestPlanGateComparison },
      { id: "core_readout_inventory_summary", comparison: coreReadoutInventoryComparison }
    ];
    const comparisons = sectionInputs.map((item) => item.comparison).filter(Boolean);
    if (!comparisons.length) return null;
    const hasComparisonMetricChanges = (comparison = {}) => Number(comparison.completionDelta || comparison.requiredCountDelta || comparison.capturedCountDelta || comparison.missingCountDelta || comparison.pendingCountDelta || comparison.emptyCountDelta || comparison.requiredReadoutDelta || comparison.capturedReadoutDelta || comparison.missingReadoutDelta || comparison.emptyReadoutDelta || comparison.pendingReadoutDelta || comparison.attemptedReadoutDelta || comparison.blockerCountDelta || comparison.totalCountDelta || comparison.mappedCountDelta || comparison.unmappedCountDelta || comparison.blockedReasonCountDelta || comparison.actionQueueCountDelta || comparison.actionSummaryCountDelta || comparison.actionSummaryReasonCountDelta || comparison.actionSummaryReadoutCountDelta || comparison.totalValueCountDelta || comparison.issueCountDelta || comparison.rawPidUndecodedDelta || comparison.readinessIncompleteDelta || comparison.ecuInfoMissingKeyDelta || comparison.onboardMonitorFailedDelta || 0) !== 0;
    const hasSectionChanges = (comparison = {}) => comparison.statusChanged === true
      || comparison.stateChanged === true
      || comparison.readyForAnalysisChanged === true
      || comparison.readyChanged === true
      || comparison.blockedChanged === true
      || comparison.safeForBridgePlanningChanged === true
      || comparison.requestPlanStateChanged === true
      || comparison.requestPlanNextRequestChanged === true
      || comparison.requestPlanNextBridgeIntentChanged === true
      || comparison.primaryBlockingChanged === true
      || comparison.primaryBlockingReasonChanged === true
      || comparison.primaryBlockingReadoutChanged === true
      || comparison.primaryBlockingBridgeIntentChanged === true
      || comparison.nextReadoutChanged === true
      || comparison.nextReadoutDetailsChanged === true
      || comparison.nextBlockedReasonChanged === true
      || comparison.actionRequiredChanged === true
      || comparison.nextActionChanged === true
      || comparison.actionIdsChanged === true
      || comparison.actionReasonIdsChanged === true
      || comparison.actionReadoutIdsChanged === true
      || comparison.blockedReasonIdsChanged === true
      || comparison.checklistBlockedIdsChanged === true
      || comparison.checklistReviewIdsChanged === true
      || comparison.vehicleApplicabilityChecklistChanged === true
      || comparison.reviewRequiredChanged === true
      || comparison.readyForInterpretationChanged === true
      || comparison.issueIdsChanged === true
      || comparison.issueCountsChanged === true
      || comparison.requiredIdsChanged === true
      || comparison.capturedIdsChanged === true
      || comparison.missingIdsChanged === true
      || comparison.pendingIdsChanged === true
      || comparison.emptyIdsChanged === true
      || comparison.attemptedIdsChanged === true
      || comparison.nextPendingReadoutChanged === true
      || comparison.valueCountsChanged === true
      || comparison.completeChanged === true
      || hasComparisonMetricChanges(comparison);
    const getSectionChangeReasonIds = (comparison = {}) => [
      comparison.statusChanged === true || comparison.stateChanged === true ? "status" : null,
      comparison.readyForAnalysisChanged === true || comparison.readyChanged === true ? "readiness" : null,
      comparison.blockedChanged === true || comparison.safeForBridgePlanningChanged === true ? "request_plan_gate" : null,
      comparison.requestPlanStateChanged === true || comparison.requestPlanNextRequestChanged === true || comparison.requestPlanNextBridgeIntentChanged === true ? "request_plan_summary" : null,
      comparison.primaryBlockingChanged === true || comparison.primaryBlockingReasonChanged === true || comparison.primaryBlockingReadoutChanged === true || comparison.primaryBlockingBridgeIntentChanged === true ? "primary_blocker" : null,
      comparison.nextReadoutChanged === true || comparison.nextReadoutDetailsChanged === true ? "next_readout" : null,
      comparison.nextBlockedReasonChanged === true || comparison.blockedReasonIdsChanged === true || Number(comparison.blockedReasonCountDelta || 0) !== 0 ? "blocked_reasons" : null,
      comparison.actionRequiredChanged === true || comparison.nextActionChanged === true || comparison.actionIdsChanged === true || comparison.actionReasonIdsChanged === true || comparison.actionReadoutIdsChanged === true || Number(comparison.actionQueueCountDelta || comparison.actionSummaryCountDelta || comparison.actionSummaryReasonCountDelta || comparison.actionSummaryReadoutCountDelta || 0) !== 0 ? "request_plan_actions" : null,
      comparison.checklistBlockedIdsChanged === true || comparison.checklistReviewIdsChanged === true || comparison.vehicleApplicabilityChecklistChanged === true ? "analysis_checklist" : null,
      comparison.reviewRequiredChanged === true || comparison.readyForInterpretationChanged === true || comparison.issueIdsChanged === true || comparison.issueCountsChanged === true || Number(comparison.issueCountDelta || 0) !== 0 ? "readout_quality" : null,
      comparison.completeChanged === true || comparison.requiredIdsChanged === true || comparison.capturedIdsChanged === true || comparison.missingIdsChanged === true || comparison.pendingIdsChanged === true || comparison.emptyIdsChanged === true || comparison.attemptedIdsChanged === true ? "readout_completion" : null,
      comparison.nextPendingReadoutChanged === true ? "next_readout" : null,
      comparison.valueCountsChanged === true || Number(comparison.totalValueCountDelta || 0) !== 0 ? "readout_inventory_values" : null,
      Number(comparison.completionDelta || 0) !== 0 ? "completion_percent" : null,
      Number(comparison.requiredCountDelta || comparison.requiredReadoutDelta || 0) !== 0 ? "required_readouts" : null,
      Number(comparison.capturedCountDelta || comparison.capturedReadoutDelta || 0) !== 0 ? "captured_readouts" : null,
      Number(comparison.missingCountDelta || comparison.missingReadoutDelta || 0) !== 0 ? "missing_readouts" : null,
      Number(comparison.emptyCountDelta || comparison.emptyReadoutDelta || 0) !== 0 ? "empty_readouts" : null,
      Number(comparison.pendingCountDelta || comparison.pendingReadoutDelta || 0) !== 0 ? "pending_readouts" : null,
      Number(comparison.attemptedReadoutDelta || 0) !== 0 ? "attempted_readouts" : null,
      Number(comparison.blockerCountDelta || 0) !== 0 ? "blockers" : null,
      Number(comparison.rawPidUndecodedDelta || 0) !== 0 ? "raw_pid_undecoded" : null,
      Number(comparison.readinessIncompleteDelta || 0) !== 0 ? "readiness_incomplete" : null,
      Number(comparison.ecuInfoMissingKeyDelta || 0) !== 0 ? "ecu_info_key_items" : null,
      Number(comparison.onboardMonitorFailedDelta || 0) !== 0 ? "onboard_monitor_failed" : null,
      Number(comparison.totalCountDelta || comparison.mappedCountDelta || comparison.unmappedCountDelta || 0) !== 0 ? "request_plan_counts" : null
    ].filter(Boolean);
    const readChangedIds = (comparison = {}, fields = []) => [...new Set(fields.flatMap((field) => Array.isArray(comparison[field]) ? comparison[field] : []).filter(Boolean))];
    const readAddedIds = (comparison = {}) => readChangedIds(comparison, [
      "checklistBlockedAddedIds", "checklistReviewAddedIds",
      "issueAddedIds", "changedIssueCountIds",
      "requiredAddedIds", "capturedAddedIds", "missingAddedIds", "pendingAddedIds", "emptyAddedIds", "attemptedAddedIds",
      "changedValueCountIds",
      "blockedReasonAddedIds", "actionAddedIds", "actionReasonAddedIds", "actionReadoutAddedIds",
      "requestPlanAddedIds", "requestPlanBridgeIntentAddedIds",
      "requestPlanNextRequestAddedIds", "requestPlanNextBridgeIntentAddedIds",
      "primaryBlockingReasonAddedIds", "primaryBlockingReadoutAddedIds", "primaryBlockingBridgeIntentAddedIds"
    ]);
    const readRemovedIds = (comparison = {}) => readChangedIds(comparison, [
      "checklistBlockedRemovedIds", "checklistReviewRemovedIds",
      "issueRemovedIds", "changedIssueCountIds",
      "requiredRemovedIds", "capturedRemovedIds", "missingRemovedIds", "pendingRemovedIds", "emptyRemovedIds", "attemptedRemovedIds",
      "changedValueCountIds",
      "blockedReasonRemovedIds", "actionRemovedIds", "actionReasonRemovedIds", "actionReadoutRemovedIds",
      "requestPlanRemovedIds", "requestPlanBridgeIntentRemovedIds",
      "requestPlanNextRequestRemovedIds", "requestPlanNextBridgeIntentRemovedIds",
      "primaryBlockingReasonRemovedIds", "primaryBlockingReadoutRemovedIds", "primaryBlockingBridgeIntentRemovedIds"
    ]);
    const sectionSummaries = sectionInputs
      .filter((item) => item.comparison)
      .map((item) => {
        const changeReasonIds = getSectionChangeReasonIds(item.comparison);
        const addedIds = readAddedIds(item.comparison);
        const removedIds = readRemovedIds(item.comparison);
        return {
          id: item.id,
          changed: hasSectionChanges(item.comparison),
          changeReasonIds,
          changeReasonCount: changeReasonIds.length,
          addedIds,
          removedIds,
          addedIdCount: addedIds.length,
          removedIdCount: removedIds.length,
          hasAddedRemovedIds: addedIds.length > 0 || removedIds.length > 0,
          statusChanged: item.comparison.statusChanged === true || item.comparison.stateChanged === true,
          completionChanged: hasComparisonMetricChanges(item.comparison),
          nextReadoutChanged: item.comparison.nextReadoutChanged === true || item.comparison.nextReadoutDetailsChanged === true,
          readyForAnalysisChanged: item.comparison.readyForAnalysisChanged === true || item.comparison.readyChanged === true,
          analysisChecklistChanged: item.comparison.checklistBlockedIdsChanged === true
            || item.comparison.checklistReviewIdsChanged === true
            || item.comparison.vehicleApplicabilityChecklistChanged === true,
          requestPlanGateChanged: item.comparison.blockedChanged === true
            || item.comparison.safeForBridgePlanningChanged === true
            || item.comparison.nextBlockedReasonChanged === true
            || item.comparison.actionRequiredChanged === true
            || item.comparison.nextActionChanged === true
            || item.comparison.actionIdsChanged === true
            || item.comparison.actionReasonIdsChanged === true
            || item.comparison.actionReadoutIdsChanged === true
            || Number(item.comparison.actionQueueCountDelta || item.comparison.actionSummaryCountDelta || item.comparison.actionSummaryReasonCountDelta || item.comparison.actionSummaryReadoutCountDelta || 0) !== 0
            || item.comparison.blockedReasonIdsChanged === true,
          requestPlanSummaryChanged: item.comparison.requestPlanStateChanged === true
            || item.comparison.requestPlanNextRequestChanged === true
            || item.comparison.requestPlanNextBridgeIntentChanged === true
        };
      });
    const changedSectionSummaries = sectionSummaries.filter((item) => item.changed);
    const unchangedSectionSummaries = sectionSummaries.filter((item) => !item.changed);
    const sectionSummaryById = sectionSummaries.reduce((byId, item) => {
      byId[item.id] = item;
      return byId;
    }, {});
    const changedSectionSummaryById = changedSectionSummaries.reduce((byId, item) => {
      byId[item.id] = item;
      return byId;
    }, {});
    const unchangedSectionSummaryById = unchangedSectionSummaries.reduce((byId, item) => {
      byId[item.id] = item;
      return byId;
    }, {});
    const comparedSectionIds = sectionSummaries.map((item) => item.id);
    const changedSectionIds = changedSectionSummaries.map((item) => item.id);
    const unchangedSectionIds = unchangedSectionSummaries.map((item) => item.id);
    const primaryChangedSectionSummary = changedSectionSummaries
      .slice()
      .sort((left, right) => (right.changeReasonCount + right.addedIdCount + right.removedIdCount) - (left.changeReasonCount + left.addedIdCount + left.removedIdCount) || left.id.localeCompare(right.id))[0] || null;
    const addedIdsBySectionId = changedSectionSummaries.reduce((byId, item) => {
      byId[item.id] = Array.isArray(item.addedIds) ? [...item.addedIds] : [];
      return byId;
    }, {});
    const removedIdsBySectionId = changedSectionSummaries.reduce((byId, item) => {
      byId[item.id] = Array.isArray(item.removedIds) ? [...item.removedIds] : [];
      return byId;
    }, {});
    const addedIds = [...new Set(changedSectionSummaries.flatMap((item) => item.addedIds || []))];
    const removedIds = [...new Set(changedSectionSummaries.flatMap((item) => item.removedIds || []))];
    const changedReasonIds = [...new Set(changedSectionSummaries.flatMap((item) => item.changeReasonIds || []))];
    const changedReasonCountsById = changedReasonIds.reduce((counts, reasonId) => {
      counts[reasonId] = changedSectionSummaries.filter((item) => (item.changeReasonIds || []).includes(reasonId)).length;
      return counts;
    }, {});
    const changedSectionsByReasonId = changedReasonIds.reduce((sectionsByReason, reasonId) => {
      sectionsByReason[reasonId] = changedSectionSummaries
        .filter((item) => (item.changeReasonIds || []).includes(reasonId))
        .map((item) => item.id);
      return sectionsByReason;
    }, {});
    const primaryChangedReasonId = changedReasonIds
      .slice()
      .sort((left, right) => (changedReasonCountsById[right] || 0) - (changedReasonCountsById[left] || 0) || left.localeCompare(right))[0] || null;
    const changedReasonSummaries = changedReasonIds.map((reasonId) => {
      const reasonSectionSummaries = changedSectionSummaries.filter((item) => (item.changeReasonIds || []).includes(reasonId));
      const reasonAddedIds = [...new Set(reasonSectionSummaries.flatMap((item) => item.addedIds || []))];
      const reasonRemovedIds = [...new Set(reasonSectionSummaries.flatMap((item) => item.removedIds || []))];
      return {
        id: reasonId,
        sectionIds: changedSectionsByReasonId[reasonId] || [],
        sectionCount: changedReasonCountsById[reasonId] || 0,
        addedIds: reasonAddedIds,
        removedIds: reasonRemovedIds,
        addedIdCount: reasonAddedIds.length,
        removedIdCount: reasonRemovedIds.length,
        primary: reasonId === primaryChangedReasonId
      };
    });
    const changedReasonSummaryById = changedReasonSummaries.reduce((byId, item) => {
      byId[item.id] = item;
      return byId;
    }, {});
    const addedIdsByReasonId = changedReasonSummaries.reduce((byId, item) => {
      byId[item.id] = Array.isArray(item.addedIds) ? [...item.addedIds] : [];
      return byId;
    }, {});
    const removedIdsByReasonId = changedReasonSummaries.reduce((byId, item) => {
      byId[item.id] = Array.isArray(item.removedIds) ? [...item.removedIds] : [];
      return byId;
    }, {});
    const buildIdOwnerIndex = (items = [], idField = "addedIds") => items.reduce((byId, item) => {
      (Array.isArray(item[idField]) ? item[idField] : []).forEach((id) => {
        if (!byId[id]) byId[id] = [];
        byId[id].push(item.id);
      });
      return byId;
    }, {});
    const sectionsByAddedId = buildIdOwnerIndex(changedSectionSummaries, "addedIds");
    const sectionsByRemovedId = buildIdOwnerIndex(changedSectionSummaries, "removedIds");
    const reasonsByAddedId = buildIdOwnerIndex(changedReasonSummaries, "addedIds");
    const reasonsByRemovedId = buildIdOwnerIndex(changedReasonSummaries, "removedIds");
    const knownReadoutChangedIds = new Set(["dtc_snapshot", "freeze_frame_snapshot", "readiness_snapshot", "ecu_info_snapshot", "onboard_monitor_snapshot", "supported_pid_matrix", "live_pid_snapshot"]);
    const knownBridgeIntentChangedIds = new Set(["read_stored_dtc", "read_freeze_frame", "read_live_pid_snapshot", "read_ecu_info", "read_onboard_monitor", "read_supported_pids"]);
    const classifyChangedIdKind = (id, reasonIds = []) => {
      if (knownBridgeIntentChangedIds.has(id) || String(id).startsWith("read_")) return "bridge_intent";
      if (knownReadoutChangedIds.has(id)) return "readout_id";
      if (reasonIds.includes("request_plan_actions")) return "request_plan_action";
      if (reasonIds.includes("blocked_reasons")) return "blocked_reason";
      if (reasonIds.includes("analysis_checklist")) return "analysis_checklist_id";
      return "other";
    };
    const changedIdSummaries = [...new Set([...addedIds, ...removedIds])].map((id) => {
      const addedSectionIds = sectionsByAddedId[id] || [];
      const removedSectionIds = sectionsByRemovedId[id] || [];
      const sectionIds = [...new Set([...addedSectionIds, ...removedSectionIds])];
      const addedReasonIds = reasonsByAddedId[id] || [];
      const removedReasonIds = reasonsByRemovedId[id] || [];
      const reasonIds = [...new Set([...addedReasonIds, ...removedReasonIds])];
      const kind = classifyChangedIdKind(id, reasonIds);
      return {
        id,
        kind,
        changedIdKind: kind,
        added: addedIds.includes(id),
        removed: removedIds.includes(id),
        direction: addedIds.includes(id) && removedIds.includes(id) ? "mixed" : addedIds.includes(id) ? "added" : "removed",
        addedSectionIds,
        removedSectionIds,
        sectionIds,
        sectionCount: sectionIds.length,
        addedSectionCount: addedSectionIds.length,
        removedSectionCount: removedSectionIds.length,
        addedReasonIds,
        removedReasonIds,
        reasonIds,
        reasonCount: reasonIds.length,
        addedReasonCount: addedReasonIds.length,
        removedReasonCount: removedReasonIds.length
      };
    });
    const changedIdSummaryById = changedIdSummaries.reduce((byId, item) => {
      byId[item.id] = item;
      return byId;
    }, {});
    const addedChangedIdSummaries = changedIdSummaries.filter((item) => item.added);
    const removedChangedIdSummaries = changedIdSummaries.filter((item) => item.removed);
    const addedOnlyChangedIdSummaries = changedIdSummaries.filter((item) => item.direction === "added");
    const removedOnlyChangedIdSummaries = changedIdSummaries.filter((item) => item.direction === "removed");
    const mixedChangedIdSummaries = changedIdSummaries.filter((item) => item.direction === "mixed");
    const changedIdKindSummaries = [...new Set(changedIdSummaries.map((item) => item.kind))].sort().map((kind) => {
      const summaries = changedIdSummaries.filter((item) => item.kind === kind);
      return { kind, ids: summaries.map((item) => item.id), count: summaries.length, summaries };
    });
    const changedIdSummaryByKind = changedIdKindSummaries.reduce((byKind, item) => {
      byKind[item.kind] = item;
      return byKind;
    }, {});
    const pickPrimaryChangedIdSummary = (summaries = []) => summaries
      .slice()
      .sort((left, right) => (right.sectionCount + right.reasonCount) - (left.sectionCount + left.reasonCount) || left.id.localeCompare(right.id))[0] || null;
    const primaryChangedIdSummaryByKind = changedIdKindSummaries.reduce((byKind, item) => {
      byKind[item.kind] = pickPrimaryChangedIdSummary(item.summaries || []);
      return byKind;
    }, {});
    const primaryChangedIdByKind = Object.fromEntries(Object.entries(primaryChangedIdSummaryByKind).map(([kind, summary]) => [kind, summary?.id || null]));
    const changedIdDirectionPriority = { mixed: 0, added: 1, removed: 2 };
    const changedIdKindDirectionSummary = changedIdKindSummaries.reduce((byKind, item) => {
      byKind[item.kind] = ["mixed", "added", "removed"].reduce((byDirection, direction) => {
        const summaries = (item.summaries || []).filter((summary) => summary.direction === direction);
        byDirection[direction] = { ids: summaries.map((summary) => summary.id), count: summaries.length, summaries };
        return byDirection;
      }, {});
      return byKind;
    }, {});
    const primaryChangedIdDirectionByKind = Object.fromEntries(changedIdKindSummaries.map((item) => {
      const summary = changedIdKindDirectionSummary[item.kind] || {};
      const direction = ["mixed", "added", "removed"]
        .sort((left, right) => (summary[right]?.count || 0) - (summary[left]?.count || 0) || changedIdDirectionPriority[left] - changedIdDirectionPriority[right])[0] || null;
      return [item.kind, direction && (summary[direction]?.count || 0) > 0 ? direction : null];
    }));
    const readoutChangedIdSummary = changedIdSummaryByKind.readout_id || { ids: [], count: 0, summaries: [] };
    const bridgeIntentChangedIdSummary = changedIdSummaryByKind.bridge_intent || { ids: [], count: 0, summaries: [] };
    const readoutChangedIdDirectionSummary = changedIdKindDirectionSummary.readout_id || {};
    const bridgeIntentChangedIdDirectionSummary = changedIdKindDirectionSummary.bridge_intent || {};
    const changedIdDirectionSummary = {
      added: { ids: addedOnlyChangedIdSummaries.map((item) => item.id), count: addedOnlyChangedIdSummaries.length, summaries: addedOnlyChangedIdSummaries },
      removed: { ids: removedOnlyChangedIdSummaries.map((item) => item.id), count: removedOnlyChangedIdSummaries.length, summaries: removedOnlyChangedIdSummaries },
      mixed: { ids: mixedChangedIdSummaries.map((item) => item.id), count: mixedChangedIdSummaries.length, summaries: mixedChangedIdSummaries }
    };
    const primaryChangedIdDirection = changedIdSummaries.length > 0
      ? ["mixed", "added", "removed"]
        .sort((left, right) => (changedIdDirectionSummary[right]?.count || 0) - (changedIdDirectionSummary[left]?.count || 0) || changedIdDirectionPriority[left] - changedIdDirectionPriority[right])[0] || null
      : null;
    const changedIdDirectionSummaries = ["mixed", "added", "removed"].map((direction) => ({
      direction,
      primary: direction === primaryChangedIdDirection,
      ...(changedIdDirectionSummary[direction] || { ids: [], count: 0, summaries: [] })
    }));
    const changedIdDirectionSummaryByDirection = changedIdDirectionSummaries.reduce((byDirection, item) => {
      byDirection[item.direction] = item;
      return byDirection;
    }, {});
    const primaryChangedIdSummary = primaryChangedIdDirection
      ? pickPrimaryChangedIdSummary(changedIdDirectionSummaryByDirection[primaryChangedIdDirection]?.summaries || [])
      : null;
    const changedIdReviewTargetByKind = {
      readout_id: "readout_review",
      bridge_intent: "bridge_contract_review",
      request_plan_action: "request_plan_review",
      blocked_reason: "blocked_reason_review",
      analysis_checklist_id: "analysis_checklist_review",
      other: "session_review"
    };
    const changedIdDisplayRows = changedIdSummaries
      .map((item) => ({
        key: `${item.kind}:${item.id}`,
        id: item.id,
        kind: item.kind,
        direction: item.direction,
        reviewTarget: changedIdReviewTargetByKind[item.kind] || "session_review",
        directionRank: changedIdDirectionPriority[item.direction] ?? 99,
        primary: item.id === primaryChangedIdSummary?.id && item.kind === primaryChangedIdSummary?.kind,
        added: item.added,
        removed: item.removed,
        sectionCount: item.sectionCount,
        reasonCount: item.reasonCount,
        addedSectionCount: item.addedSectionCount,
        removedSectionCount: item.removedSectionCount,
        addedReasonCount: item.addedReasonCount,
        removedReasonCount: item.removedReasonCount
      }))
      .sort((left, right) => Number(right.primary) - Number(left.primary) || left.directionRank - right.directionRank || left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id))
      .map((item, index) => ({ ...item, displayOrder: index + 1 }));
    const changedIdDisplayRowByKey = changedIdDisplayRows.reduce((byKey, row) => {
      byKey[row.key] = row;
      return byKey;
    }, {});
    const changedIdDisplayRowById = changedIdDisplayRows.reduce((byId, row) => {
      byId[row.id] = row;
      return byId;
    }, {});
    const primaryChangedIdDisplayRow = changedIdDisplayRows.find((row) => row.primary) || null;
    const buildChangedIdDisplayGroup = (value, rows = []) => ({
      value,
      keys: rows.map((row) => row.key),
      ids: rows.map((row) => row.id),
      count: rows.length,
      primaryKey: rows.find((row) => row.primary)?.key || null
    });
    const changedIdDisplayGroupsByKind = [...new Set(changedIdDisplayRows.map((row) => row.kind))]
      .sort()
      .map((kind) => buildChangedIdDisplayGroup(kind, changedIdDisplayRows.filter((row) => row.kind === kind)));
    const changedIdDisplayGroupsByDirection = ["mixed", "added", "removed"]
      .map((direction) => buildChangedIdDisplayGroup(direction, changedIdDisplayRows.filter((row) => row.direction === direction)));
    const changedIdDisplayGroupsByReviewTarget = [...new Set(changedIdDisplayRows.map((row) => row.reviewTarget || "session_review"))]
      .sort()
      .map((reviewTarget) => buildChangedIdDisplayGroup(reviewTarget, changedIdDisplayRows.filter((row) => row.reviewTarget === reviewTarget)));
    const indexChangedIdDisplayGroups = (groups = []) => groups.reduce((byValue, group) => {
      byValue[group.value] = group;
      return byValue;
    }, {});
    const changedIdDisplayGroupByKind = indexChangedIdDisplayGroups(changedIdDisplayGroupsByKind);
    const changedIdDisplayGroupByDirection = indexChangedIdDisplayGroups(changedIdDisplayGroupsByDirection);
    const changedIdDisplayGroupByReviewTarget = indexChangedIdDisplayGroups(changedIdDisplayGroupsByReviewTarget);
    const changedIdDisplayMatrixDirections = ["mixed", "added", "removed"];
    const changedIdDisplayMatrixRows = changedIdDisplayGroupsByKind.map((group) => {
      const byDirection = changedIdDisplayMatrixDirections.reduce((directionGroups, direction) => {
        const rows = changedIdDisplayRows.filter((row) => row.kind === group.value && row.direction === direction);
        directionGroups[direction] = buildChangedIdDisplayGroup(direction, rows);
        return directionGroups;
      }, {});
      return {
        kind: group.value,
        count: group.count,
        primaryKey: group.primaryKey,
        byDirection,
        mixedCount: byDirection.mixed.count,
        addedCount: byDirection.added.count,
        removedCount: byDirection.removed.count
      };
    });
    const changedIdReviewTargetMatrixRows = changedIdDisplayGroupsByReviewTarget.map((group) => {
      const byDirection = changedIdDisplayMatrixDirections.reduce((directionGroups, direction) => {
        const rows = changedIdDisplayRows.filter((row) => row.reviewTarget === group.value && row.direction === direction);
        directionGroups[direction] = buildChangedIdDisplayGroup(direction, rows);
        return directionGroups;
      }, {});
      return {
        reviewTarget: group.value,
        count: group.count,
        primaryKey: group.primaryKey,
        byDirection,
        mixedCount: byDirection.mixed.count,
        addedCount: byDirection.added.count,
        removedCount: byDirection.removed.count
      };
    });
    const changedIdDisplayMatrixRowByKind = changedIdDisplayMatrixRows.reduce((byKind, row) => {
      byKind[row.kind] = row;
      return byKind;
    }, {});
    const changedIdReviewTargetMatrixRowByTarget = changedIdReviewTargetMatrixRows.reduce((byTarget, row) => {
      byTarget[row.reviewTarget] = row;
      return byTarget;
    }, {});
    const buildKindDirectionCountSummary = (kind) => {
      const row = changedIdDisplayMatrixRowByKind[kind] || {};
      return {
        kind,
        total: row.count || 0,
        mixed: row.mixedCount || 0,
        added: row.addedCount || 0,
        removed: row.removedCount || 0
      };
    };
    const changedIdDisplayKindDirectionCounts = ["readout_id", "bridge_intent", "request_plan_action", "blocked_reason", "analysis_checklist_id", "other"]
      .reduce((counts, kind) => {
        counts[kind] = buildKindDirectionCountSummary(kind);
        return counts;
      }, {});
    const primaryChangedKindDirectionCounts = primaryChangedIdSummary?.kind
      ? changedIdDisplayKindDirectionCounts[primaryChangedIdSummary.kind] || buildKindDirectionCountSummary(primaryChangedIdSummary.kind)
      : null;
    const primaryChangedIdReviewTarget = primaryChangedIdSummary?.kind
      ? changedIdReviewTargetByKind[primaryChangedIdSummary.kind] || "session_review"
      : null;
    const primaryChangedReviewTargetDirectionCounts = primaryChangedIdReviewTarget
      ? changedIdReviewTargetMatrixRowByTarget[primaryChangedIdReviewTarget] || null
      : null;
    const primaryChangedReviewTargetAddedIds = primaryChangedReviewTargetDirectionCounts?.byDirection?.added?.ids || [];
    const primaryChangedReviewTargetRemovedIds = primaryChangedReviewTargetDirectionCounts?.byDirection?.removed?.ids || [];
    const primaryChangedReviewTargetMixedIds = primaryChangedReviewTargetDirectionCounts?.byDirection?.mixed?.ids || [];
    const primaryChangedReviewTargetActionSummary = {
      schemaVersion: "changed_id_review_target_action_summary_v1",
      reviewTarget: primaryChangedIdReviewTarget,
      changed: Boolean(primaryChangedIdReviewTarget),
      totalCount: primaryChangedReviewTargetDirectionCounts?.count || 0,
      addedCount: primaryChangedReviewTargetDirectionCounts?.addedCount || 0,
      removedCount: primaryChangedReviewTargetDirectionCounts?.removedCount || 0,
      mixedCount: primaryChangedReviewTargetDirectionCounts?.mixedCount || 0,
      addedIds: [...primaryChangedReviewTargetAddedIds],
      removedIds: [...primaryChangedReviewTargetRemovedIds],
      mixedIds: [...primaryChangedReviewTargetMixedIds],
      hasAddedIds: primaryChangedReviewTargetAddedIds.length > 0,
      hasRemovedIds: primaryChangedReviewTargetRemovedIds.length > 0,
      hasMixedIds: primaryChangedReviewTargetMixedIds.length > 0
    };
    const primaryChangedIdImpactSummary = {
      schemaVersion: "primary_changed_id_impact_summary_v1",
      changed: Boolean(primaryChangedIdSummary),
      primaryChangedId: primaryChangedIdSummary?.id || null,
      primaryChangedIdKind: primaryChangedIdSummary?.kind || null,
      primaryChangedIdDirection,
      primaryChangedIdReviewTarget,
      reviewTarget: primaryChangedIdReviewTarget,
      reviewTargetDirectionCounts: primaryChangedReviewTargetDirectionCounts,
      reviewTargetTotalCount: primaryChangedReviewTargetDirectionCounts?.count || 0,
      reviewTargetAddedCount: primaryChangedReviewTargetDirectionCounts?.addedCount || 0,
      reviewTargetRemovedCount: primaryChangedReviewTargetDirectionCounts?.removedCount || 0,
      reviewTargetMixedCount: primaryChangedReviewTargetDirectionCounts?.mixedCount || 0,
      reviewTargetAddedIds: primaryChangedReviewTargetAddedIds,
      reviewTargetRemovedIds: primaryChangedReviewTargetRemovedIds,
      reviewTargetMixedIds: primaryChangedReviewTargetMixedIds,
      reviewTargetActionSummary: primaryChangedReviewTargetActionSummary,
      requiresReadoutReview: primaryChangedIdReviewTarget === "readout_review",
      requiresBridgeContractReview: primaryChangedIdReviewTarget === "bridge_contract_review",
      requiresRequestPlanReview: primaryChangedIdReviewTarget === "request_plan_review",
      requiresBlockedReasonReview: primaryChangedIdReviewTarget === "blocked_reason_review",
      requiresAnalysisChecklistReview: primaryChangedIdReviewTarget === "analysis_checklist_review",
      primaryChangedIdKey: primaryChangedIdSummary?.id && primaryChangedIdSummary?.kind
        ? `${primaryChangedIdSummary.kind}:${primaryChangedIdSummary.id}`
        : null,
      kindDirectionCounts: primaryChangedKindDirectionCounts,
      kindTotalCount: primaryChangedKindDirectionCounts?.total || 0,
      kindAddedCount: primaryChangedKindDirectionCounts?.added || 0,
      kindRemovedCount: primaryChangedKindDirectionCounts?.removed || 0,
      kindMixedCount: primaryChangedKindDirectionCounts?.mixed || 0
    };
    const changedIdDisplayMatrixSummary = {
      schemaVersion: "changed_id_display_matrix_summary_v1",
      directions: changedIdDisplayMatrixDirections,
      rows: changedIdDisplayMatrixRows,
      rowByKind: changedIdDisplayMatrixRowByKind,
      rowCount: changedIdDisplayMatrixRows.length,
      totalChangedIdCount: changedIdDisplayRows.length
    };
    const changedIdDisplayGroupSummary = {
      schemaVersion: "changed_id_display_group_summary_v1",
      byKind: changedIdDisplayGroupsByKind,
      byDirection: changedIdDisplayGroupsByDirection,
      byReviewTarget: changedIdDisplayGroupsByReviewTarget,
      byKindValue: changedIdDisplayGroupByKind,
      byDirectionValue: changedIdDisplayGroupByDirection,
      byReviewTargetValue: changedIdDisplayGroupByReviewTarget,
      kindCount: changedIdDisplayGroupsByKind.length,
      directionCount: changedIdDisplayGroupsByDirection.length,
      reviewTargetCount: changedIdDisplayGroupsByReviewTarget.length
    };
    const changedIdReviewTargetSummary = {
      schemaVersion: "changed_id_review_target_summary_v1",
      groups: changedIdDisplayGroupsByReviewTarget,
      byTarget: changedIdDisplayGroupByReviewTarget,
      matrixRows: changedIdReviewTargetMatrixRows,
      matrixRowByTarget: changedIdReviewTargetMatrixRowByTarget,
      targetCount: changedIdDisplayGroupsByReviewTarget.length,
      totalChangedIdCount: changedIdDisplayRows.length,
      primaryTarget: primaryChangedIdReviewTarget,
      primaryTargetDirectionCounts: primaryChangedReviewTargetDirectionCounts,
      primaryTargetTotalCount: primaryChangedReviewTargetDirectionCounts?.count || 0,
      primaryTargetAddedCount: primaryChangedReviewTargetDirectionCounts?.addedCount || 0,
      primaryTargetRemovedCount: primaryChangedReviewTargetDirectionCounts?.removedCount || 0,
      primaryTargetMixedCount: primaryChangedReviewTargetDirectionCounts?.mixedCount || 0,
      primaryTargetAddedIds: primaryChangedReviewTargetAddedIds,
      primaryTargetRemovedIds: primaryChangedReviewTargetRemovedIds,
      primaryTargetMixedIds: primaryChangedReviewTargetMixedIds,
      primaryTargetActionSummary: primaryChangedReviewTargetActionSummary
    };
    const changedIdDisplaySummary = {
      schemaVersion: "changed_id_display_summary_v1",
      hasChangedIds: changedIdSummaries.length > 0,
      empty: changedIdSummaries.length === 0,
      status: changedIdSummaries.length > 0 ? "changed" : "unchanged",
      primaryChangedId: primaryChangedIdSummary?.id || null,
      primaryChangedIdDirection,
      primaryChangedIdKind: primaryChangedIdSummary?.kind || null,
      primaryChangedIdReviewTarget,
      primaryChangedReviewTargetDirectionCounts,
      primaryChangedReviewTargetTotalCount: primaryChangedReviewTargetDirectionCounts?.count || 0,
      primaryChangedReviewTargetAddedCount: primaryChangedReviewTargetDirectionCounts?.addedCount || 0,
      primaryChangedReviewTargetRemovedCount: primaryChangedReviewTargetDirectionCounts?.removedCount || 0,
      primaryChangedReviewTargetMixedCount: primaryChangedReviewTargetDirectionCounts?.mixedCount || 0,
      primaryChangedReviewTargetAddedIds,
      primaryChangedReviewTargetRemovedIds,
      primaryChangedReviewTargetMixedIds,
      primaryChangedReviewTargetActionSummary,
      primaryChangedKindDirectionCounts,
      primaryChangedKindTotalCount: primaryChangedKindDirectionCounts?.total || 0,
      primaryChangedKindAddedCount: primaryChangedKindDirectionCounts?.added || 0,
      primaryChangedKindRemovedCount: primaryChangedKindDirectionCounts?.removed || 0,
      primaryChangedKindMixedCount: primaryChangedKindDirectionCounts?.mixed || 0,
      primaryChangedIdImpactSummary,
      primaryChangedIdKey: primaryChangedIdSummary?.id && primaryChangedIdSummary?.kind
        ? `${primaryChangedIdSummary.kind}:${primaryChangedIdSummary.id}`
        : null,
      changedIdCount: changedIdSummaries.length,
      displayRowCount: changedIdDisplayRows.length,
      addedDisplayRowCount: changedIdDisplayGroupByDirection.added?.count || 0,
      removedDisplayRowCount: changedIdDisplayGroupByDirection.removed?.count || 0,
      mixedDisplayRowCount: changedIdDisplayGroupByDirection.mixed?.count || 0,
      rows: changedIdDisplayRows,
      rowByKey: changedIdDisplayRowByKey,
      rowById: changedIdDisplayRowById,
      primaryRow: primaryChangedIdDisplayRow,
      groups: changedIdDisplayGroupSummary,
      reviewTargets: changedIdReviewTargetSummary,
      reviewTargetGroups: changedIdDisplayGroupsByReviewTarget,
      reviewTargetCount: changedIdDisplayGroupsByReviewTarget.length,
      matrix: changedIdDisplayMatrixSummary,
      kindDirectionCounts: changedIdDisplayKindDirectionCounts,
      readoutKindDirectionCounts: changedIdDisplayKindDirectionCounts.readout_id,
      bridgeIntentKindDirectionCounts: changedIdDisplayKindDirectionCounts.bridge_intent,
      requestPlanActionKindDirectionCounts: changedIdDisplayKindDirectionCounts.request_plan_action,
      blockedReasonKindDirectionCounts: changedIdDisplayKindDirectionCounts.blocked_reason,
      analysisChecklistKindDirectionCounts: changedIdDisplayKindDirectionCounts.analysis_checklist_id,
      readoutChangedIdCount: readoutChangedIdSummary.count || 0,
      bridgeIntentChangedIdCount: bridgeIntentChangedIdSummary.count || 0,
      requestPlanActionChangedIdCount: changedIdSummaryByKind.request_plan_action?.count || 0,
      blockedReasonChangedIdCount: changedIdSummaryByKind.blocked_reason?.count || 0,
      analysisChecklistChangedIdCount: changedIdSummaryByKind.analysis_checklist_id?.count || 0,
      otherChangedIdCount: changedIdSummaryByKind.other?.count || 0,
      readoutAddedChangedIds: [...(readoutChangedIdDirectionSummary.added?.ids || [])],
      readoutRemovedChangedIds: [...(readoutChangedIdDirectionSummary.removed?.ids || [])],
      bridgeIntentAddedChangedIds: [...(bridgeIntentChangedIdDirectionSummary.added?.ids || [])],
      bridgeIntentRemovedChangedIds: [...(bridgeIntentChangedIdDirectionSummary.removed?.ids || [])]
    };
    const primaryChangedReasonSummary = primaryChangedReasonId ? changedReasonSummaryById[primaryChangedReasonId] || null : null;
    const primaryBlockerReasonSummary = changedReasonSummaryById.primary_blocker || null;
    const primaryBlockerChangedIds = primaryBlockerReasonSummary
      ? [...new Set([...(primaryBlockerReasonSummary.addedIds || []), ...(primaryBlockerReasonSummary.removedIds || [])])]
      : [];
    const primaryBlockerChangeSummary = {
      schemaVersion: "primary_blocker_change_summary_v1",
      changed: Boolean(primaryBlockerReasonSummary),
      reasonId: "primary_blocker",
      sectionIds: primaryBlockerReasonSummary?.sectionIds || [],
      sectionCount: primaryBlockerReasonSummary?.sectionCount || 0,
      addedIds: primaryBlockerReasonSummary?.addedIds || [],
      removedIds: primaryBlockerReasonSummary?.removedIds || [],
      changedIds: primaryBlockerChangedIds,
      addedIdCount: primaryBlockerReasonSummary?.addedIdCount || 0,
      removedIdCount: primaryBlockerReasonSummary?.removedIdCount || 0,
      changedIdCount: primaryBlockerChangedIds.length,
      primaryChangedId: primaryBlockerChangedIds[0] || null
    };
    const readoutQualitySectionSummary = sectionSummaryById.readout_quality_summary || null;
    const readoutQualityReviewActionSummary = readoutQualityComparison?.reviewActionSummary || null;
    const readoutQualityReviewTargetReadoutIds = Array.isArray(readoutQualityComparison?.reviewTargetReadoutIds)
      ? [...readoutQualityComparison.reviewTargetReadoutIds]
      : [];
    const readoutQualityReviewIssueIds = Array.isArray(readoutQualityComparison?.reviewIssueIds)
      ? [...readoutQualityComparison.reviewIssueIds]
      : [];
    const readoutQualityReviewRequestSummaries = readoutQualityReviewTargetReadoutIds
      .map((readoutId) => buildReadOnlyNextReadoutRequest({ id: readoutId, label: readoutId, status: "review" }))
      .filter(Boolean);
    const primaryReadoutQualityReviewRequest = readoutQualityReviewRequestSummaries[0] || null;
    const readoutQualityReviewRequestSafetySummary = buildReadoutRequestPlanSafetySummary(readoutQualityReviewRequestSummaries, []);
    const readoutQualityReviewRequestPlanSummary = {
      schemaVersion: "readout_quality_review_request_plan_v1",
      requestCount: readoutQualityReviewRequestSummaries.length,
      readoutIds: readoutQualityReviewRequestSummaries.map((item) => item.readoutId).filter(Boolean),
      bridgeIntents: [...new Set(readoutQualityReviewRequestSummaries.map((item) => item.bridgeIntent).filter(Boolean))],
      primaryRequest: primaryReadoutQualityReviewRequest,
      ...readoutQualityReviewRequestSafetySummary,
      readOnly: readoutQualityReviewRequestSafetySummary.allReadOnly === true,
      wouldTransmit: false,
      vehicleCommandEnabled: false
    };
    return {
      schemaVersion: "imported_session_comparison_v1",
      hasImportedSessionState: true,
      comparedSectionCount: comparisons.length,
      hasChanges: changedSectionIds.length > 0,
      unchanged: changedSectionIds.length === 0,
      status: changedSectionIds.length > 0 ? "changed" : "unchanged",
      changedSectionCount: changedSectionIds.length,
      unchangedSectionCount: unchangedSectionIds.length,
      primaryChangedSectionId: primaryChangedSectionSummary?.id || null,
      primaryChangedSectionSummary,
      changedReasonCount: changedReasonIds.length,
      addedIds,
      removedIds,
      addedIdCount: addedIds.length,
      removedIdCount: removedIds.length,
      hasAddedRemovedIds: addedIds.length > 0 || removedIds.length > 0,
      addedIdsBySectionId,
      removedIdsBySectionId,
      addedIdsByReasonId,
      removedIdsByReasonId,
      sectionsByAddedId,
      sectionsByRemovedId,
      reasonsByAddedId,
      reasonsByRemovedId,
      changedIdSummaries,
      changedIdSummaryById,
      changedIdKindSummaries,
      changedIdSummaryByKind,
      primaryChangedIdByKind,
      primaryChangedIdSummaryByKind,
      changedIdKindDirectionSummary,
      primaryChangedIdDirectionByKind,
      changedIdDisplayRows,
      changedIdDisplayRowByKey,
      changedIdDisplayRowById,
      primaryChangedIdDisplayRow,
      changedIdDisplayGroupByKind,
      changedIdDisplayGroupByDirection,
      changedIdDisplayGroupByReviewTarget,
      changedIdDisplayGroupSummary,
      changedIdDisplayMatrixRowByKind,
      changedIdDisplayMatrixSummary,
      changedIdReviewTargetMatrixRowByTarget,
      changedIdReviewTargetSummary,
      changedIdDisplaySummary,
      readoutQualityChanged: readoutQualitySectionSummary?.changed === true,
      readoutQualityReviewRequired: readoutQualityReviewActionSummary?.actionRequired === true,
      readoutQualityReviewActionSummary,
      readoutQualityReviewTargetReadoutIds,
      readoutQualityReviewTargetReadoutCount: readoutQualityReviewTargetReadoutIds.length,
      primaryReadoutQualityReviewTargetReadoutId: readoutQualityReviewActionSummary?.primaryReadoutId || readoutQualityReviewTargetReadoutIds[0] || null,
      readoutQualityReviewRequestSummaries,
      readoutQualityReviewRequestCount: readoutQualityReviewRequestSummaries.length,
      readoutQualityReviewRequestByReadoutId: readoutQualityReviewRequestSummaries.reduce((byId, item) => {
        byId[item.readoutId] = item;
        return byId;
      }, {}),
      primaryReadoutQualityReviewRequest,
      readoutQualityReviewRequestPlanSummary,
      readoutQualityReviewIssueIds,
      readoutQualityReviewIssueCount: readoutQualityReviewIssueIds.length,
      readoutChangedIds: [...readoutChangedIdSummary.ids],
      bridgeIntentChangedIds: [...bridgeIntentChangedIdSummary.ids],
      readoutAddedChangedIds: [...(readoutChangedIdDirectionSummary.added?.ids || [])],
      readoutRemovedChangedIds: [...(readoutChangedIdDirectionSummary.removed?.ids || [])],
      readoutMixedChangedIds: [...(readoutChangedIdDirectionSummary.mixed?.ids || [])],
      bridgeIntentAddedChangedIds: [...(bridgeIntentChangedIdDirectionSummary.added?.ids || [])],
      bridgeIntentRemovedChangedIds: [...(bridgeIntentChangedIdDirectionSummary.removed?.ids || [])],
      bridgeIntentMixedChangedIds: [...(bridgeIntentChangedIdDirectionSummary.mixed?.ids || [])],
      readoutChangedIdCount: readoutChangedIdSummary.count || 0,
      bridgeIntentChangedIdCount: bridgeIntentChangedIdSummary.count || 0,
      readoutAddedChangedIdCount: readoutChangedIdDirectionSummary.added?.count || 0,
      readoutRemovedChangedIdCount: readoutChangedIdDirectionSummary.removed?.count || 0,
      readoutMixedChangedIdCount: readoutChangedIdDirectionSummary.mixed?.count || 0,
      bridgeIntentAddedChangedIdCount: bridgeIntentChangedIdDirectionSummary.added?.count || 0,
      bridgeIntentRemovedChangedIdCount: bridgeIntentChangedIdDirectionSummary.removed?.count || 0,
      bridgeIntentMixedChangedIdCount: bridgeIntentChangedIdDirectionSummary.mixed?.count || 0,
      hasReadoutChangedIds: (readoutChangedIdSummary.count || 0) > 0,
      hasBridgeIntentChangedIds: (bridgeIntentChangedIdSummary.count || 0) > 0,
      hasAddedReadoutChangedIds: (readoutChangedIdDirectionSummary.added?.count || 0) > 0,
      hasRemovedReadoutChangedIds: (readoutChangedIdDirectionSummary.removed?.count || 0) > 0,
      hasAddedBridgeIntentChangedIds: (bridgeIntentChangedIdDirectionSummary.added?.count || 0) > 0,
      hasRemovedBridgeIntentChangedIds: (bridgeIntentChangedIdDirectionSummary.removed?.count || 0) > 0,
      changedIdCount: changedIdSummaries.length,
      addedChangedIdSummaries,
      removedChangedIdSummaries,
      addedChangedIdCount: addedChangedIdSummaries.length,
      removedChangedIdCount: removedChangedIdSummaries.length,
      addedOnlyChangedIdSummaries,
      removedOnlyChangedIdSummaries,
      mixedChangedIdSummaries,
      addedOnlyChangedIdCount: addedOnlyChangedIdSummaries.length,
      removedOnlyChangedIdCount: removedOnlyChangedIdSummaries.length,
      mixedChangedIdCount: mixedChangedIdSummaries.length,
      hasAddedOnlyChangedIds: addedOnlyChangedIdSummaries.length > 0,
      hasRemovedOnlyChangedIds: removedOnlyChangedIdSummaries.length > 0,
      hasMixedChangedIds: mixedChangedIdSummaries.length > 0,
      addedOnlyChangedIds: addedOnlyChangedIdSummaries.map((item) => item.id),
      removedOnlyChangedIds: removedOnlyChangedIdSummaries.map((item) => item.id),
      mixedChangedIds: mixedChangedIdSummaries.map((item) => item.id),
      changedIdDirectionSummary,
      changedIdDirectionSummaries,
      changedIdDirectionSummaryByDirection,
      primaryChangedIdDirection,
      primaryChangedIdDirectionSummary: primaryChangedIdDirection ? changedIdDirectionSummaryByDirection[primaryChangedIdDirection] || null : null,
      primaryChangedId: primaryChangedIdSummary?.id || null,
      primaryChangedIdSummary,
      primaryChangedReasonId,
      primaryChangedReasonSummary,
      primaryBlockerChangeSummary,
      primaryBlockerChangedIds,
      primaryBlockerChangedIdCount: primaryBlockerChangedIds.length,
      statusChanged: comparisons.some((item) => item.statusChanged === true || item.stateChanged === true),
      completionChanged: comparisons.some((item) => hasComparisonMetricChanges(item)),
      readyForAnalysisChanged: comparisons.some((item) => item.readyForAnalysisChanged === true || item.readyChanged === true),
      requestPlanGateChanged: comparisons.some((item) => item.stateChanged === true || item.blockedChanged === true || item.safeForBridgePlanningChanged === true || item.nextBlockedReasonChanged === true || item.actionRequiredChanged === true || item.nextActionChanged === true || item.actionIdsChanged === true || item.actionReasonIdsChanged === true || item.actionReadoutIdsChanged === true || Number(item.actionQueueCountDelta || item.actionSummaryCountDelta || item.actionSummaryReasonCountDelta || item.actionSummaryReadoutCountDelta || 0) !== 0 || item.blockedReasonIdsChanged === true),
      requestPlanSummaryChanged: comparisons.some((item) => item.requestPlanStateChanged === true || item.requestPlanNextRequestChanged === true || item.requestPlanNextBridgeIntentChanged === true),
      primaryBlockerChanged: comparisons.some((item) => item.primaryBlockingChanged === true || item.primaryBlockingReasonChanged === true || item.primaryBlockingReadoutChanged === true || item.primaryBlockingBridgeIntentChanged === true),
      analysisChecklistChanged: comparisons.some((item) => item.checklistBlockedIdsChanged === true || item.checklistReviewIdsChanged === true || item.vehicleApplicabilityChecklistChanged === true),
      nextReadoutChanged: comparisons.some((item) => item.nextReadoutChanged === true || item.nextReadoutDetailsChanged === true),
      readoutCompletionChanged: comparisons.some((item) => item.completeChanged === true || item.requiredIdsChanged === true || item.capturedIdsChanged === true || item.missingIdsChanged === true || item.pendingIdsChanged === true || item.emptyIdsChanged === true || Number(item.requiredCountDelta || 0) !== 0 || Number(item.capturedCountDelta || 0) !== 0 || Number(item.missingCountDelta || 0) !== 0 || Number(item.pendingCountDelta || 0) !== 0 || Number(item.emptyCountDelta || 0) !== 0),
      sectionSummaries,
      changedSectionSummaries,
      unchangedSectionSummaries,
      sectionSummaryById,
      changedSectionSummaryById,
      unchangedSectionSummaryById,
      changedReasonIds,
      changedReasonCountsById,
      changedSectionsByReasonId,
      changedReasonSummaries,
      changedReasonSummaryById,
      comparedSectionIds,
      changedSectionIds,
      unchangedSectionIds
    };
  }

  function buildCoreSessionStatusFromSummary(summary = {}, {
    vehicleApplicability = null,
    warnings = null,
    nextReadoutCandidates = null
  } = {}) {
    return buildCoreSessionStatus({
      readoutCoverage: summary.readoutCoverage || summary.readout_coverage,
      vehicleApplicability: vehicleApplicability || summary.vehicleApplicability || summary.vehicle_applicability,
      dtcSnapshot: summary.dtcSnapshot || summary.dtc_snapshot || { codes: summary.codes || summary.dtc_codes || [] },
      freezeFrameSnapshot: summary.freezeFrameSnapshot || summary.freeze_frame_snapshot || null,
      readinessSnapshot: summary.readinessSnapshot || summary.readiness_snapshot || null,
      ecuInfoSnapshot: summary.ecuInfoSnapshot || summary.ecu_info_snapshot || null,
      onboardMonitorSnapshot: summary.onboardMonitorSnapshot || summary.onboard_monitor_snapshot || null,
      livePidSnapshot: summary.livePidSnapshot || summary.live_pid_snapshot || { monitorValues: summary.monitorValues || summary.monitor_values || [], monitorValueSummary: summary.monitorValueSummary || summary.monitor_value_summary || null },
      supportedPidMatrix: summary.supportedPidMatrix || summary.supported_pid_matrix || null,
      warnings: warnings || summary.warnings || summary.warning_flags || [],
      nextReadoutCandidates: nextReadoutCandidates || summary.nextReadoutCandidates || summary.next_readout_candidates || []
    });
  }

  function resolveImportClassification(input = null) {
    return input && typeof input === "object" ? { ...input } : null;
  }

  function resolveWarningList(...warningSets) {
    return mergeUniqueStrings(...warningSets);
  }

  function getReadoutCoverageInput(input = {}) {
    return input.readoutCoverage || input.readout_coverage || input.readoutCoverageResponse || input.readout_coverage_response || null;
  }

  function resolveMonitorValueSummary(monitorValues = [], explicitSummary = null) {
    return explicitSummary || buildMonitorValueSummary(monitorValues);
  }

  function buildReadOnlyFlags({
    retainedRawText = false,
    retainedRawFrames = undefined,
    wouldTransmit = false,
    vehicleCommandEnabled = undefined,
    exportRequired = undefined
  } = {}) {
    const flags = {
      retainedRawText,
      retained_raw_text: retainedRawText,
      wouldTransmit,
      would_transmit: wouldTransmit
    };
    if (retainedRawFrames !== undefined) {
      flags.retainedRawFrames = retainedRawFrames;
      flags.retained_raw_frames = retainedRawFrames;
    }
    if (vehicleCommandEnabled !== undefined) {
      flags.vehicleCommandEnabled = vehicleCommandEnabled;
      flags.vehicle_command_enabled = vehicleCommandEnabled;
    }
    if (exportRequired !== undefined) {
      flags.exportRequired = exportRequired;
      flags.export_required = exportRequired;
    }
    return flags;
  }

  function mergeNestedSessionMetadata(base = {}, nested = {}) {
    return {
      vehicleProfile: base.vehicleProfile || base.vehicle_profile || nested.vehicleProfile || nested.vehicle_profile || null,
      vehicle_profile: base.vehicle_profile || base.vehicleProfile || nested.vehicle_profile || nested.vehicleProfile || null,
      vehicleApplicability: base.vehicleApplicability || base.vehicle_applicability || nested.vehicleApplicability || nested.vehicle_applicability || null,
      vehicle_applicability: base.vehicle_applicability || base.vehicleApplicability || nested.vehicle_applicability || nested.vehicleApplicability || null,
      readoutCoverage: pickDefined(base.readoutCoverage, base.readout_coverage, nested.readoutCoverage, nested.readout_coverage, null),
      readout_coverage: pickDefined(base.readout_coverage, base.readoutCoverage, nested.readout_coverage, nested.readoutCoverage, null),
      nextReadoutCandidates: pickDefined(base.nextReadoutCandidates, base.next_readout_candidates, nested.nextReadoutCandidates, nested.next_readout_candidates, null),
      next_readout_candidates: pickDefined(base.next_readout_candidates, base.nextReadoutCandidates, nested.next_readout_candidates, nested.nextReadoutCandidates, null),
      importClassification: pickDefined(base.importClassification, base.import_classification, nested.importClassification, nested.import_classification, null),
      import_classification: pickDefined(base.import_classification, base.importClassification, nested.import_classification, nested.importClassification, null),
      source: base.source || base.source_type || nested.source || nested.source_type || null,
      source_type: base.source_type || base.source || nested.source_type || nested.source || null,
      protocol: base.protocol || base.obd_protocol || nested.protocol || nested.obd_protocol || null,
      obd_protocol: base.obd_protocol || base.protocol || nested.obd_protocol || nested.protocol || null,
      toolHints: mergeUniqueStrings(base.toolHints, base.tool_hints, nested.toolHints, nested.tool_hints),
      tool_hints: mergeUniqueStrings(base.tool_hints, base.toolHints, nested.tool_hints, nested.toolHints),
      warnings: mergeUniqueStrings(base.warnings, base.warning_ids, base.warning_flags, base.warningFlags, nested.warnings, nested.warning_ids, nested.warning_flags, nested.warningFlags),
      warning_ids: mergeUniqueStrings(base.warning_ids, base.warnings, base.warning_flags, base.warningFlags, nested.warning_ids, nested.warnings, nested.warning_flags, nested.warningFlags),
      sourceLength: pickDefined(base.sourceLength, base.source_length, nested.sourceLength, nested.source_length, null),
      source_length: pickDefined(base.source_length, base.sourceLength, nested.source_length, nested.sourceLength, null),
      hadSensitiveIdentifier: [
        base.hadSensitiveIdentifier,
        base.had_sensitive_identifier,
        nested.hadSensitiveIdentifier,
        nested.had_sensitive_identifier
      ].some((value) => value === true)
        ? true
        : pickDefined(base.hadSensitiveIdentifier, base.had_sensitive_identifier, nested.hadSensitiveIdentifier, nested.had_sensitive_identifier, null),
      had_sensitive_identifier: [
        base.had_sensitive_identifier,
        base.hadSensitiveIdentifier,
        nested.had_sensitive_identifier,
        nested.hadSensitiveIdentifier
      ].some((value) => value === true)
        ? true
        : pickDefined(base.had_sensitive_identifier, base.hadSensitiveIdentifier, nested.had_sensitive_identifier, nested.hadSensitiveIdentifier, null)
    };
  }

  function getDiagnosticSessionInput(input = {}) {
    const payload = input.bridgeDiagnosticImport
      || input.bridge_diagnostic_import
      || input.bridgeImport
      || input.bridge_import
      || input.bridgeExportPayload
      || input.bridge_export_payload
      || null;
    const base = payload && typeof payload === "object"
      ? { ...payload, ...input }
      : input;
    const nested = input.session
      || input.scanSession
      || input.scan_session
      || input.bridgeSession
      || input.bridge_session
      || payload?.bridgeSession
      || payload?.bridge_session
      || payload?.session
      || null;
    if (!nested || typeof nested !== "object") return base;
    return {
      ...nested,
      ...base,
      source: base.source || base.source_type || nested.source || nested.source_type || "diagnostic_core",
      source_type: base.source_type || base.source || nested.source_type || nested.source || "diagnostic_core",
      session_id: base.session_id || base.sessionId || nested.session_id || nested.sessionId || "local_scan_session",
      started_at: base.started_at || base.startedAt || nested.started_at || nested.startedAt || null,
      ended_at: base.ended_at || base.endedAt || nested.ended_at || nested.endedAt || null,
      captured_at: base.captured_at || base.capturedAt || nested.captured_at || nested.capturedAt || null,
      capturedAt: base.captured_at || base.capturedAt || nested.captured_at || nested.capturedAt || null,
      protocol: base.protocol || base.obd_protocol || nested.protocol || nested.obd_protocol || null,
      obd_protocol: base.obd_protocol || base.protocol || nested.obd_protocol || nested.protocol || null,
      vehicle_profile: base.vehicle_profile || base.vehicleProfile || nested.vehicle_profile || nested.vehicleProfile || null,
      vehicle_applicability: base.vehicle_applicability || base.vehicleApplicability || nested.vehicle_applicability || nested.vehicleApplicability || null,
      connectionStatus: pickDefined(input.connectionStatus, input.connection_status, payload?.connectionStatus, payload?.connection_status, nested.connectionStatus, nested.connection_status, null),
      connection_status: pickDefined(input.connection_status, input.connectionStatus, payload?.connection_status, payload?.connectionStatus, nested.connection_status, nested.connectionStatus, null),
      vciDevices: pickDefined(input.vciDevices, input.vci_devices, input.vciList, input.vci_list, payload?.vciDevices, payload?.vci_devices, payload?.vciList, payload?.vci_list, nested.vciDevices, nested.vci_devices, nested.vciList, nested.vci_list, null),
      vci_devices: pickDefined(input.vci_devices, input.vciDevices, input.vci_list, input.vciList, payload?.vci_devices, payload?.vciDevices, payload?.vci_list, payload?.vciList, nested.vci_devices, nested.vciDevices, nested.vci_list, nested.vciList, null),
      adapterIdentity: pickDefined(input.adapterIdentity, input.adapter_identity, payload?.adapterIdentity, payload?.adapter_identity, nested.adapterIdentity, nested.adapter_identity, null),
      adapter_identity: pickDefined(input.adapter_identity, input.adapterIdentity, payload?.adapter_identity, payload?.adapterIdentity, nested.adapter_identity, nested.adapterIdentity, null),
      readoutCoverage: pickDefined(input.readoutCoverage, input.readout_coverage, payload?.readoutCoverage, payload?.readout_coverage, nested.readoutCoverage, nested.readout_coverage, null),
      readout_coverage: pickDefined(input.readout_coverage, input.readoutCoverage, payload?.readout_coverage, payload?.readoutCoverage, nested.readout_coverage, nested.readoutCoverage, null),
      coreSessionStatus: pickDefined(input.coreSessionStatus, input.core_session_status, payload?.coreSessionStatus, payload?.core_session_status, nested.coreSessionStatus, nested.core_session_status, null),
      core_session_status: pickDefined(input.core_session_status, input.coreSessionStatus, payload?.core_session_status, payload?.coreSessionStatus, nested.core_session_status, nested.coreSessionStatus, null),
      diagnosticFlowSummary: pickDefined(input.diagnosticFlowSummary, input.diagnostic_flow_summary, payload?.diagnosticFlowSummary, payload?.diagnostic_flow_summary, nested.diagnosticFlowSummary, nested.diagnostic_flow_summary, null),
      diagnostic_flow_summary: pickDefined(input.diagnostic_flow_summary, input.diagnosticFlowSummary, payload?.diagnostic_flow_summary, payload?.diagnosticFlowSummary, nested.diagnostic_flow_summary, nested.diagnosticFlowSummary, null),
      readoutCompletionSummary: pickDefined(input.readoutCompletionSummary, input.readout_completion_summary, payload?.readoutCompletionSummary, payload?.readout_completion_summary, nested.readoutCompletionSummary, nested.readout_completion_summary, null),
      readout_completion_summary: pickDefined(input.readout_completion_summary, input.readoutCompletionSummary, payload?.readout_completion_summary, payload?.readoutCompletionSummary, nested.readout_completion_summary, nested.readoutCompletionSummary, null),
      analysisReadinessSummary: pickDefined(input.analysisReadinessSummary, input.analysis_readiness_summary, payload?.analysisReadinessSummary, payload?.analysis_readiness_summary, nested.analysisReadinessSummary, nested.analysis_readiness_summary, null),
      analysis_readiness_summary: pickDefined(input.analysis_readiness_summary, input.analysisReadinessSummary, payload?.analysis_readiness_summary, payload?.analysisReadinessSummary, nested.analysis_readiness_summary, nested.analysisReadinessSummary, null),
      readoutQualitySummary: pickDefined(input.readoutQualitySummary, input.readout_quality_summary, payload?.readoutQualitySummary, payload?.readout_quality_summary, nested.readoutQualitySummary, nested.readout_quality_summary, null),
      readout_quality_summary: pickDefined(input.readout_quality_summary, input.readoutQualitySummary, payload?.readout_quality_summary, payload?.readoutQualitySummary, nested.readout_quality_summary, nested.readoutQualitySummary, null),
      readoutRequestPlanGateSummary: pickDefined(input.readoutRequestPlanGateSummary, input.readout_request_plan_gate_summary, payload?.readoutRequestPlanGateSummary, payload?.readout_request_plan_gate_summary, nested.readoutRequestPlanGateSummary, nested.readout_request_plan_gate_summary, null),
      readout_request_plan_gate_summary: pickDefined(input.readout_request_plan_gate_summary, input.readoutRequestPlanGateSummary, payload?.readout_request_plan_gate_summary, payload?.readoutRequestPlanGateSummary, nested.readout_request_plan_gate_summary, nested.readoutRequestPlanGateSummary, null),
      importedReadoutQualityReviewRequestPlanSummary: pickDefined(input.importedReadoutQualityReviewRequestPlanSummary, input.imported_readout_quality_review_request_plan_summary, payload?.importedReadoutQualityReviewRequestPlanSummary, payload?.imported_readout_quality_review_request_plan_summary, nested.importedReadoutQualityReviewRequestPlanSummary, nested.imported_readout_quality_review_request_plan_summary, null),
      imported_readout_quality_review_request_plan_summary: pickDefined(input.imported_readout_quality_review_request_plan_summary, input.importedReadoutQualityReviewRequestPlanSummary, payload?.imported_readout_quality_review_request_plan_summary, payload?.importedReadoutQualityReviewRequestPlanSummary, nested.imported_readout_quality_review_request_plan_summary, nested.importedReadoutQualityReviewRequestPlanSummary, null),
      dtcSnapshot: pickDefined(input.dtcSnapshot, input.dtc_snapshot, payload?.dtcSnapshot, payload?.dtc_snapshot, nested.dtcSnapshot, nested.dtc_snapshot, null),
      dtc_snapshot: pickDefined(input.dtc_snapshot, input.dtcSnapshot, payload?.dtc_snapshot, payload?.dtcSnapshot, nested.dtc_snapshot, nested.dtcSnapshot, null),
      livePidSnapshot: pickDefined(input.livePidSnapshot, input.live_pid_snapshot, payload?.livePidSnapshot, payload?.live_pid_snapshot, nested.livePidSnapshot, nested.live_pid_snapshot, null),
      live_pid_snapshot: pickDefined(input.live_pid_snapshot, input.livePidSnapshot, payload?.live_pid_snapshot, payload?.livePidSnapshot, nested.live_pid_snapshot, nested.livePidSnapshot, null),
      freezeFrameSnapshot: pickDefined(input.freezeFrameSnapshot, input.freeze_frame_snapshot, payload?.freezeFrameSnapshot, payload?.freeze_frame_snapshot, nested.freezeFrameSnapshot, nested.freeze_frame_snapshot, null),
      freeze_frame_snapshot: pickDefined(input.freeze_frame_snapshot, input.freezeFrameSnapshot, payload?.freeze_frame_snapshot, payload?.freezeFrameSnapshot, nested.freeze_frame_snapshot, nested.freezeFrameSnapshot, null),
      readinessSnapshot: pickDefined(input.readinessSnapshot, input.readiness_snapshot, payload?.readinessSnapshot, payload?.readiness_snapshot, nested.readinessSnapshot, nested.readiness_snapshot, null),
      readiness_snapshot: pickDefined(input.readiness_snapshot, input.readinessSnapshot, payload?.readiness_snapshot, payload?.readinessSnapshot, nested.readiness_snapshot, nested.readinessSnapshot, null),
      onboardMonitorSnapshot: pickDefined(input.onboardMonitorSnapshot, input.onboard_monitor_snapshot, payload?.onboardMonitorSnapshot, payload?.onboard_monitor_snapshot, nested.onboardMonitorSnapshot, nested.onboard_monitor_snapshot, null),
      onboard_monitor_snapshot: pickDefined(input.onboard_monitor_snapshot, input.onboardMonitorSnapshot, payload?.onboard_monitor_snapshot, payload?.onboardMonitorSnapshot, nested.onboard_monitor_snapshot, nested.onboardMonitorSnapshot, null),
      ecuInfoSnapshot: pickDefined(input.ecuInfoSnapshot, input.ecu_info_snapshot, payload?.ecuInfoSnapshot, payload?.ecu_info_snapshot, nested.ecuInfoSnapshot, nested.ecu_info_snapshot, null),
      ecu_info_snapshot: pickDefined(input.ecu_info_snapshot, input.ecuInfoSnapshot, payload?.ecu_info_snapshot, payload?.ecuInfoSnapshot, nested.ecu_info_snapshot, nested.ecuInfoSnapshot, null),
      supportedPidMatrix: pickDefined(input.supportedPidMatrix, input.supported_pid_matrix, payload?.supportedPidMatrix, payload?.supported_pid_matrix, nested.supportedPidMatrix, nested.supported_pid_matrix, null),
      supported_pid_matrix: pickDefined(input.supported_pid_matrix, input.supportedPidMatrix, payload?.supported_pid_matrix, payload?.supportedPidMatrix, nested.supported_pid_matrix, nested.supportedPidMatrix, null),
      next_readout_candidates: pickDefined(base.next_readout_candidates, base.nextReadoutCandidates, nested.next_readout_candidates, nested.nextReadoutCandidates, null),
      tool_hints: mergeUniqueStrings(base.tool_hints, base.toolHints, nested.tool_hints, nested.toolHints),
      warnings: mergeUniqueStrings(base.warnings, base.warning_ids, base.warning_flags, base.warningFlags, nested.warnings, nested.warning_ids, nested.warning_flags, nested.warningFlags),
      warning_ids: mergeUniqueStrings(base.warning_ids, base.warnings, base.warning_flags, base.warningFlags, nested.warning_ids, nested.warnings, nested.warning_flags, nested.warningFlags),
      import_classification: pickDefined(base.import_classification, base.importClassification, nested.import_classification, nested.importClassification, null),
      sourceLength: pickDefined(input.sourceLength, input.source_length, payload?.sourceLength, payload?.source_length, nested.sourceLength, nested.source_length, null),
      source_length: pickDefined(base.source_length, base.sourceLength, nested.source_length, nested.sourceLength, null),
      hadSensitiveIdentifier: [
        input.hadSensitiveIdentifier,
        input.had_sensitive_identifier,
        payload?.hadSensitiveIdentifier,
        payload?.had_sensitive_identifier,
        nested.hadSensitiveIdentifier,
        nested.had_sensitive_identifier
      ].some((value) => value === true)
        ? true
        : pickDefined(input.hadSensitiveIdentifier, input.had_sensitive_identifier, payload?.hadSensitiveIdentifier, payload?.had_sensitive_identifier, nested.hadSensitiveIdentifier, nested.had_sensitive_identifier, null),
      had_sensitive_identifier: [
        input.had_sensitive_identifier,
        input.hadSensitiveIdentifier,
        payload?.had_sensitive_identifier,
        payload?.hadSensitiveIdentifier,
        nested.had_sensitive_identifier,
        nested.hadSensitiveIdentifier
      ].some((value) => value === true)
        ? true
        : pickDefined(base.had_sensitive_identifier, base.hadSensitiveIdentifier, nested.had_sensitive_identifier, nested.hadSensitiveIdentifier, null)
    };
  }

  function getSessionMetadataOverrides(sessionInput = {}) {
    const hadSensitiveIdentifier = sessionInput.hadSensitiveIdentifier === true
      || sessionInput.had_sensitive_identifier === true
      ? true
      : pickDefined(sessionInput.had_sensitive_identifier, sessionInput.hadSensitiveIdentifier, null);
    return {
      vehicleProfile: sessionInput.vehicle_profile || sessionInput.vehicleProfile || null,
      vehicleApplicability: sessionInput.vehicle_applicability || sessionInput.vehicleApplicability || null,
      readoutCoverage: sessionInput.readout_coverage || sessionInput.readoutCoverage || null,
      nextReadoutCandidates: sessionInput.next_readout_candidates || sessionInput.nextReadoutCandidates || null,
      importClassification: sessionInput.import_classification || sessionInput.importClassification || null,
      toolHints: mergeUniqueStrings(sessionInput.tool_hints, sessionInput.toolHints),
      warnings: mergeUniqueStrings(sessionInput.warnings, sessionInput.warning_ids, sessionInput.warning_flags, sessionInput.warningFlags),
      sourceLength: pickDefined(sessionInput.source_length, sessionInput.sourceLength, null),
      hadSensitiveIdentifier
    };
  }

  function buildSummaryMetadataFields(summary = {}, { snakeCase = false } = {}) {
    const vehicleApplicability = normalizeVehicleApplicabilitySnapshot(
      summary.vehicleApplicability || summary.vehicle_applicability || {}
    );
    const importClassificationInput = summary.importClassification || summary.import_classification;
    const importClassification = resolveImportClassification(importClassificationInput);
    const toolHints = mergeUniqueStrings(summary.toolHints, summary.tool_hints);
    const warnings = resolveWarningList(summary.warnings, summary.warning_ids, summary.warning_flags, summary.warningFlags);
    const nextReadoutCandidates = normalizeNextReadoutCandidates(summary.nextReadoutCandidates || summary.next_readout_candidates);
    const hadSensitiveIdentifier = summary.hadSensitiveIdentifier === true
      || summary.had_sensitive_identifier === true
      || summary.ecuInfoSnapshot?.hadSensitiveIdentifier === true
      || summary.ecuInfoSnapshot?.had_sensitive_identifier === true
      || summary.ecu_info_snapshot?.hadSensitiveIdentifier === true
      || summary.ecu_info_snapshot?.had_sensitive_identifier === true;
    const sourceLengthValue = pickDefined(summary.sourceLength, summary.source_length, 0);
    const sourceLength = Number.isFinite(Number(sourceLengthValue)) ? Math.max(0, Math.round(Number(sourceLengthValue))) : 0;
    return snakeCase
      ? {
        vehicle_applicability: vehicleApplicability,
        import_classification: importClassification,
        tool_hints: toolHints,
        warnings,
        warning_ids: warnings,
        next_readout_candidates: nextReadoutCandidates,
        had_sensitive_identifier: hadSensitiveIdentifier,
        source_length: sourceLength
      }
      : {
        vehicleApplicability,
        importClassification,
        toolHints,
        warnings,
        warningIds: warnings,
        nextReadoutCandidates,
        hadSensitiveIdentifier,
        sourceLength
      };
  }

  function buildMergedBridgeMetadata({ bridgeImport = null, bridgeSession = null } = {}) {
    const bridgeImportMetadata = getSessionMetadataOverrides(bridgeImport || {});
    const bridgeSessionMetadata = getSessionMetadataOverrides(bridgeSession || {});
    const readoutCoverageInput = pickDefined(
      bridgeImport?.readoutCoverage,
      bridgeImport?.readout_coverage,
      bridgeSession?.readoutCoverage,
      bridgeSession?.readout_coverage,
      null
    );
    const vehicleApplicability = pickDefined(
      bridgeImport?.vehicleApplicability,
      bridgeImport?.vehicle_applicability,
      bridgeSession?.vehicleApplicability,
      bridgeSession?.vehicle_applicability,
      null
    );
    const nextReadoutCandidatesInput = pickDefined(
      bridgeImport?.nextReadoutCandidates,
      bridgeImport?.next_readout_candidates,
      bridgeSession?.nextReadoutCandidates,
      bridgeSession?.next_readout_candidates,
      []
    );
    const importClassification = pickDefined(
      bridgeImport?.importClassification,
      bridgeImport?.import_classification,
      bridgeSession?.importClassification,
      bridgeSession?.import_classification,
      null
    );
    return {
      readoutCoverageInput,
      readoutCoverage: normalizeReadoutCoverageSnapshot(readoutCoverageInput),
      vehicleApplicability,
      nextReadoutCandidatesInput,
      importClassification: importClassification && typeof importClassification === "object"
        ? { ...importClassification }
        : null,
      toolHints: mergeUniqueStrings(bridgeImportMetadata.toolHints, bridgeSessionMetadata.toolHints),
      warnings: resolveWarningList(bridgeImportMetadata.warnings, bridgeSessionMetadata.warnings),
      hadSensitiveIdentifier: bridgeImportMetadata.hadSensitiveIdentifier === true
        || bridgeImport?.ecuInfoSnapshot?.hadSensitiveIdentifier === true
        || bridgeImport?.ecuInfoSnapshot?.had_sensitive_identifier === true
        || bridgeImport?.ecu_info_snapshot?.hadSensitiveIdentifier === true
        || bridgeImport?.ecu_info_snapshot?.had_sensitive_identifier === true
        || bridgeSessionMetadata.hadSensitiveIdentifier === true
        || bridgeSession?.ecuInfoSnapshot?.hadSensitiveIdentifier === true
        || bridgeSession?.ecuInfoSnapshot?.had_sensitive_identifier === true
        || bridgeSession?.ecu_info_snapshot?.hadSensitiveIdentifier === true
        || bridgeSession?.ecu_info_snapshot?.had_sensitive_identifier === true,
      sourceLength: Math.max(
        Number.isFinite(Number(bridgeImportMetadata.sourceLength)) ? Math.max(0, Math.round(Number(bridgeImportMetadata.sourceLength))) : 0,
        Number.isFinite(Number(bridgeSessionMetadata.sourceLength)) ? Math.max(0, Math.round(Number(bridgeSessionMetadata.sourceLength))) : 0
      )
    };
  }

  function buildTextImportMetadata({
    session = {},
    classified = {},
    explicitImportClassification = null,
    detectedToolHints = []
  } = {}) {
    const mergedToolHints = mergeUniqueStrings(session.toolHints, detectedToolHints);
    return {
      toolHints: mergedToolHints,
      importClassification: {
        schemaVersion: explicitImportClassification?.schemaVersion || classified.schemaVersion,
        bucketCounts: explicitImportClassification?.bucketCounts && typeof explicitImportClassification.bucketCounts === "object"
          ? { ...classified.bucketCounts, ...explicitImportClassification.bucketCounts }
          : classified.bucketCounts,
        isoTpSummary: explicitImportClassification?.isoTpSummary && typeof explicitImportClassification.isoTpSummary === "object"
          ? { ...classified.isoTpSummary, ...explicitImportClassification.isoTpSummary }
          : classified.isoTpSummary,
        negativeResponseSummary: explicitImportClassification?.negativeResponseSummary && typeof explicitImportClassification.negativeResponseSummary === "object"
          ? { ...classified.negativeResponseSummary, ...explicitImportClassification.negativeResponseSummary }
          : classified.negativeResponseSummary,
        lineCount: Number.isFinite(Number(explicitImportClassification?.lineCount))
          ? Math.max(0, Math.round(Number(explicitImportClassification.lineCount)))
          : classified.lineCount,
        toolHints: mergedToolHints
      },
      warnings: mergeUniqueStrings(
        session.warnings,
        classified.isoTpSummary?.incompleteCount > 0 || classified.isoTpSummary?.sequenceErrorCount > 0 ? ["isotp_reassembly_issue"] : [],
        classified.negativeResponseSummary?.totalCount > 0 ? ["negative_obd_response_present"] : []
      ),
      hadSensitiveIdentifier: session.hadSensitiveIdentifier === true
        || classified.hadSensitiveIdentifier === true
        || session.ecuInfoSnapshot?.hadSensitiveIdentifier === true
        || session.ecuInfoSnapshot?.had_sensitive_identifier === true
        || session.ecu_info_snapshot?.hadSensitiveIdentifier === true
        || session.ecu_info_snapshot?.had_sensitive_identifier === true,
      sourceLength: Number.isFinite(Number(pickDefined(session.sourceLength, classified.sourceLength)))
        ? Math.max(0, Math.round(Number(pickDefined(session.sourceLength, classified.sourceLength))))
        : 0
    };
  }

  function resolveReadoutCoverageSnapshot(input = null, derived = null) {
    if (input && typeof input === "object") {
      return normalizeReadoutCoverageSnapshot(input?.schemaVersion ? input : input);
    }
    return normalizeReadoutCoverageSnapshot(derived || buildReadoutCoverageSnapshot());
  }

  function resolveBridgeSummary(parts = {}) {
    const summaryInput = getBridgeSummaryInput(parts);
    return hasBridgeSummaryContent(summaryInput) ? normalizeBridgeSummaryAliases(summaryInput) : buildBridgeSessionSummary(parts);
  }

  function buildBridgeSessionExportPayload(parts = {}) {
    const summary = resolveBridgeSummary(parts);
    const metadataFields = buildSummaryMetadataFields(summary, { snakeCase: true });
    const coreSessionStatus = summary.coreSessionStatus || summary.core_session_status || buildCoreSessionStatusFromSummary(summary, {
      vehicleApplicability: metadataFields.vehicle_applicability,
      warnings: metadataFields.warnings,
      nextReadoutCandidates: metadataFields.next_readout_candidates
    });
    const diagnosticFlowSummary = summary.diagnosticFlowSummary || summary.diagnostic_flow_summary || buildDiagnosticFlowSummary(coreSessionStatus);
    const readoutCompletionSummary = summary.readoutCompletionSummary || summary.readout_completion_summary || coreSessionStatus.readoutCompletionSummary || null;
    const analysisReadinessSummary = summary.analysisReadinessSummary || summary.analysis_readiness_summary || coreSessionStatus.analysisReadinessSummary || null;
    const readoutQualitySummary = summary.readoutQualitySummary || summary.readout_quality_summary || coreSessionStatus.readoutQualitySummary || diagnosticFlowSummary.readoutQualitySummary || null;
    const importedReadoutQualityReviewRequestPlanSummary = summary.importedReadoutQualityReviewRequestPlanSummary
      || summary.imported_readout_quality_review_request_plan_summary
      || null;
    const readoutRequestPlanGateSummary = summary.readoutRequestPlanGateSummary
      || summary.readout_request_plan_gate_summary
      || coreSessionStatus.readoutRequestPlanGateSummary
      || coreSessionStatus.readout_request_plan_gate_summary
      || analysisReadinessSummary?.readoutRequestPlanGateSummary
      || analysisReadinessSummary?.readout_request_plan_gate_summary
      || diagnosticFlowSummary.readoutRequestPlanGateSummary
      || diagnosticFlowSummary.readout_request_plan_gate_summary
      || null;
    const coreReadoutInventorySummary = summary.coreReadoutInventorySummary
      || summary.core_readout_inventory_summary
      || buildCoreReadoutInventorySummary({
        readoutCoverage: summary.readoutCoverage,
        dtcSnapshot: { codes: summary.codes || [] },
        livePidSnapshot: { monitorValues: summary.monitorValues || [], monitorValueSummary: summary.monitorValueSummary || null },
        freezeFrameSnapshot: summary.freezeFrameSnapshot,
        readinessSnapshot: summary.readinessSnapshot,
        ecuInfoSnapshot: summary.ecuInfoSnapshot,
        onboardMonitorSnapshot: summary.onboardMonitorSnapshot,
        supportedPidMatrix: summary.supportedPidMatrix
      });
    return {
      schema_version: "bridge_session_export_v1",
      exported_at: parts.exportedAt || parts.exported_at || new Date().toISOString(),
      source: "local_bridge",
      connection_enabled: false,
      vehicle_command_enabled: false,
      retained_raw_frames: false,
      retained_raw_text: false,
      export_required: true,
      session: {
        started_at: summary.startedAt || null,
        ended_at: summary.endedAt || null,
        captured_at: summary.capturedAt || null,
        protocol: summary.protocol || null,
        vehicle_profile: summary.vehicleProfile || null,
        vehicle_applicability: metadataFields.vehicle_applicability,
        connection_status: summary.connectionStatus || normalizeBridgeConnectionStatus(),
        vci_devices: cloneBridgeArrayItems(summary.vciDevices),
        adapter_identity: summary.adapterIdentity || normalizeBridgeAdapterIdentity(),
        dtc_codes: cloneBridgeArrayItems(summary.codes),
        ecu_response_summary: summary.ecuResponseSummary || normalizeEcuResponseSummary({ source: "local_bridge" }),
        supported_pid_matrix: summary.supportedPidMatrix || buildSupportedPidMatrix({ source: "local_bridge", supported_pids: [] }),
        readiness_snapshot: summary.readinessSnapshot || normalizeBridgeReadinessSnapshot(),
        ecu_info_snapshot: summary.ecuInfoSnapshot || normalizeBridgeEcuInfoSnapshot(),
        onboard_monitor_snapshot: summary.onboardMonitorSnapshot || normalizeBridgeOnboardMonitorSnapshot(),
        readout_coverage: normalizeReadoutCoverageSnapshot(summary.readoutCoverage || buildReadoutCoverageSnapshot()),
        freeze_frame_snapshot: summary.freezeFrameSnapshot || normalizeBridgeFreezeFrameSnapshot(),
        monitor_values: cloneBridgeArrayItems(summary.monitorValues),
        monitor_value_summary: summary.monitorValueSummary || buildMonitorValueSummary(cloneBridgeArrayItems(summary.monitorValues)),
        monitor_insights: cloneBridgeArrayItems(summary.monitorInsights),
        import_classification: metadataFields.import_classification,
        tool_hints: metadataFields.tool_hints,
        warnings: metadataFields.warnings,
        next_readout_candidates: metadataFields.next_readout_candidates,
        core_session_status: coreSessionStatus,
        diagnostic_flow_summary: diagnosticFlowSummary,
        readout_completion_summary: readoutCompletionSummary,
        analysis_readiness_summary: analysisReadinessSummary,
        readout_quality_summary: readoutQualitySummary,
        imported_readout_quality_review_request_plan_summary: importedReadoutQualityReviewRequestPlanSummary,
        readout_request_plan_gate_summary: readoutRequestPlanGateSummary,
        core_readout_inventory_summary: coreReadoutInventorySummary,
        had_sensitive_identifier: metadataFields.had_sensitive_identifier,
        source_length: metadataFields.source_length
      },
      safety: {
        read_only_phase: true,
        blocked_write_intents: [...localBridgeContract.blockedWriteIntents],
        store_raw_frames: false
      }
    };
  }

  function buildBridgeDiagnosticImport(parts = {}) {
    const summary = resolveBridgeSummary(parts);
    const metadataFields = buildSummaryMetadataFields(summary);
    const nestedSessionMetadata = getSessionMetadataOverrides(parts.bridgeSession || parts.bridge_session || parts.session || {});
    const preserveNestedBridgeSessionMetadata = parts.importType === "bridge_diagnostic_snapshot" || parts.import_type === "bridge_diagnostic_snapshot";
    const bridgeSessionMetadataFields = {
      toolHints: preserveNestedBridgeSessionMetadata
        ? mergeUniqueStrings(metadataFields.toolHints, nestedSessionMetadata.toolHints)
        : metadataFields.toolHints,
      warnings: preserveNestedBridgeSessionMetadata
        ? resolveWarningList(metadataFields.warnings, nestedSessionMetadata.warnings)
        : metadataFields.warnings,
      nextReadoutCandidates: preserveNestedBridgeSessionMetadata
        ? resolveNextReadoutCandidates({
          explicitCandidates: nestedSessionMetadata.nextReadoutCandidates,
          readoutCoverage: summary.readoutCoverage,
          vehicleApplicability: summary.vehicleApplicability,
          ecuInfoSnapshot: summary.ecuInfoSnapshot,
          dtcSnapshot: summary.dtcSnapshot,
          supportedPidMatrix: summary.supportedPidMatrix
        })
        : metadataFields.nextReadoutCandidates,
      importClassification: preserveNestedBridgeSessionMetadata
        ? resolveImportClassification(nestedSessionMetadata.importClassification || metadataFields.importClassification)
        : metadataFields.importClassification,
      hadSensitiveIdentifier: preserveNestedBridgeSessionMetadata
        ? metadataFields.hadSensitiveIdentifier === true || nestedSessionMetadata.hadSensitiveIdentifier === true
        : metadataFields.hadSensitiveIdentifier,
      sourceLength: preserveNestedBridgeSessionMetadata
        ? Math.max(
          Number.isFinite(Number(metadataFields.sourceLength)) ? Math.max(0, Math.round(Number(metadataFields.sourceLength))) : 0,
          Number.isFinite(Number(nestedSessionMetadata.sourceLength)) ? Math.max(0, Math.round(Number(nestedSessionMetadata.sourceLength))) : 0
        )
        : metadataFields.sourceLength
    };
    const exportPayload = buildBridgeSessionExportPayload(summary);
    const coreSessionStatus = summary.coreSessionStatus
      || summary.core_session_status
      || exportPayload.session?.core_session_status
      || buildCoreSessionStatusFromSummary(summary, {
        vehicleApplicability: metadataFields.vehicleApplicability,
        warnings: metadataFields.warnings,
        nextReadoutCandidates: metadataFields.nextReadoutCandidates
      });
    const diagnosticFlowSummary = summary.diagnosticFlowSummary
      || summary.diagnostic_flow_summary
      || exportPayload.session?.diagnostic_flow_summary
      || buildDiagnosticFlowSummary(coreSessionStatus);
    const readoutCompletionSummary = summary.readoutCompletionSummary
      || summary.readout_completion_summary
      || exportPayload.session?.readout_completion_summary
      || null;
    const analysisReadinessSummary = summary.analysisReadinessSummary
      || summary.analysis_readiness_summary
      || exportPayload.session?.analysis_readiness_summary
      || coreSessionStatus.analysisReadinessSummary
      || null;
    const readoutQualitySummary = summary.readoutQualitySummary
      || summary.readout_quality_summary
      || exportPayload.session?.readout_quality_summary
      || coreSessionStatus.readoutQualitySummary
      || diagnosticFlowSummary.readoutQualitySummary
      || null;
    const importedReadoutQualityReviewRequestPlanSummary = summary.importedReadoutQualityReviewRequestPlanSummary
      || summary.imported_readout_quality_review_request_plan_summary
      || exportPayload.session?.imported_readout_quality_review_request_plan_summary
      || null;
    const readoutRequestPlanGateSummary = summary.readoutRequestPlanGateSummary
      || summary.readout_request_plan_gate_summary
      || exportPayload.session?.readout_request_plan_gate_summary
      || coreSessionStatus.readoutRequestPlanGateSummary
      || coreSessionStatus.readout_request_plan_gate_summary
      || analysisReadinessSummary?.readoutRequestPlanGateSummary
      || analysisReadinessSummary?.readout_request_plan_gate_summary
      || diagnosticFlowSummary.readoutRequestPlanGateSummary
      || diagnosticFlowSummary.readout_request_plan_gate_summary
      || null;
    const coreReadoutInventorySummary = summary.coreReadoutInventorySummary
      || summary.core_readout_inventory_summary
      || exportPayload.session?.core_readout_inventory_summary
      || buildCoreReadoutInventorySummary({
        readoutCoverage: summary.readoutCoverage,
        dtcSnapshot: { codes: summary.codes || [] },
        livePidSnapshot: { monitorValues: summary.monitorValues || [], monitorValueSummary: summary.monitorValueSummary || null },
        freezeFrameSnapshot: summary.freezeFrameSnapshot,
        readinessSnapshot: summary.readinessSnapshot,
        ecuInfoSnapshot: summary.ecuInfoSnapshot,
        onboardMonitorSnapshot: summary.onboardMonitorSnapshot,
        supportedPidMatrix: summary.supportedPidMatrix
      });
    const codes = cloneBridgeArrayItems(summary.codes);
    const monitorValues = cloneBridgeArrayItems(summary.monitorValues);
    const monitorInsights = cloneBridgeArrayItems(summary.monitorInsights);

    return {
      source: "local_bridge",
      importType: "bridge_diagnostic_snapshot",
      startedAt: summary.startedAt || null,
      endedAt: summary.endedAt || null,
      protocol: summary.protocol || null,
      capturedAt: summary.capturedAt || null,
      vehicleProfile: summary.vehicleProfile || null,
      vehicleApplicability: metadataFields.vehicleApplicability,
      codes,
      monitorValues,
      monitorValueSummary: summary.monitorValueSummary || buildMonitorValueSummary(monitorValues),
      monitorInsights,
      importClassification: metadataFields.importClassification,
      ecuResponseSummary: summary.ecuResponseSummary || normalizeEcuResponseSummary({ source: "local_bridge" }),
      supportedPidMatrix: summary.supportedPidMatrix || buildSupportedPidMatrix({ source: "local_bridge", supported_pids: [] }),
      readinessSnapshot: summary.readinessSnapshot || normalizeBridgeReadinessSnapshot(),
      ecuInfoSnapshot: summary.ecuInfoSnapshot || normalizeBridgeEcuInfoSnapshot(),
      onboardMonitorSnapshot: summary.onboardMonitorSnapshot || normalizeBridgeOnboardMonitorSnapshot(),
      readoutCoverage: normalizeReadoutCoverageSnapshot(summary.readoutCoverage || buildReadoutCoverageSnapshot()),
      freezeFrameSnapshot: summary.freezeFrameSnapshot || normalizeBridgeFreezeFrameSnapshot(),
      connectionStatus: summary.connectionStatus || normalizeBridgeConnectionStatus(),
      vciDevices: cloneBridgeArrayItems(summary.vciDevices),
      adapterIdentity: summary.adapterIdentity || normalizeBridgeAdapterIdentity(),
      toolHints: metadataFields.toolHints,
      warnings: metadataFields.warnings,
      nextReadoutCandidates: metadataFields.nextReadoutCandidates,
      coreSessionStatus,
      diagnosticFlowSummary,
      readoutCompletionSummary,
      analysisReadinessSummary,
      readoutQualitySummary,
      importedReadoutQualityReviewRequestPlanSummary,
      imported_readout_quality_review_request_plan_summary: importedReadoutQualityReviewRequestPlanSummary,
      readoutRequestPlanGateSummary,
      coreReadoutInventorySummary,
      bridgeSession: {
        startedAt: summary.startedAt || null,
        endedAt: summary.endedAt || null,
        capturedAt: summary.capturedAt || null,
        protocol: summary.protocol || null,
        vehicleProfile: summary.vehicleProfile || null,
        vehicleApplicability: metadataFields.vehicleApplicability,
        connectionStatus: summary.connectionStatus || normalizeBridgeConnectionStatus(),
        vciDevices: cloneBridgeArrayItems(summary.vciDevices),
        adapterIdentity: summary.adapterIdentity || normalizeBridgeAdapterIdentity(),
        codes,
        ecuResponseSummary: summary.ecuResponseSummary || normalizeEcuResponseSummary({ source: "local_bridge" }),
        supportedPidMatrix: summary.supportedPidMatrix || buildSupportedPidMatrix({ source: "local_bridge", supported_pids: [] }),
        readinessSnapshot: summary.readinessSnapshot || normalizeBridgeReadinessSnapshot(),
        ecuInfoSnapshot: summary.ecuInfoSnapshot || normalizeBridgeEcuInfoSnapshot(),
        onboardMonitorSnapshot: summary.onboardMonitorSnapshot || normalizeBridgeOnboardMonitorSnapshot(),
        readoutCoverage: normalizeReadoutCoverageSnapshot(summary.readoutCoverage || buildReadoutCoverageSnapshot()),
        freezeFrameSnapshot: summary.freezeFrameSnapshot || normalizeBridgeFreezeFrameSnapshot(),
        monitorValues,
        monitorValueSummary: summary.monitorValueSummary || buildMonitorValueSummary(monitorValues),
        monitorInsights,
        importClassification: bridgeSessionMetadataFields.importClassification,
        toolHints: bridgeSessionMetadataFields.toolHints,
        warnings: bridgeSessionMetadataFields.warnings,
        nextReadoutCandidates: bridgeSessionMetadataFields.nextReadoutCandidates,
        coreSessionStatus,
        diagnosticFlowSummary,
        readoutCompletionSummary,
        analysisReadinessSummary,
        readoutQualitySummary,
        importedReadoutQualityReviewRequestPlanSummary,
        imported_readout_quality_review_request_plan_summary: importedReadoutQualityReviewRequestPlanSummary,
        readoutRequestPlanGateSummary,
        coreReadoutInventorySummary,
        hadSensitiveIdentifier: bridgeSessionMetadataFields.hadSensitiveIdentifier,
        sourceLength: bridgeSessionMetadataFields.sourceLength,
        exportRequired: true
      },
      exportPayload,
      hadSensitiveIdentifier: metadataFields.hadSensitiveIdentifier,
      sourceLength: metadataFields.sourceLength,
      retainedRawText: false,
      wouldTransmit: false,
      vehicleCommandEnabled: false
    };
  }

  function mergeDiagnosticInputs(input = {}) {
    const scannerTextInput = input.scannerText || input.scanner_text || "";
    const bridgeImportInput = input.bridgeImport
      || input.bridge_import
      || input.bridgeDiagnosticImport
      || input.bridge_diagnostic_import
      || input.bridgeExportPayload
      || input.bridge_export_payload
      || input.bridgeSession
      || input.bridge_session;
    const bridgePartsInput = input.bridgeParts || input.bridge_parts;
    const scannerAnalysis = analyzeScannerText(scannerTextInput);
    const bridgeImport = bridgeImportInput?.importType === "bridge_diagnostic_snapshot"
      ? buildBridgeDiagnosticImport(bridgeImportInput)
      : bridgeImportInput?.schema_version === "bridge_session_export_v1" || bridgeImportInput?.session || bridgeImportInput?.bridgeSession || bridgeImportInput?.bridge_session
      ? buildBridgeDiagnosticImport(bridgeImportInput)
      : bridgeImportInput && hasBridgeSummaryContent(getBridgeSummaryInput(bridgeImportInput))
        ? buildBridgeDiagnosticImport(bridgeImportInput)
      : bridgeImportInput && hasBridgeSummaryMetadata(getBridgeSummaryInput(bridgeImportInput))
        ? buildBridgeDiagnosticImport(bridgeImportInput)
      : bridgePartsInput
        ? buildBridgeDiagnosticImport(bridgePartsInput)
        : null;
    const monitorById = new Map();
    const bridgeSession = bridgeImport?.bridgeSession || bridgeImport?.bridge_session || null;
    const importedCoreSessionStatus = bridgeImport?.coreSessionStatus
      || bridgeImport?.core_session_status
      || bridgeSession?.coreSessionStatus
      || bridgeSession?.core_session_status
      || null;
    const importedDiagnosticFlowSummary = bridgeImport?.diagnosticFlowSummary
      || bridgeImport?.diagnostic_flow_summary
      || bridgeSession?.diagnosticFlowSummary
      || bridgeSession?.diagnostic_flow_summary
      || null;
    const importedReadoutCompletionSummary = bridgeImport?.readoutCompletionSummary
      || bridgeImport?.readout_completion_summary
      || bridgeSession?.readoutCompletionSummary
      || bridgeSession?.readout_completion_summary
      || null;
    const importedAnalysisReadinessSummary = bridgeImport?.analysisReadinessSummary
      || bridgeImport?.analysis_readiness_summary
      || bridgeSession?.analysisReadinessSummary
      || bridgeSession?.analysis_readiness_summary
      || null;
    const importedReadoutQualitySummary = bridgeImport?.readoutQualitySummary
      || bridgeImport?.readout_quality_summary
      || bridgeSession?.readoutQualitySummary
      || bridgeSession?.readout_quality_summary
      || null;
    const importedReadoutRequestPlanGateSummary = bridgeImport?.readoutRequestPlanGateSummary
      || bridgeImport?.readout_request_plan_gate_summary
      || bridgeSession?.readoutRequestPlanGateSummary
      || bridgeSession?.readout_request_plan_gate_summary
      || null;
    const importedCoreReadoutInventorySummary = bridgeImport?.coreReadoutInventorySummary
      || bridgeImport?.core_readout_inventory_summary
      || bridgeSession?.coreReadoutInventorySummary
      || bridgeSession?.core_readout_inventory_summary
      || null;
    const firstBridgeArray = (...values) => values.find((value) => Array.isArray(value)) || [];
    const bridgeMonitorValues = firstBridgeArray(
      bridgeImport?.monitorValues,
      bridgeImport?.monitor_values,
      bridgeSession?.monitorValues,
      bridgeSession?.monitor_values
    );
    const bridgeCodes = firstBridgeArray(
      bridgeImport?.codes,
      bridgeImport?.dtcCodes,
      bridgeImport?.dtc_codes,
      bridgeSession?.codes,
      bridgeSession?.dtcCodes,
      bridgeSession?.dtc_codes
    );
    const bridgeMonitorInsightsInput = firstBridgeArray(
      bridgeImport?.monitorInsights,
      bridgeImport?.monitor_insights,
      bridgeSession?.monitorInsights,
      bridgeSession?.monitor_insights
    );
    const selectPreferredMonitorValue = (current, candidate) => {
      if (!current) return candidate;
      if (!candidate) return current;
      const score = (item) => {
        let value = 0;
        if (item.source === "local_bridge") value += 40;
        if (item.source === "scanner_text") value += 20;
        if (item.decoded === false || item.valueType === "raw_hex") value -= 25;
        if (item.valueType === "number") value += 12;
        else if (item.valueType === "text") value += 8;
        if (item.pid) value += 6;
        if (item.service) value += 4;
        if (typeof item.value === "string" && !item.value.trim()) value -= 10;
        return value;
      };
      const currentScore = score(current);
      const candidateScore = score(candidate);
      if (candidateScore !== currentScore) return candidateScore > currentScore ? candidate : current;
      return candidate.source === "local_bridge" ? candidate : current;
    };

    scannerAnalysis.monitorValues.forEach((item) => {
      const candidate = { ...item, source: "scanner_text" };
      monitorById.set(item.id, selectPreferredMonitorValue(monitorById.get(item.id), candidate));
    });
    bridgeMonitorValues.forEach((item) => {
      const candidate = { ...item, source: "local_bridge" };
      monitorById.set(item.id, selectPreferredMonitorValue(monitorById.get(item.id), candidate));
    });

    const monitorValues = [...monitorById.values()];
    const codes = [...new Set([
      ...scannerAnalysis.codes,
      ...bridgeCodes
    ])];
    const bridgeMonitorInsights = cloneBridgeArrayItems(bridgeMonitorInsightsInput);
    const bridgeMonitorValueSummary = bridgeImport?.monitorValueSummary
      || bridgeImport?.monitor_value_summary
      || bridgeSession?.monitorValueSummary
      || bridgeSession?.monitor_value_summary
      || null;
    const recalculatedMonitorValueSummary = buildMonitorValueSummary(monitorValues);
    const recalculatedMonitorInsights = analyzeMonitorValues(monitorValues);
    const monitorInsights = [...new Map([
      ...bridgeMonitorInsights.map((item) => [
        item?.id || item?.title || JSON.stringify(item),
        item
      ]),
      ...recalculatedMonitorInsights.map((item) => [
        item?.id || item?.title || JSON.stringify(item),
        item
      ])
    ]).values()];
    const monitorValueSummary = bridgeMonitorValueSummary
      ? {
        totalCount: Math.max(recalculatedMonitorValueSummary.totalCount || 0, bridgeMonitorValueSummary.totalCount || 0),
        decodedCount: Math.max(recalculatedMonitorValueSummary.decodedCount || 0, bridgeMonitorValueSummary.decodedCount || 0),
        undecodedRawCount: Math.max(recalculatedMonitorValueSummary.undecodedRawCount || 0, bridgeMonitorValueSummary.undecodedRawCount || 0),
        numericCount: Math.max(recalculatedMonitorValueSummary.numericCount || 0, bridgeMonitorValueSummary.numericCount || 0),
        textCount: Math.max(recalculatedMonitorValueSummary.textCount || 0, bridgeMonitorValueSummary.textCount || 0)
      }
      : recalculatedMonitorValueSummary;
    const hasScannerPayload = Boolean(scannerTextInput.trim() || scannerAnalysis.codes.length || scannerAnalysis.monitorValues.length || scannerAnalysis.toolHints.length);
    const source = bridgeImport
      ? hasScannerPayload
        ? "scanner_text_and_local_bridge"
        : "local_bridge"
      : "scanner_text";
    const mergedBridgeMetadata = buildMergedBridgeMetadata({ bridgeImport, bridgeSession });
    const resolvedNextReadoutCandidates = normalizeNextReadoutCandidates(
      Array.isArray(mergedBridgeMetadata.nextReadoutCandidatesInput) && mergedBridgeMetadata.nextReadoutCandidatesInput.length
        ? mergedBridgeMetadata.nextReadoutCandidatesInput
        : buildNextReadoutCandidates(
          mergedBridgeMetadata.readoutCoverageInput,
          mergedBridgeMetadata.vehicleApplicability,
          bridgeImport?.ecuInfoSnapshot || bridgeImport?.ecu_info_snapshot || bridgeSession?.ecuInfoSnapshot || bridgeSession?.ecu_info_snapshot || null,
          bridgeImport?.dtcSnapshot || bridgeImport?.dtc_snapshot || bridgeSession?.dtcSnapshot || bridgeSession?.dtc_snapshot || null,
          bridgeImport?.supportedPidMatrix || bridgeImport?.supported_pid_matrix || bridgeSession?.supportedPidMatrix || bridgeSession?.supported_pid_matrix || null
        )
    );
    const freezeFrameSnapshot = bridgeImport?.freezeFrameSnapshot || bridgeImport?.freeze_frame_snapshot || bridgeSession?.freezeFrameSnapshot || bridgeSession?.freeze_frame_snapshot || null;
    const readinessSnapshot = bridgeImport?.readinessSnapshot || bridgeImport?.readiness_snapshot || bridgeSession?.readinessSnapshot || bridgeSession?.readiness_snapshot || null;
    const ecuInfoSnapshot = bridgeImport?.ecuInfoSnapshot || bridgeImport?.ecu_info_snapshot || bridgeSession?.ecuInfoSnapshot || bridgeSession?.ecu_info_snapshot || null;
    const onboardMonitorSnapshot = bridgeImport?.onboardMonitorSnapshot || bridgeImport?.onboard_monitor_snapshot || bridgeSession?.onboardMonitorSnapshot || bridgeSession?.onboard_monitor_snapshot || null;
    const supportedPidMatrix = bridgeImport?.supportedPidMatrix || bridgeImport?.supported_pid_matrix || bridgeSession?.supportedPidMatrix || bridgeSession?.supported_pid_matrix || null;
    const coreSessionStatus = buildCoreSessionStatus({
      readoutCoverage: mergedBridgeMetadata.readoutCoverage,
      vehicleApplicability: mergedBridgeMetadata.vehicleApplicability,
      dtcSnapshot: { codes },
      freezeFrameSnapshot,
      readinessSnapshot,
      ecuInfoSnapshot,
      onboardMonitorSnapshot,
      livePidSnapshot: { monitorValues, monitorValueSummary },
      supportedPidMatrix,
      warnings: mergedBridgeMetadata.warnings,
      nextReadoutCandidates: resolvedNextReadoutCandidates
    });
    const diagnosticFlowSummary = buildDiagnosticFlowSummary(coreSessionStatus);
    const readoutCompletionSummary = coreSessionStatus.readoutCompletionSummary || null;
    const analysisReadinessSummary = coreSessionStatus.analysisReadinessSummary || null;
    const readoutQualitySummary = coreSessionStatus.readoutQualitySummary || diagnosticFlowSummary.readoutQualitySummary || null;
    const readoutRequestPlanGateSummary = coreSessionStatus.readoutRequestPlanGateSummary || analysisReadinessSummary?.readoutRequestPlanGateSummary || diagnosticFlowSummary.readoutRequestPlanGateSummary || null;
    const coreReadoutInventorySummary = buildCoreReadoutInventorySummary({
      readoutCoverage: mergedBridgeMetadata.readoutCoverage,
      dtcSnapshot: { codes },
      livePidSnapshot: { monitorValues, monitorValueSummary },
      freezeFrameSnapshot,
      readinessSnapshot,
      ecuInfoSnapshot,
      onboardMonitorSnapshot,
      supportedPidMatrix
    });
    const importedCoreComparisonSummary = buildImportedCoreComparisonSummary(importedCoreSessionStatus, coreSessionStatus);
    const importedDiagnosticFlowComparisonSummary = buildImportedDiagnosticFlowComparisonSummary(importedDiagnosticFlowSummary, diagnosticFlowSummary);
    const importedReadoutCompletionComparisonSummary = buildImportedReadoutCompletionComparisonSummary(importedReadoutCompletionSummary, readoutCompletionSummary);
    const importedAnalysisReadinessComparisonSummary = buildImportedAnalysisReadinessComparisonSummary(importedAnalysisReadinessSummary, analysisReadinessSummary);
    const importedReadoutQualityComparisonSummary = buildImportedReadoutQualityComparisonSummary(importedReadoutQualitySummary, readoutQualitySummary);
    const importedReadoutRequestPlanGateComparisonSummary = buildImportedReadoutRequestPlanGateComparisonSummary(importedReadoutRequestPlanGateSummary, readoutRequestPlanGateSummary);
    const importedCoreReadoutInventoryComparisonSummary = buildImportedCoreReadoutInventoryComparisonSummary(importedCoreReadoutInventorySummary, coreReadoutInventorySummary);
    const importedSessionComparisonSummary = buildImportedSessionComparisonSummary({
      coreComparison: importedCoreComparisonSummary,
      diagnosticFlowComparison: importedDiagnosticFlowComparisonSummary,
      readoutCompletionComparison: importedReadoutCompletionComparisonSummary,
      analysisReadinessComparison: importedAnalysisReadinessComparisonSummary,
      readoutQualityComparison: importedReadoutQualityComparisonSummary,
      readoutRequestPlanGateComparison: importedReadoutRequestPlanGateComparisonSummary,
      coreReadoutInventoryComparison: importedCoreReadoutInventoryComparisonSummary
    });
    const importedReadoutQualityReviewRequestPlanSummary = importedSessionComparisonSummary?.readoutQualityReviewRequestPlanSummary
      || bridgeImport?.importedReadoutQualityReviewRequestPlanSummary
      || bridgeImport?.imported_readout_quality_review_request_plan_summary
      || bridgeSession?.importedReadoutQualityReviewRequestPlanSummary
      || bridgeSession?.imported_readout_quality_review_request_plan_summary
      || null;
    const ecuResponseSummary = bridgeImport?.ecuResponseSummary || bridgeImport?.ecu_response_summary || bridgeSession?.ecuResponseSummary || bridgeSession?.ecu_response_summary || null;
    const vehicleProfile = bridgeImport?.vehicleProfile || bridgeImport?.vehicle_profile || bridgeSession?.vehicleProfile || bridgeSession?.vehicle_profile || null;
    const connectionStatus = bridgeImport?.connectionStatus || bridgeImport?.connection_status || bridgeSession?.connectionStatus || bridgeSession?.connection_status || null;
    const vciDevices = bridgeImport?.vciDevices || bridgeImport?.vci_devices || bridgeSession?.vciDevices || bridgeSession?.vci_devices || [];
    const adapterIdentity = bridgeImport?.adapterIdentity || bridgeImport?.adapter_identity || bridgeSession?.adapterIdentity || bridgeSession?.adapter_identity || null;
    const bridgeExportPayload = bridgeImport?.exportPayload || bridgeImport?.export_payload || (bridgeSession ? buildBridgeSessionExportPayload({ bridgeSession }) : null);

    return {
      source,
      importType: "combined_diagnostic_inputs",
      toolHints: mergeUniqueStrings(scannerAnalysis.toolHints, mergedBridgeMetadata.toolHints),
      startedAt: bridgeImport?.startedAt || bridgeImport?.started_at || bridgeSession?.startedAt || bridgeSession?.started_at || null,
      endedAt: bridgeImport?.endedAt || bridgeImport?.ended_at || bridgeSession?.endedAt || bridgeSession?.ended_at || null,
      protocol: bridgeImport?.protocol || bridgeImport?.obd_protocol || bridgeSession?.protocol || bridgeSession?.obd_protocol || null,
      obd_protocol: bridgeImport?.obd_protocol || bridgeImport?.protocol || bridgeSession?.obd_protocol || bridgeSession?.protocol || null,
      capturedAt: bridgeImport?.capturedAt || bridgeImport?.captured_at || bridgeSession?.capturedAt || bridgeSession?.captured_at || null,
      codes,
      monitorValues,
      monitorValueSummary,
      monitor_value_summary: monitorValueSummary,
      monitorInsights,
      monitor_insights: monitorInsights,
      ecuResponseSummary,
      ecu_response_summary: ecuResponseSummary,
      supportedPidMatrix,
      supported_pid_matrix: supportedPidMatrix,
      readinessSnapshot,
      readiness_snapshot: readinessSnapshot,
      ecuInfoSnapshot,
      ecu_info_snapshot: ecuInfoSnapshot,
      onboardMonitorSnapshot,
      onboard_monitor_snapshot: onboardMonitorSnapshot,
      readoutCoverage: mergedBridgeMetadata.readoutCoverage,
      readout_coverage: mergedBridgeMetadata.readoutCoverage,
      freezeFrameSnapshot,
      freeze_frame_snapshot: freezeFrameSnapshot,
      vehicleProfile,
      vehicle_profile: vehicleProfile,
      vehicleApplicability: mergedBridgeMetadata.vehicleApplicability,
      vehicle_applicability: mergedBridgeMetadata.vehicleApplicability,
      importClassification: mergedBridgeMetadata.importClassification,
      import_classification: mergedBridgeMetadata.importClassification,
      connectionStatus,
      connection_status: connectionStatus,
      vciDevices,
      vci_devices: vciDevices,
      adapterIdentity,
      adapter_identity: adapterIdentity,
      bridgeSession,
      bridge_session: bridgeSession,
      bridgeExportPayload,
      bridge_export_payload: bridgeExportPayload,
      warnings: mergedBridgeMetadata.warnings,
      nextReadoutCandidates: resolvedNextReadoutCandidates,
      next_readout_candidates: resolvedNextReadoutCandidates,
      coreSessionStatus,
      core_session_status: coreSessionStatus,
      diagnosticFlowSummary,
      diagnostic_flow_summary: diagnosticFlowSummary,
      readoutCompletionSummary,
      readout_completion_summary: readoutCompletionSummary,
      analysisReadinessSummary,
      analysis_readiness_summary: analysisReadinessSummary,
      readoutQualitySummary,
      readout_quality_summary: readoutQualitySummary,
      readoutRequestPlanGateSummary,
      readout_request_plan_gate_summary: readoutRequestPlanGateSummary,
      coreReadoutInventorySummary,
      core_readout_inventory_summary: coreReadoutInventorySummary,
      importedCoreSessionStatus,
      importedDiagnosticFlowSummary,
      importedReadoutCompletionSummary,
      importedAnalysisReadinessSummary,
      importedReadoutQualitySummary,
      imported_readout_quality_summary: importedReadoutQualitySummary,
      importedReadoutRequestPlanGateSummary,
      importedCoreReadoutInventorySummary,
      importedCoreComparisonSummary,
      importedDiagnosticFlowComparisonSummary,
      importedReadoutCompletionComparisonSummary,
      importedAnalysisReadinessComparisonSummary,
      importedReadoutQualityComparisonSummary,
      imported_readout_quality_comparison_summary: importedReadoutQualityComparisonSummary,
      importedReadoutRequestPlanGateComparisonSummary,
      importedCoreReadoutInventoryComparisonSummary,
      importedReadoutQualityReviewRequestPlanSummary,
      imported_readout_quality_review_request_plan_summary: importedReadoutQualityReviewRequestPlanSummary,
      importedSessionComparisonSummary,
      hadSensitiveIdentifier: scannerAnalysis.hadSensitiveIdentifier || mergedBridgeMetadata.hadSensitiveIdentifier,
      sourceLength: Math.max(scannerAnalysis.sourceLength || 0, mergedBridgeMetadata.sourceLength),
      retainedRawText: false,
      retained_raw_text: false,
      wouldTransmit: false,
      would_transmit: false,
      vehicleCommandEnabled: false,
      vehicle_command_enabled: false
    };
  }

  function normalizeDtcSnapshot(input = {}) {
    const sourceInput = input && typeof input === "object" && !Array.isArray(input) && input.data && typeof input.data === "object"
      ? {
        ...input.data,
        source: input.data.source || input.data.source_type || input.data.sourceType || input.source || input.source_type || input.sourceType,
        captured_at: input.data.captured_at || input.data.capturedAt || input.captured_at || input.capturedAt,
        protocol: input.data.protocol || input.data.obd_protocol || input.data.communicationProtocol || input.data.communication_protocol || input.protocol || input.obd_protocol || input.communicationProtocol || input.communication_protocol
      }
      : input;
    const source = sourceInput.source || sourceInput.source_type || sourceInput.sourceType || "diagnostic_core";
    const rawRows = [
      ...(Array.isArray(sourceInput.dtcs) ? sourceInput.dtcs : []),
      ...(Array.isArray(sourceInput.codes) ? sourceInput.codes : []),
      ...(Array.isArray(sourceInput.dtc_list) ? sourceInput.dtc_list : []),
      ...(Array.isArray(sourceInput.dtcList) ? sourceInput.dtcList : []),
      ...(Array.isArray(sourceInput.diagnosticTroubleCodes) ? sourceInput.diagnosticTroubleCodes : []),
      ...(Array.isArray(sourceInput.diagnostic_trouble_codes) ? sourceInput.diagnostic_trouble_codes : []),
      ...(Array.isArray(sourceInput.stored_dtcs) ? sourceInput.stored_dtcs.map((row) => ({ value: row, status: "stored" })) : []),
      ...(Array.isArray(sourceInput.storedDtcs) ? sourceInput.storedDtcs.map((row) => ({ value: row, status: "stored" })) : []),
      ...(Array.isArray(sourceInput.pending_dtcs) ? sourceInput.pending_dtcs.map((row) => ({ value: row, status: "pending" })) : []),
      ...(Array.isArray(sourceInput.pendingDtcs) ? sourceInput.pendingDtcs.map((row) => ({ value: row, status: "pending" })) : []),
      ...(Array.isArray(sourceInput.permanent_dtcs) ? sourceInput.permanent_dtcs.map((row) => ({ value: row, status: "permanent" })) : []),
      ...(Array.isArray(sourceInput.permanentDtcs) ? sourceInput.permanentDtcs.map((row) => ({ value: row, status: "permanent" })) : [])
    ];
    const rows = rawRows.flatMap((row) => {
      if (typeof row === "string") {
        return extractDtcCodes(row).map((code) => ({ code }));
      }
      if (!row || typeof row !== "object") return [];
      const rowValue = row.value && typeof row.value === "object" ? row.value : row;
      const rowStatus = row.status || row.kind || row.state || row.type || row.dtc_status || row.dtcStatus || sourceInput.status || "unknown";
      const codes = extractDtcCodes(rowValue.code || rowValue.dtc || rowValue.id || rowValue.value || rowValue.dtc_code || rowValue.dtcCode || "");
      return codes.map((code) => ({
        code,
        status: rowStatus,
        ecu: rowValue.ecu || rowValue.ecu_id || rowValue.ecuId || rowValue.address || rowValue.module || rowValue.module_id || rowValue.moduleId || null,
        freezeFrameAvailable: rowValue.freeze_frame_available === true || rowValue.freezeFrameAvailable === true || rowValue.freezeFrame === true || rowValue.freeze_frame === true
      }));
    });
    const byCode = new Map();
    rows.forEach((row) => {
      const key = `${row.code}::${row.status || "unknown"}`;
      if (!byCode.has(key)) byCode.set(key, { ...row, source });
    });

    return {
      schemaVersion: "dtc_snapshot_v1",
      source,
      capturedAt: sourceInput.captured_at || sourceInput.capturedAt || sourceInput.timestamp || null,
      protocol: sourceInput.protocol || sourceInput.obd_protocol || sourceInput.communicationProtocol || sourceInput.communication_protocol || null,
      codes: [...new Set([...byCode.values()].map((row) => row.code))],
      dtcs: [...byCode.values()],
      retainedRawText: false
    };
  }

  function normalizeFreezeFrameSnapshot(input = {}) {
    const sourceInput = input && typeof input === "object" && !Array.isArray(input) && input.data && typeof input.data === "object"
      ? {
        ...input.data,
        source: input.data.source || input.data.source_type || input.data.sourceType || input.source || input.source_type || input.sourceType,
        captured_at: input.data.captured_at || input.data.capturedAt || input.captured_at || input.capturedAt,
        protocol: input.data.protocol || input.data.obd_protocol || input.data.communicationProtocol || input.data.communication_protocol || input.protocol || input.obd_protocol || input.communicationProtocol || input.communication_protocol
      }
      : input;
    const source = sourceInput.source || sourceInput.source_type || sourceInput.sourceType || "diagnostic_core";
    const rows = Array.isArray(sourceInput.values)
      ? sourceInput.values
      : Array.isArray(sourceInput.freeze_frame)
        ? sourceInput.freeze_frame
        : Array.isArray(sourceInput.freezeFrame)
          ? sourceInput.freezeFrame
          : Array.isArray(sourceInput.freeze_frame_values)
            ? sourceInput.freeze_frame_values
            : Array.isArray(sourceInput.freezeFrameValues)
              ? sourceInput.freezeFrameValues
              : Array.isArray(sourceInput.freeze_frame_rows)
                ? sourceInput.freeze_frame_rows
                : Array.isArray(sourceInput.freezeFrameRows)
                  ? sourceInput.freezeFrameRows
                  : Array.isArray(sourceInput.monitorValues)
                    ? sourceInput.monitorValues
                    : Array.isArray(sourceInput.monitor_values)
                      ? sourceInput.monitor_values
                      : Array.isArray(sourceInput.items)
                        ? sourceInput.items
                        : [];
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
      sourceInput.trigger_dtc,
      sourceInput.triggerDtc,
      sourceInput.triggerCode,
      sourceInput.trigger_code,
      sourceInput.freeze_dtc,
      sourceInput.freezeDtc,
      sourceInput.dtc,
      sourceInput.dtcCode,
      sourceInput.dtc_code
    ].filter(Boolean).join(" "));

    return {
      schemaVersion: "freeze_frame_snapshot_v1",
      source,
      capturedAt: sourceInput.captured_at || sourceInput.capturedAt || sourceInput.timestamp || null,
      protocol: sourceInput.protocol || sourceInput.obd_protocol || sourceInput.communicationProtocol || sourceInput.communication_protocol || null,
      triggerDtc: triggerCodes[0] || null,
      monitorValues,
      monitorValueSummary: buildMonitorValueSummary(monitorValues),
      expectedItems,
      capturedItemCount: monitorValues.length,
      expectedItemCount: expectedItems.length,
      monitorInsights: analyzeMonitorValues(monitorValues),
      retainedRawText: false
    };
  }

  function normalizeReadinessSnapshot(input = {}) {
    const sourceInput = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const source = sourceInput.source || sourceInput.source_type || sourceInput.sourceType || "diagnostic_core";
    const monitors = Array.isArray(input)
      ? input
      : Array.isArray(sourceInput.monitors)
        ? sourceInput.monitors
        : Array.isArray(sourceInput.readinessMonitors)
          ? sourceInput.readinessMonitors
          : Array.isArray(sourceInput.readiness_monitors)
            ? sourceInput.readiness_monitors
            : Array.isArray(sourceInput.readinessValues)
              ? sourceInput.readinessValues
              : Array.isArray(sourceInput.readiness_values)
                ? sourceInput.readiness_values
                : Array.isArray(sourceInput.readinessRows)
                  ? sourceInput.readinessRows
                  : Array.isArray(sourceInput.readiness_rows)
                    ? sourceInput.readiness_rows
                    : Array.isArray(sourceInput.items)
                      ? sourceInput.items
                      : [];
    const readBooleanAlias = (value, fallback = false) => {
      if (value === true || value === 1) return true;
      if (value === false || value === 0 || value === null) return false;
      const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
      if (["true", "1", "yes", "on", "complete", "ready", "supported"].includes(normalized)) return true;
      if (["false", "0", "no", "off", "incomplete", "not_complete", "not supported", "not_supported", "unsupported"].includes(normalized)) return false;
      return fallback;
    };
    const normalized = monitors.map((monitor, index) => {
      const id = String(monitor?.id || monitor?.monitorId || monitor?.monitor_id || monitor?.name || `monitor_${index + 1}`).slice(0, 80);
      const catalogItem = readinessMonitorCatalog.find((entry) => entry.id === id);
      const statusAlias = pickDefined(monitor?.status, monitor?.readinessStatus, monitor?.readiness_status, null);
      const statusText = typeof statusAlias === "string" ? statusAlias.trim().toLowerCase() : "";
      const supportedAlias = pickDefined(monitor?.supported, monitor?.isSupported, monitor?.is_supported, monitor?.available, monitor?.isAvailable, monitor?.is_available, undefined);
      const supported = supportedAlias === undefined
        ? statusText !== "not_supported" && statusText !== "unsupported"
        : readBooleanAlias(supportedAlias, true);
      const completeAlias = pickDefined(monitor?.complete, monitor?.isComplete, monitor?.is_complete, monitor?.ready, monitor?.isReady, monitor?.is_ready, undefined);
      const complete = completeAlias === undefined
        ? ["complete", "ready", "ok"].includes(statusText)
        : readBooleanAlias(completeAlias, false);
      return {
        id,
        label: String(monitor?.label || monitor?.displayLabel || monitor?.display_label || catalogItem?.label || monitor?.name || `Monitor ${index + 1}`).slice(0, 120),
        category: catalogItem?.category || monitor?.category || "状態",
        supported,
        complete,
        status: statusAlias || (supported ? (complete ? "complete" : "not_complete") : "not_supported"),
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
      capturedAt: sourceInput.captured_at || sourceInput.capturedAt || sourceInput.timestamp || null,
      protocol: sourceInput.protocol || sourceInput.obd_protocol || sourceInput.communicationProtocol || sourceInput.communication_protocol || null,
      milOn: readBooleanAlias(pickDefined(sourceInput.mil_on, sourceInput.milOn, sourceInput.mil, sourceInput.milStatus, sourceInput.mil_status, false), false),
      monitorCount: normalized.length,
      incompleteCount: normalized.filter((item) => item.supported && !item.complete).length,
      knownMonitorCount: knownMonitors.length,
      monitors: normalized,
      knownMonitors,
      retainedRawText: false
    };
  }

  function normalizeEcuResponseSummary(input = {}) {
    const sourceInput = input && typeof input === "object" && !Array.isArray(input) && input.data && typeof input.data === "object"
      ? {
        ...input.data,
        source: input.data.source || input.data.source_type || input.data.sourceType || input.source || input.source_type || input.sourceType,
        captured_at: input.data.captured_at || input.data.capturedAt || input.data.timestamp || input.captured_at || input.capturedAt || input.timestamp,
        protocol: input.data.protocol || input.data.obd_protocol || input.data.communicationProtocol || input.data.communication_protocol || input.protocol || input.obd_protocol || input.communicationProtocol || input.communication_protocol
      }
      : input;
    const source = sourceInput.source || sourceInput.source_type || sourceInput.sourceType || "diagnostic_core";
    const rows = Array.isArray(sourceInput)
      ? input
      : Array.isArray(sourceInput.ecus)
        ? sourceInput.ecus
        : Array.isArray(sourceInput.modules)
          ? sourceInput.modules
          : Array.isArray(sourceInput.controllers)
            ? sourceInput.controllers
            : Array.isArray(sourceInput.ecu_responses)
              ? sourceInput.ecu_responses
              : Array.isArray(sourceInput.ecuResponses)
                ? sourceInput.ecuResponses
                : Array.isArray(sourceInput.ecu_response_rows)
                  ? sourceInput.ecu_response_rows
                  : Array.isArray(sourceInput.ecuResponseRows)
                    ? sourceInput.ecuResponseRows
                    : Array.isArray(sourceInput.items)
                      ? sourceInput.items
                      : [];
    return {
      schemaVersion: "ecu_response_summary_v1",
      source,
      capturedAt: sourceInput.captured_at || sourceInput.capturedAt || sourceInput.timestamp || null,
      protocol: sourceInput.protocol || sourceInput.obd_protocol || sourceInput.communicationProtocol || sourceInput.communication_protocol || null,
      ecus: rows.map((row, index) => ({
        id: String(row?.id || row?.ecu || row?.address || row?.ecu_id || row?.ecuId || row?.module_id || row?.moduleId || row?.controller_id || row?.controllerId || `ecu_${index + 1}`).slice(0, 40),
        name: row?.name ? String(row.name).slice(0, 120) : row?.label ? String(row.label).slice(0, 120) : row?.display_name ? String(row.display_name).slice(0, 120) : row?.displayName ? String(row.displayName).slice(0, 120) : null,
        address: row?.address || row?.ecu || row?.ecu_id || row?.ecuId || row?.module_id || row?.moduleId || row?.controller_id || row?.controllerId || null,
        status: row?.status || row?.response_status || row?.responseStatus || "unknown",
        dtcCount: Number.isInteger(row?.dtc_count) ? row.dtc_count : Number.isInteger(row?.dtcCount) ? row.dtcCount : Number.isInteger(row?.code_count) ? row.code_count : Number.isInteger(row?.codeCount) ? row.codeCount : Array.isArray(row?.dtcs) ? row.dtcs.length : Array.isArray(row?.codes) ? row.codes.length : Array.isArray(row?.dtc_codes) ? row.dtc_codes.length : Array.isArray(row?.dtcCodes) ? row.dtcCodes.length : null,
        responseCount: Number.isInteger(row?.response_count) ? row.response_count : Number.isInteger(row?.responseCount) ? row.responseCount : Number.isInteger(row?.responses) ? row.responses : null,
        services: Array.isArray(row?.services) ? row.services.map((item) => String(item).toUpperCase()).slice(0, 16) : Array.isArray(row?.requested_services) ? row.requested_services.map((item) => String(item).toUpperCase()).slice(0, 16) : Array.isArray(row?.requestedServices) ? row.requestedServices.map((item) => String(item).toUpperCase()).slice(0, 16) : [],
        negativeResponseCount: Number.isInteger(row?.negative_response_count) ? row.negative_response_count : Number.isInteger(row?.negativeResponseCount) ? row.negativeResponseCount : Number.isInteger(row?.negatives) ? row.negatives : 0,
        negativeRequestedServices: Array.isArray(row?.negative_requested_services) ? row.negative_requested_services.map((item) => String(item).toUpperCase()).slice(0, 16) : Array.isArray(row?.negativeRequestedServices) ? row.negativeRequestedServices.map((item) => String(item).toUpperCase()).slice(0, 16) : Array.isArray(row?.negative_services) ? row.negative_services.map((item) => String(item).toUpperCase()).slice(0, 16) : Array.isArray(row?.negativeServices) ? row.negativeServices.map((item) => String(item).toUpperCase()).slice(0, 16) : [],
        negativeResponseLabels: Array.isArray(row?.negative_response_labels) ? row.negative_response_labels.map((item) => String(item)).slice(0, 16) : Array.isArray(row?.negativeResponseLabels) ? row.negativeResponseLabels.map((item) => String(item)).slice(0, 16) : Array.isArray(row?.negative_labels) ? row.negative_labels.map((item) => String(item)).slice(0, 16) : Array.isArray(row?.negativeLabels) ? row.negativeLabels.map((item) => String(item)).slice(0, 16) : [],
        responseTimeMs: Number.isFinite(Number(row?.response_time_ms)) ? Number(row.response_time_ms) : Number.isFinite(Number(row?.responseTimeMs)) ? Number(row.responseTimeMs) : Number.isFinite(Number(row?.response_time)) ? Number(row.response_time) : Number.isFinite(Number(row?.responseTime)) ? Number(row.responseTime) : Number.isFinite(Number(row?.latency_ms)) ? Number(row.latency_ms) : Number.isFinite(Number(row?.latencyMs)) ? Number(row.latencyMs) : Number.isFinite(Number(row?.elapsed_ms)) ? Number(row.elapsed_ms) : Number.isFinite(Number(row?.elapsedMs)) ? Number(row.elapsedMs) : null
      })),
      retainedRawText: false
    };
  }

  function collectEcuInfoRows(input = {}) {
    if (Array.isArray(input)) return input;
    if (Array.isArray(input.values)) return input.values;
    if (Array.isArray(input.items)) return input.items;
    if (Array.isArray(input.ecu_info)) return input.ecu_info;
    if (Array.isArray(input.ecu_info_items)) return input.ecu_info_items;
    if (Array.isArray(input.ecu_info_rows)) return input.ecu_info_rows;
    if (Array.isArray(input.ecuInfo)) return input.ecuInfo;
    if (Array.isArray(input.ecuInfoItems)) return input.ecuInfoItems;
    if (Array.isArray(input.ecuInfoRows)) return input.ecuInfoRows;
    if (Array.isArray(input.mode09_items)) return input.mode09_items;
    if (Array.isArray(input.mode09Items)) return input.mode09Items;
    if (Array.isArray(input.mode09_values)) return input.mode09_values;
    if (Array.isArray(input.mode09Values)) return input.mode09Values;
    if (Array.isArray(input.info_values)) return input.info_values;
    if (Array.isArray(input.infoValues)) return input.infoValues;
    if (!input || typeof input !== "object") return [];
    const aliases = [
      ["supported_info_types_00", "supported_info_types_00", "00"],
      ["supported_info_types", "supported_info_types_00", "00"],
      ["supportedInfoTypes", "supported_info_types_00", "00"],
      ["supported_mode09_types", "supported_info_types_00", "00"],
      ["supportedMode09Types", "supported_info_types_00", "00"],
      ["vin", "vin", "02"],
      ["vin_value", "vin", "02"],
      ["vinValue", "vin", "02"],
      ["vin_values", "vin", "02"],
      ["vinValues", "vin", "02"],
      ["calibration_id", "calibration_id", "04"],
      ["calibrationId", "calibration_id", "04"],
      ["calid", "calibration_id", "04"],
      ["cal_id", "calibration_id", "04"],
      ["calibration_identification", "calibration_id", "04"],
      ["calibration_ids", "calibration_id", "04"],
      ["calibrationIds", "calibration_id", "04"],
      ["cal_ids", "calibration_id", "04"],
      ["calibration_verification_number", "calibration_verification_number", "06"],
      ["calibrationVerificationNumber", "calibration_verification_number", "06"],
      ["cvn", "calibration_verification_number", "06"],
      ["cvn_value", "calibration_verification_number", "06"],
      ["cvnValue", "calibration_verification_number", "06"],
      ["calibration_verification_numbers", "calibration_verification_number", "06"],
      ["calibrationVerificationNumbers", "calibration_verification_number", "06"],
      ["cvns", "calibration_verification_number", "06"],
      ["cvn_values", "calibration_verification_number", "06"],
      ["cvnValues", "calibration_verification_number", "06"],
      ["ecu_name", "ecu_name", "0A"],
      ["ecuName", "ecu_name", "0A"],
      ["module_name", "ecu_name", "0A"],
      ["moduleName", "ecu_name", "0A"],
      ["ecu_label", "ecu_name", "0A"],
      ["ecuLabel", "ecu_name", "0A"],
      ["ecu_names", "ecu_name", "0A"],
      ["ecuNames", "ecu_name", "0A"],
      ["module_names", "ecu_name", "0A"],
      ["moduleNames", "ecu_name", "0A"]
    ];
    return aliases
      .filter(([key]) => input[key] !== undefined && input[key] !== null && input[key] !== "")
      .map(([key, id, infoType]) => ({
        id,
        info_type: infoType,
        value: input[key]
      }));
  }

  function normalizeEcuInfoSnapshot(input = {}) {
    const sourceInput = input && typeof input === "object" && !Array.isArray(input) && input.data && typeof input.data === "object"
      ? {
        ...input.data,
        source: input.data.source || input.data.source_type || input.data.sourceType || input.source || input.source_type || input.sourceType,
        captured_at: input.data.captured_at || input.data.capturedAt || input.captured_at || input.capturedAt,
        protocol: input.data.protocol || input.data.obd_protocol || input.data.communicationProtocol || input.data.communication_protocol || input.protocol || input.obd_protocol || input.communicationProtocol || input.communication_protocol
      }
      : input;
    const source = sourceInput.source || sourceInput.source_type || sourceInput.sourceType || "diagnostic_core";
    const rows = collectEcuInfoRows(sourceInput);
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
    const keyItemIds = new Set(["vin", "calibration_id", "calibration_verification_number", "ecu_name"]);
    const keyItems = expectedItems.filter((item) => keyItemIds.has(item.id));
    const capturedKeyItems = keyItems.filter((item) => item.captured);
    const missingKeyItems = keyItems.filter((item) => !item.captured);
    const supportedInfoTypesCaptured = expectedItems.some((item) => item.id === "supported_info_types_00" && item.captured);
    const supportedInfoTypesItem = items.find((item) => item.id === "supported_info_types_00");
    const supportedInfoTypesSummary = decodeMode09SupportedInfoTypes(supportedInfoTypesItem?.value);

    return {
      schemaVersion: "ecu_info_snapshot_v1",
      source,
      capturedAt: sourceInput.captured_at || sourceInput.capturedAt || sourceInput.timestamp || null,
      protocol: sourceInput.protocol || sourceInput.obd_protocol || sourceInput.communicationProtocol || sourceInput.communication_protocol || null,
      itemCount: items.length,
      expectedItemCount: expectedItems.length,
      hadSensitiveIdentifier: items.some((item) => item.privacyClass === "sensitive_identifier" && item.detected === true),
      items,
      expectedItems,
      keyItemSummary: {
        totalCount: keyItems.length,
        capturedCount: capturedKeyItems.length,
        missingCount: missingKeyItems.length,
        capturedLabels: capturedKeyItems.map((item) => item.label),
        missingLabels: missingKeyItems.map((item) => item.label)
      },
      supportInfoTypesCaptured: supportedInfoTypesCaptured,
      supportInfoTypesSummary: supportedInfoTypesSummary,
      retainedRawText: false
    };
  }

  function normalizeOnboardMonitorSnapshot(input = {}) {
    const sourceInput = input && typeof input === "object" && !Array.isArray(input) && input.data && typeof input.data === "object"
      ? {
        ...input.data,
        source: input.data.source || input.data.source_type || input.data.sourceType || input.source || input.source_type || input.sourceType,
        captured_at: input.data.captured_at || input.data.capturedAt || input.captured_at || input.capturedAt,
        protocol: input.data.protocol || input.data.obd_protocol || input.data.communicationProtocol || input.data.communication_protocol || input.protocol || input.obd_protocol || input.communicationProtocol || input.communication_protocol
      }
      : input;
    const source = sourceInput.source || sourceInput.source_type || sourceInput.sourceType || "diagnostic_core";
    const rows = Array.isArray(sourceInput.tests)
      ? sourceInput.tests
      : Array.isArray(sourceInput.values)
        ? sourceInput.values
        : Array.isArray(sourceInput.mode06_tests)
          ? sourceInput.mode06_tests
          : Array.isArray(sourceInput.mode06Tests)
            ? sourceInput.mode06Tests
            : Array.isArray(sourceInput.monitor_tests)
              ? sourceInput.monitor_tests
              : Array.isArray(sourceInput.monitorTests)
                ? sourceInput.monitorTests
                : Array.isArray(sourceInput.onboard_monitor_tests)
                  ? sourceInput.onboard_monitor_tests
                  : Array.isArray(sourceInput.onboardMonitorTests)
                    ? sourceInput.onboardMonitorTests
                    : Array.isArray(sourceInput.onboard_monitor_rows)
                      ? sourceInput.onboard_monitor_rows
                      : Array.isArray(sourceInput.onboardMonitorRows)
                        ? sourceInput.onboardMonitorRows
                        : Array.isArray(sourceInput.mode06_rows)
                          ? sourceInput.mode06_rows
                          : Array.isArray(sourceInput.mode06Rows)
                            ? sourceInput.mode06Rows
                            : Array.isArray(sourceInput.test_rows)
                              ? sourceInput.test_rows
                              : Array.isArray(sourceInput.testRows)
                                ? sourceInput.testRows
                                : Array.isArray(sourceInput.items)
                                  ? sourceInput.items
                                  : [];
    const tests = rows
      .map((row, index) => {
        if (!row || typeof row !== "object") return null;
        const testId = String(row.test_id || row.testId || row.tid || row.mid || row.monitor_id || row.monitorId || row.test || row.test_code || row.testCode || row.test_id_hex || row.testIdHex || "").toUpperCase().replace(/^0X/, "").padStart(2, "0").slice(-2);
        const componentId = String(row.component_id || row.componentId || row.cid || row.component || row.component_code || row.componentCode || row.component_id_hex || row.componentIdHex || "").toUpperCase().replace(/^0X/, "").padStart(2, "0").slice(-2);
        const value = Number(row.value ?? row.measured ?? row.measured_value ?? row.measuredValue ?? row.result ?? row.test_value ?? row.testValue ?? row.current_value ?? row.currentValue ?? row.raw_value ?? row.rawValue);
        const min = Number(row.min ?? row.minimum ?? row.min_value ?? row.minValue ?? row.min_limit ?? row.minLimit);
        const max = Number(row.max ?? row.maximum ?? row.max_value ?? row.maxValue ?? row.max_limit ?? row.maxLimit);
        const hasLimits = Number.isFinite(min) && Number.isFinite(max);
        const statusText = typeof row.status === "string" ? row.status.trim().toLowerCase() : "";
        const passed = hasLimits && Number.isFinite(value) ? value >= min && value <= max : row.passed === true || row.pass === true || statusText === "pass" || statusText === "passed";
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
      capturedAt: sourceInput.captured_at || sourceInput.capturedAt || sourceInput.timestamp || null,
      protocol: sourceInput.protocol || sourceInput.obd_protocol || sourceInput.communicationProtocol || sourceInput.communication_protocol || null,
      testCount: tests.length,
      failedCount: tests.filter((test) => test.status === "fail").length,
      unknownCount: tests.filter((test) => test.status === "unknown").length,
      tests,
      retainedRawText: false
    };
  }

  function normalizeEcuInfoValue(row, index) {
    if (!row || typeof row !== "object") return null;
    const infoType = String(row.info_type || row.infoType || row.mode09_type || row.mode09Type || row.type || "").toUpperCase();
    const rowId = row.id || row.item_id || row.itemId || row.mode09_id || row.mode09Id;
    const catalogItem = ecuInfoItemCatalog.find((item) => item.id === rowId || item.infoType === infoType);
    const id = catalogItem?.id || String(rowId || `ecu_info_${index + 1}`).slice(0, 80);
    const privacyClass = catalogItem?.privacyClass || row.privacy_class || row.privacyClass || row.privacy || "unknown";
    const rawValue = row.value ?? row.info_value ?? row.infoValue ?? row.text ?? row.display_value ?? row.displayValue ?? row.data ?? row.raw_value ?? row.rawValue ?? row.decoded_value ?? row.decodedValue ?? row.decodedText ?? row.ascii ?? "";
    const value = privacyClass === "sensitive_identifier"
      ? maskSensitiveIdentifier(rawValue)
      : sanitizeEcuInfoValue(rawValue);

    if (value === null || value === "") return null;
    return {
      id,
      label: catalogItem?.label || row.label || row.displayLabel || row.display_label || id,
      service: catalogItem?.service || row.service || row.service_mode || row.serviceMode || "09",
      infoType: catalogItem?.infoType || infoType || null,
      value,
      valueType: catalogItem?.valueType || row.value_type || row.valueType || row.typeOfValue || "text",
      privacyClass,
      detected: row.detected === true || row.present === true || (rawValue !== null && rawValue !== undefined && String(rawValue).length > 0),
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

  function decodeMode09SupportedInfoTypes(value) {
    const bytes = parseObdHexBytes(value);
    if (!bytes.length) {
      return {
        count: 0,
        ids: [],
        labels: []
      };
    }
    const ids = [];
    bytes.forEach((byte, byteIndex) => {
      for (let bit = 0; bit < 8; bit += 1) {
        if ((byte & (0x80 >> bit)) === 0) continue;
        ids.push((byteIndex * 8) + bit + 1);
      }
    });
    const hexIds = ids.map((id) => id.toString(16).toUpperCase().padStart(2, "0"));
    const labels = hexIds.map((infoType) => {
      const item = ecuInfoItemCatalog.find((row) => row.infoType === infoType);
      return item ? item.label : `情報タイプ ${infoType}`;
    });
    return {
      count: hexIds.length,
      ids: hexIds,
      labels
    };
  }

  function maskSensitiveIdentifier(value) {
    if (Array.isArray(value)) {
      return value.map((item) => maskSensitiveIdentifier(item)).filter((item) => item !== null && item !== "");
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .map(([key, item]) => [key, maskSensitiveIdentifier(item)])
          .filter(([, item]) => item !== null && item !== "")
      );
    }
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
    const text = normalizeCanLogLineFormat(value)
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
        protocol: input.protocol || input.obd_protocol || null,
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
      protocol: input.protocol || input.obd_protocol || null,
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
      protocol: snapshots.find((item) => item?.protocol || item?.obd_protocol)?.protocol
        || snapshots.find((item) => item?.protocol || item?.obd_protocol)?.obd_protocol
        || null,
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
    const supportedPids = [];
    for (let index = 0; index + 5 < bytes.length; index++) {
      if (bytes[index] !== 0x41 || !Number.isInteger(bytes[index + 1])) continue;
      if (!isSupportedPidBase(bytes[index + 1])) continue;
      const basePid = bytes[index + 1];
      const bitBytes = bytes.slice(index + 2, index + 6);
      bitBytes.forEach((byte, byteIndex) => {
        for (let bit = 7; bit >= 0; bit--) {
          if (byte & (1 << bit)) {
            supportedPids.push((basePid + byteIndex * 8 + (8 - bit)).toString(16).toUpperCase().padStart(2, "0"));
          }
        }
      });
      index += 5;
    }
    if (!supportedPids.length) {
      return buildSupportedPidMatrix({ source: input.source || "obd_response_decoder", supportedPids: [] });
    }
    return buildSupportedPidMatrix({
      source: input.source || "obd_response_decoder",
      captured_at: input.captured_at || input.capturedAt || null,
      supported_pids: [...new Set(supportedPids)]
    });
  }

  function isSupportedPidBase(pid) {
    return [0x00, 0x20, 0x40, 0x60, 0x80, 0xA0, 0xC0, 0xE0].includes(pid);
  }

  function decodeLivePidResponse(input = {}) {
    const bytes = parseObdHexBytes(input.bytes || input.raw || input.response || input);
    const values = [];
    for (let index = 0; index < bytes.length - 2; index++) {
      if (bytes[index] !== 0x41) continue;
      const pid = bytes[index + 1].toString(16).toUpperCase().padStart(2, "0");
      const payloadLength = getStandardPidPayloadLength(pid);
      const payload = getResponsePayload(bytes, index + 2, payloadLength, 0x41);
      const decoded = decodeStandardPidValue(pid, payload);
      if (Array.isArray(decoded)) values.push(...decoded);
      else if (decoded) values.push(decoded);
      index += 1 + payload.length;
    }
    return normalizeBridgeLivePidSnapshot({
      ok: true,
      blocked: false,
      would_transmit: false,
      data: {
        protocol: input.protocol || input.obd_protocol || null,
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
      const payloadLength = getStandardPidPayloadLength(pid);
      const payload = getResponsePayload(bytes, index + 3, payloadLength, 0x42);
      if (pid === "02" && Number.isInteger(payload[0]) && Number.isInteger(payload[1])) {
        const decoded = decodeDtcPair(payload[0], payload[1]);
        if (decoded !== "P0000") triggerDtc = decoded;
        index += 2 + payload.length;
        continue;
      }
      const decoded = decodeStandardPidValue(pid, payload);
      if (Array.isArray(decoded)) values.push(...decoded.map((item) => ({ ...item, freeze_frame_number: frameNumber })));
      else if (decoded) values.push({ ...decoded, freeze_frame_number: frameNumber });
      index += 2 + payload.length;
    }

    return normalizeFreezeFrameSnapshot({
      source: input.source || "obd_response_decoder",
      captured_at: input.captured_at || input.capturedAt || null,
      protocol: input.protocol || input.obd_protocol || null,
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
      protocol: input.protocol || input.obd_protocol || null,
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
      protocol: input.protocol || input.obd_protocol || null,
      tests
    });
  }

  function buildDecodedObdScanSession(input = {}) {
    const sessionInput = getDiagnosticSessionInput(input);
    const metadataOverrides = getSessionMetadataOverrides(sessionInput);
    const sessionProtocol = sessionInput.protocol || sessionInput.obd_protocol || null;
    const withSessionProtocol = (value) => {
      if (!sessionProtocol || !value || typeof value !== "object" || Array.isArray(value)) return value;
      if (value.protocol || value.obd_protocol || value.protocol_name || value.protocolName) return value;
      return { ...value, protocol: sessionProtocol };
    };
    const dtcSnapshotInput = sessionInput.dtcSnapshot || sessionInput.dtc_snapshot;
    const livePidSnapshotInput = sessionInput.livePidSnapshot || sessionInput.live_pid_snapshot;
    const freezeFrameSnapshotInput = sessionInput.freezeFrameSnapshot || sessionInput.freeze_frame_snapshot;
    const readinessSnapshotInput = sessionInput.readinessSnapshot || sessionInput.readiness_snapshot;
    const onboardMonitorSnapshotInput = sessionInput.onboardMonitorSnapshot || sessionInput.onboard_monitor_snapshot;
    const ecuInfoSnapshotInput = sessionInput.ecuInfoSnapshot || sessionInput.ecu_info_snapshot || sessionInput.ecuInfo || sessionInput.ecu_info || sessionInput.ecuInfoItems || sessionInput.ecu_info_items;
    const supportedPidMatrixInput = sessionInput.supportedPidMatrix || sessionInput.supported_pid_matrix;
    const dtcSnapshot = dtcSnapshotInput?.schemaVersion || dtcSnapshotInput?.codes
      ? dtcSnapshotInput
      : sessionInput.storedDtcResponse || sessionInput.stored_dtc_response || sessionInput.pendingDtcResponse || sessionInput.pending_dtc_response || sessionInput.permanentDtcResponse || sessionInput.permanent_dtc_response
        ? mergeDtcSnapshots(
            sessionInput.storedDtcResponse?.schemaVersion || sessionInput.stored_dtc_response?.schemaVersion ? (sessionInput.storedDtcResponse || sessionInput.stored_dtc_response) : decodeObdDtcResponse(withSessionProtocol(sessionInput.storedDtcResponse || sessionInput.stored_dtc_response || {})),
            sessionInput.pendingDtcResponse?.schemaVersion || sessionInput.pending_dtc_response?.schemaVersion ? (sessionInput.pendingDtcResponse || sessionInput.pending_dtc_response) : decodeObdDtcResponse(withSessionProtocol(sessionInput.pendingDtcResponse || sessionInput.pending_dtc_response || {})),
            sessionInput.permanentDtcResponse?.schemaVersion || sessionInput.permanent_dtc_response?.schemaVersion ? (sessionInput.permanentDtcResponse || sessionInput.permanent_dtc_response) : decodeObdDtcResponse(withSessionProtocol(sessionInput.permanentDtcResponse || sessionInput.permanent_dtc_response || {}))
          )
        : sessionInput.dtcResponse?.schemaVersion ? sessionInput.dtcResponse : decodeObdDtcResponse(withSessionProtocol(sessionInput.dtcResponse || sessionInput.dtc_response || {}));
    const livePidResponseInput = withSessionProtocol(sessionInput.livePidResponse || sessionInput.live_pid_response || {});
    const freezeFrameResponseInput = withSessionProtocol(sessionInput.freezeFrameResponse || sessionInput.freeze_frame_response || {});
    const readinessResponseInput = withSessionProtocol(sessionInput.readinessResponse || sessionInput.readiness_response || {});
    const onboardMonitorResponseInput = withSessionProtocol(sessionInput.onboardMonitorResponse || sessionInput.onboard_monitor_response || {});
    const ecuInfoResponseInput = withSessionProtocol(sessionInput.ecuInfoResponse || sessionInput.ecu_info_response || {});
    const supportedPidResponseInput = withSessionProtocol(sessionInput.supportedPidResponse || sessionInput.supported_pid_response || {});
    const livePidSnapshot = livePidSnapshotInput?.monitorValues
      ? livePidSnapshotInput
      : livePidResponseInput?.monitorValues
        ? livePidResponseInput
        : decodeLivePidResponse(livePidResponseInput);
    const freezeFrameSnapshot = freezeFrameSnapshotInput?.schemaVersion
      ? freezeFrameSnapshotInput
      : freezeFrameResponseInput?.schemaVersion
        ? freezeFrameResponseInput
        : decodeFreezeFrameResponse(freezeFrameResponseInput);
    const readinessSnapshot = readinessSnapshotInput?.schemaVersion
      ? readinessSnapshotInput
      : readinessResponseInput?.schemaVersion
        ? readinessResponseInput
        : decodeReadinessResponse(readinessResponseInput);
    const onboardMonitorSnapshot = onboardMonitorSnapshotInput?.schemaVersion
      ? onboardMonitorSnapshotInput
      : onboardMonitorResponseInput?.schemaVersion
        ? onboardMonitorResponseInput
        : decodeOnboardMonitorResponse(onboardMonitorResponseInput);
    const ecuInfoSnapshot = ecuInfoSnapshotInput?.schemaVersion
      ? ecuInfoSnapshotInput
      : (Array.isArray(ecuInfoSnapshotInput) || hasObjectContent(ecuInfoSnapshotInput))
        ? normalizeEcuInfoSnapshot(ecuInfoSnapshotInput)
        : ecuInfoResponseInput?.schemaVersion
          ? ecuInfoResponseInput
          : decodeEcuInfoResponse(ecuInfoResponseInput);
    const supportedPidMatrix = supportedPidMatrixInput?.schemaVersion
      ? supportedPidMatrixInput
      : supportedPidResponseInput?.schemaVersion
        ? supportedPidResponseInput
        : decodeSupportedPidResponse(supportedPidResponseInput);
    return buildDiagnosticScanSession({
      source: "obd_response_decoder",
      session_id: sessionInput.session_id || sessionInput.sessionId || "decoded_obd_scan_session",
      started_at: sessionInput.started_at || sessionInput.startedAt || null,
      ended_at: sessionInput.ended_at || sessionInput.endedAt || null,
      captured_at: sessionInput.captured_at || sessionInput.capturedAt || null,
      ...metadataOverrides,
      dtcSnapshot,
      livePidSnapshot,
      freezeFrameSnapshot,
      readinessSnapshot,
      onboardMonitorSnapshot,
      ecuInfoSnapshot,
      supportedPidMatrix,
      ecus: sessionInput.ecus || sessionInput.ecu_responses || []
    });
  }

  function normalizeObdLogLine(line) {
    return normalizeCanLogLineFormat(line)
      .replace(/\b(?:SEARCHING|BUS INIT|OK|NO DATA|STOPPED|ERROR|UNABLE TO CONNECT)\b/gi, " ")
      .replace(/^[>\s]+/, "")
      .trim();
  }

  function normalizeCanLogLineFormat(line) {
    let text = String(line || "").trim();
    if (!text) return "";
    text = text.replace(/^\(\s*[0-9]+(?:\.[0-9]+)?\s*\)\s+/, "");

    text = text.replace(/\b([0-9A-F]{3}|[0-9A-F]{8})#([0-9A-F]{2,128})\b/gi, (_match, id, data) => {
      const bytes = data.match(/[0-9A-F]{2}/gi) || [];
      return [id.toUpperCase(), ...bytes.map((byte) => byte.toUpperCase())].join(" ");
    });

    text = text.replace(/\b([0-9A-F]{3}|[0-9A-F]{8})\s+\[(\d{1,2})\]\s+((?:[0-9A-F]{2}[\s,]*){1,64})/gi, (_match, id, length, data) => {
      const lengthByte = Math.max(0, Math.min(255, parseInt(length, 10) || 0)).toString(16).toUpperCase().padStart(2, "0");
      const bytes = data.match(/[0-9A-F]{2}/gi) || [];
      return [id.toUpperCase(), lengthByte, ...bytes.map((byte) => byte.toUpperCase())].join(" ");
    });

    const csvNormalized = normalizeCanCsvLogLine(text);
    if (csvNormalized) return csvNormalized;

    return text;
  }

  function normalizeCanCsvLogLine(line) {
    const text = String(line || "");
    if (!/[,;\t]/.test(text)) return "";
    const parts = text.split(/[,;\t]/).map((part) => part.trim()).filter(Boolean);
    const idIndex = parts.findIndex((part) => /^[0-9A-F]{3}$|^[0-9A-F]{8}$/i.test(part));
    if (idIndex < 0) return "";

    let byteStart = parts.length;
    while (byteStart > idIndex + 1 && /^[0-9A-F]{2}$/i.test(parts[byteStart - 1])) {
      byteStart -= 1;
    }
    const bytes = parts.slice(byteStart).filter((part) => /^[0-9A-F]{2}$/i.test(part));
    if (!bytes.length) return "";

    const lengthPart = parts[byteStart - 1] || "";
    const parsedLength = /^\d{1,3}$/.test(lengthPart) ? parseInt(lengthPart, 10) : bytes.length;
    const lengthByte = Math.max(0, Math.min(255, parsedLength)).toString(16).toUpperCase().padStart(2, "0");
    return [parts[idIndex].toUpperCase(), lengthByte, ...bytes.map((byte) => byte.toUpperCase())].join(" ");
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
      negativeResponses: [],
      unknownResponses: []
    };

    buildObdLogPackets(redacted).forEach((packetInput) => {
      const bytes = packetInput.bytes;
      const responseServices = [0x41, 0x42, 0x43, 0x46, 0x47, 0x49, 0x4A, 0x7F];
      const serviceIndex = bytes.findIndex((byte) => responseServices.includes(byte));
      const serviceByte = serviceIndex >= 0 ? bytes[serviceIndex] : null;
      const hasPair = (first, second) => bytes.some((byte, index) => byte === first && bytes[index + 1] === second);
      const metadata = {
        ...packetInput.metadata,
        service: Number.isInteger(serviceByte) ? serviceByte.toString(16).toUpperCase().padStart(2, "0") : packetInput.metadata?.service || null,
        serviceIndex: Number.isInteger(serviceIndex) && serviceIndex >= 0 ? serviceIndex : packetInput.metadata?.serviceIndex || null
      };
      const packet = {
        bytes,
        response: bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" "),
        ...metadata
      };

      if (serviceByte === 0x7F) {
        buckets.negativeResponses.push({ ...packet, negativeResponse: decodeNegativeObdResponse(bytes, serviceIndex) });
      } else if (serviceByte === 0x43) {
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
    const ecuResponses = buildEcuResponsesFromResponseBuckets(buckets);
    const isoTpSummary = buildIsoTpSummary(buckets);
    const negativeResponseSummary = buildNegativeResponseSummary(buckets.negativeResponses);
    return {
      schemaVersion: "obd_response_line_classification_v1",
      bucketCounts,
      isoTpSummary,
      negativeResponseSummary,
      ecuResponseCount: ecuResponses.length,
      ecuResponses,
      responseBuckets: buckets,
      lineCount: raw ? raw.split(/\r?\n/).length : 0,
      hadSensitiveIdentifier: raw !== redacted,
      sourceLength: raw.length,
      retainedRawText: false,
      wouldTransmit: false,
      vehicleCommandEnabled: false
    };
  }

  function buildObdLogPackets(text) {
    const packets = [];
    const pendingIsoTp = new Map();

    String(text || "").split(/\r?\n/).forEach((line) => {
      const normalized = normalizeObdLogLine(line);
      if (!normalized) return;
      const bytes = parseObdHexBytes(normalized);
      if (!bytes.length) return;
      const metadata = extractObdFrameMetadata(normalized, null, null);
      const pci = bytes[0];
      const isFirstFrame = metadata.ecu && Number.isInteger(pci) && (pci & 0xF0) === 0x10 && Number.isInteger(bytes[1]);
      const isConsecutiveFrame = metadata.ecu && Number.isInteger(pci) && (pci & 0xF0) === 0x20;

      if (isFirstFrame) {
        const expectedLength = ((pci & 0x0F) * 0x100) + bytes[1];
        const payload = bytes.slice(2);
        pendingIsoTp.set(metadata.ecu, {
          metadata: { ...metadata, isoTp: true, expectedLength, frameCount: 1, nextSequenceNumber: 1, sequenceError: false },
          payload,
          expectedLength
        });
        if (payload.length >= expectedLength) {
          const completed = pendingIsoTp.get(metadata.ecu);
          pendingIsoTp.delete(metadata.ecu);
          packets.push({ bytes: completed.payload.slice(0, expectedLength), metadata: finalizeIsoTpMetadata(completed.metadata) });
        }
        return;
      }

      if (isConsecutiveFrame && pendingIsoTp.has(metadata.ecu)) {
        const current = pendingIsoTp.get(metadata.ecu);
        const sequenceNumber = pci & 0x0F;
        if (sequenceNumber !== current.metadata.nextSequenceNumber) current.metadata.sequenceError = true;
        current.metadata.nextSequenceNumber = (sequenceNumber + 1) & 0x0F;
        current.payload.push(...bytes.slice(1));
        current.metadata.frameCount += 1;
        if (current.payload.length >= current.expectedLength) {
          pendingIsoTp.delete(metadata.ecu);
          packets.push({ bytes: current.payload.slice(0, current.expectedLength), metadata: finalizeIsoTpMetadata(current.metadata) });
        }
        return;
      }

      packets.push({ bytes, metadata });
    });

    pendingIsoTp.forEach((current) => {
      packets.push({ bytes: current.payload.slice(0, current.expectedLength), metadata: finalizeIsoTpMetadata({ ...current.metadata, incomplete: true }) });
    });

    return packets;
  }

  function buildIsoTpSummary(responseBuckets) {
    const packets = Object.values(responseBuckets || {}).flat();
    const isoTpPackets = packets.filter((packet) => packet?.isoTp === true);
    return {
      totalCount: isoTpPackets.length,
      incompleteCount: isoTpPackets.filter((packet) => packet.incomplete === true).length,
      sequenceErrorCount: isoTpPackets.filter((packet) => packet.sequenceError === true).length,
      affectedEcus: [...new Set(isoTpPackets.filter((packet) => packet.incomplete === true || packet.sequenceError === true).map((packet) => packet.ecu).filter(Boolean))]
    };
  }

  function buildNegativeResponseSummary(negativeResponses = []) {
    const rows = Array.isArray(negativeResponses) ? negativeResponses : [];
    const responseCodes = [...new Set(rows.map((packet) => packet?.negativeResponse?.responseCode).filter(Boolean))];
    const requestedServices = [...new Set(rows.map((packet) => packet?.negativeResponse?.requestedService).filter(Boolean))];
    return {
      totalCount: rows.length,
      requestedServices,
      responseCodes,
      responseLabels: [...new Set(rows.map((packet) => packet?.negativeResponse?.responseLabel).filter(Boolean))]
    };
  }

  function decodeNegativeObdResponse(bytes, serviceIndex) {
    const requestedService = bytes[serviceIndex + 1];
    const responseCode = bytes[serviceIndex + 2];
    return {
      requestedService: Number.isInteger(requestedService) ? requestedService.toString(16).toUpperCase().padStart(2, "0") : null,
      responseCode: Number.isInteger(responseCode) ? responseCode.toString(16).toUpperCase().padStart(2, "0") : null,
      responseLabel: decodeNegativeResponseCode(responseCode)
    };
  }

  function decodeNegativeResponseCode(responseCode) {
    const labels = {
      0x10: "general_reject",
      0x11: "service_not_supported",
      0x12: "subfunction_not_supported",
      0x13: "incorrect_message_length_or_format",
      0x21: "busy_repeat_request",
      0x22: "conditions_not_correct",
      0x31: "request_out_of_range",
      0x33: "security_access_denied",
      0x78: "response_pending"
    };
    return labels[responseCode] || "unknown_negative_response";
  }

  function finalizeIsoTpMetadata(metadata) {
    const { nextSequenceNumber, ...publicMetadata } = metadata || {};
    return publicMetadata;
  }

  function extractObdFrameMetadata(line, serviceByte, serviceIndex) {
    const tokens = String(line || "").toUpperCase().match(/\b[0-9A-F]{2,8}\b/g) || [];
    const first = tokens[0] || "";
    const second = tokens[1] || "";
    const hasCanId = /^[0-9A-F]{3}$/.test(first) || /^[0-9A-F]{8}$/.test(first);
    const frameLength = hasCanId && /^[0-9A-F]{2}$/.test(second) ? parseInt(second, 16) : null;
    return {
      ecu: hasCanId ? first : null,
      address: hasCanId ? first : null,
      frameLength,
      service: Number.isInteger(serviceByte) ? serviceByte.toString(16).toUpperCase().padStart(2, "0") : null,
      serviceIndex: Number.isInteger(serviceIndex) && serviceIndex >= 0 ? serviceIndex : null
    };
  }

  function buildEcuResponsesFromClassifiedObd(classified) {
    return buildEcuResponsesFromResponseBuckets(classified?.responseBuckets || {});
  }

  function buildEcuResponsesFromResponseBuckets(responseBuckets) {
    const packets = Object.values(responseBuckets || {}).flat().filter((row) => row?.ecu);
    const byEcu = new Map();
    packets.forEach((packet) => {
      const current = byEcu.get(packet.ecu) || {
        ecu: packet.ecu,
        address: packet.address || packet.ecu,
        status: "ok",
        response_count: 0,
        services: new Set(),
        negative_response_count: 0,
        negative_requested_services: new Set(),
        negative_response_labels: new Set()
      };
      current.response_count += 1;
      if (packet.service) current.services.add(packet.service);
      if (packet.negativeResponse) {
        current.negative_response_count += 1;
        if (packet.negativeResponse.requestedService) current.negative_requested_services.add(packet.negativeResponse.requestedService);
        if (packet.negativeResponse.responseLabel) current.negative_response_labels.add(packet.negativeResponse.responseLabel);
      }
      byEcu.set(packet.ecu, current);
    });
    return [...byEcu.values()].map((row) => ({
      ecu: row.ecu,
      address: row.address,
      status: row.status,
      response_count: row.response_count,
      services: [...row.services],
      negative_response_count: row.negative_response_count,
      negative_requested_services: [...row.negative_requested_services],
      negative_response_labels: [...row.negative_response_labels]
    }));
  }

  function buildScanSessionFromObdText(value, options = {}) {
    const sessionInput = getDiagnosticSessionInput(options);
    const metadataOverrides = getSessionMetadataOverrides(sessionInput);
    const classified = classifyObdResponseLines(value);
    const toolHints = detectScannerToolHints(value);
    const textDtcSnapshot = extractTextDtcSnapshot(value);
    const explicitImportClassification = sessionInput.importClassification || sessionInput.import_classification || null;
    const firstOrEmpty = (bucketName) => classified.responseBuckets[bucketName]?.map((row) => row.response).join(" ") || "";
    const ecuResponses = buildEcuResponsesFromClassifiedObd(classified);
    const session = buildDecodedObdScanSession({
      session_id: sessionInput.session_id || sessionInput.sessionId || "obd_text_scan_session",
      started_at: sessionInput.started_at || sessionInput.startedAt || null,
      ended_at: sessionInput.ended_at || sessionInput.endedAt || null,
      captured_at: sessionInput.captured_at || sessionInput.capturedAt || null,
      vehicleProfile: metadataOverrides.vehicleProfile,
      vehicleApplicability: metadataOverrides.vehicleApplicability,
      readoutCoverage: metadataOverrides.readoutCoverage,
      nextReadoutCandidates: metadataOverrides.nextReadoutCandidates,
      dtcSnapshot: sessionInput.dtcSnapshot || sessionInput.dtc_snapshot || null,
      livePidSnapshot: sessionInput.livePidSnapshot || sessionInput.live_pid_snapshot || null,
      freezeFrameSnapshot: sessionInput.freezeFrameSnapshot || sessionInput.freeze_frame_snapshot || null,
      readinessSnapshot: sessionInput.readinessSnapshot || sessionInput.readiness_snapshot || null,
      onboardMonitorSnapshot: sessionInput.onboardMonitorSnapshot || sessionInput.onboard_monitor_snapshot || null,
      ecuInfoSnapshot: sessionInput.ecuInfoSnapshot || sessionInput.ecu_info_snapshot || sessionInput.ecuInfo || sessionInput.ecu_info || sessionInput.ecuInfoItems || sessionInput.ecu_info_items || null,
      supportedPidMatrix: sessionInput.supportedPidMatrix || sessionInput.supported_pid_matrix || null,
      toolHints: metadataOverrides.toolHints,
      warnings: metadataOverrides.warnings,
      sourceLength: metadataOverrides.sourceLength,
      hadSensitiveIdentifier: metadataOverrides.hadSensitiveIdentifier,
      storedDtcResponse: { raw: firstOrEmpty("storedDtcResponses"), protocol: sessionInput.protocol || sessionInput.obd_protocol || null },
      pendingDtcResponse: { raw: firstOrEmpty("pendingDtcResponses"), protocol: sessionInput.protocol || sessionInput.obd_protocol || null },
      permanentDtcResponse: { raw: firstOrEmpty("permanentDtcResponses"), protocol: sessionInput.protocol || sessionInput.obd_protocol || null },
      supportedPidResponse: { raw: firstOrEmpty("supportedPidResponses"), protocol: sessionInput.protocol || sessionInput.obd_protocol || null },
      livePidResponse: { raw: firstOrEmpty("livePidResponses"), protocol: sessionInput.protocol || sessionInput.obd_protocol || null },
      freezeFrameResponse: { raw: firstOrEmpty("freezeFrameResponses"), protocol: sessionInput.protocol || sessionInput.obd_protocol || null },
      readinessResponse: { raw: firstOrEmpty("readinessResponses"), protocol: sessionInput.protocol || sessionInput.obd_protocol || null },
      onboardMonitorResponse: { raw: firstOrEmpty("onboardMonitorResponses"), protocol: sessionInput.protocol || sessionInput.obd_protocol || null },
      ecuInfoResponse: { raw: firstOrEmpty("ecuInfoResponses"), protocol: sessionInput.protocol || sessionInput.obd_protocol || null },
      ecus: ecuResponses
    });
    const mergedDtcSnapshot = mergeDtcSnapshots(session.dtcSnapshot, textDtcSnapshot);
    const textImportMetadata = buildTextImportMetadata({
      session,
      classified,
      explicitImportClassification,
      detectedToolHints: toolHints
    });

    return {
      ...session,
      dtcSnapshot: mergedDtcSnapshot.codes.length ? mergedDtcSnapshot : session.dtcSnapshot,
      source: "obd_text_import",
      toolHints: textImportMetadata.toolHints,
      importClassification: textImportMetadata.importClassification,
      warnings: textImportMetadata.warnings,
      hadSensitiveIdentifier: textImportMetadata.hadSensitiveIdentifier,
      sourceLength: textImportMetadata.sourceLength,
      retainedRawText: false,
      retainedRawFrames: false,
      wouldTransmit: false,
      vehicleCommandEnabled: false
    };
  }

  function mergeUniqueStrings(...groups) {
    return [...new Set(groups.flatMap((group) => Array.isArray(group) ? group : []).filter(Boolean))];
  }

  function extractTextDtcSnapshot(value) {
    const lines = String(value || "").split(/\r?\n/);
    const rows = [];
    let currentStatus = "stored";
    lines.forEach((line) => {
      const text = String(line || "").trim();
      if (!text) return;
      const normalized = text.toLowerCase();
      if (/\bpending\b/.test(normalized)) currentStatus = "pending";
      else if (/\bpermanent\b/.test(normalized)) currentStatus = "permanent";
      else if (/\bcurrent\b|\bstored\b|\bconfirmed\b|\bhistory\b|\bdtc(?:s)?\b|\bcodes?\b/.test(normalized)) currentStatus = "stored";
      const codes = extractDtcCodes(text);
      if (!codes.length) return;
      codes.forEach((code) => rows.push({ code, status: currentStatus }));
    });
    return normalizeDtcSnapshot({
      source: "obd_text_status_headings",
      dtcs: rows
    });
  }

  function detectScannerToolHints(value) {
    const text = String(value || "");
    if (!text) return [];
    const hints = [];
    const add = (label, pattern) => {
      if (pattern.test(text) && !hints.includes(label)) hints.push(label);
    };
    add("Techstream", /\btechstream\b|\bgts\b|\bglobal techstream\b|\bintelligent tester\b/i);
    add("J2534", /\bj2534\b|\bpass[\s-]?thru\b/i);
    add("CONSULT", /\bconsult(?:-?iii)?\b/i);
    add("HDS", /\bhds\b|\bhonda diagnostic system\b/i);
    add("IDS", /\bids\b|\bintegrated diagnostic system\b/i);
    add("THINKCAR", /\bthinkcar\b/i);
    add("ELM327", /\belm[\s-]?327\b|\bstn11\d*\b|\bstn21\d*\b/i);
    add("SavvyCAN", /\bsavvycan\b/i);
    add("CANable", /\bcanable\b/i);
    return hints;
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
    const doubleWord = () => [a, b, c, d].every(Number.isInteger)
      ? (a * 0x1000000) + (b * 0x10000) + (c * 0x100) + d
      : null;
    const signedWord = () => {
      const raw = word();
      return raw === null ? null : raw > 0x7FFF ? raw - 0x10000 : raw;
    };
    let value = null;
    if (["14", "15", "16", "17", "18", "19", "1A", "1B"].includes(pid)) return decodeOxygenSensorPid(pid, a, b);
    if (["24", "25", "26", "27", "28", "29", "2A", "2B"].includes(pid)) return decodeWideOxygenVoltagePid(pid, a, b, c, d);
    if (["34", "35", "38", "39"].includes(pid)) return decodeWideOxygenCurrentPid(pid, a, b, c, d);
    if (pid === "01") return decodeMonitorStatusPid(pid, a, b);
    else if (pid === "03") return decodeFuelSystemStatusPid(pid, a, b);
    else if (pid === "12") value = decodeSecondaryAirStatus(a);
    else if (pid === "13") value = decodeOxygenSensorLocations(a, false);
    else if (pid === "1D") value = decodeOxygenSensorLocations(a, true);
    else if (pid === "1E") value = decodeAuxiliaryInputStatus(a);
    else if (pid === "1C") value = decodeObdStandard(a);
    else if (pid === "51") value = decodeFuelType(a);
    else if ([
      "04", "11", "2C", "2E", "2F", "45", "47", "48", "49", "4A", "4B", "4C", "52", "5A", "5B", "6A", "6C", "A5"
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
    else if (pid === "44") value = word() === null ? null : word() / 32768;
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
    else if (pid === "69") return decodeCommandedEgrAndError(pid, a, b);
    else if (pid === "84") value = a - 40;
    else if (pid === "8C") value = a * 100 / 255;
    else if (pid === "A6") value = doubleWord() === null ? null : doubleWord() / 10;
    else if (definition.valueType === "text") value = formatRawPidBytes(dataBytes);
    else if (definition.valueType === "number") return buildUndecodedPidValue(definition, pid, dataBytes);
    if (value === null || (typeof value === "number" && !Number.isFinite(value))) return null;
    return {
      id: definition.id,
      pid,
      value: typeof value === "number" ? Number(value.toFixed(3)) : value,
      unit: definition.unit
    };
  }

  function buildUndecodedPidValue(definition, pid, dataBytes) {
    const rawHex = formatRawPidBytes(dataBytes);
    if (!rawHex) return null;
    return {
      id: definition.id,
      pid,
      value: rawHex,
      unit: definition.unit || "",
      decoded: false,
      note: "未換算RAW値"
    };
  }

  function formatRawPidBytes(dataBytes) {
    return dataBytes
      .filter(Number.isInteger)
      .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
      .join(" ");
  }

  function getStandardPidPayloadLength(pid) {
    const oneBytePids = [
      "04", "05", "06", "07", "08", "09", "0A", "0B", "0D", "0E", "0F", "11", "12", "13", "1C", "1D", "1E",
      "2C", "2D", "2E", "2F", "30", "33", "45", "46", "47", "48", "49", "4A", "4B", "4C", "51", "52", "5A",
      "5B", "5C", "61", "62", "6A", "6C", "84", "8C", "8E", "A5"
    ];
    const twoBytePids = [
      "02", "03", "0C", "10", "14", "15", "16", "17", "18", "19", "1A", "1B", "1F", "21", "22", "23",
      "31", "32", "3C", "3D", "3E", "3F", "42", "43", "44", "4D", "4E", "5D", "5E", "63", "69"
    ];
    const fourBytePids = ["01", "24", "25", "26", "27", "28", "29", "2A", "2B", "34", "35", "38", "39", "A6"];
    if (oneBytePids.includes(pid)) return 1;
    if (twoBytePids.includes(pid)) return 2;
    if (fourBytePids.includes(pid)) return 4;
    if (pid === "64") return 5;
    return 0;
  }

  function getResponsePayload(bytes, payloadStart, payloadLength, responseHeader) {
    if (payloadLength > 0) return bytes.slice(payloadStart, payloadStart + payloadLength);
    const nextHeader = bytes.findIndex((byte, nextIndex) => nextIndex > payloadStart && byte === responseHeader);
    const payloadEnd = nextHeader > payloadStart ? nextHeader : bytes.length;
    return bytes.slice(payloadStart, payloadEnd);
  }

  function decodeMonitorStatusPid(pid, a, b) {
    const summaryDefinition = monitorDefinitions.find((item) => item.service === "01" && item.pid === pid && item.id === "monitor_status");
    const milDefinition = monitorDefinitions.find((item) => item.service === "01" && item.pid === pid && item.id === "monitor_status_mil");
    const countDefinition = monitorDefinitions.find((item) => item.service === "01" && item.pid === pid && item.id === "monitor_status_dtc_count");
    const ignitionDefinition = monitorDefinitions.find((item) => item.service === "01" && item.pid === pid && item.id === "monitor_status_ignition_type");
    const dtcCount = a & 0x7F;
    const mil = (a & 0x80) !== 0 ? "mil_on" : "mil_off";
    const ignition = Number.isInteger(b) && (b & 0x08) !== 0 ? "compression" : "spark";
    const values = [];
    if (summaryDefinition) values.push({ id: summaryDefinition.id, pid, value: `${mil};dtc_count=${dtcCount};ignition=${ignition}`, unit: summaryDefinition.unit });
    if (milDefinition) values.push({ id: milDefinition.id, pid, value: mil, unit: milDefinition.unit });
    if (countDefinition) values.push({ id: countDefinition.id, pid, value: dtcCount, unit: countDefinition.unit });
    if (ignitionDefinition) values.push({ id: ignitionDefinition.id, pid, value: ignition, unit: ignitionDefinition.unit });
    return values.length ? values : null;
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

  function decodeWideOxygenVoltagePid(pid, a, b, c, d) {
    if (!Number.isInteger(b) || !Number.isInteger(c) || !Number.isInteger(d)) return null;
    const ratioDefinition = monitorDefinitions.find((item) => item.service === "01" && item.pid === pid && item.id.endsWith("_ratio"));
    const voltageDefinition = monitorDefinitions.find((item) => item.service === "01" && item.pid === pid && item.id.endsWith("_voltage_wide"));
    const values = [];
    if (ratioDefinition) {
      values.push({
        id: ratioDefinition.id,
        pid,
        value: Number((((a * 256) + b) / 32768).toFixed(3)),
        unit: ratioDefinition.unit
      });
    }
    if (voltageDefinition) {
      values.push({
        id: voltageDefinition.id,
        pid,
        value: Number((((c * 256) + d) / 8192).toFixed(3)),
        unit: voltageDefinition.unit
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

  function decodeCommandedEgrAndError(pid, a, b) {
    if (!Number.isInteger(b)) return null;
    const commandDefinition = monitorDefinitions.find((item) => item.service === "01" && item.pid === pid && item.id === "commanded_egr_pid69");
    const errorDefinition = monitorDefinitions.find((item) => item.service === "01" && item.pid === pid && item.id === "egr_error_pid69");
    const values = [];
    if (commandDefinition) {
      values.push({
        id: commandDefinition.id,
        pid,
        value: Number((a * 100 / 255).toFixed(3)),
        unit: commandDefinition.unit
      });
    }
    if (errorDefinition) {
      values.push({
        id: errorDefinition.id,
        pid,
        value: Number(((b - 128) * 100 / 128).toFixed(3)),
        unit: errorDefinition.unit
      });
    }
    return values.length ? values : null;
  }

  function decodeFuelSystemStatusPid(pid, a, b) {
    const summaryDefinition = monitorDefinitions.find((item) => item.service === "01" && item.pid === pid && item.id === "fuel_system_status");
    const bank1Definition = monitorDefinitions.find((item) => item.service === "01" && item.pid === pid && item.id === "fuel_system_status_bank1");
    const bank2Definition = monitorDefinitions.find((item) => item.service === "01" && item.pid === pid && item.id === "fuel_system_status_bank2");
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
    const values = [];
    if (summaryDefinition) values.push({ id: summaryDefinition.id, pid, value: bank2 ? `${bank1};${bank2}` : bank1, unit: summaryDefinition.unit });
    if (bank1Definition) values.push({ id: bank1Definition.id, pid, value: bank1, unit: bank1Definition.unit });
    if (bank2Definition && bank2) values.push({ id: bank2Definition.id, pid, value: bank2, unit: bank2Definition.unit });
    return values.length ? values : null;
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

  function decodeOxygenSensorLocations(a, fourBankLayout) {
    const labels = fourBankLayout
      ? ["b1s1", "b1s2", "b2s1", "b2s2", "b3s1", "b3s2", "b4s1", "b4s2"]
      : ["b1s1", "b1s2", "b1s3", "b1s4", "b2s1", "b2s2", "b2s3", "b2s4"];
    const present = labels.filter((_, index) => Boolean(a & (1 << index)));
    return present.length ? present.join(",") : "none_reported";
  }

  function decodeAuxiliaryInputStatus(a) {
    return (a & 0x01) ? "pto_active" : "pto_inactive";
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
    const sourceInput = input && typeof input === "object" && !Array.isArray(input) && input.data && typeof input.data === "object"
      ? {
        ...input.data,
        source: input.data.source || input.data.source_type || input.data.sourceType || input.source || input.source_type || input.sourceType,
        captured_at: input.data.captured_at || input.data.capturedAt || input.captured_at || input.capturedAt,
        protocol: input.data.protocol || input.data.obd_protocol || input.data.communicationProtocol || input.data.communication_protocol || input.protocol || input.obd_protocol || input.communicationProtocol || input.communication_protocol
      }
      : input;
    const source = sourceInput.source || sourceInput.source_type || sourceInput.sourceType || "diagnostic_core";
    const supportedRows = Array.isArray(input)
      ? input
      : Array.isArray(sourceInput.supported_pids)
        ? sourceInput.supported_pids
        : Array.isArray(sourceInput.supportedPids)
          ? sourceInput.supportedPids
          : Array.isArray(sourceInput.pids)
            ? sourceInput.pids
            : Array.isArray(sourceInput.pid_list)
              ? sourceInput.pid_list
              : Array.isArray(sourceInput.pidList)
                ? sourceInput.pidList
                : Array.isArray(sourceInput.supported_pid_rows)
                  ? sourceInput.supported_pid_rows
                  : Array.isArray(sourceInput.supportedPidRows)
                    ? sourceInput.supportedPidRows
                    : typeof sourceInput.supported_pid_list === "string"
                      ? sourceInput.supported_pid_list.split(/[\s,;|/]+/)
                      : typeof sourceInput.supportedPidList === "string"
                        ? sourceInput.supportedPidList.split(/[\s,;|/]+/)
                        : typeof sourceInput.supported_pids_text === "string"
                          ? sourceInput.supported_pids_text.split(/[\s,;|/]+/)
                          : typeof sourceInput.supportedPidsText === "string"
                            ? sourceInput.supportedPidsText.split(/[\s,;|/]+/)
                            : [];
    const supported = new Set(supportedRows
      .map((pid) => {
        if (pid && typeof pid === "object") {
          return String(pid.pid || pid.code || pid.id || pid.pid_code || pid.pidCode || pid.pid_id || pid.pidId || pid.value || "").toUpperCase().replace(/^0X/, "").padStart(2, "0");
        }
        return String(pid).toUpperCase().replace(/^0X/, "").padStart(2, "0");
      })
      .filter(Boolean));
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
      capturedAt: sourceInput.captured_at || sourceInput.capturedAt || sourceInput.timestamp || null,
      protocol: sourceInput.protocol || sourceInput.obd_protocol || sourceInput.communicationProtocol || sourceInput.communication_protocol || null,
      supportedPids: [...supported],
      supportedCount: items.filter((item) => item.supported).length,
      knownPidCount: items.length,
      items,
      retainedRawText: false
    };
  }

  function buildDiagnosticScanSession(input = {}) {
    const sessionInput = getDiagnosticSessionInput(input);
    const metadataOverrides = getSessionMetadataOverrides(sessionInput);
    const importedCoreSessionStatus = sessionInput.coreSessionStatus || sessionInput.core_session_status || null;
    const importedDiagnosticFlowSummary = sessionInput.diagnosticFlowSummary || sessionInput.diagnostic_flow_summary || null;
    const importedReadoutCompletionSummary = sessionInput.readoutCompletionSummary || sessionInput.readout_completion_summary || null;
    const importedAnalysisReadinessSummary = sessionInput.analysisReadinessSummary || sessionInput.analysis_readiness_summary || null;
    const importedReadoutQualitySummary = sessionInput.readoutQualitySummary || sessionInput.readout_quality_summary || null;
    const importedReadoutRequestPlanGateSummary = sessionInput.readoutRequestPlanGateSummary || sessionInput.readout_request_plan_gate_summary || null;
    const importedCoreReadoutInventorySummary = sessionInput.coreReadoutInventorySummary || sessionInput.core_readout_inventory_summary || null;
    const dtcSnapshotInput = sessionInput.dtcSnapshot || sessionInput.dtc_snapshot || sessionInput;
    const livePidSnapshotInput = sessionInput.livePidSnapshot
      || sessionInput.live_pid_snapshot
      || sessionInput.livePidResponse
      || sessionInput.live_pid_response
      || sessionInput.livePids
      || sessionInput.live_pids
      || (Array.isArray(sessionInput.monitorValues) || Array.isArray(sessionInput.monitor_values)
        ? {
          source: sessionInput.source || sessionInput.source_type || "local_bridge",
          captured_at: sessionInput.captured_at || sessionInput.capturedAt || null,
          protocol: sessionInput.protocol || sessionInput.obd_protocol || null,
          monitor_values: sessionInput.monitorValues || sessionInput.monitor_values || [],
          monitor_value_summary: sessionInput.monitorValueSummary || sessionInput.monitor_value_summary || null,
          monitor_insights: sessionInput.monitorInsights || sessionInput.monitor_insights || []
        }
        : {});
    const freezeFrameSnapshotInput = sessionInput.freezeFrameSnapshot || sessionInput.freeze_frame_snapshot || sessionInput.freezeFrameResponse || sessionInput.freeze_frame_response || sessionInput.freezeFrame || sessionInput.freeze_frame || {};
    const readinessSnapshotInput = sessionInput.readinessSnapshot || sessionInput.readiness_snapshot || sessionInput.readinessResponse || sessionInput.readiness_response || sessionInput.readiness || {};
    const onboardMonitorSnapshotInput = sessionInput.onboardMonitorSnapshot || sessionInput.onboard_monitor_snapshot || sessionInput.onboardMonitorResponse || sessionInput.onboard_monitor_response || sessionInput.onboardMonitor || sessionInput.onboard_monitor || {};
    const ecuResponseSummaryInput = sessionInput.ecuResponseSummary || sessionInput.ecu_response_summary || sessionInput.ecuResponseSummaryResponse || sessionInput.ecu_response_summary_response || sessionInput.ecus || sessionInput.ecu_responses || {};
    const ecuInfoSnapshotInput = sessionInput.ecuInfoSnapshot || sessionInput.ecu_info_snapshot || sessionInput.ecuInfoResponse || sessionInput.ecu_info_response || sessionInput.ecuInfo || sessionInput.ecu_info || sessionInput.ecuInfoItems || sessionInput.ecu_info_items || {};
    const supportedPidMatrixInput = sessionInput.supportedPidMatrix || sessionInput.supported_pid_matrix || sessionInput.supportedPidSnapshot || sessionInput.supported_pid_snapshot || sessionInput.supportedPidResponse || sessionInput.supported_pid_response || sessionInput.supportedPids || sessionInput.supported_pids || {};
    const readoutCoverageInput = getReadoutCoverageInput(sessionInput);
    const dtcSnapshot = dtcSnapshotInput?.schemaVersion ? dtcSnapshotInput : normalizeDtcSnapshot(dtcSnapshotInput);
    const livePidResponseInput = livePidSnapshotInput && typeof livePidSnapshotInput === "object" && !Array.isArray(livePidSnapshotInput)
      ? (livePidSnapshotInput.data && typeof livePidSnapshotInput.data === "object"
          ? {
            ...livePidSnapshotInput.data,
            protocol: livePidSnapshotInput.data.protocol || livePidSnapshotInput.data.obd_protocol || livePidSnapshotInput.protocol || livePidSnapshotInput.obd_protocol || sessionInput.protocol || sessionInput.obd_protocol || null,
            captured_at: livePidSnapshotInput.data.captured_at || livePidSnapshotInput.data.capturedAt || livePidSnapshotInput.captured_at || livePidSnapshotInput.capturedAt || sessionInput.captured_at || sessionInput.capturedAt || null
          }
          : livePidSnapshotInput)
      : livePidSnapshotInput;
    const livePidSnapshot = livePidSnapshotInput?.monitorValues
      ? livePidSnapshotInput
      : (livePidResponseInput?.raw || livePidResponseInput?.response || Array.isArray(livePidResponseInput?.bytes))
        ? decodeLivePidResponse(livePidResponseInput)
        : normalizeBridgeLivePidSnapshot(livePidSnapshotInput);
    const supportedPidResponseInput = supportedPidMatrixInput && typeof supportedPidMatrixInput === "object" && !Array.isArray(supportedPidMatrixInput)
      ? (supportedPidMatrixInput.data && typeof supportedPidMatrixInput.data === "object"
          ? {
            ...supportedPidMatrixInput.data,
            protocol: supportedPidMatrixInput.data.protocol || supportedPidMatrixInput.data.obd_protocol || supportedPidMatrixInput.protocol || supportedPidMatrixInput.obd_protocol || sessionInput.protocol || sessionInput.obd_protocol || null,
            captured_at: supportedPidMatrixInput.data.captured_at || supportedPidMatrixInput.data.capturedAt || supportedPidMatrixInput.captured_at || supportedPidMatrixInput.capturedAt || sessionInput.captured_at || sessionInput.capturedAt || null
          }
          : supportedPidMatrixInput)
      : supportedPidMatrixInput;
    const readinessResponseInput = readinessSnapshotInput && typeof readinessSnapshotInput === "object" && !Array.isArray(readinessSnapshotInput)
      ? (readinessSnapshotInput.data && typeof readinessSnapshotInput.data === "object"
          ? {
            ...readinessSnapshotInput.data,
            protocol: readinessSnapshotInput.data.protocol || readinessSnapshotInput.data.obd_protocol || readinessSnapshotInput.protocol || readinessSnapshotInput.obd_protocol || sessionInput.protocol || sessionInput.obd_protocol || null,
            captured_at: readinessSnapshotInput.data.captured_at || readinessSnapshotInput.data.capturedAt || readinessSnapshotInput.captured_at || readinessSnapshotInput.capturedAt || sessionInput.captured_at || sessionInput.capturedAt || null
          }
          : readinessSnapshotInput)
      : readinessSnapshotInput;
    const freezeFrameResponseInput = freezeFrameSnapshotInput && typeof freezeFrameSnapshotInput === "object" && !Array.isArray(freezeFrameSnapshotInput)
      ? (freezeFrameSnapshotInput.data && typeof freezeFrameSnapshotInput.data === "object"
          ? {
            ...freezeFrameSnapshotInput.data,
            protocol: freezeFrameSnapshotInput.data.protocol || freezeFrameSnapshotInput.data.obd_protocol || freezeFrameSnapshotInput.protocol || freezeFrameSnapshotInput.obd_protocol || sessionInput.protocol || sessionInput.obd_protocol || null,
            captured_at: freezeFrameSnapshotInput.data.captured_at || freezeFrameSnapshotInput.data.capturedAt || freezeFrameSnapshotInput.captured_at || freezeFrameSnapshotInput.capturedAt || sessionInput.captured_at || sessionInput.capturedAt || null
          }
          : freezeFrameSnapshotInput)
      : freezeFrameSnapshotInput;
    const onboardMonitorResponseInput = onboardMonitorSnapshotInput && typeof onboardMonitorSnapshotInput === "object" && !Array.isArray(onboardMonitorSnapshotInput)
      ? (onboardMonitorSnapshotInput.data && typeof onboardMonitorSnapshotInput.data === "object"
          ? {
            ...onboardMonitorSnapshotInput.data,
            protocol: onboardMonitorSnapshotInput.data.protocol || onboardMonitorSnapshotInput.data.obd_protocol || onboardMonitorSnapshotInput.protocol || onboardMonitorSnapshotInput.obd_protocol || sessionInput.protocol || sessionInput.obd_protocol || null,
            captured_at: onboardMonitorSnapshotInput.data.captured_at || onboardMonitorSnapshotInput.data.capturedAt || onboardMonitorSnapshotInput.captured_at || onboardMonitorSnapshotInput.capturedAt || sessionInput.captured_at || sessionInput.capturedAt || null
          }
          : onboardMonitorSnapshotInput)
      : onboardMonitorSnapshotInput;
    const ecuInfoResponseInput = ecuInfoSnapshotInput && typeof ecuInfoSnapshotInput === "object" && !Array.isArray(ecuInfoSnapshotInput)
      ? (ecuInfoSnapshotInput.data && typeof ecuInfoSnapshotInput.data === "object"
          ? {
            ...ecuInfoSnapshotInput.data,
            protocol: ecuInfoSnapshotInput.data.protocol || ecuInfoSnapshotInput.data.obd_protocol || ecuInfoSnapshotInput.protocol || ecuInfoSnapshotInput.obd_protocol || sessionInput.protocol || sessionInput.obd_protocol || null,
            captured_at: ecuInfoSnapshotInput.data.captured_at || ecuInfoSnapshotInput.data.capturedAt || ecuInfoSnapshotInput.captured_at || ecuInfoSnapshotInput.capturedAt || sessionInput.captured_at || sessionInput.capturedAt || null
          }
          : ecuInfoSnapshotInput)
      : ecuInfoSnapshotInput;
    const freezeFrameSnapshot = freezeFrameSnapshotInput?.schemaVersion
      ? freezeFrameSnapshotInput
      : (freezeFrameResponseInput?.raw || freezeFrameResponseInput?.response || Array.isArray(freezeFrameResponseInput?.bytes))
        ? decodeFreezeFrameResponse(freezeFrameResponseInput)
        : normalizeFreezeFrameSnapshot(freezeFrameSnapshotInput);
    const readinessSnapshot = readinessSnapshotInput?.schemaVersion
      ? readinessSnapshotInput
      : (readinessResponseInput?.raw || readinessResponseInput?.response || Array.isArray(readinessResponseInput?.bytes))
        ? decodeReadinessResponse(readinessResponseInput)
        : normalizeReadinessSnapshot(readinessSnapshotInput);
    const onboardMonitorSnapshot = onboardMonitorSnapshotInput?.schemaVersion
      ? onboardMonitorSnapshotInput
      : (onboardMonitorResponseInput?.raw || onboardMonitorResponseInput?.response || Array.isArray(onboardMonitorResponseInput?.bytes))
        ? decodeOnboardMonitorResponse(onboardMonitorResponseInput)
        : normalizeOnboardMonitorSnapshot(onboardMonitorSnapshotInput);
    const ecuResponseSummary = ecuResponseSummaryInput?.schemaVersion ? ecuResponseSummaryInput : normalizeEcuResponseSummary(ecuResponseSummaryInput);
    const ecuInfoSnapshot = ecuInfoSnapshotInput?.schemaVersion
      ? ecuInfoSnapshotInput
      : (ecuInfoResponseInput?.raw || ecuInfoResponseInput?.response || Array.isArray(ecuInfoResponseInput?.bytes))
        ? decodeEcuInfoResponse(ecuInfoResponseInput)
        : normalizeEcuInfoSnapshot(ecuInfoSnapshotInput);
    const supportedPidMatrix = supportedPidMatrixInput?.schemaVersion
      ? supportedPidMatrixInput
      : (supportedPidResponseInput?.raw || supportedPidResponseInput?.response || Array.isArray(supportedPidResponseInput?.bytes))
        ? decodeSupportedPidResponse(supportedPidResponseInput)
      : (supportedPidMatrixInput?.data || Array.isArray(supportedPidMatrixInput?.supported_pids) || Array.isArray(supportedPidMatrixInput?.supportedPids))
        ? normalizeBridgeSupportedPidSnapshot(supportedPidMatrixInput)
        : buildSupportedPidMatrix(supportedPidMatrixInput);
    const connectionStatusInput = sessionInput.connectionStatus || sessionInput.connection_status || sessionInput.connectionStatusResponse || sessionInput.connection_status_response || {};
    const vciListInput = sessionInput.vciList || sessionInput.vci_list || sessionInput.vciDevices || sessionInput.vci_devices || sessionInput.listVciResponse || sessionInput.list_vci_response || {};
    const adapterIdentityInput = sessionInput.adapterIdentity || sessionInput.adapter_identity || sessionInput.adapterIdentityResponse || sessionInput.adapter_identity_response || {};
    const {
      connectionStatus,
      vciList,
      adapterIdentity,
      hasBridgeInfrastructureContext
    } = resolveBridgeInfrastructureInputs({
      connectionStatusInput,
      vciDevicesInput: vciListInput,
      adapterIdentityInput,
      nestedSession: sessionInput.bridgeSession || sessionInput.bridge_session,
      readoutCoverageInput,
      honorCoverageOverride: true
    });
    const hasReadinessSnapshotInput = hasObjectContent(readinessSnapshotInput);
    const hasEcuInfoSnapshotInput = hasObjectContent(ecuInfoSnapshotInput);
    const hasOnboardMonitorSnapshotInput = hasObjectContent(onboardMonitorSnapshotInput);
    const warnings = [];
    appendCommonCoreWarnings(warnings, {
      dtcWarning: "save_before_clear",
      hasDtcCodes: dtcSnapshot.codes.length > 0,
      freezeFrameSnapshot,
      hasReadinessSnapshotInput,
      readinessSnapshot,
      hasOnboardMonitorSnapshotInput,
      onboardMonitorSnapshot,
      hasEcuInfoSnapshotInput,
      ecuInfoSnapshot,
      liveDataWarning: "compare_live_data_conditions",
      hasLiveData: livePidSnapshot.monitorValues.length > 0,
      rawPidUndecodedCount: (livePidSnapshot.monitorValueSummary?.undecodedRawCount || 0) + (freezeFrameSnapshot.monitorValueSummary?.undecodedRawCount || 0),
      vehicleApplicability: metadataOverrides.vehicleApplicability || {}
    });
    if (ecuInfoSnapshot.hadSensitiveIdentifier) warnings.push("sensitive_identifier_redacted");
    const resolvedMetadata = buildResolvedSessionMetadata({ metadataOverrides, ecuInfoSnapshot });
    const { protocol, capturedAt } = resolveSessionTemporalContext({
      input: sessionInput,
      dtcSnapshot,
      livePidSnapshot,
      freezeFrameSnapshot,
      readinessSnapshot,
      ecuInfoSnapshot,
      onboardMonitorSnapshot,
      ecuResponseSummary,
      supportedPidMatrix
    });
    const derivedReadoutCoverage = buildReadoutCoverageSnapshot({
      includeInfrastructure: hasBridgeInfrastructureContext,
      connectionStatus,
      vciDevices: vciList.devices,
      adapterIdentity,
      dtcSnapshot,
      livePidSnapshot,
      freezeFrameSnapshot,
      readinessSnapshot,
      ecuInfoSnapshot,
      onboardMonitorSnapshot,
      supportedPidMatrix
    });
    const readoutCoverage = resolveReadoutCoverageSnapshot(readoutCoverageInput, derivedReadoutCoverage);
    const coreReadoutInventorySummary = buildCoreReadoutInventorySummary({
      readoutCoverage,
      dtcSnapshot,
      livePidSnapshot,
      freezeFrameSnapshot,
      readinessSnapshot,
      ecuInfoSnapshot,
      onboardMonitorSnapshot,
      supportedPidMatrix
    });
    appendBridgeReadoutCoverageWarnings(warnings, { hasBridgeInfrastructureContext, readoutCoverage });
    const explicitNextReadoutCandidates = metadataOverrides.nextReadoutCandidates || [];
    const explicitWarnings = resolveWarningList(metadataOverrides.warnings);
    const importClassification = metadataOverrides.importClassification;
    const resolvedWarnings = resolveWarningList(warnings, explicitWarnings);
    const resolvedNextReadoutCandidates = resolveNextReadoutCandidates({
      explicitCandidates: explicitNextReadoutCandidates,
      readoutCoverage,
      vehicleApplicability: resolvedMetadata.vehicleApplicability,
      ecuInfoSnapshot,
      dtcSnapshot,
      supportedPidMatrix
    });
    const coreSessionStatus = buildCoreSessionStatus({
      readoutCoverage,
      vehicleApplicability: resolvedMetadata.vehicleApplicability,
      dtcSnapshot,
      freezeFrameSnapshot,
      readinessSnapshot,
      ecuInfoSnapshot,
      onboardMonitorSnapshot,
      livePidSnapshot,
      supportedPidMatrix,
      warnings: resolvedWarnings,
      nextReadoutCandidates: resolvedNextReadoutCandidates
    });
    const diagnosticFlowSummary = buildDiagnosticFlowSummary(coreSessionStatus);
    const readoutCompletionSummary = coreSessionStatus.readoutCompletionSummary || null;
    const analysisReadinessSummary = coreSessionStatus.analysisReadinessSummary || null;
    const readoutQualitySummary = coreSessionStatus.readoutQualitySummary || diagnosticFlowSummary.readoutQualitySummary || null;
    const readoutRequestPlanGateSummary = coreSessionStatus.readoutRequestPlanGateSummary || analysisReadinessSummary?.readoutRequestPlanGateSummary || diagnosticFlowSummary.readoutRequestPlanGateSummary || null;
    const importedCoreComparisonSummary = buildImportedCoreComparisonSummary(importedCoreSessionStatus, coreSessionStatus);
    const importedDiagnosticFlowComparisonSummary = buildImportedDiagnosticFlowComparisonSummary(importedDiagnosticFlowSummary, diagnosticFlowSummary);
    const importedReadoutCompletionComparisonSummary = buildImportedReadoutCompletionComparisonSummary(importedReadoutCompletionSummary, readoutCompletionSummary);
    const importedAnalysisReadinessComparisonSummary = buildImportedAnalysisReadinessComparisonSummary(importedAnalysisReadinessSummary, analysisReadinessSummary);
    const importedReadoutQualityComparisonSummary = buildImportedReadoutQualityComparisonSummary(importedReadoutQualitySummary, readoutQualitySummary);
    const importedReadoutRequestPlanGateComparisonSummary = buildImportedReadoutRequestPlanGateComparisonSummary(importedReadoutRequestPlanGateSummary, readoutRequestPlanGateSummary);
    const importedCoreReadoutInventoryComparisonSummary = buildImportedCoreReadoutInventoryComparisonSummary(importedCoreReadoutInventorySummary, coreReadoutInventorySummary);
    const importedSessionComparisonSummary = buildImportedSessionComparisonSummary({
      coreComparison: importedCoreComparisonSummary,
      diagnosticFlowComparison: importedDiagnosticFlowComparisonSummary,
      readoutCompletionComparison: importedReadoutCompletionComparisonSummary,
      analysisReadinessComparison: importedAnalysisReadinessComparisonSummary,
      readoutQualityComparison: importedReadoutQualityComparisonSummary,
      readoutRequestPlanGateComparison: importedReadoutRequestPlanGateComparisonSummary,
      coreReadoutInventoryComparison: importedCoreReadoutInventoryComparisonSummary
    });
    const importedReadoutQualityReviewRequestPlanSummary = importedSessionComparisonSummary?.readoutQualityReviewRequestPlanSummary
      || sessionInput.importedReadoutQualityReviewRequestPlanSummary
      || sessionInput.imported_readout_quality_review_request_plan_summary
      || null;
    const monitorValueSummary = resolveMonitorValueSummary([
      ...livePidSnapshot.monitorValues,
      ...freezeFrameSnapshot.monitorValues
    ]);
    const resolvedImportClassification = resolveImportClassification(importClassification);

    return {
      schemaVersion: "scan_session_v1",
      schema_version: "scan_session_v1",
      source: sessionInput.source || sessionInput.source_type || "diagnostic_core",
      source_type: sessionInput.source_type || sessionInput.source || "diagnostic_core",
      sessionId: String(sessionInput.session_id || sessionInput.sessionId || "local_scan_session").slice(0, 80),
      session_id: String(sessionInput.session_id || sessionInput.sessionId || "local_scan_session").slice(0, 80),
      startedAt: sessionInput.started_at || sessionInput.startedAt || null,
      started_at: sessionInput.started_at || sessionInput.startedAt || null,
      endedAt: sessionInput.ended_at || sessionInput.endedAt || null,
      ended_at: sessionInput.ended_at || sessionInput.endedAt || null,
      capturedAt,
      captured_at: capturedAt,
      protocol,
      obd_protocol: protocol,
      vehicleProfile: resolvedMetadata.vehicleProfile,
      vehicle_profile: resolvedMetadata.vehicleProfile,
      vehicleApplicability: resolvedMetadata.vehicleApplicability,
      vehicle_applicability: resolvedMetadata.vehicleApplicability,
      connectionStatus,
      connection_status: connectionStatus,
      vciDevices: vciList.devices || [],
      vci_devices: vciList.devices || [],
      adapterIdentity,
      adapter_identity: adapterIdentity,
      ecuResponseSummary,
      ecu_response_summary: ecuResponseSummary,
      dtcSnapshot,
      dtc_snapshot: dtcSnapshot,
      freezeFrameSnapshot,
      freeze_frame_snapshot: freezeFrameSnapshot,
      readinessSnapshot,
      readiness_snapshot: readinessSnapshot,
      onboardMonitorSnapshot,
      onboard_monitor_snapshot: onboardMonitorSnapshot,
      ecuInfoSnapshot,
      ecu_info_snapshot: ecuInfoSnapshot,
      livePidSnapshot,
      live_pid_snapshot: livePidSnapshot,
      supportedPidMatrix,
      supported_pid_matrix: supportedPidMatrix,
      readoutCoverage,
      readout_coverage: readoutCoverage,
      coreReadoutInventorySummary,
      core_readout_inventory_summary: coreReadoutInventorySummary,
      nextReadoutCandidates: resolvedNextReadoutCandidates,
      next_readout_candidates: resolvedNextReadoutCandidates,
      coreSessionStatus,
      core_session_status: coreSessionStatus,
      diagnosticFlowSummary,
      diagnostic_flow_summary: diagnosticFlowSummary,
      readoutCompletionSummary,
      readout_completion_summary: readoutCompletionSummary,
      analysisReadinessSummary,
      analysis_readiness_summary: analysisReadinessSummary,
      readoutQualitySummary,
      readout_quality_summary: readoutQualitySummary,
      readoutRequestPlanGateSummary,
      readout_request_plan_gate_summary: readoutRequestPlanGateSummary,
      importedCoreSessionStatus,
      imported_core_session_status: importedCoreSessionStatus,
      importedDiagnosticFlowSummary,
      imported_diagnostic_flow_summary: importedDiagnosticFlowSummary,
      importedReadoutCompletionSummary,
      imported_readout_completion_summary: importedReadoutCompletionSummary,
      importedAnalysisReadinessSummary,
      imported_analysis_readiness_summary: importedAnalysisReadinessSummary,
      importedReadoutQualitySummary,
      imported_readout_quality_summary: importedReadoutQualitySummary,
      importedReadoutRequestPlanGateSummary,
      imported_readout_request_plan_gate_summary: importedReadoutRequestPlanGateSummary,
      importedCoreReadoutInventorySummary,
      imported_core_readout_inventory_summary: importedCoreReadoutInventorySummary,
      importedCoreComparisonSummary,
      imported_core_comparison_summary: importedCoreComparisonSummary,
      importedDiagnosticFlowComparisonSummary,
      imported_diagnostic_flow_comparison_summary: importedDiagnosticFlowComparisonSummary,
      importedReadoutCompletionComparisonSummary,
      imported_readout_completion_comparison_summary: importedReadoutCompletionComparisonSummary,
      importedAnalysisReadinessComparisonSummary,
      imported_analysis_readiness_comparison_summary: importedAnalysisReadinessComparisonSummary,
      importedReadoutQualityComparisonSummary,
      imported_readout_quality_comparison_summary: importedReadoutQualityComparisonSummary,
      importedReadoutRequestPlanGateComparisonSummary,
      imported_readout_request_plan_gate_comparison_summary: importedReadoutRequestPlanGateComparisonSummary,
      importedCoreReadoutInventoryComparisonSummary,
      imported_core_readout_inventory_comparison_summary: importedCoreReadoutInventoryComparisonSummary,
      importedReadoutQualityReviewRequestPlanSummary,
      imported_readout_quality_review_request_plan_summary: importedReadoutQualityReviewRequestPlanSummary,
      importedSessionComparisonSummary,
      imported_session_comparison_summary: importedSessionComparisonSummary,
      monitorValueSummary,
      monitor_value_summary: monitorValueSummary,
      importClassification: resolvedImportClassification,
      import_classification: resolvedImportClassification,
      toolHints: resolvedMetadata.toolHints,
      tool_hints: resolvedMetadata.toolHints,
      warnings: resolvedWarnings,
      hadSensitiveIdentifier: resolvedMetadata.hadSensitiveIdentifier,
      had_sensitive_identifier: resolvedMetadata.hadSensitiveIdentifier,
      sourceLength: resolvedMetadata.sourceLength,
      source_length: resolvedMetadata.sourceLength,
      ...buildReadOnlyFlags({
        retainedRawText: false,
        retainedRawFrames: false,
        wouldTransmit: false,
        vehicleCommandEnabled: false
      })
    };
  }

  function evaluateLocalBridgeRequest(request = {}) {
    const normalizedRequest = {
      request_id: request.request_id || request.requestId || null,
      api_version: request.api_version || request.apiVersion || null,
      intent: request.intent || null,
      timestamp: request.timestamp || null,
      pairing_token: request.pairing_token || request.pairingToken || null
    };
    const intent = String(normalizedRequest.intent || "").trim();
    const isAllowedRead = localBridgeContract.allowedReadIntents.includes(intent);
    const isBlockedWrite = localBridgeContract.blockedWriteIntents.includes(intent);
    const missingFields = localBridgeContract.requiredRequestFields.filter((field) => !normalizedRequest[field]);

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

  function normalizeMonitorLabelTokens(value) {
    return normalizeMonitorLabel(value)
      .replace(/[()[\]{}]/g, " ")
      .replace(/[=,/%]/g, " ")
      .replace(/\b(?:v|volt|volts|rpm|kpa|pa|c|f|deg|degree|degrees|percent|pct|kmh|km|h|g|s|l|min|ms)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isMonitorLabelMatch(label, alias) {
    const normalizedLabel = normalizeMonitorLabel(label);
    const normalizedAlias = normalizeMonitorLabel(alias);
    if (normalizedLabel === normalizedAlias) return true;
    const tokenLabel = normalizeMonitorLabelTokens(label);
    const tokenAlias = normalizeMonitorLabelTokens(alias);
    return Boolean(tokenLabel) && tokenLabel === tokenAlias;
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
        item.aliases.some((alias) => isMonitorLabelMatch(labelPart, alias))
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
      toolHints: detectScannerToolHints(redacted),
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
    normalizeBridgeAdapterIdentity,
    normalizeBridgeDtcSnapshot,
    normalizeBridgeLivePidSnapshot,
    normalizeBridgeSupportedPidSnapshot,
    normalizeBridgeFreezeFrameSnapshot,
    normalizeBridgeReadinessSnapshot,
    normalizeBridgeEcuInfoSnapshot,
    normalizeBridgeOnboardMonitorSnapshot,
    buildBridgeSessionSummary,
    buildBridgeSessionExportPayload,
    buildBridgeDiagnosticImport,
    buildReadoutCoverageSnapshot,
    normalizeReadoutCoverageSnapshot,
    normalizeVehicleApplicabilitySnapshot,
    buildNextReadoutCandidates,
    normalizeNextReadoutCandidates,
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
