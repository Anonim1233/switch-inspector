/**
 * Экран входа по логину и паролю.
 *
 * При подключении корпоративного входа сюда добавится кнопка перехода
 * к поставщику учётных записей — см. docs/Keycloak-карта-изменений.md
 */
import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';

import { login, clearError } from '../../store/slices/authSlice';
import { api } from '../../api/client';
import styles from './LoginScreen.module.css';

export default function LoginScreen() {
  const dispatch = useDispatch();
  const { status, error } = useSelector((state) => state.auth);

  const [corporateAvailable, setCorporateAvailable] = useState(false);
  // Служебный вход по паролю скрыт по умолчанию: он предназначен для
  // одной учётной записи и не должен путать остальных сотрудников.
  const [serviceLoginOpen, setServiceLoginOpen] = useState(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submitting = status === 'submitting';

  // Доступность корпоративного входа сообщает сервер: показывать
  // кнопку, которая никуда не ведёт, хуже, чем не показывать вовсе.
  useEffect(() => {
    api.get('/api/health')
      .then((data) => setCorporateAvailable(Boolean(data.oidcEnabled)))
      .catch(() => setCorporateAvailable(false));
  }, []);

  async function startCorporateLogin() {
    try {
      const { authUrl } = await api.get('/api/auth/oidc/start');
      window.location.href = authUrl;
    } catch (err) {
      window.alert(err.message);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!username || !password || submitting) return;
    dispatch(login({ username, password }));
  }


  return (
    <div className={styles.screen}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Switch Inspector</h1>
        <p className={styles.subtitle}>Инвентаризация сетевого оборудования</p>

        {corporateAvailable && (
          <>
            <button
              className={styles.submit}
              type="button"
              onClick={startCorporateLogin}
            >
              Войти по корпоративной учётной записи
            </button>

            {!serviceLoginOpen && (
              <button
                className={styles.serviceToggle}
                type="button"
                onClick={() => setServiceLoginOpen(true)}
              >
                Служебный вход
              </button>
            )}
          </>
        )}

        {(!corporateAvailable || serviceLoginOpen) && (
          <>
        <label className={styles.field}>
          <span className={styles.label}>Логин</span>
          <input
            className={styles.input}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (error) dispatch(clearError());
            }}
            autoComplete="username"
            autoFocus
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Пароль</span>
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) dispatch(clearError());
            }}
            autoComplete="current-password"
          />
        </label>

        {/* role="alert" — чтобы программы чтения с экрана сообщили
            об ошибке сразу, а не при следующем переходе по полям */}
        {error && <div className={styles.error} role="alert">{error}</div>}

        <button className={styles.submit} type="submit" disabled={submitting}>
          {submitting ? 'Вхожу…' : 'Войти'}
        </button>
          </>
        )}
      </form>
    </div>
  );
}
