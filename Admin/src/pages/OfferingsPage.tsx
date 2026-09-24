import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Layers, Pencil, Plus } from 'lucide-react';
import { PageHeader, Card } from '../components/ui/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { inputClass, labelClass, selectClass } from '../components/ui/formStyles';
import { cn } from '../lib/cn';
import { useSemesterStore } from '../stores/semesterStore';
import { canWrite, useAuthStore } from '../stores/authStore';
import {
  endpoints,
  errorMessage,
  type GroupRow,
  type OfferingRow,
} from '../backend/connection';

interface GroupTarget {
  offering: OfferingRow;
  group: GroupRow | null;
}

/**
 * Oferta del semestre y sus grupos con cupo.
 *
 * Es lo que el allocator reparte: sin grupos activos con cupo, una corrida deja
 * a todo el mundo `unplaced`. Los grupos se llenan en el orden de esta pantalla
 * (`display_order`), así que el orden acá no es cosmético.
 */
export function OfferingsPage() {
  const semesterId = useSemesterStore((s) => s.selectedId);
  const loadSemesters = useSemesterStore((s) => s.loadSemesters);
  const refreshOverview = useSemesterStore((s) => s.refreshOverview);
  const user = useAuthStore((s) => s.user);
  const writable = canWrite(user);

  const [offerings, setOfferings] = useState<OfferingRow[]>([]);
  const [catalog, setCatalog] = useState<{ id: number; code: string; name: string }[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [addingOffering, setAddingOffering] = useState(false);
  const [groupTarget, setGroupTarget] = useState<GroupTarget | null>(null);

  useEffect(() => {
    void loadSemesters();
  }, [loadSemesters]);

  const load = useCallback(async () => {
    if (semesterId == null) return;
    setLoading(true);
    try {
      const [list, options] = await Promise.all([
        endpoints.offerings_list(semesterId),
        endpoints.subject_options(),
      ]);
      setOfferings(list.data);
      setCatalog(options.data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [semesterId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleOffering = async (offering: OfferingRow) => {
    if (semesterId == null) return;
    try {
      await endpoints.offering_update(semesterId, offering.id, { isActive: !offering.isActive });
      toast.success(offering.isActive ? 'Asignatura retirada de la oferta.' : 'Asignatura reactivada.');
      await load();
      await refreshOverview();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const toggleGroup = async (group: GroupRow) => {
    if (semesterId == null) return;
    try {
      await endpoints.group_update(semesterId, group.id, { isActive: !group.isActive });
      toast.success(group.isActive ? 'Grupo desactivado.' : 'Grupo activado.');
      await load();
      await refreshOverview();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (semesterId == null) {
    return (
      <>
        <PageHeader title="Oferta y grupos" />
        <p className="text-(--color-ink-muted)">Elegí un semestre para ver su oferta.</p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Oferta y grupos"
        subtitle="Qué asignaturas se ofrecen este semestre y con cuánto cupo."
        actions={
          writable && (
            <Button onClick={() => setAddingOffering(true)}>
              <Plus size={15} /> Ofertar asignatura
            </Button>
          )
        }
      />

      {isLoading && offerings.length === 0 && <p className="text-(--color-ink-muted)">Cargando…</p>}

      {!isLoading && offerings.length === 0 && (
        <Card className="p-10 text-center">
          <Layers className="mx-auto text-(--color-ink-subtle)" size={28} />
          <p className="mt-3 font-medium">Este semestre todavía no ofrece nada</p>
          <p className="text-sm text-(--color-ink-muted) mt-1">
            Agregá asignaturas del catálogo y creales al menos un grupo con cupo.
          </p>
        </Card>
      )}

      <div className="grid gap-4">
        {offerings.map((offering) => {
          const capacity = offering.groups.reduce((s, g) => s + g.capacity, 0);
          const assigned = offering.groups.reduce((s, g) => s + g.assignedCount, 0);

          return (
            <Card key={offering.id} className="overflow-hidden">
              <header className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-(--color-border)">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{offering.subject.name}</h3>
                    <code className="text-xs text-(--color-ink-muted)">{offering.subject.code}</code>
                    {!offering.isActive && <Badge tone="danger">fuera de la oferta</Badge>}
                  </div>
                  <p className="text-xs text-(--color-ink-muted) mt-1 tabular-nums">
                    {offering.groups.length} grupo(s) · cupo {capacity} · ocupado {assigned} · libre{' '}
                    {capacity - assigned}
                  </p>
                </div>
                {writable && (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      color="neutral"
                      variant="outlined"
                      onClick={() => setGroupTarget({ offering, group: null })}
                    >
                      <Plus size={14} /> Grupo
                    </Button>
                    <Button
                      size="sm"
                      color="neutral"
                      variant="flat"
                      onClick={() => void toggleOffering(offering)}
                    >
                      {offering.isActive ? 'Retirar' : 'Reactivar'}
                    </Button>
                  </div>
                )}
              </header>

              {offering.groups.length === 0 ? (
                <p className="px-5 py-6 text-sm text-(--color-ink-muted)">
                  Sin grupos: nadie puede ser asignado a esta asignatura todavía.
                </p>
              ) : (
                <div className="scroll-x">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-(--color-ink-muted) bg-(--color-surface-muted)/60">
                        <th className="px-5 py-2">Grupo</th>
                        <th className="px-4 py-2 text-right">Cupo</th>
                        <th className="px-4 py-2 text-right">Ocupado</th>
                        <th className="px-4 py-2 text-right">Libre</th>
                        <th className="px-4 py-2">Estado</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {offering.groups.map((g) => (
                        <tr key={g.id} className="border-t border-(--color-border)">
                          <td className="px-5 py-2 font-medium">{g.label}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{g.capacity}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{g.assignedCount}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {g.capacity - g.assignedCount}
                          </td>
                          <td className="px-4 py-2">
                            {g.isActive ? (
                              <Badge tone="accent">activo</Badge>
                            ) : (
                              <Badge tone="neutral">inactivo</Badge>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {writable && (
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  color="neutral"
                                  variant="flat"
                                  onClick={() => setGroupTarget({ offering, group: g })}
                                >
                                  <Pencil size={13} />
                                </Button>
                                <Button
                                  size="sm"
                                  color="neutral"
                                  variant="flat"
                                  onClick={() => void toggleGroup(g)}
                                >
                                  {g.isActive ? 'Desactivar' : 'Activar'}
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {addingOffering && (
        <AddOfferingModal
          catalog={catalog}
          offered={offerings.map((o) => o.subjectId)}
          isSaving={isSaving}
          onClose={() => setAddingOffering(false)}
          onSubmit={async (body) => {
            setSaving(true);
            try {
              await endpoints.offering_add(semesterId, body);
              toast.success('Asignatura agregada a la oferta.');
              setAddingOffering(false);
              await load();
              await refreshOverview();
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setSaving(false);
            }
          }}
        />
      )}

      {groupTarget && (
        <GroupFormModal
          target={groupTarget}
          isSaving={isSaving}
          onClose={() => setGroupTarget(null)}
          onSubmit={async (body) => {
            setSaving(true);
            try {
              if (groupTarget.group) {
                await endpoints.group_update(semesterId, groupTarget.group.id, body);
                toast.success('Grupo actualizado.');
              } else {
                await endpoints.group_create(semesterId, {
                  semesterSubjectId: groupTarget.offering.id,
                  label: body.label!,
                  capacity: body.capacity!,
                  displayOrder: body.displayOrder,
                });
                toast.success('Grupo creado.');
              }
              setGroupTarget(null);
              await load();
              await refreshOverview();
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </>
  );
}

// ── Modales ─────────────────────────────────────────────────────────────────

/**
 * Ofertar: o se elige una del catálogo, o se crea una nueva ahí mismo. El
 * segundo camino existe porque durante el armado de un evento nadie quiere ir
 * a otra pantalla a dar de alta "Robótica" y volver.
 */
function AddOfferingModal({
  catalog,
  offered,
  onClose,
  onSubmit,
  isSaving,
}: {
  catalog: { id: number; code: string; name: string }[];
  offered: number[];
  onClose: () => void;
  onSubmit: (body: {
    subjectId?: number;
    code?: string;
    name?: string;
    displayOrder?: number;
  }) => Promise<void>;
  isSaving: boolean;
}) {
  const available = catalog.filter((c) => !offered.includes(c.id));
  const [mode, setMode] = useState<'catalog' | 'new'>(available.length > 0 ? 'catalog' : 'new');
  const [subjectId, setSubjectId] = useState<number | ''>(available[0]?.id ?? '');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [displayOrder, setDisplayOrder] = useState(offered.length);

  const submit = () => {
    if (mode === 'catalog') {
      if (!subjectId) return toast.error('Elegí una asignatura.');
      return void onSubmit({ subjectId: Number(subjectId), displayOrder });
    }
    if (!code.trim() || !name.trim()) return toast.error('Código y nombre son obligatorios.');
    return void onSubmit({ code: code.trim().toUpperCase(), name: name.trim(), displayOrder });
  };

  return (
    <Modal
      title="Ofertar asignatura"
      description="Sólo lo que esté en la oferta puede ser elegido por los alumnos."
      onClose={onClose}
      footer={
        <>
          <Button color="neutral" variant="outlined" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={isSaving}>
            {isSaving ? 'Agregando…' : 'Agregar a la oferta'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex gap-2">
          <Button
            size="sm"
            color={mode === 'catalog' ? 'primary' : 'neutral'}
            variant={mode === 'catalog' ? 'soft' : 'outlined'}
            onClick={() => setMode('catalog')}
            disabled={available.length === 0}
          >
            Del catálogo
          </Button>
          <Button
            size="sm"
            color={mode === 'new' ? 'primary' : 'neutral'}
            variant={mode === 'new' ? 'soft' : 'outlined'}
            onClick={() => setMode('new')}
          >
            Crear una nueva
          </Button>
        </div>

        {mode === 'catalog' ? (
          <div>
            <label className={labelClass} htmlFor="subjectId">
              Asignatura
            </label>
            <select
              id="subjectId"
              className={selectClass}
              value={subjectId}
              onChange={(e) => setSubjectId(Number(e.currentTarget.value))}
            >
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
            {available.length === 0 && (
              <p className="text-xs text-(--color-ink-muted) mt-1">
                Todo el catálogo ya está ofertado en este semestre.
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="new-code">
                Código
              </label>
              <input
                id="new-code"
                placeholder="TAEV-ROB"
                className={cn(inputClass, 'uppercase')}
                value={code}
                onChange={(e) => setCode(e.currentTarget.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="new-name">
                Nombre
              </label>
              <input
                id="new-name"
                placeholder="Robótica"
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
              />
            </div>
          </div>
        )}

        <div>
          <label className={labelClass} htmlFor="displayOrder">
            Orden en el formulario
          </label>
          <input
            id="displayOrder"
            type="number"
            className={cn(inputClass, 'tabular-nums')}
            value={displayOrder}
            onChange={(e) => setDisplayOrder(Number(e.currentTarget.value))}
          />
        </div>
      </div>
    </Modal>
  );
}

/** Alta/edición de un grupo. El cupo nunca puede quedar por debajo de lo ya asignado. */
function GroupFormModal({
  target,
  onClose,
  onSubmit,
  isSaving,
}: {
  target: GroupTarget;
  onClose: () => void;
  onSubmit: (body: {
    label?: string;
    capacity?: number;
    displayOrder?: number;
  }) => Promise<void>;
  isSaving: boolean;
}) {
  const { offering, group } = target;
  const [label, setLabel] = useState(group?.label ?? '');
  const [capacity, setCapacity] = useState(group?.capacity ?? 30);
  const [displayOrder, setDisplayOrder] = useState(group?.displayOrder ?? offering.groups.length);

  const min = group?.assignedCount ?? 0;

  const submit = () => {
    if (!label.trim()) return toast.error('La etiqueta del grupo es obligatoria.');
    if (!Number.isInteger(capacity) || capacity <= 0) return toast.error('El cupo debe ser positivo.');
    if (capacity < min) return toast.error(`Ya hay ${min} alumnos asignados a este grupo.`);
    return void onSubmit({ label: label.trim(), capacity, displayOrder });
  };

  return (
    <Modal
      title={group ? `Grupo ${group.label} · ${offering.subject.name}` : `Nuevo grupo · ${offering.subject.name}`}
      description="El allocator llena los grupos en el orden de esta lista."
      onClose={onClose}
      footer={
        <>
          <Button color="neutral" variant="outlined" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={isSaving}>
            {isSaving ? 'Guardando…' : group ? 'Guardar' : 'Crear grupo'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor="group-label">
            Etiqueta
          </label>
          <input
            id="group-label"
            placeholder="A"
            className={inputClass}
            value={label}
            onChange={(e) => setLabel(e.currentTarget.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="group-capacity">
            Cupo
          </label>
          <input
            id="group-capacity"
            type="number"
            min={Math.max(1, min)}
            className={cn(inputClass, 'tabular-nums')}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.currentTarget.value))}
          />
          {min > 0 && (
            <p className="text-xs text-(--color-ink-muted) mt-1">Mínimo {min} (ya asignados).</p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="group-order">
            Orden
          </label>
          <input
            id="group-order"
            type="number"
            className={cn(inputClass, 'tabular-nums')}
            value={displayOrder}
            onChange={(e) => setDisplayOrder(Number(e.currentTarget.value))}
          />
        </div>
      </div>
    </Modal>
  );
}
