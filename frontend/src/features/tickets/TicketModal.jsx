/**
 * Окно со сформированным текстом заявки.
 *
 * Текст можно скопировать или отредактировать перед отправкой:
 * иногда нужно добавить обстоятельства, которых система не знает.
 */
import { useState, useEffect } from 'react';
import styles from './TicketModal.module.css';

export default function TicketModal({ ticket, onClose }) {
  const [text, setText] = useState(ticket.text);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* Запасной способ для случаев, когда доступ к буферу закрыт:
         в некоторых браузерах он требует защищённого соединения. */
      const field = document.createElement('textarea');
      field.value = text;
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      document.body.removeChild(field);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <>
      <button className={styles.overlay} onClick={onClose} aria-label="Закрыть" />

      <div className={styles.modal} role="dialog" aria-label="Заявка">
        <div className={styles.header}>
          <div>
            <div className={styles.title}>{ticket.title}</div>
            <div className={styles.subtitle}>
              {ticket.count === 1
                ? 'Заявка по одному коммутатору'
                : `Заявка по ${ticket.count} коммутаторам`}
            </div>
          </div>
          <div className={styles.spacer} />
          <button className={styles.close} onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <div className={styles.body}>
          <textarea
            className={styles.text}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className={styles.footer}>
          <button className={`${styles.button} ${copied ? styles.copied : styles.primary}`} onClick={copy}>
            {copied ? '✓ Скопировано' : 'Скопировать текст'}
          </button>
          <button className={styles.button} onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </>
  );
}
