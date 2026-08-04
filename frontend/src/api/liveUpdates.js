/**
 * Живые обновления: изменения от других пользователей приходят
 * потоком событий и попадают в интерфейс без перезагрузки страницы.
 */
import { getToken } from './client';
import {
  switchUpdatedRemotely, switchDeletedRemotely, loadSwitches,
} from '../store/slices/switchesSlice';
import { noteUpdatedRemotely, statusUpdatedRemotely } from '../store/slices/collabSlice';

const BASE = import.meta.env.VITE_API_BASE ?? '';

let source = null;

/**
 * Подключается к потоку событий.
 *
 * Токен передаётся в адресе, а не заголовком: браузерный EventSource
 * не умеет отправлять собственные заголовки. Это вынужденное решение,
 * перенесённое из прежней версии.
 *
 * @param {Function} dispatch — для применения событий к хранилищу
 * @param {string} currentUser — чтобы не реагировать на свои же действия
 * @returns {Function} отключение
 */
export function connectLiveUpdates(dispatch, currentUser) {
  if (source) return disconnectLiveUpdates;

  const token = getToken();
  if (!token) return () => {};

  try {
    source = new EventSource(`${BASE}/api/events?token=${encodeURIComponent(token)}`);
  } catch {
    /* Поток недоступен — приложение продолжает работать, просто чужие
       изменения будут видны после перезагрузки страницы. */
    return () => {};
  }

  source.onmessage = (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return; /* повреждённое событие пропускаем, соединение не рвём */
    }
    applyEvent(dispatch, message, currentUser);
  };

  source.onerror = () => {
    /* EventSource переподключается сам. Создавать здесь ещё одно
       соединение нельзя — получились бы дубли и двойные обновления. */
  };

  return disconnectLiveUpdates;
}

export function disconnectLiveUpdates() {
  if (source) {
    source.close();
    source = null;
  }
}

/** Применяет одно событие к хранилищу. */
function applyEvent(dispatch, message, currentUser) {
  /* Собственные действия уже отражены в интерфейсе — применять их
     повторно значит перетереть возможные локальные правки. */
  if (message.user && message.user === currentUser) return;

  switch (message.type) {
    case 'connected':
      break;

    case 'note':
      dispatch(noteUpdatedRemotely({
        mag: message.mag,
        sw: message.sw,
        text: message.text,
        display_name: message.displayName,
        updated_at: message.ts,
      }));
      break;

    case 'status':
      dispatch(statusUpdatedRemotely({
        mag: message.mag,
        sw: message.sw,
        done: message.done,
        display_name: message.displayName,
        updated_at: message.ts,
      }));
      break;

    case 'switch':
      dispatch(switchUpdatedRemotely(message.row));
      break;

    case 'switch_delete':
      dispatch(switchDeletedRemotely({ mag: message.mag, sw: message.sw }));
      break;

    case 'switches_bulk':
      /* При массовом импорте проще перезагрузить список целиком, чем
         разбирать, что изменилось в тысяче строк. */
      dispatch(loadSwitches());
      break;

    default:
      /* Неизвестный тип события — вероятно, новее этой версии клиента.
         Пропускаем молча, чтобы старый клиент не ломался о новый сервер. */
      break;
  }
}
