# R2 保存記録の比較予約: 実装契約

基準: `main` / `d4296ebc` / `3.13.512`。対象は `obd-operation-journal.js` のrecord lockと `script.js` の比較・削除UIだけ。保存形式と車両通信は変更しない。

## 固定値

```js
const JOURNAL_RECORD_LOCK_PREFIX = "vehicle-diagnosis-operation-journal-v1/preOperationRecords/";
const TIMEOUT_MS = 5000; // existing operation/preparation bound
const LOCK_ACQUIRE_TIMEOUT_MS = 5000;
const lockName = `${JOURNAL_RECORD_LOCK_PREFIX}${recordId}`;
```

`recordId` は既存の `/^[A-Za-z0-9_-]{1,128}$/` 検証後の値をそのまま連結する。reserveとdeleteは必ず次だけを使う。

```js
navigator.locks.request(lockName, { mode: "exclusive", ifAvailable: true }, callback);
```

`signal`、`steal`、待機queue、poll、retry、lock TTLは使わない。公開済みleaseは時間で解放しない。

## reservePreOperation

```js
reservePreOperation({ recordId, sessionJson, createdAt })
```

入力は `removePreOperation` と同じ3つのown data propertyだけを受理する。既存 `snapshotRemoveInput()`、session/schema/policy/UTF-8/size/safety flag、SHA-256検査をlock要求前に行う。getter、継承値、extra/missing/symbol key、暗黙変換は拒否する。

全結果、lease、executionはfreezeする。

```js
{
  status: "reserved" | "busy" | "unavailable" | "rejected" | "conflict" | "indeterminate",
  reason: string,
  recordId: string | null,
  lease: null | {
    recordId: string,
    isHeld(): boolean,
    release(): Promise<void>
  },
  execution: {
    wouldTransmit: false,
    canExecute: false,
    retryAllowed: false
  }
}
```

新規のstatus/reasonは固定する。

| status | reason | lease | DB開始 |
| --- | --- | --- | --- |
| `reserved` | `record_reserved` | あり | lock内で検証 |
| `busy` | `record_busy` | null | なし |
| `unavailable` | `web_locks_unavailable` | null | なし |
| `indeterminate` | `operation_timeout` | null | pre-lock preparation中はなし |
| `indeterminate` | `lock_acquire_timeout` | null | late callbackではなし |
| `indeterminate` | `lock_request_failed` | null | callback前ならなし |

入力失敗は既存 `rejected` 理由、lock取得後のrecord不在/不一致は `conflict/record_not_found` または `conflict/record_mismatch`、storage失敗は既存理由を維持する。成功時だけ `lease` を返す。

lock callbackは、実IndexedDBからrecordを読み、既存 `storedRecordMatches()` で `recordId/createdAt/exportType/sourceBytes/byteLength/sha256` を入力snapshotと完全照合する。UIが保持するrecord objectだけでは成功させない。transaction完了とDB close後にleaseを公開する。

public acquisition Promiseと `navigator.locks.request()` Promiseを分ける。成功時は前者を `reserved` でresolveし、callbackはrelease gate Promiseを待ってlockを保持する。`lease.release()` は保持状態を同期的にfalseへ変え、gateを一度だけresolveし、lock request Promiseがsettleした後にresolveする同一Promiseを毎回返す。`isHeld()` はrelease開始前だけtrue。

reserveは2つの連続した5秒boundを持つ。既存 `TIMEOUT_MS` timerをAPI進入時、digest開始前に開始し、入力snapshot、session policy、SHA-256を含むpre-lock preparationを `indeterminate/operation_timeout` で区切る。digest Promiseがsettleしなくてもpublic Promiseを必ず完了させ、遅いdigest完了後は `settled` を確認してlock requestを開始しない。preparation完了時にこのtimerを止め、lock request直前に `LOCK_ACQUIRE_TIMEOUT_MS` timerを開始し、request開始からpost-lock record検証とlease公開までを `indeterminate/lock_acquire_timeout` で区切る。

どちらかのtimerが `settled` を確定した後のasync completionは結果を上書きしない。acquisition timeout後にcallbackが来たら最初にreturnし、IndexedDBをopenしない。DB検証中にdeadlineへ達したらtransaction abort、DB close、gate releaseを行い、leaseを公開しない。全非成功経路でtimerをclearし、public Promiseをpendingのまま残さない。

## removePreOperation

返却shapeは既存どおり `{ status, reason, recordId, execution }` で、leaseを加えない。次だけを追加する。

- lock取得不能: `busy/record_busy`。IndexedDB open/deleteは0回。
- Web Locksなし: `unavailable/web_locks_unavailable`。IndexedDB open/deleteは0回。
- request throw/reject: `indeterminate/lock_request_failed`。

既存の単一 `TIMEOUT_MS` timerは移動・再開始せず、API進入時、digest開始前からlock取得、strict CAS、delete、absence readback、callback完了とnative lock request settlementまでを合計5秒で区切る。grantされた正常系の `confirmed/record_removed` はabsence readbackだけでなくnative requestのsettle、つまりlock返却を確認した後にpublic Promiseへ返す。

digest Promise、lock callback、native request Promiseのいずれかがhungしてもpublic Promiseを5秒より長くpendingにしない。timeoutは `indeterminate/operation_timeout` を返し、取得済みならtransaction abort、DB close、callback completionを要求するが、hungしたnative requestのsettleを無期限には待たない。遅いdigest完了後はlock requestを開始せず、timeout後のlate callbackは最初に `settled` を確認してIndexedDBをopenしない。late completionはtimeout結果を上書きしない。

lock取得後だけ既存strict readwrite transactionのCASを実行し、一致時だけ同じtransaction内でdeleteする。別readonly transactionのabsence readbackまで同じWeb Lock callback内で保持する。lock待機、横取り、自動再試行はしない。

## UI stateと失効

`obdOperationJournalComparisonState` に次を持たせる。

```js
{
  generation: number,
  promise: Promise<boolean> | null,
  releasePromise: Promise<void> | null,
  association: null | { /* existing fields */, lease },
  status: string
}
```

比較開始時にgeneration、viewer revision、selection generation、record参照、`recordId/sessionJson/createdAt`、session参照、exportedAtを固定する。現行JSON一致検査後にreserveを1回だけ呼ぶ。

`reserved` 後、promise同一性、generation、viewer/selection、record 3値、session参照と再構築JSON、既存block reason、安全controller、`lease.recordId`、`lease.isHeld()` を再検査する。1つでも変化していればleaseを直ちにreleaseし、association/status/controllerを復活・上書きしない。全条件一致時だけleaseを含むassociationを公開する。

`clearObdOperationJournalComparison()` はgeneration増加、target binding invalidate、association detach、status clear、detachしたleaseのreleaseをこの順で行う。release Promiseを `releasePromise` に保持し、その間は同一タブのcompare/deleteを開始しない。完了後も自動開始しない。

比較候補解除、一覧/選択変更、保存開始、削除開始、session置換、viewer close、OBD tab/mode/stage離脱、access/developer lock、接続/切断/読取失効、`pagehide` は同じclear/release経路を通す。reload/navigation/tab close時はpagehide cleanupに加え、realm破棄によるbrowser側解放も受ける。`visibilitychange:hidden` だけでは解放しない。

## UI文字列

- reserve中: `保存記録を確認して比較を保護しています。`
- reserve busy: `この保存記録は別の同一サイト画面で使用中です。比較候補を解除後、手動で再試行してください。`
- delete busy: `この保存記録は別の同一サイト画面で比較中のため削除しませんでした。比較候補を解除後、必要ならもう一度削除してください。`
- Web Locksなしの比較: `このブラウザでは保存記録の比較保護を利用できません。`
- Web Locksなしの削除: `このブラウザでは比較中の記録を保護できないため削除できません。`

Web Locksなしではcompare/deleteだけをdisabledにする。未保護比較へfallbackしない。save、verify、list、load、exportは現在の可否と処理を変えない。delete busyは `phase:"busy"` とし、selectionを保持する。自動refresh、自動retry、`unknown` 表示にしない。

## 必須検証

1. reserve/removeが同じ3-field検証を行い、事前失敗時はlock/DB call 0回。
2. request optionsがexactで、`signal`/`steal`/retryなし。
3. held recordのdeleteが `busy/record_busy`、DB open/delete 0回。
4. delete先行後のreserveがpost-lock readで `record_not_found`、associationなし。
5. hung digestでreserve/removeが5秒後に `operation_timeout` となり、public Promiseを残さない。
6. acquisition deadline後callbackがDBを開始せず、reservedを返さない。
7. reserve成功中はlock request Promiseがpendingで、release後だけsettleする。
8. acquire中の選択/lock/close/session変更後にlate successを返してもrelease 1回、association復活なし。
9. release後もdeleteは自動実行されず、新しい明示clickだけがstrict CAS/readbackを行う。
10. granted removeのpublic Promiseはnative lock返却後だけ成功し、直後の同名lock取得がbusyにならない。
11. digest/callback/native requestの各hangでもremoveは合計5秒で `operation_timeout` を返し、late callbackはDBを開始しない。
12. Web Locksなしでcompare/deleteだけdisabled、save/list/load/export回帰なし。
13. 全経路で車両送信0回、`wouldTransmit/canExecute/retryAllowed` はfalse。

## 限界

保護は同じorigin/storage bucketを共有する、この契約を実装した協調build間だけのadvisory lockである。旧 `3.13.512`、直接IndexedDB操作、サイトデータ消去、異なるbrowser/profile/origin/bucketは迂回できる。車両bus、VCI、ECU、global/OS lease、認証ではない。

仕様根拠: W3C Web Locks API, Working Draft 24 September 2025: <https://www.w3.org/TR/web-locks/>
