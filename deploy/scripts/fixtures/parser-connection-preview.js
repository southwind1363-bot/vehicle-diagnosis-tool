// Development-only, explicitly declared fixture profile. Never imported by the application.
const fields = ['initializationComplete', 'echoOffAcknowledged', 'spacesOffAcknowledged', 'protocol11bitReported',
  'canAutoFormatAcknowledged', 'dlcOffAcknowledged', 'canExtendedAddressOffAcknowledged'];
const names = { '03': '保存DTC', '07': '保留DTC', '0A': '永久DTC', '0101': 'レディネス' };
export function createParserConnectionPreview(owner, api, fixtureRecords) {
  let disposed = false;
  // The caller owns synthetic data only. Copy it so later mutation cannot replace the sample.
  const records = fixtureRecords.map(row => ({ command: row.command, transcript: row.transcript }));
  const unavailable = () => Object.freeze({ state: 'unavailable', items: Object.freeze([]),
    text: '模擬検証専用。取得条件が失効または未完了のため、解析結果を表示しません。', executionEnabled: false });
  return Object.freeze({
    inspect() {
      if (disposed) return unavailable();
      try {
        const snapshot = owner.inspect();
        const conditions = snapshot.formatReview?.readoutConditions;
        if (snapshot.status !== 'finished' || !conditions || conditions.length !== 4 || records.length !== 4
          || records.some((row, index) => row.command !== ['03', '07', '0A', '0101'][index] || conditions[index].command !== row.command)) return unavailable();
        const items = [];
        for (let index = 0; index < records.length; index++) {
          const row = records[index];
          let status = 'conditions_missing';
          if (fields.every(field => conditions[index][field] === true)) {
            const result = api.parseElmReadOnlyRawTranscript({ profile: 'iso15765_11bit_normal_h1_caf1_d0_s0_e0',
              command: row.command, transcript: row.transcript, completion: 'complete' });
            status = result.status === 'error' ? 'format_rejected' : result.status === 'no_response' ? 'no_response'
              : result.status === 'responses_observed' ? (result.frames?.some(frame => frame.responseKind === 'matching_negative_service') ? 'negative_response' : 'response_observed') : 'unavailable';
          }
          if (disposed || owner.inspect().status !== 'finished') return unavailable();
          items.push(Object.freeze({ command: row.command, status }));
        }
        // Suppress the entire result if lifetime changes during parsing, including reentry/disposal.
        if (disposed || owner.inspect().status !== 'finished') return unavailable();
        const labels = { conditions_missing: '取得前条件が不足（解析しません）', format_rejected: '応答形式・要求との対応を確認できません',
          negative_response: '負応答あり（正常な取得とは判断しません）', no_response: '応答データなし（コード0件とは判断しません）', response_observed: '対応する応答を観測（内容の妥当性は未確認）', unavailable: '解析結果を確認できません' };
        return Object.freeze({ state: 'ready', items: Object.freeze(items), executionEnabled: false,
          text: ['模擬検証専用。試験で指定した形式による照合であり、実車の診断結果ではありません。',
            ...items.map(row => names[row.command] + '：' + labels[row.status]), '実行許可なし。原文は表示・保存しません。'].join('\n') });
      } catch { return unavailable(); }
    },
    dispose() { disposed = true; records.length = 0; }
  });
}

export function attachParserConnectionPreviewView(container, preview) {
  container.style.whiteSpace = 'pre-line';
  container.style.overflowWrap = 'anywhere';
  container.setAttribute('role', 'status');
  let disposed = false;
  const render = () => { container.textContent = disposed ? '' : preview.inspect().text; };
  render();
  return Object.freeze({ render, dispose() { disposed = true; preview.dispose(); render(); } });
}
