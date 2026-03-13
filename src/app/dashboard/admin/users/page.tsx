'use client';

import { useState, useMemo, useEffect } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  MoreHorizontal,
  PlusCircle,
  User,
  Briefcase,
  GraduationCap,
  Loader2,
  Crown,
  Search,
  ShieldCheck,
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
  DialogTrigger,
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc, setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { getAuth, createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, collection, deleteDoc, updateDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { initializeApp, deleteApp } from 'firebase/app';
import { firebaseConfig } from '@/firebase/config';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const UserTableSkeleton = ({ cols }: { cols: number }) => (
    <div className="rounded-md border">
        <Table>
            <TableHeader>
                <TableRow>
                    {[...Array(cols)].map((_, i) => (
                        <TableHead key={i}>
                            <Skeleton className="h-5 w-full" />
                        </TableHead>
                    ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {[...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                        {[...Array(cols)].map((_, j) => (
                            <TableCell key={j}>
                                <Skeleton className="h-5 w-full" />
                            </TableCell>
                        ))}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    </div>
);


const UserTable = ({ data, userType, canManage, onEdit, onToggleStatus, onDelete }: { 
  data: any[]; 
  userType: string; 
  canManage: boolean; 
  onEdit: (user: any) => void; 
  onToggleStatus: (user:any)=> void; 
  onDelete: (user:any) => void;
}) => {
  const hasIdentifierColumn = userType === 'Siswa' || userType === 'Guru' || userType === 'Kepala Sekolah' || userType === 'Pegawai';
  const hasPositionColumn = userType === 'Guru' || userType === 'Kepala Sekolah' || userType === 'Pegawai';
  
  // Calculate colspan dynamically
  let colSpan = 3; // No, Nama, Email
  if (hasIdentifierColumn) colSpan++;
  if (hasPositionColumn) colSpan++;
  colSpan++; // Status
  if (canManage) colSpan++;

  return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px] text-center whitespace-nowrap">
              {(userType === 'Guru' || userType === 'Kepala Sekolah') ? 'No. Urut' : 'No.'}
            </TableHead>
            <TableHead>Nama</TableHead>
            <TableHead>Email</TableHead>
            {hasIdentifierColumn && (
              <TableHead>
                {userType === 'Siswa' ? 'NISN' : 'NIP'}
              </TableHead>
            )}
            {hasPositionColumn && <TableHead className="whitespace-nowrap">Status Kepegawaian</TableHead>}
            <TableHead className="text-center">Status</TableHead>
            {canManage && (
              <TableHead className="text-right">
                  <span className="sr-only">Aksi</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length > 0 ? (
            data.map((user, index) => (
              <TableRow key={user.id}>
                <TableCell className="text-center font-medium">
                  {(userType === 'Guru' || userType === 'Kepala Sekolah') ? (user.sequenceNumber ?? '-') : (index + 1)}
                </TableCell>
                <TableCell className="font-medium whitespace-nowrap">{user.name}</TableCell>
                <TableCell className="font-medium">{user.email || '-'}</TableCell>
                {hasIdentifierColumn && (
                  <TableCell className="font-medium">
                    {user.nisn || user.nip || '-'}
                  </TableCell>
                )}
                {hasPositionColumn && <TableCell>{user.position || '-'}</TableCell>}
                <TableCell className="text-center">
                  <Badge variant={user.status === 'Aktif' ? 'default' : 'destructive'}>
                    {user.status}
                  </Badge>
                </TableCell>
                {canManage && (
                  <TableCell className="text-right">
                      <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                          <Button aria-haspopup="true" size="icon" variant="ghost">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Toggle menu</span>
                          </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Aksi</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => onEdit(user)}>Edit Pengguna</DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => onToggleStatus(user)}
                            disabled={user.email === 'admin@sekolah.sch.id'}
                          >
                            {user.status === 'Aktif' ? 'Non-aktifkan' : 'Aktifkan'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                              className="text-destructive focus:text-destructive focus:bg-destructive/10"
                              onClick={() => onDelete(user)}
                              disabled={user.email === 'admin@sekolah.sch.id'}
                          >
                              Hapus Pengguna
                          </DropdownMenuItem>
                      </DropdownMenuContent>
                      </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))
          ) : (
              <TableRow>
                  <TableCell colSpan={colSpan} className="h-24 text-center">
                      Tidak ada data pengguna.
                  </TableCell>
              </TableRow>
          )}
        </TableBody>
      </Table>
  );
};

type Role = 'guru' | 'pegawai' | 'siswa' | 'kepala_sekolah' | 'admin';

const addUserSchema = z
  .object({
    name: z.string().min(1, { message: 'Nama lengkap wajib diisi' }),
    email: z.string().email({ message: 'Alamat email tidak valid.' }),
    role: z.enum(['guru', 'pegawai', 'siswa', 'kepala_sekolah', 'admin'], {
      required_error: 'Peran wajib dipilih',
    }),
    identifier: z.string().optional(),
    position: z.string().optional(),
    sequenceNumber: z.string().optional(),
    password: z.string().min(6, { message: 'Password minimal harus 6 karakter.' }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Konfirmasi password tidak cocok',
    path: ['confirmPassword'],
  })
  .refine((data) => {
    if (data.role === 'guru' || data.role === 'kepala_sekolah') {
      return data.sequenceNumber && /^\d+$/.test(data.sequenceNumber);
    }
    return true;
  }, {
    message: 'Nomor urut wajib diisi dengan angka.',
    path: ['sequenceNumber'],
  });

const editUserSchema = z
  .object({
    name: z.string().min(1, { message: 'Nama lengkap wajib diisi' }),
    role: z.enum(['guru', 'pegawai', 'siswa', 'kepala_sekolah', 'admin'], {
      required_error: 'Peran wajib dipilih',
    }),
    identifier: z.string().optional(),
    position: z.string().optional(),
    sequenceNumber: z.string().optional(),
  })
  .refine((data) => {
    if (data.role === 'guru' || data.role === 'kepala_sekolah') {
      return data.sequenceNumber && /^\d+$/.test(data.sequenceNumber);
    }
    return true;
  }, {
    message: 'Nomor urut wajib diisi dengan angka.',
    path: ['sequenceNumber'],
  });


const roleConfig: { [key in Role]: { label: string; placeholder: string; icon: JSX.Element; title: string; } } = {
  kepala_sekolah: {
    label: 'NIP',
    placeholder: 'Masukkan NIP Kepala Sekolah',
    icon: <Crown className="h-5 w-5" />,
    title: 'Kepala Sekolah',
  },
  guru: {
    label: 'NIP',
    placeholder: 'Masukkan NIP Pengguna',
    icon: <User className="h-5 w-5" />,
    title: 'Guru',
  },
  pegawai: {
    label: 'NIP',
    placeholder: 'Masukkan NIP Pegawai (Opsional)',
    icon: <Briefcase className="h-5 w-5" />,
    title: 'Pegawai',
  },
  siswa: {
    label: 'NISN',
    placeholder: 'Masukkan NISN Pengguna',
    icon: <GraduationCap className="h-5 w-5" />,
    title: 'Siswa',
  },
  admin: {
      label: 'Email',
      placeholder: 'admin.baru@sekolah.sch.id',
      icon: <ShieldCheck className="h-5 w-5" />,
      title: 'Admin',
  }
};

function UsersView({ isAllowed, canManage }: { isAllowed: boolean, canManage: boolean }) {
  const [activeTab, setActiveTab] = useState('guru');
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [headmasterExists, setHeadmasterExists] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);


  const usersCollectionRef = useMemoFirebase(() => {
      if (!firestore || !isAllowed) return null;
      return collection(firestore, 'users');
  }, [firestore, isAllowed]);

  const { data: usersData, isLoading: isUsersLoading } = useCollection(user, usersCollectionRef);
  
  // Check for headmaster existence on data load
  useEffect(() => {
    if (usersData) {
      setHeadmasterExists(usersData.some(u => u.role === 'kepala_sekolah'));
    }
  }, [usersData]);


  const { guruData, pegawaiData, siswaData, kepalaSekolahData, adminData } = useMemo(() => {
    if (!usersData) return { guruData: [], pegawaiData: [], siswaData: [], kepalaSekolahData: [], adminData: [] };
    
    const allUsers = [...usersData];
    
    const sortWithSequence = (a: any, b: any) => {
        const seqA = a.sequenceNumber ?? Infinity;
        const seqB = b.sequenceNumber ?? Infinity;
        if (seqA !== seqB) {
            return seqA - seqB;
        }
        return a.name.localeCompare(b.name); // Fallback sort by name
    };
    
    const sortByName = (a: any, b: any) => a.name.localeCompare(b.name);

    return {
      kepalaSekolahData: allUsers.filter(u => u.role === 'kepala_sekolah').sort(sortWithSequence),
      guruData: allUsers.filter(u => u.role === 'guru').sort(sortWithSequence),
      pegawaiData: allUsers.filter(u => u.role === 'pegawai').sort(sortByName),
      siswaData: allUsers.filter(u => u.role === 'siswa').sort(sortByName),
      adminData: allUsers.filter(u => u.role === 'admin').sort(sortByName),
    };
  }, [usersData]);
  
  const filterData = (data: any[]) => {
    if (!searchQuery) return data;
    return data.filter((user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const filteredKepalaSekolahData = useMemo(() => filterData(kepalaSekolahData), [searchQuery, kepalaSekolahData]);
  const filteredGuruData = useMemo(() => filterData(guruData), [searchQuery, guruData]);
  const filteredPegawaiData = useMemo(() => filterData(pegawaiData), [searchQuery, pegawaiData]);
  const filteredSiswaData = useMemo(() => filterData(siswaData), [searchQuery, siswaData]);
  const filteredAdminData = useMemo(() => filterData(adminData), [searchQuery, adminData]);

  const addForm = useForm<z.infer<typeof addUserSchema>>({
    resolver: zodResolver(addUserSchema),
    defaultValues: {
      role: 'guru',
      name: '',
      email: '',
      identifier: '',
      position: '',
      sequenceNumber: '',
      password: '',
      confirmPassword: '',
    },
  });

  const editForm = useForm<z.infer<typeof editUserSchema>>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
        role: 'guru',
        name: '',
        identifier: '',
        position: '',
        sequenceNumber: '',
    }
  })

  const selectedRoleForAdd = addForm.watch('role');
  const selectedRoleForEdit = editForm.watch('role');
  
  async function handleCreateUser(values: z.infer<typeof addUserSchema>) {
    if (!firestore) {
        toast({ variant: 'destructive', title: 'Kesalahan', description: 'Layanan database tidak tersedia.' });
        return;
    };
    
    // Client-side validation for headmaster
    if (values.role === 'kepala_sekolah' && headmasterExists) {
        toast({ variant: 'destructive', title: 'Gagal', description: 'Posisi Kepala Sekolah sudah terisi.' });
        return;
    }

    setIsSaving(true);

    const tempAppName = `user-creation-${Date.now()}`;
    const tempApp = initializeApp(firebaseConfig, tempAppName);
    const tempAuth = getAuth(tempApp);

    try {
      const userCredential = await createUserWithEmailAndPassword(tempAuth, values.email, values.password);
      const newUser = userCredential.user;

      if (values.role !== 'siswa' && values.email !== 'admin@sekolah.sch.id') {
        try {
            await sendEmailVerification(newUser);
        } catch (verificationError) {
            console.error("Failed to send verification email:", verificationError);
            // Non-fatal error, we can still proceed with user creation.
        }
      }
      
      const userDoc: any = {
        id: newUser.uid,
        name: values.name,
        role: values.role,
        email: values.email,
        status: 'Aktif',
        nip: null,
        nisn: null,
        position: null,
        sequenceNumber: null,
      };
      
      if (values.role === 'guru' || values.role === 'kepala_sekolah') {
        userDoc.nip = values.identifier?.trim() || null;
        userDoc.position = values.position || null;
        userDoc.sequenceNumber = values.sequenceNumber ? parseInt(values.sequenceNumber, 10) : null;
      } else if (values.role === 'pegawai') {
        userDoc.nip = values.identifier?.trim() || null;
        userDoc.position = values.position || null;
      } else if (values.role === 'siswa') {
        userDoc.nisn = values.identifier?.trim() || null;
      }

      setDocumentNonBlocking(doc(firestore, "users", newUser.uid), userDoc, {});

      toast({
        title: 'Pengguna Ditambahkan',
        description: `Akun untuk ${values.name} telah berhasil dibuat.`,
      });
      addForm.reset();
      setIsAddUserDialogOpen(false);

    } catch (error: any) {
      console.error("User creation failed:", error.code, error.message);
      let description = 'Terjadi kesalahan saat membuat akun.';
      if (error.code === 'auth/email-already-in-use') {
        description = 'Alamat email ini sudah terdaftar. Gunakan email lain.';
      }
      
      toast({
        variant: 'destructive',
        title: 'Pendaftaran Gagal',
        description: description,
        duration: 9000,
      });
    } finally {
      setIsSaving(false);
      await deleteApp(tempApp);
    }
  }

  const openEditDialog = (user: any) => {
    setSelectedUser(user);
    editForm.reset({
      name: user.name,
      role: user.role,
      identifier: user.nip || user.nisn || '',
      position: user.position || '',
      sequenceNumber: user.sequenceNumber?.toString() || '',
    });
    setIsEditUserDialogOpen(true);
  };

  async function handleUpdateUser(values: z.infer<typeof editUserSchema>) {
    if (!selectedUser || !firestore) return;

    if (values.role === 'kepala_sekolah' && headmasterExists && selectedUser.role !== 'kepala_sekolah') {
      toast({ variant: 'destructive', title: 'Gagal', description: 'Posisi Kepala Sekolah sudah terisi.' });
      return;
    }

    setIsSaving(true);

    const userDocRef = doc(firestore, 'users', selectedUser.id);
    const dataToUpdate: any = {
      name: values.name,
      role: values.role,
    };

    // Reset all optional fields first to handle role changes correctly
    dataToUpdate.nip = null;
    dataToUpdate.nisn = null;
    dataToUpdate.position = null;
    dataToUpdate.sequenceNumber = null;

    // Then, set the correct fields based on the selected role
    if (values.role === 'guru' || values.role === 'kepala_sekolah') {
      dataToUpdate.nip = values.identifier?.trim() || null;
      dataToUpdate.position = values.position || null;
      dataToUpdate.sequenceNumber = values.sequenceNumber ? parseInt(values.sequenceNumber, 10) : null;
    } else if (values.role === 'pegawai') {
      dataToUpdate.nip = values.identifier?.trim() || null;
      dataToUpdate.position = values.position || null;
    } else if (values.role === 'siswa') {
      dataToUpdate.nisn = values.identifier?.trim() || null;
    }

    try {
      await updateDoc(userDocRef, dataToUpdate);
      toast({
        title: 'Perubahan Disimpan',
        description: `Data untuk ${values.name} telah berhasil diperbarui.`,
      });
      setIsEditUserDialogOpen(false);
    } catch (error) {
      console.error("User update failed:", error);
      toast({
        variant: 'destructive',
        title: 'Gagal Menyimpan',
        description: 'Terjadi kesalahan saat menyimpan data.',
      });
    } finally {
      setIsSaving(false);
      setSelectedUser(null);
    }
  }

  const handleToggleStatus = async (user: any) => {
    if (!firestore || !user) return;
    
    if (user.email === 'admin@sekolah.sch.id') {
      toast({
        variant: 'destructive',
        title: 'Aksi Ditolak',
        description: 'Akun admin utama tidak dapat dinon-aktifkan.',
      });
      return;
    }

    const newStatus = user.status === 'Aktif' ? 'Non-Aktif' : 'Aktif';
    const userDocRef = doc(firestore, 'users', user.id);

    try {
        await updateDoc(userDocRef, { status: newStatus });
        toast({
          title: `Status Diperbarui`,
          description: `Status ${user.name} sekarang ${newStatus}.`,
        });
    } catch (error) {
        console.error("Status toggle failed:", error);
        toast({
            variant: 'destructive',
            title: 'Gagal Memperbarui Status',
            description: 'Terjadi kesalahan saat memperbarui status pengguna.',
        });
    }
  };

  const openDeleteDialog = (user: any) => {
      setUserToDelete(user);
      setIsDeleteDialogOpen(true);
  };
  
  const handleDialogStateChange = (open: boolean) => {
    setIsDeleteDialogOpen(open);
    if (!open) {
      // When the dialog is closed (either by Cancel or successful deletion),
      // reset the deletion-related state to ensure it's clean for the next time.
      setIsDeleting(false);
      setUserToDelete(null);
    }
  };

  async function handleDeleteUser() {
    if (!userToDelete || !firestore) return;

    if (userToDelete.email === 'admin@sekolah.sch.id') {
      toast({
        variant: 'destructive',
        title: 'Aksi Ditolak',
        description: 'Akun admin utama tidak dapat dihapus.',
      });
      return;
    }
    
    setIsDeleting(true);
    const userDocRef = doc(firestore, 'users', userToDelete.id);

    try {
        await deleteDoc(userDocRef);
        toast({
          title: 'Pengguna Dihapus',
          description: `Data profil untuk ${userToDelete.name} telah berhasil dihapus.`,
        });
        // Programmatically close the dialog. This will trigger onOpenChange(false),
        // which then handles resetting the rest of the state.
        setIsDeleteDialogOpen(false); 
    } catch (error) {
        console.error("Failed to delete user profile:", error);
        toast({
            variant: 'destructive',
            title: 'Gagal Menghapus',
            description: 'Terjadi kesalahan saat menghapus data profil pengguna.',
        });
        // Important: On error, stop the loading indicator so the user can see the error
        // and potentially try again without re-opening the dialog.
        setIsDeleting(false);
    }
  }

  if (!isAllowed) return null;
  
  const skeletonCols = useMemo(() => {
    switch(activeTab) {
        case 'guru':
        case 'kepala_sekolah':
            return canManage ? 7 : 6;
        case 'pegawai':
            return canManage ? 7 : 6;
        case 'siswa':
            return canManage ? 6 : 5;
        case 'admin':
            return canManage ? 5 : 4;
        default:
            return 6;
    }
  }, [activeTab, canManage]);

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <CardTitle>Manajemen Pengguna</CardTitle>
              <CardDescription>
                Kelola data Guru, Pegawai, Siswa, dan Kepala Sekolah.
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Cari berdasarkan nama..."
                  className="w-full rounded-lg bg-background pl-8 sm:w-[200px] md:w-[250px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {canManage && (
                <Dialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="w-full sm:w-auto">
                      <PlusCircle className="mr-2 h-4 w-4" />
                      <span>Tambah Pengguna</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                      <DialogTitle>Tambah Pengguna Baru</DialogTitle>
                      <DialogDescription>
                        Isi detail di bawah untuk membuat akun baru.
                      </DialogDescription>
                    </DialogHeader>
                    <Form {...addForm}>
                      <form onSubmit={addForm.handleSubmit(handleCreateUser)}>
                        <div className="py-4 space-y-4 max-h-[70vh] overflow-y-auto pr-4">
                           <FormField
                              control={addForm.control}
                              name="role"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Peran Pengguna</FormLabel>
                                  <FormControl>
                                    <RadioGroup
                                      onValueChange={field.onChange}
                                      value={field.value}
                                      className="grid grid-cols-2 sm:grid-cols-3 gap-2"
                                    >
                                      {Object.keys(roleConfig).map((role) => {
                                        const isHeadmasterRole = role === 'kepala_sekolah';
                                        const isDisabled = isHeadmasterRole && headmasterExists;
                                        const radioItem = (
                                            <FormItem key={role}>
                                            <FormControl>
                                                <RadioGroupItem
                                                value={role}
                                                id={`add-${role}`}
                                                className="sr-only"
                                                disabled={isDisabled}
                                                />
                                            </FormControl>
                                            <Label
                                                htmlFor={`add-${role}`}
                                                className={cn(
                                                    'flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-3 text-center hover:bg-accent hover:text-accent-foreground cursor-pointer',
                                                    selectedRoleForAdd === role ? 'border-primary' : '',
                                                    isDisabled ? 'cursor-not-allowed opacity-50' : ''
                                                )}
                                            >
                                                {roleConfig[role as Role].icon}
                                                <span className="mt-1.5 text-xs">
                                                  {roleConfig[role as Role].title}
                                                </span>
                                            </Label>
                                            </FormItem>
                                        );

                                        if (isDisabled) {
                                            return (
                                            <TooltipProvider key={role} delayDuration={100}>
                                                <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <div className="w-full h-full">{radioItem}</div>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Posisi Kepala Sekolah sudah terisi.</p>
                                                </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                            );
                                        }
                                        return radioItem;
                                        })}
                                    </RadioGroup>
                                  </FormControl>
                                </FormItem>
                              )}
                            />

                          <FormField control={addForm.control} name="name" render={({ field }) => (<FormItem><FormLabel>Nama Lengkap</FormLabel><FormControl><Input placeholder="Nama lengkap dengan gelar..." {...field} /></FormControl><FormMessage /></FormItem>)}/>
                          <FormField control={addForm.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="email.aktif@contoh.com" {...field} /></FormControl><FormDescription className="text-xs">Pengguna akan menerima email verifikasi (kecuali siswa).</FormDescription><FormMessage /></FormItem>)}/>
                          
                          {(selectedRoleForAdd === 'guru' || selectedRoleForAdd === 'kepala_sekolah') && (
                              <FormField control={addForm.control} name="sequenceNumber" render={({ field }) => (
                                  <FormItem>
                                      <FormLabel>Nomor Urut SK</FormLabel>
                                      <FormControl><Input type="number" placeholder="Nomor untuk pengurutan daftar" {...field} /></FormControl>
                                      <FormDescription className="text-xs">Sesuai nomor urut pada SK pembagian tugas.</FormDescription>
                                      <FormMessage />
                                  </FormItem>
                              )}/>
                          )}
                          
                          {(selectedRoleForAdd === 'guru' || selectedRoleForAdd === 'kepala_sekolah' || selectedRoleForAdd === 'siswa' || selectedRoleForAdd === 'pegawai') && (
                              <FormField control={addForm.control} name="identifier" render={({ field }) => (
                                <FormItem>
                                  <FormLabel>{roleConfig[selectedRoleForAdd as Role]?.label} <span className="text-muted-foreground">(Opsional)</span></FormLabel>
                                  <FormControl><Input placeholder={roleConfig[selectedRoleForAdd as Role]?.placeholder} {...field} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}/>
                          )}

                          {(selectedRoleForAdd === 'guru' || selectedRoleForAdd === 'kepala_sekolah') && (
                              <FormField control={addForm.control} name="position" render={({ field }) => (<FormItem className="space-y-3"><FormLabel>Status Kepegawaian <span className="text-muted-foreground">(Opsional)</span></FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-4"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="PNS" /></FormControl><FormLabel className="font-normal">PNS</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="PPPK" /></FormControl><FormLabel className="font-normal">PPPK</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>)}/>
                          )}
                          {selectedRoleForAdd === 'pegawai' && (
                              <FormField control={addForm.control} name="position" render={({ field }) => (<FormItem className="space-y-3"><FormLabel>Status Kepegawaian <span className="text-muted-foreground">(Opsional)</span></FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-wrap items-center gap-x-4 gap-y-2"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Honorer" /></FormControl><FormLabel className="font-normal">Honorer</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="PPPK" /></FormControl><FormLabel className="font-normal">PPPK</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="PW" /></FormControl><FormLabel className="font-normal">PW</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>)}/>
                          )}

                          <FormField control={addForm.control} name="password" render={({ field }) => (<FormItem><FormLabel>Password</FormLabel><FormControl><Input type="password" placeholder="Minimal 6 karakter" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                          <FormField control={addForm.control} name="confirmPassword" render={({ field }) => (<FormItem><FormLabel>Konfirmasi Password</FormLabel><FormControl><Input type="password" placeholder="Ulangi password di atas" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                        </div>
                        <DialogFooter>
                          <Button type="submit" className="w-full" disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <span>Buat Akun Pengguna</span>
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Tabs defaultValue="guru" className="w-full" onValueChange={setActiveTab}>
              <div className="overflow-x-auto">
                  <TabsList>
                      <TabsTrigger value="guru">Guru</TabsTrigger>
                      <TabsTrigger value="pegawai">Pegawai</TabsTrigger>
                      <TabsTrigger value="siswa">Siswa</TabsTrigger>
                      <TabsTrigger value="kepala_sekolah">Kepala Sekolah</TabsTrigger>
                      <TabsTrigger value="admin">Admin</TabsTrigger>
                  </TabsList>
              </div>
              {isUsersLoading ? (
                  <UserTableSkeleton cols={skeletonCols} />
              ) : (
                  <div className="mt-4">
                      <TabsContent value="guru">
                          <UserTable data={filteredGuruData} userType="Guru" canManage={canManage} onEdit={openEditDialog} onToggleStatus={handleToggleStatus} onDelete={openDeleteDialog} />
                      </TabsContent>
                      <TabsContent value="pegawai">
                          <UserTable data={filteredPegawaiData} userType="Pegawai" canManage={canManage} onEdit={openEditDialog} onToggleStatus={handleToggleStatus} onDelete={openDeleteDialog} />
                      </TabsContent>
                      <TabsContent value="siswa">
                          <UserTable data={filteredSiswaData} userType="Siswa" canManage={canManage} onEdit={openEditDialog} onToggleStatus={handleToggleStatus} onDelete={openDeleteDialog} />
                      </TabsContent>
                      <TabsContent value="kepala_sekolah">
                          <UserTable data={filteredKepalaSekolahData} userType="Kepala Sekolah" canManage={canManage} onEdit={openEditDialog} onToggleStatus={handleToggleStatus} onDelete={openDeleteDialog} />
                      </TabsContent>
                      <TabsContent value="admin">
                          <UserTable data={filteredAdminData} userType="Admin" canManage={canManage} onEdit={openEditDialog} onToggleStatus={handleToggleStatus} onDelete={openDeleteDialog} />
                      </TabsContent>
                  </div>
              )}
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={isEditUserDialogOpen} onOpenChange={setIsEditUserDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Edit Pengguna</DialogTitle>
            <DialogDescription>
              Perbarui detail informasi pengguna. Email tidak dapat diubah.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleUpdateUser)}>
              <div className="py-4 space-y-4 max-h-[70vh] overflow-y-auto pr-4">
                <div className="space-y-2">
                    <Label htmlFor="edit-email">Email</Label>
                    <Input id="edit-email" value={selectedUser?.email || ''} readOnly disabled />
                </div>
                <FormField
                  control={editForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Peran Pengguna</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="grid grid-cols-2 sm:grid-cols-3 gap-2"
                          disabled={selectedUser?.email === 'admin@sekolah.sch.id'}
                        >
                          {Object.keys(roleConfig).map((role) => {
                            const isHeadmasterRole = role === 'kepala_sekolah';
                            const isDisabled = isHeadmasterRole && headmasterExists && selectedUser?.role !== 'kepala_sekolah';
                            const radioItem = (
                                <FormItem key={role}>
                                <FormControl>
                                    <RadioGroupItem
                                    value={role}
                                    id={`edit-${role}`}
                                    className="sr-only"
                                    disabled={isDisabled}
                                    />
                                </FormControl>
                                <Label
                                    htmlFor={`edit-${role}`}
                                    className={cn(
                                        'flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-3 text-center hover:bg-accent hover:text-accent-foreground cursor-pointer',
                                        selectedRoleForEdit === role ? 'border-primary' : '',
                                        isDisabled ? 'cursor-not-allowed opacity-50' : ''
                                    )}
                                >
                                    {roleConfig[role as Role].icon}
                                    <span className="mt-1.5 text-xs">
                                    {roleConfig[role as Role].title}
                                    </span>
                                </Label>
                                </FormItem>
                            );

                            if (isDisabled) {
                                return (
                                <TooltipProvider key={role} delayDuration={100}>
                                    <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="w-full h-full">{radioItem}</div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Posisi Kepala Sekolah sudah terisi.</p>
                                    </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                );
                            }
                            return radioItem;
                            })}
                        </RadioGroup>
                      </FormControl>
                      {selectedUser?.email === 'admin@sekolah.sch.id' && (
                          <FormDescription className="text-xs">
                              Peran admin utama tidak dapat diubah.
                          </FormDescription>
                      )}
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nama Lengkap (dengan gelar)</FormLabel>
                      <FormControl>
                        <Input placeholder="Contoh: Budi Santoso, S.Pd" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {(selectedRoleForEdit === 'guru' || selectedRoleForEdit === 'kepala_sekolah') && (
                    <FormField control={editForm.control} name="sequenceNumber" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nomor Urut SK</FormLabel>
                            <FormControl><Input type="number" placeholder="Nomor untuk pengurutan daftar" {...field} /></FormControl>
                            <FormDescription className="text-xs">Sesuai nomor urut pada SK pembagian tugas.</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}/>
                )}
                
                {(selectedRoleForEdit === 'guru' || selectedRoleForEdit === 'kepala_sekolah' || selectedRoleForEdit === 'siswa' || selectedRoleForEdit === 'pegawai') && (
                  <FormField
                    control={editForm.control}
                    name="identifier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {roleConfig[selectedRoleForEdit as Role]?.label || "Identifier"}
                           <span className="text-muted-foreground ml-1">(Opsional)</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={roleConfig[selectedRoleForEdit as Role]?.placeholder}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {(selectedRoleForEdit === 'guru' || selectedRoleForEdit === 'kepala_sekolah') && (
                    <FormField
                        control={editForm.control}
                        name="position"
                        render={({ field }) => (
                        <FormItem className="space-y-3">
                            <FormLabel>Status Kepegawaian <span className="text-muted-foreground">(Opsional)</span></FormLabel>
                            <FormControl>
                            <RadioGroup
                                onValueChange={field.onChange}
                                value={field.value}
                                className="flex items-center space-x-4"
                            >
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl>
                                    <RadioGroupItem value="PNS" />
                                </FormControl>
                                <FormLabel className="font-normal">PNS</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl>
                                    <RadioGroupItem value="PPPK" />
                                </FormControl>
                                <FormLabel className="font-normal">PPPK</FormLabel>
                                </FormItem>
                            </RadioGroup>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                )}

                {selectedRoleForEdit === 'pegawai' && (
                    <FormField
                        control={editForm.control}
                        name="position"
                        render={({ field }) => (
                        <FormItem className="space-y-3">
                            <FormLabel>Status Kepegawaian <span className="text-muted-foreground">(Opsional)</span></FormLabel>
                            <FormControl>
                            <RadioGroup
                                onValueChange={field.onChange}
                                value={field.value}
                                className="flex flex-wrap items-center gap-x-4 gap-y-2"
                            >
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl>
                                    <RadioGroupItem value="Honorer" />
                                </FormControl>
                                <FormLabel className="font-normal">Honorer</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl>
                                    <RadioGroupItem value="PPPK" />
                                </FormControl>
                                <FormLabel className="font-normal">PPPK</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl>
                                    <RadioGroupItem value="PW" />
                                </FormControl>
                                <FormLabel className="font-normal">PW (PPPK Paruh Waktu)</FormLabel>
                                </FormItem>
                            </RadioGroup>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                )}
              </div>
              
              <DialogFooter>
                <Button type="submit" className="w-full" disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  <span>Simpan Perubahan</span>
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      

    <AlertDialog open={isDeleteDialogOpen} onOpenChange={handleDialogStateChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
            <AlertDialogTitle>Anda yakin ingin menghapus pengguna ini?</AlertDialogTitle>
            <AlertDialogDescription>
                Tindakan ini akan menghapus data profil pengguna ({userToDelete?.name}) secara permanen dari database aplikasi.
                <br /><br />
                <span className="font-bold">PENTING:</span> Tindakan ini <span className="font-bold">TIDAK</span> menghapus akun login pengguna. Anda harus menghapusnya secara manual di Firebase Console (Authentication &gt; Users).
            </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
                onClick={handleDeleteUser}
                className={cn(buttonVariants({ variant: "destructive" }))}
                disabled={isDeleting}
            >
                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Ya, Hapus Profil
            </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
}

export default function AdminUsersPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  const userDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);
  const { data: userData, isLoading: isUserDataLoading } = useDoc(user, userDocRef);

  const isLoadingPage = isUserLoading || isUserDataLoading;
  const canManage = !isLoadingPage && (userData?.role === 'admin');
  const canView = !isLoadingPage && (canManage || userData?.role === 'kepala_sekolah');

  useEffect(() => {
    if (!isLoadingPage) {
        if (!user) {
            router.replace('/');
        } else if (!canView) {
            router.replace('/dashboard');
        }
    }
  }, [isLoadingPage, canView, router, user]);

  if (isLoadingPage || !canView) {
    return (
        <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
    );
  }
  
  return <UsersView isAllowed={canView} canManage={canManage} />;
}

    