# 概要・保存・RAWライブAPIのECU同義項目チェック（3.13.680適用）

2026-10-12 / 対象3.13.679・e60c03b12a816e27e45f3f9a5fe66d23270a6b88 / 利用者の「続けて」で承認・3.13.680本体適用済み

## 再現と対象

buildBridgeSessionSummary、buildBridgeSessionExportPayload、decodeLivePidResponseを直接呼ぶと、sourceEcu:7E8/source_ecu:7E9を持つRAW応答41 42 36 B0が7E9の14 V・reportedとなる。通常と同じPID定義をconfigureMonitorDefinitionsで読み込んだ状態で3 APIとも再現した。定義未設定の試行ではunparsedとなるため、その試行は値再現の証拠に使わない。3.13.679のbuildBridgeDiagnosticImport入口を通らない呼出しが対象。

## 具体的な適用案

- buildBridgeSessionSummaryとbuildBridgeSessionExportPayloadの入口で、入力全体のhasConflictingJsonEcuAliases検査を行う。矛盾時はローカルのpartsを、source_ecu_alias_conflictを持つ既存空ライブ拒否応答だけに置き換える。DTC・他の読取・履歴・車両情報・日時・経路・分析文なども入力から採用しない。正常な同梱データも部分採用しない。
- decodeLivePidResponseの入口でも応答全体を検査する。矛盾時は既存normalizeBridgeLivePidSnapshotから作った空の拒否結果を返し、バイト解析を行わない。値・RAW・日時・ECU等の付随情報も不採用とする。
- いずれも元の引数は書き換えない。null/例外を新しい拒否方式にせず、現在のAPI出力形式を維持する。保存schemaと通信権限を変えない。
- 同一オブジェクトのsourceEcu/source_ecuが両方null/欠落以外の場合に、非文字列・空文字・前後空白/大小文字を除いた不一致を拒否する。未使用メタデータの矛盾も対象。片方だけ、null、空白大小文字だけの差は現在どおり受理する。

## 変更後の意味

ライブ欄はblocked・値なし・source_ecu_alias_conflictとなり、保存復元後も理由が表示される。概要/保存では他の欄は既存の空入力に対応する未取得状態となる。すべての欄がblockedという意味ではない。既存形式の一般的な案内や空欄は残る。

特に保存APIの契約が変わる。矛盾を含む入力から値付きファイルを作る代わりに、入力全体を不採用にした拒否記録を返す。呼出側がその返り値で保存する場合、元の測定値・DTC等はそのファイルに残らない。元オブジェクトや以前のファイルはこの関数では変更しない。以前のセッションを自動保持する仕組みでもない。

## 適用前の隔離検証

- scripts/fixtures/remaining-ecu-alias-legacy-3.13.679.jsonへ、概要36・保存36・RAW解析12の計84ケースの旧出力/保存/復元の全SHA256を固定。時刻1791712800000、合成入力のみ。
- node deploy/scripts/validate-remaining-ecu-alias-proposal.js: 84ケース・624項目合格。拒否出力はAPIごとの既存空拒否出力の全SHA256と一致。保存復元後のblocked・理由・空の値/分析文・送信/書込/RAW保持falseを確認。正常入力は旧版の出力・保存・復元の全SHA256と一致。元入力不変も確認。
- node deploy/scripts/validate-remaining-ecu-alias-browser.js: 3 API経由の計5記録を実ファイル入力で取込。RAW拒否、正常DTC同梱の概要拒否、正規化済み値の保存拒否、正常0と正常復帰、再保存、390/1280px明暗が合格。外部/車両要求0、ページ例外0。成果物: C:/Users/nagatomo/AppData/Local/Temp/remaining-ecu-alias-proposal-e5ikVA。

## 範囲と限界

対象は上記3 API。独立したDTC・フリーズフレーム・Readiness等のデコーダー、内部エイリアス補正、その他のECU別名（ecu/address/module）や親子の明示的な違いまで一括保護したとは扱わない。すでに失われた矛盾は復元できない。既知の矛盾なし循環参照の下流再帰エラーや任意getterへの対応も今回の対象外。実車通信や車両適合の検証ではない。

## 本体適用と検証

利用者の承認後、確認済みの3 API入口検査を3.13.680へ適用。概要/保存の入力全体拒否、RAW解析の応答全体拒否、既存出力形式と正常入力互換の範囲は上記のとおり。

- 本体84ケース・540項目合格。隔離624項目から旧本体再現84項目を外して本体直接参照へ移行。旧版fixtureはそのまま保持した。正常入力の出力・保存・復元の全体SHA256比較を維持。
- 実ブラウザー5記録の取込・理由表示・保存復元・正常復帰・390/1280px明暗合格。外部/車両要求・ページ例外0。成果物: C:/Users/nagatomo/AppData/Local/Temp/remaining-ecu-alias-production-4U4MZS。
- 直接統合379項目・ライブ正規化391項目合格。直接統合ブラウザー回帰も合格（direct-import-ecu-alias-production-Bu2OD4）。
- 配布ZIP別展開851ファイル / 16,983,133 bytes一致。ZIP自体2,699,611 bytes、SHA256: 391C4BDE400261699096E1BA9115A883E3A0EDE5E97E20D19B99E6FE3187316E。
- 主要5資産は本体・別展開・ローカルHTTP200でLF正規化後の全文一致。
- ブリッジ384・オフライン183・workstation1,369・package766項目合格。JSON203ファイル/DTC3,878件、エラー・警告0。全体画面回帰も合格（readiness-review-I721iH）。
- OBD総合7,447項目・エラー0・終了コード0。新規3 API540項目、直接統合379項目、ライブ正規化391項目、既存JSON取込63項目・ブリッジ1,080項目・原文保持589項目を含む関連回帰も合格。
- 実装e52b06926db31cb400cc18a57c99816d71dc649fをmainへpush。本番dpl_8kmp8hKAShBphxd55t8dDcVQkUExは同SHA・production・READY、tool.mukiguri.comへ割当済み。公開主要5資産はHTTP200・LF正規化後の全文一致を確認した。
