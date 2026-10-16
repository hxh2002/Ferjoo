export function confirmDialog(message, { title = '请确认', confirmText = '确认', cancelText = '取消' } = {}) {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.setAttribute('role', 'presentation');
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px;background:rgba(48,37,31,.42)';
    const panel = document.createElement('section');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'ferjoo-dialog-title');
    panel.style.cssText = 'width:min(100%,420px);box-sizing:border-box;padding:20px;background:#fffdf8;border:1px solid #d8d2c8;color:#30251f';
    panel.innerHTML = `<h2 id="ferjoo-dialog-title" style="margin:0 0 12px;font-size:20px">${escapeHtml(title)}</h2><p style="margin:0 0 20px;line-height:1.6;white-space:pre-wrap">${escapeHtml(message)}</p><div style="display:flex;justify-content:flex-end;gap:8px"><button type="button" data-cancel style="min-height:44px;padding:8px 16px;background:transparent;border:1px solid #938d83">${escapeHtml(cancelText)}</button><button type="button" data-confirm style="min-height:44px;padding:8px 16px;background:#a54214;color:#fff;border:1px solid #a54214">${escapeHtml(confirmText)}</button></div>`;
    backdrop.append(panel);
    document.body.append(backdrop);
    const previousFocus = document.activeElement;
    const close = (result) => { backdrop.remove(); previousFocus?.focus?.(); resolve(result); };
    backdrop.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(false); }
      if (event.key === 'Tab') {
        event.preventDefault();
        const cancel = panel.querySelector('[data-cancel]');
        const confirm = panel.querySelector('[data-confirm]');
        (document.activeElement === cancel ? confirm : cancel).focus();
      }
    });
    panel.querySelector('[data-cancel]').addEventListener('click', () => close(false));
    panel.querySelector('[data-confirm]').addEventListener('click', () => close(true));
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(false); });
    panel.querySelector('[data-cancel]').focus();
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[char]));
}
