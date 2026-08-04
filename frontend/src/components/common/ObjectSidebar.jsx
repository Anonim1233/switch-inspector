/**
 * Боковая панель со списком объектов.
 *
 * Используется в разделах «Объекты» и «Шкафы»: список один и тот же,
 * различается только то, что происходит при выборе.
 */
import { useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';

import { selectGrouped, selectPrefixMap } from '../../store/slices/switchesSlice';
import { closeMobileSidebar } from '../../store/slices/uiSlice';
import { objectLabel } from '../../domain/issues';
import styles from './ObjectSidebar.module.css';

export default function ObjectSidebar({ selectedMag, onSelect, children }) {
  const dispatch = useDispatch();
  const grouped = useSelector(selectGrouped);
  const prefixMap = useSelector(selectPrefixMap);
  const isOpen = useSelector((state) => state.ui.mobileSidebarOpen);

  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const search = query.trim().toLowerCase();
    return Object.keys(grouped)
      .sort()
      .map((mag) => {
        const rows = grouped[mag];
        const issues = rows.filter((r) => r._issues > 0).length;
        return { mag, label: objectLabel(mag, prefixMap), total: rows.length, issues };
      })
      .filter((item) => !search || item.label.toLowerCase().includes(search) || item.mag.includes(search));
  }, [grouped, prefixMap, query]);

  function handleSelect(mag) {
    onSelect(mag);
    dispatch(closeMobileSidebar());
  }

  return (
    <div className={styles.content}>
      <button
        className={`${styles.overlay} ${isOpen ? styles.overlayVisible : ''}`}
        onClick={() => dispatch(closeMobileSidebar())}
        aria-label="Закрыть список объектов"
        tabIndex={isOpen ? 0 : -1}
      />

      <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.search}>
          <input
            className={styles.searchInput}
            placeholder="Поиск объекта…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className={styles.list}>
          {items.map((item) => (
            <button
              key={item.mag}
              className={`${styles.item} ${selectedMag === item.mag ? styles.itemActive : ''}`}
              onClick={() => handleSelect(item.mag)}
            >
              <span
                className={`${styles.dot} ${item.issues ? styles.dotWarn : styles.dotOk}`}
                title={item.issues ? `Замечаний: ${item.issues}` : 'Без замечаний'}
              />
              <span className={styles.itemName}>{item.label}</span>
              <span className={styles.count}>{item.total}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className={styles.panel}>{children}</div>
    </div>
  );
}
