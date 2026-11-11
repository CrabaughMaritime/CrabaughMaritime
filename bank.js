const linkScript = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
const pendingKey = 'crabaugh-plaid-link';

async function loadPlaid() {
  if (window.Plaid) return window.Plaid;
  const script = document.createElement('script');
  script.src = linkScript;
  const loaded = new Promise((resolve, reject) => {
    script.onload = () => window.Plaid ? resolve(window.Plaid) : reject(Error('Plaid Link did not initialize.'));
    script.onerror = () => { script.remove(); reject(Error('Plaid Link could not load.')); };
  });
  document.head.append(script);
  return loaded;
}

export function bankPanel() {
  return `<section class="panel bank-panel" id="bank-panel">
      <div class="sectionhead"><h2>Bank connections</h2><button id="bank-link">Link a bank</button></div>
    <p class="muted">Map each checking, savings, or credit card to a workspace account. Only mapped accounts import posted transactions.</p>
    <div id="bank-status" role="status" class="notice" hidden></div><div id="bank-list" class="muted">Loading…</div>
  </section>`;
}

export async function bindBankPanel({ sb, orgId, userId, accounts, esc, options, load }) {
  const panel = document.getElementById('bank-panel');
  if (!panel) return;
  const list = panel.querySelector('#bank-list');
  const link = panel.querySelector('#bank-link');
  const status = panel.querySelector('#bank-status');
  const message = (text, success = false) => {
        status.className = success ? 'notice ok' : 'notice';
    status.textContent = text;
    status.hidden = false;
  };
  async function request(action, fields = {}) {
    const { data, error } = await sb.functions.invoke('bank', { body: { action, orgId, ...fields } });
    if (error) {
      const payload = await error.context?.json?.().catch(() => null);
      throw Error(payload?.error || 'The bank service is unavailable. Check the Supabase Edge Function setup.');
    }
    return data;
  }
  async function refresh() {
    const result = await request('list');
    list.innerHTML = result.connections.map(connection => `<section class="bank-account">
      <div class="sectionhead"><h3>${esc(connection.institution_name)}</h3>
             <button class="secondary" data-reconnect="${esc(connection.id)}">Reconnect</button></div>
      ${result.accounts.filter(account => account.connection_id === connection.id).map(account => `<form class="formgrid bank-account" data-bank-map="${esc(account.id)}">
        <p class="wide"><strong>${esc(account.name)}</strong> · ${esc(account.subtype || 'Account')}${account.mask ? ' · •••• ' + esc(account.mask) : ''}</p>
        <label class="wide">Workspace account<select name="ledgerAccount">
          <option value="">${account.ledger_account ? 'Pause imports' : 'Do not import'}</option>
          ${options([...new Set([...accounts, account.ledger_account].filter(Boolean))], account.paused ? '' : account.ledger_account)}
        </select></label>
        <button>Save mapping</button>
                ${account.ledger_account && !account.paused ? `<button type="button" class="secondary" data-bank-sync="${esc(account.id)}">Sync now</button>` : ''}
        ${account.last_synced_at ? `<small class="wide">Last synced ${esc(new Date(account.last_synced_at).toLocaleString())}</small>` : ''}
        ${account.sync_issue ? `<small class="wide">${esc(account.sync_issue)}</small>` : ''}
      </form>`).join('')}
    </section>`).join('') || '<p>No banks linked yet.</p>';
  }
  async function run(button, operation) {
    if (panel.dataset.busy) return;
    panel.dataset.busy = 'true';
    button.disabled = true;
    status.hidden = true;
    try {
      await operation();
    } catch (error) {
      message(error.message);
    } finally {
          delete panel.dataset.busy;
      button.disabled = false;
    }
  }
  async function startLink(connectionId, resume = null) {
    const token = resume?.token || (await request('link', { connectionId })).token;
    const Plaid = await loadPlaid();
    if (!resume) sessionStorage.setItem(pendingKey, JSON.stringify({ token, connectionId, orgId, userId }));
    await new Promise((resolve, reject) => {
      const finish = (error) => {
        sessionStorage.removeItem(pendingKey);
        if (resume) {
          const url = new URL(location.href);
          url.searchParams.delete('oauth_state_id');
          history.replaceState({}, '', url);
        }
                handler.destroy();
        if (error) reject(error);
        else resolve();
      };
      const handler = Plaid.create({
        token,
        ...(resume ? { receivedRedirectUri: location.href } : {}),
        onSuccess: async publicToken => {
          try {
            if (!connectionId) await request('exchange', { publicToken });
            await refresh();
            message(connectionId ? 'Bank access renewed. Use Sync now to check for new transactions.'
              : 'Bank linked. Choose the workspace account for each subaccount.', true);
            finish();
          } catch (error) { finish(error); }
        },
        onExit: error => finish(error ? Error('Bank linking ended before it could complete.') : null)
      });
      handler.open();
         });
  }
  link.onclick = () => run(link, () => startLink(null));
  list.onclick = event => {
    const sync = event.target.closest('[data-bank-sync]');
    const reconnect = event.target.closest('[data-reconnect]');
    if (sync) run(sync, async () => {
      const result = await request('sync', { accountId: sync.dataset.bankSync });
      await load();
      const currentStatus = document.getElementById('bank-status');
      if (currentStatus) {
        currentStatus.className = 'notice ok';
        currentStatus.textContent = `Sync complete. ${result.imported} new or updated transactions.`;
        currentStatus.hidden = false;
      }
    });
        if (reconnect) run(reconnect, () => startLink(reconnect.dataset.reconnect));
  };
  list.onsubmit = event => {
    event.preventDefault();
    const form = event.target;
    const ledgerAccount = new FormData(form).get('ledgerAccount');
    run(event.submitter || form.querySelector('button'), async () => {
      await request('map', { accountId: form.dataset.bankMap, ledgerAccount });
      await refresh();
      message(ledgerAccount ? 'Mapping saved. Use Sync now to import available transactions.' : 'Imports paused for this account.', true);
    });
  };
  try {
    await refresh();
    if (new URL(location.href).searchParams.has('oauth_state_id')) {
      const saved = JSON.parse(sessionStorage.getItem(pendingKey) || 'null');
            if (saved?.orgId !== orgId || saved?.userId !== userId) {
        const url = new URL(location.href);
        url.searchParams.delete('oauth_state_id');
        history.replaceState({}, '', url);
        throw Error('This bank link session expired. Start again from Link a bank.');
      }
      await run(link, () => startLink(saved.connectionId, saved));
    }
  } catch (error) {
    list.textContent = '';
    message(error.message);
  }
}

export function openReconciliation(source, transactions, { sb, orgId, esc, money, load }) {
  const dialog = document.getElementById('reconcile-dialog');
  const day = 86400000;
    const candidates = transactions.filter(row => !row.bank_transaction_id &&
    row.account.toLowerCase() === source.account.toLowerCase() &&
    Math.round(Number(row.amount) * 100) === Math.abs(Math.round(Number(source.bank_amount) * 100)) &&
    Math.abs(Date.parse(row.date) - Date.parse(source.bank_date)) <= 7 * day);
  dialog.innerHTML = `<div class="sectionhead"><h2 id="reconcile-title">Match bank transaction</h2>
    <button class="secondary" data-close-dialog>Close</button></div>
    <p>${esc(source.bank_date)} · ${esc(source.bank_description ?? source.bank_provider_name ?? source.description)} · ${money(source.bank_amount)}</p>
    ${candidates.length ? `<form class="formgrid">
      <p class="wide muted">Matching keeps the manual entry’s accounting fields, adds the bank details, and moves any receipts to it.</p>
            <label class="wide">Existing manual transaction<select name="manual" required>
        <option value="">Choose a transaction</option>${candidates.map(row =>
          `<option value="${esc(row.id)}">${esc(row.date + ' · ' + row.description + ' · ' + money(row.amount))}</option>`
        ).join('')}</select></label><button class="wide">Match transactions</button><p class="wide notice" hidden role="alert"></p>
    </form>` : '<p class="muted">No manual transaction has the same account and amount within seven days of the bank posting date.</p>'}`;
  dialog.querySelector('[data-close-dialog]').onclick = () => dialog.close();
  const form = dialog.querySelector('form');
  if (form) form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('button');
        button.disabled = true;
    try {
      const { error } = await sb.rpc('reconcile_bank_transaction', {
        p_org: orgId, p_import: source.id, p_manual: new FormData(form).get('manual')
      });
      if (error) throw error;
      dialog.close();
      await load();
    } catch (error) {
      const status = form.querySelector('[role=alert]');
      status.textContent = error.message;
      status.hidden = false;
    } finally { button.disabled = false; }
  };
  dialog.showModal();
}
