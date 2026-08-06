import { FoodItem, NutrientTotals } from '../shared/types/nutrition';

interface OFFProductResponse {
  status: number;
  product?: {
    product_name?: string;
    product_name_en?: string;
    quantity?: string;
    nutriments?: {
      'energy-kcal_100g'?: number;
      'energy-kcal_serving'?: number;
      proteins_100g?: number;
      proteins_serving?: number;
      carbohydrates_100g?: number;
      carbohydrates_serving?: number;
      fat_100g?: number;
      fat_serving?: number;
      fiber_100g?: number;
      fiber_serving?: number;
      sugars_100g?: number;
      sugars_serving?: number;
      sodium_100g?: number;
      sodium_serving?: number;
      potassium_100g?: number;
      potassium_serving?: number;
    };
  };
}

export async function fetchFoodByBarcode(barcode: string): Promise<Omit<FoodItem, 'id'> | null> {
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
    
    if (!response.ok) {
      return null;
    }

    const data: OFFProductResponse = await response.json();

    if (data.status !== 1 || !data.product) {
      return null;
    }

    const { product } = data;
    const name = product.product_name || product.product_name_en || 'Unknown Product';
    const quantity = product.quantity || '100g';
    const nutriments = product.nutriments || {};

    // Prefer serving if available, otherwise fallback to 100g
    const hasServing = typeof nutriments['energy-kcal_serving'] === 'number';

    const nutrients: NutrientTotals = {
      calories: (hasServing ? nutriments['energy-kcal_serving'] : nutriments['energy-kcal_100g']) || 0,
      protein: (hasServing ? nutriments.proteins_serving : nutriments.proteins_100g) || 0,
      carbs: (hasServing ? nutriments.carbohydrates_serving : nutriments.carbohydrates_100g) || 0,
      fat: (hasServing ? nutriments.fat_serving : nutriments.fat_100g) || 0,
      fiber: (hasServing ? nutriments.fiber_serving : nutriments.fiber_100g) || 0,
      sugar: (hasServing ? nutriments.sugars_serving : nutriments.sugars_100g) || 0,
      sodium: (hasServing ? nutriments.sodium_serving : nutriments.sodium_100g) || 0,
      potassium: (hasServing ? nutriments.potassium_serving : nutriments.potassium_100g) || 0,
    };

    return {
      name,
      quantity,
      nutrients,
    };
  } catch (error) {
    console.error('Error fetching food by barcode:', error);
    return null;
  }
}
