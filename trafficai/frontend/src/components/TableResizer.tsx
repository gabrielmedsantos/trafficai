'use client';

import { useEffect } from 'react';

/**
 * Largura ajustável em todas as tabelas do sistema, sem mexer em cada página:
 * observa o DOM, põe uma alça na borda direita de cada título de coluna e
 * aplica a largura no título e nas células daquela coluna. A largura fica
 * salva no navegador por página + nome da coluna; duplo clique volta ao padrão.
 *
 * Fica de fora: tabelas com data-no-resize, colunas sem título (checkbox),
 * colunas presas (tai-sticky) e as que já têm alça própria (nome no ReportTable).
 */
const PREFIX = 'tai_colw:';
const MIN = 48;
const MAX = 900;

const keyOf = (th: HTMLTableCellElement) => `${PREFIX}${location.pathname}|${(th.textContent || '').trim()}`;

function readW(key: string): number | null {
    try {
        const v = Number(localStorage.getItem(key));
        return v >= MIN && v <= MAX ? v : null;
    } catch { return null; }
}

function headRow(table: HTMLTableElement): HTMLTableRowElement | null {
    const rows = table.tHead?.rows;
    return rows && rows.length ? rows[rows.length - 1] : null;
}

function setCell(cell: HTMLTableCellElement, w: number | null, clip: boolean) {
    const px = w == null ? '' : `${w}px`;
    cell.style.width = px;
    cell.style.minWidth = px;
    cell.style.maxWidth = px;
    if (clip) {
        cell.style.overflow = w == null ? '' : 'hidden';
        cell.style.textOverflow = w == null ? '' : 'ellipsis';
    }
}

function applyColumn(table: HTMLTableElement, th: HTMLTableCellElement, w: number | null) {
    const head = headRow(table);
    if (!head) return;
    const idx = th.cellIndex;
    const n = head.cells.length;
    setCell(th, w, false);
    for (const section of [...Array.from(table.tBodies), table.tFoot]) {
        if (!section) continue;
        for (const row of Array.from(section.rows)) {
            // Linhas com colspan (carregando, vazio, agrupador) não seguem as colunas.
            if (row.cells.length !== n) continue;
            const cell = row.cells[idx];
            if (cell) setCell(cell, w, true);
        }
    }
}

let resizing = false;

function attach(table: HTMLTableElement, th: HTMLTableCellElement) {
    const grip = document.createElement('span');
    grip.className = 'tai-resize';
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-orientation', 'vertical');
    grip.setAttribute('aria-label', 'Ajustar largura da coluna');
    grip.title = 'Arraste pra ajustar a largura · duplo clique volta ao padrão';
    grip.draggable = false;
    Object.assign(grip.style, { position: 'absolute', top: '0', right: '-4px', bottom: '0', width: '9px', cursor: 'col-resize', zIndex: '3' });
    if (getComputedStyle(th).position === 'static') th.style.position = 'relative';
    th.dataset.taiResizable = '1';

    grip.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        resizing = true;
        const x0 = e.clientX;
        const w0 = th.getBoundingClientRect().width;
        let w = w0;
        const move = (ev: MouseEvent) => {
            w = Math.round(Math.min(MAX, Math.max(MIN, w0 + ev.clientX - x0)));
            applyColumn(table, th, w);
        };
        const up = () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
            document.body.style.cursor = '';
            try { localStorage.setItem(keyOf(th), String(w)); } catch { /* sem storage */ }
            setTimeout(() => { resizing = false; }, 0);
        };
        document.body.style.cursor = 'col-resize';
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
    });
    // Não deixa o clique da alça ordenar a coluna nem o duplo clique selecionar texto.
    grip.addEventListener('click', (e) => e.stopPropagation());
    grip.addEventListener('dblclick', (e) => {
        e.preventDefault(); e.stopPropagation();
        try { localStorage.removeItem(keyOf(th)); } catch { /* sem storage */ }
        applyColumn(table, th, null);
    });
    th.appendChild(grip);
}

function scan() {
    for (const table of Array.from(document.querySelectorAll('table'))) {
        if (table.closest('[data-no-resize]')) continue;
        const head = headRow(table);
        if (!head) continue;
        for (const th of Array.from(head.cells)) {
            if (th.classList.contains('tai-sticky') || th.querySelector('.tai-resize:not([data-tai-auto])')) continue;
            if (!(th.textContent || '').trim()) continue;
            if (!th.dataset.taiResizable) {
                attach(table, th);
                th.lastElementChild?.setAttribute('data-tai-auto', '1');
            }
            // Reaplica em toda passada: linhas novas (filtro, paginação, recarga) chegam sem largura.
            const w = readW(keyOf(th));
            if (w != null) applyColumn(table, th, w);
        }
    }
}

export default function TableResizer() {
    useEffect(() => {
        let raf = 0;
        const schedule = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => { raf = 0; scan(); });
        };
        // Coluna arrastável (reordenar) não pode começar a arrastar enquanto ajusta a largura.
        const blockDrag = (e: DragEvent) => { if (resizing) e.preventDefault(); };
        document.addEventListener('dragstart', blockDrag, true);
        const obs = new MutationObserver(schedule);
        obs.observe(document.body, { childList: true, subtree: true });
        schedule();
        return () => {
            obs.disconnect();
            if (raf) cancelAnimationFrame(raf);
            document.removeEventListener('dragstart', blockDrag, true);
        };
    }, []);
    return null;
}
