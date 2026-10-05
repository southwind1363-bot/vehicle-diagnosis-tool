# R2 通常read-only取得からの記録受渡し契約

## 2026-10-06: 非通信モデルの実装範囲

`scripts/fixtures/readonly-receipt-owner.js`を追加。管理元ごとの私有WeakMapと現在ticketの参照一致で一試行を認識する。beginは旧試行を失効し、appendは4 commandの順序、宣言profile、非負の整数時刻順序、complete、transcript長1～32768を確認する。時刻は試験入力の数値であり実取得時刻の証明ではない。profileもcaller_declared_onlyで、通信設定を観測したとは主張しない。

finishは四つの構造がそろった場合だけreceiptStructureCompleteを返す。NO DATAや任意文字列も意味解析せず、payloadSemanticsVerified・網羅性・実車・比較・消去・実行関連flagはすべてfalse。返却summaryにrawやticketを含めない。finished/rejected/失効で内部配列のraw参照を解放するが、caller側の文字列やJSメモリの物理消去を保証するものではない。

同じ形/JSON複製/別所有者/旧世代、遅着、二重終了、欠落/重複/順序/時刻/profile/上限、例外、accessor非実行、反射操作中の世代変更を107項目で確認。既存receipt検証とCIから実行する。受信入力を扱うAPIは開発用モデルだけであり、実取得元の認証境界ではない。

次はこのモデルと固定のraw意味検証の受渡しを設計・検証する。現在のsummaryを検証済みpayloadや表示readyとして使用しない。通常UI、transport、DOM通知、保存への配線は未実装。


2026-10-06。ソース確認に基づく設計。通常UIへの接続、取得器の変更、保存形式の変更、実車試験は未実施。

## 今回の判断

固定模擬ページの成功を、そのまま通常診断の前後比較へ接続しない。次の実装単位は、通信を行わない取得記録所有者の試験モデルとする。既存Web Serialの読取・診断表示・保存は維持し、取得時の証拠と加工済み表示値を分ける。

二回のread-only取得は消去境界の証拠にならない。まず一回の取得記録の寿命だけを扱い、模擬clear受信や固定日時を実取得へ挿入しない。実消去前後比較、Mode04送信、成功判定はこの契約に含めない。

## 現行ソースと不足

参照箇所はすべて [script.js](script.js) の関数名で示す。

| 現行箇所 | ソースで確認した動作 | 受渡しに必要な変更・制限 |
| --- | --- | --- |
| `sendElmDeveloperCommand` / `readElmDeveloperResponse` | commandごとにport/reader/writer・revision・処理所有者を確認し、許可リストを通して送信 | この所有者の内側で取得情報を発行する。UIやJSONが指定するtokenを認証に使わない |
| `takeCompletedElmDeveloperResponse` | 末尾promptを除去、CRをLFへ変換、trimして返す | 返却文字列へpromptを付け直してraw証拠と呼ばない。加工前の境界を扱う設計・試験が必要 |
| `runObdDeveloperRead` | `{command,response,responseElapsedMs}`を蓄積。読取全体の開始日時と失敗/中断を扱う | command別の開始/終了、受信完了状態、試行所有者を失わず結び付ける。成功応答だけで欠落commandを補完しない |
| `buildWebSerialAttemptTranscript` | command見出しを付けた文字列へ再構成する | 再構成文は表示・既存解析用。取得証拠に昇格させない |
| `appendObdDeveloperLog` | redact後に連結し末尾20000文字へ制限 | ログから完全なreceiptや取得順序を復元しない |
| `retainObdDeveloperReadout` | 解析値・過去のsnapshotを組み合わせ通常sessionへ反映 | `lastSession`や保存済みsnapshotは単一試行のraw証拠ではない。既存表示を壊さず別所有者に保持する |
| adapter初期化 | `ATE0`,`ATL0`,`ATS0`,`ATH1`,`ATSP0`を使用 | 固定fixtureの`iso15765_11bit_normal_h1_caf1_d0_s1_e0`を転記しない。S0/S1の差、CAF/D設定、11bit/29bit・protocolの確認が必要 |
| `createObdDtcClearTargetBindingController` | port等の現行参照を検査するがECU scopeは`not_observed`、対象/実行は未成立 | source IDや車名が一致してもscope・実車同一性・消去対象の証明へ昇格させない |

この確認はWeb Serial経路に限定する。ローカルbridge、J2534、native、replay/importは別の取得元契約を必要とし、同じ文字列形式という理由だけで参加させない。

## 新しい所有者の最小契約（未実装）

所有者は一ページ・一接続世代・一取得試行に限定する。生成時の私有登録で発行した参照だけを認識し、同じ形のobject、JSON複製、別所有者・旧世代の参照は拒否する。外部から任意factoryやraw記録を渡せる通常UI APIは作らない。

取得器が持つ情報を、正規化前のcommand応答、順番、開始/終了、完了/timeout/中断/切断、設定の観測根拠、接続・対象・試行の私有参照に分ける。欠測した値は未観測として保持し、現在時刻や固定profileで埋めない。設定確認のための新しい送信もこの工程では行わない。

最初の非通信モデルでは固定4 intent（stored/pending/permanent DTC、readiness）の期待順序を開始時に固定する。既存の任意command読取を四つの完全receiptへ見せかけない。実取得器への配線は、そのモデルの受入条件と対応する設定profileが成立してから別変更で行う。

資源上限はモデルで明示し、超過時は試行を拒否・破棄する。切捨て後の末尾や途中までの記録を完全取得としない。既存fixtureの数値上限は [対応表](R2-BROWSER-EVIDENCE-PORT-MAP.md) を参照できるが、現在のtransport bufferに適用済みとは扱わない。

UIへ渡すのは検査後の派生値と保留理由だけ。raw/tokenはDOM・ログ・保存へ追加しない。取得の完了と、payloadの意味、対応ECU、同一車両、網羅性、消去境界は別判定とする。既存の実行/車両送信flagを有効化せず、模擬sessionに実記録を入れない。

## 失効イベントの配線候補

| イベント | 現行の確認箇所 | 新所有者で必要な動作 |
| --- | --- | --- |
| 新しい読取開始 | `runObdDeveloperRead`の開始時に既存target bindingを失効 | 待機前に旧所有記録を失効、旧本文を同期消去 |
| 手動切断・通信断 | `disconnectObdDeveloperVci`、`handleObdSerialDisconnect` | 切断完了を待たず表示handleを失効。通常の失敗記録は保持 |
| ロック | `lockObdDeveloperMode`とaccess lock経路 | handle失効と表示解除。切断成功とは別に扱う |
| 元sessionの置換 | `handleObdReadoutSessionReplacement` | 旧sessionに結び付くhandleを失効。共有診断記録は削除しない |
| pagehide | 既存journal comparisonの解除listener | 新所有者にも同期失効を配線。履歴復帰で自動再取得しない |
| 対象/接続設定変更・表示閉鎖 | 新所有者の実装時に全入口を列挙 | awaitや再描画より先に世代更新と失効。候補一覧だけで配線完了としない |

通信断時は既存の診断失敗を保持するためserial revisionを増やさない場合がある。新所有者の失効をrevision増加だけに依存させない。表示破棄からtransport切断完了を推定しない。

## 次の変更単位と受入条件

1. 非通信の私有所有者モデルを作る。transport、通常UI、保存先には接続しない。
2. 同一所有者・同一世代だけ受理し、複製・別所有者・失効後・二重終了・遅着を拒否する試験を作る。
3. command欠落/重複/順序違い、未観測profile、timeout/切断、上限超過を完全な取得へ補正しない。NO DATAは取得ゼロの証明にしない。
4. 各終了経路でrawの所有を解放し、検査失敗から自動再取得しない。通知や表示に失敗しても旧readyを残さない。
5. 以上の後に実取得器のraw境界・設定確認を別レビューし、実機接続と最終可否は利用者が判断する。

通常UIへの組込みを先行させず、既存の診断表示・保存schema・read-only許可リストを変更しない。関連確認元は `validate-serial-lifecycle.js`、`validate-dtc-clear-target-binding.js` と固定模擬ブラウザー試験。既存試験の成功を未実装の契約成立とは報告しない。
