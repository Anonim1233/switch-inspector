/**
 * Личный кабинет: профиль, тема оформления, смена пароля.
 */
import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';

import { selectUser, selectIsDeveloper, logout } from '../../store/slices/authSlice';
import { setTheme, selectTheme } from '../../store/slices/uiSlice';
import { api } from '../../api/client';
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

