import { TonConnectUI } from '@tonconnect/ui';

declare global {
  interface Window {
    Telegram?: any;
  }
}

type Settings = {
  visibility: 'public' | 'private';
  notifications: boolean;
  language: 'ru' | 'en';
};

const API_BASE_URL =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || 'http://localhost:4000';
const DEMO_FALLBACK = true;
const SETTINGS_KEY = 'miniapp_settings';
const QUICK_NOTE_KEY = 'miniapp_quick_note';

let authToken: string | null = null;
let currentUser: {
  id: string;
  username?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  hash?: string;
} | null = null;
let tonConnectUI: TonConnectUI | null = null;
let walletAddress: string | null = null;

const app = document.getElementById('app')!;

async function generateUserHash(userId: string, username?: string, phone?: string): Promise<string> {
  const data = `${userId}:${username || ''}:${phone || ''}`;
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 16).toUpperCase();
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw) as Settings;
  } catch (err) {
    console.warn('Failed to load settings', err);
  }
  return { visibility: 'public', notifications: true, language: 'ru' };
}

function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  const status = document.getElementById('settings-status');
  if (status) status.textContent = 'Настройки сохранены';
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

function setProfileStatus(text: string) {
  const status = document.getElementById('profile-status');
  if (status) status.textContent = text;
}

async function updateProfileCard() {
  const idEl = document.getElementById('profile-id');
  const usernameEl = document.getElementById('profile-username');
  const phoneEl = document.getElementById('profile-phone');
  const nameEl = document.getElementById('profile-name');
  const hashEl = document.getElementById('profile-hash');
  if (!currentUser) {
    setProfileStatus('Не удалось авторизоваться через Telegram');
    if (idEl) idEl.textContent = '—';
    if (usernameEl) usernameEl.textContent = '—';
    if (phoneEl) phoneEl.textContent = '—';
    if (nameEl) nameEl.textContent = '—';
    if (hashEl) hashEl.textContent = '—';
    return;
  }
  if (idEl) idEl.textContent = currentUser.id;
  if (usernameEl) usernameEl.textContent = currentUser.username ? `@${currentUser.username}` : 'не указано';
  if (phoneEl) phoneEl.textContent = currentUser.phone || 'не указан';
  if (nameEl) {
    const nameParts = [currentUser.firstName, currentUser.lastName].filter(Boolean);
    nameEl.textContent = nameParts.length > 0 ? nameParts.join(' ') : 'не указано';
  }
  if (!currentUser.hash) {
    currentUser.hash = await generateUserHash(
      currentUser.id,
      currentUser.username,
      currentUser.phone
    );
  }
  if (hashEl) hashEl.textContent = currentUser.hash;
  setProfileStatus('Авторизованы через Telegram');
}

function extractUserFromInitData(initData: string) {
  try {
    const params = new URLSearchParams(initData);
    const userData = params.get('user');
    if (!userData) return null;
    const user = JSON.parse(userData) as {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    return {
      id: String(user.id),
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
    };
  } catch (err) {
    console.warn('Failed to parse initData', err);
    return null;
  }
}

function getUserFromTelegramWebApp() {
  if (!window.Telegram?.WebApp?.initDataUnsafe?.user) return null;
  const user = window.Telegram.WebApp.initDataUnsafe.user as {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    phone_number?: string;
  };
  return {
    id: String(user.id),
    firstName: user.first_name,
    lastName: user.last_name,
    username: user.username,
    phone: user.phone_number,
  };
}

async function authenticate(role: 'issuer' | 'holder' = 'holder') {
  setProfileStatus('Авторизуем через Telegram...');
  try {
    const initData = window.Telegram?.WebApp?.initData || '';
    const telegramUser = getUserFromTelegramWebApp();
    
    const res = await fetch(`${API_BASE_URL}/v1/auth/telegram/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, role }),
    });
    const data = await res.json();
    if (data.ok) {
      authToken = data.token;
      currentUser = {
        ...data.user,
        phone: telegramUser?.phone || undefined,
        firstName: telegramUser?.firstName || undefined,
        lastName: telegramUser?.lastName || undefined,
      };
      renderUserBadge();
      await updateProfileCard();
      setProfileStatus('Профиль создан и авторизован');
      return currentUser;
    }
  } catch (err) {
    console.warn('Auth error, using fallback', err);
  }
  if (DEMO_FALLBACK) {
    const telegramUser = getUserFromTelegramWebApp();
    const initUser = extractUserFromInitData(window.Telegram?.WebApp?.initData || '');
    currentUser = {
      id: telegramUser?.id || initUser?.id || '999999',
      username: telegramUser?.username || initUser?.username || 'demo_user',
      firstName: telegramUser?.firstName || initUser?.firstName,
      lastName: telegramUser?.lastName || initUser?.lastName,
      phone: telegramUser?.phone,
    };
    renderUserBadge();
    await updateProfileCard();
    setProfileStatus('Профиль создан (демо режим)');
    return currentUser;
  }
  return null;
}

function applySettingsToForm(settings: Settings) {
  const visibility = document.getElementById('setting-visibility') as HTMLSelectElement | null;
  const notifications = document.getElementById('setting-notifications') as HTMLInputElement | null;
  const language = document.getElementById('setting-language') as HTMLSelectElement | null;
  if (visibility) visibility.value = settings.visibility;
  if (notifications) notifications.checked = settings.notifications;
  if (language) language.value = settings.language;
}

function readSettingsFromForm(): Settings {
  const visibility = (document.getElementById('setting-visibility') as HTMLSelectElement).value as
    | 'public'
    | 'private';
  const notifications = (document.getElementById('setting-notifications') as HTMLInputElement).checked;
  const language = (document.getElementById('setting-language') as HTMLSelectElement).value as 'ru' | 'en';
  return { visibility, notifications, language };
}

function restoreQuickNote() {
  const note = localStorage.getItem(QUICK_NOTE_KEY);
  const field = document.getElementById('quick-note') as HTMLTextAreaElement | null;
  if (note && field) field.value = note;
}

function runQuickAction() {
  const noteField = document.getElementById('quick-note') as HTMLTextAreaElement;
  const status = document.getElementById('action-status');
  const note = noteField.value.trim();
  if (!note) {
    if (status) status.textContent = 'Добавьте текст заявки';
    return;
  }
  localStorage.setItem(QUICK_NOTE_KEY, note);
  if (status) status.textContent = 'Отправляем...';
  setTimeout(() => {
    if (status) status.textContent = 'Заявка отправлена (демо). Мы сохранили её локально.';
  }, 350);
}

async function updateWalletUI(address?: string) {
  walletAddress = address || null;
  const status = document.getElementById('wallet-status');
  const pill = document.getElementById('wallet-address-pill');
  const balanceEl = document.getElementById('wallet-balance');
  const linkEl = document.getElementById('wallet-link') as HTMLAnchorElement | null;
  
  if (address) {
    if (status) status.textContent = 'Кошелек подключен';
    if (pill) pill.textContent = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    if (linkEl) {
      linkEl.href = `https://tonviewer.com/${address}`;
      linkEl.style.display = 'inline-block';
    }
    if (balanceEl) {
      balanceEl.textContent = 'Загружаем...';
      try {
        const res = await fetch(`${API_BASE_URL}/v1/wallet/balance?address=${address}`, {
          headers: { Authorization: authToken ? `Bearer ${authToken}` : '' },
        });
        const data = await res.json();
        if (data.ok) {
          const balance = parseFloat(data.balance || '0');
          balanceEl.textContent = `${balance.toFixed(2)} TON`;
        } else {
          balanceEl.textContent = 'Не удалось загрузить';
        }
      } catch (err) {
        console.error('Error loading balance', err);
        balanceEl.textContent = 'Ошибка загрузки';
      }
    }
  } else {
    if (status) status.textContent = 'Подключите кошелек через кнопку в шапке';
    if (pill) pill.textContent = 'Нет кошелька';
    if (balanceEl) balanceEl.textContent = '—';
    if (linkEl) linkEl.style.display = 'none';
  }
}

function renderLayout() {
  app.innerHTML = `
    <div class="layout-grid">
      <div class="card">
        <div class="section-title">Профиль</div>
        <div class="helper" id="profile-status">Ожидаем авторизацию через Telegram...</div>
        <div class="info-line"><span>Имя</span><strong id="profile-name">—</strong></div>
        <div class="info-line"><span>Telegram ID</span><strong id="profile-id">—</strong></div>
        <div class="info-line"><span>Username</span><strong id="profile-username">—</strong></div>
        <div class="info-line"><span>Телефон</span><strong id="profile-phone">—</strong></div>
        <div class="info-line"><span>Хэш профиля</span><strong id="profile-hash" style="font-family: monospace; font-size: 12px;">—</strong></div>
        <div class="button-row">
          <button id="copy-profile">Скопировать ID</button>
          <button id="refresh-profile" class="secondary">Обновить</button>
          <button id="request-phone" class="secondary">Запросить телефон</button>
        </div>
      </div>
      <div class="card">
        <div class="section-title">Настройки профиля</div>
        <label for="setting-visibility">Видимость</label>
        <select id="setting-visibility">
          <option value="public">Публичный</option>
          <option value="private">Только я</option>
        </select>
        <div class="toggle-row">
          <input type="checkbox" id="setting-notifications" />
          <label for="setting-notifications">Уведомления в Telegram</label>
        </div>
        <label for="setting-language">Язык</label>
        <select id="setting-language">
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </select>
        <div class="button-row">
          <button id="save-settings">Сохранить</button>
        </div>
        <div class="helper" id="settings-status">Настройки не сохранены</div>
      </div>
      <div class="card">
        <div class="section-title">Кошелек TON</div>
        <div class="helper" id="wallet-status">Подключите кошелек через кнопку в шапке.</div>
        <div class="pill muted" id="wallet-address-pill">Нет кошелька</div>
        <div class="info-line" style="margin-top: 12px;">
          <span>Баланс</span>
          <strong id="wallet-balance">—</strong>
        </div>
        <div class="button-row">
          <a id="wallet-link" href="#" target="_blank" rel="noopener noreferrer" style="display: none;">
            <button class="secondary">Открыть в TON Viewer</button>
          </a>
          <button id="refresh-wallet" class="secondary">Обновить баланс</button>
        </div>
      </div>
      <div class="card">
        <div class="section-title">Быстрое действие</div>
        <label for="quick-note">Комментарий</label>
        <textarea id="quick-note" placeholder="Например, запросить справку или статус"></textarea>
        <div class="button-row">
          <button id="run-action">Отправить</button>
        </div>
        <div class="status-box" id="action-status">Ждет ввода.</div>
      </div>
    </div>
  `;
}

async function handleRequestPhone() {
  if (!window.Telegram?.WebApp) {
    setProfileStatus('Telegram WebApp недоступен');
    return;
  }
  setProfileStatus('Запрашиваем номер телефона...');
  try {
    window.Telegram.WebApp.requestContact();
    setTimeout(() => {
      const updatedUser = getUserFromTelegramWebApp();
      if (updatedUser?.phone && currentUser) {
        currentUser.phone = updatedUser.phone;
        updateProfileCard().then(() => {
          setProfileStatus('Телефон получен. Если не видите изменения, обновите страницу.');
        });
      } else {
        setProfileStatus('Предоставьте доступ к номеру телефона в настройках бота');
      }
    }, 1500);
  } catch (err) {
    console.error('Error requesting phone', err);
    setProfileStatus('Ошибка при запросе номера телефона');
  }
}

function wireUI() {
  document.getElementById('copy-profile')?.addEventListener('click', () => {
    if (!currentUser?.id) return;
    navigator.clipboard.writeText(currentUser.id.toString());
    setProfileStatus('ID скопирован в буфер обмена');
  });
  document.getElementById('refresh-profile')?.addEventListener('click', () => authenticate('holder'));
  document.getElementById('request-phone')?.addEventListener('click', handleRequestPhone);
  document.getElementById('save-settings')?.addEventListener('click', () => {
    saveSettings(readSettingsFromForm());
  });
  document.getElementById('run-action')?.addEventListener('click', runQuickAction);
  document.getElementById('refresh-wallet')?.addEventListener('click', () => {
    if (walletAddress) {
      updateWalletUI(walletAddress);
    }
  });
}

function initTonConnect() {
  const target = document.getElementById('ton-connect');
  if (!target) return;
  tonConnectUI = new TonConnectUI({
    manifestUrl: 'https://ton-connect.github.io/demo-dapp-with-react-ui/tonconnect-manifest.json',
  });
  tonConnectUI.uiOptions = { twaReturnUrl: 'https://t.me' };
  tonConnectUI.renderWalletList(target);
  tonConnectUI.onStatusChange((wallet: any) => {
    updateWalletUI(wallet?.account?.address);
  });
}

function initTelegramUI() {
  if (window.Telegram?.WebApp) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  }
}

renderLayout();
wireUI();
applySettingsToForm(loadSettings());
restoreQuickNote();
initTelegramUI();
initTonConnect();
updateWalletUI();
authenticate('holder');
