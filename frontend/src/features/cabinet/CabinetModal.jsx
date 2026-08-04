/**
 * Личный кабинет: профиль, тема оформления, смена пароля,
 * подтверждение входа через Яндекс ID.
 */
import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';

import { selectUser, selectIsDeveloper, logout } from '../../store/slices/authSlice';
import { setTheme, selectTheme } from '../../store/slices/uiSlice';
import { api } from '../../api/client';
import QrCode from '../../components/common/QrCode';
import UsersModal from '../users/UsersModal';
import styles from './CabinetModal.module.css';

const ROLE_LABELS = {
  developer: 'Разработчик',
  admin: 'Редактирование',
  viewer: 'Только просмотр',
};

export default function CabinetModal({ onClose }) {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const theme = useSelector(selectTheme);
  const isDeveloper = useSelector(selectIsDeveloper);
  const [usersOpen, setUsersOpen] = useState(false);

  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!user) return null;

  return (
    <>
      <button className={styles.overlay} onClick={onClose} aria-label="Закрыть кабинет" />

      <div className={styles.modal} role="dialog" aria-label="Личный кабинет">
        <div className={styles.header}>
          <span className={styles.title}>Личный кабинет</span>
          <div className={styles.spacer} />
          <button className={styles.close} onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <div className={styles.body}>
          <div className={styles.section}>
            <div className={styles.profile}>
              {user.avatar ? (
                <img className={styles.avatar} src={user.avatar} alt="" />
              ) : (
                <div className={styles.avatar}>
                  {(user.displayName || user.username).charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className={styles.profileName}>{user.displayName || user.username}</div>
                <div className={styles.profileMeta}>
                  {user.username} · {ROLE_LABELS[user.role] ?? user.role}
                </div>
                {user.scopeDivisions?.length > 0 && (
                  <div className={styles.profileMeta}>
                    Зона ответственности: {user.scopeDivisions.join(', ')}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Оформление</div>
            <div className={styles.themeRow}>
              <button
                className={`${styles.themeBtn} ${theme === 'light' ? styles.themeBtnActive : ''}`}
                onClick={() => dispatch(setTheme('light'))}
              >
                ☀ Светлая
              </button>
              <button
                className={`${styles.themeBtn} ${theme === 'dark' ? styles.themeBtnActive : ''}`}
                onClick={() => dispatch(setTheme('dark'))}
              >
                ☾ Тёмная
              </button>
            </div>
          </div>

          <PasswordSection />
          <YandexSection user={user} />
        </div>

        <div className={styles.header} style={{ borderTop: '1px solid var(--border)', borderBottom: 'none' }}>
          <button className={`${styles.button} ${styles.danger}`} onClick={() => dispatch(logout())}>
            Выйти
          </button>
          <div className={styles.spacer} />
          {isDeveloper && (
            <button className={styles.button} onClick={() => setUsersOpen(true)}>
              Пользователи
            </button>
          )}
        </div>
      </div>

      {usersOpen && <UsersModal onClose={() => setUsersOpen(false)} />}
    </>
  );
}

/* ── Смена пароля ───────────────────────────────────────────────────── */

function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [message, setMessage] = useState(null);

  async function handleSubmit() {
    setMessage(null);

    if (next.length < 8) {
      setMessage({ type: 'err', text: 'Новый пароль должен быть не короче 8 символов.' });
      return;
    }
    if (next !== repeat) {
      setMessage({ type: 'err', text: 'Новый пароль и подтверждение не совпадают.' });
      return;
    }

    try {
      await api.put('/api/me/password', { currentPassword: current, newPassword: next });
      setMessage({ type: 'ok', text: 'Пароль изменён.' });
      setCurrent(''); setNext(''); setRepeat('');
    } catch (error) {
      setMessage({ type: 'err', text: error.message });
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Смена пароля</div>

      <div className={styles.field}>
        <span className={styles.label}>Текущий пароль</span>
        <input
          className={styles.input}
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>Новый пароль</span>
        <input
          className={styles.input}
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>Повторите новый пароль</span>
        <input
          className={styles.input}
          type="password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      <button className={`${styles.button} ${styles.primary}`} onClick={handleSubmit}>
        Изменить пароль
      </button>

      {message && (
        <div className={`${styles.message} ${message.type === 'ok' ? styles.messageOk : styles.messageErr}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}

/* ── Подтверждение через Яндекс ID ──────────────────────────────────── */

const POLL_INTERVAL_MS = 2500;

function YandexSection({ user }) {
  const [linking, setLinking] = useState(null);
  const [message, setMessage] = useState(null);
  const [password, setPassword] = useState('');
  const [linked, setLinked] = useState(Boolean(user.yandexLinked));

  /* Пока идёт привязка, опрашиваем сервер: подтверждение может
     произойти на телефоне, и узнать об этом иначе неоткуда. */
  useEffect(() => {
    if (!linking?.state) return undefined;

    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const data = await api.get(
          `/api/oauth/yandex-status?state=${encodeURIComponent(linking.state)}`
        );
        if (stopped) return;

        if (data.status === 'done') {
          clearInterval(timer);
          setLinking(null);
          setLinked(true);
          setMessage({ type: 'ok', text: 'Аккаунт Яндекса привязан.' });
        } else if (data.status === 'error' || data.status === 'expired') {
          clearInterval(timer);
          setLinking(null);
          setMessage({
            type: 'err',
            text: data.result?.code === 'taken'
              ? 'Этот аккаунт Яндекса уже привязан к другому пользователю.'
              : 'Не удалось привязать аккаунт.',
          });
        }
      } catch {
        /* Сбой одного запроса не прерывает ожидание. */
      }
    }, POLL_INTERVAL_MS);

    return () => { stopped = true; clearInterval(timer); };
  }, [linking]);

  async function startLink() {
    setMessage(null);
    try {
      const data = await api.post('/api/yandex/link/start');
      setLinking({ authUrl: data.authUrl, state: data.state });
    } catch (error) {
      setMessage({ type: 'err', text: error.message });
    }
  }

  async function unlink() {
    setMessage(null);
    if (!password) {
      setMessage({ type: 'err', text: 'Для отвязки введите текущий пароль.' });
      return;
    }
    try {
      await api.post('/api/yandex/unlink', { password });
      setLinked(false);
      setPassword('');
      setMessage({ type: 'ok', text: 'Аккаунт Яндекса отвязан.' });
    } catch (error) {
      setMessage({ type: 'err', text: error.message });
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Подтверждение входа</div>

      {linking ? (
        <>
          <div className={styles.qrWrap}>
            <QrCode value={linking.authUrl} size={150} />
          </div>
          <div className={styles.status}>
            Отсканируйте телефоном или откройте на этом устройстве:
          </div>
          <div className={styles.row} style={{ marginTop: 8 }}>
            <a className={`${styles.button} ${styles.primary}`} href={linking.authUrl}>
              Перейти к Яндекс ID
            </a>
            <button className={styles.button} onClick={() => setLinking(null)}>
              Отмена
            </button>
          </div>
        </>
      ) : linked ? (
        <>
          <div className={styles.status}>
            Вход подтверждается через <span className={styles.statusOn}>Яндекс ID</span>
          </div>
          <div className={styles.field} style={{ marginTop: 10 }}>
            <span className={styles.label}>Для отвязки введите текущий пароль</span>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button className={styles.button} onClick={unlink}>Отвязать</button>
        </>
      ) : (
        <>
          <div className={styles.status}>
            Второй фактор не настроен. После привязки вход будет требовать
            подтверждения через Яндекс ID.
          </div>
          <button
            className={`${styles.button} ${styles.primary}`}
            style={{ marginTop: 10 }}
            onClick={startLink}
          >
            Привязать Яндекс ID
          </button>
        </>
      )}

      {message && (
        <div className={`${styles.message} ${message.type === 'ok' ? styles.messageOk : styles.messageErr}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
