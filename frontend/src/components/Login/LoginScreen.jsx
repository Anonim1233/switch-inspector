/**
 * Экран входа по логину и паролю.
 *
 * При подключении корпоративного входа сюда добавится кнопка перехода
 * к поставщику учётных записей — см. docs/Keycloak-карта-изменений.md
 */
import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';

import { login, clearError } from '../../store/slices/authSlice';
import styles from './LoginScreen.module.css';

export default function LoginScreen() {
  const dispatch = useDispatch();
  const { status, error } = useSelector((state) => state.auth);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submitting = status === 'submitting';

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
      </form>
    </div>
  );
}
