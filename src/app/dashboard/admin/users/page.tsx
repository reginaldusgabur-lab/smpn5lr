
'use client';
import React, { useState, useMemo, useEffect } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  MoreHorizontal,
  PlusCircle,
  Loader2,
  Search,
  Filter,
  Edit2,
  Trash2,
  Power,
  AlertCircle,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useCollection, useMemoFirebase, setDocumentNonBlocking, updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, collection } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { firebaseConfig } from '@/firebase/config';
import { Skeleton } from '@/components/ui/skeleton';

const addUserSchema = z.object({
    name: z.string().min(1, { message: 'Nama wajib diisi' }),
    email: z.string().email({ message: 'Email tidak valid.' }),
    role: z.enum(['guru', 'pegawai', 'kepala_sekolah', 'admin']),
    nip: z.string().optional(),
    position: z.string().optional(),
    sequenceNumber: z.string().optional(),
    password: z.string().optional().refine((val) => !val || val.length >= 6, {
      message: 'Password minimal 6 karakter.'
    }),
});

export default function AdminUsersPage() {
    const { user, isUserLoading: isAuthLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [userFilter, setUserFilter] = useState('all');
    const [userSearch, setUserSearch] = useState('');
    const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingUser, setEditingUser] = useState<any | null>(null);
    const [userToDelete, setUserToDelete] = useState<any | null>(null);

    const usersRef = useMemoFirebase(() => firestore ? collection(firestore, 'users') : null, [firestore]);
    const { data: usersData, isLoading: isUsersLoading } = useCollection(user, usersRef);

    const filteredUsers = useMemo(() => {
        if (!usersData) return [];
        return usersData.filter(u => {
            const matchRole = userFilter === 'all' ? u.role !== 'admin' : u.role === userFilter;
            const matchSearch = u.name.toLowerCase().includes(userSearch.toLowerCase());
            return matchRole && matchSearch;
        }).sort((a, b) => (a.sequenceNumber ?? 999) - (b.sequenceNumber ?? 999));
    }, [usersData, userFilter, userSearch]);

    const userForm = useForm<z.infer<typeof addUserSchema>>({
        resolver: zodResolver(addUserSchema),
        defaultValues: { role: 'guru', name: '', email: '', nip: '', position: '', sequenceNumber: '', password: '' },
    });

    useEffect(() => {
        if (editingUser) {
            userForm.reset({
                name: editingUser.name || '',
                email: editingUser.email || '',
                role: editingUser.role || 'guru',
                nip: editingUser.nip || '',
                position: editingUser.position || '',
                sequenceNumber: editingUser.sequenceNumber?.toString() || '',
                password: '',
            });
        } else {
            userForm.reset({ role: 'guru', name: '', email: '', nip: '', position: '', sequenceNumber: '', password: '' });
        }
    }, [editingUser, userForm]);

    async function handleSaveUser(values: z.infer<typeof addUserSchema>) {
        if (!firestore) return;
        setIsSaving(true);

        try {
            if (editingUser) {
                const userRef = doc(firestore, "users", editingUser.id);
                const updatedData = {
                    name: values.name,
                    role: values.role,
                    nip: values.nip || null,
                    position: values.position || null,
                    sequenceNumber: values.sequenceNumber ? parseInt(values.sequenceNumber, 10) : null,
                };
                await updateDocumentNonBlocking(userRef, updatedData);
                toast({ title: 'Berhasil', description: 'Data pengguna telah diperbarui.' });
                setIsUserDialogOpen(false);
                setEditingUser(null);
            } else {
                if (!values.password) {
                    toast({ variant: 'destructive', title: 'Gagal', description: 'Password wajib diisi untuk pengguna baru.' });
                    setIsSaving(false);
                    return;
                }
                const tempApp = initializeApp(firebaseConfig, `temp-${Date.now()}`);
                try {
                    const cred = await createUserWithEmailAndPassword(getAuth(tempApp), values.email, values.password);
                    const userDoc = {
                        id: cred.user.uid, name: values.name, role: values.role, email: values.email, status: 'Aktif',
                        nip: values.nip || null, position: values.position || null,
                        sequenceNumber: values.sequenceNumber ? parseInt(values.sequenceNumber, 10) : null,
                    };
                    await setDocumentNonBlocking(doc(firestore, "users", cred.user.uid), userDoc, {});
                    toast({ title: 'Berhasil', description: 'Akun baru telah dibuat.' });
                    setIsUserDialogOpen(false);
                } finally {
                    await deleteApp(tempApp);
                }
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Kesalahan', description: e.message });
        } finally {
            setIsSaving(false);
        }
    }

    const handleToggleStatus = async (targetUser: any) => {
        if (!firestore) return;
        const newStatus = targetUser.status === 'Aktif' ? 'Non-Aktif' : 'Aktif';
        try {
            const userRef = doc(firestore, "users", targetUser.id);
            await updateDocumentNonBlocking(userRef, { status: newStatus });
            toast({ title: 'Status Diperbarui', description: `${targetUser.name} sekarang ${newStatus}.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Gagal', description: 'Gagal mengubah status.' });
        }
    };

    const handleDeleteUser = async () => {
        if (!firestore || !userToDelete) return;
        setIsSaving(true);
        try {
            const userRef = doc(firestore, "users", userToDelete.id);
            await deleteDocumentNonBlocking(userRef);
            toast({ title: 'Berhasil', description: 'Data pengguna telah dihapus dari database.' });
            setIsDeleteDialogOpen(false);
            setUserToDelete(null);
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Kesalahan', description: 'Gagal menghapus data.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex-1 pt-4 pb-24 md:p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-4 md:px-0">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">Manajemen Pengguna</h1>
                        <p className="text-muted-foreground mt-1">Kelola data personil sekolah dengan mudah.</p>
                    </div>
                    <Button size="lg" className="font-bold rounded-xl h-12 shadow-lg active:scale-95 transition-all" onClick={() => { setEditingUser(null); setIsUserDialogOpen(true); }}>
                        <PlusCircle className="mr-2 h-5 w-5" />
                        Tambah Personil
                    </Button>
                </div>

                <Card className="w-full border-none shadow-xl rounded-3xl overflow-hidden bg-card">
                    <CardContent className="py-6 min-h-[400px]">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
                            <Select value={userFilter} onValueChange={setUserFilter}>
                                <SelectTrigger className="w-full sm:w-[240px] h-11 rounded-xl bg-muted/30 border-muted-foreground/10">
                                    <div className="flex items-center gap-2">
                                        <Filter className="h-4 w-4 text-muted-foreground" />
                                        <SelectValue placeholder="Saring Peran" />
                                    </div>
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                    <SelectItem value="all">Semua Staf</SelectItem>
                                    <SelectItem value="guru">Guru</SelectItem>
                                    <SelectItem value="pegawai">Pegawai</SelectItem>
                                    <SelectItem value="kepala_sekolah">Kepala Sekolah</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="relative w-full sm:w-[320px]">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    placeholder="Cari nama personil..." 
                                    className="pl-10 h-11 rounded-xl bg-muted/30 border-muted-foreground/10" 
                                    value={userSearch} 
                                    onChange={e => setUserSearch(e.target.value)} 
                                />
                            </div>
                        </div>

                        <div className="border rounded-2xl overflow-hidden border-muted-foreground/5 shadow-inner">
                            <Table>
                                <TableHeader className="bg-muted/30">
                                    <TableRow className="border-none">
                                        <TableHead className="w-[80px] text-center font-bold">No</TableHead>
                                        <TableHead className="font-bold text-xs">Nama & Email</TableHead>
                                        <TableHead className="font-bold text-xs">Peran</TableHead>
                                        <TableHead className="font-bold text-xs">Identitas</TableHead>
                                        <TableHead className="text-center font-bold text-xs">Status</TableHead>
                                        <TableHead className="text-right font-bold text-xs pr-6">Aksi</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(isUsersLoading || isAuthLoading) ? (
                                        [...Array(6)].map((_, i) => (
                                            <TableRow key={i} className="border-muted-foreground/5">
                                                <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                                                <TableCell><Skeleton className="h-10 w-48 rounded-lg" /></TableCell>
                                                <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                                                <TableCell><Skeleton className="h-4 w-32 rounded-md" /></TableCell>
                                                <TableCell><Skeleton className="h-6 w-16 mx-auto rounded-full" /></TableCell>
                                                <TableCell><Skeleton className="h-8 w-8 ml-auto rounded-full mr-2" /></TableCell>
                                            </TableRow>
                                        ))
                                    ) : filteredUsers.length > 0 ? filteredUsers.map((u, i) => (
                                        <TableRow key={u.id} className="border-muted-foreground/5 hover:bg-muted/20 transition-colors">
                                            <TableCell className="text-center font-bold text-muted-foreground">{u.sequenceNumber ?? i + 1}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-black text-sm text-foreground">{u.name}</span>
                                                    <span className="text-[10px] font-bold text-muted-foreground">{u.email}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="text-[9px] font-black capitalize py-0.5">
                                                    {u.role.replace('_', ' ')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-foreground">{u.nip || '-'}</span>
                                                    <span className="text-[9px] font-bold text-primary">{u.position || '-'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant={u.status === 'Aktif' ? 'default' : 'destructive'} className="text-[9px] font-black px-3 py-0.5">
                                                    {u.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right pr-4">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-muted-foreground/10">
                                                            <MoreHorizontal className="h-5 w-5" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-52 rounded-2xl p-2 shadow-2xl">
                                                        <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground px-3 mb-1">Aksi Pengguna</DropdownMenuLabel>
                                                        <DropdownMenuItem className="rounded-xl cursor-pointer py-2.5 px-3 focus:bg-primary/5" onClick={() => { setEditingUser(u); setIsUserDialogOpen(true); }}>
                                                            <Edit2 className="mr-3 h-4 w-4 text-primary" />
                                                            <span className="text-xs font-bold">Ubah Data</span>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem className="rounded-xl cursor-pointer py-2.5 px-3 focus:bg-primary/5" onClick={() => handleToggleStatus(u)}>
                                                            <Power className={`mr-3 h-4 w-4 ${u.status === 'Aktif' ? 'text-orange-500' : 'text-green-500'}`} />
                                                            <span className="text-xs font-bold">{u.status === 'Aktif' ? 'Non-aktifkan' : 'Aktifkan'} Akun</span>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator className="my-1.5 opacity-50" />
                                                        <DropdownMenuItem className="rounded-xl cursor-pointer py-2.5 px-3 text-destructive focus:bg-destructive/5" onClick={() => { setUserToDelete(u); setIsDeleteDialogOpen(true); }}>
                                                            <Trash2 className="mr-3 h-4 w-4" />
                                                            <span className="text-xs font-bold">Hapus Akun</span>
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-48 text-center text-muted-foreground font-medium">
                                                Tidak ada data personil ditemukan.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Dialog Tambah/Edit User */}
            <Dialog open={isUserDialogOpen} onOpenChange={(open) => { setIsUserDialogOpen(open); if (!open) setEditingUser(null); }}>
                <DialogContent className="rounded-3xl border-none max-w-lg p-0 overflow-hidden flex flex-col max-h-[90vh]">
                    <DialogHeader className="p-6 pb-2 space-y-1">
                        <DialogTitle className="text-2xl font-black text-primary">
                            {editingUser ? 'Perbarui Data' : 'Tambah Personil'}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-medium">
                            {editingUser ? `Mengubah informasi data untuk ${editingUser.name}.` : 'Masukkan detail akun untuk personil baru sekolah.'}
                        </DialogDescription>
                    </DialogHeader>
                    
                    {/* --- KUNCI: Wrapper scrollable untuk isi form --- */}
                    <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar">
                        <Form {...userForm}>
                            <form onSubmit={userForm.handleSubmit(handleSaveUser)} className="space-y-4 py-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <FormField control={userForm.control} name="name" render={({field}) => (
                                        <FormItem className="space-y-1.5">
                                            <FormLabel className="text-xs font-bold ml-1">Nama Lengkap</FormLabel>
                                            <FormControl><Input placeholder="Contoh: John Doe, S.Pd" {...field} className="h-11 rounded-xl bg-muted/30 border-muted-foreground/10" /></FormControl>
                                            <FormMessage className="text-[10px] font-bold" />
                                        </FormItem>
                                    )} />
                                    <FormField control={userForm.control} name="email" render={({field}) => (
                                        <FormItem className="space-y-1.5">
                                            <FormLabel className="text-xs font-bold ml-1">Email</FormLabel>
                                            <FormControl><Input type="email" placeholder="nama@email.com" {...field} disabled={!!editingUser} className="h-11 rounded-xl bg-muted/30 border-muted-foreground/10" /></FormControl>
                                            <FormMessage className="text-[10px] font-bold" />
                                        </FormItem>
                                    )} />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <FormField control={userForm.control} name="role" render={({field}) => (
                                        <FormItem className="space-y-1.5">
                                            <FormLabel className="text-xs font-bold ml-1">Peran</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="h-11 rounded-xl bg-muted/30 border-muted-foreground/10">
                                                        <SelectValue placeholder="Pilih Peran" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent className="rounded-xl">
                                                    <SelectItem value="guru">Guru</SelectItem>
                                                    <SelectItem value="pegawai">Pegawai</SelectItem>
                                                    <SelectItem value="kepala_sekolah">Kepala Sekolah</SelectItem>
                                                    <SelectItem value="admin">Admin</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage className="text-[10px] font-bold" />
                                        </FormItem>
                                    )} />
                                    <FormField control={userForm.control} name="nip" render={({field}) => (
                                        <FormItem className="space-y-1.5">
                                            <FormLabel className="text-xs font-bold ml-1">NIP (Opsional)</FormLabel>
                                            <FormControl><Input placeholder="19XXXXXXXXXXXX" {...field} className="h-11 rounded-xl bg-muted/30 border-muted-foreground/10" /></FormControl>
                                            <FormMessage className="text-[10px] font-bold" />
                                        </FormItem>
                                    )} />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <FormField control={userForm.control} name="position" render={({field}) => (
                                        <FormItem className="space-y-1.5">
                                            <FormLabel className="text-xs font-bold ml-1">Status Kepegawaian</FormLabel>
                                            <FormControl><Input placeholder="Contoh: PNS / Honorer" {...field} className="h-11 rounded-xl bg-muted/30 border-muted-foreground/10" /></FormControl>
                                            <FormMessage className="text-[10px] font-bold" />
                                        </FormItem>
                                    )} />
                                    <FormField control={userForm.control} name="sequenceNumber" render={({field}) => (
                                        <FormItem className="space-y-1.5">
                                            <FormLabel className="text-xs font-bold ml-1">No. Urut (Urutan Laporan)</FormLabel>
                                            <FormControl><Input type="number" placeholder="1" {...field} className="h-11 rounded-xl bg-muted/30 border-muted-foreground/10" /></FormControl>
                                            <FormMessage className="text-[10px] font-bold" />
                                        </FormItem>
                                    )} />
                                </div>

                                {!editingUser && (
                                    <FormField control={userForm.control} name="password" render={({field}) => (
                                        <FormItem className="space-y-1.5">
                                            <FormLabel className="text-xs font-bold ml-1">Kata Sandi</FormLabel>
                                            <FormControl><Input type="password" placeholder="Minimal 6 karakter" {...field} className="h-11 rounded-xl bg-muted/30 border-muted-foreground/10" /></FormControl>
                                            <FormMessage className="text-[10px] font-bold" />
                                        </FormItem>
                                    )} />
                                )}

                                <div className="pt-4 sticky bottom-0 bg-card/80 backdrop-blur-sm">
                                    <Button type="submit" className="w-full h-12 rounded-xl font-bold bg-primary shadow-lg active:scale-95 transition-all" disabled={isSaving}>
                                        {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : (editingUser ? 'Perbarui Data' : 'Buat Akun Sekarang')}
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Alert Dialog Hapus User */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={(open) => { setIsDeleteDialogOpen(open); if (!open) setUserToDelete(null); }}>
                <AlertDialogContent className="rounded-3xl border-none">
                    <AlertDialogHeader>
                        <div className="flex items-center gap-3 text-destructive mb-2">
                            <AlertCircle className="h-6 w-6" />
                            <AlertDialogTitle className="text-xl font-black">Hapus Pengguna?</AlertDialogTitle>
                        </div>
                        <AlertDialogDescription className="text-sm font-medium">
                            Tindakan ini akan menghapus data <span className="font-bold text-foreground">{userToDelete?.name}</span> secara permanen dari database. Riwayat kehadiran yang terkait mungkin tidak dapat diakses lagi.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-4 gap-2">
                        <AlertDialogCancel className="h-11 rounded-xl font-bold border-muted-foreground/10 active:scale-95 transition-all" disabled={isSaving}>Batal</AlertDialogCancel>
                        <AlertDialogAction className="h-11 rounded-xl font-bold bg-destructive hover:bg-destructive/90 shadow-lg active:scale-95 transition-all" onClick={handleDeleteUser} disabled={isSaving}>
                            {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Ya, Hapus Permanen'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
