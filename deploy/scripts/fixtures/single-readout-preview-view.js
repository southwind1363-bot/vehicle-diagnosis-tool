import { attachMonitorPreviewView } from "./monitor-preview-view.js";

export function attachSingleReadoutPreviewView(container, review) {
  return attachMonitorPreviewView(container, review, {
    heading: "模擬の一回分の記録",
    labels: { empty: "記録がありません", reading: "一回分の記録を確認中",
      ready: "固定の模擬記録を表示中", invalidated: "記録の確認条件が変わりました",
      unavailable: "記録を確認できません" }
  });
}
