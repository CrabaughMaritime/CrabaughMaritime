const colors = ['#19546f', '#a56328', '#30816d', '#7961a0', '#b34d61', '#527893', '#84712d', '#46633c', '#ad674f', '#527c80'];

export function expenseDonut(title, rows, field, { esc, money }) {
  const groups = new Map();
  for (const row of rows) {
    if (row.type !== 'expense') continue;
    const cents = Math.round(Number(row.amount) * 100);
    if (!(cents > 0)) continue;
    const name = row[field] || (field === 'category' ? 'Uncategorized' : 'Unassigned');
    groups.set(name, (groups.get(name) || 0) + cents);
  }
  const entries = [...groups].sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, cents]) => sum + cents, 0);
  let start = 0;
  const stops = [];
  const legend = entries.map(([name, cents], i) => {
     const end = i === entries.length - 1 ? 100 : start + cents / total * 100;
    const color = colors[i % colors.length];
    stops.push(`${color} ${start}% ${end}%`);
    start = end;
    const percent = cents / total * 100;
    return `<li><i style="background:${color}"></i><span>${esc(name)}</span><strong>${percent < .1 ? '&lt;0.1' : percent.toFixed(1)}%</strong><span>${money(cents / 100)}</span></li>`;
  }).join('');
  const fill = stops.length ? `conic-gradient(${stops.join(',')})` : '#edf0f3';
  return `<section class="panel expense-chart"><h2>${esc(title)}</h2><div class="chart-body">
    <div class="donut" style="background:${fill}"><div><small>Total expenses</small><strong>${money(total / 100)}</strong></div></div>
    ${legend ? `<ul class="chart-legend">${legend}</ul>` : '<p class="muted">No expenses to display.</p>'}
  </div></section>`;
}

export function expenseTracking(rows, { esc, money, options, cats, types }) {
  const distinct = (field) => [...new Set(rows.map(row => row[field]).filter(Boolean))].sort();
  return `<div id="expense-charts" class="twocol"></div>
    <section class="panel expense-sheet"><h2>Transaction spreadsheet</h2>
      <form id="expense-filters" class="formgrid">
        <label class="wide">Search transactions<input name="query" type="search" placeholder="Description, bank ID, account, or notes"></label>
        <label>Category<select name="category"><option value="">All categories</option>${options([...new Set([...cats, ...distinct('category')])])}</select></label>
        <label>Account<select name="account"><option value="">All accounts</option>${options(distinct('account'))}</select></label>
        <label>Type<select name="type"><option value="">All types</option>${options(types)}</select></label>
        <label>Status<select name="status"><option value="">All current</option><option value="manual">Manual</option><option value="imported">Bank imported</option><option value="reconciled">Reconciled</option><option value="removed">Removed by bank</option></select></label>
        <label>From<input name="from" type="date"></label>
        <label>To<input name="to" type="date"></label>
      </form>
      <p id="expense-count" class="muted" aria-live="polite"></p>
      <div class="tablewrap"><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Account</th><th>Type</th><th>Amount</th><th>Bank status</th><th>Actions</th></tr></thead><tbody id="expense-rows"></tbody></table></div>
            <div class="rowactions sheet-pages"><button class="secondary" id="expense-prev">Previous</button><button class="secondary" id="expense-next">Next</button></div>
    </section>`;
}

export function bindExpenseTracking(rows, filters, { esc, money, actions }) {
  const form = document.getElementById('expense-filters');
  if (!form) return;
  const previous = document.getElementById('expense-prev');
  const next = document.getElementById('expense-next');
  const pageSize = 50;
  let page = 0;
  for (const [field, value] of Object.entries(filters)) {
    form.elements.namedItem(field).value = value;
  }
  const render = () => {
       const values = Object.fromEntries(new FormData(form));
    Object.assign(filters, values);
    const { query, category, account, type, from, to, status } = values;
    const term = query.trim().toLowerCase();
    const matching = rows.filter(row => {
      const state = row.bank_removed ? 'removed' : row.bank_reconciled ? 'reconciled' : row.bank_transaction_id ? 'imported' : 'manual';
      return (status ? status === state : state !== 'removed')
        && (!category || category === row.category) && (!account || account === row.account)
        && (!type || type === row.type) && (!from || from <= row.date) && (!to || to >= row.date)
        && (!term || [row.description, row.bank_description, row.bank_provider_name, row.bank_transaction_id, row.category, row.account, row.notes, row.person]
          .some(value => String(value ?? '').toLowerCase().includes(term)));
    });
       document.getElementById('expense-charts').innerHTML = [
      expenseDonut('Expenses by Category', matching.filter(row => !row.bank_removed), 'category', { esc, money }),
      expenseDonut('Expenses by Account', matching.filter(row => !row.bank_removed), 'account', { esc, money })
    ].join('');
    const offset = page * pageSize;
    document.getElementById('expense-count').textContent = matching.length
      ? `Showing ${offset + 1}–${Math.min(offset + pageSize, matching.length)} of ${matching.length} transactions`
      : 'No matching transactions';
    previous.disabled = page === 0;
    next.disabled = offset + pageSize >= matching.length;
    document.getElementById('expense-rows').innerHTML = matching.slice(offset, offset + pageSize).map(row => `<tr>
         <td>${esc(row.date)}</td><td><strong>${esc(row.bank_description ?? row.bank_provider_name ?? row.description)}</strong>${(row.bank_description ?? row.bank_provider_name ?? row.description) !== row.description ? `<small>Ledger memo: ${esc(row.description)}</small>` : ''}</td>
      <td>${esc(row.category)}</td><td>${esc(row.account)}</td><td>${esc(row.type)}</td><td>${money(row.amount)}</td>
      <td>${row.bank_removed ? 'Removed' : row.bank_reconciled ? 'Reconciled' : row.bank_transaction_id ? 'Imported' : 'Manual'}<small>${esc(row.bank_transaction_id)}</small>${row.bank_transaction_id ? `<small>${esc(row.bank_date)} · ${money(row.bank_amount)}</small>${row.bank_description == null ? '<small>Provider label</small>' : ''}` : ''}</td>
            <td><div class="rowactions">${actions(row)}</div></td></tr>`).join('');
  };
  form.onsubmit = event => event.preventDefault();
  form.oninput = () => { page = 0; render(); };
  previous.onclick = () => { page--; render(); };
  next.onclick = () => { page++; render(); };
  render();
}
