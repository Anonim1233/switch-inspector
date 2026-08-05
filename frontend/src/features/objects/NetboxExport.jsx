/**
 * Отправка серийных номеров в NetBox по одному объекту.
 *
 * Сначала показывается, что именно будет изменено, и только после
 * подтверждения выполняется отправка. Перезапись существующих значений
 * выделяется отдельно: она затрагивает данные, которые вносило другое
 * подразделение.
 */
import { useState } from 'react';
import { api } from '../../api/client';
import styles from './NetboxExport.module.css';

export default function NetboxExport({ mag, objectLabel, onClose }) {
  // Две отправки разделены намеренно: серийные номера и размещение —
  // разные по смыслу изменения, и подтверждать их следует отдельно.
  const [tab, setTab] = useState('serials');
  const [includeMoves, setIncludeMoves] = useState(false);
  const [plan, setPlan] = useState(null);
  const [state, setState] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const isRacks = tab === 'racks';

  function switchTab(next) {
    setTab(next);
    setPlan(null);
    setResult(null);
    setError(null);
    setState('idle');
  }

  async function loadPlan() {
    setState('loading');
    setError(null);
    try {
      const path = isRacks ? '/api/netbox/racks/preview' : '/api/netbox/preview';
      setPlan(await api.get(`${path}?mag=${encodeURIComponent(mag)}`));
      setState('ready');
    } catch (e) {
      setError(e.message);
      setState('idle');
    }
  }

  async function sendRacks() {
    const parts = [
      `Отправить размещение в NetBox?`,
      '',
      `Стоек будет создано: ${plan.summary.будетСоздано}`,
      `Устройств будет размещено: ${plan.placements.length}`,
    ];
    if (includeMoves && plan.moves.length) {
      parts.push('', `ПЕРЕМЕЩЕНИЙ между стойками: ${plan.moves.length}`,
        'Устройства будут перенесены в другие стойки.');
    }
    parts.push('', `Объект: ${objectLabel}`);

    if (!window.confirm(parts.join('\n'))) return;

    setState('sending');
    try {
      setResult(await api.post('/api/netbox/racks/export', { mag, includeMoves }));
      setState('done');
    } catch (e) {
      setError(e.message);
      setState('ready');
    }
  }

  async function send() {
    const overwrites = plan.toSend.filter((x) => x.overwrites).length;
    const parts = [
      `Отправить ${plan.toSend.length} серийных номеров в NetBox?`,
      '',
    ];
    if (overwrites) {
      parts.push(
        `Из них ${overwrites} ПЕРЕЗАПИШУТ значения, внесённые в NetBox ранее.`,
        'Прежние значения будут потеряны.',
        ''
      );
    }
    parts.push(`Объект: ${objectLabel}`);

    if (!window.confirm(parts.join('\n'))) return;

    setState('sending');
    try {
      setResult(await api.post('/api/netbox/export', { mag }));
      setState('done');
    } catch (e) {
      setError(e.message);
      setState('ready');
    }
  }

  return (
    <>
      <button className={styles.overlay} onClick={onClose} aria-label="Закрыть" />

      <div className={styles.modal} role="dialog" aria-label="Отправка в NetBox">
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Отправка в NetBox</div>
            <div className={styles.subtitle}>{objectLabel}</div>
          </div>
          <div className={styles.spacer} />
          <button className={styles.close} onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${!isRacks ? styles.tabActive : ''}`}
            onClick={() => switchTab('serials')}
          >
            Серийные номера
          </button>
          <button
            className={`${styles.tab} ${isRacks ? styles.tabActive : ''}`}
            onClick={() => switchTab('racks')}
          >
            Стойки и размещение
          </button>
        </div>

        <div className={styles.body}>
          {state === 'idle' && !error && (
            <div className={styles.intro}>
              {isRacks
                ? 'В NetBox будут созданы стойки и записано размещение коммутаторов. ' +
                  'Пассивное оборудование не отправляется: в NetBox стойка содержит ' +
                  'устройства с моделью и производителем, а у нас позиции записаны текстом.'
                : 'В NetBox будут записаны серийные номера из Лиры. ' +
                  'Сначала посмотрите, что именно изменится.'}
            </div>
          )}

          {error && <div className={styles.error}>{error}</div>}

          {state === 'loading' && <div className={styles.intro}>Запрашиваю данные из NetBox…</div>}

          {plan && state !== 'done' && (
            <>
              <div className={styles.stats}>
                {Object.entries(plan.summary).map(([key, value]) => (
                  <div className={styles.stat} key={key}>
                    <span className={styles.statValue}>{value}</span>
                    <span className={styles.statLabel}>{humanize(key)}</span>
                  </div>
                ))}
              </div>

              {plan.toSend.length > 0 && (
                <>
                  <div className={styles.sectionTitle}>Будет отправлено</div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Коммутатор</th>
                          <th>Было в NetBox</th>
                          <th>Станет</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.toSend.map((item) => (
                          <tr key={item.sw} className={item.overwrites ? styles.rowOverwrite : ''}>
                            <td className={styles.mono}>{item.sw}</td>
                            <td className={styles.mono}>
                              {item.oldSerial ?? <span className={styles.muted}>пусто</span>}
                            </td>
                            <td className={styles.mono}>{item.newSerial}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {plan.toSend.some((x) => x.overwrites) && (
                    <div className={styles.warning}>
                      Выделенные строки перезапишут значения, внесённые в NetBox
                      ранее. Прежние значения будут потеряны.
                    </div>
                  )}
                </>
              )}

              {!isRacks && plan.toSend?.length === 0 && (
                <div className={styles.ok}>Расхождений нет — отправлять нечего.</div>
              )}

              {isRacks && plan.siteProblem && (
                <div className={styles.error}>{plan.siteProblem}</div>
              )}

              {isRacks && plan.racks?.length > 0 && (
                <>
                  <div className={styles.sectionTitle}>Стойки</div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr><th>Наименование</th><th>Высота</th><th>Состояние</th></tr>
                      </thead>
                      <tbody>
                        {plan.racks.map((rack) => (
                          <tr key={rack.name}>
                            <td>{rack.name}</td>
                            <td>{rack.height ? `${rack.height}U` : <span className={styles.muted}>не указана</span>}</td>
                            <td>{rack.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {isRacks && plan.placements?.length > 0 && (
                <>
                  <div className={styles.sectionTitle}>Размещение коммутаторов</div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr><th>Коммутатор</th><th>Стойка</th><th>Юнит</th><th>Было</th></tr>
                      </thead>
                      <tbody>
                        {plan.placements.map((item) => (
                          <tr key={item.sw}>
                            <td className={styles.mono}>{item.sw}</td>
                            <td>{item.rack}</td>
                            <td>{item.position}</td>
                            <td>
                              {item.currentPosition != null
                                ? `юнит ${item.currentPosition}`
                                : <span className={styles.muted}>не размещён</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {isRacks && plan.moves?.length > 0 && (
                <>
                  <div className={styles.sectionTitle}>Перемещения между стойками</div>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr><th>Коммутатор</th><th>Из стойки</th><th>В стойку</th><th>Юнит</th></tr>
                      </thead>
                      <tbody>
                        {plan.moves.map((item) => (
                          <tr key={item.sw} className={styles.rowOverwrite}>
                            <td className={styles.mono}>{item.sw}</td>
                            <td>{item.currentRack}</td>
                            <td>{item.rack}</td>
                            <td>{item.position}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Перенос устройства в другую стойку — существенное
                      изменение, поэтому включается отдельной отметкой,
                      а не отправляется заодно с остальным. */}
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={includeMoves}
                      onChange={(e) => setIncludeMoves(e.target.checked)}
                    />
                    Отправить и перемещения между стойками ({plan.moves.length})
                  </label>
                </>
              )}

              {isRacks && plan.skipped?.length > 0 && (
                <div className={styles.note}>
                  Не отправляется: {plan.skipped.length} позиций —
                  пассивное оборудование и устройства, которых нет в NetBox.
                </div>
              )}
            </>
          )}

          {state === 'done' && result && isRacks && (
            <div className={styles.ok}>
              Создано стоек: {result.racksCreated}, размещено устройств: {result.placed}
              {result.failed > 0 && `. Не удалось: ${result.failed}`}
              {result.errors?.length > 0 && (
                <ul className={styles.errorList}>
                  {result.errors.map((e, i) => (
                    <li key={i}>{e.объект}: {e.ошибка}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {state === 'done' && result && !isRacks && (
            <div className={styles.ok}>
              Отправлено: {result.sent}
              {result.overwritten > 0 && `, из них перезаписано: ${result.overwritten}`}
              {result.failed > 0 && `. Не удалось: ${result.failed}`}
              {result.errors?.length > 0 && (
                <ul className={styles.errorList}>
                  {result.errors.map((e) => (
                    <li key={e.sw}>{e.sw}: {e.error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          {state === 'idle' && (
            <button className={`${styles.button} ${styles.primary}`} onClick={loadPlan}>
              Показать, что изменится
            </button>
          )}
          {state === 'ready' && !isRacks && plan?.toSend?.length > 0 && (
            <button className={`${styles.button} ${styles.primary}`} onClick={send}>
              Отправить серийные номера
            </button>
          )}
          {state === 'ready' && isRacks && !plan?.siteProblem &&
            (plan?.racks?.length > 0 || plan?.placements?.length > 0) && (
            <button className={`${styles.button} ${styles.primary}`} onClick={sendRacks}>
              Отправить размещение
            </button>
          )}
          {state === 'sending' && <span className={styles.subtitle}>Отправляю…</span>}
          <div className={styles.spacer} />
          <button className={styles.button} onClick={onClose}>
            {state === 'done' ? 'Закрыть' : 'Отмена'}
          </button>
        </div>
      </div>
    </>
  );
}

/** Ключи сводки приходят с сервера слитно — разделяем для показа. */
function humanize(key) {
  const words = key.replace(/([А-ЯA-Z])/g, ' $1').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
