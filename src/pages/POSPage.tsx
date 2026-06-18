import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, Package,
  Tag, ChevronRight, ScanLine, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/lib/utils';
import type { CartItem, Category, Product, StoreSettings } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import PaymentModal from '@/components/pos/PaymentModal';
import ReceiptModal from '@/components/pos/ReceiptModal';

export default function POSPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<{ id: string; orderNumber: string } | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterProducts();
  }, [products, selectedCategory, searchQuery]);

  const loadData = async () => {
    setLoading(true);
    const [catRes, prodRes, settRes] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('products').select('*, category:categories(*)').eq('is_active', true).order('name'),
      supabase.from('store_settings').select('*').maybeSingle(),
    ]);
    setCategories(Array.isArray(catRes.data) ? catRes.data : []);
    setProducts(Array.isArray(prodRes.data) ? prodRes.data : []);
    setSettings(settRes.data);
    setLoading(false);
  };

  const filterProducts = () => {
    let filtered = products;
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(p => p.category_id === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.barcode || '').includes(q)
      );
    }
    setFilteredProducts(filtered);
  };

  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      toast.error(`${product.name}: สินค้าหมด`);
      return;
    }
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          toast.warning(`${product.name}: สต็อกมีแค่ ${product.stock} ชิ้น`);
          return prev;
        }
        return prev.map(i =>
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unit_price }
            : i
        );
      }
      return [...prev, { product, quantity: 1, unit_price: product.price, subtotal: product.price }];
    });
  };

  const updateQty = (productId: string, qty: number) => {
    if (qty <= 0) { removeFromCart(productId); return; }
    setCart(prev =>
      prev.map(i => {
        if (i.product.id !== productId) return i;
        const maxQty = i.product.stock;
        const newQty = Math.min(qty, maxQty);
        if (qty > maxQty) toast.warning(`${i.product.name}: สต็อกมีแค่ ${maxQty} ชิ้น`);
        return { ...i, quantity: newQty, subtotal: newQty * i.unit_price };
      })
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(i => i.product.id !== productId));
  };

  const clearCart = () => setCart([]);

  const taxRate = settings?.tax_rate || 0;
  const subtotal = cart.reduce((s, i) => s + i.subtotal, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const handleBarcodeScan = (barcode: string) => {
    const product = products.find(p => p.barcode === barcode || p.sku === barcode);
    if (product) {
      addToCart(product);
      setSearchQuery('');
      toast.success(`${t('pos.addedToCart')} ${product.name}`);
    } else {
      toast.error(`${t('pos.barcodeNotFound')}: ${barcode}`);
    }
  };

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      handleBarcodeScan(searchQuery.trim());
    }
  };

  const handlePaymentSuccess = (txId: string, orderNumber: string) => {
    setShowPayment(false);
    setLastTransaction({ id: txId, orderNumber });
    setCart([]);
    loadData(); // refresh stock
    setShowReceipt(true);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-0 h-[calc(100vh-3.5rem)] -m-4 md:-m-6 overflow-hidden">
      {/* Left: Products */}
      <div className="flex-1 min-w-0 flex flex-col border-r border-border overflow-hidden">
        {/* Search & Filter bar */}
        <div className="p-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKey}
                placeholder={t('pos.searchPlaceholder')}
                className="pl-9 pr-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Button variant="outline" size="icon" title={t('pos.scanBarcode')} onClick={() => searchRef.current?.focus()}>
              <ScanLine className="w-4 h-4" />
            </Button>
          </div>
          {/* Category tabs */}
          <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap pb-1">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shrink-0 min-h-8 ${
                selectedCategory === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-muted'
              }`}
            >
              ทั้งหมด
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shrink-0 min-h-8 ${
                  selectedCategory === cat.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-muted'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-32 bg-muted rounded-xl" />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16">
              <Package className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">{t('pos.noProducts')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProducts.map(product => {
                const inCart = cart.find(i => i.product.id === product.id);
                return (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    disabled={product.stock <= 0}
                    className={`relative text-left rounded-xl border transition-all duration-150 p-3 flex flex-col gap-2
                      ${product.stock <= 0
                        ? 'opacity-50 cursor-not-allowed border-border bg-muted'
                        : inCart
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border bg-card hover:border-primary/50 hover:shadow-sm active:scale-[0.98]'
                      }`}
                  >
                    {/* Image / placeholder */}
                    <div className="aspect-square w-full rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <Tag className="w-8 h-8 text-muted-foreground opacity-40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground line-clamp-2 text-balance leading-snug">{product.name}</p>
                      <p className="text-sm font-bold text-primary mt-1">{formatCurrency(product.price)}</p>
                      <p className={`text-xs mt-0.5 ${product.stock <= 5 ? 'text-warning' : 'text-muted-foreground'}`}>
                        {t('pos.stockLeft')}: {product.stock}
                      </p>
                    </div>
                    {inCart && (
                      <Badge className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs h-5 min-w-5 px-1.5">
                        {inCart.quantity}
                      </Badge>
                    )}
                    {product.stock <= 0 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-xl">
                        <Badge variant="secondary" className="text-xs bg-destructive/10 text-destructive">หมด</Badge>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-full lg:w-80 xl:w-96 shrink-0 flex flex-col bg-card border-t lg:border-t-0 border-border max-h-[45vh] lg:max-h-none">
        {/* Cart header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">{t('pos.cart')}</span>
            {cart.length > 0 && (
              <Badge className="bg-primary text-primary-foreground text-xs">{cart.length}</Badge>
            )}
          </div>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearCart} className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-2">
              <Trash2 className="w-4 h-4 mr-1" />
              <span className="text-xs">{t('pos.clear')}</span>
            </Button>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
              <ShoppingCart className="w-10 h-10 mb-2 opacity-20" />
              <p className="text-sm">{t('pos.emptyCart')}</p>
              <p className="text-xs mt-1">{t('pos.clickToAdd')}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {cart.map(item => (
                <div key={item.product.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-1">{item.product.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(item.unit_price)} / {t('pos.perUnit')}</p>
                    <p className="text-sm font-semibold text-primary mt-1">{formatCurrency(item.subtotal)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="icon"
                      className="w-7 h-7"
                      onClick={() => updateQty(item.product.id, item.quantity - 1)}
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="w-7 text-center text-sm font-semibold">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="w-7 h-7"
                      onClick={() => updateQty(item.product.id, item.quantity + 1)}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => removeFromCart(item.product.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cart Summary + Pay button */}
        <div className="border-t border-border bg-card shrink-0 p-4 space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{t('pos.subtotal')}</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {taxRate > 0 && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{t('pos.taxVat')} {taxRate}%</span>
              <span>{formatCurrency(taxAmount)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between font-bold text-foreground text-lg">
            <span>{t('pos.grandTotal')}</span>
            <span className="text-primary">{formatCurrency(total)}</span>
          </div>
          <Button
            className="w-full h-12 text-base font-semibold mt-2"
            disabled={cart.length === 0}
            onClick={() => setShowPayment(true)}
          >
            <ShoppingCart className="w-5 h-5 mr-2" />
            {t('pos.checkout')}
            {cart.length > 0 && <ChevronRight className="w-4 h-4 ml-1" />}
          </Button>
        </div>
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          cart={cart}
          subtotal={subtotal}
          taxAmount={taxAmount}
          total={total}
          taxRate={taxRate}
          cashierId={profile?.id || ''}
          onSuccess={handlePaymentSuccess}
          onClose={() => setShowPayment(false)}
        />
      )}

      {/* Receipt Modal */}
      {showReceipt && lastTransaction && (
        <ReceiptModal
          transactionId={lastTransaction.id}
          orderNumber={lastTransaction.orderNumber}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </div>
  );
}
