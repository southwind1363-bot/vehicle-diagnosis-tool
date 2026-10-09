# iPhoneネイティブ PID69/6A/6C 修正前レビュー

2026-10-10。本体Web公開版3.13.646からの次工程。以下は修正前の記録。ローカル実装と未実施の検証は末尾に記載する。

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


## ローカル実装（Swift CI未確認）

2026-10-10。`OBD2RawMonitorValue` と `decodeLiveRawPID` を追加。3コマンドの結果配送をRAWに切り替え、旧数値の換算分岐を除去した。envelopeは空単位と`decoded:false`を保存し、プレビューは「未換算RAW」を表示する。既存enumテキストと数値は従来の型を維持する。送信コマンド・計画・FF対象は増やしていない。

Swift試験には全256対応バイト、必要長、不足/余剰/別PID/負応答/混在応答、旧数値API拒否、PID2C/2D維持、envelope再読込、archive再読込、ECUと未換算表示を追加した。macOS CIでSwift試験が生成する6件のJSONをNodeのWeb取込検証へ渡す手順を追加した。テストを書いたことと実行合格は区別する。

ローカルではWeb取込148項目を実行済み。Swiftコンパイラーがないため、Swiftの構文・型・XCTest・シミュレーター試験は未確認。GitHubへの公開が自動承認レビューで拒否されたため、更新したCIも未実行。本体Web版と配布物は3.13.646から変更していない。公開承認後、まず該当コミットのCI結果を確認し、失敗時には修復する。ネイティブ経路の完了・実機適合とはまだ扱わない。

検証追記（2026-10-10）: Web全体OBD検証7,447項目/エラー0。人工native envelopeのWeb取込148項目、CI入力検査の正常・不足件数・decoded誤設定・重複の4ケースを確認。これはSwiftのコンパイル・XCTest合格を意味しない。
