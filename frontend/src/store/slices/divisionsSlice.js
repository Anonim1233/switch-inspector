/**
 * Дивизионы и их состав.
 *
 * Помимо самого справочника хранится обратная карта «объект → дивизион»:
 * по ней проверяется зона ответственности пользователя, и строить её
 * перебором при каждой проверке было бы накладно.
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../api/client';

export const loadDivisions = createAsyncThunk('divisions/load', async (_, { rejectWithValue }) => {
  try {
    return await api.get('/api/divisions');
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

const divisionsSlice = createSlice({
  name: 'divisions',
  initialState: { map: {}, magToDivision: {}, status: 'idle', error: null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadDivisions.pending, (state) => { state.status = 'loading'; })
      .addCase(loadDivisions.fulfilled, (state, action) => {
        state.map = action.payload;
        const reverse = {};
        for (const [division, mags] of Object.entries(action.payload)) {
          for (const mag of mags) reverse[mag] = division;
        }
        state.magToDivision = reverse;
        state.status = 'ready';
      })
      .addCase(loadDivisions.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload;
      });
  },
});

export default divisionsSlice.reducer;

export const selectDivisions = (state) => state.divisions.map;
export const selectMagToDivision = (state) => state.divisions.magToDivision;
