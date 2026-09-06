# R2 DTC消去対象の束縛: 次の非送信実装設計

実装状況 (3.13.512): 内部controllerを明示照合と失効処理へ接続し、専用39件と隔離ブラウザで検証した。下記の実車識別・ECU作用範囲は未実装であり、対象設定や送信の許可ではない。Solの実装再レビュー済み。

## 今回の境界

現行 `generic_obd_dtc_clear_workflow_v1` の `target.vehicleId` / `ecuId` / `transportId` は、非空文字列であることしか検査しない。実車、応答ECU、使用中transportの証拠ではない。

次の実装は、照合済みの消去前記録候補と現在のWeb Serial接続・読取結果を参照同一性で検査し、**対象を束縛できない理由と、現時点で確認できる記録・接続の一部整合を返す内部controller**とする。車両送信、workflow遷移、readiness更新、保存schema変更、UI追加は行わない。

現行コードだけを使う限り、結果は必ず `blocked` または `invalidated` とする。`bound`、`verified`、`target` 設定済みという結果は作らない。

## 次に実装するAPI

`script.js` の接続ライフサイクル所有部に内部専用で置き、`window.ObdReadOnly` へexportしない。controllerはアプリ内部で1個だけ生成し、`compareCurrentObdReadoutToOperationJournalRecord()` が明示操作による照合成功後にassociationを設定した直後、その同一associationを使って1回だけ `capture()` する。未使用factoryの追加だけで終えない。

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
- `expectedSerialRevision`: capture時点の `obdSerialRevision` に一致するsafe integer。transportを現在接続として扱う場合は、さらに `obdSerialResultOwner.revision` とも一致すること。

照合成功後のbinding captureが `blocked` / `invalidated` になっても、既存のjournal associationを解除・差替えしない。bindingは照合結果へ付随する別の安全評価であり、失効後に自動captureしない。

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
    status: "not_observed",
    evidenceSource: null,
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

`preOperationSessionId` は、現在のassociationが保持する `record.recordId` と `sessionRef` を参照同一性と既存JSON再検証で確認できた場合だけ設定する。これは保存記録と現在session内容の一部整合であり、車両同一性や消去前状態の証明ではない。

`capture()` は開始世代を入力のreflectionやassociation accessorより前に記録し、返却直前に、記録整合の参照と、現在接続を表示する場合の全transport参照・世代・busy状態を同期的に再検査する。競合時は部分結果を成功扱いせず `invalidated` にする。captureやinvalidateのたびにrevisionを増やし、revisionを安全に増やせない場合はterminalな `invalidated` として古いsnapshotからの操作を拒否する。

## 証拠と不足

### transport

現行で使える証拠は、同一ページ内の `SerialPort` オブジェクト参照、接続revision、`obdSerialResultOwner.expectedLastSession`、reader/writer、ready状態だけである。associationの `sessionRef`、`obdDevSession.lastSession`、ownerの `expectedLastSession` が同一で、port参照とrevisionが一致し、reader/writerが存在し、接続・切断・bridge・import・読取・書込・初期化処理中でなく、sample/replay/importでない場合だけ `current_web_serial_connection` とする。

transport lossによる切断では `obdSerialRevision` が常に増えるわけではなく、切断開始時にport/reader/writerが同期的にnullになる。したがってrevision一致だけを現在接続の根拠にせず、切断開始時の明示invalidateと上記の参照・状態再検査を必須にする。

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

現行Web SerialのDTC producerは `source: "web_serial"` / `protocol: "ELM327"` と解析した3桁または8桁のheader tokenを `source_ecu` として保持するが、response address roleとnetwork bus/channel/routeをproducer境界で検証・保持していない。import済みrecordや正規化後sessionに同じ値があってもlive provenanceにはならない。

したがってこの版の `ecuScope` は常に `not_observed`、`evidenceSource:null`、`responderKeys:[]` とする。header tokenだけの新しい証拠欄は追加せず、単一 `ecuId` へ縮約しない。DTC 0件の正常応答も、応答元や消去作用範囲を確認したことにはしない。

## 固定blocker

不足を空配列へ丸めず、該当するものを同時に返す。

- `journal_association_not_current`
- `live_session_not_current`
- `transport_connection_not_current`
- `transport_identity_not_bound`
- `vehicle_identity_not_observed`
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

capture中に開始時のbinding snapshot参照が変わっていれば結果を `invalidated` にする。

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
- 現行DTC header token、import済みECU情報、手入力ECU名から `ecuScope` を観測済みにしない。
- DTC 0件の正常応答も消去範囲確認済みにしない。
- capture中のport、revision、session、association変更と、切断・ロック・画面移動をinvalidatedにする。
- 現行producerの全組合せで `bound` 相当の結果が生成されないことを確認する。
- Web Serial/bridge送信、journal書込/削除、workflow transitionが0回であることをspyで確認する。
- 既存DTC clear workflow、journal、session export、allowlist、toolbar DOM/CSSの挙動と形式を変更しない。

fixtureには明示的なfixture markerを必須とし、実車・実VCI確認として集計または表示しない。

## ソフトウェアだけで完了できる範囲

- 任意文字列targetを実行準備へ使わない境界。
- Web Serialの現在接続世代と照合済みsession/recordの一時的な参照束縛。
- ECU範囲producerが未成立であることを誤認なく返す境界。
- 失効、非送信、既存形式不変の自動試験。

完了表示は「現在接続の一部証拠を確認 / 対象束縛は未完了」に限る。「実車確認済み」「対象ECU確認済み」「消去可能」と表示しない。

## 実車・実機が必要なblocker

1. 同一接続中の対象実車から得る識別観測と、機微情報を保持しないproducer。
2. 実VCI個体、開いたtransport/channel、車両接続を同じoperationへ束縛する所有権境界。
3. 対象protocol/networkでDTC消去が作用するECU範囲の公式根拠と対象実車確認。
4. 対象車両・VCI・driver・protocolの組合せごとの適合、安全条件、復旧、再読取、独立レビュー。

これらが揃うまで、workflow target適用、確認記録、dispatch、公開操作へ進めない。fixtureやモデル情報だけでblockerを解除しない。
