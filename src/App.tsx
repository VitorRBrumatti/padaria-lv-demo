import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ShoppingCart, Cookie, Coffee, Home, MapPin, Info, LogIn, LogOut, Plus, Edit, Trash, Search, Bot, BarChart2 as ChartBar, Users, AlertTriangle, CheckCircle2, ChefHat, ReceiptText, Settings2, Mail } from "lucide-react";

function resetLocalStorageOnLoad() {
  useEffect(() => {
    localStorage.clear();
  }, []);
}

type Role = "manager" | "stockist" | "cashier";

type User = {
  id: number;
  name: string;
  email: string;
  roles: Role[];
  password: string;
  is_active: boolean;
};

type Product = {
  id: number;
  name: string;
  description?: string;
  price_cents: number;
  cost_cents?: number | null;
  quantity: number;
  expires_at?: string | null;
  category: "paes" | "bolos" | "doces" | "outros";
  is_active: boolean;
  image_url?: string;
  created_at: string;
  updated_at: string;
};

type SaleItem = { id: number; product_id: number; qty: number; unit_price_cents: number; subtotal_cents: number };

type Sale = {
  id: number;
  cashier_id: number;
  total_cents: number;
  discount_cents: number;
  paid_cents: number;
  payment_method: "cash" | "card" | "pix";
  issued_at: string;
  receipt_code: string;
  items: SaleItem[];
};

type ContactMessage = { id: number; name: string; email: string; message: string; created_at: string };

const LS = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, val: T) {
    localStorage.setItem(key, JSON.stringify(val));
  },
};

const fmtBRL = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const todayStr = () => new Date().toISOString();
const daysDiff = (iso?: string | null) => {
  if (!iso) return Infinity;
  const d = new Date(iso).getTime();
  const now = new Date().setHours(0, 0, 0, 0);
  return Math.floor((d - now) / (1000 * 60 * 60 * 24));
};

function statusValidade(p: Product): "vencido" | "a_vencer" | "ok" {
  const d = daysDiff(p.expires_at);
  if (d < 0) return "vencido";
  if (d <= 3) return "a_vencer";
  return "ok";
}

// --- novos utilitários para preço (reais <-> centavos) ---
const formatCentsToLocale = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseBRLToCents(input: string): number {
  const s = (input ?? "").trim();
  if (s === "") return 0;
  const hasComma = s.indexOf(",") !== -1;
  const hasDot = s.indexOf(".") !== -1;
  let normalized = s;
  if (hasComma && hasDot) {
    // assume dot as thousand separator and comma as decimal
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    // only comma or only dot or neither — treat comma as decimal
    normalized = s.replace(",", ".");
  }
  // remove any non-digit/decimal chars (e.g. currency symbol, spaces)
  const cleaned = normalized.replace(/[^\d.]/g, "");
  const v = parseFloat(cleaned);
  return isNaN(v) ? 0 : Math.round(v * 100);
}

// ---- Seed ----
const seedOnce = () => {
  const seeded = LS.get("lv_seeded", false);
  if (seeded) return;

  const users: User[] = [
    { id: 1, name: "Admin LV", email: "admin@padarialv.com", roles: ["manager"], password: "123456", is_active: true },
    { id: 2, name: "Caixa 1", email: "caixa@padarialv.com", roles: ["cashier"], password: "123456", is_active: true },
    { id: 3, name: "Estoquista", email: "estoque@padarialv.com", roles: ["stockist"], password: "123456", is_active: true },
  ];

  const now = todayStr();
  const products: Product[] = [
    { id: 1, name: "Pão Francês", description: "Casquinha crocante", price_cents: 90, quantity: 200, expires_at: new Date(Date.now()+24*3600*1000).toISOString(), category: "paes", is_active: true, image_url: "https://experts.nita.com.br/img/posts/9052e329ff0fc509b905a5c63f1f80325e29d29d.jpg", created_at: now, updated_at: now },
    { id: 2, name: "Bolo de Cenoura", description: "Cobertura de chocolate", price_cents: 3500, quantity: 10, expires_at: new Date(Date.now()+5*24*3600*1000).toISOString(), category: "bolos", is_active: true, image_url: "https://recipesblob.oetker.com.br/assets/11ed1b54a18b427ea8e7f7d141f0a34d/1272x764/bolo_cenoura_horizontal.webp", created_at: now, updated_at: now },
    { id: 3, name: "Sonho", description: "Recheio de creme", price_cents: 1200, quantity: 20, expires_at: new Date(Date.now()+2*24*3600*1000).toISOString(), category: "doces", is_active: true, image_url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQHLvp2jBTVjO3k8BwdAESo0MNp7hn9jQ3YoQ&s", created_at: now, updated_at: now },
    { id: 4, name: "Pão Italiano", description: "Miolo macio", price_cents: 1890, quantity: 40, expires_at: new Date(Date.now()-1*24*3600*1000).toISOString(), category: "paes", is_active: true, image_url: "https://i.panelinha.com.br/i1/bk-9294-pao-italiano-caseiro.webp", created_at: now, updated_at: now },
  ];

  LS.set("lv_users", users);
  LS.set("lv_products", products);
  LS.set("lv_sales", [] as Sale[]);
  LS.set("lv_contacts", [] as ContactMessage[]);
  LS.set("lv_seeded", true);
};

// ---- Fake API (simula backend) ----
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const api = {
  async login(email: string, password: string) {
    await delay(400);
    const users = LS.get<User[]>("lv_users", []);
    const u = users.find(x => x.email === email && x.password === password && x.is_active);
    if (!u) throw new Error("Credenciais inválidas");
    const token = btoa(`${u.id}:${Date.now()}`);
    LS.set("lv_access", { token, userId: u.id, at: Date.now() });
    return u;
  },
  logout() {
    localStorage.removeItem("lv_access");
  },
  me(): User | null {
    const acc = LS.get<{ token: string; userId: number } | null>("lv_access", null);
    if (!acc) return null;
    const users = LS.get<User[]>("lv_users", []);
    return users.find(u => u.id === acc.userId) || null;
  },

  // Products
  async listProducts(onlyActive = false): Promise<Product[]> {
    await delay(250);
    const data = LS.get<Product[]>("lv_products", []);
    return onlyActive ? data.filter(p => p.is_active) : data;
  },
  async upsertProduct(input: Partial<Product> & { id?: number }): Promise<Product> {
    await delay(250);
    const list = LS.get<Product[]>("lv_products", []);
    const now = todayStr();
    if (input.id) {
      const idx = list.findIndex(p => p.id === input.id);
      if (idx >= 0) {
        const updated = { ...list[idx], ...input, updated_at: now } as Product;
        list[idx] = updated;
        LS.set("lv_products", list);
        return updated;
      }
    }
    const id = (list.at(-1)?.id ?? 0) + 1;
    const created: Product = {
      id,
      name: input.name || "Produto",
      description: input.description || "",
      price_cents: input.price_cents ?? 0,
      cost_cents: input.cost_cents ?? null,
      quantity: input.quantity ?? 0,
      expires_at: input.expires_at ?? null,
      category: (input.category as any) ?? "outros",
      is_active: input.is_active ?? true,
      image_url: input.image_url || "",
      created_at: now,
      updated_at: now,
    };
    list.push(created);
    LS.set("lv_products", list);
    return created;
  },
  async deleteProduct(id: number) {
    await delay(200);
    const list = LS.get<Product[]>("lv_products", []);
    LS.set("lv_products", list.filter(p => p.id !== id));
  },

  // Sales
  async createSale(payload: { items: { product_id: number; qty: number }[]; discount_cents?: number; payment_method: Sale["payment_method"] }): Promise<Sale> {
    await delay(300);
    const products = LS.get<Product[]>("lv_products", []);
    const sales = LS.get<Sale[]>("lv_sales", []);

    const items: SaleItem[] = payload.items.map((it, i) => {
      const prod = products.find(p => p.id === it.product_id);
      if (!prod) throw new Error("Produto não encontrado");
      if (prod.quantity < it.qty) throw new Error(`Estoque insuficiente de ${prod.name}`);
      const subtotal = prod.price_cents * it.qty;
      return { id: i + 1, product_id: prod.id, qty: it.qty, unit_price_cents: prod.price_cents, subtotal_cents: subtotal };
    });

    const total = items.reduce((s, it) => s + it.subtotal_cents, 0) - (payload.discount_cents || 0);
    const me = api.me();
    const sale: Sale = {
      id: (sales.at(-1)?.id ?? 0) + 1,
      cashier_id: me?.id || 0,
      total_cents: Math.max(0, total),
      discount_cents: payload.discount_cents || 0,
      paid_cents: Math.max(0, total),
      payment_method: payload.payment_method,
      issued_at: todayStr(),
      receipt_code: `LV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      items,
    };

    // decrementa estoque
    const updatedProducts = products.map(p => {
      const it = items.find(i => i.product_id === p.id);
      return it ? { ...p, quantity: p.quantity - it.qty, updated_at: todayStr() } : p;
    });

    sales.push(sale);
    LS.set("lv_sales", sales);
    LS.set("lv_products", updatedProducts);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("lv:sales-change"));
    }

    return sale;
  },

  // Contacts (público)
  async sendContact(input: Omit<ContactMessage, "id" | "created_at">) {
    await delay(250);
    const list = LS.get<ContactMessage[]>("lv_contacts", []);
    const msg: ContactMessage = { id: (list.at(-1)?.id ?? 0) + 1, created_at: todayStr(), ...input };
    list.push(msg);
    LS.set("lv_contacts", list);
    return msg;
  },
};

// ---- UI Primitives ----
const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`rounded-2xl shadow-sm border border-amber-200/60 bg-amber-50/40 ${className || ""}`}>{children}</div>
);

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }>
= ({ className = "", variant = "primary", ...props }) => {
  const base = "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition";
  const styles = {
    primary: "bg-amber-600 hover:bg-amber-700 text-white",
    ghost: "bg-transparent hover:bg-amber-100 text-amber-900",
    danger: "bg-red-600 hover:bg-red-700 text-white",
  }[variant];
  return <button className={`${base} ${styles} ${className}`} {...props} />;
};

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = "", ...props }) => (
  <input className={`w-full px-3 py-2 rounded-xl border border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white ${className}`} {...props} />
);
const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className = "", ...props }) => (
  <textarea className={`w-full px-3 py-2 rounded-xl border border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white ${className}`} {...props} />
);

const Badge: React.FC<{ children: React.ReactNode; tone?: "ok" | "warn" | "danger" }>
= ({ children, tone = "ok" }) => {
  const colors = { ok: "bg-emerald-100 text-emerald-800", warn: "bg-amber-100 text-amber-800", danger: "bg-red-100 text-red-800" }[tone];
  return <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${colors}`}>{children}</span>;
};

// ---- App ----
const tabsPublic = [
  { key: "home", label: "Início", icon: Home },
  { key: "cardapio", label: "Cardápio", icon: Cookie },
  { key: "sobre", label: "Sobre", icon: Info },
  { key: "localizacao", label: "Localização", icon: MapPin },
  { key: "contato", label: "Contato", icon: Mail },
];

const tabsAdmin = [
  { key: "dash", label: "Dashboard", icon: ChartBar },
  { key: "produtos", label: "Produtos", icon: ChefHat },
  { key: "pedidos", label: "Pedidos", icon: ShoppingCart },
  { key: "vendas", label: "Vendas", icon: ReceiptText },
  { key: "usuarios", label: "Usuários", icon: Users },
  { key: "fechamento", label: "Fechamento", icon: Settings2 },
];

export default function App() {
  resetLocalStorageOnLoad();
  const [section, setSection] = useState<"public" | "admin">("public");
  const [pubTab, setPubTab] = useState<string>("home");
  const [admTab, setAdmTab] = useState<string>("dash");
  const [me, setMe] = useState<User | null>(null);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  useEffect(() => { seedOnce(); setMe(api.me()); }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const logout = () => { api.logout(); setMe(null); setToast({ type: "ok", msg: "Sessão encerrada." }); };

  const Theme: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 text-amber-950">
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <img className="w-10 h-10 rounded-xl" src="https://s3.tebi.io/brumatti-bucket/padariaLvLogoTransparente.png" alt="Padaria LV Logo" />
            <div>
              <h1 className="text-xl md:text-2xl font-extrabold">Padaria LV</h1>
              <p className="text-xs md:text-sm text-amber-700">Aconchego artesanal desde 2025</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {section === "public" ? (
              <Button variant="primary" onClick={() => setSection("admin")}><LogIn size={16}/> Painel</Button>
            ) : (
              <>
                {me ? (
                  <>
                    <span className="text-sm mr-2">Olá, <strong>{me.name}</strong></span>
                    <Button variant="ghost" onClick={() => setSection("public")}><Home size={16}/> Site</Button>
                    <Button variant="danger" onClick={logout}><LogOut size={16}/> Sair</Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => setSection("public")}><Home size={16}/> Site</Button>
                  </>
                )}
              </>
            )}
          </div>
        </header>
        {children}
      </div>
      <footer className="text-center py-8 text-sm text-amber-700">© {new Date().getFullYear()} Padaria LV — Demo offline</footer>
    </div>
  );

  return (
    <Theme>
      {section === "public" ? (
        <PublicArea tab={pubTab} setTab={setPubTab} notify={setToast} />
      ) : me ? (
        <AdminArea me={me} tab={admTab} setTab={setAdmTab} notify={setToast} />
      ) : (
        <Login onSuccess={(u) => { setMe(u); setAdmTab("dash"); setToast({ type: "ok", msg: "Login realizado!" }); }} notify={setToast} />
      )}

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl shadow ${toast.type === "ok" ? "bg-emerald-600" : "bg-red-600"} text-white`}>{toast.msg}</motion.div>
        )}
      </AnimatePresence>
    </Theme>
  );
}

// ---- Public Area ----
const PublicArea: React.FC<{ tab: string; setTab: (t: string) => void; notify: (t: any) => void }> = ({ tab, setTab, notify }) => {
  return (
    <div>
      <nav className="flex gap-2 mb-6 flex-wrap">
        {tabsPublic.map(t => (
          <Button key={t.key} variant={tab === t.key ? "primary" : "ghost"} onClick={() => setTab(t.key)}>
            {React.createElement(t.icon, { size: 16 })} {t.label}
          </Button>
        ))}
      </nav>
      <Card className="p-6">
        {tab === "home" && <HomeHero setTab={setTab} />}
        {tab === "cardapio" && <MenuList notify={notify} />}
        {tab === "sobre" && <AboutSection />}
        {tab === "localizacao" && <LocationSection />}
        {tab === "contato" && <ContactForm notify={notify} />}
      </Card>
    </div>
  );
};

const HomeHero: React.FC<{ setTab: (t: string) => void }> = ({ setTab }) => (
  <div className="grid md:grid-cols-2 gap-6 items-center">
    <div>
      <h2 className="text-3xl md:text-4xl font-extrabold mb-3">Pães quentinhos, café passado na hora.</h2>
      <p className="text-amber-800 mb-4">Sinta o aroma do forno e o aconchego da Padaria LV — a sua parada diária para sabores artesanais.</p>
      <div className="flex gap-2">
        <button onClick={() => setTab("cardapio")} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white">
          <ShoppingCart size={16}/> Peça agora
        </button>
        <button onClick={() => setTab("sobre")} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-transparent border border-amber-300 hover:bg-amber-100">
          <Info size={16}/> Conheça a LV
        </button>
      </div>
    </div>
    <img alt="Pães artesanais" className="w-full rounded-2xl object-cover aspect-[4/3]" src="https://s3.tebi.io/brumatti-bucket/padariaLvLogoTransparente.png" />
  </div>
);

const MenuList: React.FC<{ notify: (t:any) => void }> = ({ notify }) => {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Product[]>([]);
  const [basket, setBasket] = useState<{ product: Product; qty: number }[]>([]);
  const [method, setMethod] = useState<Sale["payment_method"]>("pix");

  useEffect(() => { api.listProducts(true).then(p => { setItems(p); setLoading(false); }); }, []);

  const filtered = items.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));

  const add = (p: Product) => {
    setBasket(prev => {
      const found = prev.find(b => b.product.id === p.id);
      if (found) return prev.map(b => b.product.id === p.id ? { ...b, qty: Math.min(b.qty + 1, p.quantity) } : b);
      return [...prev, { product: p, qty: 1 }];
    });
  };

  const changeQty = (productId: number, qty: number) => {
    setBasket(prev => prev.map(b => b.product.id === productId ? { ...b, qty: Math.max(1, Math.min(qty, b.product.quantity)) } : b));
  };

  const remove = (productId: number) => setBasket(prev => prev.filter(b => b.product.id !== productId));

  const itemsForApi = basket.map(b => ({ product_id: b.product.id, qty: b.qty }));
  const total = basket.reduce((s,b) => s + b.product.price_cents * b.qty, 0);

  const checkout = async () => {
    if (basket.length === 0) return;
    try {
      setLoading(true);
      const sale = await api.createSale({ items: itemsForApi, payment_method: method });
      setBasket([]);
      const updated = await api.listProducts(true);
      setItems(updated);
      notify({ type: "ok", msg: `Pedido ${sale.receipt_code} realizado!` });
    } catch (e:any) {
      notify({ type: "err", msg: e.message || "Erro ao finalizar pedido" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        <div className="flex items-center gap-2 mb-4">
          <Search size={16} />
          <Input placeholder="Buscar no cardápio..." value={q} onChange={(e)=>setQ(e.target.value)} />
        </div>
        {loading ? (
          <p>Carregando...</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(p => (
              <Card key={p.id} className="overflow-hidden">
                <img src={p.image_url} alt={p.name} className="w-full aspect-[4/3] object-cover" />
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{p.name}</h3>
                    <span className="font-bold">{fmtBRL(p.price_cents)}</span>
                  </div>
                  <p className="text-sm text-amber-800/90 line-clamp-2">{p.description}</p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="text-xs text-amber-700">Qtd: {p.quantity}</div>
                    <div className="flex items-center gap-2">
                      <Button variant="primary" onClick={() => add(p)}>Adicionar</Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card className="p-4">
        <h4 className="font-semibold mb-3">Carrinho</h4>
        {basket.length === 0 && <p className="text-sm text-amber-700">Nenhum item.</p>}
        {basket.map(b => (
          <div key={b.product.id} className="flex items-center justify-between gap-2 mb-2">
            <div>
              <div className="font-medium">{b.product.name}</div>
              <div className="text-xs text-amber-700">{fmtBRL(b.product.price_cents)} x {b.qty}</div>
            </div>
            <div className="flex items-center gap-2">
              <Input type="number" className="w-20" value={b.qty} onChange={e => changeQty(b.product.id, Number(e.target.value))} />
              <div className="w-24 text-right font-semibold">{fmtBRL(b.product.price_cents * b.qty)}</div>
              <Button variant="danger" onClick={() => remove(b.product.id)}><Trash size={14}/></Button>
            </div>
          </div>
        ))}

        <div className="grid gap-2">
          <div>
            <label className="text-xs">Pagamento</label>
            <select className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white" value={method} onChange={e=>setMethod(e.target.value as any)}>
              <option value="pix">PIX</option>
              <option value="card">Cartão</option>
              <option value="cash">Dinheiro</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm text-amber-800">Total</div>
            <div className="text-xl font-extrabold">{fmtBRL(Math.max(0, total))}</div>
          </div>
          <div className="flex justify-end">
            <Button onClick={checkout} disabled={basket.length===0 || loading}><CheckCircle2 size={16}/> {loading ? "Processando..." : "Finalizar pedido"}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

const AboutSection = () => (
  <div className="prose max-w-none">
    <h3>Sobre a Padaria LV</h3>
    <p>A Padaria LV nasceu da amizade entre Vitor e Luis, unindo técnicas artesanais, ingredientes de qualidade e um atendimento acolhedor. Nossa missão é levar aconchego em forma de pão.</p>
    <ul>
      <li>Ingredientes selecionados</li>
      <li>Produção diária</li>
      <li>Receitas de família</li>
    </ul>
  </div>
);

const LocationSection = () => (
  <div className="grid md:grid-cols-2 gap-4">
    <div>
      <h3 className="font-semibold mb-2">Onde estamos</h3>
      <p>Rua do Trigo, 123 – Centro, Sua Cidade</p>
      <p>Horário: Seg–Sáb 6h–19h, Dom 7h–13h</p>
      <p>Telefone: (11) 99999-9999</p>
    </div>
    <iframe title="Mapa" className="w-full rounded-2xl h-64" src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3656.860073232909!2d-46.6623253!3d-23.5733056!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x94ce59c88f3c3dcb%3A0x8b1ee0d3e3e7be6f!2sPadaria!5e0!3m2!1spt-BR!2sbr!4v1700000000000" loading="lazy" />
  </div>
);

const ContactForm: React.FC<{ notify: (t:any)=>void }> = ({ notify }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit() {
    try {
      setLoading(true);
      await api.sendContact({ name, email, message });
      setName(""); setEmail(""); setMessage("");
      notify({ type: "ok", msg: "Mensagem enviada! (armazenada localmente)" });
    } catch (e:any) { notify({ type: "err", msg: e.message || "Erro ao enviar" }); }
    finally { setLoading(false); }
  }
  return (
    <div className="max-w-xl space-y-3">
      <Input placeholder="Seu nome" value={name} onChange={e=>setName(e.target.value)} />
      <Input placeholder="Seu e‑mail" type="email" value={email} onChange={e=>setEmail(e.target.value)} />
      <TextArea placeholder="Mensagem" rows={4} value={message} onChange={e=>setMessage(e.target.value)} />
      <Button onClick={submit} disabled={loading}><Mail size={16}/> {loading?"Enviando...":"Enviar"}</Button>
    </div>
  );
};

// ---- Login ----
const Login: React.FC<{ onSuccess: (u: User)=>void; notify: (t:any)=>void }> = ({ onSuccess, notify }) => {
  const [email, setEmail] = useState("admin@padarialv.com");
  const [password, setPassword] = useState("123456");
  const [loading, setLoading] = useState(false);
  async function submit() {
    try { setLoading(true); const u = await api.login(email, password); onSuccess(u); }
    catch (e:any) { notify({ type: "err", msg: e.message || "Falha no login" }); }
    finally { setLoading(false); }
  }
  return (
    <div className="max-w-md mx-auto">
      <Card className="p-6 space-y-3">
        <h3 className="text-lg font-semibold mb-2">Acesso ao Painel</h3>
        <Input placeholder="E‑mail" value={email} onChange={e=>setEmail(e.target.value)} />
        <Input placeholder="Senha" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        <Button onClick={submit} disabled={loading}><LogIn size={16}/> {loading?"Entrando...":"Entrar"}</Button>
        <p className="text-xs text-amber-700">Demo: admin@padarialv.com / 123456</p>
      </Card>
    </div>
  );
};

// ---- Admin Area ----
const AdminArea: React.FC<{ me: User; tab: string; setTab: (t:string)=>void; notify: (t:any)=>void }> = ({ me, tab, setTab, notify }) => {
  return (
    <div className="grid md:grid-cols-[220px,1fr] gap-6">
      <aside className="space-y-2">
        {tabsAdmin.map(t => (
          <Button key={t.key} variant={tab===t.key?"primary":"ghost"} onClick={()=>setTab(t.key)} className="w-full justify-start">
            {React.createElement(t.icon, { size: 16 })} {t.label}
          </Button>
        ))}
      </aside>
      <main>
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
            {tab === "dash" && <Dashboard />}
            {tab === "produtos" && <Products notify={notify} />}
            {tab === "pedidos" && <OrdersBoard />}
            {tab === "vendas" && <Sales notify={notify} />}
            {tab === "usuarios" && <UsersPage />}
            {tab === "fechamento" && <Closing notify={notify} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: string; icon: any }> = ({ title, value, icon }) => (
  <Card className="p-4">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-amber-800/80">{title}</p>
        <p className="text-2xl font-extrabold">{value}</p>
      </div>
      {React.createElement(icon, { size: 28 })}
    </div>
  </Card>
);

const Dashboard = () => {
  const products = LS.get<Product[]>("lv_products", []);
  const sales = LS.get<Sale[]>("lv_sales", []);
  const today = new Date().toISOString().slice(0,10);
  const vendasHoje = sales.filter(s => s.issued_at.slice(0,10)===today).reduce((s,x)=>s+x.total_cents,0);
  const lucroSemanal = sales.slice(-10).reduce((s,x)=>s + Math.round(x.total_cents*0.25), 0);
  const aVencer = products.filter(p => statusValidade(p) !== "ok").slice(0,5);

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <StatCard title="Vendas de hoje" value={fmtBRL(vendasHoje)} icon={Coffee} />
        <StatCard title="Lucro semanal (est.)" value={fmtBRL(lucroSemanal)} icon={ChartBar} />
        <StatCard title="Itens a observar" value={`${aVencer.length}`} icon={AlertTriangle} />
      </div>
      <Card className="p-4">
        <h4 className="font-semibold mb-3">Vencidos / a vencer</h4>
        <div className="flex flex-wrap gap-2">
          {aVencer.map(p => (
            <div key={p.id} className="px-3 py-2 rounded-xl bg-white border border-amber-200">
              <span className="font-medium mr-2">{p.name}</span>
              {statusValidade(p) === "vencido" ? <Badge tone="danger">vencido</Badge> : <Badge tone="warn">a vencer</Badge>}
            </div>
          ))}
          {aVencer.length===0 && <p className="text-sm text-amber-700">Tudo ok no estoque 🎉</p>}
        </div>
      </Card>
    </div>
  );
};

const Products: React.FC<{ notify:(t:any)=>void }> = ({ notify }) => {
  const [list, setList] = useState<Product[]>(LS.get<Product[]>("lv_products", []));
  const [editing, setEditing] = useState<Product | null>(null);
  const [q, setQ] = useState("");

  // novo estado para string do preço (exibe em reais, aceita vírgula/ponto)
  const [priceStr, setPriceStr] = useState("");

  useEffect(() => {
    // quando abre/fecha o editor, inicializa/limpa priceStr a partir de editing
    if (editing) {
      setPriceStr(formatCentsToLocale(editing.price_cents ?? 0));
    } else {
      setPriceStr("");
    }
  }, [editing]);

  const filtered = useMemo(() => list.filter(p => p.name.toLowerCase().includes(q.toLowerCase())), [list, q]);

  const startEdit = (p?: Product) => setEditing(p ?? { id: 0, name: "", description: "", price_cents: 0, quantity: 0, expires_at: null, category: "outros", is_active: true, created_at: todayStr(), updated_at: todayStr() });

  const save = async () => {
    if (!editing) return;
    const saved = await api.upsertProduct(editing);
    const updated = await api.listProducts(false);
    setList(updated);
    setEditing(null);
    notify({ type: "ok", msg: `Produto ${saved.name} salvo` });
  };
  const del = async (id: number) => { await api.deleteProduct(id); setList(await api.listProducts(false)); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input placeholder="Buscar produto..." value={q} onChange={e=>setQ(e.target.value)} />
        <Button onClick={()=>startEdit()}><Plus size={16}/> Novo</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2">Nome</th>
              <th>Preço</th>
              <th>Qtd</th>
              <th>Validade</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="border-b">
                <td className="py-2 font-medium">{p.name}</td>
                <td>{fmtBRL(p.price_cents)}</td>
                <td>{p.quantity}</td>
                <td>{p.expires_at ? new Date(p.expires_at).toLocaleDateString() : "—"}</td>
                <td>{statusValidade(p) === "vencido" ? <Badge tone="danger">vencido</Badge> : statusValidade(p) === "a_vencer" ? <Badge tone="warn">a vencer</Badge> : <Badge tone="ok">ok</Badge>}</td>
                <td className="text-right">
                  <div className="flex gap-2 justify-end py-2">
                    <Button variant="ghost" onClick={()=>startEdit(p)}><Edit size={16}/></Button>
                    <Button variant="danger" onClick={()=>del(p.id)}><Trash size={16}/></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 grid place-items-center p-4">
            <Card className="p-4 max-w-xl w-full bg-white">
              <h4 className="font-semibold mb-3">{editing.id?"Editar":"Novo"} Produto</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs">Nome</label>
                  <Input value={editing.name} onChange={e=>setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs">Preço (R$)</label>
                  <Input
                    value={priceStr}
                    onChange={e=>{
                      const v = e.target.value;
                      setPriceStr(v);
                      // atualiza price_cents no editing com parse robusto (aceita 1.234,56 / 12,34 / 12.34)
                      setEditing({ ...editing, price_cents: parseBRLToCents(v) });
                    }}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className="text-xs">Quantidade</label>
                  <Input type="number" value={editing.quantity} onChange={e=>setEditing({ ...editing, quantity: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs">Validade</label>
                  <Input type="date" value={editing.expires_at? editing.expires_at.slice(0,10):""} onChange={e=>setEditing({ ...editing, expires_at: e.target.value? new Date(e.target.value).toISOString(): null })} />
                </div>
                <div>
                  <label className="text-xs">Categoria</label>
                  <select className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white" value={editing.category} onChange={e=>setEditing({ ...editing, category: e.target.value as any })}>
                    <option value="paes">Pães</option>
                    <option value="bolos">Bolos</option>
                    <option value="doces">Doces</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs">Imagem (URL)</label>
                  <Input value={editing.image_url||""} onChange={e=>setEditing({ ...editing, image_url: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs">Descrição</label>
                  <TextArea rows={3} value={editing.description||""} onChange={e=>setEditing({ ...editing, description: e.target.value })} />
                </div>
                <div className="col-span-2 flex items-center gap-2 mt-2">
                  <input type="checkbox" checked={editing.is_active} onChange={e=>setEditing({ ...editing, is_active: e.target.checked })} />
                  <span className="text-sm">Ativo</span>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" onClick={()=>setEditing(null)}>Cancelar</Button>
                <Button onClick={save}><CheckCircle2 size={16}/> Salvar</Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Sales: React.FC<{ notify:(t:any)=>void }> = ({ notify }) => {
  const [products, setProducts] = useState<Product[]>(LS.get<Product[]>("lv_products", []));
  const [basket, setBasket] = useState<{ product_id:number; qty:number }[]>([]);
  const [method, setMethod] = useState<Sale["payment_method"]>("pix");
  const [discount, setDiscount] = useState(0);
  const [q, setQ] = useState("");

  useEffect(() => { setProducts(LS.get<Product[]>("lv_products", [])); }, [basket]);

  const add = (p: Product) => setBasket(prev => {
    const found = prev.find(i=>i.product_id===p.id);
    if (found) return prev.map(i => i.product_id===p.id ? { ...i, qty: i.qty+1 } : i);
    return [...prev, { product_id: p.id, qty: 1 }];
  });

  const remove = (id:number) => setBasket(prev => prev.filter(i=>i.product_id!==id));
  const changeQty = (id:number, qty:number) => setBasket(prev => prev.map(i=> i.product_id===id ? { ...i, qty: Math.max(1, qty)} : i));

  const items = basket.map(b => {
    const p = products.find(x => x.id===b.product_id)!;
    return { ...b, name: p.name, price_cents: p.price_cents, subtotal: p.price_cents * b.qty };
  });
  const total = items.reduce((s,i)=>s+i.subtotal,0) - discount;

  const checkout = async () => {
    try {
      const sale = await api.createSale({ items: basket, discount_cents: discount, payment_method: method });
      setBasket([]); setDiscount(0);
      setProducts(LS.get<Product[]>("lv_products", []));
      notify({ type: "ok", msg: `Venda ${sale.receipt_code} emitida` });
    } catch (e:any) { notify({ type: "err", msg: e.message || "Erro na venda" }); }
  };

  const filtered = products.filter(p => p.is_active && p.name.toLowerCase().includes(q.toLowerCase()) && (p.quantity>0));

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Search size={16} />
          <Input placeholder="Buscar produto..." value={q} onChange={e=>setQ(e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3 max-h-[420px] overflow-auto pr-1">
          {filtered.map(p => (
            <button key={p.id} onClick={()=>add(p)} className="text-left rounded-xl border bg-white hover:bg-amber-50 transition p-3">
              <div className="flex gap-3">
                <img src={p.image_url || ""} alt={p.name} className="w-16 h-16 object-cover rounded-lg" />
                <div>
                  <div className="font-medium leading-tight">{p.name}</div>
                  <div className="text-sm text-amber-800">{fmtBRL(p.price_cents)}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </Card>
      <Card className="p-4 space-y-3">
        <h4 className="font-semibold">Carrinho</h4>
        {items.length===0 && <p className="text-sm text-amber-700">Nenhum item.</p>}
        {items.map(it => (
          <div key={it.product_id} className="flex items-center justify-between gap-2">
            <div>
              <div className="font-medium">{it.name}</div>
              <div className="text-xs text-amber-700">{fmtBRL(it.price_cents)} x {it.qty}</div>
            </div>
            <div className="flex items-center gap-2">
              <Input type="number" className="w-20" value={it.qty} onChange={e=>changeQty(it.product_id, Number(e.target.value))} />
              <div className="w-24 text-right font-semibold">{fmtBRL(it.subtotal)}</div>
              <Button variant="danger" onClick={()=>remove(it.product_id)}><Trash size={14}/></Button>
            </div>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs">Desconto (centavos)</label>
            <Input type="number" value={discount} onChange={e=>setDiscount(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-xs">Pagamento</label>
            <select className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white" value={method} onChange={e=>setMethod(e.target.value as any)}>
              <option value="pix">PIX</option>
              <option value="card">Cartão</option>
              <option value="cash">Dinheiro</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm text-amber-800">Total</div>
          <div className="text-xl font-extrabold">{fmtBRL(Math.max(0,total))}</div>
        </div>
        <div className="flex justify-end">
          <Button onClick={checkout} disabled={items.length===0}><CheckCircle2 size={16}/> Finalizar</Button>
        </div>
      </Card>
    </div>
  );
};

const OrdersBoard = () => {
  type RangeFilter = "all" | "today" | "week";
  const orderSort = (list: Sale[]) => [...list].sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime());
  const [orders, setOrders] = useState<Sale[]>(() => orderSort(LS.get<Sale[]>("lv_sales", [])));
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<"all" | Sale["payment_method"]>("all");
  const [range, setRange] = useState<RangeFilter>("all");

  useEffect(() => {
    const sync = () => setOrders(orderSort(LS.get<Sale[]>("lv_sales", [])));
    sync();
    if (typeof window !== "undefined") {
      window.addEventListener("lv:sales-change", sync);
      window.addEventListener("storage", sync);
      return () => {
        window.removeEventListener("lv:sales-change", sync);
        window.removeEventListener("storage", sync);
      };
    }
    return () => {};
  }, []);

  const productMap = useMemo(() => {
    const map = new Map<number, string>();
    LS.get<Product[]>("lv_products", []).forEach(p => map.set(p.id, p.name));
    return map;
  }, [orders]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const weekAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();

  const totalsByMethod = orders.reduce((acc, order) => {
    acc[order.payment_method] += order.total_cents;
    return acc;
  }, { pix: 0, card: 0, cash: 0 } as Record<Sale["payment_method"], number>);

  const todayOrders = orders.filter(o => o.issued_at.slice(0,10) === todayKey);
  const totalValue = orders.reduce((sum, o) => sum + o.total_cents, 0);
  const todayValue = todayOrders.reduce((sum, o) => sum + o.total_cents, 0);
  const avgTicket = orders.length ? Math.round(totalValue / orders.length) : 0;
  const favoriteMethod = (Object.entries(totalsByMethod).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? "pix") as Sale["payment_method"];

  const methodLabels: Record<Sale["payment_method"], string> = { pix: "PIX", card: "Cartão", cash: "Dinheiro" };
  const methodTone: Record<Sale["payment_method"], "ok" | "warn" | "danger"> = { pix: "ok", card: "warn", cash: "danger" };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(order => {
      const hasQuery = !q ||
        order.receipt_code.toLowerCase().includes(q) ||
        order.items.some(item => (productMap.get(item.product_id) || "").toLowerCase().includes(q));
      const matchesMethod = methodFilter === "all" || order.payment_method === methodFilter;
      const issuedAt = new Date(order.issued_at).getTime();
      const matchesRange =
        range === "all"
          ? true
          : range === "today"
            ? order.issued_at.slice(0,10) === todayKey
            : issuedAt >= weekAgo;
      return hasQuery && matchesMethod && matchesRange;
    });
  }, [orders, productMap, search, methodFilter, range, todayKey, weekAgo]);

  const rangeOptions: { key: RangeFilter; label: string }[] = [
    { key: "all", label: "Todo período" },
    { key: "today", label: "Hoje" },
    { key: "week", label: "Últimos 7 dias" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        <StatCard title="Pedidos hoje" value={`${todayOrders.length}`} icon={ShoppingCart} />
        <StatCard title="Faturamento hoje" value={fmtBRL(todayValue)} icon={ReceiptText} />
        <StatCard title="Ticket médio" value={fmtBRL(avgTicket)} icon={ChartBar} />
      </div>
      <Card className="p-4 space-y-4">
        <div className="grid md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-xs flex items-center gap-2 mb-1"><Search size={14}/>Buscar</label>
            <Input placeholder="Código ou item do pedido" value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
          <div>
            <label className="text-xs">Pagamento</label>
            <select className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white" value={methodFilter} onChange={e=>setMethodFilter(e.target.value as "all" | Sale["payment_method"])}>
              <option value="all">Todos</option>
              <option value="pix">PIX</option>
              <option value="card">Cartão</option>
              <option value="cash">Dinheiro</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {rangeOptions.map(opt => (
            <button
              type="button"
              key={opt.key}
              onClick={() => setRange(opt.key)}
              className={`px-3 py-1 rounded-full border transition ${range===opt.key ? "bg-amber-600 text-white border-amber-600" : "border-amber-200 text-amber-800"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="space-y-3 max-h-[480px] overflow-auto pr-1">
          {filtered.map(order => (
            <div key={order.id} className="rounded-2xl border border-amber-200 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{order.receipt_code}</p>
                  <p className="text-xs text-amber-700">
                    #{order.id} · {new Date(order.issued_at).toLocaleDateString("pt-BR")} às {new Date(order.issued_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">{fmtBRL(order.total_cents)}</div>
                  <Badge tone={methodTone[order.payment_method]}>{methodLabels[order.payment_method]}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-amber-800">
                {order.items.map(item => (
                  <span key={`${order.id}-${item.product_id}-${item.id}`} className="px-2 py-1 rounded-xl border border-amber-100 bg-amber-50">
                    {item.qty}x {productMap.get(item.product_id) || `Produto ${item.product_id}`} · {fmtBRL(item.unit_price_cents)}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-amber-700">Nenhum pedido encontrado com os filtros atuais.</p>
          )}
        </div>
      </Card>
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div>
            <p className="text-xs text-amber-700">Pedidos registrados</p>
            <p className="font-semibold">{orders.length}</p>
          </div>
          <div>
            <p className="text-xs text-amber-700">Valor acumulado</p>
            <p className="font-semibold">{fmtBRL(totalValue)}</p>
          </div>
          <div>
            <p className="text-xs text-amber-700">Forma favorita</p>
            <p className="font-semibold">{methodLabels[favoriteMethod]}</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

const UsersPage = () => {
  const [list, setList] = useState<User[]>(LS.get<User[]>("lv_users", []));
  return (
    <Card className="p-4">
      <h4 className="font-semibold mb-2">Usuários (somente leitura nesta demo)</h4>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b"><th className="py-2">Nome</th><th>Email</th><th>Papéis</th><th>Status</th></tr>
          </thead>
          <tbody>
            {list.map(u => (
              <tr key={u.id} className="border-b">
                <td className="py-2">{u.name}</td>
                <td>{u.email}</td>
                <td>{u.roles.join(", ")}</td>
                <td>{u.is_active? <Badge tone="ok">ativo</Badge> : <Badge tone="danger">inativo</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

const Closing: React.FC<{ notify:(t:any)=>void }> = ({ notify }) => {
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [summary, setSummary] = useState<{ cash:number; card:number; pix:number; total:number } | null>(null);
  const run = () => {
    const sales = LS.get<Sale[]>("lv_sales", []);
    const filtered = sales.filter(s => s.issued_at.slice(0,10)===date);
    const agg = filtered.reduce((acc, s) => {
      acc[s.payment_method] += s.total_cents;
      acc.total += s.total_cents;
      return acc;
    }, { cash:0, card:0, pix:0, total:0 as number } as any);
    setSummary(agg);
    notify({ type: "ok", msg: "Fechamento gerado (simulado)" });
  };
  return (
    <Card className="p-4 space-y-3">
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs">Data</label>
          <Input type="date" value={date} onChange={e=>setDate(e.target.value)} />
        </div>
        <div className="md:col-span-2 flex items-end">
          <Button onClick={run}><Settings2 size={16}/> Rodar fechamento</Button>
        </div>
      </div>
      {summary && (
        <div className="grid sm:grid-cols-4 gap-3">
          <StatCard title="PIX" value={fmtBRL(summary.pix)} icon={Bot} />
          <StatCard title="Cartão" value={fmtBRL(summary.card)} icon={CreditCardIcon} />
          <StatCard title="Dinheiro" value={fmtBRL(summary.cash)} icon={CashIcon} />
          <StatCard title="Total" value={fmtBRL(summary.total)} icon={ChartBar} />
        </div>
      )}
    </Card>
  );
};

// simple icon fallbacks
const CreditCardIcon = (props:any) => <svg viewBox="0 0 24 24" width={props.size||24} height={props.size||24} className="text-amber-900"><rect x="2" y="5" width="20" height="14" rx="2" ry="2" fill="currentColor" opacity="0.15"/><rect x="2" y="5" width="20" height="14" rx="2" ry="2" stroke="currentColor" fill="none"/><rect x="2" y="9" width="20" height="2" fill="currentColor"/></svg>
const CashIcon = (props:any) => <svg viewBox="0 0 24 24" width={props.size||24} height={props.size||24} className="text-amber-900"><rect x="3" y="6" width="18" height="12" rx="2" ry="2" fill="currentColor" opacity="0.15"/><rect x="3" y="6" width="18" height="12" rx="2" ry="2" stroke="currentColor" fill="none"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>
