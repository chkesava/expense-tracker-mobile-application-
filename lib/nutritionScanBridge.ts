import type { FoodItem } from "@/shared/types/nutrition";

type ScannedFood = Omit<FoodItem, "id">;
type Listener = (food: ScannedFood) => void;

let listener: Listener | null = null;
let pending: ScannedFood | null = null;

export function subscribeNutritionScan(next: Listener): () => void {
  listener = next;
  if (pending) {
    const food = pending;
    pending = null;
    next(food);
  }
  return () => {
    if (listener === next) listener = null;
  };
}

export function emitNutritionScan(food: ScannedFood): void {
  if (listener) {
    listener(food);
    return;
  }
  pending = food;
}
