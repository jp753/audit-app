/** Small banner shown when a new app version has been downloaded. */
export function showUpdateBanner(apply: () => void) {
  if (document.getElementById('update-banner')) return;
  const el = document.createElement('div');
  el.id = 'update-banner';
  el.className = 'toast';
  el.style.display = 'flex';
  el.style.gap = '12px';
  el.style.alignItems = 'center';
  el.innerHTML = '<span>A new version is ready.</span>';
  const btn = document.createElement('button');
  btn.className = 'btn teal';
  btn.style.minHeight = '44px';
  btn.textContent = 'Update';
  btn.onclick = () => { btn.textContent = 'Updating…'; apply(); };
  el.appendChild(btn);
  document.body.appendChild(el);
}
