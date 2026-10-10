# DTC取込の通信経路識別修正（承認済み・本体適用）

2026-10-10 / 旧版 Web 3.13.658 / 適用版 Web 3.13.659

## 確認した問題

同じ故障コード・ECU・状態でも、通信経路が異なれば別の観測である。修正前3.13.658の `normalizeDtcSnapshot` と `normalizeBridgeDtcSnapshot` は、経路の `|` を空白へ変換し、欠落欄を `-` として照合する。このため異なる経路が同一扱いされ、入力2行のうち1行が重複として省かれる例を再現した。実車での発生確認ではない。

| 入力の例（同じP0171、ECU 7E8、stored） | 3.13.658 | 3.13.659 |
| --- | --- | --- |
| バス `CAN|A` と `CAN A` | 1行 | 別経路の2行を保持 |
| バスCAN、チャネル `-` と未指定 | 1行 | 別経路の2行を保持 |
| チャネル1、バス `-` と未指定 | 1行 | 別経路の2行を保持 |
| バスCAN、ゲートウェイ経路 `-` と未指定 | 1行 | 別経路の2行を保持 |
| チャネルまたは経路 `a|b` と `a b` | 1行 | 別経路の2行を保持 |
| 全半角・大小文字等の表記揺れだけ | 同一経路として統合 | 維持 |

## 適用範囲

DTC専用の `getDtcReadoutNetworkScopeIdentity` を追加し、上記2つの正規化関数内の経路キー呼出しを差し替えた。

```js
function getDtcReadoutNetworkScopeIdentity(input = {}) {
  const scope = normalizeReadoutNetworkScope(input);
  if (scope.conflict) return null;
  if (!scope.provided) return "";
  return JSON.stringify([scope.networkBus, scope.networkChannel, scope.gatewayRoute]
    .map(value => value === null ? null : value.normalize("NFKC").toLowerCase()));
}
```

既存の経路正規化を使い、矛盾の扱いと経路未指定を維持する。既存の共通キーは変更しない。コード・ECU・状態などの照合規則は変更しない。記録の値を推定・換算しない。FF関連付けや取得充足度など、他の共通キー利用箇所は今回の修正対象外。

保存schemaは維持するが、入力に両方の経路がある場合は取込後・再保存後のDTC行数や派生件数が増える。診断結果の契約に関わる変更として適用前に確認し、利用者の「続けて」を受けて反映した。旧版で失われた行は推測して追加しない。

## 検証済みの範囲

`node deploy/scripts/validate-dtc-scope-key-proposal.js`: 215項目合格。

- 適用前は2つのDTC正規化関数だけを差し替えた隔離VMで比較。適用後は旧版3.13.658の結果を固定fixtureに保存し、本体コードを使う215項目の回帰検証へ切り替えた。
- 6種類の衝突を前後両順序で確認。両正規化関数で1行→2行を確認。
- 正規化の再実行でも経路付き2行を保持。
- 実際のJSON取込関数とエクスポート関数で、2行の保存・復元を確認。
- 同一経路、全半角・大小文字・空白・別名フィールド、通常の別経路、経路矛盾などは旧結果と一致。
- stored/pending/permanent/unknownの各状態、別経路のunknownが誤って消える例を確認。
- 入力不変、vehicleCommandEnabled:false、wouldTransmit:falseを確認。
- 旧版で1行だけになった保存ファイルから架空の2行目を作らない。

既存の注意点: 正規化済みオブジェクトをそのまま `normalizeDtcSnapshot` へ再投入すると、コード配列由来の経路未指定unknown行が加わる例がある。修正前にも発生するため、その補助行が旧結果と同じであることを比較した。今回のJSON取込・エクスポートの経路では2行を保持した。全入口の再正規化を解決したとは扱わない。

画面側の重複除外キーにも経路を含め、カードの読取状態と検索にバス・チャネル・経路を追加した。DTC表示151項目、実JSON取込で2カード表示・経路名による検索・390/1280px明暗・保存復元を確認（readiness-review-FRFunz）。実車・VCI試験ではない。

## 適用確認

利用者の適用確認を受け、本体3.13.659へ反映した。共通の経路キー、FF関連付け、取得充足度の意味は変更していない。
