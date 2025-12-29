import { TonConnectUI } from '@tonconnect/ui';

declare global {
  interface Window {
    Telegram?: any;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const DEMO_FALLBACK = true; // allow UX to stay clickable even if backend is unreachable
let authToken: string | null = null;
let currentRole: 'issuer' | 'holder' = 'holder';
let currentUser: { id: string; username?: string } | null = null;

const app = document.getElementById('app')!;

function setTab(active: 'issuer' | 'holder' | 'verifier') {
  document.querySelectorAll('.tab').forEach((tab) => {
    const el = tab as HTMLElement;
    el.classList.toggle('active', el.dataset.tab === active);
  });
  currentRole = active === 'issuer' ? 'issuer' : 'holder';
  render(active);
}

async function authenticate(role: 'issuer' | 'holder' = 'holder') {
  try {
    const initData = window.Telegram?.WebApp?.initData || '';
    const res = await fetch(`${API_BASE_URL}/v1/auth/telegram/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, role }),
    });
    const data = await res.json();
    if (data.ok) {
      authToken = data.token;
      currentUser = data.user;
      renderUserBadge();
      return data.user;
    }
  } catch (err) {
    console.error(err);
  }
  if (DEMO_FALLBACK) {
    currentUser = { id: '999999', username: 'demo_user' };
    renderUserBadge();
    return currentUser;
  }
  return null;
}

function renderUserBadge() {
  const badge = document.getElementById('user-info');
  if (!badge) return;
  if (!currentUser) {
    badge.setAttribute('style', 'display:none;');
    badge.innerHTML = '';
    return;
  }
  badge.setAttribute('style', 'display:inline-flex;');
  badge.innerHTML = `<span class="user-dot"></span><span>ID: ${currentUser.id}${
    currentUser.username ? ` (@${currentUser.username})` : ''
  }</span>`;
}

function inputField(label: string, id: string, type: 'text' | 'textarea' = 'text') {
  if (type === 'textarea') {
    return `<div><label for="${id}">${label}</label><textarea id="${id}"></textarea></div>`;
  }
  return `<div><label for="${id}">${label}</label><input id="${id}" type="text" /></div>`;
}

function renderIssuer() {
  app.innerHTML = `
    <div class="card">
      <div class="section-title">Mint SBT</div>
      <div class="grid">
        ${inputField('Holder Telegram ID', 'holderTelegramId')}
        ${inputField('Holder Wallet (optional)', 'holderWallet')}
        ${inputField('Issuer Name', 'issuerName')}
        ${inputField('Issuer Tier', 'issuerTier')}
      </div>
      <div class="grid" style="margin-top:12px;">
        ${inputField('Role / Position', 'roleField')}
        ${inputField('Company', 'companyField')}
        ${inputField('Start Date', 'startDate')}
        ${inputField('End Date', 'endDate')}
      </div>
      ${inputField('Description', 'description', 'textarea')}
      <div style="margin-top:16px; display:flex; gap:12px; flex-wrap:wrap;">
        <button id="mintBtn">Mint SBT</button>
      </div>
      <div class="status-box" id="issuerStatus">Waiting for action...</div>
    </div>
    <div class="card" style="margin-top:16px;">
      <div class="section-title">Revoke Credential</div>
      ${inputField('Credential ID', 'revokeId')}
      <button id="revokeBtn" style="margin-top:10px;">Revoke</button>
      <div class="status-box" id="revokeStatus">No revocation sent.</div>
    </div>
  `;
  document.getElementById('mintBtn')?.addEventListener('click', async () => {
    await authenticate('issuer');
    const payload = {
      holderTelegramId: (document.getElementById('holderTelegramId') as HTMLInputElement).value,
      holderWallet: (document.getElementById('holderWallet') as HTMLInputElement).value || undefined,
      issuerName: (document.getElementById('issuerName') as HTMLInputElement).value,
      issuerTier: (document.getElementById('issuerTier') as HTMLInputElement).value || 'standard',
      payload: {
        holderName: 'Holder',
        role: (document.getElementById('roleField') as HTMLInputElement).value,
        company: (document.getElementById('companyField') as HTMLInputElement).value,
        startDate: (document.getElementById('startDate') as HTMLInputElement).value,
        endDate: (document.getElementById('endDate') as HTMLInputElement).value,
        description: (document.getElementById('description') as HTMLTextAreaElement).value,
      },
    };
    const statusBox = document.getElementById('issuerStatus');
    try {
      const res = await fetch(`${API_BASE_URL}/v1/mint-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authToken ? `Bearer ${authToken}` : '',
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        statusBox!.textContent = `Minted. ID: ${data.id}, Hash: ${data.contentHash}, Status: ${data.status}`;
      } else {
        statusBox!.textContent = data.error || 'Failed to mint';
      }
    } catch (err) {
      console.error(err);
      statusBox!.textContent = 'Demo minted. ID: DEMO-123, Hash: demo-hash, Status: active';
    }
  });

  document.getElementById('revokeBtn')?.addEventListener('click', async () => {
    await authenticate('issuer');
    const id = (document.getElementById('revokeId') as HTMLInputElement).value;
    const statusBox = document.getElementById('revokeStatus');
    try {
      const res = await fetch(`${API_BASE_URL}/v1/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authToken ? `Bearer ${authToken}` : '',
        },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      statusBox!.textContent = data.ok ? `Revoked ${id}` : data.error || 'Failed to revoke';
    } catch (err) {
      console.error(err);
      statusBox!.textContent = `Demo revoke: credential ${id || 'DEMO-123'} marked revoked`;
    }
  });
}

async function renderHolder() {
  app.innerHTML = `
    <div class="card">
      <div class="section-title">Мой профиль</div>
      <div class="grid" style="margin-bottom:12px;">
        <div class="status-box" id="holderInfo">Подключаемся к Telegram...</div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button id="refreshPortfolio">Обновить</button>
          <button id="copyId">Скопировать мой Telegram ID</button>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:16px;">
      <div class="section-title">Portfolio</div>
      <div id="portfolioList">Loading...</div>
    </div>
  `;
  const listEl = document.getElementById('portfolioList')!;
  const info = document.getElementById('holderInfo')!;
  const user = await authenticate('holder');
  if (!user) {
    listEl.textContent = 'Authentication failed';
    info.textContent = 'Не удалось авторизоваться через Telegram';
    return;
  }
  info.textContent = `ID: ${user.id}${user.username ? ` (@${user.username})` : ''}`;
  document.getElementById('copyId')?.addEventListener('click', () => {
    navigator.clipboard.writeText(user.id.toString());
    info.textContent = 'ID скопирован в буфер обмена';
  });
  document.getElementById('refreshPortfolio')?.addEventListener('click', () => renderHolder());
  try {
    const res = await fetch(`${API_BASE_URL}/v1/portfolio`, {
      headers: { Authorization: authToken ? `Bearer ${authToken}` : '' },
    });
    const data = await res.json();
    if (!data.ok) {
      listEl.textContent = data.error || 'Failed to load';
      return;
    }
    listEl.innerHTML = '';
    data.credentials.forEach((cred: any) => {
      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML = `
        <div class="flex-between">
          <div><strong>${cred.issuerName || 'Issuer'}</strong> • ${cred.issuerTier}</div>
          <div class="pill ${cred.status === 'active' ? 'active' : 'revoked'}">${cred.status}</div>
        </div>
        <div class="helper">Hash: ${cred.contentHash}</div>
        ${cred.payload ? `<div class="helper">Role: ${cred.payload.role} @ ${cred.payload.company}</div>` : ''}
        <div style="margin-top:8px;">
          <label for="privacy-${cred.id}">Visibility</label>
          <select id="privacy-${cred.id}">
            <option value="FULL" ${cred.privacyLevel === 'FULL' ? 'selected' : ''}>Full</option>
            <option value="FACT_ONLY" ${cred.privacyLevel === 'FACT_ONLY' ? 'selected' : ''}>Fact only</option>
          </select>
        </div>
      `;
      listEl.appendChild(el);
      const select = document.getElementById(`privacy-${cred.id}`) as HTMLSelectElement;
      select.addEventListener('change', async () => {
        await authenticate('holder');
        await fetch(`${API_BASE_URL}/v1/privacy/update`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authToken ? `Bearer ${authToken}` : '',
          },
          body: JSON.stringify({ id: cred.id, visibility: select.value }),
        });
      });
    });
  } catch (err) {
    console.error(err);
    listEl.innerHTML = '';
    const demo = [
      {
        id: 'DEMO-123',
        issuerName: 'TON Labs',
        issuerTier: 'verified',
        status: 'active',
        contentHash: 'demo-hash-123',
        payload: { role: 'Engineer', company: 'Demo Corp' },
        privacyLevel: 'FULL',
      },
      {
        id: 'DEMO-456',
        issuerName: 'Web3 HR',
        issuerTier: 'trusted',
        status: 'revoked',
        contentHash: 'demo-hash-456',
        payload: { role: 'Designer', company: 'UI Studio' },
        privacyLevel: 'FACT_ONLY',
      },
    ];
    demo.forEach((cred) => {
      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML = `
        <div class="flex-between">
          <div><strong>${cred.issuerName}</strong> • ${cred.issuerTier}</div>
          <div class="pill ${cred.status === 'active' ? 'active' : 'revoked'}">${cred.status}</div>
        </div>
        <div class="helper">Hash: ${cred.contentHash}</div>
        <div class="helper">Role: ${cred.payload.role} @ ${cred.payload.company}</div>
        <div style="margin-top:8px;">
          <label>Visibility</label>
          <select disabled>
            <option>${cred.privacyLevel}</option>
          </select>
        </div>
      `;
      listEl.appendChild(el);
    });
  }
}

function renderVerifier() {
  app.innerHTML = `
    <div class="card">
      <div class="section-title">Verify credential</div>
      ${inputField('Credential ID', 'verifyId')}
      ${inputField('Content Hash', 'verifyHash')}
      <button id="verifyBtn" style="margin-top:12px;">Verify</button>
      <div class="status-box" id="verifyStatus">Awaiting verification.</div>
    </div>
  `;
  document.getElementById('verifyBtn')?.addEventListener('click', async () => {
    const id = (document.getElementById('verifyId') as HTMLInputElement).value;
    const hash = (document.getElementById('verifyHash') as HTMLInputElement).value;
    const statusBox = document.getElementById('verifyStatus');
    try {
      const res = await fetch(`${API_BASE_URL}/v1/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id || undefined, hash: hash || undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        statusBox!.textContent = `Status: ${data.status}, Match: ${data.match}, Tier: ${data.issuerTier}`;
      } else {
        statusBox!.textContent = data.error || 'Not found';
      }
    } catch (err) {
      console.error(err);
      statusBox!.textContent = 'Demo verify: status active, match true, tier verified';
    }
  });
}

function render(tab: 'issuer' | 'holder' | 'verifier') {
  switch (tab) {
    case 'issuer':
      renderIssuer();
      break;
    case 'holder':
      renderHolder();
      break;
    case 'verifier':
      renderVerifier();
      break;
  }
}

function initTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => setTab((tab as HTMLElement).dataset.tab as any));
  });
}

function initTonConnect() {
  const target = document.getElementById('ton-connect');
  if (!target) return;
  const tonConnectUI = new TonConnectUI({
    manifestUrl: 'https://ton-connect.github.io/demo-dapp-with-react-ui/tonconnect-manifest.json',
  });
  tonConnectUI.uiOptions = { twaReturnUrl: 'https://t.me' };
  tonConnectUI.renderWalletList(target);
  tonConnectUI.onStatusChange((wallet) => {
    const existing = document.getElementById('wallet-address');
    if (existing) existing.remove();
    if (wallet?.account?.address) {
      const span = document.createElement('span');
      span.id = 'wallet-address';
      span.textContent = wallet.account.address;
      target.appendChild(span);
    }
  });
}

function initTelegramUI() {
  if (window.Telegram?.WebApp) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  }
}

initTelegramUI();
initTonConnect();
initTabs();
render('issuer');
