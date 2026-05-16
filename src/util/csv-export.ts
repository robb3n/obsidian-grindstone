import type { CardData, ReviewLog } from '../card/types';

const UTF8_BOM = '﻿';

function escapeField(value: string | number | boolean | undefined | null): string {
  if (value === undefined || value === null) return '';
  const s = String(value);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function serializeRows(headers: string[], rows: Array<Array<string | number | boolean | undefined | null>>): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeField).join(','));
  for (const row of rows) {
    lines.push(row.map(escapeField).join(','));
  }
  return UTF8_BOM + lines.join('\r\n');
}

export function buildCardsCsv(cards: Record<string, CardData>): string {
  const headers = [
    'id', 'file', 'blockTitle', 'tags', 'ease', 'interval',
    'due', 'reviewCount', 'createdAt', 'lastReviewed', 'disabled',
  ];
  const rows: Array<Array<string | number | boolean>> = [];
  for (const [id, c] of Object.entries(cards)) {
    rows.push([
      id,
      c.file,
      c.blockTitle,
      c.tags.join(';'),
      c.ease,
      c.interval,
      c.due,
      c.reviewCount,
      c.createdAt,
      c.lastReviewed,
      c.disabled === true,
    ]);
  }
  return serializeRows(headers, rows);
}

export function buildReviewLogsCsv(logs: ReviewLog[]): string {
  const headers = ['cardId', 'rating', 'timestamp', 'elapsed'];
  const rows: Array<Array<string | number>> = logs.map((l) => [
    l.cardId, l.rating, l.timestamp, l.elapsed,
  ]);
  return serializeRows(headers, rows);
}

export function triggerDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
