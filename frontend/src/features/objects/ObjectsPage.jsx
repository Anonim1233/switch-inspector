/**
 * Раздел «Объекты»: список слева, таблица коммутаторов справа,
 * карточка поверх при выборе записи.
 *
 * Выбранный объект и открытая карточка отражаются в адресе страницы:
 * так ссылку можно отправить коллеге, и она откроет то же место.
 */
import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';

import { selectGrouped } from '../../store/slices/switchesSlice';
import ObjectSidebar from '../../components/common/ObjectSidebar';
import SwitchTable from './SwitchTable';
import SwitchCard from './SwitchCard';
import styles from './ObjectsPage.module.css';

export default function ObjectsPage() {
  const { mag, sw } = useParams();
  const navigate = useNavigate();
  const grouped = useSelector(selectGrouped);

  const mags = Object.keys(grouped);

  /* Если объект в адресе не существует — например, ссылка устарела —
     возвращаемся к списку, а не показываем пустой экран. */
  useEffect(() => {
    if (mag && mags.length && !grouped[mag]) navigate('/objects', { replace: true });
  }, [mag, grouped, mags.length, navigate]);

  return (
    <ObjectSidebar selectedMag={mag} onSelect={(next) => navigate(`/objects/${next}`)}>
      {mag && grouped[mag] ? (
        <SwitchTable mag={mag} onOpenCard={(name) => navigate(`/objects/${mag}/${name}`)} />
      ) : (
        <div className={styles.empty}>
          Выберите объект слева, чтобы увидеть его коммутаторы
        </div>
      )}

      {mag && sw && (
        <SwitchCard mag={mag} sw={sw} onClose={() => navigate(`/objects/${mag}`)} />
      )}
    </ObjectSidebar>
  );
}
