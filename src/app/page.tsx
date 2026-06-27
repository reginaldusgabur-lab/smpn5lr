
'use client';

import { useState, useEffect } from 'react';
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
import { auth, useUser } from '@/firebase';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
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
  const { user, isUserLoading } = useUser();

  const appLogo = PlaceHolderImages.find(p => p.id === 'app-logo');

  useEffect(() => {
    if (!isUserLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, isUserLoading, router]);

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
      toast({ variant: "destructive", title: "Layanan Belum Siap", description: "Layanan otentikasi belum siap." });
      setIsLoginLoading(false);
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, values.email, values.password);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Login Gagal", description: "Email atau password salah." });
      setIsLoginLoading(false);
    }
  };

  const handlePasswordReset = async (values: z.infer<typeof resetPasswordSchema>) => {
    setIsResetLoading(true);
    if (!auth) {
      toast({ variant: "destructive", title: "Layanan Belum Siap", description: "Layanan otentikasi belum siap." });
      setIsResetLoading(false);
      return;
    }
    try {
      auth.languageCode = 'id';
      await sendPasswordResetEmail(auth, values.email);
      toast({
        title: "Link Reset Terkirim",
        description: `Periksa kotak masuk & spam di ${values.email} untuk instruksi.`
      });
      setIsResetDialogOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal",
        description: "Gagal mengirim email reset. Pastikan email terdaftar dan coba lagi."
      });
    } finally {
      setIsResetLoading(false);
    }
  };
  
  if (isUserLoading || user) {
      return <div className="h-screen w-full bg-background" />;
  }

  return (
    <div className="flex flex-col min-h-screen items-center justify-center p-4 bg-background text-foreground">
      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <Card className="w-full max-w-md bg-card border-none shadow-xl rounded-3xl overflow-hidden">
          <CardHeader className="text-center space-y-2 pt-10 pb-6">
            <div className="flex justify-center mb-4 transition-transform hover:scale-105 duration-300">
              <Image
                src={appLogo?.imageUrl || "/logo-3d-v2.png"}
                alt="Logo SMPN 5 Langke Rembong"
                width={100}
                height={100}
                priority
              />
            </div>
            <CardTitle className="text-3xl font-black tracking-tight text-primary">E-SPENLI</CardTitle>
            <CardDescription className="font-semibold text-muted-foreground">Absensi Online SMPN 5 Langke Rembong</CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-5">
                <FormField
                  control={loginForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <Label className="text-xs font-bold text-muted-foreground ml-1">Alamat Email</Label>
                      <FormControl>
                        <Input 
                          placeholder="nama@email.com" 
                          {...field} 
                          className="h-12 rounded-xl bg-muted/30 border-muted-foreground/10 focus:bg-background transition-all"
                        />
                      </FormControl>
                      <FormMessage className="text-[10px] font-bold" />
                    </FormItem>
                  )}
                />
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="password" className="text-xs font-bold text-muted-foreground ml-1">Kata Sandi</Label>
                    <DialogTrigger asChild>
                      <button type="button" className="text-[10px] font-bold text-primary hover:opacity-70 transition-opacity">
                        Lupa sandi?
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
                            <Input 
                              type={showLoginPass ? 'text' : 'password'} 
                              placeholder="Masukkan kata sandi" 
                              {...field} 
                              className="h-12 rounded-xl bg-muted/30 border-muted-foreground/10 focus:bg-background transition-all"
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute inset-y-0 right-0 h-full px-3 text-muted-foreground hover:bg-transparent"
                            onClick={() => setShowLoginPass(!showLoginPass)}
                          >
                            {showLoginPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            <span className="sr-only">Tampilkan password</span>
                          </Button>
                        </div>
                        <FormMessage className="text-[10px] font-bold" />
                      </FormItem>
                    )}
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 text-sm font-black rounded-xl shadow-lg transition-all active:scale-[0.97] bg-primary hover:bg-primary/90 mt-2" 
                  disabled={isLoginLoading}
                >
                  {isLoginLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    "Masuk ke Akun"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex-col items-center justify-center bg-muted/30 py-4 px-8">
            <p className="text-center text-[11px] font-bold text-muted-foreground">
              Kesulitan masuk? Silakan hubungi Tim Operator Sekolah.
            </p>
          </CardFooter>
        </Card>

        <DialogContent className="rounded-3xl border-none">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">Atur Ulang Sandi</DialogTitle>
            <DialogDescription className="font-medium text-xs">
              Masukkan alamat email Anda yang terdaftar. Kami akan mengirimkan tautan untuk mengatur ulang kata sandi.
            </DialogDescription>
          </DialogHeader>
          <Form {...resetForm}>
            <form onSubmit={resetForm.handleSubmit(handlePasswordReset)}>
              <div className="py-6">
                <FormField
                  control={resetForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <Label htmlFor="reset-email" className="text-xs font-bold text-muted-foreground ml-1">Email Terdaftar</Label>
                      <FormControl>
                        <Input 
                          id="reset-email" 
                          placeholder="email@anda.com" 
                          {...field} 
                          className="h-12 rounded-xl bg-muted/30 border-muted-foreground/10 focus:bg-background"
                        />
                      </FormControl>
                      <FormMessage className="text-[10px] font-bold" />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button 
                  type="submit" 
                  disabled={isResetLoading} 
                  className="w-full h-11 rounded-xl font-bold"
                >
                  {isResetLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Kirim Link Pemulihan"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <footer className="mt-8 text-center text-[10px] font-bold text-muted-foreground/60 leading-relaxed">
        ©2026 SMPN 5 LANGKE REMBONG <br /> 
        <span className="text-primary/50">DIBANGUN OLEH TIM OPERATOR</span>
      </footer>
    </div>
  );
}
