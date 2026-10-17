# 限定解析器への接続条件の監査

確認日: 2026-10-17。本体3.13.698は変更していない。

## 確認できた境界

`node deploy/scripts/report-parser-connection.js` は本体の `createWebSerialReadoutCapture` と `parseElmReadOnlyRawTranscript` を隔離したVMで読み、固定した11ケースを比較する。sender・アプリ起動・実通信は使わない。取得前条件は合成値であり、実機の設定証明ではない。解析器へのprofile指定も試験内で明示した仮定で、本体への認定ではない。

| 合成ケース | 本体の文字形照合 | 試験内でprofileを明示した解析器 | 判断 |
| --- | --- | --- | --- |
| 対応する応答・全取得前条件あり | 不一致なし | responses_observed | 内容の正当性・実車由来は未証明 |
| 別サービスへの応答 | 不一致なし | unexpected_response_service | 文字形だけでは要求との対応を判断できない |
| 不正なPCI | 不一致なし | unsupported_pci | 文字形だけではフレーム構造を判断できない |
| NO DATA | no_frame_evidence | no_response | 正常なゼロ件応答へ置き換えない |
| 単独LF | framing_mismatch | error | 表示用の正規化文字列から原文を作り直さない |
| 通信番号未観測 | protocol_unconfirmed | responses_observed | 解析器が処理できても取得前条件は不足 |
| CAN設定ACKのいずれか不足（3ケース） | can_settings_unconfirmed | responses_observed | 同上。後のACKによる補完は禁止 |
| 不完全な取得前記録 | settings_before_read_unavailable | responses_observed | 欠落を既定値で埋めない |
| 設定世代変更 | 記録失効・照合なし | 独立した固定文字列は処理可能 | 本体記録を復活させる根拠にならない |

全ケースで本体profileはnull、parserAllowed・executionEnabledはfalse。試験内の解析器もpayloadSemanticsVerifiedはfalse。監査出力には原文を含めない。

## 次工程の条件

1. 取得条件: 同一の接続・設定世代、読取開始前の7条件、元の終端と文字列、対象コマンドの順序を維持する。条件不足・失効では対象記録を解析経路へ渡さない。
2. 形式の根拠: 初期化ACKと文字形だけからprofileを自動認定しない。機器ごとの出力形式・対象プロトコルとの対応根拠は別に必要。現段階では未確認。
3. フレーム照合: profileが明示された試験経路で、PCI・分割フレーム・応答サービス・レディネスPID・負応答・NO DATAを区別する。解析成功と正常判定を同一にしない。
4. 内容判定: DTC件数やレディネス本文の妥当性、ECUの欠落・混在を既存の内容判定へ渡す。文字形照合だけで診断結果や消去前後比較を作らない。
5. 寿命: 取消・切断・設定変更・遅着・二重消費で古い記録を破棄する。既存診断結果と保存JSONは保持する。

次に実機なしで進める範囲は、試験経路でのフレーム照合結果を読取項目別にまとめ、異常応答・条件不足・世代失効を混同せずに表示できることの検証。本体の診断結果へ接続する変更は、その結果と変更範囲を具体化してから判断する。機材購入・実車接続はまだ不要。

## 検証と確信度

`node deploy/scripts/validate-parser-connection.js`：47項目・11ケースが合格。本体4資産の不変、監査結果の再現性、原文非出力、実行許可なしを含む。本体の文字形照合と解析器が異なる結果を返すという結論への確信度は高い。実アダプターの設定・出力形式・車両適合は未確認。

この変更は開発用監査と文書だけで、本体・一般decoder・保存schema・版番号を変更しない。前回の診断全体検査は3.13.698で通過済みだが、今回それを再実行したという意味ではない。
