/**
 * Совместная работа: заметки и отметки «обработано».
 *
 * Хранятся в виде словарей с ключом «объект__коммутатор» — так поиск
 * идёт напрямую, без перебора массива при каждой отрисовке строки.
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../api/client';

/** Ключ записи. Разделитель из двух подчёркиваний — в именах объектов
 *  и коммутаторов такого сочетания не встречается. */
export const collabKey = (mag, sw) => `${mag}__${sw}`;

export const loadCollab = createAsyncThunk('collab/load', async (_, { rejectWithValue }) => {
  try {
    const [notes, statuses] = await Promise.all([
      api.get('/api/notes'),
      api.get('/api/statuses'),
    ]);
    return { notes, statuses };
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

export const saveNote = createAsyncThunk('collab/saveNote', async ({ mag, sw, text }, { rejectWithValue }) => {
  try {
    await api.post('/api/notes', { mag, sw, text });
    return { mag, sw, text };
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

export const setProcessed = createAsyncThunk('collab/setProcessed', async ({ mag, sw, done }, { rejectWithValue }) => {
  try {
    await api.post('/api/statuses', { mag, sw, done });
    return { mag, sw, done };
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

function indexBy(rows) {
  const result = {};
  for (const row of rows) result[collabKey(row.mag, row.sw)] = row;
  return result;
}

const collabSlice = createSlice({
  name: 'collab',
  initialState: { notes: {}, statuses: {}, status: 'idle' },
  reducers: {
    /** Изменение от другого пользователя, пришедшее потоком обновлений. */
    noteUpdatedRemotely(state, action) {
      const { mag, sw, text } = action.payload;
      const key = collabKey(mag, sw);
      if (text) state.notes[key] = action.payload;
      else delete state.notes[key];
    },
    statusUpdatedRemotely(state, action) {
      const { mag, sw, done } = action.payload;
      const key = collabKey(mag, sw);
      if (done) state.statuses[key] = action.payload;
      else delete state.statuses[key];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadCollab.fulfilled, (state, action) => {
        state.notes = indexBy(action.payload.notes);
        state.statuses = indexBy(action.payload.statuses);
        state.status = 'ready';
      })
      .addCase(saveNote.fulfilled, (state, action) => {
        const { mag, sw, text } = action.payload;
        const key = collabKey(mag, sw);
        if (text) state.notes[key] = { ...state.notes[key], mag, sw, text };
        else delete state.notes[key];
      })
      .addCase(setProcessed.fulfilled, (state, action) => {
        const { mag, sw, done } = action.payload;
        const key = collabKey(mag, sw);
        if (done) state.statuses[key] = { mag, sw, done };
        else delete state.statuses[key];
      });
  },
});

export const { noteUpdatedRemotely, statusUpdatedRemotely } = collabSlice.actions;
export default collabSlice.reducer;

export const selectNote = (state, mag, sw) => state.collab.notes[collabKey(mag, sw)];
export const selectIsProcessed = (state, mag, sw) => Boolean(state.collab.statuses[collabKey(mag, sw)]);
