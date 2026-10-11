// Review fixture only. Not loaded by the application.
export const proposedInsightRenderer = String.raw`function renderObdMonitorInsights(insights = [], monitorValues = []) {
  const recorded = insights.filter(Boolean);
  const current = window.ObdReadOnly?.analyzeMonitorValues?.(monitorValues) || [];
  if (!recorded.length && !current.length) return;
  const renderRows = (list, rows) => rows.forEach(item => {
    const li = document.createElement("li");
    li.className = item.level === "caution" ? "is-caution" : "is-info";
    const title = document.createElement("strong"); title.textContent = item.title || "確認ポイント";
    const detail = document.createElement("span"); detail.textContent = item.detail || "測定条件とメーカー整備書の基準値を確認してください。";
    const next = document.createElement("em"); next.textContent = "次の確認: " + (item.nextStep || "同じ条件で再測定し、DTCとフリーズフレームと照合する");
    li.append(title, detail, next); list.appendChild(li);
  });
  if (current.length) {
    const heading = document.createElement("h4"); heading.textContent = "この記録の値から再計算した参考情報";
    const note = document.createElement("p"); note.textContent = "実車の現在状態ではありません。記録全体を対象にしており、画面の絞り込みには連動しません。";
    const list = document.createElement("ul"); list.dataset.insightGroup = "recalculated";
    renderRows(list, current); obdMonitorInsightList.append(heading, note, list);
  }
  if (recorded.length) {
    const heading = document.createElement("h4"); heading.textContent = "記録内の分析文（出所未確認）";
    const note = document.createElement("p"); note.textContent = "作成元・作成時点は確認できません。この記録の値との整合性が確認済みとは限りません。";
    const count = document.createElement("p"); const list = document.createElement("ul"); list.dataset.insightGroup = "recorded";
    const more = document.createElement("button"); more.type = "button";
    let shown = 0;
    const appendNext = () => {
      renderRows(list, recorded.slice(shown, shown + 6)); shown = Math.min(shown + 6, recorded.length);
      count.textContent = "記録内の分析文: " + shown + " / " + recorded.length + "件を表示";
      more.hidden = shown >= recorded.length;
      more.textContent = "記録内の分析文をさらに表示（残り" + (recorded.length - shown) + "件）";
    };
    more.addEventListener("click", appendNext); appendNext();
    obdMonitorInsightList.append(heading, note, count, list, more);
  }
  obdMonitorInsightList.hidden = false;
}`;
