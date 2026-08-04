/**
 * Код для сканирования телефоном.
 *
 * Библиотека qrcode рисует на элементе canvas, поэтому компонент
 * обращается к нему напрямую через ссылку — это тот случай, когда
 * прямое обращение к элементу оправдано.
 */
import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export default function QrCode({ value, size = 160 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
    }).catch(() => {
      /* Не удалось нарисовать — рядом есть кнопка перехода,
         поэтому вход остаётся возможен и без кода. */
    });
  }, [value, size]);

  return <canvas ref={canvasRef} width={size} height={size} />;
}
