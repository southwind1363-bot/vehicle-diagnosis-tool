# iPhoneネイティブ PID69/6A/6C 修正前レビュー

2026-10-10。本体Web公開版3.13.646からの次工程。Swift実装はまだ変更していない。

## コードから確認した現状

`native/ios/ELM327BLEConnector/Sources/ELM327BLEConnector/OBD2ReadoutDecoder.swift` の `livePIDValue` は6A/6Cを1バイトに限定し、百分率に換算する。`commandedEGRAndErrorValues` は69を2バイトに限定して2数値へ換算する。完全な応答は長さ条件に合わず拒否され、不足した応答は数値化され得る。Web旧版と異なり、内部41/0Dを走査して架空車速を作るとまでは確認していない。

対応するSwift既存テストも6A/6Cの1バイト応答を正常値としている。この記述の確認はソース点検であり、Windows上でSwiftを実行した再現試験ではない。

Web側で確認した資料は[2011年版Table B85/B86/B88](https://www.e90post.com/forums/attachment.php?attachmentid=1509324&d=1476497126)。69は7バイト、6A/6Cは5バイトの複合応答であり、最新規格本文・車両適合の確認を意味しない。

## 具体的な変更案

1. 数値用 `OBD2MonitorValue` を維持し、RAW専用の結果型と `decodeLiveRawPID` を追加する。69/6A/6Cだけを完全長で受け、元バイトを大文字の空白区切り文字列として保持。不足・余剰・別PID・混在失敗応答を拒否する。旧数値デコーダから3PIDの誤換算分岐を除去する。
2. connectorの既存3コマンドの完了処理をRAW結果へ接続する。コマンド名・送信値・読取順序・許可範囲は増やさない。今回の3PID用FFコマンドも追加しない。通常EGRのPID2C/2Dは変更しない。
3. `NativeConnectorEnvelope` にRAW結果用の生成経路を追加。Webと同じ `egr_system_pid69_raw` / `intake_air_flow_pid6a_raw` / `throttle_control_pid6c_raw`、空単位、`decoded:false`、既存ECU scopeを保存する。enum等の既存テキスト値を一律に未換算へ変更しない。
4. `NativeConnectorReadoutPreview` とホスト表示へ未換算属性を引き継ぐ。数値の指令値として表示せず、RAWであることを明示する。既存数値記録の値・IDを再計算しない。Web取込後の旧数値には既存の再確認注記が適用される。
5. Swift decoder・envelope・preview・archiveのテストとWeb側のnative整合性検証を更新。実際のSwift生成物とWeb取込の一致を確認する。既存 `ios-readonly-host.yml` のmacOS CIで `swift test` とシミュレーターのビルド・ホスト試験を実施する。実車・BLE通信の確認とは区別する。

この案は、ネイティブの新規診断結果のID・型・件数と公開デコーダAPIの成功条件を変える。既存schema名を維持しても契約変更となるため、本体適用前の確認対象。古いWeb版ではRAWのIDが旧数値名に紐付く制約があり、取込先は3.13.646以降とする。

## 今回の実行検証

`node deploy/scripts/validate-native-control-raw-contract.js` は148項目合格。既存fixtureを複製した人工native envelopeで、3PID・2ECU・複数対応バイトのRAW、`decoded:false`、空単位、保存再読込、旧数値0、送信権限なし、入力非変更を実際のWeb本体で検証した。Swiftの出力を検証したものではない。

このPCでは `swift` と `gh` がPATH上に見つからない。macOS CIの定義は存在するが、今回のSwift試験・CI実行は未実施。機材の購入は現段階では不要。CIで検証できない場合には未確認のまま本体完了と扱わず、具体的な障害を報告する。
