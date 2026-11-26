'use client';

import React, { useMemo } from 'react';

/**
 * Globo em SVG (projeção ortográfica centrada no Brasil) com um ponto por
 * estado/país ativo. O pixel guarda cidade e estado do IP, sem coordenadas,
 * então o ponto fica no centro aproximado do estado (ou do país, fora do Brasil).
 */

export interface GlobePoint { country: string | null; state: string | null; city?: string | null; n: number }

const BR_STATES: Record<string, [number, number, string]> = {
    'acre': [-70.5, -9.0, 'AC'], 'alagoas': [-36.6, -9.6, 'AL'], 'amapá': [-51.8, 1.4, 'AP'], 'amazonas': [-64.6, -4.2, 'AM'],
    'bahia': [-41.7, -12.5, 'BA'], 'ceará': [-39.5, -5.2, 'CE'], 'distrito federal': [-47.9, -15.8, 'DF'],
    'espírito santo': [-40.6, -19.6, 'ES'], 'goiás': [-49.6, -15.9, 'GO'], 'maranhão': [-45.3, -5.4, 'MA'],
    'mato grosso': [-55.9, -12.7, 'MT'], 'mato grosso do sul': [-54.5, -20.6, 'MS'], 'minas gerais': [-44.6, -18.5, 'MG'],
    'pará': [-52.3, -3.8, 'PA'], 'paraíba': [-36.8, -7.1, 'PB'], 'paraná': [-51.6, -24.6, 'PR'], 'pernambuco': [-37.9, -8.4, 'PE'],
    'piauí': [-42.7, -7.4, 'PI'], 'rio de janeiro': [-42.9, -22.3, 'RJ'], 'rio grande do norte': [-36.5, -5.8, 'RN'],
    'rio grande do sul': [-53.2, -29.7, 'RS'], 'rondônia': [-62.8, -10.9, 'RO'], 'roraima': [-61.4, 2.1, 'RR'],
    'santa catarina': [-50.5, -27.2, 'SC'], 'são paulo': [-48.6, -22.3, 'SP'], 'sergipe': [-37.4, -10.6, 'SE'], 'tocantins': [-48.3, -10.2, 'TO'],
};
// Também aceita a sigla (alguns geolocalizadores devolvem "SP").
const BR_BY_UF: Record<string, [number, number, string]> = Object.fromEntries(Object.values(BR_STATES).map((v) => [v[2], v]));

const COUNTRIES: Record<string, [number, number, string]> = {
    BR: [-52, -12, 'Brasil'], US: [-98, 39, 'EUA'], CA: [-100, 56, 'Canadá'], MX: [-102, 23, 'México'], AR: [-64, -34, 'Argentina'],
    CL: [-71, -33, 'Chile'], CO: [-74, 4, 'Colômbia'], VE: [-66, 7, 'Venezuela'], PE: [-75, -9, 'Peru'], PY: [-58, -23, 'Paraguai'],
    UY: [-56, -33, 'Uruguai'], BO: [-64, -17, 'Bolívia'], EC: [-78, -1.5, 'Equador'], PT: [-8, 39.5, 'Portugal'], ES: [-4, 40, 'Espanha'],
    FR: [2, 46, 'França'], IT: [12, 42.5, 'Itália'], DE: [10, 51, 'Alemanha'], GB: [-2, 54, 'Reino Unido'], IE: [-8, 53, 'Irlanda'],
    NL: [5.5, 52, 'Holanda'], AO: [17.5, -12.5, 'Angola'], MZ: [35, -18, 'Moçambique'], JP: [138, 37, 'Japão'],
};

export function pointCoords(p: GlobePoint): { lon: number; lat: number; label: string } | null {
    const country = String(p.country || '').toUpperCase();
    if (country === 'BR' || (!country && p.state)) {
        const key = String(p.state || '').trim();
        const st = BR_STATES[key.toLowerCase()] || BR_BY_UF[key.toUpperCase()];
        if (st) return { lon: st[0], lat: st[1], label: st[2] };
    }
    const c = COUNTRIES[country];
    return c ? { lon: c[0], lat: c[1], label: c[2] } : null;
}

// Contornos simplificados (lon, lat) — só pra dar forma ao globo.
const LAND: Array<Array<[number, number]>> = [
    // América do Sul
    [[-77, 8], [-72, 12], [-63, 11], [-60, 8], [-52, 5], [-50, 0], [-44, -2], [-35, -5], [-35, -9], [-39, -15], [-40, -22], [-48, -26], [-53, -33], [-58, -38], [-65, -42], [-68, -50], [-72, -53], [-75, -48], [-73, -38], [-71, -30], [-70, -18], [-76, -14], [-81, -5], [-80, 0], [-77, 8]],
    // América Central e do Norte
    [[-117, 32], [-105, 23], [-97, 16], [-88, 14], [-83, 9], [-77, 8], [-80, 25], [-81, 31], [-76, 35], [-70, 42], [-66, 45], [-60, 47], [-56, 52], [-64, 60], [-78, 62], [-95, 60], [-110, 68], [-140, 70], [-165, 64], [-152, 58], [-135, 57], [-124, 48], [-124, 40], [-117, 32]],
    // África
    [[-17, 15], [-16, 21], [-10, 30], [-6, 35], [10, 37], [20, 32], [32, 31], [35, 25], [43, 12], [51, 11], [40, -3], [40, -15], [35, -24], [27, -34], [19, -35], [12, -18], [13, -6], [9, 4], [-8, 4], [-17, 15]],
    // Península Ibérica e Europa ocidental
    [[-9, 37], [-9, 43], [-2, 43.5], [-4, 48], [2, 51], [8, 54], [12, 54.5], [20, 54], [24, 58], [28, 60], [30, 45], [26, 40], [16, 38], [12, 44], [8, 44], [3, 43], [-1, 37], [-9, 37]],
];

function inside(x: number, y: number, poly: Array<[number, number]>) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
}

const R = 230, CX = 300, CY = 300;
const LON0 = (-52 * Math.PI) / 180, LAT0 = (-12 * Math.PI) / 180;

function project(lonDeg: number, latDeg: number): [number, number] | null {
    const lon = (lonDeg * Math.PI) / 180, lat = (latDeg * Math.PI) / 180;
    const cosc = Math.sin(LAT0) * Math.sin(lat) + Math.cos(LAT0) * Math.cos(lat) * Math.cos(lon - LON0);
    if (cosc < 0) return null;
    return [
        CX + R * Math.cos(lat) * Math.sin(lon - LON0),
        CY - R * (Math.cos(LAT0) * Math.sin(lat) - Math.sin(LAT0) * Math.cos(lat) * Math.cos(lon - LON0)),
    ];
}

export function LiveGlobe({ points, dim }: { points: GlobePoint[]; dim?: boolean }) {
    // Malha e pontilhado de terra não mudam: calcula uma vez.
    const base = useMemo(() => {
        const grid: string[] = [];
        for (let lat = -60; lat <= 60; lat += 20) {
            let d = '', pen = false;
            for (let lon = -180; lon <= 180; lon += 3) {
                const p = project(lon, lat);
                if (p) { d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)} `; pen = true; } else pen = false;
            }
            if (d) grid.push(d);
        }
        for (let lon = -180; lon < 180; lon += 20) {
            let d = '', pen = false;
            for (let lat = -88; lat <= 88; lat += 3) {
                const p = project(lon, lat);
                if (p) { d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)} `; pen = true; } else pen = false;
            }
            if (d) grid.push(d);
        }
        const dots: Array<[number, number, boolean]> = [];
        LAND.forEach((poly, i) => {
            const lons = poly.map((q) => q[0]), lats = poly.map((q) => q[1]);
            for (let lat = Math.max(...lats); lat >= Math.min(...lats); lat -= 1.7) {
                for (let lon = Math.min(...lons); lon <= Math.max(...lons); lon += 1.7) {
                    if (!inside(lon, lat, poly)) continue;
                    const p = project(lon, lat);
                    if (p) dots.push([p[0], p[1], i === 0]);
                }
            }
        });
        return { grid, dots };
    }, []);

    // Agrupa por local (vários municípios do mesmo estado viram um ponto só).
    const marks = useMemo(() => {
        const by = new Map<string, { x: number; y: number; label: string; n: number; cities: Map<string, number> }>();
        for (const p of points) {
            const c = pointCoords(p);
            if (!c) continue;
            const xy = project(c.lon, c.lat);
            if (!xy) continue;
            const m = by.get(c.label) || { x: xy[0], y: xy[1], label: c.label, n: 0, cities: new Map() };
            m.n += p.n;
            if (p.city) m.cities.set(p.city, (m.cities.get(p.city) || 0) + p.n);
            by.set(c.label, m);
        }
        return [...by.values()].sort((a, b) => b.n - a.n);
    }, [points]);

    const maxN = Math.max(1, ...marks.map((m) => m.n));
    // Rótulos dos 5 maiores em colunas fixas de cada lado do globo, ordenados
    // pela altura do ponto e afastados no mínimo 40px (estados vizinhos não se sobrepõem).
    const labeled = useMemo(() => {
        const top = marks.slice(0, 5).map((m) => ({ ...m, right: m.x >= CX - 40, ly: m.y }));
        for (const side of [true, false]) {
            const col = top.filter((m) => m.right === side).sort((a, b) => a.y - b.y);
            col.forEach((m, i) => { if (i > 0) m.ly = Math.max(m.y, col[i - 1].ly + 40); });
            const overflow = col.length ? col[col.length - 1].ly - 560 : 0;
            if (overflow > 0) col.forEach((m) => { m.ly -= overflow; });
        }
        return top;
    }, [marks]);

    return (
        <svg viewBox="0 0 600 600" width="100%" role="img" aria-label={`Mapa de atividade: ${marks.map((m) => `${m.label} ${m.n}`).join(', ') || 'sem atividade'}`} style={{ maxHeight: 560, display: 'block', margin: '0 auto' }}>
            <defs>
                <radialGradient id="lg-sphere" cx="40%" cy="35%" r="70%">
                    <stop offset="0" stopColor="#1b2a3a" /><stop offset=".6" stopColor="#14181e" /><stop offset="1" stopColor="#0b0d10" />
                </radialGradient>
                <radialGradient id="lg-glow" cx="50%" cy="50%" r="50%">
                    <stop offset=".78" stopColor="rgba(14,165,233,0)" /><stop offset=".86" stopColor="rgba(14,165,233,.38)" /><stop offset="1" stopColor="rgba(14,165,233,0)" />
                </radialGradient>
                <clipPath id="lg-clip"><circle cx={CX} cy={CY} r={R} /></clipPath>
            </defs>
            <circle cx={CX} cy={CY} r={290} fill="url(#lg-glow)" />
            <circle cx={CX} cy={CY} r={R} fill="url(#lg-sphere)" stroke="#0284c7" strokeWidth={1.5} />
            <g clipPath="url(#lg-clip)" stroke="rgba(56,189,248,.16)" fill="none">
                {base.grid.map((d, i) => <path key={i} d={d} />)}
            </g>
            <g clipPath="url(#lg-clip)">
                {base.dots.map(([x, y, sa], i) => <circle key={i} cx={x} cy={y} r={sa ? 1.5 : 1.25} fill={sa ? 'rgba(125,211,252,.55)' : 'rgba(125,211,252,.28)'} />)}
            </g>
            <g opacity={dim ? 0.55 : 1}>
                {marks.map((m) => {
                    const r = 4 + 9 * Math.sqrt(m.n / maxN);
                    return (
                        <g key={m.label}>
                            <circle cx={m.x} cy={m.y} r={r * 2.6} fill="rgba(255,107,53,.16)">
                                {!dim && <animate attributeName="r" values={`${r * 1.6};${r * 2.8};${r * 1.6}`} dur="2.4s" repeatCount="indefinite" />}
                            </circle>
                            <circle cx={m.x} cy={m.y} r={r} fill="#ff6b35" stroke="#fff" strokeWidth={1.2} />
                        </g>
                    );
                })}
                {labeled.map((m) => {
                    const right = m.right;
                    const lx = right ? 452 : 148;
                    const ly = m.ly;
                    const top = [...m.cities.entries()].sort((a, b) => b[1] - a[1])[0];
                    return (
                        <g key={`l-${m.label}`} fontFamily="var(--font-sans)">
                            <line x1={m.x} y1={m.y} x2={lx} y2={ly} stroke="rgba(255,255,255,.35)" />
                            <text x={lx + (right ? 6 : -6)} y={ly - 3} textAnchor={right ? 'start' : 'end'} fill="#f1f3f5" fontSize={14} fontWeight={700}>{top && marks.length <= 8 ? `${top[0]} · ${m.label}` : m.label}</text>
                            <text x={lx + (right ? 6 : -6)} y={ly + 14} textAnchor={right ? 'start' : 'end'} fill="#ff9a6b" fontSize={12.5} fontWeight={600}>{m.n} {m.n === 1 ? 'pessoa' : 'pessoas'}</text>
                        </g>
                    );
                })}
            </g>
        </svg>
    );
}
