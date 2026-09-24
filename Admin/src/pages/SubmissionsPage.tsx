import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { ChevronLeft, ChevronRight, RefreshCw, Search, X } from 'lucide-react';
import { Card } from '../components/ui/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { inputClass } from '../components/ui/formStyles';
import { cn } from '../lib/cn';
import { useSemesterStore } from '../stores/semesterStore';
import {
  endpoints,
  errorMessage,
  type Overview,
  type SubmissionRow,
} from '../backend/connection';

const PAGE_SIZE = 15;
const REFRESH_MS = 30_000;
const PORTAL_URL = import.meta.env.PUBLIC_PORTAL_URL || 'http://localhost:4321';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function firstPreference(row: SubmissionRow): string {
  return row.preferences.find((p) => p.rank === 1)?.name ?? row.preferences[0]?.name ?? '—';
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: string;
}) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wide text-(--color-ink-muted)">{label}</div>
      <div className={cn('text-2xl font-bold mt-1 tabular-nums', tone)}>{value}</div>
    </Card>
  );
}

interface Countdown {
  label: string;
  sub: string;
  tone: string;
}

function resolveCountdown(overview: Overview | null, live: boolean, serverNow: number): Countdown {
  if (!overview) return { label: '—', sub: '', tone: '' };
  const w = overview.window;

  if (!live) return { label: 'Terminado', sub: 'Modo en vivo pausado', tone: 'text-(--color-ink-muted)' };

  if (w.reason === 'NOT_YET_OPEN' && w.opensAt) {
    const ms = Date.parse(w.opensAt) - serverNow;
    if (ms > 0) return { label: formatDuration(ms), sub: 'Abre en', tone: 'text-(--color-ink)' };
  }

  if (w.isOpen && w.closesAt) {
    const ms = Date.parse(w.closesAt) - serverNow;
    if (ms > 0) {
      const tone =
        ms <= 60_000
          ? 'text-(--color-danger)'
          : ms <= 300_000
            ? 'text-(--color-warning)'
            : 'text-(--color-success)';
      return { label: formatDuration(ms), sub: 'Cierra en', tone };
    }
    return { label: 'Abierto', sub: 'Sin límite de horario', tone: 'text-(--color-success)' };
  }

  return {
    label: 'Terminado',
    sub: w.reason === 'NOT_YET_OPEN' ? 'Aún no abre' : 'Registro cerrado',
    tone: 'text-(--color-ink-muted)',
  };
}

function LiveSwitch({ live, onToggle }: { live: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={live}
      onClick={onToggle}
      className="inline-flex items-center gap-2 text-sm font-medium"
    >
      <span
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition',
          live ? 'bg-(--color-success)' : 'bg-(--color-border-strong)',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-white shadow transition',
            live ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </span>
      En vivo
    </button>
  );
}

/**
 * Envíos en vivo — pantalla pensada para proyectarse durante la ventana.
 *
 * Con el switch "En vivo" encendido la tabla y los KPIs se refrescan cada 30 s
 * (sólo con la pestaña visible), el reloj cuenta hacia el cierre con hora del
 * servidor y la vista queda limpia: sin encabezado, sin botón de actualizar y
 * con un QR al portal del alumno. El switch para salir queda al pie de la
 * tabla, fuera del viewport, para que la proyección no lo muestre.
 *
 * Apagado, el reloj se congela en "Terminado" y aparece la barra de búsqueda.
 */
export function SubmissionsPage() {
  const semesterId = useSemesterStore((s) => s.selectedId);
  const semesters = useSemesterStore((s) => s.semesters);
  const loadSemesters = useSemesterStore((s) => s.loadSemesters);

  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setLoading] = useState(true);
  const [isFetching, setFetching] = useState(false);

  const [live, setLive] = useState(false);
  const [term, setTerm] = useState('');
  const [search, setSearch] = useState('');

  const [overview, setOverview] = useState<Overview | null>(null);
  const serverOffsetRef = useRef(0);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const seenRef = useRef<Set<number>>(new Set());
  const firstLoadRef = useRef(true);
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const liveInitRef = useRef(false);

  useEffect(() => {
    void loadSemesters();
  }, [loadSemesters]);

  const load = useCallback(async () => {
    if (semesterId == null) return;
    setFetching(true);
    try {
      const { data } = await endpoints.submissions_list(semesterId, {
        page,
        pageSize: PAGE_SIZE,
        search: !live && search ? search : undefined,
      });

      const fresh = new Set<number>();
      if (!firstLoadRef.current) {
        for (const r of data.rows) if (!seenRef.current.has(r.id)) fresh.add(r.id);
      }
      for (const r of data.rows) seenRef.current.add(r.id);
      firstLoadRef.current = false;

      setRows(data.rows);
      setTotal(data.total);
      setNewIds(fresh);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setFetching(false);
      setLoading(false);
    }
  }, [semesterId, page, live, search]);

  const loadOverview = useCallback(async () => {
    if (semesterId == null) return;
    try {
      const { data } = await endpoints.semester_overview(semesterId);
      serverOffsetRef.current = Date.parse(data.window.serverTime) - Date.now();
      setOverview(data);
    } catch {
      // Silencioso: el reloj sigue con el último offset conocido.
    }
  }, [semesterId]);

  // Carga inicial y cambios de página / búsqueda / semestre.
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  // Auto-refresco: sólo en vivo y con la pestaña visible.
  useEffect(() => {
    if (!live || semesterId == null) return;
    const tick = () => {
      if (document.hidden) return;
      void load();
      void loadOverview();
    };
    const iv = setInterval(tick, REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [live, semesterId, load, loadOverview]);

  // Reloj de pantalla.
  useEffect(() => {
    const iv = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Arranca en vivo si la ventana ya está abierta al entrar.
  useEffect(() => {
    if (liveInitRef.current || !overview) return;
    liveInitRef.current = true;
    if (overview.window.isOpen) setLive(true);
  }, [overview]);

  // En vivo no usa búsqueda: se limpia y se vuelve al principio.
  useEffect(() => {
    if (live) {
      setTerm('');
      setSearch('');
      setPage(1);
    }
  }, [live]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  if (semesters.length === 0) {
    return (
      <>
        <h2 className="text-xl font-bold tracking-tight">Envíos en vivo</h2>
        <p className="text-(--color-ink-muted) mt-2">
          Todavía no hay semestres. Creá uno en <strong>Semestres</strong> para recibir envíos.
        </p>
      </>
    );
  }

  const students = overview?.counts.students ?? 0;
  const submitted = overview?.counts.submissions ?? 0;
  const missing = Math.max(0, students - submitted);
  const countdown = resolveCountdown(overview, live, nowTick + serverOffsetRef.current);

  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  const table = (
    <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <ul
        className={cn(
          'flex-1 min-h-0 overflow-y-auto divide-y divide-(--color-border)',
          isFetching && 'opacity-60 transition-opacity',
        )}
      >
        {rows.map((r) => (
          <li
            key={r.id}
            className={cn(
              'flex items-center gap-3 px-4 py-2.5',
              newIds.has(r.id) && 'taev-row-in',
            )}
          >
            <span className="font-semibold tabular-nums w-[10ch] shrink-0">{r.code}</span>
            <span className="flex-1 min-w-0 truncate">
              {r.fullName ?? <span className="text-(--color-ink-subtle)">Sin nombre</span>}
            </span>
            <span className="shrink-0 max-w-[45%] flex items-center gap-1.5 text-sm text-(--color-ink-muted)">
              <Badge tone="outline">1ª</Badge>
              <span className="truncate">{firstPreference(r)}</span>
            </span>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="px-4 py-12 text-center text-sm text-(--color-ink-muted)">
            {isLoading
              ? 'Cargando…'
              : search
                ? 'Ningún envío coincide con la búsqueda.'
                : 'Todavía no hay envíos en este semestre.'}
          </li>
        )}
      </ul>

      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-(--color-border) text-xs text-(--color-ink-muted)">
        <span className="tabular-nums">
          {from}–{to} de {total}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Página anterior"
            className="inline-flex items-center justify-center size-8 rounded-lg border border-(--color-border) disabled:opacity-40 hover:bg-(--color-surface-muted)"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="tabular-nums px-1">
            {page} / {pageCount}
          </span>
          <button
            type="button"
            aria-label="Página siguiente"
            className="inline-flex items-center justify-center size-8 rounded-lg border border-(--color-border) disabled:opacity-40 hover:bg-(--color-surface-muted)"
            disabled={page >= pageCount || isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </Card>
  );

  // ── Modo en vivo: vista limpia para proyectar ────────────────────────────
  if (live) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Registrados" value={students} />
            <Stat label="Enviaron" value={submitted} tone="text-(--color-success)" />
            <Stat
              label="Faltan"
              value={missing}
              tone={missing > 0 ? 'text-(--color-warning)' : undefined}
            />
            <Card className="p-4 flex flex-col justify-center">
              <div className="text-[11px] uppercase tracking-wide text-(--color-ink-muted)">
                {countdown.sub || 'Cuenta regresiva'}
              </div>
              <div className={cn('text-4xl font-bold mt-1 tabular-nums', countdown.tone)}>
                {countdown.label}
              </div>
            </Card>
          </div>

          <Card className="p-3 flex items-center gap-3">
            <div className="rounded-lg bg-white p-2">
              <QRCodeSVG value={PORTAL_URL} size={104} marginSize={0} />
            </div>
            <div className="text-xs text-(--color-ink-muted) max-w-[9rem]">
              <p className="font-semibold text-(--color-ink)">Escanea para registrarte</p>
              <p className="mt-1 break-all">{PORTAL_URL}</p>
            </div>
          </Card>
        </div>

        {/* Alto fijo: la tabla cubre lo que queda del viewport, así el switch
            de abajo queda fuera de pantalla y sólo se llega haciendo scroll —
            la proyección nunca lo muestra. */}
        <div className="flex flex-col h-[calc(100dvh-13rem)] lg:h-[calc(100dvh-14rem)] min-h-64">
          {table}
        </div>

        <div className="mt-[45vh] flex justify-center pb-10">
          <LiveSwitch live={live} onToggle={() => setLive(false)} />
        </div>
      </div>
    );
  }

  // ── Modo revisión: encabezado, búsqueda y actualizar manual ──────────────
  return (
    <div className="flex flex-col gap-3 h-[calc(100dvh-6rem)] lg:h-[calc(100dvh-8rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Envíos en vivo</h2>
          {overview && (
            <p className="text-xs text-(--color-ink-muted) mt-0.5">
              {overview.semester.code} — {overview.semester.label}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-ink-subtle)"
            />
            <input
              className={cn(inputClass, 'pl-9 pr-9 w-64')}
              placeholder="Buscar por código o nombre…"
              value={term}
              onChange={(e) => setTerm(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setSearch(term.trim());
                  setPage(1);
                }
              }}
            />
            {term && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--color-ink-subtle) hover:text-(--color-ink)"
                onClick={() => {
                  setTerm('');
                  setSearch('');
                  setPage(1);
                }}
              >
                <X size={15} />
              </button>
            )}
          </div>

          <LiveSwitch live={live} onToggle={() => setLive(true)} />

          <Button
            color="neutral"
            variant="outlined"
            disabled={isFetching}
            onClick={() => {
              void load();
              void loadOverview();
            }}
          >
            <RefreshCw size={15} className={cn(isFetching && 'animate-spin')} /> Actualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Registrados" value={students} />
        <Stat label="Enviaron" value={submitted} tone="text-(--color-success)" />
        <Stat
          label="Faltan"
          value={missing}
          tone={missing > 0 ? 'text-(--color-warning)' : undefined}
        />
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-(--color-ink-muted)">
            {countdown.sub || 'Cuenta regresiva'}
          </div>
          <div className={cn('text-3xl font-bold mt-1 tabular-nums', countdown.tone)}>
            {countdown.label}
          </div>
        </Card>
      </div>

      {table}
    </div>
  );
}
