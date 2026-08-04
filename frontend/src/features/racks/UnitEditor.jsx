/**
 * Правка позиции в шкафу.
 *
 * Обязательно только наименование: комментарий заполнять не нужно.
 * Чтобы освободить юнит, используется кнопка удаления — очистка
 * наименования для этого не годится, иначе нельзя было бы отличить
 * «пока не заполнил» от «здесь пусто».
 */
import { useState, useEffect } from 'react';
import styles from './UnitEditor.module.css';

export default function UnitEditor({ draft, maxUnit, onSave, onDelete, onCancel }) {
  const [unit, setUnit] = useState(draft.unit);
  const [span, setSpan] = useState(draft.span ?? 1);
  const [name, setName] = useState(draft.name ?? '');
  const [comment, setComment] = useState(draft.comment ?? '');
  const [error, setError] = useState(null);

  /* Черновик меняется при выборе другого юнита — поля переносятся,
     чтобы уже введённое не пропадало. */
  useEffect(() => {
    setUnit(draft.unit);
    setSpan(draft.span ?? 1);
    setName(draft.name ?? '');
    setComment(draft.comment ?? '');
    setError(null);
  }, [draft]);

  function handleSave() {
    if (!name.trim()) {
      setError('Укажите наименование. Комментарий заполнять не обязательно. Чтобы освободить юнит — нажмите кнопку удаления.');
      return;
    }

    const unitNumber = Number(unit);
    if (!Number.isInteger(unitNumber) || unitNumber < 1 || unitNumber > maxUnit) {
      setError(`Юнит должен быть числом от 1 до ${maxUnit}.`);
      return;
    }

    onSave({ unit: unitNumber, span: Math.max(1, Number(span) || 1), name: name.trim(), comment: comment.trim() });
  }

  return (
    <div className={styles.editor}>
      <div className={styles.row}>
        <label className={styles.label}>
          Юнит
          <input
            className={styles.number}
            type="number"
            min="1"
            max={maxUnit}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </label>

        <label className={styles.label}>
          Юнитов в высоту
          <input
            className={styles.number}
            type="number"
            min="1"
            value={span}
            onChange={(e) => setSpan(e.target.value)}
          />
        </label>
      </div>

      <div className={styles.row}>
        <input
          className={styles.text}
          placeholder="Наименование"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>

      <div className={styles.row}>
        <input
          className={styles.text}
          placeholder="Комментарий (необязательно)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>

      <div className={styles.buttons}>
        <button className={`${styles.button} ${styles.save}`} onClick={handleSave} title="Сохранить">
          ✓
        </button>
        <button
          className={`${styles.button} ${styles.delete}`}
          onClick={() => onDelete({ unit: Number(unit), span: Math.max(1, Number(span) || 1) })}
          title="Освободить юнит"
        >
          🗑
        </button>
        <button className={`${styles.button} ${styles.cancel}`} onClick={onCancel} title="Отмена">
          ✕
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
