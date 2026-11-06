import {createClient} from '@supabase/supabase-js';
import './style.css';
const SUPABASE_URL=import.meta.env.VITE_SUPABASE_URL, KEY=import.meta.env.VITE_SUPABASE_ANON_KEY;
const configured=!!(SUPABASE_URL&&KEY&&SUPABASE_URL.startsWith('https://')&&!SUPABASE_URL.includes('YOUR_'));
const sb=configured?createClient(SUPABASE_URL,KEY):null;
const app = document.getElementById('app');
const LOGO = '/F00CE726-03EB-43DA-A800-E88A6CF4DD82.png';
let session=null,org=null,transactions=[],reminders=[],receipts=[],tab='Dashboard',loading=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);
const today=()=>new Date().toLocaleDateString('en-CA');
const month=()=>today().slice(0,7);
const options=(arr,selected='')=>arr.map(x=>`<option ${x===selected?'selected':''}>${esc(x)}</option>`).join('');
const cats=['Travel','Fuel','Vessel supplies','Maintenance','Insurance','Medical','Software','Office','Meals','Professional fees','Training','Licenses','Phone & internet','Vehicle','Advertising','Payroll expense','Taxes','Other','Uncategorized'];
const types=['expense','income','payroll','distribution','transfer','reimbursement'];
const kinds=['Payroll','Expense','Meeting','Tax','Accounting','Other'];
const recur=['None','Weekly','Monthly','Quarterly','Yearly'];
const shell=(content)=>`<div class="shell"><aside><div class="brand"><img src="${LOGO}" alt="Crabaugh Maritime logo"><div><strong>CRABAUGH</strong><small>MARITIME</small></div></div><nav>${['Dashboard','Transactions','Receipts','Payroll','Reminders','Tax Center','Team'].map(x=>`<button data-tab="${x}" class="${tab===x?'active':''}">${x}</button>`).join('')}</nav><div class="asidebottom"><span>${esc(session?.user?.email||'')}</span><button id="logout-sidebar">Sign out</button></div></aside><main><header><div><span class="eyebrow">BUSINESS WORKSPACE</span><h1>${esc(tab)}</h1></div><div class="topright"><span>${esc(org?.name||'Crabaugh Maritime')}</span><img src="${LOGO}" alt="logo"><button id="logout" type="button" style="background:#b91c1c;color:white;border:0;border-radius:8px;padding:10px 12px;cursor:pointer;font-size:13px;white-space:nowrap;">Sign Out</button></div></header><div class="content">${content}</div></main></div>`;
function notice(message,kind='error'){const el=document.getElementById('notice');if(el){el.textContent=message;el.className='notice '+kind;el.hidden=false;}}
function showSetup(){app.innerHTML=`<section class="auth"><img src="${LOGO}"><h1>Crabaugh Maritime</h1><p>Deployment configuration is required. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in Vercel, then redeploy.</p><p>Follow the included README.md to create the Supabase database and security policies.</p></section>`;}

function showAuth() {
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
              autocomplete="email" placeholder="you@example.com">
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
  let mode = 'signin';

  form.querySelectorAll('button[type=submit]').forEach(b => {
    b.onclick = () => mode = b.value;
  });

  form.onsubmit = async e => {
    e.preventDefault();
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
async function initialize(){if(!session){showAuth();return;}try{await sb.rpc('claim_my_invites');const {data,error}=await sb.from('memberships').select('org_id,role,organizations(id,name)').limit(1);if(error)throw error;if(!data?.length){showOrgCreate();return;}org=data[0].organizations;await load();}catch(e){app.innerHTML=`<section class="auth"><h2>Unable to load workspace</h2><p>${esc(e.message)}</p><button id="retry">Retry</button></section>`;document.getElementById('retry').onclick=initialize;}}
function showOrgCreate(){app.innerHTML=`<section class="auth"><img src="${LOGO}"><h1>Create your business workspace</h1><div id="notice" hidden></div><form id="orgform" class="panel"><label>Business name<input name="name" value="Crabaugh Maritime" required maxlength="100"></label><button>Create workspace</button></form><p class="muted">If you were invited, sign in using the exact invited email address.</p><button id="logout">Sign out</button></section>`;document.getElementById('logout').onclick=logout;document.getElementById('orgform').onsubmit=async e=>{e.preventDefault();const name=new FormData(e.target).get('name');const {data,error}=await sb.from('organizations').insert({name,owner_id:session.user.id}).select().single();if(error)return notice(error.message);const r=await sb.from('memberships').insert({org_id:data.id,user_id:session.user.id,role:'owner'});if(r.error)return notice('Workspace created, but membership setup failed: '+r.error.message);org=data;await load();};}
async function load(){const [t,r,f]=await Promise.all([sb.from('transactions').select('*').eq('org_id',org.id).order('date',{ascending:false}),sb.from('reminders').select('*').eq('org_id',org.id).order('due_date'),sb.from('receipts').select('*').eq('org_id',org.id).order('created_at',{ascending:false})]);const error=t.error||r.error||f.error;if(error)throw error;transactions=t.data||[];reminders=r.data||[];receipts=f.data||[];render();}
function render(){let content='';const m=transactions.filter(x=>x.date?.startsWith(month())),exp=m.filter(x=>x.type==='expense').reduce((a,x)=>a+Number(x.amount),0),pay=m.filter(x=>x.type==='payroll').reduce((a,x)=>a+Number(x.amount),0),income=m.filter(x=>x.type==='income').reduce((a,x)=>a+Number(x.amount),0);const upcoming=reminders.filter(x=>!x.completed).slice(0,8);
if(tab==='Dashboard')content=`<div class="stats"><div class="stat"><span>MONTHLY INCOME</span><strong>${money(income)}</strong></div><div class="stat"><span>OPERATING EXPENSES</span><strong>${money(exp)}</strong></div><div class="stat"><span>PAYROLL TRANSFERS</span><strong>${money(pay)}</strong></div><div class="stat"><span>UPCOMING REMINDERS</span><strong>${upcoming.length}</strong></div></div><div class="twocol"><section class="panel"><div class="sectionhead"><h2>Recent transactions</h2><button data-tab="Transactions" class="linkbtn">View all</button></div>${txTable(transactions.slice(0,7))}</section><section class="panel"><div class="sectionhead"><h2>Upcoming</h2><button data-tab="Reminders" class="linkbtn">Manage</button></div>${reminderList(upcoming)}</section></div><p class="hint">Transfers and shareholder distributions are tracked separately from deductible operating expenses. Reports are informational, not filed tax returns.</p>`;
if(tab==='Transactions'||tab==='Payroll'){const payroll=tab==='Payroll';content=`<div class="twocol"><section class="panel"><h2>${payroll?'Record payroll or distribution':'Add transaction'}</h2><div id="notice" hidden></div><form id="txform" class="formgrid"><label>Date<input type="date" name="date" value="${today()}" required></label><label>Amount ($)<input type="number" name="amount" min="0.01" step="0.01" required></label><label class="wide">Description<input name="description" placeholder="Vendor or payment description" required maxlength="200"></label><label>Type<select name="type">${options(payroll?['payroll','distribution','reimbursement']:types,payroll?'payroll':'expense')}</select></label><label>Category<select name="category">${options(cats,payroll?'Payroll expense':'Uncategorized')}</select></label><label>Account<input name="account" value="Business checking" required></label><label>Person<input name="person" placeholder="You / spouse / employee"></label><label class="wide">Notes<textarea name="notes" rows="2" placeholder="Business purpose, memo, reference number"></textarea></label><button class="wide">Save transaction</button></form></section><section class="panel"><h2>${payroll?'Payroll & distributions':'Transactions'}</h2>${txTable(transactions.filter(x=>!payroll||['payroll','distribution','reimbursement'].includes(x.type)).slice(0,100))}</section></div>`;}
if(tab==='Receipts')content=`<div class="twocol"><section class="panel"><h2>Upload receipt or invoice</h2><p class="muted">Take a photo on your phone or choose a PDF, JPEG, PNG, or WebP file (10 MB maximum).</p><div id="notice" hidden></div><form id="receiptform" class="formgrid"><label class="wide">Receipt or invoice<
<input
  type="file"
  name="file"
  accept="image/jpeg,image/png,image/webp,application/pdf"
  required></label><label class="wide">Link to transaction (optional)<select name="transaction_id"><option value="">Unlinked receipt</option>${transactions.map(t=>`<option value="${t.id}">${esc(t.date+' · '+t.description+' · '+money(t.amount))}</option>`).join('')}</select></label><button class="wide">Upload securely</button></form></section><section class="panel"><h2>Stored documents</h2>${receipts.length?receipts.map(r=>`<div class="listrow"><div><strong>${esc(r.file_name)}</strong><small>${new Date(r.created_at).toLocaleDateString()}</small></div><
<button class="secondary" type="button" data-openreceipt="${r.file_path}">Open</button><button class="secondary" type="button" data-editreceipt="${r.id}">Edit</button>
</div>`).join(''):'<p class="muted">No receipts uploaded yet.</p>'}</section></div>`;
if(tab==='Reminders')content=`<div class="twocol"><section class="panel"><h2>Schedule a reminder</h2><div id="notice" hidden></div><form id="reminderform" class="formgrid"><label class="wide">Title<input name="title" placeholder="Payroll, insurance renewal, accountant meeting…" required></label><label>Due date<input type="date" name="due_date" value="${today()}" required></label><label>Amount ($, optional)<input type="number" name="amount" min="0" step="0.01"></label><label>Type<select name="kind">${options(kinds)}</select></label><label>Repeat<select name="recurrence">${options(recur)}</select></label><button class="wide">Add reminder</button></form><p class="hint">This version shows reminders inside the app. Background phone push notifications are not enabled yet. Repeating items generate their next occurrence when marked complete.</p></section><section class="panel"><h2>Scheduled items</h2>${reminderList(reminders)}</section></div>`;
if(tab==='Tax Center'){const annual=transactions.filter(x=>x.date?.startsWith(String(new Date().getFullYear()))&&x.type==='expense');const sums={};annual.forEach(x=>sums[x.category]=(sums[x.category]||0)+Number(x.amount));content=`<section class="panel"><h2>Tax preparation overview · ${new Date().getFullYear()}</h2><p class="muted">Expense categories are bookkeeping estimates, not automatically allowable deductions. Verify business purpose, substantiation, limitations, entity tax election, and shareholder reasonable compensation with your CPA.</p><div class="sectionhead"><strong>Operating expenses recorded: ${money(annual.reduce((a,x)=>a+Number(x.amount),0))}</strong><button id="exportcsv">Export transactions CSV</button></div><div class="tablewrap"><table><thead><tr><th>Category</th><th>Recorded amount</th></tr></thead><tbody>${Object.entries(sums).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${money(v)}</td></tr>`).join('')||'<tr><td colspan="2">No expenses recorded yet.</td></tr>'}</tbody></table></div><p class="hint">S-Corp filing (including Form 1120-S and K-1s), payroll tax returns, and deduction eligibility require additional validated workflows and professional review; this app does not file forms.</p></section>`;}
if(tab==='Team')content=`<div class="twocol"><section class="panel"><h2>Invite a teammate</h2><p class="muted">Invite your wife or accountant by email. They create their own account and access the same organization records.</p><div id="notice" hidden></div><form id="inviteform" class="formgrid"><label class="wide">Email<input name="email" type="email" required placeholder="person@example.com"></label><button class="wide">Create invitation</button></form><p class="hint">Invitation records do not send emails automatically. Share your site address with the invitee, and have them sign up using the same email.</p></section><section class="panel"><h2>Team members</h2><div id="teamlist" class="muted">Loading…</div><h2>Pending invitations</h2><div id="invitelist" class="muted">Loading…</div></section></div>`;
app.innerHTML=shell(content);bind();if(tab==='Team')loadTeam();}
function txTable(rows){return `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Amount</th><th></th></tr></thead><tbody>${rows.map(t=>`<tr><td>${esc(t.date)}</td><td><strong>${esc(t.description)}</strong><small>${esc(t.category)} · ${esc(t.account)}</small></td><td>${esc(t.type)}</td><td>${money(t.amount)}</td><td><
<button class="secondary" type="button" data-edittx="${t.id}">Edit</button>
<button class="iconbtn" type="button" title="Delete transaction" data-deletetx="${t.id}">×</button>
</td></tr>`).join('')||'<tr><td colspan="5">No transactions yet.</td></tr>'}</tbody></table></div>`;}
function reminderList(rows){return rows.length?rows.map(r=>`<div class="listrow"><div><strong>${esc(r.title)}</strong><small>${esc(r.due_date)} · ${esc(r.kind)} · ${esc(r.recurrence)} ${r.amount!=null?' · '+money(r.amount):''}</small></div><div class="rowactions">${r.completed?'<span class="done">Done</span>':`<button class="secondary" data-donerem="${r.id}">Done</button>`}<button class="iconbtn" data-deleterem="${r.id}" title="Delete">×</button></div></div>`).join(''):'<p class="muted">Nothing scheduled yet.</p>';}

async function editTransaction(id) {
  const t = transactions.find(x => String(x.id) === String(id));
  if (!t) return alert('Transaction not found.');

  const description = prompt('Description:', t.description || '');
  if (description === null) return;
  if (!description.trim()) return alert('Description is required.');

  const amountText = prompt('Amount ($):', t.amount);
  if (amountText === null) return;
  const amount = Number(amountText);
  if (!Number.isFinite(amount) || amount <= 0) {
    return alert('Enter a valid amount greater than zero.');
  }

  const date = prompt('Date (YYYY-MM-DD):', t.date);
  if (date === null) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(date + 'T12:00:00').toISOString().slice(0, 10) !== date) {
    return alert('Enter a valid date in YYYY-MM-DD format.');
  }

  const category = prompt('Category:\n' + cats.join(', '), t.category);
  if (category === null) return;
  if (!cats.includes(category)) return alert('Choose a category from the list.');

  const type = prompt('Type:\n' + types.join(', '), t.type);
  if (type === null) return;
  if (!types.includes(type)) return alert('Invalid transaction type.');

  const account = prompt('Account:', t.account || '');
  if (account === null) return;
  if (!account.trim()) return alert('Account is required.');

  const person = prompt('Person:', t.person || '');
  if (person === null) return;

  const notes = prompt('Notes:', t.notes || '');
  if (notes === null) return;

  const { error } = await sb.from('transactions')
    .update({
      description: description.trim(),
      amount,
      date,
      category,
      type,
      account: account.trim(),
      person,
      notes
    })
    .eq('id', id)
    .eq('org_id', org.id);

  if (error) return alert('Update failed: ' + error.message);

  await load();
  alert('Transaction updated successfully!');
}

async function editReceipt(id) {
  const r = receipts.find(x => String(x.id) === String(id));
  if (!r) return alert('Receipt not found.');

  const name = prompt('Receipt name:', r.file_name || '');
  if (name === null) return;
  if (!name.trim()) return alert('Receipt name is required.');

  const linked = prompt(
    'Linked transaction ID (leave blank for unlinked):\n\n' +
    transactions.map(t =>
      `${t.id} - ${t.description} - ${money(t.amount)}`
    ).join('\n'),
    r.transaction_id || ''
  );

  if (linked === null) return;

  const transaction_id = linked.trim() || null;

  if (transaction_id &&
      !transactions.some(t => String(t.id) === transaction_id)) {
    return alert('Transaction not found.');
  }

  const { error } = await sb.from('receipts')
    .update({
      file_name: name.trim(),
      transaction_id
    })
    .eq('id', id)
    .eq('org_id', org.id);

  if (error) return alert('Update failed: ' + error.message);

  await load();
  alert('Receipt updated successfully!');
}
async function logout(){await sb.auth.signOut();session=null;org=null;showAuth();}
async function submitRow(table,values){const {error}=await sb.from(table).insert({...values,org_id:org.id});if(error)throw error;await load();}
function bind(){
  document.querySelectorAll('[data-tab]').forEach(b => {
    b.onclick = () => {
      tab = b.dataset.tab;
      render();
    };
  });
  document.getElementById('logout-sidebar')?.addEventListener('click', logout);
  document.getElementById('logout')?.addEventListener('click', logout);
  
document.querySelectorAll('[data-edittx]').forEach(button => {
  button.onclick = () => editTransaction(button.dataset.edittx);
});

document.querySelectorAll('[data-editreceipt]').forEach(button => {
  button.onclick = () => editReceipt(button.dataset.editreceipt);
});
const tx=document.getElementById('txform');if(tx)tx.onsubmit=async e=>{e.preventDefault();if(loading)return;loading=true;try{const v=Object.fromEntries(new FormData(tx));v.amount=Number(v.amount);await submitRow('transactions',v);}catch(err){notice(err.message);}finally{loading=false;}};
const rem=document.getElementById('reminderform');if(rem)rem.onsubmit=async e=>{e.preventDefault();if(loading)return;loading=true;try{const v=Object.fromEntries(new FormData(rem));v.amount=v.amount?Number(v.amount):null;await submitRow('reminders',v);}catch(err){notice(err.message);}finally{loading=false;}};
const rf=document.getElementById('receiptform');if(rf)rf.onsubmit=async e=>{e.preventDefault();if(loading)return;loading=true;try{const fd=new FormData(rf),file=fd.get('file');if(!(file instanceof File)||!file.size)throw Error('Choose a file');if(file.size>10485760)throw Error('File must be under 10 MB');if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type))throw Error('Unsupported file type');const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100),path=`${org.id}/${crypto.randomUUID()}-${safe}`;const up=await sb.storage.from('receipts').upload(path,file,{contentType:file.type,upsert:false});if(up.error)throw up.error;const {error}=await sb.from('receipts').insert({org_id:org.id,file_path:path,file_name:file.name,transaction_id:fd.get('transaction_id')||null});if(error){await sb.storage.from('receipts').remove([path]);throw error;}await load();}catch(err){notice(err.message);}finally{loading=false;}};
document.querySelectorAll('[data-openreceipt]').forEach(b=>b.onclick=async()=>{const {data,error}=await sb.storage.from('receipts').createSignedUrl(b.dataset.openreceipt,60);if(error)alert(error.message);else window.open(data.signedUrl,'_blank','noopener,noreferrer');});
document.querySelectorAll('[data-deletetx]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this transaction?'))return;const {error}=await sb.from('transactions').delete().eq('id',b.dataset.deletetx).eq('org_id',org.id);if(error)alert(error.message);else await load();});
document.querySelectorAll('[data-deleterem]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this reminder?'))return;const {error}=await sb.from('reminders').delete().eq('id',b.dataset.deleterem).eq('org_id',org.id);if(error)alert(error.message);else await load();});
document.querySelectorAll('[data-donerem]').forEach(b=>b.onclick=async()=>{const r=reminders.find(x=>x.id===b.dataset.donerem);if(!r)return;const {error}=await sb.from('reminders').update({completed:true}).eq('id',r.id).eq('org_id',org.id);if(error)return alert(error.message);if(r.recurrence!=='None'){const d=new Date(r.due_date+'T12:00:00');if(r.recurrence==='Weekly')d.setDate(d.getDate()+7);if(r.recurrence==='Monthly')d.setMonth(d.getMonth()+1);if(r.recurrence==='Quarterly')d.setMonth(d.getMonth()+3);if(r.recurrence==='Yearly')d.setFullYear(d.getFullYear()+1);const next=d.toLocaleDateString('en-CA');const result=await sb.from('reminders').insert({org_id:org.id,title:r.title,due_date:next,kind:r.kind,amount:r.amount,recurrence:r.recurrence});if(result.error)alert(result.error.message);}await load();});
const exportButton=document.getElementById('exportcsv');if(exportButton)exportButton.onclick=()=>{const fields=['date','description','amount','type','category','account','person','notes'];const csv=[fields.join(','),...transactions.map(t=>fields.map(k=>'"'+String(t[k]??'').replaceAll('"','""')+'"').join(','))].join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='crabaugh-maritime-transactions.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
const invite=document.getElementById('inviteform');if(invite)invite.onsubmit=async e=>{e.preventDefault();const email=String(new FormData(invite).get('email')).trim().toLowerCase();const {error}=await sb.from('invitations').insert({org_id:org.id,email});if(error)return notice(error.message);notice('Invitation saved. Ask them to register with this email.','ok');loadTeam();};}
async function loadTeam(){const [m,i]=await Promise.all([sb.from('memberships').select('user_id,role').eq('org_id',org.id),sb.from('invitations').select('email').eq('org_id',org.id)]);const team=document.getElementById('teamlist'),inv=document.getElementById('invitelist');if(team)team.innerHTML=m.error?esc(m.error.message):m.data.map(x=>`<div class="listrow">${esc(x.user_id===session.user.id?'You ('+session.user.email+')':x.user_id)} <strong>${esc(x.role)}</strong></div>`).join('');if(inv)inv.innerHTML=i.error?esc(i.error.message):i.data.map(x=>`<div class="listrow">${esc(x.email)}</div>`).join('')||'None';}
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

start();
