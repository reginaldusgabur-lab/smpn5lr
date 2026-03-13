'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { auth } from '@/firebase';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import Link from 'next/link';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const loginSchema = z.object({
  email: z.string().email({ message: "Format email tidak valid" }),
  password: z.string().min(1, { message: "Password wajib diisi" }),
});

const resetPasswordSchema = z.object({
  email: z.string().email({ message: "Masukkan alamat email yang valid." }),
});

export default function LoginPage() {
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  const { toast } = useToast();
  const router = useRouter();

  const appLogo = PlaceHolderImages.find(p => p.id === 'app-logo');

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const resetForm = useForm<z.infer<typeof resetPasswordSchema>>({
      resolver: zodResolver(resetPasswordSchema),
      defaultValues: { email: '' },
  });

  const handleLogin = async (values: z.infer<typeof loginSchema>) => {
    setIsLoginLoading(true);
    if (!auth) {
      toast({
        variant: "destructive",
        title: "Layanan Belum Siap",
        description: "Layanan otentikasi belum siap. Mohon coba beberapa saat lagi.",
      });
      setIsLoginLoading(false);
      return;
    }
    
    try {
        const userCredential = await signInWithEmailAndPassword(auth, values.email, values.password);

        if (values.email !== 'admin@sekolah.sch.id' && !userCredential.user.emailVerified) {
          toast({
              variant: "destructive",
              title: "Email Belum Diverifikasi",
              description: "Silakan periksa email Anda dan klik link verifikasi sebelum login.",
              duration: 7000
          });
          if(auth.currentUser) await auth.signOut();
          setIsLoginLoading(false);
          return;
        }

        router.push('/dashboard');
    } catch (error: any) {
        let errorMessage = "Email atau password yang Anda masukkan salah. Silakan periksa kembali.";
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email') {
            errorMessage = "Email atau password yang Anda masukkan salah. Silakan periksa kembali.";
        }
        
        toast({
            variant: "destructive",
            title: "Login Gagal",
            description: errorMessage,
        });
    } finally {
        setIsLoginLoading(false);
    }
  };

  const handlePasswordReset = async (values: z.infer<typeof resetPasswordSchema>) => {
    setIsResetLoading(true);
    if (!auth) {
      toast({
        variant: "destructive",
        title: "Layanan Belum Siap",
        description: "Layanan otentikasi belum siap.",
      });
      setIsResetLoading(false);
      return;
    }

    try {
        await sendPasswordResetEmail(auth, values.email);
        toast({
            title: "Link Reset Terkirim",
            description: `Silakan periksa kotak masuk email ${values.email} untuk instruksi selanjutnya.`,
        });
        setIsResetDialogOpen(false);
    } catch (error: any) {
        let description = 'Gagal mengirim email reset. Pastikan email yang Anda masukkan benar dan coba lagi.';
        if (error.code === 'auth/user-not-found') {
            description = 'Akun dengan email ini tidak ditemukan.';
        }
        toast({
            variant: "destructive",
            title: "Gagal",
            description: description,
        });
    } finally {
        setIsResetLoading(false);
    }
  };
  
  return (
    <div className="flex flex-col min-h-screen items-center justify-center p-4 bg-background text-foreground">
        <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
          <Card className="w-full max-w-md bg-card">
            <CardHeader className="text-center space-y-2">
              <div className="flex justify-center mb-2">
                  <Image
                      src={appLogo?.imageUrl || "/logofix.png"}
                      alt="Logo SMPN 5 Langke Rembong"
                      width={80}
                      height={80}
                      priority
                      data-ai-hint={appLogo?.imageHint}
                  />
              </div>
              <CardTitle className="text-3xl font-bold tracking-wider">E-SPENLI</CardTitle>
              <CardDescription>
                  Absensi Online SMPN 5 Langke Rembong
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                      <FormField
                          control={loginForm.control}
                          name="email"
                          render={({ field }) => (
                              <FormItem className="space-y-1">
                                <Label>Email</Label>
                                <FormControl>
                                    <Input id="email" placeholder="Masukkan alamat email Anda" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                          )}
                      />
                      <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="password">Password</Label>
                             <DialogTrigger asChild>
                                <button type="button" className="text-xs font-medium text-primary hover:underline">
                                    Lupa password?
                                </button>
                            </DialogTrigger>
                          </div>
                          <FormField
                              control={loginForm.control}
                              name="password"
                              render={({ field }) => (
                                  <FormItem>
                                      <div className="relative">
                                          <FormControl>
                                              <Input id="password" type={showLoginPass ? 'text' : 'password'} placeholder="Masukkan password" {...field} />
                                          </FormControl>
                                          <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="absolute inset-y-0 right-0 h-full px-3 text-muted-foreground"
                                              onClick={() => setShowLoginPass(!showLoginPass)}
                                          >
                                              {showLoginPass ? <EyeOff /> : <Eye />}
                                              <span className="sr-only">Tampilkan password</span>
                                          </Button>
                                      </div>
                                      <FormMessage />
                                  </FormItem>
                              )}
                          />
                      </div>

                      <Button type="submit" className="w-full" disabled={isLoginLoading}>
                          {isLoginLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          <span>Login</span>
                      </Button>
                  </form>
              </Form>
            </CardContent>
            <CardFooter className="flex-col items-center justify-center text-sm pt-4">
               <p className="text-center text-sm text-muted-foreground">
                  Belum punya akun? <Link href="/register" className="font-medium text-primary hover:underline">Daftar di sini</Link>.
              </p>
            </CardFooter>
          </Card>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Masukkan alamat email akun Anda. Kami akan mengirimkan link untuk mengatur ulang password Anda.
              </DialogDescription>
            </DialogHeader>
            <Form {...resetForm}>
              <form onSubmit={resetForm.handleSubmit(handlePasswordReset)}>
                <div className="py-4">
                  <FormField
                    control={resetForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <Label htmlFor="reset-email">Email</Label>
                        <FormControl>
                          <Input id="reset-email" placeholder="email@anda.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isResetLoading}>
                    <span className="flex items-center justify-center">
                      {isResetLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Kirim Link Reset
                    </span>
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        <footer className="mt-8 text-center text-xs text-muted-foreground">
    ©2026 SMPN5LR <br /> created by team operator
        </footer>
    </div>
  );
}
