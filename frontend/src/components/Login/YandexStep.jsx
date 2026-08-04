/**
 * Второй шаг входа — подтверждение через Яндекс ID.
 *
 * Показывается код для сканирования телефоном и кнопка для перехода
 * на этом же устройстве. Пока пользователь подтверждает, страница
 * опрашивает сервер: подтверждение может произойти на другом
 * устройстве, и узнать об этом иначе неоткуда.
 */
import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';

import { api } from '../../api/client';
import { sessionEstablished } from '../../store/slices/authSlice';
import QrCode from '../common/QrCode';
import styles from './LoginScreen.module.css';

/** Интервал опроса. Реже — заметная задержка для пользователя,
 *  чаще — лишняя нагрузка без выигрыша в ощущениях. */
const POLL_INTERVAL_MS = 2500;

/** Столько же живёт состояние на сервере: дольше ждать бессмысленно. */
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

const MESSAGES = {
  error: 'Не удалось подтвердить через Яндекс ID.',
  expired: 'Время на подтверждение истекло.',
  mismatch: 'Это не тот аккаунт Яндекса, что привязан к вашему профилю.',
};

export default function YandexStep({ authUrl, state, onCancel }) {
  const dispatch = useDispatch();
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!state) return undefined;

    let stopped = false;
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    const timer = setInterval(async () => {
      if (stopped) return;

      if (Date.now() > deadline) {
        clearInterval(timer);
        setError(MESSAGES.expired);
        return;
      }

      try {
        const data = await api.get(`/api/oauth/yandex-status?state=${encodeURIComponent(state)}`);
        if (stopped) return;

        if (data.status === 'done') {
          clearInterval(timer);
          dispatch(sessionEstablished(data.result));
        } else if (data.status === 'error' || data.status === 'expired') {
          clearInterval(timer);
          setError(MESSAGES[data.result?.code] ?? MESSAGES.error);
        }
        /* pending — подтверждение ещё не получено, продолжаем ждать */
      } catch {
        /* Сбой одного запроса не прерывает ожидание: связь могла
           моргнуть, следующая попытка через несколько секунд. */
      }
    }, POLL_INTERVAL_MS);

    /* Остановка при уходе с экрана — иначе опрос продолжался бы
       в фоне и обращался к уже отсутствующему компоненту. */
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [state, dispatch]);

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <h1 className={styles.title}>Подтверждение</h1>
        <p className={styles.subtitle}>Вход через Яндекс ID</p>

        <div className={styles.qrWrap}>
          <QrCode value={authUrl} size={160} />
        </div>

        <p className={styles.hint}>
          Отсканируйте телефоном — или откройте на этом устройстве:
        </p>

        <a className={styles.submit} href={authUrl}>
          Войти через Яндекс ID
        </a>

        {error ? (
          <div className={styles.error} role="alert">{error}</div>
        ) : (
          <div className={styles.waiting}>Ожидаю подтверждения…</div>
        )}

        <button className={styles.back} type="button" onClick={onCancel}>
          ← Назад
        </button>
      </div>
    </div>
  );
}
