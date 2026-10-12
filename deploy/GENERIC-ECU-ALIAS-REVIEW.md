# 汎用正規化5 APIのECU同義項目チェック案

2026-10-12 / 対象3.13.682・abd5c6ba2458a157883b3c47771ee987c38461c0 / 本体未適用

## 再現と対象

次の5 APIへsourceEcu:7E8/source_ecu:7E9を同梱すると、現行本体はsourceEcu:7E9へ揃えてreportedを返すことを再現した。DTCはP0300、FFは1000 rpm、ECU情報はCAL-1などの合成入力。既存PID・ECU項目定義を設定して比較した。実車・規格適合の証明ではない。

- normalizeDtcSnapshot
- normalizeFreezeFrameSnapshot
- normalizeReadinessSnapshot
- normalizeEcuInfoSnapshot
- normalizeOnboardMonitorSnapshot

## 本体へ適用する具体案

5入口で既存hasConflictingJsonEcuAliasesを使う。同じオブジェクトのsourceEcu/source_ecuが両方null/欠落以外の場合、非文字列・空文字・前後空白/大小文字を除いた不一致を拒否する。入力全体を走査し、data包絡・未使用メタデータ・子要素の矛盾も対象とする。

- 対象読取の入力全体を不採用にする。正常な同梱行を部分採用せず、コード・測定値・モニター・ECU・経路・時刻・その他元メタデータも引き継がない。元入力は変更しない。
- 対応する既存normalizeBridge…Snapshotへ空拒否応答を渡す。状態blocked・理由source_ecu_alias_conflictの既存形式を返す。橋渡し先から汎用関数へ戻る入力に矛盾は含まれず、再拒否を繰り返さない。nullや新しい例外は使わない。
- 呼出側が戻り値を採用した対象欄は拒否記録となる。以前の同じ欄を自動保持する契約ではない。別途セッションへ渡す正常な他読取は保持する。
- 同値・空白大小文字・片方指定・null・空入力の既存出力を維持する。別オブジェクトにある親子の異なるECUは、この同義項目チェックでは矛盾と扱わない。
- 既存の日本語拒否表示を利用し、保存schema・通信権限は変更しない。

## 隔離検証

scripts/generic-ecu-alias-proposal.jsが読み込んだソース文字列だけに修正を適用する。本体ファイルは未変更。旧版証跡をscripts/fixtures/generic-ecu-alias-legacy-3.13.682.jsonへ固定した。固定時刻1791712800000。

- 80ケースと378呼出元出力、計1,263項目が合格。5種×16条件で、ECU矛盾・空・型不正・メタデータ・子要素・外側/data内矛盾と通常入力を比較。
- 正常入力はAPI出力・セッション・保存・復元の全SHA256が旧版と一致。拒否出力は種別ごとの既存空拒否と全SHA256一致。拒否理由、ECUなし、保存復元後の送信/書込false、元引数不変を確認。
- 既存6読取12 APIの144入力とUDS9 APIの234入力、計378出力が旧本体と全文SHA256一致。これは固定した入力群の比較であり、全呼出し状況の互換性保証ではない。
- 各5種の拒否結果と正常ライブ14 Vを同梱する20項目が合格。保存復元後も正常ライブを保持。
- 実ブラウザー7記録（5 API拒否＋前後の正常DTC）が合格。実ファイル取込、結果概要の日本語拒否理由、保存復元、390/1280px明暗、正常復帰を確認。ページ例外・外部/車両要求0。成果物: C:/Users/nagatomo/AppData/Local/Temp/generic-ecu-alias-proposal-v3AN3A。390pxの拒否カードも目視確認した。

## 適用境界

対象は上記5汎用API。対応PIDのbuildSupportedPidMatrix、個別行の正規化API、他のECU別名ecu/address/module、親子/別オブジェクト間の明示的なECU差、循環参照/getterの下流動作は今回の対象外。既に失われた矛盾は復元できない。

診断結果の採用条件が変わるため、開発計画の「診断結果の契約・保存形式に変更が必要なら、その具体的な差分を先に提示する」に従い、本体適用の確認を待つ。全体回帰・配布再生成は本体適用後に実施する。公開・本体・配布は3.13.682を維持する。
