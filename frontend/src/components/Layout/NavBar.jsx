/**
 * Верхняя панель: переключение разделов, поиск, профиль.
 */
import { NavLink } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';

import { selectUser } from '../../store/slices/authSlice';
import { toggleMobileSidebar } from '../../store/slices/uiSlice';
import styles from './NavBar.module.css';

/** Разделы приложения. Порядок совпадает с прежней версией. */
const SECTIONS = [
  { to: '/dashboard', label: 'Дашборд',      icon: '▦' },
  { to: '/objects',   label: 'Объекты',      icon: '▤' },
  { to: '/dupes',     label: 'Дубли SN',     icon: '⧉' },
  { to: '/divisions', label: 'Дивизионы',    icon: '◫' },
  { to: '/equipment', label: 'Оборудование', icon: '▢' },
  { to: '/racks',     label: 'Шкафы',        icon: '▥' },
];

const ROLE_LABELS = {
  developer: 'Разработчик',
  admin: 'Редактор',
  viewer: 'Просмотр',
};

export default function NavBar({ onOpenCabinet }) {
  const user = useSelector(selectUser);
  const dispatch = useDispatch();

  return (
    <nav className={styles.nav}>
      <button
        className={styles.burger}
        onClick={() => dispatch(toggleMobileSidebar())}
        aria-label="Открыть список объектов"
      >
        ☰
      </button>

      <div className={styles.tabs}>
        {SECTIONS.map((section) => (
          <NavLink
            key={section.to}
            to={section.to}
            className={({ isActive }) =>
              isActive ? `${styles.tab} ${styles.tabActive}` : styles.tab
            }
          >
            <span aria-hidden="true">{section.icon}</span>
            <span className={styles.tabLabel}>{section.label}</span>
          </NavLink>
        ))}
      </div>

      <div className={styles.spacer} />

      {user && (
        <button className={styles.userChip} onClick={onOpenCabinet}>
          <span className={styles.userName}>{user.displayName || user.username}</span>
          {user.role && <span className={styles.roleBadge}>{ROLE_LABELS[user.role]}</span>}
        </button>
      )}
    </nav>
  );
}
