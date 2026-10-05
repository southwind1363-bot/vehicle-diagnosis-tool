# R2 ブラウザー内の取得記録所有権: 次の実装契約

2026-10-06。設計案・未実装。固定模擬見本を通常診断の記録へ接続する前に必要な契約を整理する。新しい送信許可、消去機能、保存形式は定義しない。

## 現在使えるものと不足

| 現在の部品 | 確認できたこと | 証明しないこと |
| --- | --- | --- |
| [Nodeの固定receipt factory](scripts/fixtures/dtc-clear-scoped-before-readout.js) | 模擬scope・順序・前後派生値・破棄の検査 | 実transport、同一実車、実消去境界 |
| [表示状態機械](scripts/fixtures/monitor-preview-controller.js) | 更新・失効・通知・遅着処理の制御 | 注入factoryの真正性、実車由来の記録であること |
| [DOM表示部品](scripts/fixtures/monitor-preview-view.js) | 通知時消去、文字としての描画、解除 | フラグがfalseという表示入力だけによる取得元の認証 |
| [操作見本](scripts/preview-monitor-review-interactive.js) | 固定文章で表示・失敗・閉鎖・再表示ができる | ブラウザー内でのraw receipt検証や実車比較 |

既存fixtureではrealTransportProofAvailable、sameVehicleVerified、clearBoundaryVerified、readoutCoverageComplete、comparisonAvailable、clearSucceededInferredをfalseにしている。見本の正常表示・ハッシュ一致・CI合格によってこれらをtrueに変更しない。

## 接続順序

最初のブラウザー実装は、固定模擬receiptを同一ページ内で生成して検証・所有する実装とする。外部ファイルや実transportへはまだ接続しない。現在の「生成時に得た文章を表示する見本」から、「そのページで検証した模擬receiptから表示を作る試験」への進展だけを主張する。

その後、既存read-only取得器から所有handleを受け渡す契約を個別に設計する。車両から二回読み取れたとしても、それだけでは「消去後再読取」ではない。消去境界の根拠がない間は実消去前後比較を提供しない。Mode04や実行transportをこの表示接続の一部として追加しない。

## 所有者と受渡し

| 担当 | 保持するもの | 渡すもの |
| --- | --- | --- |
| 固定模擬取得器 | 固定profile、source集合、試行識別、読取完了状態 | 検証器へ渡す固定receipt。UIにはrawを渡さない |
| ページ内検証器/所有者 | 外へ公開しないscope・接続・対象の参照、検査済み派生値 | 自身で発行し登録した非直列化handle |
| 表示controller | 所有handle、現在の画面世代、処理中ticket | 凍結した模擬表示snapshotと同期通知 |
| DOM部品 | 表示文章と購読解除関数 | 証拠handleや実行権限は発行しない |

所有handleの認識には、その所有者の内部登録を使う。オブジェクトの形、provenance文字列、成功flag、digest、保存ID、ECU ID、車両名が一致するだけでは受理しない。JSON化して復元した値、別タブ・別ページ・旧接続のhandle、caller作成の類似objectは受理しない。

汎用のcreateSimulatedReviewControllerへのfactory注入を、この認識処理の代わりにしない。通常画面に渡す所有者は固定し、外部から任意factoryを選べるAPIを設けない。表示用snapshotを返す経路と所有handleを認識する経路を分離する。

## 検証と寿命

ブラウザーへ移す前に、Node fixtureのscope、四つのread-only intentの順序、重複/欠落、時刻、payload完了状態、source集合、前後の整合性、凍結コピーと資源上限を対応表にする。同じ入力をNodeとブラウザーに与え、受理/拒否理由と派生値を照合する。Node専用fs/vm依存を通常画面に持ち込まない。検査を文章パーサーで代用しない。

対象変更・接続変更・元記録更新・画面閉鎖・ロック・ページ離脱で、所有者が最初に世代を更新してhandleを失効させる。controllerは旧待機を拒否し、DOMへtext:nullを同期通知してから購読を解除する。共有する通常の診断記録や保存済み記録を削除しない。実transportが将来接続された場合の切断完了は別契約であり、表示の失効から切断成功を推定しない。

破棄済みhandleの再利用は拒否する。再取得は明示操作に限り、新しい試行とhandleを作る。取得済み文章や画面画像を回収できないことは変わらず、後続操作の許可入力に使わない。失敗時の通知や後片付け自体が失敗した場合も、古いreadyを継続利用しない。

## 実装順と完了条件

手順1のソース確認結果を [Node/browser検査対応表](R2-BROWSER-EVIDENCE-PORT-MAP.md) に記録した。4 APIの依存、参照同一性、入力上限の数え方を確認済み。ブラウザー移植はまだ行っていない。

| 順序 | 成果物 | 受入条件 |
| --- | --- | --- |
| 1 | Node/browser検査の対応表 | 既存検査の所在・依存・入力上限を列挙し、未移植箇所を明示 |
| 2 | 固定模擬receiptのページ内所有者 | 正常・欠落・混在・矛盾をNode結果と照合。caller偽造、複製handle、別所有者を拒否 |
| 3 | controller/DOMとの結合 | 取得中/取得後の失効、閉じ直し、旧成功/旧失敗、通知例外で古い本文が残らない |
| 4 | オフライン開発用見本 | 実vehicle/保存入力なし、正常/拒否の操作、キーボードと390px表示を一巡確認 |
| 別工程 | 実read-only取得器との連携 | 取得元・対象適合・scope発行/失効イベント・復旧を個別にレビューし、対象実機で確認 |

通常UIへ組み込む変更、保存schema変更、診断結果の再分類、実通信許可の変更はこの設計には含めない。模擬工程の終了を実車利用可能とは報告しない。

参照: [画面設計と現在の検証](R2-MONITOR-REVIEW-SCREEN-DESIGN.md)、[最小証拠設計](R2-MINIMAL-COMPARISON-EVIDENCE-DESIGN.md)、[R2非送信モデル](R2-DTC-CLEAR-DESIGN.md)。
