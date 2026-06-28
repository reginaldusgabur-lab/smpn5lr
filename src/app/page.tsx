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
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg && reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          window.location.reload();
        }
      });
    }
  }, []);

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
      toast({ variant: "destructive", title: "Layanan belum siap", description: "Layanan otentikasi belum tersedia." });
      setIsLoginLoading(false);
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, values.email, values.password);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Login gagal", description: "Email atau kata sandi salah." });
      setIsLoginLoading(false);
    }
  };

  const handlePasswordReset = async (values: z.infer<typeof resetPasswordSchema>) => {
    setIsResetLoading(true);
    if (!auth) {
      toast({ variant: "destructive", title: "Layanan belum siap", description: "Layanan otentikasi belum tersedia." });
      setIsLoginLoading(false);
      return;
    }
    try {
      auth.languageCode = 'id';
      await sendPasswordResetEmail(auth, values.email);
      toast({
        title: "Link pemulihan terkirim",
        description: `Periksa kotak masuk & spam di ${values.email}.`
      });
      setIsResetDialogOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal",
        description: "Gagal mengirim email reset. Pastikan email terdaftar."
      });
    } finally {
      setIsResetLoading(false);
    }
  };
  
  if (isUserLoading || user) {
      return <div className="fixed inset-0 bg-background" />;
  }

  return (
    <div className="flex flex-col min-h-screen items-center justify-center p-4 bg-background text-foreground">
      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <Card className="w-full max-w-md bg-card border border-muted-foreground/10 shadow-none rounded-[2.5rem] overflow-hidden">
          <CardHeader className="text-center space-y-2 pt-12 pb-6">
            <div className="flex justify-center mb-6">
              <div className="relative w-20 h-20 transition-all duration-500 hover:scale-110">
                <Image
                  src={appLogo?.imageUrl || "/logo-3d-v2.png"}
                  alt="Logo E-SPENLI"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </div>
            <CardTitle className="text-4xl font-bold tracking-tighter text-primary">E-SPENLI</CardTitle>
            <CardDescription className="font-bold text-muted-foreground/80 tracking-tight">SMPN 5 Langke Rembong</CardDescription>
          </CardHeader>
          <CardContent className="px-10 pb-10">
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-6">
                <FormField
                  control={loginForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <Label className="text-[10px] font-bold tracking-widest text-muted-foreground ml-1">Alamat email</Label>
                      <FormControl>
                        <Input 
                          placeholder="nama@email.com" 
                          {...field} 
                          className="h-12 rounded-2xl bg-muted/30 border-muted-foreground/5 focus:bg-background focus:ring-primary/20 transition-all font-medium"
                        />
                      </FormControl>
                      <FormMessage className="text-[10px] font-bold" />
                    </FormItem>
                  )}
                />
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="password" className="text-[10px] font-bold tracking-widest text-muted-foreground ml-1">Kata sandi</Label>
                    <DialogTrigger asChild>
                      <button type="button" className="text-[10px] font-bold text-primary hover:opacity-70 transition-opacity tracking-widest">
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
                              className="h-12 rounded-2xl bg-muted/30 border-muted-foreground/5 focus:bg-background focus:ring-primary/20 transition-all font-medium"
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
                            <span className="sr-only">Tampilkan kata sandi</span>
                          </Button>
                        </div>
                        <FormMessage className="text-[10px] font-bold" />
                      </FormItem>
                    )}
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-14 text-sm font-bold rounded-2xl shadow-none transition-all active:scale-[0.97] bg-primary hover:bg-primary/90 mt-4 tracking-widest" 
                  disabled={isLoginLoading}
                >
                  {isLoginLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    "Masuk sekarang"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex-col items-center justify-center bg-muted/20 py-6 px-10 border-t border-muted-foreground/5">
            <p className="text-center text-[10px] font-bold text-muted-foreground tracking-widest">
              Aplikasi absensi digital resmi
            </p>
          </CardFooter>
        </Card>

        <DialogContent className="rounded-[2.5rem] border-none p-10 shadow-none">
          <DialogHeader>
            <DialogTitle className="font-bold text-2xl tracking-tighter text-primary">Atur ulang sandi</DialogTitle>
            <DialogDescription className="font-bold text-xs text-muted-foreground mt-2">
              Masukkan email terdaftar Anda untuk menerima tautan pemulihan.
            </DialogDescription>
          </DialogHeader>
          <Form {...resetForm}>
            <form onSubmit={resetForm.handleSubmit(handlePasswordReset)}>
              <div className="py-8">
                <FormField
                  control={resetForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <Label htmlFor="reset-email" className="text-[10px] font-bold tracking-widest text-muted-foreground ml-1">Email terdaftar</Label>
                      <FormControl>
                        <Input 
                          id="reset-email" 
                          placeholder="email@anda.com" 
                          {...field} 
                          className="h-12 rounded-2xl bg-muted/30 border-muted-foreground/5 focus:bg-background"
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
                  className="w-full h-12 rounded-2xl font-bold tracking-widest shadow-none"
                >
                  {isResetLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Kirim link pemulihan"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <footer className="mt-10 text-center text-[10px] font-bold text-muted-foreground/40 leading-relaxed tracking-[0.2em]">
        ©2026 SMPN 5 LANGKE REMBONG <br /> 
        <span className="text-primary/40">Powered by Team Operator</span>
      </footer>
    </div>
  );
}
