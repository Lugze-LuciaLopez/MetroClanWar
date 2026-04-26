// Validator UI controller — read-only stream of events received by the
// validator-peer, plus a button to trigger an immediate WEEKLY_RESULT
// publication via the validator-bridge WebSocket.

const port = new URLSearchParams(location.search).get('port') || '8786';

const counts = { recv: 0, ok: 0, bad: 0 };
let ws = null;

function setStatus(text) { document.getElementById('v-status').innerText = text; }
function setVId(id)      { document.getElementById('v-id').innerText = id; }
function refreshCounts() {
    document.getElementById('v-count-recv').innerText = counts.recv;
    document.getElementById('v-count-ok').innerText   = counts.ok;
    document.getElementById('v-count-bad').innerText  = counts.bad;
}

function shortId(id) { return id ? `${id.slice(0, 8)}…` : '—'; }

function pushEvent({ kind, event, reason }) {
    const list = document.getElementById('v-events');
    const li = document.createElement('li');
    const cls = {
        received: 'ev-recv',
        accepted: 'ev-ok',
        rejected: 'ev-bad',
        published: 'ev-pub'
    }[kind];
    li.className = `ev-row ${cls} pl-3 py-1`;

    const icon = { received: '·', accepted: '✓', rejected: '✗', published: '★' }[kind];
    const type = event?.type ?? '?';
    const player = shortId(event?.playerId);
    const extra = event?.payload?.clanId
        ? ` ${event.payload.clanId}${event.payload.points != null ? ` +${event.payload.points}` : ''}`
        : '';
    const reasonStr = reason ? ` — ${reason}` : '';
    li.innerHTML = `<span class="opacity-60">${icon}</span> <span class="font-bold">${type}</span> <span class="opacity-60">${player}</span>${extra}${reasonStr}`;
    list.prepend(li);
    while (list.children.length > 200) list.lastChild.remove();
}

function setLastPublished(event) {
    const wid = event?.weekId ?? event?.payload?.weekId ?? '?';
    document.getElementById('v-last-published').innerText = `${event.type} ${wid}`;
}

function handle(msg) {
    switch (msg.type) {
        case 'HELLO':
            setVId(msg.validatorId);
            break;
        case 'EVENT_RECEIVED':
            counts.recv++; refreshCounts();
            pushEvent({ kind: 'received', event: msg.event });
            break;
        case 'EVENT_ACCEPTED':
            counts.ok++; refreshCounts();
            pushEvent({ kind: 'accepted', event: msg.event });
            break;
        case 'EVENT_REJECTED':
            counts.bad++; refreshCounts();
            pushEvent({ kind: 'rejected', event: msg.event, reason: msg.reason });
            break;
        case 'EVENT_PUBLISHED':
            pushEvent({ kind: 'published', event: msg.event });
            setLastPublished(msg.event);
            break;
        case 'COMPUTE_DONE':
            pushEvent({ kind: 'published', event: { type: 'COMPUTE', payload: { result: msg.published ? 'published' : 'no events to compute' } } });
            break;
        case 'COMPUTE_ERROR':
            pushEvent({ kind: 'rejected', event: { type: 'COMPUTE_ERROR' }, reason: msg.message });
            break;
    }
}

function connect() {
    const url = `ws://localhost:${port}`;
    setStatus(`connecting…`);
    try { ws = new WebSocket(url); }
    catch { setStatus('error'); return; }
    ws.onopen    = () => setStatus(`connected (port ${port})`);
    ws.onclose   = () => { setStatus('disconnected — retrying in 2s'); setTimeout(connect, 2000); };
    ws.onerror   = () => {};
    ws.onmessage = (e) => { try { handle(JSON.parse(e.data)); } catch {} };
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-compute').onclick = () => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: 'computeNow' }));
    };
    refreshCounts();
    connect();
});
