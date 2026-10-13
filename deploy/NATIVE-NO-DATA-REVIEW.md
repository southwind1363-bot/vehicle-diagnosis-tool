# iPhone nativeのNO DATA取得判定：修正と検証記録

事前確認日: 2026-10-13。以下は適用前レビュー。2026-10-14の承認後、末尾の適用記録に従って反映。公開Web本体は3.13.692。

## コードで確認した問題

`ELM327BLEConnector.swift` の `isExpectedEmptyELMReadoutCommand` は、保存・保留・永久DTC、フリーズフレーム対応情報（0200）、Mode06、Mode09対応項目の6種類をtrueにする。NO DATA分岐は `emitExpectedEmptyReadout` を通り、`ok:true`・`reported` の空データ通知を生成する。

hostの完了集計は成功通知を取得済みに数える。既存の `testReadoutCompletionCountsExpectedEmptyReadoutsAsCaptured` でも空通知の取得済み集計を確認している。ただし、そのテストはfactory出力の集計であり、実際のBluetooth応答からの結合試験ではない。

Web Serial側は3.13.692でこの例外を廃止済み。nativeは独立実装なので修正は自動で反映されない。FF側の対象コマンドも異なり、Webの修正対象0202に対してnativeの例外は0200（対応情報）。nativeの0202（起点DTC）はこの例外一覧にない。

## 具体的な修正案

[適用用差分](scripts/native-no-data-review.patch)は未適用。取得済み空結果の例外をfalseにし、既存の `emitFailure(..., error: "readout_not_available")` へ渡す。対応するSwift単体テストの6期待値もfalseへ変更する。

| 対象 | 現行の模擬空通知をWebへ取込 | 提案する既存失敗通知をWebへ取込 |
| --- | --- | --- |
| 保存・保留・永久DTC | reported・該当区分は空取得 | unparsed・該当区分は未取得 |
| フリーズフレーム対応情報（0200） | reported | blocked・未取得 |
| Mode06 | reported | unparsed・未取得 |
| ECU情報 | reported | unparsed・未取得 |

上表は現在のWeb正規化結果。blockedはWebでの分類名であり、Bluetooth切断や送信停止を意味しない。既存の失敗通知経路は次の計画済みコマンドへ進む。計画・自動再送・停止条件・アダプター初期化失敗・リンクエラー処理は変更しない。

正常応答のデコードと正当な空通知のfactoryは維持する。保存schema、既存保存済み通知の再解釈、通信権限、消去許可は変更しない。旧記録にはNO DATAから生成されたかを識別できない空通知があるため、過去の取得済み記録を自動修正しない。

## 今回確認できた範囲

- `node deploy/scripts/validate-native-no-data-review.js`: 106項目合格。Swiftの分岐を静的に確認し、factory形状を模した6種類×新旧の通知を実際のWeb取込・JSON保存復元へ渡した。取得状態、DTC取得区分、失敗理由、入力不変、通信権限falseを確認。
- 通知はJavaScriptで構成した模擬入力。Swiftで生成した証拠でも、Swift差分の実行テストでもない。
- `git apply --check --ignore-space-change deploy/scripts/native-no-data-review.patch`: 適用可否チェックに合格。本体へは適用していない。
- このPCではSwift実行環境を確認できず、Swiftコンパイル・iOS Simulator・Bluetooth・実車試験は未実施。

## 承認後の作業

1. 差分をnativeへ適用し、Web全体検査の旧nativeソース期待値も更新する。
2. 6種類のSwift生成失敗通知をWebへ取込む回帰検査と、host側で取得済みに数えない検査を追加する。正常0件・通常値・アダプター失敗・リンクエラーの対照を残す。
3. 既存macOS CIでSwift単体・Swift生成通知のWeb取込・iOS Simulator hostテストを確認する。実機成功とは扱わない。

診断の取得・完了判定が変わるため適用前の確認対象。現在の公開本体とnative動作はそのまま。今回の承認・CI検証のために機材を購入する必要はない。

## 適用記録（2026-10-14）

適用確認への「続けて」を受け、6種類のNO DATA空取得例外を廃止した。通常の正応答デコーダー・空結果factory・送信計画・保存schemaは維持。旧レビューpatchは履歴として残し、再適用しない。

Swift単体検査に6種類の失敗通知のJSON復元と空取得preview除外、正応答DTC0件、エラー優先順位を追加。host検査には6件すべて未取得として完了集計する検査を追加。既存macOS CIへSwift生成6通知→Web本体取込/保存復元の検査を接続した。ローカルでは本体ソース条件と模擬入力106項目・JS構文・差分検査が合格。Swift/Simulatorの結果はCI完了後に記録する。BLE・実車試験は未実施。

実装コミット: `5238423b03c01949e555eaad4fe11a7a874d6d5d`。[Web CI 38471951533](https://github.com/southwind1363-bot/vehicle-diagnosis-tool/actions/runs/38471951533)は4ジョブすべて成功。全体OBD7,447項目・エラー0、Linuxブリッジ365項目・エラー0をログで確認。Chromiumオフライン画面、Windows非実行調査、Windows配布パッケージも成功。公開Webの主要5資産はHTTP200・LF正規化後の本体全文一致を確認した。

[iOS CI 38471951566](https://github.com/southwind1363-bot/vehicle-diagnosis-tool/actions/runs/38471951566)も成功。Swift単体113テスト・失敗0、Swift生成6通知のWeb取込/保存復元を含む132項目、Simulator host20テスト・失敗0をログで確認した。追加した `NativeNoDataTests` の2テストと `testNoDataFailuresDoNotCountAsCaptured` が成功し、hostビルドも成功。これはCI上の検証で、実際のBluetooth接続・実車適合は未確認。
