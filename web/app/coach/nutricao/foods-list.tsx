"use client";

import { useState } from "react";
import type { Food } from "@/lib/repository";
import { formatBase, formatNumber } from "@/lib/food-macros";
import { Badge, Button, Modal } from "@/components/ui";
import { setFoodArchivedAction } from "./actions";
import FoodForm from "./food-form";
import { SubmitButton } from "@/components/ui/submit-button";

function Macro({ label, value, suffix = "" }: { label: string; value?: number; suffix?: string }) {
  return (
    <span className="flex min-w-9 flex-col items-end leading-tight">
      <span className="text-xs uppercase tracking-wide text-ink-faint">{label}</span>
      <span className={value == null ? "text-ink-faint" : "font-medium text-ink"}>
        {value == null ? "—" : `${formatNumber(value, label === "kcal" ? 0 : 1)}${suffix}`}
      </span>
    </span>
  );
}

/** Lista compacta de alimentos + modal de criar/editar. Só mostra os valores que existem. */
export default function FoodsList({ foods, totalCount }: { foods: Food[]; totalCount: number }) {
  const [editing, setEditing] = useState<Food | "new" | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {foods.length === totalCount
            ? `${totalCount} ${totalCount === 1 ? "alimento" : "alimentos"}`
            : `${foods.length} de ${totalCount} alimentos`}
          . Valores por porção-base (ex.: por 100 g).
        </p>
        <Button icon="plus" onClick={() => setEditing("new")}>
          Novo alimento
        </Button>
      </div>

      {foods.length > 0 && (
        <ul className="card overflow-hidden">
          {foods.map((food) => (
            <li
              key={food.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1 basis-48">
                <p className="break-words font-medium text-ink">
                  {food.name}
                  {food.is_archived && (
                    <Badge tone="neutral" className="ml-2 align-middle">
                      Arquivado
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-ink-faint">
                  {[food.category, formatBase(food)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <Macro label="kcal" value={food.macros.kcal} />
                <Macro label="P" value={food.macros.protein_g} suffix="g" />
                <Macro label="C" value={food.macros.carbs_g} suffix="g" />
                <Macro label="G" value={food.macros.fat_g} suffix="g" />
              </div>
              <div className="flex gap-1.5">
                <Button variant="secondary" size="sm" onClick={() => setEditing(food)}>
                  Editar
                </Button>
                <form action={setFoodArchivedAction}>
                  <input type="hidden" name="foodId" value={food.id} />
                  <input type="hidden" name="archive" value={food.is_archived ? "0" : "1"} />
                  <SubmitButton variant="tertiary" size="sm" pendingLabel="Aguarde…">
                    {food.is_archived ? "Reativar" : "Arquivar"}
                  </SubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Novo alimento" : "Editar alimento"}
      >
        {editing !== null && <FoodForm food={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
