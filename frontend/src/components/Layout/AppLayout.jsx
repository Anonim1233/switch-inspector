/**
 * Оболочка приложения: панель сверху, содержимое раздела снизу.
 *
 * Разделы подставляются маршрутизатором, поэтому оболочка о них
 * ничего не знает и не требует правки при добавлении нового.
 */
import { Outlet } from 'react-router-dom';
import { useState } from 'react';

import NavBar from './NavBar';
import CabinetModal from '../../features/cabinet/CabinetModal';
import styles from './AppLayout.module.css';

export default function AppLayout() {
  const [cabinetOpen, setCabinetOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <NavBar onOpenCabinet={() => setCabinetOpen(true)} />
      <main className={styles.content}>
        <Outlet />
      </main>
      {cabinetOpen && <CabinetModal onClose={() => setCabinetOpen(false)} />}
    </div>
  );
}
