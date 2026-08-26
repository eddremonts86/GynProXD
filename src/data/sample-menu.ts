import type { MenuSection } from '../lib/menu'

/** Starter card for a new gym kitchen: broad, editable, priced in EUR. */
export const SAMPLE_MENU: MenuSection[] = [
  {
    name: 'Breakfast',
    items: [
      { name: 'Overnight oats', desc: 'Oats, skyr, blueberries, toasted seeds', price: '4.50' },
      { name: 'Egg-white omelette', desc: 'Three whites, spinach, feta, rye toast', price: '6.90' },
      { name: 'Protein pancakes', desc: 'Banana batter, Greek yogurt, maple', price: '7.20' },
      { name: 'Avocado rye', desc: 'Sourdough rye, avocado, chili flakes, poached egg', price: '6.50' },
    ],
  },
  {
    name: 'Bowls & lunch',
    items: [
      { name: 'Grilled chicken bowl', desc: 'Brown rice, charred broccoli, tahini', price: '9.80' },
      { name: 'Salmon poke', desc: 'Sushi rice, edamame, pickled ginger, sesame', price: '11.50' },
      { name: 'Lentil ragout', desc: 'Slow lentils, roast tomato, herb oil', price: '8.40' },
      { name: 'Steak & sweet potato', desc: '150g flank, sweet potato mash, chimichurri', price: '12.90' },
      { name: 'Falafel plate', desc: 'Six falafel, hummus, tabbouleh, flatbread', price: '8.90' },
    ],
  },
  {
    name: 'Post-workout shakes',
    items: [
      { name: 'The Regular', desc: 'Whey, banana, oat milk, cinnamon', price: '5.50' },
      { name: 'Green rebuild', desc: 'Plant protein, spinach, mango, lime', price: '5.90' },
      { name: 'Espresso lift', desc: 'Whey, cold brew, cacao nibs, dates', price: '6.20' },
      { name: 'Berry recovery', desc: 'Casein, mixed berries, skyr, honey', price: '5.90' },
    ],
  },
  {
    name: 'Snacks & bakes',
    items: [
      { name: 'Protein brownie', desc: 'Dark chocolate, walnut, 18g protein', price: '3.40' },
      { name: 'Energy balls (3)', desc: 'Date, peanut, cacao', price: '2.80' },
      { name: 'Skyr cup', desc: 'Skyr, granola, seasonal fruit', price: '3.90' },
      { name: 'Banana bread', desc: 'Whole grain, no added sugar', price: '3.20' },
    ],
  },
  {
    name: 'Drinks',
    items: [
      { name: 'Cold brew', price: '3.50' },
      { name: 'Kombucha', desc: 'Ginger & lemon, house-fermented', price: '4.20' },
      { name: 'Electrolyte water', desc: 'Citrus, unsweetened', price: '2.50' },
      { name: 'Fresh orange juice', price: '3.80' },
    ],
  },
]
