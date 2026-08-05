/**
 * Корневой компонент: решает, что показывать — экран входа или
 * приложение, и раскладывает разделы по адресам.
 */
import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';

import { restoreSession, consumeAuthRedirect, selectIsAuthenticated } from './store/slices/authSlice';
import { loadSwitches } from './store/slices/switchesSlice';
import { loadDivisions } from './store/slices/divisionsSlice';
import { loadCollab } from './store/slices/collabSlice';
import { selectTheme } from './store/slices/uiSlice';
import { connectLiveUpdates, disconnectLiveUpdates } from './api/liveUpdates';

import AppLayout from './components/Layout/AppLayout';
import LoginScreen from './components/Login/LoginScreen';
import DuplicatesPage from './features/duplicates/DuplicatesPage';
import DivisionsPage from './features/divisions/DivisionsPage';
import DashboardPage from './features/dashboard/DashboardPage';
import ObjectsPage from './features/objects/ObjectsPage';
import EquipmentPage from './features/equipment/EquipmentPage';
import RacksPage from './features/racks/RacksPage';

export default function App() {
  const dispatch = useDispatch();
  const status = useSelector((state) => state.auth.status);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const theme = useSelector(selectTheme);
  const username = useSelector((state) => state.auth.user?.username);

  /* Тема применяется к корню документа, а не к отдельному элементу:
     от неё зависят значения переменных, которыми пользуется всё
     приложение, включая модальные окна вне основного дерева. */
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  /* Попытка восстановить сессию по сохранённому токену — до того,
     как показывать экран входа: иначе он мигнёт у уже вошедшего. */
  useEffect(() => {
    // Сначала разбирается возврат от поставщика: если в адресе есть
    // токен, он сохраняется и сессия восстанавливается по нему.
    // Иначе — обычная попытка по сохранённому ранее токену.
    const params = new URLSearchParams(window.location.search);
    if (params.has('authToken') || params.has('auth')) {
      dispatch(consumeAuthRedirect());
    } else {
      dispatch(restoreSession());
    }
  }, [dispatch]);

  /* Данные грузятся один раз после входа: они нужны почти всем
     разделам, и запрашивать их при каждом переходе было бы лишним. */
  useEffect(() => {
    if (!isAuthenticated) return;
    dispatch(loadSwitches());
    dispatch(loadDivisions());
    dispatch(loadCollab());
  }, [isAuthenticated, dispatch]);

  /* Поток изменений от других пользователей. Подключается после входа
     и закрывается при выходе — иначе соединение осталось бы висеть. */
  useEffect(() => {
    if (!isAuthenticated || !username) return undefined;
    connectLiveUpdates(dispatch, username);
    return disconnectLiveUpdates;
  }, [isAuthenticated, username, dispatch]);

  if (status === 'loading') {
    return <div style={{ padding: 40, color: 'var(--text2)' }}>Загрузка…</div>;
  }

  if (!isAuthenticated) return <LoginScreen />;

  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="objects" element={<ObjectsPage />} />
        <Route path="objects/:mag" element={<ObjectsPage />} />
        <Route path="objects/:mag/:sw" element={<ObjectsPage />} />
        <Route path="dupes" element={<DuplicatesPage />} />
        <Route path="divisions" element={<DivisionsPage />} />
        <Route path="equipment" element={<EquipmentPage />} />
        <Route path="racks" element={<RacksPage />} />
        <Route path="racks/:mag" element={<RacksPage />} />
        <Route path="racks/:mag/:cabinetId" element={<RacksPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

