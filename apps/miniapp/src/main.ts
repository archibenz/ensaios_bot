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
let currentUser: { id: string; username?: string } | null = null;
let tonConnectUI: TonConnectUI | null = null;

const app = document.getElementById('app')!;

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

function updateProfileCard() {
  const idEl = document.getElementById('profile-id');
  const usernameEl = document.getElementById('profile-username');
  if (!currentUser) {
    setProfileStatus('Не удалось авторизоваться через Telegram');
    if (idEl) idEl.textContent = '—';
    if (usernameEl) usernameEl.textContent = '—';
    return;
  }
  if (idEl) idEl.textContent = currentUser.id;
  if (usernameEl) usernameEl.textContent = currentUser.username ? `@${currentUser.username}` : 'не указано';
  setProfileStatus('Авторизованы через Telegram');
}

async function authenticate(role: 'issuer' | 'holder' = 'holder') {
  setProfileStatus('Авторизуем через Telegram...');
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
      updateProfileCard();
      return data.user;
    }
  } catch (err) {
    console.warn('Auth fallback to demo', err);
  }
  if (DEMO_FALLBACK) {
    currentUser = { id: '999999', username: 'demo_user' };
    renderUserBadge();
    updateProfileCard();
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

function updateWalletUI(address?: string) {
  const status = document.getElementById('wallet-status');
  const pill = document.getElementById('wallet-address-pill');
  if (address) {
    if (status) status.textContent = 'Кошелек подключен';
    if (pill) pill.textContent = address;
  } else {
    if (status) status.textContent = 'Подключите кошелек через кнопку в шапке';
    if (pill) pill.textContent = 'Нет кошелька';
  }
}

function renderLayout() {
  app.innerHTML = `
    <div class="layout-grid">
      <div class="card">
        <div class="section-title">Профиль</div>
        <div class="helper" id="profile-status">Ожидаем авторизацию через Telegram...</div>
        <div class="info-line"><span>Telegram ID</span><strong id="profile-id">—</strong></div>
        <div class="info-line"><span>Username</span><strong id="profile-username">—</strong></div>
        <div class="button-row">
          <button id="copy-profile">Скопировать ID</button>
          <button id="refresh-profile" class="secondary">Обновить</button>
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

function wireUI() {
  document.getElementById('copy-profile')?.addEventListener('click', () => {
    if (!currentUser?.id) return;
    navigator.clipboard.writeText(currentUser.id.toString());
    setProfileStatus('ID скопирован в буфер обмена');
  });
  document.getElementById('refresh-profile')?.addEventListener('click', () => authenticate('holder'));
  document.getElementById('save-settings')?.addEventListener('click', () => {
    saveSettings(readSettingsFromForm());
  });
  document.getElementById('run-action')?.addEventListener('click', runQuickAction);
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
