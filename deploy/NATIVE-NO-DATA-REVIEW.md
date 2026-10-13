# iPhone nativeのNO DATA取得判定：適用前レビュー

確認日: 2026-10-13。公開Web本体は3.13.692。Swift本体・既存テスト・ワークフローは未変更。

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
