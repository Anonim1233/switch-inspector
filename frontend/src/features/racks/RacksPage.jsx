/**
 * Раздел «Шкафы»: наполнение коммуникационных шкафов объекта.
 *
 * Три состояния: объект не выбран, список шкафов объекта, содержимое
 * одного шкафа. Текущее место отражается в адресе страницы.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';

import { selectGrouped, selectPrefixMap } from '../../store/slices/switchesSlice';
import {
  loadCabinets, loadCabinetItems, loadUndocumented, saveCabinetItems,
  selectCabinets, selectCabinetItems, selectUndocumented,
} from '../../store/slices/cabinetsSlice';
import { selectCanEditObject } from '../../store/slices/authSlice';
import { toggleMobileSidebar } from '../../store/slices/uiSlice';
import { getRackHeight, firstFreeUnit, normalizeSwitchName } from '../../domain/racks';
import { objectLabel } from '../../domain/issues';
import ObjectSidebar from '../../components/common/ObjectSidebar';
import RackDiagram from './RackDiagram';
import RackSummary from './RackSummary';
import UnitEditor from './UnitEditor';
import { useCabinetImport } from './useCabinetImport';
import { printQrLabel, printAllCabinetLabels } from '../print/printing';
import styles from './RacksPage.module.css';

export default function RacksPage() {
  const { mag, cabinetId } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const grouped = useSelector(selectGrouped);
  const prefixMap = useSelector(selectPrefixMap);
  const cabinets = useSelector((state) => selectCabinets(state, mag));
  const undocumented = useSelector((state) => selectUndocumented(state, mag));

  useEffect(() => {
    if (!mag) return;
    dispatch(loadCabinets(mag));
    dispatch(loadUndocumented(mag));
  }, [mag, dispatch]);

  if (!mag || !grouped[mag]) {
    return (
      <ObjectSidebar selectedMag={mag} onSelect={(next) => navigate(`/racks/${next}`)}>
        <div className={styles.empty}>
          Выберите объект слева, чтобы увидеть его шкафы
        </div>
      </ObjectSidebar>
    );
  }

  return (
    <ObjectSidebar selectedMag={mag} onSelect={(next) => navigate(`/racks/${next}`)}>
      <div className={styles.panel}>
        {cabinetId ? (
          <CabinetView
            mag={mag}
            cabinetId={Number(cabinetId)}
            cabinets={cabinets}
            prefixMap={prefixMap}
            onBack={() => navigate(`/racks/${mag}`)}
            onOpenSwitch={(sw) => navigate(`/objects/${mag}/${sw}`)}
          />
        ) : (
          <CabinetList
            mag={mag}
            cabinets={cabinets}
            prefixMap={prefixMap}
            undocumented={undocumented}
            onOpen={(id) => navigate(`/racks/${mag}/${id}`)}
            onToggleSidebar={() => dispatch(toggleMobileSidebar())}
          />
        )}
      </div>
    </ObjectSidebar>
  );
}

/* ── Список шкафов объекта ──────────────────────────────────────────── */

function CabinetList({ mag, cabinets, prefixMap, undocumented, onOpen, onToggleSidebar }) {
  const canEdit = useSelector((state) => selectCanEditObject(state, mag));
  const { state: importState, importFile } = useCabinetImport(mag, prefixMap);
  const fileRef = useRef(null);

  const busy = importState.status === 'parsing' || importState.status === 'uploading';

  return (
    <>
      <div className={styles.toolbar}>
        <button className={styles.button} onClick={onToggleSidebar} aria-label="Список объектов">
          ☰
        </button>
        <span className={styles.title}>Шкафы объекта {objectLabel(mag, prefixMap)}</span>
        <div className={styles.spacer} />
        {canEdit && (
          <>
            <button
              className={styles.button}
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              {busy ? 'Загружаю…' : 'Загрузить из файла'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importFile(file);
                e.target.value = '';
              }}
            />
          </>
        )}
        {cabinets.length > 0 && (
          <button
            className={styles.button}
            onClick={() => printAllCabinetLabels(
              objectLabel(mag, prefixMap),
              cabinets,
              (cabinet) => `${window.location.origin}/racks/${mag}/${cabinet.id}`
            )}
          >
            Наклейки на все шкафы
          </button>
        )}
        <a className={styles.button} href="/Rack-info.xlsx" download>
          Скачать шаблон
        </a>
      </div>

      <div className={styles.body}>
        {importState.message && (
          <div
            className={styles.warning}
            style={importState.status === 'error'
              ? undefined
              : { color: 'var(--ok)', background: 'var(--ok-bg)' }}
          >
            {importState.message}
          </div>
        )}

        {/* Коммутаторы, не занесённые ни в один шкаф. Это не ошибка
            системы, а признак незаполненных данных — но заметить её
            иначе почти невозможно. */}
        {undocumented?.undocumented?.length > 0 && (
          <div className={styles.warning}>
            {undocumented.undocumented.length} из {undocumented.total} коммутаторов
            объекта не размещены ни в одном шкафу:{' '}
            {undocumented.undocumented.join(', ')}
          </div>
        )}

        {cabinets.length === 0 ? (
          <div className={styles.empty}>
            У этого объекта пока нет шкафов.<br />
            Скачайте шаблон, заполните его и загрузите — или создайте шкаф вручную.
          </div>
        ) : (
          <div className={styles.cards}>
            {cabinets.map((cabinet) => (
              <button className={styles.card} key={cabinet.id} onClick={() => onOpen(cabinet.id)}>
                <div className={styles.cardName}>{cabinet.name}</div>
                <div className={styles.cardMeta}>
                  {cabinet.characteristic && <div>{cabinet.characteristic}</div>}
                  {cabinet.location && <div>{cabinet.location}</div>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ── Содержимое одного шкафа ────────────────────────────────────────── */

function CabinetView({ mag, cabinetId, cabinets, prefixMap, onBack, onOpenSwitch }) {
  const dispatch = useDispatch();
  const items = useSelector((state) => selectCabinetItems(state, cabinetId));
  const canEdit = useSelector((state) => selectCanEditObject(state, mag));

  const [mode, setMode] = useState('visual');
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const cabinet = cabinets.find((c) => c.id === cabinetId);

  useEffect(() => {
    dispatch(loadCabinetItems(cabinetId));
  }, [cabinetId, dispatch]);

  const height = useMemo(
    () => getRackHeight(cabinet?.characteristic, items),
    [cabinet, items]
  );

  if (!cabinet) {
    return <div className={styles.empty}>Загрузка…</div>;
  }

  /* Сохранение заменяет содержимое шкафа целиком — так же, как
     заполняется монтажный чертёж. Поэтому список собирается заново
     при каждом изменении и отправляется одним запросом. */
  async function persist(nextItems) {
    setSaving(true);
    try {
      await dispatch(saveCabinetItems({ cabinetId, items: nextItems })).unwrap();
      setDraft(null);
      /* Список неразмещённых мог измениться — перечитываем. */
      dispatch(loadUndocumented(mag));
    } catch (message) {
      alert(`Не удалось сохранить: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  function handleSelectUnit(unit) {
    if (!canEdit) return;
    const existing = items.find((item) => Number(item.unit) === unit);
    setDraft({
      unit,
      span: 1,
      name: existing?.name ?? '',
      comment: existing?.comment ?? '',
    });
  }

  function handleSaveDraft(values) {
    /* Короткое обозначение из шаблона приводится к полному виду:
       «SW_74» в объекте 253 становится «DS253_74». */
    const name = normalizeSwitchName(values.name, mag, prefixMap);

    /* Юниты, которые займёт оборудование: от указанного вниз. */
    const occupied = [];
    for (let u = values.unit; u > values.unit - values.span; u--) occupied.push(u);

    const next = items
      .filter((item) => !occupied.includes(Number(item.unit)))
      .map((item) => ({ unit: item.unit, name: item.name, comment: item.comment ?? '' }));

    for (const unit of occupied) {
      next.push({ unit, name, comment: values.comment });
    }

    persist(next);
  }

  function handleDeleteDraft({ unit, span }) {
    const freed = [];
    for (let u = unit; u > unit - span; u--) freed.push(u);

    const next = items
      .filter((item) => !freed.includes(Number(item.unit)))
      .map((item) => ({ unit: item.unit, name: item.name, comment: item.comment ?? '' }));

    persist(next);
  }

  function handleAdd() {
    const unit = firstFreeUnit(height, items);
    if (unit === null) {
      alert('В шкафу нет свободных юнитов.');
      return;
    }
    setDraft({ unit, span: 1, name: '', comment: '' });
  }

  return (
    <>
      <div className={styles.toolbar}>
        <button className={styles.button} onClick={onBack}>← К списку шкафов</button>
        <span className={styles.title}>{cabinet.name}</span>
        <div className={styles.spacer} />
        {canEdit && (
          <button className={styles.button} onClick={handleAdd} disabled={saving}>
            + Добавить оборудование
          </button>
        )}
        <button
          className={styles.button}
          onClick={() => printQrLabel({
            title: cabinet.name,
            subtitle: objectLabel(mag, prefixMap),
            url: `${window.location.origin}/racks/${mag}/${cabinetId}`,
            hint: 'Switch Inspector — отсканируйте, чтобы открыть содержимое шкафа',
          })}
        >
          Наклейка
        </button>
        <button
          className={`${styles.button} ${mode === 'visual' ? styles.buttonActive : ''}`}
          onClick={() => setMode('visual')}
        >
          Схема
        </button>
        <button
          className={`${styles.button} ${mode === 'table' ? styles.buttonActive : ''}`}
          onClick={() => setMode('table')}
        >
          Таблица
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.layout}>
          <div className={styles.layoutLeft}>
            <RackSummary height={height} items={items} />
          </div>
          <div className={styles.layoutRight}>
            {draft && (
              <UnitEditor
                draft={draft}
                maxUnit={height}
                onSave={handleSaveDraft}
                onDelete={handleDeleteDraft}
                onCancel={() => setDraft(null)}
              />
            )}

            {mode === 'visual' ? (
              <RackDiagram
                height={height}
                items={items}
                onSelectUnit={handleSelectUnit}
                onOpenSwitch={onOpenSwitch}
              />
            ) : (
              <ItemTable items={items} onOpenSwitch={onOpenSwitch} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** Табличный режим: то же содержимое построчно — удобнее для правки
 *  и просмотра комментариев, которые на схеме не помещаются. */
function ItemTable({ items, onOpenSwitch }) {
  const sorted = [...items].sort((a, b) => Number(b.unit) - Number(a.unit));

  if (!sorted.length) {
    return <div className={styles.empty}>Шкаф пуст.</div>;
  }

  return (
    <div className={styles.cards} style={{ gridTemplateColumns: '1fr' }}>
      {sorted.map((item) => (
        <div className={styles.card} key={item.unit} style={{ cursor: 'default' }}>
          <div className={styles.cardName}>
            {item.unit}U — {item.name}
            {item.switchExists && (
              <button
                className={styles.button}
                style={{ marginLeft: 8 }}
                onClick={() => onOpenSwitch(item.matchedSw)}
              >
                Карточка
              </button>
            )}
          </div>
          {item.comment && <div className={styles.cardMeta}>{item.comment}</div>}
          {item.shkafMismatch && (
            <div className={styles.cardMeta} style={{ color: 'var(--err)' }}>
              По учёту числится в шкафу {item.actualShkaf}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
