/**
 * Управление учётными записями. Доступно роли «разработчик».
 *
 * Здесь назначаются роли и зона ответственности — это прикладные
 * понятия самого приложения, а не корпоративного каталога.
 *
 * Работа с паролями вынесена в отдельные части (CreateUserForm и
 * ResetPasswordButton): при переходе на вход через Keycloak они
 * убираются целиком, а назначение ролей и дивизионов остаётся.
 */
import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';

import { api } from '../../api/client';
import { selectDivisions } from '../../store/slices/divisionsSlice';
import { selectUser } from '../../store/slices/authSlice';
import styles from './UsersModal.module.css';

const ROLES = [
  { value: 'viewer', label: 'Только просмотр' },
  { value: 'admin', label: 'Редактирование' },
  { value: 'developer', label: 'Полный доступ' },
];

export default function UsersModal({ onClose }) {
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);

  const divisions = useSelector(selectDivisions);
  const currentUser = useSelector(selectUser);
  const divisionNames = Object.keys(divisions).sort();

  async function reload() {
    try {
      setUsers(await api.get('/api/users'));
    } catch (error) {
      setMessage({ type: 'err', text: error.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <>
      <button className={styles.overlay} onClick={onClose} aria-label="Закрыть" />

      <div className={styles.modal} role="dialog" aria-label="Управление пользователями">
        <div className={styles.header}>
          <span className={styles.title}>Пользователи</span>
          <div className={styles.spacer} />
          <button className={styles.close} onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <div className={styles.body}>
          <CreateUserForm onCreated={() => { reload(); setMessage({ type: 'ok', text: 'Учётная запись создана.' }); }} />

          {message && (
            <div className={`${styles.message} ${message.type === 'ok' ? styles.messageOk : styles.messageErr}`}>
              {message.text}
            </div>
          )}

          {loading ? (
            <div className={styles.scopeHint}>Загрузка…</div>
          ) : (
            users.map((user) => (
              <UserRow
                key={user.username}
                user={user}
                divisionNames={divisionNames}
                isSelf={user.username === currentUser?.username}
                onChanged={reload}
                onMessage={setMessage}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

/* ── Одна учётная запись ────────────────────────────────────────────── */

function UserRow({ user, divisionNames, isSelf, onChanged, onMessage }) {
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scope, setScope] = useState(user.scopeDivisions ?? []);
  const [saving, setSaving] = useState(false);

  async function changeRole(role) {
    try {
      await api.put(`/api/users/${encodeURIComponent(user.username)}`, { role });
      onChanged();
    } catch (error) {
      onMessage({ type: 'err', text: error.message });
    }
  }

  async function saveScope() {
    setSaving(true);
    try {
      await api.put(`/api/users/${encodeURIComponent(user.username)}/divisions`, {
        divisions: scope,
      });
      onMessage({ type: 'ok', text: `Зона ответственности пользователя ${user.username} обновлена.` });
      setScopeOpen(false);
      onChanged();
    } catch (error) {
      onMessage({ type: 'err', text: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Удалить учётную запись ${user.username}? Действие необратимо.`)) return;
    try {
      await api.delete(`/api/users/${encodeURIComponent(user.username)}`);
      onChanged();
    } catch (error) {
      onMessage({ type: 'err', text: error.message });
    }
  }

  return (
    <div className={styles.user}>
      <div className={styles.userTop}>
        {user.avatar ? (
          <img className={styles.avatar} src={user.avatar} alt="" />
        ) : (
          <div className={styles.avatar}>
            {(user.displayName || user.username).charAt(0).toUpperCase()}
          </div>
        )}

        <div>
          <div className={styles.userName}>{user.displayName || user.username}</div>
          <div className={styles.userLogin}>{user.username}</div>
        </div>

        {user.yandexLinked && <span className={styles.badge}>Яндекс ID</span>}

        <div className={styles.spacer} />

        {/* Своя роль не меняется: понизив себя, разработчик потерял бы
            доступ к этому окну и не смог бы всё вернуть. */}
        <select
          className={styles.select}
          value={user.role}
          onChange={(e) => changeRole(e.target.value)}
          disabled={isSelf}
          title={isSelf ? 'Нельзя изменить собственную роль' : 'Уровень доступа'}
        >
          {ROLES.map((role) => (
            <option key={role.value} value={role.value}>{role.label}</option>
          ))}
        </select>

        <button className={styles.button} onClick={() => setScopeOpen((v) => !v)}>
          Дивизионы{user.scopeDivisions?.length ? ` (${user.scopeDivisions.length})` : ''}
        </button>

        <ResetPasswordButton username={user.username} onMessage={onMessage} />

        {!isSelf && (
          <button className={`${styles.button} ${styles.danger}`} onClick={remove}>
            Удалить
          </button>
        )}
      </div>

      {scopeOpen && (
        <div className={styles.scope}>
          <div className={styles.scopeTitle}>Доступные дивизионы</div>
          <div className={styles.scopeGrid}>
            {divisionNames.map((name) => (
              <label className={styles.scopeItem} key={name}>
                <input
                  type="checkbox"
                  checked={scope.includes(name)}
                  onChange={(e) =>
                    setScope((prev) =>
                      e.target.checked ? [...prev, name] : prev.filter((d) => d !== name)
                    )
                  }
                />
                {name}
              </label>
            ))}
          </div>

          <div className={styles.row}>
            <button className={`${styles.button} ${styles.primary}`} onClick={saveScope} disabled={saving}>
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </button>
            <button className={styles.button} onClick={() => setScope([])}>
              Снять все
            </button>
          </div>

          <div className={styles.scopeHint}>
            Если не отмечен ни один дивизион, пользователь видит все объекты.
            Отметьте нужные, чтобы ограничить доступ.
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Части, относящиеся к паролю ─────────────────────────────────────
   Вынесены отдельно намеренно: при переходе на вход через корпоративный
   каталог удаляются целиком, не затрагивая остальной код. */

function CreateUserForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', displayName: '', role: 'viewer' });
  const [error, setError] = useState(null);

  async function submit() {
    setError(null);
    if (!form.username || !form.password || !form.displayName) {
      setError('Заполните логин, пароль и отображаемое имя.');
      return;
    }
    if (form.password.length < 8) {
      setError('Пароль должен быть не короче 8 символов.');
      return;
    }
    try {
      await api.post('/api/users', form);
      setForm({ username: '', password: '', displayName: '', role: 'viewer' });
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!open) {
    return (
      <button
        className={`${styles.button} ${styles.primary}`}
        style={{ marginBottom: 14 }}
        onClick={() => setOpen(true)}
      >
        + Добавить пользователя
      </button>
    );
  }

  return (
    <div className={styles.newUser}>
      <div className={styles.field}>
        <span className={styles.label}>Логин</span>
        <input
          className={styles.input}
          value={form.username}
          onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>Отображаемое имя</span>
        <input
          className={styles.input}
          value={form.displayName}
          onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>Пароль</span>
        <input
          className={styles.input}
          type="password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
        />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>Уровень доступа</span>
        <select
          className={styles.select}
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
        >
          {ROLES.map((role) => (
            <option key={role.value} value={role.value}>{role.label}</option>
          ))}
        </select>
      </div>

      <div className={styles.row}>
        <button className={`${styles.button} ${styles.primary}`} onClick={submit}>Создать</button>
        <button className={styles.button} onClick={() => { setOpen(false); setError(null); }}>Отмена</button>
      </div>

      {error && <div className={`${styles.message} ${styles.messageErr}`}>{error}</div>}
    </div>
  );
}

function ResetPasswordButton({ username, onMessage }) {
  async function reset() {
    const password = window.prompt(`Новый пароль для ${username} (не короче 8 символов):`);
    if (!password) return;
    if (password.length < 8) {
      onMessage({ type: 'err', text: 'Пароль должен быть не короче 8 символов.' });
      return;
    }
    try {
      await api.put(`/api/users/${encodeURIComponent(username)}`, { password });
      onMessage({ type: 'ok', text: `Пароль пользователя ${username} изменён.` });
    } catch (error) {
      onMessage({ type: 'err', text: error.message });
    }
  }

  return <button className={styles.button} onClick={reset}>Сбросить пароль</button>;
}
