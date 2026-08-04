/**
 * Шкафы и их наполнение.
 *
 * В отличие от коммутаторов данные загружаются по одному объекту,
 * а не целиком: шкафов много, а нужны они только при открытии раздела.
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../api/client';

export const loadCabinets = createAsyncThunk('cabinets/load', async (mag, { rejectWithValue }) => {
  try {
    const list = await api.get(`/api/cabinets?mag=${encodeURIComponent(mag)}`);
    return { mag, list };
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

export const loadCabinetItems = createAsyncThunk('cabinets/loadItems', async (cabinetId, { rejectWithValue }) => {
  try {
    const items = await api.get(`/api/cabinets/${cabinetId}/items`);
    return { cabinetId, items };
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

/** Сохранение содержимого заменяет его целиком — так же, как заполняется
 *  монтажный чертёж. Сервер возвращает позиции уже с отметками о сверке
 *  с базой коммутаторов, поэтому ответ кладётся в хранилище как есть. */
export const saveCabinetItems = createAsyncThunk(
  'cabinets/saveItems',
  async ({ cabinetId, items }, { rejectWithValue }) => {
    try {
      const saved = await api.put(`/api/cabinets/${cabinetId}/items`, { items });
      return { cabinetId, items: saved };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const loadUndocumented = createAsyncThunk('cabinets/undocumented', async (mag, { rejectWithValue }) => {
  try {
    return await api.get(`/api/cabinets/undocumented?mag=${encodeURIComponent(mag)}`);
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

const cabinetsSlice = createSlice({
  name: 'cabinets',
  initialState: {
    /** Шкафы текущего объекта */
    byMag: {},
    /** Содержимое шкафов, ключ — идентификатор шкафа */
    items: {},
    /** Коммутаторы объекта, не размещённые ни в одном шкафу */
    undocumented: {},
    status: 'idle',
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadCabinets.pending, (state) => { state.status = 'loading'; })
      .addCase(loadCabinets.fulfilled, (state, action) => {
        state.byMag[action.payload.mag] = action.payload.list;
        state.status = 'ready';
      })
      .addCase(loadCabinets.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload;
      })
      .addCase(loadCabinetItems.fulfilled, (state, action) => {
        state.items[action.payload.cabinetId] = action.payload.items;
      })
      .addCase(saveCabinetItems.fulfilled, (state, action) => {
        state.items[action.payload.cabinetId] = action.payload.items;
      })
      .addCase(loadUndocumented.fulfilled, (state, action) => {
        state.undocumented[action.payload.mag] = action.payload;
      });
  },
});

export default cabinetsSlice.reducer;

export const selectCabinets = (state, mag) => state.cabinets.byMag[mag] ?? [];
export const selectCabinetItems = (state, cabinetId) => state.cabinets.items[cabinetId] ?? [];
export const selectUndocumented = (state, mag) => state.cabinets.undocumented[mag];
