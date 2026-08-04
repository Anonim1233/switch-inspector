/**
 * Коммутаторы — основные данные приложения.
 *
 * Записи хранятся плоским списком, а группировка по объектам и карта
 * префиксов вычисляются при загрузке: они нужны почти в каждом разделе,
 * и пересчитывать их при каждой отрисовке было бы расточительно.
 */
import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import { api } from '../../api/client';
import { withIssues, detectPrefix } from '../../domain/issues';

export const loadSwitches = createAsyncThunk(
  'switches/load',
  async (_, { rejectWithValue }) => {
    try {
      const rows = await api.get('/api/switches');
      return rows.map(withIssues);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const saveSwitch = createAsyncThunk(
  'switches/save',
  async (payload, { rejectWithValue }) => {
    try {
      await api.post('/api/switches', payload);
      return payload;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const deleteSwitch = createAsyncThunk(
  'switches/delete',
  async ({ mag, sw }, { rejectWithValue }) => {
    try {
      await api.delete(`/api/switches/${encodeURIComponent(mag)}/${encodeURIComponent(sw)}`);
      return { mag, sw };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/** Пересчёт группировки и префиксов. Вызывается после любого изменения
 *  списка, чтобы производные данные не разошлись с исходными. */
function regroup(state) {
  const grouped = {};
  for (const row of state.items) {
    const mag = row['Mag'] || '?';
    (grouped[mag] ||= []).push(row);
  }
  state.grouped = grouped;

  const prefixMap = {};
  for (const [mag, rows] of Object.entries(grouped)) {
    prefixMap[mag] = detectPrefix(rows);
  }
  state.prefixMap = prefixMap;
}

const switchesSlice = createSlice({
  name: 'switches',
  initialState: {
    items: [],
    grouped: {},
    prefixMap: {},
    status: 'idle',
    error: null,
  },
  reducers: {
    /**
     * Применение изменения, пришедшего от другого пользователя.
     * Данные приходят потоком обновлений и должны попасть в интерфейс
     * без перезагрузки страницы.
     */
    switchUpdatedRemotely(state, action) {
      const incoming = withIssues(action.payload);
      const index = state.items.findIndex(
        (r) => r['Mag'] === incoming['Mag'] && r['Коммутатор'] === incoming['Коммутатор']
      );
      if (index >= 0) state.items[index] = incoming;
      else state.items.push(incoming);
      regroup(state);
    },
    switchDeletedRemotely(state, action) {
      const { mag, sw } = action.payload;
      state.items = state.items.filter(
        (r) => !(r['Mag'] === mag && r['Коммутатор'] === sw)
      );
      regroup(state);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadSwitches.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loadSwitches.fulfilled, (state, action) => {
        state.items = action.payload;
        state.status = 'ready';
        regroup(state);
      })
      .addCase(loadSwitches.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload;
      })
      .addCase(saveSwitch.fulfilled, (state, action) => {
        const incoming = withIssues(action.payload);
        const index = state.items.findIndex(
          (r) => r['Mag'] === incoming['Mag'] && r['Коммутатор'] === incoming['Коммутатор']
        );
        if (index >= 0) state.items[index] = incoming;
        else state.items.push(incoming);
        regroup(state);
      })
      .addCase(deleteSwitch.fulfilled, (state, action) => {
        const { mag, sw } = action.payload;
        state.items = state.items.filter(
          (r) => !(r['Mag'] === mag && r['Коммутатор'] === sw)
        );
        regroup(state);
      });
  },
});

export const { switchUpdatedRemotely, switchDeletedRemotely } = switchesSlice.actions;
export default switchesSlice.reducer;

/* ── Выборки ─────────────────────────────────────────────────────────── */

export const selectSwitches = (state) => state.switches.items;
export const selectGrouped = (state) => state.switches.grouped;
export const selectPrefixMap = (state) => state.switches.prefixMap;
export const selectSwitchesStatus = (state) => state.switches.status;

/** Список объектов по возрастанию. createSelector кеширует результат:
 *  без него новый массив создавался бы при каждой отрисовке и вызывал
 *  лишние перерисовки всех подписанных компонентов. */
export const selectMags = createSelector(
  [selectGrouped],
  (grouped) => Object.keys(grouped).sort()
);

export const selectTotals = createSelector([selectSwitches], (items) => {
  const withProblems = items.filter((r) => r._issues > 0).length;
  return {
    total: items.length,
    withIssues: withProblems,
    clean: items.length - withProblems,
    completion: items.length ? Math.round(((items.length - withProblems) / items.length) * 1000) / 10 : 0,
  };
});
