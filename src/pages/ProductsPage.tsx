import { useEffect, useState, useRef } from 'react';
import { Plus, Search, Pencil, Trash2, Package, X, Filter, Camera, ImageIcon, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/lib/utils';
import type { Category, Product } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const productSchema = z.object({
  name: z.string().min(1, 'กรอกชื่อสินค้า'),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  category_id: z.string().optional(),
  price: z.coerce.number().min(0, 'ราคาต้องไม่ติดลบ'),
  cost: z.coerce.number().min(0, 'ต้นทุนต้องไม่ติดลบ'),
  stock: z.coerce.number().int().min(0, 'สต็อกต้องไม่ติดลบ'),
  image_url: z.string().url('URL รูปไม่ถูกต้อง').or(z.literal('')).optional(),
  is_active: z.boolean(),
});
type ProductForm = z.infer<typeof productSchema>;

export default function ProductsPage() {
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  // Image upload state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: '', sku: '', barcode: '', price: 0, cost: 0, stock: 0, image_url: '', is_active: true },
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [prodRes, catRes] = await Promise.all([
      supabase.from('products').select('*, category:categories(id, name)').order('name'),
      supabase.from('categories').select('*').order('sort_order'),
    ]);
    setProducts(Array.isArray(prodRes.data) ? prodRes.data as Product[] : []);
    setCategories(Array.isArray(catRes.data) ? catRes.data as Category[] : []);
    setLoading(false);
  };

  const filtered = products.filter(p => {
    const matchSearch = search === '' || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === 'all' || p.category_id === filterCat;
    return matchSearch && matchCat;
  });

  const openCreate = () => {
    setEditProduct(null);
    setImagePreview(null);
    setImageFile(null);
    form.reset({ name: '', sku: '', barcode: '', price: 0, cost: 0, stock: 0, image_url: '', is_active: true });
    setShowForm(true);
  };

  const openEdit = (product: Product) => {
    setEditProduct(product);
    setImagePreview(product.image_url || null);
    setImageFile(null);
    form.reset({
      name: product.name,
      sku: product.sku || '',
      barcode: product.barcode || '',
      category_id: product.category_id || undefined,
      price: product.price,
      cost: product.cost,
      stock: product.stock,
      image_url: product.image_url || '',
      is_active: product.is_active,
    });
    setShowForm(true);
  };

  // Handle file selection from gallery or camera
  const handleFileSelect = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('รูปภาพต้องมีขนาดไม่เกิน 5MB');
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    form.setValue('image_url', '');
  };

  // Upload image to Supabase Storage
  const uploadImage = async (productId: string): Promise<string | null> => {
    if (!imageFile) return null;
    setUploadingImage(true);
    const ext = imageFile.name.split('.').pop() ?? 'jpg';
    const fileName = `${Date.now()}.${ext}`;
    const filePath = `products/${productId}/${fileName}`;
    const { error } = await supabase.storage
      .from('product-images')
      .upload(filePath, imageFile, { contentType: imageFile.type, upsert: true });
    setUploadingImage(false);
    if (error) {
      toast.error('อัปโหลดรูปไม่สำเร็จ: ' + error.message);
      return null;
    }
    const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(filePath);
    return urlData.publicUrl;
  };

  const onSubmit = async (data: ProductForm) => {
    setSaving(true);
    let finalImageUrl = data.image_url || null;

    if (editProduct) {
      // Edit: upload new image if selected
      if (imageFile) {
        const uploaded = await uploadImage(editProduct.id);
        if (uploaded) finalImageUrl = uploaded;
      }
      const payload = {
        name: data.name,
        sku: data.sku || null,
        barcode: data.barcode || null,
        category_id: data.category_id && data.category_id !== 'none' ? data.category_id : null,
        price: data.price,
        cost: data.cost,
        stock: data.stock,
        image_url: finalImageUrl,
        is_active: data.is_active,
      };
      const { error } = await supabase.from('products').update(payload).eq('id', editProduct.id);
      setSaving(false);
      if (error) { toast.error(`บันทึกไม่สำเร็จ: ${error.message}`); return; }
      toast.success('แก้ไขสินค้าแล้ว');
    } else {
      // Create: insert first to get ID, then upload image
      const payload = {
        name: data.name,
        sku: data.sku || null,
        barcode: data.barcode || null,
        category_id: data.category_id && data.category_id !== 'none' ? data.category_id : null,
        price: data.price,
        cost: data.cost,
        stock: data.stock,
        image_url: finalImageUrl,
        is_active: data.is_active,
        store_id: profile?.store_id ?? null,
      };
      const { data: inserted, error } = await supabase.from('products').insert(payload).select('id').maybeSingle();
      if (error || !inserted) {
        setSaving(false);
        toast.error(`บันทึกไม่สำเร็จ: ${error?.message}`);
        return;
      }
      // Upload image after getting the product ID
      if (imageFile) {
        const uploaded = await uploadImage(inserted.id);
        if (uploaded) {
          await supabase.from('products').update({ image_url: uploaded }).eq('id', inserted.id);
        }
      }
      setSaving(false);
      toast.success('เพิ่มสินค้าแล้ว');
    }

    setShowForm(false);
    loadData();
  };

  const handleDelete = async () => {
    if (!deleteProduct) return;
    const { error } = await supabase.from('products').delete().eq('id', deleteProduct.id);
    if (error) {
      toast.error('ลบสินค้าไม่สำเร็จ: อาจมีรายการขายที่ใช้สินค้านี้อยู่');
    } else {
      toast.success('ลบสินค้าแล้ว');
      setDeleteProduct(null);
      loadData();
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground text-balance">จัดการสินค้า</h2>
          <p className="text-sm text-muted-foreground mt-0.5">สินค้าทั้งหมด {products.length} รายการ</p>
        </div>
        <Button className="md:ml-auto" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1.5" />
          เพิ่มสินค้า
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อสินค้า, รหัส..."
            className="pl-9"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="หมวดหมู่ทั้งหมด" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">หมวดหมู่ทั้งหมด</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl min-w-0">
        <div className="overflow-x-auto w-full max-w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">สินค้า</TableHead>
                <TableHead className="whitespace-nowrap">หมวดหมู่</TableHead>
                <TableHead className="whitespace-nowrap text-right">ราคาขาย</TableHead>
                <TableHead className="whitespace-nowrap text-right">ต้นทุน</TableHead>
                <TableHead className="whitespace-nowrap text-right">สต็อก</TableHead>
                <TableHead className="whitespace-nowrap text-center">สถานะ</TableHead>
                <TableHead className="whitespace-nowrap text-right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(7)].map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 bg-muted" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">ไม่พบสินค้า</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(product => (
                  <TableRow key={product.id} className="hover:bg-muted/30">
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-5 h-5 text-muted-foreground opacity-50" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-foreground truncate max-w-[160px]">{product.name}</p>
                          {product.sku && <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {(product as any).category?.name || '-'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm font-semibold text-primary">
                      {formatCurrency(product.price)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground">
                      {formatCurrency(product.cost)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Badge
                        variant="secondary"
                        className={`text-xs ${product.stock === 0 ? 'bg-destructive/10 text-destructive' : product.stock <= 10 ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}
                      >
                        {product.stock}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center">
                      <Badge
                        variant="secondary"
                        className={`text-xs ${product.is_active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}
                      >
                        {product.is_active ? 'ใช้งาน' : 'ปิดใช้'}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => openEdit(product)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteProduct(product)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Product Form Dialog */}
      <Dialog open={showForm} onOpenChange={v => { if (!v) setShowForm(false); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-normal">ชื่อสินค้า *</FormLabel>
                  <FormControl><Input {...field} placeholder="กรอกชื่อสินค้า" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="sku" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">รหัสสินค้า (SKU)</FormLabel>
                    <FormControl><Input {...field} placeholder="SKU-001" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="barcode" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">บาร์โค้ด</FormLabel>
                    <FormControl><Input {...field} placeholder="8850000000000" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="category_id" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-normal">หมวดหมู่</FormLabel>
                  <Select value={field.value || 'none'} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="เลือกหมวดหมู่" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">ไม่มีหมวดหมู่</SelectItem>
                      {categories.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-3 gap-3">
                <FormField control={form.control} name="price" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">ราคาขาย *</FormLabel>
                    <FormControl><Input {...field} type="number" min={0} step="0.01" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="cost" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">ต้นทุน</FormLabel>
                    <FormControl><Input {...field} type="number" min={0} step="0.01" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="stock" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">จำนวนสต็อก</FormLabel>
                    <FormControl><Input {...field} type="number" min={0} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              {/* Image upload: gallery + camera */}
              <div>
                <p className="text-sm font-normal text-foreground mb-2">รูปภาพสินค้า (ไม่บังคับ)</p>
                {/* Hidden file inputs */}
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }}
                />

                {imagePreview ? (
                  <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-muted border border-border">
                    <img src={imagePreview} alt="ตัวอย่างรูปสินค้า" className="w-full h-full object-contain" />
                    <button
                      type="button"
                      onClick={clearImage}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/80 border border-border flex items-center justify-center hover:bg-destructive/10 transition-colors"
                    >
                      <X className="w-3.5 h-3.5 text-foreground" />
                    </button>
                    <div className="absolute bottom-2 left-2 right-2 flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="flex-1 h-8 text-xs gap-1.5"
                        onClick={() => galleryInputRef.current?.click()}
                      >
                        <ImageIcon className="w-3.5 h-3.5" />เปลี่ยนรูป
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="flex-1 h-8 text-xs gap-1.5"
                        onClick={() => cameraInputRef.current?.click()}
                      >
                        <Camera className="w-3.5 h-3.5" />ถ่ายใหม่
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                    <Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                    <p className="text-sm text-muted-foreground mb-3">เลือกรูปภาพสินค้า</p>
                    <div className="flex justify-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => galleryInputRef.current?.click()}
                      >
                        <Upload className="w-4 h-4" />เลือกจากคลัง
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => cameraInputRef.current?.click()}
                      >
                        <Camera className="w-4 h-4" />ถ่ายรูป
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">รองรับ JPG, PNG, WEBP ขนาดสูงสุด 5MB</p>
                  </div>
                )}
                {uploadingImage && (
                  <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 animate-bounce" />กำลังอัปโหลดรูปภาพ...
                  </p>
                )}
              </div>
              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} disabled={saving || uploadingImage}>ยกเลิก</Button>
                <Button type="submit" disabled={saving || uploadingImage}>
                  {saving || uploadingImage ? 'กำลังบันทึก...' : 'บันทึก'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteProduct} onOpenChange={v => { if (!v) setDeleteProduct(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบสินค้า</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการลบ <strong>{deleteProduct?.name}</strong> ใช่ไหม? ไม่สามารถกู้คืนได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              ลบสินค้า
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
