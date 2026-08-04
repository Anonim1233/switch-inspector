/**
 * Данные вошедшего пользователя, вход и выход.
 *
 * Здесь же хранится роль и зона ответственности — от них зависит,
 * что пользователю доступно в интерфейсе.
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api, setToken, clearToken, getToken } from '../../api/client';

/**
 * Вход по логину и паролю.
 *
 * Сервер может ответить двумя способами: сразу выдать токен либо
 * потребовать подтверждение через Яндекс ID. Второй случай — не ошибка,
 * поэтому обрабатывается как обычный результат.
 */
export const login = createAsyncThunk(
  'auth/login',
  async ({ username, password }, { rejectWithValue }) => {
    try {
      const data = await api.post('/api/login', { username, password });
      if (data.requiresYandex) {
        return { requiresYandex: true, authUrl: data.yandexAuthUrl, state: data.state };
      }
      setToken(data.token);
      return { user: data };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Восстановление сессии при открытии приложения.
 *
 * Если сохранённый токен просрочен, сервер ответит отказом — это штатная
 * ситуация, а не сбой: просто показываем экран входа.
 */
export const restoreSession = createAsyncThunk(
  'auth/restore',
  async (_, { rejectWithValue }) => {
    if (!getToken()) return rejectWithValue(null);
    try {
      return await api.get('/api/me');
    } catch {
      clearToken();
      return rejectWithValue(null);
    }
  }
);

const initialState = {
  user: null,
  /** loading — идёт проверка сохранённой сессии, интерфейс ещё не решён */
  status: 'loading',
  error: null,
  /** Данные для шага подтверждения через Яндекс ID */
  pendingYandex: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** Завершение входа после подтверждения вторым фактором. */
    sessionEstablished(state, action) {
      setToken(action.payload.token);
      state.user = action.payload;
      state.status = 'authenticated';
      state.pendingYandex = null;
      state.error = null;
    },
    logout(state) {
      clearToken();
      state.user = null;
      state.status = 'anonymous';
      state.pendingYandex = null;
    },
    cancelYandexStep(state) {
      state.pendingYandex = null;
      state.error = null;
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = 'submitting';
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        if (action.payload.requiresYandex) {
          state.status = 'anonymous';
          state.pendingYandex = action.payload;
        } else {
          state.user = action.payload.user;
          state.status = 'authenticated';
        }
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'anonymous';
        state.error = action.payload ?? 'Не удалось войти';
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = 'authenticated';
      })
      .addCase(restoreSession.rejected, (state) => {
        state.status = 'anonymous';
      });
  },
});

export const { sessionEstablished, logout, cancelYandexStep, clearError } = authSlice.actions;
export default authSlice.reducer;

/* ── Выборки ───────────────────────────────────────────────────────────
   Проверки прав собраны здесь, а не разбросаны по компонентам: правило
   одно и то же во многих местах, и дублировать его — верный способ
   получить расхождение при изменении.

   Это подсказка интерфейсу, а не защита: настоящая проверка выполняется
   на сервере при каждом запросе. */

export const selectUser = (state) => state.auth.user;
export const selectIsAuthenticated = (state) => state.auth.status === 'authenticated';

export const selectIsDeveloper = (state) => state.auth.user?.role === 'developer';

/** Право редактировать данные вообще (роль не «только просмотр»). */
export const selectCanEdit = (state) => {
  const role = state.auth.user?.role;
  return role === 'admin' || role === 'developer';
};

/**
 * Право редактировать конкретный объект.
 *
 * Помимо роли учитывается зона ответственности: пустой список означает
 * отсутствие ограничений, непустой — доступ только к своим дивизионам.
 */
export const selectCanEditObject = (state, mag) => {
  const user = state.auth.user;
  if (!user) return false;
  if (user.role !== 'admin' && user.role !== 'developer') return false;

  const scope = user.scopeDivisions;
  if (!scope || scope.length === 0) return true;
  return state.divisions.magToDivision[mag] !== undefined
    ? scope.includes(state.divisions.magToDivision[mag])
    : false;
};
