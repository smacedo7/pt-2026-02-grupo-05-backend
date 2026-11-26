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

// Names read from the logos on the product cards of the frame. "Repiit" is in
// the store list of the Figma file; "Bersay" is a provisional reading of a
// stylized logo. The name identifies the store on later runs, so fix it here
// before seeding a database.
// "key" builds the owner account: demo.<key>@example.com.
export const DEMO_STORES = [
  { key: 'repiit', name: 'Repiit' },
  { key: 'bersay', name: 'Bersay' },
  { key: 'hobby', name: 'Hobby' },
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
    storeKey: 'bersay',
    subcategorySlug: 'celulares',
    name: 'iPhone 15',
    price: '4769.10',
    stock: AVAILABLE,
  },
  {
    storeKey: 'repiit',
    subcategorySlug: 'tvs',
    name: 'Smart TV Philips',
    price: '1229.00',
    stock: AVAILABLE,
  },
  {
    storeKey: 'hobby',
    subcategorySlug: 'outros',
    name: 'Xbox Series X',
    price: '3599.99',
    stock: AVAILABLE,
  },
] as const;
