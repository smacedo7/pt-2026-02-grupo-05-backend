// Demonstration data only; none of it is a product requirement.
// Source: the team's Figma file ("Categoria Específica" frames, store list and
// product cards). Each block below says what was read there and what was chosen.

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

// Names, prices and availability come from the legible product list taken from
// Figma. A product is only seeded when it has a price and availability there.
//
// "storeLink" says where the link between product and store comes from:
// - "figma": the store logo was read on the product card in Figma.
// - "associacao-de-demonstracao" (associação de demonstração): no store could be
//   identified, so a listed store of the same category was chosen for the demo.
//   It is NOT information confirmed by Figma.
//
// The subcategories of the Repiit products are inferred from the kind of product.
// The others stay directly in the root category: none was identified for them.
//
// Stock rule of the demonstration: the frame shows only "available" or
// "unavailable", not quantities.
const AVAILABLE = 10;
const UNAVAILABLE = 0;

type DemoProduct = {
  storeKey: (typeof DEMO_STORES)[number]['key'];
  storeLink: 'figma' | 'associacao-de-demonstracao';
  categorySlug: string;
  name: string;
  price: string;
  stock: number;
  description?: string;
};

export const DEMO_PRODUCTS: readonly DemoProduct[] = [
  {
    storeKey: 'repiit',
    storeLink: 'figma',
    categorySlug: 'notebooks',
    name: 'Computador Lenovo',
    price: '3899.99',
    stock: AVAILABLE,
  },
  {
    storeKey: 'repiit',
    storeLink: 'figma',
    categorySlug: 'notebooks',
    name: 'Computador Samsung',
    price: '8549.99',
    stock: UNAVAILABLE,
  },
  {
    storeKey: 'repiit',
    storeLink: 'figma',
    categorySlug: 'tvs',
    name: 'Smart TV Philips',
    price: '1229.00',
    stock: AVAILABLE,
  },

  // Eletrônicos: associação de demonstração (store not identified in Figma).
  {
    storeKey: 'electree',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'eletronicos',
    name: 'iPhone 15',
    price: '4769.10',
    stock: AVAILABLE,
  },
  {
    storeKey: 'electree',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'eletronicos',
    name: 'Xbox Series X',
    price: '3599.99',
    stock: AVAILABLE,
  },
  {
    storeKey: 'electree',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'eletronicos',
    name: 'Macbook Air',
    price: '15899.99',
    stock: AVAILABLE,
  },
  {
    storeKey: 'electree',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'eletronicos',
    name: 'iPhone 16',
    price: '4598.99',
    stock: UNAVAILABLE,
  },
  {
    storeKey: 'electree',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'eletronicos',
    name: 'S25 Ultra',
    price: '5769.10',
    stock: AVAILABLE,
  },
  {
    storeKey: 'electree',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'eletronicos',
    name: 'iPad',
    price: '7859.00',
    stock: AVAILABLE,
  },
  {
    storeKey: 'electree',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'eletronicos',
    name: 'Headset Gamer',
    price: '899.99',
    stock: UNAVAILABLE,
  },
  {
    storeKey: 'electree',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'eletronicos',
    name: 'Nintendo Switch 2',
    price: '4799.99',
    stock: UNAVAILABLE,
  },
  {
    storeKey: 'electree',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'eletronicos',
    name: 'JBL',
    price: '1399.00',
    stock: AVAILABLE,
  },
  {
    storeKey: 'electree',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'eletronicos',
    name: 'Xbox Series S',
    price: '1499.99',
    stock: AVAILABLE,
  },

  // Beleza: associação de demonstração (store not identified in Figma).
  {
    storeKey: 'rare-beauty',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'beleza',
    name: 'Lápis Labial',
    price: '139.90',
    stock: AVAILABLE,
  },
  {
    storeKey: 'creamy-skincare',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'beleza',
    name: 'Contorno',
    price: '289.90',
    stock: AVAILABLE,
  },
  {
    storeKey: 'roots',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'beleza',
    name: 'Iluminador',
    price: '249.90',
    stock: AVAILABLE,
  },
  {
    storeKey: 'rare-beauty',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'beleza',
    name: 'Primer',
    price: '139.00',
    stock: AVAILABLE,
  },
  {
    storeKey: 'creamy-skincare',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'beleza',
    name: 'Máscara de Cílios',
    price: '109.99',
    stock: AVAILABLE,
  },
  {
    storeKey: 'roots',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'beleza',
    name: 'Mini Blush',
    price: '99.99',
    stock: UNAVAILABLE,
  },
  {
    storeKey: 'creamy-skincare',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'beleza',
    name: 'Pó Compacto',
    price: '119.50',
    stock: AVAILABLE,
  },
  {
    storeKey: 'rare-beauty',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'beleza',
    name: 'Perfume Rare',
    price: '599.90',
    stock: AVAILABLE,
  },
  {
    storeKey: 'roots',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'beleza',
    name: 'Bronzer',
    price: '254.99',
    stock: AVAILABLE,
  },
  {
    storeKey: 'rare-beauty',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'beleza',
    name: 'Bruma Facial',
    price: '149.00',
    stock: UNAVAILABLE,
  },
  {
    storeKey: 'creamy-skincare',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'beleza',
    name: 'Batom',
    price: '179.00',
    stock: AVAILABLE,
  },
  {
    storeKey: 'roots',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'beleza',
    name: 'Blush',
    price: '199.99',
    stock: UNAVAILABLE,
  },
  {
    storeKey: 'rare-beauty',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'beleza',
    name: 'Gel Perfumado',
    price: '179.99',
    stock: AVAILABLE,
  },

  // Mercado: associação de demonstração (store not identified in Figma).
  {
    storeKey: 'cjr',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'mercado',
    name: 'Brownie Meio Amargo',
    price: '4.70',
    stock: AVAILABLE,
  },
  {
    storeKey: 'maumar',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'mercado',
    name: 'Brownie Tradicional',
    price: '3.80',
    stock: UNAVAILABLE,
  },
  {
    storeKey: 'the-cro-brew',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'mercado',
    name: 'Nozes',
    description: 'Preço por kg.',
    price: '29.99',
    stock: AVAILABLE,
  },
  {
    storeKey: 'dcarts-baskets',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'mercado',
    name: 'Banana',
    description: 'Preço por kg.',
    price: '3.99',
    stock: AVAILABLE,
  },
  {
    storeKey: 'cjr',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'mercado',
    name: 'Limão Siciliano',
    description: 'Preço por kg.',
    price: '17.99',
    stock: UNAVAILABLE,
  },
  {
    storeKey: 'maumar',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'mercado',
    name: 'Leite',
    price: '4.99',
    stock: AVAILABLE,
  },
  {
    storeKey: 'the-cro-brew',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'mercado',
    name: 'Manteiga',
    price: '23.99',
    stock: AVAILABLE,
  },
  {
    storeKey: 'dcarts-baskets',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'mercado',
    name: 'Leite Condensado',
    price: '7.99',
    stock: AVAILABLE,
  },
  {
    storeKey: 'cjr',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'mercado',
    name: 'Coca-Cola',
    price: '3.99',
    stock: AVAILABLE,
  },
  {
    storeKey: 'maumar',
    storeLink: 'associacao-de-demonstracao',
    categorySlug: 'mercado',
    name: 'Farinha de Trigo',
    price: '6.99',
    stock: AVAILABLE,
  },
];
