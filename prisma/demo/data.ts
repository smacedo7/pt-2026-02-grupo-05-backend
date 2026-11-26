// Demonstration data only; none of it is a product requirement.
// Source: the "Categoria Específica" frames of the team's Figma file, plus the
// inventory checked by hand in the same file.

// The Figma frame is titled "tecnologia"; the official root for it is this one.
export const DEMO_PARENT_CATEGORY_SLUG = 'eletronicos';

// The filter buttons of the frame.
export const DEMO_SUBCATEGORIES = [
  { name: 'Celulares', slug: 'celulares' },
  { name: 'Notebooks', slug: 'notebooks' },
  { name: 'TVs', slug: 'tvs' },
  { name: 'Acessórios', slug: 'acessorios' },
  { name: 'Outros', slug: 'outros' },
] as const;

// The store list of the Figma file, each with its category. The name identifies
// the store on later runs. "key" builds the owner account:
// demo.<key>@example.com.
export const DEMO_STORES = [
  { key: 'cjr', name: 'CJR', categorySlug: 'mercado' },
  { key: 'maumar', name: 'Maumar', categorySlug: 'mercado' },
  { key: 'mini-reno', name: 'Mini Reno', categorySlug: 'casa' },
  { key: 'rare-beauty', name: 'Rare Beauty', categorySlug: 'beleza' },
  { key: 'the-cro-brew', name: 'The Cro Brew', categorySlug: 'mercado' },
  { key: 'amoca', name: 'Amoca', categorySlug: 'moda' },
  { key: 'creamy-skincare', name: 'Creamy Skincare', categorySlug: 'beleza' },
  { key: 'sneakerstore', name: 'SneakerStore', categorySlug: 'moda' },
  { key: 'dcarts-baskets', name: 'd’carts & baskets', categorySlug: 'mercado' },
  { key: 'repiit', name: 'Repiit', categorySlug: 'eletronicos' },
  { key: 'fluffy-house', name: 'Fluffy House', categorySlug: 'casa' },
  { key: 'melina-couture', name: 'Melina Couture', categorySlug: 'moda' },
  { key: 'electree', name: 'Electree', categorySlug: 'eletronicos' },
  { key: 'roots', name: 'Roots', categorySlug: 'beleza' },
  { key: 'whiskers', name: 'Whiskers', categorySlug: 'moda' },
] as const;

// Only the products whose price, availability and store are visible in the frame.
// The other names of the inventory are not seeded: the database requires a price,
// a stock and a store, and none of them was confirmed.
// Names follow the checked inventory (the frame abbreviates "Computador" as
// "Comp.").
// Stock rule of the demonstration: the frame shows only "available" or
// "unavailable", not quantities.
const AVAILABLE = 10;
const UNAVAILABLE = 0;

export const DEMO_PRODUCTS = [
  {
    storeKey: 'repiit',
    subcategorySlug: 'notebooks',
    name: 'Computador Lenovo',
    price: '3899.99',
    stock: AVAILABLE,
  },
  {
    storeKey: 'repiit',
    subcategorySlug: 'notebooks',
    name: 'Computador Samsung',
    price: '8549.99',
    stock: UNAVAILABLE,
  },
  {
    storeKey: 'repiit',
    subcategorySlug: 'tvs',
    name: 'Smart TV Philips',
    price: '1229.00',
    stock: AVAILABLE,
  },
] as const;
