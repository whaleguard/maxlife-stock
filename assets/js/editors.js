// 리딩/공지 편집기 — 사용자 앱(강사)·관리자 페이지 공용
const Editors = (() => {
  const { $, $$, esc } = U;
  function postEditor(p) {
    p = p || { kind: 'trade', side: 'buy', result: 'open', resultPct: 0, code: '005930', title: '', body: '', video: '', image: '' };
    const opts = Market.list().map((q) => `<option value="${q.code}" ${q.code === p.code ? 'selected' : ''}>${esc(q.name)} (${q.code})</option>`).join('');
    U.modal({
      title: p.id ? '리딩 수정' : '리딩 작성', size: 'lg', body: `
      <form id="pf">
        <div class="grid g-3" style="gap:12px"><div class="field"><label>유형</label><select class="input" name="kind"><option value="trade" ${p.kind === 'trade' ? 'selected' : ''}>매매 시연</option><option value="lesson" ${p.kind === 'lesson' ? 'selected' : ''}>강의</option></select></div>
        <div class="field tr"><label>종목</label><select class="input" name="code">${opts}</select></div>
        <div class="field tr"><label>구분</label><select class="input" name="side"><option value="buy" ${p.side !== 'sell' ? 'selected' : ''}>매수</option><option value="sell" ${p.side === 'sell' ? 'selected' : ''}>매도</option></select></div></div>
        <div class="field"><label>제목</label><input class="input" name="title" value="${esc(p.title)}" required maxlength="100"></div>
        <div class="grid g-4 tr" style="gap:12px"><div class="field"><label>진입가</label><input class="input" name="entry" value="${p.entry || ''}" inputmode="decimal"></div><div class="field"><label>목표가</label><input class="input" name="target" value="${p.target || ''}" inputmode="decimal"></div><div class="field"><label>손절가</label><input class="input" name="stop" value="${p.stop || ''}" inputmode="decimal"></div><div class="field"><label>결과</label><select class="input" name="result"><option value="open">진행중</option><option value="target">목표가 도달</option><option value="stop">손절</option><option value="closed">종료</option></select></div></div>
        <div class="field tr"><label>결과 수익률 (%)</label><input class="input" name="resultPct" value="${p.resultPct || ''}" inputmode="decimal" placeholder="예: 7.6 / -4.5"></div>
        <div class="field"><label>진입 근거 · 본문</label><textarea class="input" name="body" rows="8">${esc(p.body)}</textarea></div>
        <div class="grid g-2" style="gap:12px"><div class="field"><label>강의 영상 URL (유튜브)</label><input class="input" name="video" value="${esc(p.video || '')}" placeholder="https://youtu.be/..."></div><div class="field"><label>차트 캡처 이미지 URL (선택)</label><input class="input" name="image" value="${esc(p.image || '')}" placeholder="https://..."></div></div>
        <p class="dim" style="font-size:12px">매매 시연은 종목의 실제 일봉 차트 위에 진입·목표·손절 라인이 자동으로 표시됩니다. 진입가를 비워두면 현재가가 입력됩니다.</p>
      </form>`,
      foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="pfOk">게시</button>',
      onMount: (m, close) => {
        const f = $('#pf', m); f.result.value = p.result || 'open';
        const tog = () => $$('.tr', m).forEach((x) => (x.style.display = f.kind.value === 'trade' ? '' : 'none')); f.kind.onchange = tog; tog();
        $('#pfOk', m).onclick = async () => {
          const o = Object.fromEntries(new FormData(f)); const q = Market.quote(o.code);
          const num = (v) => parseFloat(String(v).replace(/,/g, '')) || 0;
          const data = { ...p, ...o, entry: num(o.entry) || (q ? q.price : 0), target: num(o.target), stop: num(o.stop), resultPct: num(o.resultPct) };
          if (data.kind !== 'trade') Object.assign(data, { code: '', side: '', entry: 0, target: 0, stop: 0, result: '', resultPct: 0 });
          try { await Store.savePost(data); close(); U.toast('게시되었습니다.'); } catch (e) { U.toast(e.message, true); }
        };
      },
    });
  }
  function noticeEditor(n) {
    n = n || { title: '', body: '', pinned: false };
    U.modal({
      title: n.id ? '공지 수정' : '공지 작성', body: `<div class="field"><label>제목</label><input class="input" id="nT" value="${esc(n.title)}" maxlength="100"></div><div class="field"><label>내용</label><textarea class="input" id="nB">${esc(n.body)}</textarea></div><label class="check"><input type="checkbox" id="nP" ${n.pinned ? 'checked' : ''}> 상단 고정</label>`,
      foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="nOk">등록</button>',
      onMount: (m, close) => { $('#nOk', m).onclick = async () => { try { await Store.saveNotice({ ...n, title: $('#nT', m).value, body: $('#nB', m).value, pinned: $('#nP', m).checked }); close(); U.toast('등록되었습니다.'); } catch (e) { U.toast(e.message, true); } }; },
    });
  }
  return { postEditor, noticeEditor };
})();
