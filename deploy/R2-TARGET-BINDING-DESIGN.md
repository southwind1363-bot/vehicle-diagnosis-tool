# R2 DTC消去対象の束縛: 次の非送信実装設計

## 今回の境界

現行 `generic_obd_dtc_clear_workflow_v1` の `target.vehicleId` / `ecuId` / `transportId` は、非空文字列であることしか検査しない。実車、応答ECU、使用中transportの証拠ではない。

次の実装は、照合済みの消去前記録候補と現在のWeb Serial接続・読取結果を参照同一性で検査し、**対象を束縛できない理由を返す内部controller**だけとする。車両送信、workflow遷移、readiness更新、保存schema変更、UI追加は行わない。

現行コードだけを使う限り、結果は必ず `blocked` または `invalidated` とする。`bound`、`verified`、`target` 設定済みという結果は作らない。

## 次に実装するAPI

`script.js` の接続ライフサイクル所有部に内部専用で置き、`window.ObdReadOnly` へexportしない。

```js
const controller = createObdDtcClearTargetBindingController();

controller.getSnapshot();
controller.capture({
  expectedAssociation,
  expectedSessionRef,
  expectedPortRef,
  expectedSerialRevision
});
controller.invalidate(reason);
```

`capture()` の4項目は必須のown data propertyとし、alias、文字列化、既定値、JSON複製を受け付けない。

- `expectedAssociation`: `getObdOperationJournalComparisonAssociation()` の現在の同一オブジェクト参照。
- `expectedSessionRef`: associationが保持するsessionの同一参照。現在の `obdDevSession.lastSession` とも同一であること。
- `expectedPortRef`: 現在開いている `obdDevSession.port` の同一参照。
- `expectedSerialRevision`: `obdSerialRevision` と `obdSerialResultOwner.revision` の両方に一致するsafe integer。

返却値は全階層をfreezeし、次に固定する。

```js
{
  schemaVersion: "generic_obd_dtc_clear_target_binding_v1",
  state: "blocked" | "invalidated",
  revision: number,
  preOperationSessionId: string | null,
  vehicleIdentity: {
    status: "not_observed",
    evidenceSource: null,
    retainedIdentifier: false
  },
  ecuScope: {
    status: "not_observed" | "responders_observed" | "conflicted",
    evidenceSource: null | "live_dtc_response_headers",
    responderKeys: string[]
  },
  transport: {
    status: "not_bound" | "current_web_serial_connection",
    evidenceSource: null | "serial_port_object_and_connection_revision",
    persistentHardwareIdentityVerified: false
  },
  blockers: string[],
  target: null,
  workflowTargetApplied: false,
  executionEnabled: false,
  vehicleCommandEnabled: false,
  wouldTransmit: false,
  canExecute: false
}
```

`capture()` は開始時と返却直前に全参照・世代・busy状態を再検査する。競合時は部分結果を成功扱いせず `invalidated` にする。captureやinvalidateのたびにrevisionを増やし、古いsnapshotからの操作を拒否する。

## 証拠と不足

### transport

現行で使える証拠は、同一ページ内の `SerialPort` オブジェクト参照、接続revision、reader/writer、ready状態だけである。すべて一致し、通信処理中でなく、sample/replay/importでない場合だけ `current_web_serial_connection` とする。

これは現在の接続世代への束縛であり、物理VCI個体の確認ではない。アダプター名、FW、ATDP/ATDPN、`SerialPort.getInfo()`、bridge endpoint、J2534 driver IDは個体確認へ使わず、`persistentHardwareIdentityVerified` はfalse固定とする。

local bridge/J2534は、実際に開いたVCI/channelのproduction所有権境界がないため、この版では `transport_identity_not_bound` とする。

### 車両

現行のECU情報正規化はVINを検出して値を保持せず、Web Serialも識別情報を要求しない。したがって常に `not_observed` / `vehicle_identity_not_observed` とする。

次を代替証拠にしない。

- 手入力のメーカー、車名、型式、年式、エンジン型式。
- `vehicleProfile`、`vehicleApplicability`、DTC集合、calibration ID、CVN、ECU名。
- session ID、record ID、digest、保存JSONとの完全一致。
- sample、fixture、replay、import内の識別文字列。

将来の車両識別producerは別設計とする。対象実車から同一接続中に直接取得し、raw値を一般sessionへ渡す前に検査し、機微情報の同意・保持・破棄を決める必要がある。

### ECU範囲

現在sessionのstored/pending/permanent DTC読取について、検証済みresponse addressとnetwork scopeを組み合わせ、重複排除・安定sortした `responderKeys` を作る。手入力ECU名やcatalog候補は使わない。

live Web Serial由来、同一session・接続revision、address role/protocol/network scopeに競合なし、各DTC種別の取得結果が未解析でない場合だけ `responders_observed` とする。DTC 0件の正常応答と応答元不明を区別する。

`responders_observed` はECU個体識別でも、消去が作用する全範囲の確認でもない。常に `ecu_clear_scope_not_verified` を残し、単一 `ecuId` へ縮約しない。

## 固定blocker

不足を空配列へ丸めず、該当するものを同時に返す。

- `journal_association_not_current`
- `live_session_not_current`
- `transport_connection_not_current`
- `transport_identity_not_bound`
- `vehicle_identity_not_observed`
- `dtc_responder_scope_not_observed`
- `dtc_responder_scope_conflicted`
- `ecu_clear_scope_not_verified`
- `sample_replay_or_import_ineligible`
- `operation_busy`

## 失効

次の処理前に同期的にinvalidateする。失効後の自動capture、再読取、再照合はしない。

- 接続開始、切断開始、device disconnect、port/reader/writer差替え、serial revision更新。
- adapter reset、protocol変更、読取開始、読取結果更新、lastSessionの置換または同一参照内変更。
- bridge処理開始、endpoint/VCI選択変更。
- journal一覧・選択世代変更、比較候補の解除/再照合、保存開始、削除開始。
- OBDタブ・mode・詳細stage変更、閲覧欄を閉じる操作、access/developer lock、pagehide。
- 関連するDTC clear workflow controllerの遷移または差替え。

非同期capture完了時に開始時のbinding snapshot参照が変わっていれば、遅着結果を破棄する。

## readinessとの分離

このcontrollerは `operatorAuthenticated`、`vehicleApplicabilityConfirmed`、保存、比較、取消、再読取、復旧、transport/protocol、監査、独立安全確認、影響確認のどのevidenceもtrueにしない。

現行workflowへtargetを渡さず、`target:null`、`workflowTargetApplied:false`、4つの送信・実行flagはfalse固定とする。

## 受入試験

限定試験 `scripts/validate-dtc-clear-target-binding.js` を `validate:obd` から実行する。

- 欠落/extra key、getter、継承値、JSON複製、別controllerの参照、古いrevision、同期再入を拒否する。
- 入力、association、session、workflowを変更せず、全返却経路でtarget null、workflow未適用、送信4 flag falseを確認する。
- current port参照とrevision一致時だけtransportを現在接続として扱うが、物理VCI確認falseを維持する。
- 任意のvehicle/ecu/transport文字列、`verified:true`、model/year、adapter表示、session ID、record digestから対象を作らない。
- sample/replay/import、同じ `getInfo()` の別port、J2534 fixture/preflight結果を拒否する。
- DTC応答元を複数のまま安定保持し、scope競合、unparsed、応答元不明をblocker化する。
- DTC 0件の正常応答も消去範囲確認済みにしない。
- capture中のport、revision、session、association変更と、切断・ロック・画面移動後の遅着をinvalidatedにする。
- 現行producerの全組合せで `bound` 相当の結果が生成されないことを確認する。
- Web Serial/bridge送信、journal書込/削除、workflow transitionが0回であることをspyで確認する。
- 既存DTC clear workflow、journal、session export、allowlist、toolbar DOM/CSSの挙動と形式を変更しない。

fixtureには明示的なfixture markerを必須とし、実車・実VCI確認として集計または表示しない。

## ソフトウェアだけで完了できる範囲

- 任意文字列targetを実行準備へ使わない境界。
- Web Serialの現在接続世代と照合済みsession/recordの一時的な参照束縛。
- live DTC応答元集合の抽出と、欠落・競合blocker。
- 失効、非送信、既存形式不変の自動試験。

完了表示は「現在接続の一部証拠を確認 / 対象束縛は未完了」に限る。「実車確認済み」「対象ECU確認済み」「消去可能」と表示しない。

## 実車・実機が必要なblocker

1. 同一接続中の対象実車から得る識別観測と、機微情報を保持しないproducer。
2. 実VCI個体、開いたtransport/channel、車両接続を同じoperationへ束縛する所有権境界。
3. 対象protocol/networkでDTC消去が作用するECU範囲の公式根拠と対象実車確認。
4. 対象車両・VCI・driver・protocolの組合せごとの適合、安全条件、復旧、再読取、独立レビュー。

これらが揃うまで、workflow target適用、確認記録、dispatch、公開操作へ進めない。fixtureやモデル情報だけでblockerを解除しない。
