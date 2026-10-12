# 6読取の直接APIに対するECU同義項目チェック（3.13.681適用）

2026-10-12 / 調査対象3.13.680・e248e014058b329973b43fffe139696f5b8d277e / 利用者の「続けて」で承認・3.13.681本体適用済み

## 再現と対象

DTC・フリーズフレーム・Readiness・ECU情報・Mode06・対応PIDの直接デコーダーにsourceEcu:7E8/source_ecu:7E9を渡すと、いずれも7E9へ揃えられてreportedとなる例を再現。DTCはP0300、FFは1000 rpm、ECU情報はCAL-1などの合成入力。通常と同じPID定義とECU項目定義を設定した状態で確認した。ECU定義未設定の初回試行はunparsedであり、取得済み再現の根拠に使わない。

対象は次の6組、計12 API。

|読取|直接デコーダー|ブリッジ正規化|
|---|---|---|
|DTC|decodeObdDtcResponse|normalizeBridgeDtcSnapshot|
|FF|decodeFreezeFrameResponse|normalizeBridgeFreezeFrameSnapshot|
|Readiness|decodeReadinessResponse|normalizeBridgeReadinessSnapshot|
|ECU情報|decodeEcuInfoResponse|normalizeBridgeEcuInfoSnapshot|
|Mode06|decodeOnboardMonitorResponse|normalizeBridgeOnboardMonitorSnapshot|
|対応PID|decodeSupportedPidResponse|normalizeBridgeSupportedPidSnapshot|

## 具体案

各入口でhasConflictingJsonEcuAliasesを使い、応答全体を走査。同じオブジェクトのsourceEcu/source_ecuが両方null/欠落以外の場合、非文字列・空文字・前後空白/大小文字を除いた不一致を拒否する。未使用のメタデータや子要素も検査対象。

ブリッジ正規化はローカルのresponseを既存空拒否応答に置き換える。直接デコーダーは同じ読取種別のブリッジ正規化から空拒否結果を返し、元のバイト解析を行わない。nullや新たな例外を拒否の返し方にしない。

## 採用契約と表示の変更

- 対象読取の入力全体を不採用にする。正常な同梱行も部分採用しない。測定値・コード・モニター・対応PID等、ECU/経路/日時/その他メタデータ、元のエラー一覧も引き継がない。元の引数は変更しない。
- 読取種別ごとの既存空拒否形式を返す。状態はblocked、理由はsource_ecu_alias_conflict。DTCは「コード0件を正常取得」ではなく拒否、Readinessも「完了」ではなく拒否。保存schemaや通信権限は変えない。
- 各関数が受け持つ読取だけの拒否であり、セッションに別途渡す他の正常読取まで削除する契約ではない。以前のセッションを自動保持する仕組みでもない。呼出側が結果を採用するとその欄は拒否記録となる。
- 通常の結果概要では、この理由を持つblocked欄を「— / 読取拒否」と日本語理由で表示し、上部に「読取拒否あり」、注記に対象種別と取得元確認の案内を表示する。既存の「未取得」だけでは理由を区別できなかったため追加した。一般エラー整形でも同エラーを日本語化する。正常記録へ戻ると拒否表示は消える。

## 適用前の隔離検証

- 旧版144ケースをscripts/fixtures/core-readout-ecu-alias-legacy-3.13.680.jsonへ固定。API出力・セッション・保存・復元の全SHA256と旧状態/ECUを記録。固定時刻1791712800000、合成入力のみ。
- node deploy/scripts/validate-core-readout-ecu-alias-proposal.js: 144ケース・1,788項目合格。拒否出力は種別ごとの既存空拒否出力と全SHA256が一致。保存復元後のblocked・理由・ECUなし・送信/書込/RAW保持なし、元入力不変を確認。各6種の拒否結果と別途取得した正常ライブ14 Vを同じセッションへ組み合わせ、保存復元後も正常ライブを保持する24項目も合格。正常/片方/null/空白大小文字/別オブジェクト/対象外別名の全出力は旧版と一致。
- ブラウザー14記録（12 APIの拒否＋前後の正常DTC）が合格。実ファイル取込と「3. 結果」ボタンで概要へ移動し、日本語拒否理由、保存復元、390/1280px明暗、正常復帰を確認。外部/車両要求・ページ例外0。成果物: C:/Users/nagatomo/AppData/Local/Temp/core-readout-ecu-alias-proposal-4x8NKq。初回で「未取得」だけの表示を確認し上記案を追加。次の試行は結果画面への移動不足で非表示要素の撮影が失敗したため、実ボタン移動を追加して再検証した。

## 範囲と限界

対象は上記12 APIと、同理由を持つ6読取の概要表示。汎用normalizeDtcSnapshot等の正規化関数、独立したUDS専用APIの直接呼出し、他ECU別名ecu/address/module、親子の明示的な差は全保護したとは扱わない。既に失われた矛盾は復元できない。任意循環・getterの下流対応を保証する変更でもない。車両通信・消去・作動は行っていない。

## 本体適用と検証

利用者の承認後、確認済みの12 API入口検査と拒否表示を3.13.681へ適用。対象応答全体の不採用、他の正常読取の保持、既存出力/保存形式の範囲は上記のとおり。

- 本体144ケース・1,644項目合格。隔離1,788項目から旧本体再現144項目を外して本体直接参照へ移行。旧版fixtureはそのまま保持。正常入力の全体SHA256比較と、別途正常ライブ14 Vを同梱した保存復元24項目を維持。
- 実ブラウザー14記録（12 API拒否＋前後正常DTC）、結果概要の拒否/理由表示、保存復元、390/1280px明暗、正常復帰が合格。外部/車両要求・ページ例外0。成果物: C:/Users/nagatomo/AppData/Local/Temp/core-readout-ecu-alias-production-x8XwiD。
- 既存の概要/保存/RAWライブ3 APIブラウザー回帰も合格（remaining-ecu-alias-production-lmA8YH）。
- 配布ZIP別展開851ファイル / 16,986,919 bytes一致。ZIP自体2,700,256 bytes、SHA256: 241313267C56992DB1347D7E283E6748D40AA9375B22DDA6A84C9DDE5555C942。
- 主要5資産は本体・別展開・ローカルHTTP200でLF正規化後の全文一致。
- ブリッジ384・オフライン183・Windowsローカル版1,369・パッケージ766項目が合格。データ203 JSON / DTC 3,878件、エラー・警告0。
- 診断画面全体のブラウザー回帰（readiness-review-W91dpF）が合格。ファイル取込・検索/移動/初期化・画面幅/明暗・記録維持を確認し、外部/車両要求0。
- 全体OBD回帰7,447項目・エラー0で合格。実装コミット8864e9e9ab4986f01774790d566f1ec707bfc6b1の本番dpl_5sgoyyz8cYaCcV9JBBA2Qkasi8kFがREADY。tool.mukiguri.comへの割当と、主要5資産の公開HTTP200・LF正規化後の本体全文一致を確認。実車/VCI試験ではない。
