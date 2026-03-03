'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Eye, EyeOff, CheckCircle } from 'lucide-react';
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { createUserWithEmailAndPassword, sendEmailVerification, signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, firestore } from '@/firebase';
import { Label } from '@/components/ui/label';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const registerSchema = z
  .object({
    name: z.string().min(1, { message: 'Nama lengkap wajib diisi' }),
    email: z.string().email({ message: 'Alamat email tidak valid.' }),
    role: z.enum(['guru', 'pegawai'], {
      required_error: 'Peran wajib dipilih',
    }),
    nip: z.string().optional(),
    position: z.string().optional(),
    password: z.string().min(6, { message: 'Password minimal harus 6 karakter.' }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Konfirmasi password tidak cocok',
    path: ['confirmPassword'],
  });

export default function RegisterPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const { toast } = useToast();
  
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const appLogo = PlaceHolderImages.find(p => p.id === 'app-logo');

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: 'guru',
      name: '',
      email: '',
      nip: '',
      position: '',
      password: '',
      confirmPassword: '',
    },
  });

  const selectedRole = form.watch('role');

  const handleRegister = async (values: z.infer<typeof registerSchema>) => {
    setIsLoading(true);
    if (!auth || !firestore) {
        toast({ variant: 'destructive', title: 'Kesalahan', description: 'Layanan otentikasi atau database tidak tersedia.' });
        setIsLoading(false);
        return;
    };

    try {
      // 1. Create user in Firebase Auth. This also signs them in to the current session.
      const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
      const newUser = userCredential.user;
      
      // 2. Send verification email.
      try {
        await sendEmailVerification(newUser);
      } catch (verificationError) {
          console.error("Failed to send verification email during registration:", verificationError);
          // This is a non-fatal error. The user is created but will be blocked at login until verified.
          // The success screen will still instruct them to check their email.
      }
      
      // 3. Prepare the user document for Firestore.
      const userDoc: any = {
        id: newUser.uid,
        name: values.name,
        role: values.role,
        email: values.email,
        status: 'Aktif', // Users are active by default upon registration
        hasSeenRules: false, // Mark user as new
        nip: null,
        nisn: null,
        position: null,
        sequenceNumber: null,
      };

      if (values.role === 'guru') {
        userDoc.nip = values.nip?.trim() || null;
      }
      
      userDoc.position = values.position || null;

      // 4. Create the user document in Firestore. This call is now authenticated.
      await setDoc(doc(firestore, "users", newUser.uid), userDoc);
      
      // 5. IMPORTANT: Sign the user out immediately.
      // This forces them to go through the normal login flow after verifying their email,
      // which is more secure and ensures a clean session state.
      await signOut(auth);
      
      // 6. Show the success screen.
      setIsSuccess(true);

    } catch (error: any) {
      console.error("Registration failed:", error.code, error.message);
      let description = 'Terjadi kesalahan saat membuat akun.';
      if (error.code === 'auth/email-already-in-use') {
        description = 'Alamat email ini sudah terdaftar. Gunakan email lain atau login.';
      } else if (error.code === 'permission-denied') {
          description = 'Gagal menyimpan profil. Aturan keamanan menolak permintaan. Hubungi admin.';
      }
      toast({
        variant: 'destructive',
        title: 'Pendaftaran Gagal',
        description: description,
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  if (isSuccess) {
    return (
        <div className="flex flex-col min-h-screen items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md mx-auto rounded-2xl shadow-lg border">
                <CardHeader className="text-center space-y-4">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
                        <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
                    </div>
                    <CardTitle className="text-2xl font-bold">Pendaftaran Berhasil</CardTitle>
                    <CardDescription className="text-muted-foreground !mt-2">
                        Satu langkah terakhir! Kami telah mengirimkan email verifikasi ke alamat email Anda.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-center text-sm">
                        Silakan periksa kotak masuk (dan folder spam) Anda, lalu klik tautan di dalamnya untuk mengaktifkan akun Anda. Setelah itu, Anda dapat kembali untuk login.
                    </p>
                </CardContent>
                <CardFooter>
                    <Button asChild className="w-full">
                        <Link href="/">Kembali ke Halaman Login</Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
  }

  if (!isMounted) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center p-4 bg-background text-foreground">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md mx-auto rounded-2xl shadow-lg border">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <Image
              src={appLogo?.imageUrl || "/logofix.png"}
              alt="Logo SMPN 5 Langke Rembong"
              width={64}
              height={64}
              priority
              data-ai-hint={appLogo?.imageHint}
            />
          </div>
          <CardTitle className="text-3xl font-bold tracking-wider">E-SPENLI</CardTitle>
          <CardDescription className="text-muted-foreground !mt-2">
            Pendaftaran Akun Guru & Pegawai
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleRegister)} className="space-y-4">
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Saya adalah seorang...</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="grid grid-cols-2 gap-2"
                      >
                         <FormItem>
                          <FormControl>
                            <RadioGroupItem value="guru" id="role-guru" className="sr-only" />
                          </FormControl>
                          <Label htmlFor="role-guru" className={`flex h-full flex-col items-center justify-center rounded-md border-2 p-3 text-center text-xs hover:bg-accent hover:text-accent-foreground cursor-pointer sm:text-sm ${selectedRole === 'guru' ? 'border-primary bg-accent' : 'border-muted'}`}>Guru</Label>
                        </FormItem>
                         <FormItem>
                          <FormControl>
                            <RadioGroupItem value="pegawai" id="role-pegawai" className="sr-only" />
                          </FormControl>
                          <Label htmlFor="role-pegawai" className={`flex h-full flex-col items-center justify-center rounded-md border-2 p-3 text-center text-xs hover:bg-accent hover:text-accent-foreground cursor-pointer sm:text-sm ${selectedRole === 'pegawai' ? 'border-primary bg-accent' : 'border-muted'}`}>Pegawai</Label>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Nama Lengkap</FormLabel><FormControl><Input placeholder="Nama lengkap dengan gelar" {...field} /></FormControl><FormMessage /></FormItem>
              )}/>
              <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="email.aktif@anda.com" {...field} /></FormControl><FormMessage /></FormItem>
              )}/>

              {(selectedRole === 'guru') && (
                <FormField control={form.control} name="nip" render={({ field }) => (
                    <FormItem><FormLabel>NIP <span className="text-muted-foreground">(Opsional)</span></FormLabel><FormControl><Input placeholder="Masukkan NIP Anda" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
              )}

              <FormField control={form.control} name="position" render={({ field }) => (
                  <FormItem className="space-y-3">
                      <FormLabel>Status Kepegawaian <span className="text-muted-foreground">(Opsional)</span></FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          {selectedRole === 'guru' ? (
                            <>
                              <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="PNS" /></FormControl><FormLabel className="font-normal">PNS</FormLabel></FormItem>
                              <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="PPPK" /></FormControl><FormLabel className="font-normal">PPPK</FormLabel></FormItem>
                            </>
                          ) : (
                            <>
                              <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Honorer" /></FormControl><FormLabel className="font-normal">Honorer</FormLabel></FormItem>
                              <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="PPPK" /></FormControl><FormLabel className="font-normal">PPPK</FormLabel></FormItem>
                              <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="PW" /></FormControl><FormLabel className="font-normal">PW</FormLabel></FormItem>
                            </>
                          )}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                  </FormItem>
              )}/>

              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                    <FormLabel>Password</FormLabel>
                    <div className="relative">
                        <FormControl><Input type={showPass ? 'text' : 'password'} placeholder="Minimal 6 karakter" {...field} /></FormControl>
                        <Button type="button" variant="ghost" size="icon" className="absolute inset-y-0 right-0 h-full px-3 text-muted-foreground" onClick={() => setShowPass(!showPass)}>{showPass ? <EyeOff /> : <Eye />}</Button>
                    </div>
                    <FormMessage />
                </FormItem>
              )}/>
               <FormField control={form.control} name="confirmPassword" render={({ field }) => (
                <FormItem>
                    <FormLabel>Konfirmasi Password</FormLabel>
                    <div className="relative">
                        <FormControl><Input type={showConfirmPass ? 'text' : 'password'} placeholder="Ulangi password di atas" {...field} /></FormControl>
                         <Button type="button" variant="ghost" size="icon" className="absolute inset-y-0 right-0 h-full px-3 text-muted-foreground" onClick={() => setShowConfirmPass(!showConfirmPass)}>{showConfirmPass ? <EyeOff /> : <Eye />}</Button>
                    </div>
                    <FormMessage />
                </FormItem>
              )}/>
              
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <span>Daftar & Verifikasi Email</span>
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col items-center justify-center text-sm pt-4">
          <p className="text-center text-xs text-muted-foreground">
            Sudah punya akun? <Link href="/" className="font-medium text-primary hover:underline">Login di sini</Link>.
          </p>
        </CardFooter>
      </Card>
      <footer className="mt-8 text-center text-xs text-muted-foreground">
        ©smpn5lr 2026
      </footer>
    </div>
  );
}
