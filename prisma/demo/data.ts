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

// Names read from the logos on the product cards of the frame. "Rapiit" and
// "Bersay" are provisional readings of stylized logos. The name identifies the
// store on later runs, so fix it here before seeding a database.
// "key" builds the owner account: demo.<key>@example.com.
export const DEMO_STORES = [
  { key: 'rapiit', name: 'Rapiit' },
  { key: 'bersay', name: 'Bersay' },
  { key: 'hobby', name: 'Hobby' },
] as const;
