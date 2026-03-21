'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Sheet,  SheetContent,  SheetDescription,  SheetHeader,  SheetTitle,  SheetFooter,
} from '@/components/ui/sheet';
import {
  Form,  FormControl,  FormField,  FormItem,  FormLabel,  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestore } from '@/firebase';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

const formSchema = z.object({
  name: z.string().min(2, { message: 'Nama harus memiliki setidaknya 2 karakter.' }),
  email: z.string().email({ message: 'Email tidak valid.' }),
  role: z.enum(['admin', 'kepala_sekolah', 'guru', 'pegawai', 'siswa']),
  password: z.string().optional(),
}).refine(data => !!data.password || !!data.id, {
    message: "Kata sandi diperlukan untuk pengguna baru.",
    path: ["password"],
});

interface UserFormSheetProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  editingUser: any | null;
}

export default function UserFormSheet({ isOpen, setIsOpen, editingUser }: UserFormSheetProps) {
  const firestore = useFirestore();
  const auth = getAuth();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      role: 'guru',
      password: '',
    },
  });

  const { reset, formState: { isSubmitting } } = form;

  useEffect(() => {
    if (editingUser) {
      reset({
        name: editingUser.name,
        email: editingUser.email,
        role: editingUser.role,
        password: '',
      });
    } else {
      reset({ name: '', email: '', role: 'guru', password: '' });
    }
  }, [editingUser, reset]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!firestore) return;
    try {
      if (editingUser) {
        // Update user
        const userDoc = doc(firestore, 'users', editingUser.id);
        await updateDoc(userDoc, { 
            name: values.name,
            email: values.email,
            role: values.role,
        });
        // Note: We are not updating email/password in Firebase Auth here to keep it simple.
        // A more robust solution would involve a backend function to handle this.
      } else {
        // Create user in Auth
        const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password!);
        const uid = userCredential.user.uid;
        
        // Create user in Firestore
        await addDoc(collection(firestore, 'users'), {
            uid, 
            name: values.name,
            email: values.email,
            role: values.role,
        });
      }
      setIsOpen(false);
      alert(`Pengguna berhasil ${editingUser ? 'diperbarui' : 'dibuat'}!`);
    } catch (error: any) {
        console.error('Error saving user:', error);
        alert(`Gagal menyimpan: ${error.message}`);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{editingUser ? 'Edit Pengguna' : 'Tambah Pengguna Baru'}</SheetTitle>
          <SheetDescription>
            {editingUser ? 'Perbarui detail pengguna.' : 'Isi detail untuk pengguna baru.'}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                 <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Nama Lengkap</FormLabel>
                        <FormControl><Input placeholder="Contoh: John Doe" {...field} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl><Input type="email" placeholder="contoh@email.com" {...field} disabled={!!editingUser} /></FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                {!editingUser && (
                     <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Kata Sandi</FormLabel>
                            <FormControl><Input type="password" placeholder="Minimal 6 karakter" {...field} /></FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                )}
                 <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Peran (Role)</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Pilih peran" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="guru">Guru</SelectItem>
                                    <SelectItem value="pegawai">Pegawai</SelectItem>
                                    <SelectItem value="siswa">Siswa</SelectItem>
                                    <SelectItem value="kepala_sekolah">Kepala Sekolah</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                 />
                <SheetFooter className="pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Batal</Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Menyimpan...' : 'Simpan'}
                    </Button>
                </SheetFooter>
            </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
