// Development-only DOM adapter. Never treats display snapshots as execution authority.
export function attachMonitorPreviewView(container, review, copy = {}) {
  const document = container.ownerDocument;
  const panel = document.createElement("section");
  const heading = document.createElement("h2");
  heading.textContent = copy.heading ?? "模擬の前後記録";
  const notice = document.createElement("p");
  notice.textContent = "実車の読取結果ではありません。実車比較は未確認・車両送信なし。";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const failure = document.createElement("p");
  failure.className = "receipt-failure-reason";
  failure.setAttribute("aria-live", "polite");
  const output = document.createElement("pre");
  output.style.whiteSpace = "pre-wrap";
  output.style.overflowWrap = "anywhere";
  output.style.fontFamily = "inherit";
  panel.append(heading, notice, status, failure, output);
  container.append(panel);
  let active = true;
  const labels = Object.freeze({ empty: "前後記録がありません", reading: "前後記録を確認中",
    ready: "固定の模擬記録を表示中", invalidated: "記録の確認条件が変わりました",
    unavailable: "前後記録を確認できません", ...copy.labels });
  const render = snapshot => {
    if (!active) return;
    // Clear before interpreting a replacement, including unknown or malformed state.
    output.textContent = "";
    output.hidden = true;
    failure.textContent = "";
    failure.hidden = true;
    status.textContent = labels.unavailable;
    panel.setAttribute("aria-busy", "false");
    const allowed = snapshot?.provenance === "simulated_only"
      && ["executionEnabled", "vehicleCommandEnabled", "wouldTransmit", "canExecute"].every(key => snapshot[key] === false);
    const known = allowed && Object.hasOwn(labels, snapshot.status);
    const ready = known && snapshot.status === "ready" && typeof snapshot.text === "string";
    const reasons = {
      receipt_incomplete: "応答の取得が完了しませんでした。途中の記録は表示しません。",
      receipt_clock_unavailable: "取得時刻を確認できませんでした。記録は表示しません。",
      receipt_context_changed: "取得中に接続または設定が変わりました。以前の条件の記録は表示しません。"
    };
    if (known && snapshot.status === "unavailable" && Object.hasOwn(reasons, snapshot.failureReason)) {
      failure.textContent = reasons[snapshot.failureReason];
      failure.hidden = false;
    }
    status.textContent = known && (snapshot.status !== "ready" || ready) ? labels[snapshot.status] : labels.unavailable;
    panel.setAttribute("aria-busy", String(known && snapshot.status === "reading"));
    if (ready) { output.textContent = snapshot.text; output.hidden = false; }
  };
  let unsubscribe;
  try {
    unsubscribe = review.subscribe(render);
    render(review.inspect());
  } catch (error) {
    active = false;
    if (typeof unsubscribe === "function") unsubscribe();
    panel.remove();
    throw error;
  }
  return Object.freeze({
    dispose() {
      if (!active) return;
      active = false;
      output.textContent = "";
      failure.textContent = "";
      panel.remove();
      unsubscribe();
    }
  });
}
