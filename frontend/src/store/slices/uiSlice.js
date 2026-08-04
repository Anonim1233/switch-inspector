/**
 * Состояние интерфейса: тема оформления, фильтры, боковая панель.
 * Отделено от данных намеренно — сбрасывать его при перезагрузке данных
 * не нужно, а хранить вместе с ними значило бы путать разное.
 */
import { createSlice } from '@reduxjs/toolkit';

function readTheme() {
  try {
    return localStorage.getItem('sw-theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    theme: readTheme(),
    mobileSidebarOpen: false,
    /** Активная категория замечаний на дашборде; all — фильтр снят */
    dashFilter: 'all',
    search: '',
  },
  reducers: {
    setTheme(state, action) {
      state.theme = action.payload;
      try {
        localStorage.setItem('sw-theme', action.payload);
      } catch {
        /* хранилище недоступно — тема продержится до перезагрузки */
      }
      document.documentElement.classList.toggle('dark', action.payload === 'dark');
    },
    toggleMobileSidebar(state) {
      state.mobileSidebarOpen = !state.mobileSidebarOpen;
    },
    closeMobileSidebar(state) {
      state.mobileSidebarOpen = false;
    },
    /** Повторный выбор той же категории снимает фильтр: отдельной
     *  кнопки сброса в интерфейсе нет. */
    setDashFilter(state, action) {
      state.dashFilter = state.dashFilter === action.payload ? 'all' : action.payload;
    },
    setSearch(state, action) {
      state.search = action.payload;
    },
  },
});

export const { setTheme, toggleMobileSidebar, closeMobileSidebar, setDashFilter, setSearch } = uiSlice.actions;
export default uiSlice.reducer;

export const selectTheme = (state) => state.ui.theme;
