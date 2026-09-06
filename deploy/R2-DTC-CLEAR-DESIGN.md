# R2 汎用OBD DTC消去: 次の非送信実装設計

## 目的と今回の範囲

R2の次のコード単位は、DTC消去の判断と監査状態を表す**純粋なワークフローモデル**だけとする。車両送信、transport allowlist変更、UI、保存JSON形式の変更は含めない。消去成功と修理完了は別判定とし、要求値や応答値は対象transportの根拠確認前に定義しない。

## 既存の根拠

- `obd-readonly.js:176-188` は `clear_dtc` を state-changing / blocked-until-safe とし、消去前保存、明示確認、復旧、再スキャンを要求している。
- `obd-readonly.js:238-250` の12条件と `buildServiceOperationReadiness()` (`obd-readonly.js:1287-1329`) は、全条件達成時も `executionEnabled`、`vehicleCommandEnabled`、`wouldTransmit`、`canExecute` を false に保つ。
- `obd-readonly.js:300-338` の実験契約は、適合、前後証拠、明示確認、復旧計画、transport/protocol確認と監査項目を定義するが、実行transportは未実装である。
- `requestVehicleOperation()` (`obd-readonly.js:42388-42399`) と画面 (`script.js:12362-12425`) は、状態変更操作を実行せず無効表示する。
- 再読取に使える既存intentは stored/pending/permanent DTC と readiness (`obd-readonly.js:709-721`)。新しい生コマンド値は不要である。
- 親タスク確認済み境界: `isAllowedObdDeveloperCommand()` (`script.js:8364-8366`) は `WEB_SERIAL_READ_ONLY_COMMANDS` だけを許可し、`local-bridge-readonly.js:107-115` の `BLOCKED_WRITE_INTENTS` は `clear_dtc` を拒否する。既存の operation-availability 72件、bridge 384件は合格済み。この設計では同じ検査を重複追加しない。

## 不足しているもの

- 1回の消去意図に、消去前記録、対象、確認、dispatch結果、再読取結果を結び付ける状態モデル。
- 確認後の対象変更を検出し、確認を失効させる規則。
- timeout/切断等で結果が不明な場合に、自動再送せず再読取へ送る規則。
- 要求結果、DTC消去の観測結果、修理完了を分離する判定。

transport/protocolの適合表、実要求・応答の判定、実車試験、公開開放条件は別工程であり、このモデルでは補完しない。

## 最小コード単位

### 3.13.494 実装API

`buildGenericObdDtcClearWorkflow({ target, preOperationSessionId, evidence })` で開始する。`target` は `vehicleId` / `ecuId` / `transportId` の3参照、`evidence` は既存の事前11条件の真偽値のみ。`impactAcknowledged` を初期入力から受け付けない。参照は非空・最大128文字とし、未知フィールドや不正型はTypeErrorのcodeで拒否する。

遷移イベントは `update_input`（revisionと変更するtarget/session/evidence）、`record_confirmation`（revision、target、preOperationSessionId、impactAcknowledged:true）、`request_dispatch`（revision）の3種。更新はrevisionを進めて確認を失効させる。`request_dispatch` は常に非送信の `dispatch_blocked` まで。画面・保存セッションには未接続である。

`obd-readonly.js` に、外部I/Oを持たない `buildGenericObdDtcClearWorkflow(input)` と `transitionGenericObdDtcClearWorkflow(workflow, event)` を追加する。既存の `buildServiceOperationReadiness("clear_dtc", evidence)` を唯一の準備条件判定に使い、入力オブジェクトを変更しない。この単位は `dispatch_blocked` までとし、dispatch結果を入力するAPIは作らない。

返却値は当面セッションへ保存せず、次の最小フィールドに限定する。

- `schemaVersion: "generic_obd_dtc_clear_workflow_v1"`
- `operationId: "clear_dtc"`, `state`, `revision`
- `target`: 車両/ECU/transportを指す既存識別子の参照。値を推定しない
- `preOperationSessionId`, `readiness`, `confirmation`
- `dispatch`: `attempted:false`, `outcome:"not_attempted"`, `retryAllowed:false`, `wouldTransmit:false`

すべての返却経路で `executionEnabled:false`、`vehicleCommandEnabled:false`、`wouldTransmit:false`、`canExecute:false` を固定する。API exportは純粋関数2個だけとし、`script.js` から呼ばない。

## 今回実装する状態遷移

| 状態 | 受理する事実/操作 | 次状態 | 不変条件 |
| --- | --- | --- | --- |
| `pre_save_required` | `impactAcknowledged` 以外の11条件と消去前セッション参照が揃う | `confirmation_required` | `buildServiceOperationReadiness()` のchecksをIDで確認し、不足を独自判定で隠さない |
| `confirmation_required` | 対象、影響、消去前記録を同一revisionで明示確認 | `confirmation_recorded` | 確認により `impactAcknowledged:true` としてreadinessを再構築し、12条件完了を要求する |
| `confirmation_recorded` | `request_dispatch` | `dispatch_blocked` | readinessが完了しても `canExecute:false` を権限境界とし、attempted=false、wouldTransmit=false |

`operator_authentication`、`vehicle_applicability_confirmed`、各保存条件、比較根拠、取消導線、再スキャン/復旧計画、実機通信条件、独立安全検証は事前11条件である。`impact_acknowledged` だけを確認操作で満たす。対象または消去前記録が変わったら確認と `impactAcknowledged` を破棄し、readinessを再構築する。`ownerExperimentEligibleForImplementation` は実装候補情報にすぎず、`canExecute:false` を上書きしない。

## 後続単位の状態契約

### 3.13.496 非送信モデルの取消

`cancel` イベントは `{ type: "cancel", revision }` だけを受理し、既存の4状態から終端状態 `cancelled` へ移る。対象、消去前セッション参照、事前11条件、revisionは維持し、確認記録の全参照をnullへ戻して `impactAcknowledged:false` とする。送信・実行フラグはfalse、dispatchは未試行のまま。取消済みの状態から更新、再確認、再要求、再取消へは進めない。revision上限直前でも取消は番号を増やさず成立する。

これは現在の純粋なスナップショットの遷移を終了するだけであり、呼出元が保持する古いスナップショットを失効させる認証・排他制御ではない。将来の実行管理側では現在状態の一元管理と古い要求の拒否が別途必要。車両通信中の取消や送信停止を実装した意味ではない。

3.13.495から開発資料で初期モデルを表示しているが、状態遷移・確認・取消・保存・実行にはUIから接続していない。上記の3.13.494の「script.jsから呼ばない」は当初の実装範囲を示す。

`dispatching`、dispatch結果、`reread_required`、前後比較は、承認済み専用dispatcherと信頼できる結果境界を設計する後続単位へ延期する。今回の純粋関数は、呼出元が作ったworkflowやイベントを実dispatchの証拠として受け入れない。

後続単位ではtimeout、切断、応答破損を `outcome:"unknown"` とし、自動再送せず stored/pending/permanent DTC と readiness の再読取へ進める。同一確認での再試行は禁止し、必要時は再読取後に新しいrevision、消去前記録、明示確認を要求する。前後比較は `observed | not_observed | indeterminate` とし、要求受理やDTC非表示だけで修理完了と判定しない。

## 次の実装時のテスト

- 初期状態、入力非変更、camel/snake aliasを安易に増やさない固定schema。
- 事前11条件、`impactAcknowledged`、保存参照、対象の各不足を区別し、確認前に12条件を要求する循環を作らない。
- 確認イベント後にreadinessを再構築し、12条件完了後も送信4フラグと `canExecute` が false。確認前dispatch、古いrevision、対象変更後の確認を拒否。
- `request_dispatch` は `dispatch_blocked` となり、Web Serial/bridge関数を一度も呼ばない。
- forgedな `dispatching` 状態やdispatch結果イベントを受理しない。
- operation-availabilityとbridge既存検証は変更せず、純粋モデルの単体検証を `validate:obd` 経由へ追加する。個別確認は `node scripts/validate-operation-availability.js` を使う。

## 後続の開放条件

### メモリ内の現在状態管理

3.13.497: `createGenericObdDtcClearController(input)` は `getSnapshot()` と `transition(expectedSnapshot, event)` を持つ凍結オブジェクトを返す。最新参照でない場合は `stale_dtc_clear_workflow_snapshot`、同期処理中の再入は `reentrant_dtc_clear_workflow_transition` として拒否する。それ以外の入力と遷移の検証は既存の純粋APIへ委譲する。成功時だけ現在参照を置き換え、例外時も処理中フラグを解除する。

純粋APIは古いスナップショットを独立して扱えるため、利用側へ接続する前に現在状態を一か所で保持する層を置く。状態変更は現在のスナップショット参照を要求し、JSON複製、別管理インスタンスの参照、以前の参照は拒否する。確認・取消がrevisionを増やさない場合も、参照は更新されるため古い要求を見分けられる。

この管理範囲は一つのJavaScript実行環境のメモリ内だけであり、認証、別タブの排他、再起動後の復元、車両送信の許可を提供しない。失敗時は現在状態を維持し、検証中の再入を拒否する。実行・保存・UIへ接続する際は別途設計する。

実dispatchはこの単位に続けて追加しない。対象transportの allowlist/専用dispatcher、要求と応答の根拠、適合、precondition、監査保存形式、異常時復旧、独立レビュー、対象実車での試験が個別に揃った後、別レビューで `dispatching` への入口を設計する。公開UIの有効化はさらに別判断とする。
