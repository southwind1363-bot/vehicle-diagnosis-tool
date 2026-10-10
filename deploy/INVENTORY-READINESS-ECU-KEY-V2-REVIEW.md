# Readiness・ECU情報の集計キー移行案

2026-10-11 / 本体3.13.663 / 本体への移行は未適用

## 現行本体で再現した問題

Readinessでは経路A|BとA Bが同じ集計キーになる。通常JSON取込では監視状態2行を保持するが、集計キーは1件になり、経路だけが異なる記録を比較可能・変化なしとする。バス・チャネル・ゲートウェイ経路の縦棒/空白、未指定/文字列ハイフンの両順序12ケースで再現した。

ECU情報の項目キー、CAL ID/CVN比較キー、Mode09対応情報種別キーは経路を含まない。上記12ケースに加え、普通のCAN-PTとCAN-BODYでも衝突する。通常JSON取込で4項目を保持しても項目キーは2件、同じCAL IDは1キー、同じMode09対応情報種別は1キーになる。

部分取得では、以前の記録はCAN-PTだけ取得済み・CAN-BODYは未解析、現在の記録はその逆でも、ECU番号7E8が共通であるためCAL-AからCAL-Bへの変更として比較する。取得できた経路が共通しないため、同一対象の変更とは判断できない。

これらは固定データによる再現であり、実車結果ではない。元の監視状態・ECU情報の行が失われるという結果ではなく、集計キーと保存比較の問題である。

## 変更対象とキー形式

ReadinessとECU情報は独立した版で管理し、片方の旧版が他方の比較を不要に止めない構成とする。既存のcore_readout_inventory_v1と元の読取行は維持する。

| 対象 | 版フィールド（camel/snake両方） | キー接頭辞とJSON配列 |
| --- | --- | --- |
| Readiness状態 | readinessKeyVersion / readiness_key_version = 2 | readiness_monitor_v2: [id, sourceEcu, supportedState, completeState, bus, channel, route] |
| ReadinessのECU経路 | 同上 | readiness_scope_v2: [sourceEcu, bus, channel, route] |
| ECU情報の項目 | ecuInfoKeyVersion / ecu_info_key_version = 2 | ecu_info_item_v2: [id, infoTypeOrDid, sourceEcu, bus, channel, route] |
| ECU情報の比較対象値 | 同上 | ecu_info_value_v2: [id, infoTypeOrDid, sourceEcu, comparableValue, bus, channel, route] |
| Mode09対応情報種別 | 同上 | mode09_type_v2: [infoType, sourceEcu, bus, channel, route] |
| ECU情報/Mode09のECU経路 | 同上 | ecu_info_scope_v2: [sourceEcu, bus, channel, route] |

経路は既存の正規化と全半角/大小文字の整合を利用する。未指定はnull、文字列ハイフンは文字列として保持し、縦棒はJSONのUnicodeエスケープで保存する。経路の矛盾・不正形式は比較対象外にする。

取得済み・未解決のECU経路キーを保持し、部分取得はECU番号と経路が一致する範囲だけ比較する。未指定経路を指定済み経路の代用にはしない。Readinessのsupported/complete/unknownの意味と、ECU情報の現在の正規化・個人情報抑制は変更しない。値比較の対象は従来どおりCAL IDとCVNに限定し、VIN等へ広げない。

## 旧記録との互換性（確認対象）

- 旧ファイルを読み込む機能と元の監視状態・ECU情報は保持する。元の行に経路があれば新しい現在集計を生成するが、保存されていた旧集計との比較は不可とする。
- Readinessの旧形式とv2の混在、旧経路付き形式同士は比較不可。経路未指定の旧形式同士の既存比較は維持する。
- ECU情報の旧キーは経路の有無自体を表現していないため、旧形式同士を含め、この詳細比較は不可とする。失われた経路を推測して補わない。新形式同士で経路未指定が一致する場合は、その未指定の範囲として扱う。
- 対象種別の版・aliasが矛盾する場合やキーが不正な場合も比較不可。追加/削除が空配列というだけで「変化なし」と表示せず、通常画面へ比較不可の理由を表示する。
- Readiness・ECU情報・Mode09それぞれの比較結果と保存復元を一体で更新する。FF・ライブ値v2、対応PID・Mode06等のキーはこの移行に含めない。

## 完了した検査

実行: node deploy/scripts/validate-inventory-readiness-ecu-key-review.js

304項目合格。Readiness 12ケース、ECU情報14ケース（計26ケース）、取得済み経路が共通しない部分取得の例を本体関数で再現した。通常JSON取込と保存復元で元の行が保持されること、同一経路の通常比較、本体ソースが未変更であることも確認した。これは現行不具合の再現検査であり、修正完了の検査ではない。

## 適用後の検証

承認後に旧出力を固定fixtureへ保存し、本体実装と受入検査へ移る。同一/異なる/未指定/矛盾する経路、完全/部分取得、未知状態、旧版混在、不正キー・alias、CAL/CVNのみの値比較、個人情報抑制、通常JSON取込・再保存・画面表示を検証する。全体OBD、ブリッジ、オフライン、端末起動、配布ZIP、公開内容一致まで確認する。通信権限やECUへの書込みは追加しない。

保存される派生キーと旧記録の比較可否を変えるため、開発計画の契約・保存形式の確認対象として本体適用前に提示する。前回のFF移行の承認を、このReadiness・ECU情報移行の承認としては扱わない。
