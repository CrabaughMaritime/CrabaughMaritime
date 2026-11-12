import {createClient} from '@supabase/supabase-js';
import './style.css';
import './expense-tracking.css';
import { expenseDonut, expenseTracking, bindExpenseTracking } from './expenses.js';
import { receiptTools } from './receipts.js';
import { bankPanel, bindBankPanel, openReconciliation } from './bank.js';
const SUPABASE_URL=import.meta.env.VITE_SUPABASE_URL, KEY=import.meta.env.VITE_SUPABASE_ANON_KEY;
const configured=!!(SUPABASE_URL&&KEY&&SUPABASE_URL.startsWith('https://')&&!SUPABASE_URL.includes('YOUR_'));
const sb=configured?createClient(SUPABASE_URL,KEY):null;
const app = document.getElementById('app');
const LOGO = '/F00CE726-03EB-43DA-A800-E88A6CF4DD82.png';
const expenseFilters = {};
let workspaceRole = null; let vendors = [];
let session=null,org=null,transactions=[],reminders=[],receipts=[],tab='Dashboard',loading=false,editingTransactionId=null;const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);
const today=()=>new Date().toLocaleDateString('en-CA');
const month=()=>today().slice(0,7);
const options=(arr,selected='')=>arr.map(x=>`<option value="${esc(x)}" ${x===selected?'selected':''}>${esc(x.charAt(0).toUpperCase()+x.slice(1))}</option>`).join('');const cats = [
  'Travel', 'Fuel', 'Vessel Supplies', 'Maintenance', 'Insurance',
  'Medical', 'Software', 'Office Supplies', 'Household Supplies',
  'Animals', 'Entertainment', 'Donations', 'Charity', 'Meals',
  'Professional Fees', 'Training', 'Phone & Internet', 'Vehicle',
  'Advertising', 'Advertisement', 'Payroll Expense', 'Taxes',
  'Other', 'Uncategorized'
];
const types=['expense','income','payroll','distribution','transfer','reimbursement'];
const accounts=[
  'Business Checking',
  'Joint Account',
  'Chris Business Credit Card',
  'Kayleen Business Credit Card',
  'Chris Personal Checking',
  'Chris Chase Credit Card',
  'Chris BofA Credit Card',
  'Kayleen Personal Checking',
  'Kayleen Chase Credit Card',
  'Kayleen Personal Chase Credit Card',
  'Kayleen Amex'
];
const kinds=['Payroll','Expense','Meeting','Tax','Accounting','Other'];
const recur=['None','Weekly','Monthly','Quarterly','Yearly'];
const shell=(content)=>`<div class="shell"><aside><button type="button" class="brand" data-tab="Dashboard" aria-label="Crabaugh Maritime Dashboard"><img src="${LOGO}" alt=""><span><strong>CRABAUGH</strong><small>MARITIME</small></span></button><nav>${['Dashboard','Expense Tracking','Transactions','Vendors','Receipts','Payroll','Reminders','Tax Center','Team'].map(x=>`<button data-tab="${x}" class="${tab===x?'active':''}">${x}</button>`).join('')}</nav><div class="asidebottom"><span>${esc(session?.user?.email||'')}</span><button id="logout-sidebar">Sign out</button></div></aside><main><header><div><span class="eyebrow">BUSINESS WORKSPACE</span><h1>${esc(tab)}</h1></div><div class="header-actions"><button type="button" class="topright" data-tab="Dashboard" aria-label="Crabaugh Maritime Dashboard"><span>${esc(org?.name||'Crabaugh Maritime')}</span><img src="${LOGO}" alt=""></button><button id="logout" type="button" style="background:#b91c1c;color:white;border:0;border-radius:8px;padding:10px 12px;cursor:pointer;font-size:13px;white-space:nowrap;">Sign Out</button></div></header><div class="content">${content}</div></main></div>`;
function notice(message,kind='error'){const el=document.getElementById('notice');if(el){el.textContent=message;el.className='notice '+kind;el.hidden=false;}}
function showSetup(){app.innerHTML=`<section class="auth"><img src="${LOGO}"><h1>Crabaugh Maritime</h1><p>Deployment configuration is required. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in Vercel, then redeploy.</p><p>Follow the included README.md to create the Supabase database and security policies.</p></section>`;}
function showAuth() {
  app.onclick = null;
  app.innerHTML = `
    <section class="auth">
      <img src="${LOGO}" alt="Crabaugh Maritime">
      <h1>Crabaugh Maritime</h1>
      <p>Secure business accounting workspace</p>

      <div class="panel">
        <h2>Sign in or create an account</h2>
        <div id="notice" hidden></div>

        <form id="authform">
          <label>Email
            <input name="email" type="email" required
              autocomplete="username" placeholder="you@example.com">
              </label>
          <label>Password
            <input name="password" type="password" minlength="8"
              required autocomplete="current-password">
          </label>

          <div class="actions">
            <button type="submit" name="mode" value="signin">
              Sign in
            </button>
            <button type="submit" name="mode" value="signup"
              class="secondary">
              Create account
            </button>
          </div>
        </form>

        <p>
          <button id="forgot-password" type="button"
            class="linkbtn">Forgot Password?</button>
        </p>

        <p class="muted">
          If email confirmation is enabled, check your inbox.
        </p>
      </div>
    </section>
  `;

  const form = document.getElementById('authform');
    form.onsubmit = async e => {
    e.preventDefault();
    const mode = e.submitter?.value === 'signup' ? 'signup' : 'signin';
    const f = new FormData(form);
    const email = f.get('email');
    const password = f.get('password');

    const { error, data } = mode === 'signup'
      ? await sb.auth.signUp({ email, password })
      : await sb.auth.signInWithPassword({ email, password });

    if (error) return notice(error.message);

    if (mode === 'signup' && !data.session) {
      return notice('Check your email to confirm your account.', 'ok');
    }

    session = data.session;
    await initialize();
  };

  document.getElementById('forgot-password').onclick = async () => {
    const email = form.elements.email.value.trim();

    if (!email) {
      return notice('Enter your email address first.');
    }

    const button = document.getElementById('forgot-password');
    button.disabled = true;

    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
      });

      if (error) throw error;

      notice(
        'If an account exists for this email, a password reset link will be sent. Check your inbox.',
        'ok'
      );
    } catch (error) {
      notice(error.message);
    } finally {
      button.disabled = false;
    }
  };
}
function showPasswordReset() {
  app.onclick = null;
  app.innerHTML = `
    <section class="auth">
      <img src="${LOGO}" alt="Crabaugh Maritime">
      <h1>Reset Password</h1>

      <div class="panel">
        <h2>Create a new password</h2>
        <div id="notice" hidden></div>

        <form id="resetform">
          <label>New password
            <input name="password" type="password"
              minlength="8" autocomplete="new-password"
              required>
          </label>

          <label>Confirm password
            <input name="confirm" type="password"
              minlength="8" autocomplete="new-password"
              required>
          </label>

          <button type="submit">Update Password</button>
        </form>
      </div>
    </section>
  `;

  document.getElementById('resetform').onsubmit = async e => {
    e.preventDefault();

    const f = new FormData(e.target);
    const password = f.get('password');
    const confirm = f.get('confirm');

    if (password !== confirm) {
      return notice('Passwords do not match.');
    }

    const { error } = await sb.auth.updateUser({ password });

    if (error) return notice(error.message);

    notice('Password updated successfully!', 'ok');

    setTimeout(async () => {
      await sb.auth.signOut();
      session = null;
      org = null;
      window.history.replaceState({}, '', window.location.pathname);
      showAuth();
    }, 1500);
  };
}
async function initialize(){if(!session){showAuth();return;}try{await sb.rpc('claim_my_invites');const {data,error}=await sb.from('memberships').select('org_id,role,organizations(id,name)').limit(1);if(error)throw error;if(!data?.length){showOrgCreate();return;}org=data[0].organizations;workspaceRole=data[0].role;
if (new URL(location.href).searchParams.has('oauth_state_id')) tab = 'Expense Tracking';
await load();}catch(e){app.innerHTML=`<section class="auth"><h2>Unable to load workspace</h2><p>${esc(e.message)}</p><button id="retry">Retry</button></section>`;document.getElementById('retry').onclick=initialize;}}
function showOrgCreate(){app.innerHTML=`<section class="auth"><img src="${LOGO}"><h1>Create your business workspace</h1><div id="notice" hidden></div><form id="orgform" class="panel"><label>Business name<input name="name" value="Crabaugh Maritime" required maxlength="100"></label><button>Create workspace</button></form><p class="muted">If you were invited, sign in using the exact invited email address.</p><button id="logout">Sign out</button></section>`;document.getElementById('logout').onclick=logout;document.getElementById('orgform').onsubmit=async e=>{e.preventDefault();const name=new FormData(e.target).get('name');const {data,error}=await sb.from('organizations').insert({name,owner_id:session.user.id}).select().single();if(error)return notice(error.message);const r=await sb.from('memberships').insert({org_id:data.id,user_id:session.user.id,role:'owner'});if(r.error)return notice('Workspace created, but membership setup failed: '+r.error.message);org=data;workspaceRole='owner';await load();};}
async function readWorkspaceRows(table, orgId) {
  const rows = [];
  let lastId = null;
  for (;;) {
    let query = sb.from(table).select('*').eq('org_id', orgId).order('id').limit(500);
    if (lastId) query = query.gt('id', lastId);
    const { data, error } = await query;
    if (error) throw error;
    if (!data.length) return rows;
    rows.push(...data);
    lastId = data[data.length - 1].id;
  }
}
async function load() {
  const orgId = org.id;
  const userId = session.user.id;

  const [ledger, reminderResult, files, vendorRows] = await Promise.all([
    readWorkspaceRows('transactions', orgId),
    sb.from('reminders').select('*').eq('org_id', orgId).order('due_date'),
    readWorkspaceRows('receipts', orgId),
    readWorkspaceRows('vendors', orgId)
  ]);

  if (reminderResult.error) throw reminderResult.error;
  if (org?.id !== orgId || session?.user.id !== userId) return;

  transactions = ledger.sort(
    (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)
  );
  reminders = reminderResult.data || [];
  receipts = files.sort(
    (a, b) => (b.created_at || '').localeCompare(a.created_at || '')
  );
  vendors = vendorRows.sort((a, b) => a.name.localeCompare(b.name));

  render();
}
const accountName = name => name === 'Business checking' ? 'Business Checking' : name;
const accountOptions = () => [...new Set([...accounts, ...transactions.map(t => accountName(t.account)).filter(Boolean)])];
const currentTransactions = () => transactions.filter(t => !t.bank_removed);
const getReceiptTools = () => receiptTools({ sb, orgId: org.id, transactions, receipts, cats, esc, money, options, load });
function vendorPage() {
  return `<div class="twocol">
    <section class="panel">
      <h2>Vendor details</h2>
      <div id="notice" hidden role="alert"></div>
      <form id="vendor-form" class="formgrid">
        <label class="wide">Company name
          <input name="company" maxlength="200" required>
        </label>
        <div id="vendor-contacts" class="wide"></div>
        <button type="button" id="add-contact" class="secondary">
          Add contact
        </button>
        <button type="submit">Save vendor</button>
        <button type="button" id="cancel-vendor" class="secondary" hidden>
          Cancel editing
        </button>
      </form>
    </section>
    <section class="panel">
      <h2>Saved vendors</h2>
      ${vendors.map(vendor => `<div class="listrow">
        <div>
          <strong>${esc(vendor.name)}</strong>
          <small>${vendor.contacts.length} contacts</small>
        </div>
        <div class="rowactions">
          <button type="button" class="secondary"
            data-vendor-edit="${esc(vendor.id)}">Edit</button>
          ${workspaceRole === 'owner' ? `
            <button type="button" class="secondary"
              data-vendor-delete="${esc(vendor.id)}">Delete</button>
          ` : ''}
        </div>
      </div>`).join('') || '<p class="muted">No vendors yet.</p>'}
    </section>
  </div>`;
}

function bindVendorPage() {
  const form = document.getElementById('vendor-form');
  if (!form) return;

  const orgId = org.id;
  const company = form.elements.namedItem('company');
  const contacts = document.getElementById('vendor-contacts');
  const cancel = document.getElementById('cancel-vendor');
  let vendorId = null;

  function addContact(contact = {}) {
    contacts.insertAdjacentHTML('beforeend', `<fieldset>
      <legend>Contact</legend>
      <label>Name
        <input name="contact_name" maxlength="200" value="${esc(contact.name)}">
      </label>
      <label>Email
        <input name="contact_email" type="email" maxlength="254"
          value="${esc(contact.email)}">
      </label>
      <label>Phone
        <input name="contact_phone" type="tel" maxlength="50"
          value="${esc(contact.phone)}">
      </label>
      <button type="button" class="secondary">Remove contact</button>
    </fieldset>`);

    const row = contacts.lastElementChild;
    row.querySelector('button').onclick = () => row.remove();
  }

  document.getElementById('add-contact').onclick = () => addContact();

  cancel.onclick = () => {
    vendorId = null;
    form.reset();
    contacts.replaceChildren();
    cancel.hidden = true;
  };

  document.querySelectorAll('[data-vendor-edit]').forEach(button => {
    button.onclick = () => {
      const vendor = vendors.find(row => row.id === button.dataset.vendorEdit);
      if (!vendor) return;

      vendorId = vendor.id;
      company.value = vendor.name;
      contacts.replaceChildren();
      vendor.contacts.forEach(addContact);
      cancel.hidden = false;
      company.focus();
    };
  });

  document.querySelectorAll('[data-vendor-delete]').forEach(button => {
    button.onclick = async () => {
      if (!confirm('Delete this vendor? Its transactions will be kept.')) return;

      button.disabled = true;
      try {
        const { error } = await sb.from('vendors').delete()
          .eq('org_id', orgId)
          .eq('id', button.dataset.vendorDelete)
          .select('id')
          .single();

        if (error) throw error;
        await load();
      } catch (error) {
        notice(error.message);
      } finally {
        button.disabled = false;
      }
    };
  });

  form.onsubmit = async event => {
    event.preventDefault();
    if (loading) return;

    loading = true;
    const save = form.querySelector('[type="submit"]');
    save.disabled = true;

    try {
      const name = company.value.trim();
      if (!name) throw Error('Enter a company name.');

      const rows = [...contacts.querySelectorAll('fieldset')].map(row => ({
        name: row.querySelector('[name=contact_name]').value.trim(),
        email: row.querySelector('[name=contact_email]').value.trim(),
        phone: row.querySelector('[name=contact_phone]').value.trim()
      })).filter(contact => Object.values(contact).some(Boolean));

      const query = vendorId
        ? sb.from('vendors').update({ name, contacts: rows })
            .eq('org_id', orgId).eq('id', vendorId)
        : sb.from('vendors').insert({ org_id: orgId, name, contacts: rows });

      const { error } = await query.select('id').single();
      if (error) throw error;

      await load();
    } catch (error) {
      notice(error.code === '23505'
        ? 'A vendor with this name already exists.'
        : error.message);
    } finally {
      loading = false;
      save.disabled = false;
    }
  };
}function render(){let content='';const m=currentTransactions().filter(x=>x.date?.startsWith(month())),exp=m.filter(x=>x.type==='expense').reduce((a,x)=>a+Number(x.amount),0),pay=m.filter(x=>x.type==='payroll').reduce((a,x)=>a+Number(x.amount),0),income=m.filter(x=>x.type==='income').reduce((a,x)=>a+Number(x.amount),0);const upcoming=reminders.filter(x=>!x.completed).slice(0,8);
if(tab==='Dashboard')content=`${expenseDonut('Expenses by Category', currentTransactions(), 'category', { esc, money })}<div class="stats"><div class="stat"><span>MONTHLY INCOME</span><strong>${money(income)}</strong></div><div class="stat"><span>OPERATING EXPENSES</span><strong>${money(exp)}</strong></div><div class="stat"><span>PAYROLL TRANSFERS</span><strong>${money(pay)}</strong></div><div class="stat"><span>UPCOMING REMINDERS</span><strong>${upcoming.length}</strong></div></div><div class="twocol"><section class="panel"><div class="sectionhead"><h2>Recent transactions</h2><button data-tab="Transactions" class="linkbtn">View all</button></div>${txTable(currentTransactions().slice(0,7))}</section><section class="panel"><div class="sectionhead"><h2>Upcoming</h2><button data-tab="Reminders" class="linkbtn">Manage</button></div>${reminderList(upcoming)}</section></div><p class="hint">Transfers and shareholder distributions are tracked separately from deductible operating expenses. Reports are informational, not filed tax returns.</p>`;
if(tab==='Transactions'||tab==='Payroll'){const payroll=tab==='Payroll';content=`<div class="twocol"><section class="panel"><h2>${editingTransactionId?'Edit transaction':payroll?'Record payroll or distribution':'Add transaction'}</h2><div id="notice" hidden></div><form id="txform" class="formgrid"><label>Date<input type="date" name="date" value="${today()}" required></label><label>Amount ($)<input type="number" name="amount" min="${editingTransactionId ? '0' : '0.01'}" step="0.01" required></label><label class="wide">Description<input name="description" placeholder="Vendor or payment description" required maxlength="1000"></label><label>Type<select name="type">${options(payroll?['payroll','distribution','reimbursement']:types,payroll?'payroll':'expense')}</select></label><label>Category<select name="category">${options(cats,payroll?'Payroll expense':'Uncategorized')}</select></label><label>Account<select name="account" required>${options(accountOptions(),'Business Checking')}</select></label><label>Vendor
  <select name="vendor_id">
    <option value="">Choose vendor</option>
    ${vendors.map(vendor =>
      `<option value="${esc(vendor.id)}">${esc(vendor.name)}</option>`
    ).join('')}
  </select>
</label>
<details class="wide" id="tx-new-vendor">
  <summary>Create New Vendor</summary>
  <label>Company name
    <input id="tx-new-vendor-name" maxlength="200">
  </label>
  <button type="button" class="secondary" id="tx-save-vendor">
    Save vendor
  </button>
  <p id="tx-vendor-message" role="status" hidden></p>
</details>
<label>Person<input name="person" placeholder="You / spouse / employee"></label><label class="wide">Notes<textarea name="notes" rows="2" placeholder="Business purpose, memo, reference number"></textarea></label><button class="wide">${editingTransactionId?'Update transaction':'Save transaction'}</button>${editingTransactionId?'<button type="button" class="wide secondary" id="cancel-edit-tx">Cancel editing</button>':''}</form></section><section class="panel"><h2>${payroll?'Payroll & distributions':'Transactions'}</h2>${txTable(currentTransactions().filter(x=>!payroll||['payroll','distribution','reimbursement'].includes(x.type)).slice(0,100))}</section></div>`;}
if (tab === 'Vendors') content = vendorPage();
if (tab === 'Expense Tracking') {
  const rows = transactions.map(t => ({ ...t, account: accountName(t.account) }));
  content = expenseTracking(rows, { esc, money, options, cats, types });
  if (workspaceRole === 'owner') content += bankPanel();
}
if (tab === 'Receipts') {
  const tools = getReceiptTools();
  content = `<div class="twocol"><section class="panel" id="receipt-upload"><h2>Upload receipt or invoice</h2>
    <p class="muted">Take a photo or choose a PDF, image, Word or Excel file, CSV, or text file up to 10 MB.</p>
    ${tools.form()}</section><section class="panel"><h2>Stored documents</h2>${tools.list(receipts)}</section></div>`;
}
if(tab==='Reminders')content=`<div class="twocol"><section class="panel"><h2>Schedule a reminder</h2><div id="notice" hidden></div><form id="reminderform" class="formgrid"><label class="wide">Title<input name="title" placeholder="Payroll, insurance renewal, accountant meeting…" required></label><label>Due date<input type="date" name="due_date" value="${today()}" required></label><label>Amount ($, optional)<input type="number" name="amount" min="0" step="0.01"></label><label>Type<select name="kind">${options(kinds)}</select></label><label>Repeat<select name="recurrence">${options(recur)}</select></label><button class="wide">Add reminder</button></form><p class="hint">This version shows reminders inside the app. Background phone push notifications are not enabled yet. Repeating items generate their next occurrence when marked complete.</p></section><section class="panel"><h2>Scheduled items</h2>${reminderList(reminders)}</section></div>`;
if(tab==='Tax Center'){const annual=currentTransactions().filter(x=>x.date?.startsWith(String(new Date().getFullYear()))&&x.type==='expense');const sums=Object.create(null);annual.forEach(x=>sums[x.category]=(sums[x.category]||0)+Number(x.amount));content=`<section class="panel"><h2>Tax preparation overview · ${new Date().getFullYear()}</h2><p class="muted">Expense categories are bookkeeping estimates, not automatically allowable deductions. Verify business purpose, substantiation, limitations, entity tax election, and shareholder reasonable compensation with your CPA.</p><div class="sectionhead"><strong>Operating expenses recorded: ${money(annual.reduce((a,x)=>a+Number(x.amount),0))}</strong><button id="exportcsv">Export transactions CSV</button></div><div class="tablewrap"><table><thead><tr><th>Category</th><th>Recorded amount</th></tr></thead><tbody>${Object.entries(sums).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${money(v)}</td></tr>`).join('')||'<tr><td colspan="2">No expenses recorded yet.</td></tr>'}</tbody></table></div><p class="hint">S-Corp filing (including Form 1120-S and K-1s), payroll tax returns, and deduction eligibility require additional validated workflows and professional review; this app does not file forms.</p></section>`;}
if(tab==='Team')content=`<div class="twocol"><section class="panel"><h2>Invite a teammate</h2><p class="muted">Invite your wife or accountant by email. They create their own account and access the same organization records.</p><div id="notice" hidden></div><form id="inviteform" class="formgrid"><label class="wide">Email<input name="email" type="email" required placeholder="person@example.com"></label><button class="wide">Create invitation</button></form><p class="hint">Invitation records do not send emails automatically. Share your site address with the invitee, and have them sign up using the same email.</p></section><section class="panel"><h2>Team members</h2><div id="teamlist" class="muted">Loading…</div><h2>Pending invitations</h2><div id="invitelist" class="muted">Loading…</div></section></div>`;
app.innerHTML = shell(content + '<dialog id="receipt-dialog" aria-labelledby="receipt-dialog-title"></dialog><dialog id="reconcile-dialog" aria-labelledby="reconcile-title"></dialog>');
bind();
if (tab === 'Team') loadTeam();
}
function transactionActions(t) {
  return `<button class="secondary" type="button" data-edittx="${esc(t.id)}">Edit</button>
    <button class="secondary" type="button" data-txreceipt="${esc(t.id)}">Receipts</button>
    ${t.bank_transaction_id && !t.bank_reconciled && !t.bank_removed ? `<button class="secondary" type="button" data-reconcile="${esc(t.id)}">Match</button>` : ''}
    ${t.bank_transaction_id ? '' : `<button class="iconbtn" type="button" aria-label="Delete transaction" data-deletetx="${esc(t.id)}">×</button>`}`;
}
function txTable(rows) {
  return `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Amount</th><th>Actions</th></tr></thead><tbody>${
    rows.map(t => `<tr><td>${esc(t.date)}</td><td><strong>${esc(t.description)}</strong><small>${esc(t.category)} · ${esc(accountName(t.account))}</small></td>
      <td>${esc(t.type.charAt(0).toUpperCase()+t.type.slice(1))}</td><td>${money(t.amount)}</td><td><div class="rowactions">${transactionActions(t)}</div></td></tr>`).join('')
    || '<tr><td colspan="5">No transactions yet.</td></tr>'}</tbody></table></div>`;
}
function reminderList(rows){return rows.length?rows.map(r=>`<div class="listrow"><div><strong>${esc(r.title)}</strong><small>${esc(r.due_date)} · ${esc(r.kind)} · ${esc(r.recurrence)} ${r.amount!=null?' · '+money(r.amount):''}</small></div><div class="rowactions">${r.completed?'<span class="done">Done</span>':`<button class="secondary" data-donerem="${r.id}">Done</button>`}<button class="iconbtn" data-deleterem="${r.id}" title="Delete">×</button></div></div>`).join(''):'<p class="muted">Nothing scheduled yet.</p>';}
function editTransaction(id) {
  const t = transactions.find(x => String(x.id) === String(id));

  if (!t) {
    alert('Transaction not found.');
    return;
  }

  editingTransactionId = t.id;

  tab = ['payroll','distribution','reimbursement'].includes(t.type)
    ? 'Payroll'
    : 'Transactions';

  render();

  const form = document.getElementById('txform');

  if (!form) return;

  for (const field of [
    'date',
    'amount',
    'description',
    'type',
    'category',
    'account',
    'person',
    'vendor_id',
    'notes'
  ]) {
   const input = form.elements[field];
    const value = (field === 'account' ? accountName(t[field]) : t[field]) ?? '';
    if (input instanceof HTMLSelectElement && value && ![...input.options].some(o => o.value === value)) {
      input.add(new Option(value, value));
    }
    input.value = value;
  }

  form.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}async function logout() {
  await sb.auth.signOut();
  session = null;
  org = null;
  tab = 'Dashboard';
  editingTransactionId = null;
  for (const key of Object.keys(expenseFilters)) delete expenseFilters[key];
  showAuth();
}
async function submitRow(table,values){const {error}=await sb.from(table).insert({...values,org_id:org.id});if(error)throw error;await load();}
function bind(){
  bindVendorPage();
  document.querySelectorAll('[data-tab]').forEach(b => {
    b.onclick = () => {
           tab = b.dataset.tab;
      editingTransactionId = null;
      render();
    };
  });
  document.getElementById('logout-sidebar')?.addEventListener('click', logout);
  document.getElementById('logout')?.addEventListener('click', logout);
  
 const tools = getReceiptTools();
  const upload = document.getElementById('receipt-upload');
  if (upload) tools.bindForm(upload);   tools.bindThumbnails(app);
  bindExpenseTracking(transactions.map(t => ({ ...t, account: accountName(t.account) })), expenseFilters, {
    esc, money, actions: transactionActions
  });
  if (workspaceRole === 'owner') {
    bindBankPanel({ sb, orgId: org.id, userId: session.user.id, accounts: accountOptions(), esc, options, load });
  }
  app.onclick = async event => {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.dataset;
    if (action.edittx) editTransaction(action.edittx);
    if (action.txreceipt) tools.openDialog(null, action.txreceipt);
    if (action.openreceipt) await tools.preview(action.openreceipt);
    if (action.editreceipt) {
      const receipt = receipts.find(r => r.id === action.editreceipt);
      if (receipt) tools.openDialog(receipt);
    }
    if (action.reconcile) {
      const source = transactions.find(t => t.id === action.reconcile);
      if (source) openReconciliation(source, transactions, { sb, orgId: org.id, esc, money, load });
    }
    if (action.deletetx && confirm('Delete this transaction?')) {
      const { error } = await sb.from('transactions').delete().eq('id', action.deletetx).eq('org_id', org.id);
      if (error) alert(error.message);
      else await load();
    }
  };
const tx = document.getElementById('txform');

if (tx) {
  const vendorPicker = tx.elements.namedItem('vendor_id');
  const vendorPanel = document.getElementById('tx-new-vendor');
  const vendorName = document.getElementById('tx-new-vendor-name');
  const saveVendor = document.getElementById('tx-save-vendor');
  const vendorMessage = document.getElementById('tx-vendor-message');

  saveVendor.onclick = async () => {
    if (loading) return;

    const name = vendorName.value.trim();
    vendorMessage.hidden = true;

    if (!name) {
      vendorMessage.textContent = 'Enter a company name.';
      vendorMessage.hidden = false;
      vendorName.focus();
      return;
    }

    const orgId = org.id;
    const userId = session.user.id;
    loading = true;
    saveVendor.disabled = true;

    try {
      const { data, error } = await sb.from('vendors')
        .insert({ org_id: orgId, name, contacts: [] })
        .select('id,name,contacts')
        .single();

      if (error) throw error;
      if (org?.id !== orgId || session?.user.id !== userId) return;

      vendors = [...vendors, data].sort((a, b) => a.name.localeCompare(b.name));

      if (tx.isConnected) {
        vendorPicker.replaceChildren(
          new Option('Choose vendor', ''),
          ...vendors.map(vendor => new Option(vendor.name, vendor.id))
        );
        vendorPicker.value = data.id;
        vendorName.value = '';
        vendorPanel.open = false;
        vendorPicker.focus();
      }
    } catch (error) {
      vendorMessage.textContent = error.code === '23505'
        ? 'A vendor with this name already exists. Choose it from the dropdown.'
        : error.message;
      vendorMessage.hidden = false;
    } finally {
      loading = false;
      saveVendor.disabled = false;
    }
  };

  vendorName.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveVendor.click();
    }
  });  tx.onsubmit = async e => {
    e.preventDefault();

    if (loading) return;
    loading = true;

    try {
      const v = Object.fromEntries(new FormData(tx));
      v.amount = Number(v.amount);
      v.amount = Number(v.amount);
      v.vendor_id = v.vendor_id || null;
      if (editingTransactionId !== null) {
        const { data, error } = await sb
          .from('transactions')
          .update(v)
          .eq('id', editingTransactionId)
          .eq('org_id', org.id)
          .select('id');

        if (error) throw error;
        if (!data?.length) {
          throw Error('Transaction not updated. Check your permissions.');
        }

        editingTransactionId = null;
        await load();
        alert('Transaction updated successfully!');
      } else {
        await submitRow('transactions', v);
      }
    } catch (err) {
      notice(err.message);
    } finally {
      loading = false;
    }
  };
}

document.getElementById('cancel-edit-tx')?.addEventListener('click', () => {
  editingTransactionId = null;
  render();
});
  const rem=document.getElementById('reminderform');if(rem)rem.onsubmit=async e=>{e.preventDefault();if(loading)return;loading=true;try{const v=Object.fromEntries(new FormData(rem));v.amount=v.amount?Number(v.amount):null;await submitRow('reminders',v);}catch(err){notice(err.message);}finally{loading=false;}};
document.querySelectorAll('[data-deleterem]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this reminder?'))return;const {error}=await sb.from('reminders').delete().eq('id',b.dataset.deleterem).eq('org_id',org.id);if(error)alert(error.message);else await load();});
document.querySelectorAll('[data-donerem]').forEach(b=>b.onclick=async()=>{const r=reminders.find(x=>x.id===b.dataset.donerem);if(!r)return;const {error}=await sb.from('reminders').update({completed:true}).eq('id',r.id).eq('org_id',org.id);if(error)return alert(error.message);if(r.recurrence!=='None'){const d=new Date(r.due_date+'T12:00:00');if(r.recurrence==='Weekly')d.setDate(d.getDate()+7);if(r.recurrence==='Monthly')d.setMonth(d.getMonth()+1);if(r.recurrence==='Quarterly')d.setMonth(d.getMonth()+3);if(r.recurrence==='Yearly')d.setFullYear(d.getFullYear()+1);const next=d.toLocaleDateString('en-CA');const result=await sb.from('reminders').insert({org_id:org.id,title:r.title,due_date:next,kind:r.kind,amount:r.amount,recurrence:r.recurrence});if(result.error)alert(result.error.message);}await load();});
const exportButton=document.getElementById('exportcsv');if(exportButton)exportButton.onclick=()=>{const fields=['date','description','amount','type','category','account','person','notes'];const csv=[fields.join(','),...currentTransactions().map(t=>fields.map(k=>{
  const value=String(t[k]??'');
  const safe=k!=='amount'&&/^[\s]*[=+@-]|^[\t\r\n]/.test(value)?"'"+value:value;
  return '"'+safe.replaceAll('"','""')+'"';
}).join(','))].join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='crabaugh-maritime-transactions.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
const invite=document.getElementById('inviteform');if(invite)invite.onsubmit=async e=>{e.preventDefault();const email=String(new FormData(invite).get('email')).trim().toLowerCase();const {error}=await sb.from('invitations').insert({org_id:org.id,email});if(error)return notice(error.message);notice('Invitation saved. Ask them to register with this email.','ok');loadTeam();};}
async function loadTeam(){const [m,i]=await Promise.all([sb.from('memberships').select('user_id,role').eq('org_id',org.id),sb.from('invitations').select('email').eq('org_id',org.id)]);const team=document.getElementById('teamlist'),inv=document.getElementById('invitelist');if(team)team.innerHTML=m.error?esc(m.error.message):m.data.map(x=>`<div class="listrow">${esc(x.user_id === '1ae5cc78-1576-4a2d-9049-890a59b4b961'
  ? 'Kayleen'
  : x.user_id === session.user.id
    ? 'You (' + session.user.email + ')'
    : 'Team member')} <strong>${esc(x.role)}</strong></div>`).join('');if(inv)inv.innerHTML=i.error?esc(i.error.message):i.data.map(x=>`<div class="listrow">${esc(x.email)}</div>`).join('')||'None';}
async function start() {
  if (!configured) {
    showSetup();
    return;
  }

  const hash = new URLSearchParams(
    window.location.hash.substring(1)
  );

  const isRecovery =
    hash.get('type') === 'recovery';

  sb.auth.onAuthStateChange((event, newSession) => {
    session = newSession;

    if (event === 'PASSWORD_RECOVERY') {
      showPasswordReset();
      return;
    }

    if (event === 'SIGNED_OUT') {
      session = null;
      org = null;
      showAuth();
    }
  });

  try {
    const { data, error } = await sb.auth.getSession();

    if (error) throw error;

    session = data.session;

    if (isRecovery && session) {
      showPasswordReset();
      return;
    }

    await initialize();

  } catch (error) {
    console.error('Authentication startup error:', error);
    showAuth();
    notice('Unable to initialize authentication. Please try again.');
  }
}
  // The archived starter assets have a JPG fallback. The deployed PNG is preferred.
app.addEventListener('error', event => {
  if (event.target instanceof HTMLImageElement && event.target.getAttribute('src') === LOGO) {
    event.target.src = '/logo.jpg';
  }
}, true);
start();
