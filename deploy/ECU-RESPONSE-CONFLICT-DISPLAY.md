# ECU応答詳細の矛盾表示（3.13.686）

2026-10-13。実車を使わない表示修正。

## 確認した状態

normalizeEcuResponseSummaryへ同じ行のsourceEcu:7E8/source_ecu:7E9を渡すと、既存実装はecuResponseConflict:trueとapplicabilityEvidenceEligible:falseを保持する。一方、ECU応答詳細はreportedを「応答取得」と表示し、矛盾の注記がなかった。これは矛盾未検出という問題ではなく、既存判定の表示不足。

## 変更

buildObdEcuResponseDisplayLinesで、ECU矛盾フラグがtrueなら、表示番号は確定情報でなく適合判定の根拠に使えない旨を追加する。矛盾フラグがなく適合根拠対象外フラグがfalseの場合は、対象外という事実のみを示す。camel/snake両形式を確認し、文字列のtrue/falseからは推定しない。正常行には注記を付けない。共通表示行を使う詳細・検索・概要へ反映し、元の状態、件数、行、保存schema、採用条件、通信権限は変更しない。

## 検証

- 専用32項目: 注記以外の表示行、元入力不変、両形式、フラグ混在、正常行を確認。
- 実ブラウザー: 合成JSONをファイル取込し、通常のECU応答カードから詳細へ移動。矛盾注記、正常行、検索/解除、保存復元、390/1280px明暗、横溢れなし、例外/外部/車両要求0を確認。成果物 C:/Users/nagatomo/AppData/Local/Temp/ecu-conflict-display-FWXLl2。390pxを目視確認。
- ブラウザーテストの初期試行は非表示の追加メニューと記録IDのセレクターで停止した。実際の画面遷移とECU番号の操作名へ修正して合格。アプリ側の操作経路は変更していない。

## 残る境界

今回の対象は既存フラグの表示だけ。外側メタデータのECU同義項目は直接APIで行へ継承されず、行の空文字を既存の識別根拠処理が無視する場合もある。入力全体を拒否する契約への変更、他別名・親子間の識別は未実施。単純に空配列へ置き換えると拒否理由が失われるため、ECU応答一覧全体の拒否を追加する場合は保存・表示も含めた具体案が必要。通常JSON取込の入口検査とは区別する。元の曖昧なECU番号をこの表示修正で確定したとは扱わない。

ブリッジ384・オフライン183・Windowsローカル1,369・パッケージ766項目、データ203 JSON / DTC3,878件はエラー0。診断画面全体のブラウザー回帰も合格（readiness-review-ryLEnI）。表示単体テストは補助関数formatObdMode06Routeの読み込み漏れを補い、専用32・Readiness26・FF7・Mode06 7・検索6項目が合格。

ZIP: C:/Users/nagatomo/AppData/Local/Temp/vehicle-diagnosis-tool-3.13.686.zip、2,702,450 bytes、SHA256 3520898748B1A8368F36EA6C30912D72CF3D979E1754A5332C122588FE8BC3E1。別展開851ファイル / 17,036,555 bytesの整合性合格。主要5資産は本体/別展開/ローカルHTTP200で全文一致。

全体OBD7,447項目・エラー0・終了コード0（obd-3.13.686.log）。

実装コミット5eb7ac5da42bcb041a5501a6bbd38962fc3fb71dの本番dpl_5iPmJaeyaS5e7xw3GbqbLsmhEkaKがREADY。主要5資産の公開HTTP200・LF正規化後の本体全文一致を確認。
