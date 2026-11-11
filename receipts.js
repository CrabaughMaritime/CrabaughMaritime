import { accept, validateReceipt } from './supabase/functions/_shared/receipt-validation.js';

export function receiptTools({ sb, orgId, transactions, receipts, cats, esc, money, options, load }) {
  const fields = (receipt, transactionId) => {
    const selected = receipt?.transaction_id ?? transactionId;
    return `<label class="wide">Linked transaction<select name="transaction_id"><option value="">Unlinked receipt</option>${
      transactions.filter(t => !t.bank_removed || t.id === selected).map(t =>
        `<option value="${esc(t.id)}" ${t.id === selected ? 'selected' : ''}>${esc(t.date + ' · ' + t.description + ' · ' + money(t.amount))}</option>`
      ).join('')}</select></label>
            <label class="wide">Receipt category<select name="category"><option value="">Assign later</option>${options([...new Set([...cats, receipt?.category].filter(Boolean))], receipt?.category)}</select></label>`;
  };
  const form = (receipt = null, transactionId = '') => `<form class="formgrid" data-receipt-form>
    <div class="wide notice" data-receipt-notice hidden role="alert"></div>
    ${receipt ? `<label class="wide">Receipt name<input name="file_name" value="${esc(receipt.file_name)}" maxlength="255" required></label>`
      : `<label class="wide">Choose a file<input type="file" name="file" accept="${accept}"></label>
              <label class="wide">Or take a photo<input type="file" name="camera" accept="image/*" capture="environment"></label>`}
    ${fields(receipt, transactionId)}
    <button class="wide">${receipt ? 'Save receipt details' : 'Upload securely'}</button>
  </form>`;
  const list = (rows) => rows.map(r => {
    const tx = transactions.find(t => t.id === r.transaction_id);
    return `<div class="receipt-item"><strong>${esc(r.file_name)}</strong>
      <p class="muted">${esc(tx ? tx.date + ' · ' + tx.description : 'Unlinked')} · ${esc(r.category || tx?.category || 'Uncategorized')}${r.created_at ? ' · ' + esc(new Date(r.created_at).toLocaleDateString()) : ''}</p>
      <div class="rowactions"><button class="secondary" data-openreceipt="${esc(r.id)}">Download</button>
      <button class="secondary" data-editreceipt="${esc(r.id)}">Edit</button></div></div>`;
      }).join('') || '<p class="muted">No receipts uploaded yet.</p>';
  const bindForm = (container, receipt = null) => {
    const el = container.querySelector('[data-receipt-form]');
    el.onsubmit = async event => {
      event.preventDefault();
      const button = el.querySelector('button');
      const notice = el.querySelector('[data-receipt-notice]');
      button.disabled = true;
      notice.hidden = true;
      try {
        const values = new FormData(el);
        const details = { transaction_id: values.get('transaction_id') || null, category: values.get('category') || null };
        if (receipt) {
          const name = values.get('file_name').trim();
          if (!name) throw Error('Enter a receipt name.');
          const { error } = await sb.from('receipts').update({ ...details, file_name: name })
                     .eq('org_id', orgId).eq('id', receipt.id).select('id').single();
          if (error) throw error;
        } else {
          const picked = values.get('file'), camera = values.get('camera');
          if (picked.size && camera.size) throw Error('Choose one file or one photo.');
          const file = picked.size ? picked : camera;
          await validateReceipt(file);
          const body = new FormData();
          body.set('file', file);
          body.set('orgId', orgId);
          body.set('transactionId', details.transaction_id || '');
          body.set('category', details.category || '');
          const { error } = await sb.functions.invoke('receipt-upload', { body });
          if (error) {
            const payload = await error.context?.json?.().catch(() => null);
            throw Error(payload?.error || 'The receipt upload service is unavailable. Try again.');
                     }
        }
        try {
          await load();
        } catch {
          notice.textContent = 'Receipt saved. Refresh the workspace to see the update.';
          notice.hidden = false;
        }
      } catch (error) {
        notice.textContent = error.message;
        notice.hidden = false;
      } finally {
        button.disabled = false;
      }
    };
  };
  function openDialog(receipt, transactionId) {
        const dialog = document.getElementById('receipt-dialog');
    dialog.innerHTML = `<div class="sectionhead"><h2 id="receipt-dialog-title">${receipt ? 'Edit receipt' : 'Transaction receipts'}</h2>
      <button class="secondary" data-close-dialog>Close</button></div>${form(receipt, transactionId)}
      ${receipt ? '' : list(receipts.filter(r => r.transaction_id === transactionId))}`;
    dialog.querySelector('[data-close-dialog]').onclick = () => dialog.close();
    bindForm(dialog, receipt);
    if (!dialog.open) dialog.showModal();
  }
  async function download(id) {
    const receipt = receipts.find(r => r.id === id);
    if (!receipt) return;
    const { data, error } = await sb.storage.from('receipts').createSignedUrl(receipt.file_path, 60, { download: receipt.file_name });
        if (error) return alert(error.message);
    const link = document.createElement('a');
    link.href = data.signedUrl;
    link.rel = 'noreferrer';
    link.click();
  }
  return { form, list, bindForm, openDialog, download };
}
