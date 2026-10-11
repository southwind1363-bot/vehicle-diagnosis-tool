# ライブ正規化APIのECU同義項目チェック（3.13.678適用）

2026-10-12 / 調査対象3.13.677・45fdfbf0c1620e943739f60db377a23b2292afda / 利用者の「続けて」で承認・3.13.678本体適用済み

## 再現した問題

通常画面のブリッジ応答チェックを通さずnormalizeBridgeLivePidSnapshotへ矛盾行を直接渡すと、sourceEcu: "7E8" / source_ecu: "7E9"が両方7E9へ揃う。短期補正10%と長期補正10%の例では、取得済み（reported）・2行・合計20%の注意文となり、セッション作成とJSON保存復元後も残る。

旧版27ケースについて、正規化・セッション・保存復元・直接ブリッジ統合の全出力SHA256と旧測定値/分析文をscripts/fixtures/live-ecu-alias-normalization-legacy-3.13.677.jsonに固定した。既存の読取拒否出力も同じfixtureへ保存。時刻1791712800000の合成入力であり、実車証拠ではない。

## 適用する具体案

1. normalizeBridgeLivePidSnapshotの冒頭で既存のECU同義項目検査を行う。同一オブジェクト内のsourceEcu/source_ecuが両方null/欠落以外のとき、不一致・空文字・文字列以外なら応答全体を拒否する。比較は前後空白と大小文字を許容し、未使用メタデータや記録内分析文の同義項目も対象とする。
2. 矛盾時はローカルの処理対象を既存形式の空の拒否応答へ置き換えて、既存の正規化処理から結果を作る。元の引数オブジェクトを書き換えず、例外やnullへ変更しない。
3. 出力はok:false、blocked:true、livePidReadoutStatus:blocked、errorCodes:[source_ecu_alias_conflict]。monitorValues・monitorInsights・子ECU・対応PIDは空となり、送信/書込み/RAW保持はfalse。正常行だけの部分採用はしない。
4. 矛盾がある応答では、ECU・経路・時刻・プロトコル・観測条件・既存分析文等の付随情報も採用しない。時刻/プロトコル等は既存空応答のnull/未指定となり、元のエラー一覧も引き継がず、矛盾の理由だけを返す。これは矛盾入力に限る採用契約の変更であり、元データの修復や返却値への原文退避は行わない。
5. 直接APIでは共有参照や循環参照を渡せるため、検査にWeakSetを追加し、同じオブジェクトを再走査しない。未使用メタデータの循環で停止しないことを検証する。任意の循環構造・getter等を全後続処理が扱えるという保証ではない。
6. 共通のセッション表示で、ライブ値が空・blocked・矛盾エラーありの場合に限り、ライブ画面へ日本語の理由を表示する。通常値・0・他の拒否理由には適用しない。正常記録を開き直すと通常表示へ戻る。

表示文:

> このライブ記録は、同じ箇所の2つのECU番号が一致しないか形式が不正なため、読取拒否として記録されています。取得元の応答内容を確認してください。

## 範囲と限界

- 変更対象はnormalizeBridgeLivePidSnapshotを実際に通る呼出し。通常の構造化livePidResponseをbuildBridgeDiagnosticImportへ渡す経路にも反映される。
- buildBridgeDiagnosticImportへRAW応答やmonitorValuesを持つ正規化済み入力を直接渡すと、この正規化を迂回する経路がある。raw-header-conflictとcanonical-values-conflictの2ケースは旧版出力のままであることを確認した。この案で全直接APIを保護したとは扱わない。
- 既存JSON取込と通常ブリッジ画面の応答全体拒否は維持する。これらの経路では既に正規化前に矛盾を拒否する。
- 低レベルの正規化関数は以前のセッションを持たず、以前の値を保持する機能ではない。返された拒否スナップショットをセッションへ採用した場合、ライブ欄は拒否・値なしになる。拒否済み記録の保存ファイルを明示的に開けば、その記録が現在の表示になる。
- 他のECU別名（ecu/address/module等）や親子ECUの違い、独立したFF/DTC等の正規化APIは今回の修正対象外。既に失われた矛盾も復元しない。
- 保存schema、正常入力、通信コマンド・権限は変更しない。機材購入・実車接続は不要。

## 適用前の隔離検証

- node deploy/scripts/validate-live-ecu-alias-normalization-proposal.js: 27ケース・410項目合格。旧版の固定出力、矛盾行/見出し/子ECU/RAW/正規化済み値/メタデータ/記録内分析文、正常な片方/null/空白大小文字/別ECU/0/RAW/既存blocked、元入力不変を確認。拒否状態と理由をセッション・保存復元・構造化直接統合へ引き継ぎ、正常4段階の全出力は旧版固定SHA256と一致。既存JSON入口と共有検査の結果も旧版と一致。循環・共有参照、迂回する2経路を明示的に検査した。
- node deploy/scripts/validate-live-ecu-alias-normalization-browser.js: APIが作った5つの保存JSONを標準ファイル入力から取込。3つの矛盾記録で値/分析文が空、blockedと理由が再保存後も残る。ライブ画面の日本語理由、390/1280px・明暗、通常0と最後の正常値への復帰、古い誤合算文がないことを確認。外部/車両要求0、ページ例外0。
- 最終画面成果物: C:/Users/nagatomo/AppData/Local/Temp/live-ecu-alias-normalization-proposal-B5K2b5。初回の案では保存拒否結果の表示が一般的な値なしに留まったため、共通セッション表示へ理由を加えて再検証した。

## 本体適用と検証

承認済みの案を3.13.678へ適用。検証はパッチ注入を外し、本体を直接読み込む形へ移行した。旧版JSON入口の出力と循環メタデータの正常出力も、適用前に別fixtureへ固定した。正常4段階の旧版全出力比較を維持し、前版の矛盾直接正規化に限る旧期待を承認された拒否形式へ更新。保存schemaと通信権限は維持する。

- 本体27ケース・383項目合格。旧版再現27項目を本体検証から除いたため、隔離時410項目から383項目となった。旧版fixtureは保持している。
- 既存ブリッジ20応答×9読取・1,080項目合格。
- 実ブラウザー5保存JSON・日本語拒否理由・390/1280px明暗・正常0/正常復帰・再保存が合格。ページ例外と外部/車両要求は0。成果物: C:/Users/nagatomo/AppData/Local/Temp/live-ecu-alias-normalization-production-Fzzj6Z。
- ブリッジ384項目・オフライン183項目合格。通常ブリッジ画面の模擬応答回帰も合格（bridge-ecu-alias-production-HHU2JD）。
- 配布ZIPの別展開検証: 851ファイル / 16,982,363 bytes一致。ZIP自体2,699,347 bytes、SHA256: 3E1251399237BD010C562D992A6E76A87654B4E75802C0A1127C8F8AF03BF2BC。
- 主要5資産（index.html/script.js/obd-readonly.js/service-worker.js/offline-assets.json）は本体・ZIP別展開・ローカルHTTP200でLF正規化後の全文一致。
- 全体画面回帰合格（readiness-review-ZP3pGb）。ローカルworkstation1,369項目・package766項目合格。JSON203ファイル/DTC3,878件、エラー・警告0。
- OBD全体回帰7,447項目・エラー0、終了コード0。新規383項目、既存ブリッジ1,080項目、JSON取込63項目、取得元別分析231項目・原文保持589項目を含む関連回帰も合格。
- 公開反映とHTTP照合は実装コミット後に確認する。
