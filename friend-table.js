export function friendTable({ settings, update, status }) {
  const page = new URL(location.href);
  const base = page.pathname.replace(/index\.html$/, '').replace(/\/?$/, '/');
  let code = page.searchParams.get('code')?.toUpperCase() || '';
  let socket, table, you, options, online = false, waiting = false;
  let clientId;

  const dialog = document.createElement('dialog');
  dialog.className = 'card';
  dialog.style.color = 'inherit';
  dialog.style.width = 'min(460px, calc(100% - 32px))';
  dialog.style.boxSizing = 'border-box';
  dialog.setAttribute('aria-labelledby', 'friend-table-title');
  dialog.innerHTML = `
    <h2 id="friend-table-title">Play with friends</h2>
    <label>Invite link <input class="nameinput" style="width:100%;margin:6px 0" readOnly></label>
    <div><button class="btn" data-copy>Copy invite link</button>
    <button class="btn ghost" data-leave>Leave table</button></div>
    <p role="status"></p>
    <ul></ul>
    <button class="btn" data-start hidden disabled>Start online game</button>`;
  document.body.append(dialog);
  const link = dialog.querySelector('input');
  const message = dialog.querySelector('[role=status]');
  const start = dialog.querySelector('[data-start]');
  const send = data => {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(data));
    return true;
  };
  const host = () => !!you && table?.host_id === you;
  const show = text => {
    message.textContent = text;
    if (!dialog.open) dialog.showModal();
  };
  const showTable = () => {
    const connected = table.players.filter(player => player.connected);
    start.hidden = !host();
    start.disabled = connected.length < 2;
    dialog.querySelector('ul').replaceChildren(...connected.map(player => {
      const item = document.createElement('li');
      item.textContent = player.username + (player.user_id === you ? ' (you)' : '');
      return item;
    }));
    show(host() ? 'Send the invite link to a friend.' : 'Waiting for the host to start.');
  };

  function connect() {
    const url = new URL(base + 'table/' + code, page);
    url.protocol = page.protocol === 'https:' ? 'wss:' : 'ws:';
    const connection = new WebSocket(url);
    socket = connection;
    connection.addEventListener('open', () => {
      const key = `bf-friend:${base}${code}`;
      try {
        clientId ||= sessionStorage.getItem(key) || crypto.randomUUID();
        sessionStorage.setItem(key, clientId);
      } catch { clientId ||= crypto.randomUUID(); }
      send({ t: 'hello', clientId, name: options?.name || (options ? 'Host' : 'Friend') });
    });
    connection.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      if (data.t === 'welcome') you = data.you;
      if (data.table) {
        table = data.table;
        if (!online && !table.started) showTable();
      }
      if (data.t === 'state') {
        waiting = false;
        online = true;
        dialog.close();
        update(data.state, you);
      }
      if (data.t === 'error') show(data.message || 'Could not join the table.');
    });
    connection.addEventListener('close', event => {
      waiting = false;
      if (event.code === 4001) return;
      if (event.code === 4000) {
        status('This table is open in another tab.');
        return;
      }
      if (!online && !you) {
        show('Could not connect to the friend table.');
        return;
      }
      status('Connection lost. Reconnecting…');
      if (!online) show('Reconnecting…');
      setTimeout(connect, 1200);
    });
  }

  function displayLink() {
    const roomSettings = `bf-settings:${base}${code}`;
    try {
      if (options) sessionStorage.setItem(roomSettings, JSON.stringify(options));
      else options = JSON.parse(sessionStorage.getItem(roomSettings) || 'null');
    } catch { /* The active tab can still start the table. */ }
    page.searchParams.set('code', code);
    link.value = page.href;
    history.replaceState(null, '', page);
    show('Connecting…');
    connect();
  }

  async function invite() {
    const selected = settings();
    if (!selected || dialog.open) return;
    options = selected;
    show('Creating invite link…');
    try {
      const response = await fetch(base + 'api/table', { method: 'POST' });
      if (!response.ok) throw new Error('Table creation failed');
      ({ code } = await response.json());
      displayLink();
    } catch { show('Could not create a table. Leave the table and try again.'); }
  }

  dialog.querySelector('[data-copy]').onclick = async () => {
    if (!link.value) return;
    try {
      await navigator.clipboard.writeText(link.value);
      message.textContent = 'Invite link copied.';
    } catch { link.select(); }
  };
  dialog.querySelector('[data-leave]').onclick = () => location.assign(base);
  dialog.addEventListener('cancel', event => event.preventDefault());
  start.onclick = () => {
    if (!host()) return;
    const rules = options || settings();
    if (rules && send({ t: 'rules', ...rules })) send({ t: 'start' });
  };

  return {
    invite,
    join() {
      if (/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/.test(code)) displayLink();
      else if (code) show('This invite link has an invalid table code.');
    },
    get online() { return online; },
    get connected() { return socket?.readyState === WebSocket.OPEN && !waiting; },
    move(payload) {
      waiting = send({ t: 'action', action: 'move', payload });
    },
    leave() { location.assign(base); },
  };
}
