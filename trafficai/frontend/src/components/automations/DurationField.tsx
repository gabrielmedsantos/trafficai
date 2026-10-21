"use client";
import { useState } from "react";
const units = [
  { value: 1, label: "Segundos" },
  { value: 60, label: "Minutos" },
  { value: 3600, label: "Horas" },
  { value: 86400, label: "Dias" },
];
export function describeWait(seconds: number) {
  const unit =
    [86400, 3600, 60].find(
      (value) => seconds >= value && seconds % value === 0,
    ) || 1;
  const amount = seconds / unit,
    label =
      unit === 86400
        ? "dia"
        : unit === 3600
          ? "hora"
          : unit === 60
            ? "minuto"
            : "segundo";
  return (
    new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(
      amount,
    ) +
    " " +
    label +
    (amount === 1 ? "" : "s")
  );
}
export default function DurationField({
  seconds,
  onChange,
}: {
  seconds: number;
  onChange: (seconds: number) => void;
}) {
  const [unit, setUnit] = useState(
    () =>
      [86400, 3600, 60].find(
        (value) => seconds >= value && seconds % value === 0,
      ) || 1,
  );
  return (
    <div className="aw-duration">
      <label>
        Tempo de espera
        <input
          type="number"
          min={1 / unit}
          max={2592000 / unit}
          step="any"
          value={seconds / unit}
          onChange={(e) => onChange(Math.round(Number(e.target.value) * unit))}
        />
      </label>
      <label>
        Unidade
        <select
          value={unit}
          onChange={(e) => {
            const next = Number(e.target.value);
            onChange(Math.round((seconds / unit) * next));
            setUnit(next);
          }}
        >
          {units.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </label>
      <small>
        A próxima etapa ficará agendada por {describeWait(seconds)}.
      </small>
    </div>
  );
}
