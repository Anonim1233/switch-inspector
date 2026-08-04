/**
 * Сборка хранилища.
 *
 * Данные разделены по областям: пользователь, коммутаторы, шкафы,
 * дивизионы, совместная работа (заметки и отметки). Каждая область
 * живёт в своём файле и не знает об остальных — связи только через
 * выборки, которые читают несколько областей сразу.
 */
import { configureStore } from '@reduxjs/toolkit';

import auth from './slices/authSlice';
import switches from './slices/switchesSlice';
import cabinets from './slices/cabinetsSlice';
import divisions from './slices/divisionsSlice';
import collab from './slices/collabSlice';
import ui from './slices/uiSlice';

export const store = configureStore({
  reducer: { auth, switches, cabinets, divisions, collab, ui },
});
